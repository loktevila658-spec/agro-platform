import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { fingerprint } from '../../../../../packages/connectors/src/index.cjs';
import { executeCommandEffect } from '../../common/command-boundary';
import { uuidv7 } from '../master-data/master-data.validation';
import { MasterDataService } from '../master-data/master-data.service';
import { FarmService } from '../farm/farm.service';
import type { TaskDefinition } from '../tasks/tasks.types';
import { AgronomyRegistry } from './agronomy.registry';
import type { AgronomyActor, AgronomyContext, AgronomyCreate, AgronomyData, AgronomyKind, AgronomyRow, AgronomyState, PlannedOperation, RevisionRef } from './agronomy.types';
import { fail, id, kind, object, resourceQuantity, string, timestamp, transition, uniqueOperations, validateData, version } from './agronomy.validation';
export const AGRONOMY_POOL=Symbol('AGRONOMY_POOL');
export function projection(r:AgronomyRow):Record<string,unknown>{return {id:r.id,organizationId:r.organization_id,kind:r.kind,version:r.version,revisionId:r.revision_id,state:r.state,data:r.data,sourceReferences:r.source_refs,authorId:r.author_id,...(r.approver_id?{approverId:r.approver_id}:{}),effectiveAt:new Date(r.effective_at).toISOString()};}
@Injectable()
export class AgronomyService implements OnModuleDestroy {
 constructor(@Inject(AGRONOMY_POOL) private readonly pool:Pool,readonly registry:AgronomyRegistry,private readonly farm:FarmService,private readonly master:MasterDataService){}
 async onModuleDestroy():Promise<void>{await this.pool.end();}
 private permission(type:AgronomyKind,action:string):string{return type==='SEASON_PLAN'?(action==='Approve'||action==='Publish'?'agronomy.season_plan.publish':'agronomy.season_plan.edit'):(action==='Approve'||action==='Publish'?'agronomy.tech_map.approve':'agronomy.tech_map.edit');}
 private async row(tx:Pool|PoolClient,actor:AgronomyActor,entityId:string,lock=false):Promise<AgronomyRow>{
  id(entityId);const r=await tx.query<AgronomyRow>(`SELECT e.tenant_id,e.id,e.organization_id,e.kind,e.version,r.id AS revision_id,r.state,r.data,r.source_refs,r.author_id,r.approver_id,r.effective_at FROM agronomy.entity e JOIN agronomy.revision r ON r.tenant_id=e.tenant_id AND r.id=e.current_revision_id WHERE e.tenant_id=$1 AND e.id=$2${lock?' FOR UPDATE OF e':''}`,[actor.tenantId,entityId]);if(!r.rowCount)throw new NotFoundException('AGRONOMY_NOT_AVAILABLE');return r.rows[0]!;
 }
 private async pinned(tx:Pool|PoolClient,actor:AgronomyActor,reference:RevisionRef,org:string,type:AgronomyKind):Promise<AgronomyRow>{
  id(reference.entityId);id(reference.revisionId);const r=await tx.query<AgronomyRow>('SELECT e.tenant_id,e.id,e.organization_id,e.kind,r.version,r.id AS revision_id,r.state,r.data,r.source_refs,r.author_id,r.approver_id,r.effective_at FROM agronomy.entity e JOIN agronomy.revision r ON r.tenant_id=e.tenant_id AND r.entity_id=e.id WHERE e.tenant_id=$1 AND e.id=$2 AND r.id=$3',[actor.tenantId,reference.entityId,reference.revisionId]);
  const row=r.rows[0];if(!row||row.organization_id!==org||row.kind!==type||!['APPROVED','PUBLISHED'].includes(row.state))fail('PINNED_REVISION_UNAVAILABLE');return row;
 }
 private async resolve(tx:PoolClient,actor:AgronomyActor,type:AgronomyKind,org:string,data:AgronomyData,entityId:string):Promise<{data:AgronomyData;refs:Record<string,unknown>}>{
  const refs:Record<string,unknown>={};
  if(type==='SEASON_PLAN'){
   const season=await this.farm.planningReferenceInTransaction(tx,actor,data.seasonId!,'SEASON');if(season.organizationId!==org)fail('SCOPE');refs.season=season;
   const maps=[];for(const reference of data.techMaps!){const map=await this.pinned(tx,actor,reference,org,'TECH_MAP');if(map.state!=='PUBLISHED')fail('MAP_NOT_PUBLISHED');
    const fs=await this.farm.planningReferenceInTransaction(tx,actor,map.data.fieldSeasonId!,'FIELD_SEASON');if(fingerprint(map.source_refs.fieldSeason)!==fingerprint(fs))throw new ConflictException('AGRONOMY_MAP_CONTEXT_CHANGED');if(fs.organizationId!==org||fs.seasonId!==data.seasonId||(data.siteId&&fs.siteId!==data.siteId))fail('PLAN_CONTEXT');maps.push({reference,fieldSeason:fs});}
   if(data.siteId&&!maps.length)fail('SITE_CONTEXT_UNAVAILABLE');refs.maps=maps;return {data,refs};
  }
  const inherited=type==='TEMPLATE'?data.parent:data.template;
  if(inherited){if(inherited.entityId===entityId)fail('INHERITANCE_CYCLE');const parent=await this.pinned(tx,actor,inherited,org,'TEMPLATE');
   const ancestry=Array.isArray(parent.source_refs.ancestry)?parent.source_refs.ancestry as string[]:[];if(ancestry.includes(entityId)||ancestry.length>=100)fail('INHERITANCE_CYCLE');refs.ancestry=[...ancestry,parent.id];refs.template=inherited;
   const operations=new Map((parent.data.operations??[]).map(o=>[o.id,o]));for(const o of data.operations??[])operations.set(o.id,o);data={...(parent.data.cropId?{cropId:parent.data.cropId}:{}),...data,operations:[...operations.values()].sort((a,b)=>a.sequence-b.sequence)};uniqueOperations(data.operations!);
  }
  if(type==='TECH_MAP'){const fs=await this.farm.planningReferenceInTransaction(tx,actor,data.fieldSeasonId!,'FIELD_SEASON');if(fs.organizationId!==org)fail('SCOPE');refs.fieldSeason=fs;}
  if(data.cropId)refs.crop=await this.registry.reference(tx,actor,'CROP',data.cropId,org);
  const operations=[];
  for(const op of data.operations??[]){
   const source=await this.registry.reference(tx,actor,'OPERATION',op.operationTypeId,org),unit=await this.master.planningReferenceInTransaction(tx,actor,'UnitOfMeasure',op.unit,org);
   const resources=[];for(const resource of op.resources){const reference=resource.kind==='MATERIAL'?await this.master.planningReferenceInTransaction(tx,actor,'Material',resource.referenceId,org):await this.registry.reference(tx,actor,resource.kind,resource.referenceId,org);
    const u=await this.master.planningReferenceInTransaction(tx,actor,'UnitOfMeasure',resource.unit,org);
    if(resource.kind==='MATERIAL'&&'baseUom' in reference&&reference.baseUom!==resource.unit)fail('MATERIAL_UNIT_CONVERSION_UNAVAILABLE');
    if(resource.quantity===undefined)await this.registry.formula(actor,resource);
    const quantity=resourceQuantity(resource);this.precision(quantity,Number(u.precision));resources.push({reference,unit:u,quantity,formulaVersion:resource.formulaVersion??null});
   }
   this.precision(op.quantity,Number(unit.precision));operations.push({id:op.id,reference:source,unit,resources});
  }
  refs.operations=operations;return {data,refs};
 }
 private precision(value:string,precision:number):void{if((value.split('.')[1]?.replace(/0+$/,'').length??0)>precision)fail('UNIT_PRECISION');}
 async create(actor:AgronomyActor,input:unknown,ctx:AgronomyContext):Promise<Record<string,unknown>>{
  object(input,['kind','organizationId','data','effectiveAt','reason']);kind(input.kind);id(input.organizationId);const type=input.kind,org=input.organizationId;
  const data=validateData(type,input.data);return this.mutate(actor,type,'Create',undefined,org,{...input,data},ctx);
 }
 async command(actor:AgronomyActor,entityId:string,action:string,input:unknown,ctx:AgronomyContext):Promise<Record<string,unknown>>{
  if(!['Revise','Approve','Publish'].includes(action))fail('COMMAND');object(input,action==='Revise'?['expectedVersion','data','effectiveAt','reason']:['expectedVersion','effectiveAt','reason']);version(input.expectedVersion);
  const row=await this.row(this.pool,actor,entityId);return this.mutate(actor,row.kind,action,entityId,row.organization_id,input,ctx);
 }
 private async mutate(actorInput:AgronomyActor,type:AgronomyKind,action:string,entityId:string|undefined,org:string,input:Record<string,unknown>,ctxInput:AgronomyContext):Promise<Record<string,unknown>>{
  const actor=Object.freeze({...actorInput}),ctx=Object.freeze({...ctxInput});input=structuredClone(input);
  if(process.env.AGRO_DEPLOYMENT_MODE!=='LOCAL_PRIMARY')throw new ForbiddenException('LOCAL_PRIMARY_REQUIRED');
  if(!timestamp(input.effectiveAt))fail('EFFECTIVE_AT');string(input.reason);string(ctx.idempotencyKey,128);string(ctx.correlationId,128);string(ctx.causationId,128);
  const permission=this.permission(type,action);await this.registry.authorize(actor,permission,org);
  const hash=fingerprint({actor,type,action,entityId:entityId??null,org,input});const tx=await this.pool.connect();
  try{
   await tx.query('BEGIN');await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('agronomy/'||$1,0))",[actor.tenantId]);await this.registry.authorize(actor,permission,org);
   const old=(await tx.query('SELECT fingerprint,response FROM agronomy.command_idempotency WHERE tenant_id=$1 AND idempotency_key=$2',[actor.tenantId,ctx.idempotencyKey])).rows[0];
   if(old){if(old.fingerprint!==hash)throw new ConflictException('AGRONOMY_IDEMPOTENCY_CONFLICT');await tx.query('COMMIT');return old.response;}
   const before=entityId?await this.row(tx,actor,entityId,true):null;
   const result=await executeCommandEffect({transaction:tx,...(before?{expectedVersion:input.expectedVersion,assertVersion:async()=>before.version===input.expectedVersion}:{}),effect:async()=>{
    const eid=entityId??uuidv7();let state:AgronomyState='DRAFT',data:AgronomyData,refs:Record<string,unknown>;
    if(action==='Create'||action==='Revise'){const resolved=await this.resolve(tx,actor,type,org,validateData(type,input.data),eid);data=resolved.data;refs=resolved.refs;}
    else{state=transition(before!.state,action);data=before!.data;const current=await this.resolve(tx,actor,type,org,data,eid);refs=before!.source_refs;if(fingerprint(current.refs)!==fingerprint(refs)||fingerprint(current.data)!==fingerprint(data))throw new ConflictException('AGRONOMY_REFERENCE_VERSION_CHANGED');}
    if(action==='Publish'&&((type==='SEASON_PLAN'&&!data.techMaps?.length)||(type!=='SEASON_PLAN'&&!data.operations?.length)))fail('EMPTY_PUBLICATION');
    const rid=uuidv7(),v=before?(BigInt(before.version)+1n).toString():'1',author=action==='Create'||action==='Revise'?actor.subjectId:before!.author_id,approver=action==='Approve'?actor.subjectId:action==='Publish'?before!.approver_id:null;
    if(!before)await tx.query('INSERT INTO agronomy.entity(tenant_id,id,organization_id,kind,version,current_revision_id) VALUES($1,$2,$3,$4,$5,$6)',[actor.tenantId,eid,org,type,v,rid]);
    else await tx.query('UPDATE agronomy.entity SET version=$3,current_revision_id=$4 WHERE tenant_id=$1 AND id=$2',[actor.tenantId,eid,v,rid]);
    await tx.query('INSERT INTO agronomy.revision(tenant_id,entity_id,id,version,previous_revision_id,state,data,source_refs,author_id,approver_id,effective_at,reason,actor_id,correlation_id,causation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',[actor.tenantId,eid,rid,v,before?.revision_id??null,state,data,refs,author,approver,input.effectiveAt,input.reason,actor.subjectId,ctx.correlationId,ctx.causationId]);
    const row:AgronomyRow={tenant_id:actor.tenantId,id:eid,organization_id:org,kind:type,version:v,revision_id:rid,state,data,source_refs:refs,author_id:author,approver_id:approver,effective_at:input.effectiveAt as string};
    if(type==='TECH_MAP'&&action==='Publish')for(const op of data.operations!){
     await tx.query('INSERT INTO agronomy.planned_operation(tenant_id,map_id,revision_id,id,field_season_id,definition) VALUES($1,$2,$3,$4,$5,$6)',[actor.tenantId,eid,rid,op.id,data.fieldSeasonId,op]);
     for(let n=0;n<op.resources.length;n++){const r=op.resources[n]!;await tx.query('INSERT INTO agronomy.resource_demand(tenant_id,revision_id,operation_id,resource_index,kind,reference_id,quantity,unit,inputs) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[actor.tenantId,rid,op.id,n,r.kind,r.referenceId,resourceQuantity(r),r.unit,r]);}
    }
    const response=projection(row),diff={before:before?.data??null,after:data};
    await tx.query('INSERT INTO agronomy.audit(id,tenant_id,entity_id,revision_id,action,actor_id,before_value,after_value,diff,reason,idempotency_key,correlation_id,causation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[randomUUID(),actor.tenantId,eid,rid,action,actor.subjectId,before?projection(before):null,response,diff,input.reason,ctx.idempotencyKey,ctx.correlationId,ctx.causationId]);
    await this.event(tx,actor,eid,rid,v,'agronomy.plan.changed',ctx);
    if(type==='SEASON_PLAN'&&action==='Create')await this.event(tx,actor,eid,rid,v,'agronomy.season_plan.created',ctx);
    if(type==='SEASON_PLAN'&&action==='Publish')await this.event(tx,actor,eid,rid,v,'agronomy.season_plan.published',ctx);
    if(type==='TECH_MAP'&&action==='Publish'){
     await this.event(tx,actor,eid,rid,v,'agronomy.tech_map.published',ctx);
     if(data.operations!.some(o=>o.resources.some(r=>r.quantity===undefined)))await this.event(tx,actor,eid,rid,v,'agronomy.resource_demand.calculated',ctx);
    }
    await tx.query('INSERT INTO agronomy.command_idempotency(tenant_id,idempotency_key,actor_id,fingerprint,response) VALUES($1,$2,$3,$4,$5)',[actor.tenantId,ctx.idempotencyKey,actor.subjectId,hash,response]);return response;
   }});
   await tx.query('COMMIT');return result;
  }catch(e){await tx.query('ROLLBACK').catch(()=>undefined);throw e;}finally{tx.release();}
 }
 private async event(tx:PoolClient,actor:AgronomyActor,eid:string,rid:string,v:string,name:string,ctx:AgronomyContext):Promise<void>{const eventId=randomUUID(),occurredAt=new Date().toISOString(),payload={eventId,entityId:eid,revisionId:rid,revision:v,tenantId:actor.tenantId,actorId:actor.subjectId,correlationId:ctx.correlationId,causationId:ctx.causationId,occurredAt};await tx.query('INSERT INTO agronomy.outbox_event(id,tenant_id,event_name,event_version,producer,entity_id,actor_id,correlation_id,causation_id,occurred_at,payload) VALUES($1,$2,$3,\'1.0.0\',\'agronomy\',$4,$5,$6,$7,$8,$9)',[eventId,actor.tenantId,name,eid,actor.subjectId,ctx.correlationId,ctx.causationId,occurredAt,payload]);}
 async read(actor:AgronomyActor,entityId:string):Promise<Record<string,unknown>>{actor=Object.freeze({...actor});const row=await this.row(this.pool,actor,entityId);await this.registry.authorize(actor,'agronomy.season_plan.view',row.organization_id);return projection(row);}
 async history(actor:AgronomyActor,entityId:string):Promise<Record<string,unknown>[]>{await this.read(actor,entityId);return(await this.pool.query('SELECT id,version,previous_revision_id,state,data,source_refs,author_id,approver_id,effective_at,reason,actor_id,recorded_at FROM agronomy.revision WHERE tenant_id=$1 AND entity_id=$2 ORDER BY version',[actor.tenantId,entityId])).rows.map(r=>({revisionId:r.id,version:r.version,...(r.previous_revision_id?{previousRevisionId:r.previous_revision_id}:{}),state:r.state,data:r.data,sourceReferences:r.source_refs,authorId:r.author_id,...(r.approver_id?{approverId:r.approver_id}:{}),effectiveAt:new Date(r.effective_at).toISOString(),reason:r.reason,actorId:r.actor_id,recordedAt:new Date(r.recorded_at).toISOString()}));}
 async list(actor:AgronomyActor,organizationId:string,after?:string):Promise<Record<string,unknown>[]>{id(organizationId);if(after!==undefined)id(after);await this.registry.authorize(actor,'agronomy.season_plan.view',organizationId);const ids=(await this.pool.query('SELECT id FROM agronomy.entity WHERE tenant_id=$1 AND organization_id=$2 AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT 100',[actor.tenantId,organizationId,after??null])).rows;return Promise.all(ids.map(r=>this.read(actor,r.id)));}
 async resources(actor:AgronomyActor,entityId:string,revisionId:string):Promise<Record<string,unknown>[]>{const row=await this.read(actor,entityId);await this.registry.authorize(actor,'agronomy.resource_demand.view',row.organizationId as string);id(revisionId);return(await this.pool.query('SELECT d.* FROM agronomy.resource_demand d JOIN agronomy.planned_operation o ON o.tenant_id=d.tenant_id AND o.revision_id=d.revision_id AND o.id=d.operation_id WHERE d.tenant_id=$1 AND o.map_id=$2 AND d.revision_id=$3 ORDER BY d.operation_id,d.resource_index',[actor.tenantId,entityId,revisionId])).rows.map(r=>({operationId:r.operation_id,index:r.resource_index,kind:r.kind,referenceId:r.reference_id,quantity:r.quantity,unit:r.unit,inputs:r.inputs}));}
 async taskDraft(actor:AgronomyActor,entityId:string,input:unknown):Promise<{planRevisionId:string;mapRevisionId:string;operationId:string;definition:TaskDefinition}>{
  object(input,['expectedVersion','mapRevisionId','operationId']);version(input.expectedVersion);id(input.mapRevisionId);id(input.operationId);
  const row=await this.row(this.pool,actor,entityId);await this.registry.authorize(actor,'agronomy.season_plan.view',row.organization_id);
  if(row.kind!=='SEASON_PLAN'||row.state!=='PUBLISHED'||row.version!==input.expectedVersion)throw new ConflictException('AGRONOMY_PLAN_VERSION_REQUIRED');
  const reference=row.data.techMaps!.find(r=>r.revisionId===input.mapRevisionId);if(!reference)fail('MAP_NOT_IN_PLAN');const map=await this.pinned(this.pool,actor,reference,row.organization_id,'TECH_MAP'),op=map.data.operations!.find(o=>o.id===input.operationId);if(!op)fail('OPERATION_NOT_IN_PLAN');
  return {planRevisionId:row.revision_id,mapRevisionId:map.revision_id,operationId:op.id,definition:{operationTypeId:op.operationTypeId,targetType:'FIELD_SEASON',targetId:map.data.fieldSeasonId!,plannedQty:op.quantity,uom:op.unit,priority:50,...(op.window?{plannedStart:new Date(op.window.start).toISOString(),plannedEnd:new Date(op.window.end).toISOString()}:{})}};
 }
}
