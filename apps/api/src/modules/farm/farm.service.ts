import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { fingerprint } from '../../../../../packages/connectors/src/index.cjs';
import { executeCommandEffect } from '../../common/command-boundary';
import { GisService } from '../gis/gis.service';
import { LandService } from '../land/land.service';
import { context, id, keys, text, timestamp, uuidv7, version } from '../gis/gis.validation';
import { FarmRegistry } from './farm.registry';
import { effective, validateField, validateSeason, validateFieldSeason, validateLineage } from './farm.validation';
import type { FarmActor, FarmContext, Kind, EntityResult, FieldCreate, SeasonCreate, FieldSeasonCreate, FieldData, SeasonData, FieldSeasonData, Correction, LineageInput } from './farm.types';
export const FARM_POOL=Symbol('FARM_POOL');
type Data=FieldData|SeasonData|FieldSeasonData;
interface Head {id:string;kind:Kind;organization_id:string;row_version:string;current_revision_id:string;metadata:Record<string,unknown>;geometry_provenance:Record<string,unknown>|null;effective_at:Date;}
@Injectable()
export class FarmService implements OnModuleDestroy {
 constructor(@Inject(FARM_POOL) private readonly pool:Pool,private readonly registry:FarmRegistry,private readonly land:LandService,private readonly gis:GisService){}
 async onModuleDestroy():Promise<void>{await this.pool.end();}
 private async command<T>(actor:FarmActor,action:string,input:unknown,ctx:FarmContext,effect:(tx:PoolClient)=>Promise<T>):Promise<T>{
  await this.registry.authorize(actor,action);if(process.env.AGRO_DEPLOYMENT_MODE!=='LOCAL_PRIMARY')throw Error('FARM_LOCAL_PRIMARY_REQUIRED');context(ctx);
  const hash=fingerprint({actor:actor.subjectId,action,input}),tx=await this.pool.connect();
  try{
   await tx.query('BEGIN');
   // All Farm writers share this tenant lock; version guards below still reject stale intents.
   await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('farm-command/'||$1,0))",[actor.tenantId]);
   await this.registry.authorize(actor,action);
   const reserved=await tx.query('INSERT INTO farm.command_idempotency(tenant_id,idempotency_key,action,fingerprint,response) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING idempotency_key',[actor.tenantId,ctx.idempotencyKey,action,hash,{pending:true}]);
   let result:T;
   if(!reserved.rowCount){
    const old=(await tx.query('SELECT * FROM farm.command_idempotency WHERE tenant_id=$1 AND idempotency_key=$2 FOR UPDATE',[actor.tenantId,ctx.idempotencyKey])).rows[0];
    if(old?.fingerprint!==hash||old.action!==action)throw Error('FARM_IDEMPOTENCY_CONFLICT');result=old.response as T;
   }else{result=await effect(tx);await tx.query('UPDATE farm.command_idempotency SET response=$3 WHERE tenant_id=$1 AND idempotency_key=$2',[actor.tenantId,ctx.idempotencyKey,result]);}
   await tx.query('COMMIT');return result;
  }catch(e){await tx.query('ROLLBACK').catch(()=>undefined);throw e;}finally{tx.release();}
 }
 private validate(kind:Kind,data:Data):void{if(kind==='FIELD')validateField(data as FieldData);else if(kind==='SEASON')validateSeason(data as SeasonData);else validateFieldSeason(data as FieldSeasonData);}
 private async head(tx:PoolClient,actor:FarmActor,entityId:string,kind?:Kind):Promise<Head>{
  id(entityId);const r=await tx.query<Head>('SELECT e.*,r.metadata,r.geometry_provenance,r.effective_at FROM farm.entity e JOIN farm.revision r ON r.tenant_id=e.tenant_id AND r.id=e.current_revision_id WHERE e.tenant_id=$1 AND e.id=$2 FOR UPDATE OF e',[actor.tenantId,entityId]);
  if(!r.rows[0]||(kind&&r.rows[0].kind!==kind))throw Error('FARM_NOT_FOUND');return r.rows[0];
 }
 private async append(tx:PoolClient,actor:FarmActor,kind:Kind,organizationId:string,entityId:string,before:Head|null,data:Data|Record<string,unknown>,expected:string,effectiveAt:string,reason:string,action:string,ctx:FarmContext):Promise<EntityResult>{
  const current=before?.row_version??'0',result={entityId,revisionId:uuidv7(),version:String(BigInt(current)+1n)};
  // Approval and immutable source capture are owned queries, never foreign SQL.
  const field=data as FieldData;
  const geometry=kind==='FIELD'&&field.geometryVersionId?(before&&field.geometryVersionId===before.metadata.geometryVersionId?before.geometry_provenance:await this.gis.approvedVersionInTransaction(tx,actor,field.geometryVersionId,effectiveAt)):null;
  const retainAllocations=kind==='FIELD'&&before!==null&&fingerprint(field.allocations)===fingerprint(before.metadata.allocations);
  const allocations:{input:FieldData['allocations'][number];parcel:Record<string,unknown>;geometry:Record<string,unknown>|null}[]=[];
  if(kind==='FIELD'&&!retainAllocations)for(const a of field.allocations){
   const parcel=await this.land.referenceInTransaction(tx,actor,a.landPlotId);
   if(parcel.organization_id!==null&&parcel.organization_id!==organizationId)throw Error('FARM_PARCEL_ORGANIZATION');
   const allocationGeometry=a.geometryVersionId?await this.gis.approvedVersionInTransaction(tx,actor,a.geometryVersionId,a.validFrom):null;
   allocations.push({input:a,parcel,geometry:allocationGeometry});
  }
  await executeCommandEffect({transaction:tx,expectedVersion:expected,assertVersion:async()=>expected===current,effect:async()=>{
   if(!before)await tx.query('INSERT INTO farm.entity(tenant_id,id,kind,organization_id,row_version,current_revision_id) VALUES($1,$2,$3,$4,1,$5)',[actor.tenantId,entityId,kind,organizationId,result.revisionId]);
   else await tx.query('UPDATE farm.entity SET row_version=row_version+1,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2',[actor.tenantId,entityId,result.revisionId]);
   await tx.query('INSERT INTO farm.revision(tenant_id,entity_id,id,revision,previous_revision_id,effective_at,metadata,geometry_provenance,actor_id,reason,correlation_id,causation_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[actor.tenantId,entityId,result.revisionId,result.version,before?.current_revision_id??null,effectiveAt,data,geometry,actor.subjectId,reason,ctx.correlationId,ctx.causationId,ctx.idempotencyKey]);
   if(kind==='FIELD'&&field.siteId)await tx.query('INSERT INTO farm.field_site(tenant_id,revision_id,organization_id,site_id) VALUES($1,$2,$3,$4)',[actor.tenantId,result.revisionId,organizationId,field.siteId]);
   if(retainAllocations&&before)await tx.query('INSERT INTO farm.allocation(tenant_id,field_id,revision_id,land_plot_id,valid_from,valid_to,source,reason,area_ha,geometry_version_id,geometry_provenance,land_provenance) SELECT tenant_id,field_id,$3,land_plot_id,valid_from,valid_to,source,reason,area_ha,geometry_version_id,geometry_provenance,land_provenance FROM farm.allocation WHERE tenant_id=$1 AND revision_id=$2',[actor.tenantId,before.current_revision_id,result.revisionId]);
   else await this.allocations(tx,actor,entityId,result.revisionId,allocations);
   await tx.query('INSERT INTO farm.audit(id,tenant_id,entity_id,action,actor_id,before_value,after_value,reason,correlation_id,causation_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[randomUUID(),actor.tenantId,entityId,action,actor.subjectId,before?{revisionId:before.current_revision_id,metadata:before.metadata}:null,{...result,metadata:data},reason,ctx.correlationId,ctx.causationId,ctx.idempotencyKey]);
   const eventId=randomUUID(),occurredAt=new Date().toISOString();
   const payload={eventId,entityId,entityType:kind==='FIELD'?'Field':kind==='SEASON'?'AgriculturalSeason':'FieldSeason',tenantId:actor.tenantId,actorId:actor.subjectId,correlationId:ctx.correlationId,causationId:ctx.causationId,occurredAt,revision:result.version};
   await tx.query("INSERT INTO farm.outbox_event(id,tenant_id,event_name,event_version,producer,entity_id,actor_id,correlation_id,causation_id,occurred_at,payload) VALUES($1,$2,'farm.entity.changed','1.0.0','farm',$3,$4,$5,$6,$7,$8)",[eventId,actor.tenantId,entityId,actor.subjectId,ctx.correlationId,ctx.causationId,occurredAt,payload]);
  }});
  return result;
 }
 private async allocations(tx:PoolClient,actor:FarmActor,entityId:string,revisionId:string,entries:{input:FieldData['allocations'][number];parcel:Record<string,unknown>;geometry:Record<string,unknown>|null}[]):Promise<void>{
  for(const {input:a,parcel,geometry} of entries)await tx.query('INSERT INTO farm.allocation(tenant_id,field_id,revision_id,land_plot_id,valid_from,valid_to,source,reason,area_ha,geometry_version_id,geometry_provenance,land_provenance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[actor.tenantId,entityId,revisionId,a.landPlotId,a.validFrom,a.validTo??null,a.source,a.reason,a.areaHa??null,a.geometryVersionId??null,geometry,parcel]);
 }
 private async newField(tx:PoolClient,actor:FarmActor,input:FieldCreate,ctx:FarmContext,action:string):Promise<EntityResult>{
  keys(input,['organizationId','code','data','effectiveAt','reason']);id(input.organizationId);if(!text(input.code,64))throw Error('FARM_INVALID_CODE');validateField(input.data);effective(input.effectiveAt,input.reason);
  const result=await this.append(tx,actor,'FIELD',input.organizationId,uuidv7(),null,input.data,'0',input.effectiveAt,input.reason,action,ctx);
  await tx.query('INSERT INTO farm.field(tenant_id,id,organization_id,code) VALUES($1,$2,$3,$4)',[actor.tenantId,result.entityId,input.organizationId,input.code]);
  return result;
 }
 async createField(actor:FarmActor,input:FieldCreate,ctx:FarmContext):Promise<EntityResult>{
  actor=Object.freeze({...actor});input=structuredClone(input);ctx=structuredClone(ctx);return this.command(actor,'field.create',input,ctx,tx=>this.newField(tx,actor,input,ctx,'field.create'));
 }
 async createSeason(actor:FarmActor,input:SeasonCreate,ctx:FarmContext):Promise<EntityResult>{
  actor=Object.freeze({...actor});input=structuredClone(input);ctx=structuredClone(ctx);
  return this.command(actor,'season.create',input,ctx,async tx=>{
   keys(input,['organizationId','data','effectiveAt','reason']);id(input.organizationId);validateSeason(input.data);effective(input.effectiveAt,input.reason);
   const result=await this.append(tx,actor,'SEASON',input.organizationId,uuidv7(),null,input.data,'0',input.effectiveAt,input.reason,'season.create',ctx);
   await tx.query('INSERT INTO farm.agricultural_season(tenant_id,id,organization_id,business_year) VALUES($1,$2,$3,$4)',[actor.tenantId,result.entityId,input.organizationId,input.data.year]);return result;
  });
 }
 async createFieldSeason(actor:FarmActor,input:FieldSeasonCreate,ctx:FarmContext):Promise<EntityResult>{
  actor=Object.freeze({...actor});input=structuredClone(input);ctx=structuredClone(ctx);
  return this.command(actor,'field-season.create',input,ctx,async tx=>{
   keys(input,['fieldId','seasonId','data','effectiveAt','reason']);validateFieldSeason(input.data);effective(input.effectiveAt,input.reason);
   const field=await this.head(tx,actor,input.fieldId,'FIELD'),season=await this.head(tx,actor,input.seasonId,'SEASON');
   if(field.metadata.status==='ARCHIVED')throw Error('FARM_FIELD_ARCHIVED');if(field.organization_id!==season.organization_id)throw Error('FARM_SEASON_ORGANIZATION');
   const result=await this.append(tx,actor,'FIELD_SEASON',field.organization_id,uuidv7(),null,input.data,'0',input.effectiveAt,input.reason,'field-season.create',ctx);
   await tx.query('INSERT INTO farm.field_season(tenant_id,id,organization_id,field_id,season_id,field_revision_id,season_revision_id,business_year) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[actor.tenantId,result.entityId,field.organization_id,input.fieldId,input.seasonId,field.current_revision_id,season.current_revision_id,season.metadata.year]);return result;
  });
 }
 async correctField(actor:FarmActor,entityId:string,input:Correction<FieldData>,ctx:FarmContext):Promise<EntityResult>{return this.correct(actor,entityId,'FIELD','field.correct',input,ctx);}
 async correctSeason(actor:FarmActor,entityId:string,input:Correction<SeasonData>,ctx:FarmContext):Promise<EntityResult>{return this.correct(actor,entityId,'SEASON','season.correct',input,ctx);}
 async correctFieldSeason(actor:FarmActor,entityId:string,input:Correction<FieldSeasonData>,ctx:FarmContext):Promise<EntityResult>{return this.correct(actor,entityId,'FIELD_SEASON','field-season.correct',input,ctx);}
 private async correct(actor:FarmActor,entityId:string,kind:Kind,action:string,input:Correction<Data>,ctx:FarmContext):Promise<EntityResult>{
  actor=Object.freeze({...actor});input=structuredClone(input);ctx=structuredClone(ctx);id(entityId);
  return this.command(actor,action,{entityId,input},ctx,async tx=>{
   keys(input,['expectedVersion','data','effectiveAt','reason']);version(input.expectedVersion);this.validate(kind,input.data);effective(input.effectiveAt,input.reason);
   const before=await this.head(tx,actor,entityId,kind);
   if(kind==='FIELD'&&before.metadata.status==='ARCHIVED')throw Error('FARM_FIELD_ARCHIVED');
   if(kind==='SEASON'&&(input.data as SeasonData).year!==before.metadata.year)throw Error('FARM_SEASON_YEAR_IDENTITY');
   return this.append(tx,actor,kind,before.organization_id,entityId,before,input.data,input.expectedVersion,input.effectiveAt,input.reason,action,ctx);
  });
 }
 async split(actor:FarmActor,input:LineageInput,ctx:FarmContext):Promise<{sources:EntityResult[];targets:EntityResult[]}>{return this.restructure(actor,'SPLIT',input,ctx);}
 async merge(actor:FarmActor,input:LineageInput,ctx:FarmContext):Promise<{sources:EntityResult[];targets:EntityResult[]}>{return this.restructure(actor,'MERGE',input,ctx);}
 private async restructure(actor:FarmActor,op:'SPLIT'|'MERGE',input:LineageInput,ctx:FarmContext):Promise<{sources:EntityResult[];targets:EntityResult[]}>{
  actor=Object.freeze({...actor});input=structuredClone(input);ctx=structuredClone(ctx);const action=op==='SPLIT'?'field.split':'field.merge';
  return this.command(actor,action,input,ctx,async tx=>{
   keys(input,['sources','targets','effectiveAt','reason']);validateLineage(op,input.sources,input.targets);effective(input.effectiveAt,input.reason);
   const heads=[];for(const s of [...input.sources].sort((a,b)=>a.fieldId.localeCompare(b.fieldId))){const h=await this.head(tx,actor,s.fieldId,'FIELD');if(h.metadata.status==='ARCHIVED')throw Error('FARM_FIELD_ARCHIVED');if(Date.parse(input.effectiveAt)<h.effective_at.getTime())throw Error('FARM_LINEAGE_BEFORE_SOURCE');heads.push({head:h,expected:s.expectedVersion});}
   const org=heads[0]!.head.organization_id;if(heads.some(x=>x.head.organization_id!==org)||input.targets.some(t=>t.organizationId!==org))throw Error('FARM_LINEAGE_ORGANIZATION');
   const targets=[];for(const t of input.targets){if(Date.parse(t.effectiveAt)!==Date.parse(input.effectiveAt))throw Error('FARM_TARGET_EFFECTIVE_MISMATCH');targets.push(await this.newField(tx,actor,t,ctx,action));}
   const sources=[];for(const {head:h,expected} of heads)sources.push(await this.append(tx,actor,'FIELD',org,h.id,h,{...h.metadata,status:'ARCHIVED'},expected,input.effectiveAt,input.reason,action,ctx));
   for(const s of sources)for(const target of targets)await tx.query('INSERT INTO farm.lineage(tenant_id,from_field_id,to_field_id,operation,effective_at,actor_id,reason,correlation_id,causation_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[actor.tenantId,s.entityId,target.entityId,op,input.effectiveAt,actor.subjectId,input.reason,ctx.correlationId,ctx.causationId,ctx.idempotencyKey]);
   return {sources,targets};
  });
 }
 async taskReferenceInTransaction(tx:PoolClient,actor:FarmActor,entityId:string,kind:string):Promise<Record<string,unknown>>{
  actor=Object.freeze({...actor});await this.registry.authorize(actor,'field.read');id(entityId);
  if(!['FIELD','FIELD_SEASON'].includes(kind))throw Error('FARM_INVALID_TASK_TARGET');
  const r=await tx.query("SELECT e.id,e.organization_id,e.current_revision_id,r.metadata,r.geometry_provenance FROM farm.entity e JOIN farm.revision r ON r.tenant_id=e.tenant_id AND r.id=e.current_revision_id WHERE e.tenant_id=$1 AND e.id=$2 AND e.kind=$3 FOR SHARE OF e",[actor.tenantId,entityId,kind]);
  if(!r.rowCount||r.rows[0].metadata.status==='ARCHIVED')throw Error('FARM_TASK_TARGET_UNAVAILABLE');return r.rows[0];
 }
 async read(actor:FarmActor,entityId:string,asOf?:string):Promise<Record<string,unknown>>{
  actor=Object.freeze({...actor});await this.registry.authorize(actor,'field.read');id(entityId);if(asOf!==undefined&&!timestamp(asOf))throw Error('FARM_INVALID_AS_OF');
  const r=await this.pool.query(`SELECT e.*,f.code,fs.field_id,fs.season_id,fs.field_revision_id,fs.season_revision_id,fr.geometry_provenance AS field_geometry_provenance,COALESCE(fs.business_year,s.business_year) AS business_year,r.id AS revision_id,r.revision,r.metadata,r.geometry_provenance,r.effective_at FROM farm.entity e LEFT JOIN farm.field f ON f.tenant_id=e.tenant_id AND f.id=e.id LEFT JOIN farm.field_season fs ON fs.tenant_id=e.tenant_id AND fs.id=e.id LEFT JOIN farm.agricultural_season s ON s.tenant_id=e.tenant_id AND s.id=e.id LEFT JOIN farm.revision fr ON fr.tenant_id=e.tenant_id AND fr.id=fs.field_revision_id JOIN LATERAL (SELECT * FROM farm.revision v WHERE v.tenant_id=e.tenant_id AND v.entity_id=e.id ${asOf===undefined?'AND v.id=e.current_revision_id':'AND v.effective_at<=$3'} ORDER BY v.effective_at DESC,v.revision DESC LIMIT 1) r ON true WHERE e.tenant_id=$1 AND e.id=$2`,asOf===undefined?[actor.tenantId,entityId]:[actor.tenantId,entityId,asOf]);
  if(!r.rowCount)throw Error('FARM_NOT_FOUND');return r.rows[0];
 }
 async history(actor:FarmActor,entityId:string):Promise<Record<string,unknown>[]>{actor=Object.freeze({...actor});await this.read(actor,entityId);return(await this.pool.query('SELECT * FROM farm.revision WHERE tenant_id=$1 AND entity_id=$2 ORDER BY revision',[actor.tenantId,entityId])).rows;}
 async lineage(actor:FarmActor,fieldId:string):Promise<Record<string,unknown>[]>{
  actor=Object.freeze({...actor});const entity=await this.read(actor,fieldId);if(entity.kind!=='FIELD')throw Error('FARM_NOT_FIELD');
  return(await this.pool.query(`WITH RECURSIVE connected(id) AS (SELECT $2::uuid UNION SELECT CASE WHEN l.from_field_id=c.id THEN l.to_field_id ELSE l.from_field_id END FROM farm.lineage l JOIN connected c ON l.from_field_id=c.id OR l.to_field_id=c.id WHERE l.tenant_id=$1) SELECT l.* FROM farm.lineage l WHERE l.tenant_id=$1 AND l.from_field_id IN (SELECT id FROM connected) ORDER BY l.effective_at,l.from_field_id,l.to_field_id`,[actor.tenantId,fieldId])).rows;
 }
}
