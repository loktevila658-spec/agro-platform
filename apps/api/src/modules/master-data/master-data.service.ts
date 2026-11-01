import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { fingerprint } from '../../../../../packages/connectors/src/index.cjs';
import type { Envelope } from '../../../../../packages/connectors/src/index.cjs';
import { executeCommandEffect } from '../../common/command-boundary';
import { IntegrationsService } from '../integrations/integrations.service';
import type { OwnerCommand } from '../integrations/integrations.registry';
import { MasterDataRegistry } from './master-data.registry';
import type { MasterActor, MasterContext, MasterCorrection, MasterKind, MaterialInput, UnitInput } from './master-data.types';
import { FIELDS, UUID, kind, keys, object, text, timestamp, uuidv7, validateFields, validateMaterial, validateUnit, version } from './master-data.validation';
export const MASTER_DATA_POOL=Symbol('MASTER_DATA_POOL');
const tables={Material:'master_data.material',UnitOfMeasure:'master_data.unit_of_measure'};
const columns: Record<string,string>={code:'code',name:'name',itemType:'item_type',baseUom:'base_uom',active:'active',accountingCode:'accounting_code',gtin:'gtin',dimension:'dimension',precision:'precision'};
function snapshot(row:Record<string,unknown>):Record<string,unknown> {
 const result:Record<string,unknown>={};
 for(const [key,value] of Object.entries(row))result[key.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase())]=value instanceof Date?value.toISOString():value;
 return result;
}
@Injectable()
export class MasterDataService implements OnModuleDestroy {
 constructor(@Inject(MASTER_DATA_POOL) private readonly pool:Pool,private readonly registry:MasterDataRegistry,private readonly integrations:IntegrationsService) {}
 async onModuleDestroy():Promise<void>{await this.pool.end();}
 private local():void {if(process.env.AGRO_DEPLOYMENT_MODE!=='LOCAL_PRIMARY')throw Error('LOCAL_PRIMARY_REQUIRED');}
 private async transaction<T>(fn:(tx:PoolClient)=>Promise<T>):Promise<T>{
  const tx=await this.pool.connect();try{await tx.query('BEGIN');const result=await fn(tx);await tx.query('COMMIT');return result;}catch(e){await tx.query('ROLLBACK').catch(()=>undefined);throw e;}finally{tx.release();}
 }
 private identity(type:MasterKind,id:string):void {kind(type);if(typeof id!=='string'||!UUID.test(id))throw Error('MASTER_DATA_INVALID_ID');}
 async read(actor:MasterActor,type:MasterKind,id:string):Promise<Record<string,unknown>>{
  await this.registry.authorize(actor,'master-data.read');this.identity(type,id);
  const r=await this.pool.query(`SELECT * FROM ${tables[type]} WHERE tenant_id=$1 AND id=$2`,[actor.tenantId,id]);if(!r.rowCount)throw Error('MASTER_DATA_NOT_FOUND');return snapshot(r.rows[0]);
 }
 async history(actor:MasterActor,type:MasterKind,id:string):Promise<Record<string,unknown>[]> {
  await this.read(actor,type,id);
  return (await this.pool.query('SELECT * FROM master_data.revision WHERE tenant_id=$1 AND entity_type=$2 AND entity_id=$3 ORDER BY version',[actor.tenantId,type,id])).rows;
 }
 async externalReferences(actor:MasterActor,type:MasterKind,id:string,profileId:string):Promise<Record<string,unknown>[]> {
  await this.read(actor,type,id);return this.integrations.externalReferencesFor(actor,profileId,type,id);
 }
 async createUnit(actor:MasterActor,input:UnitInput,context:MasterContext):Promise<Record<string,unknown>>{
  await this.registry.authorize(actor,'master-data.write');const command=validateUnit(input);
  return this.transaction(tx=>this.mutate(tx,actor,'UnitOfMeasure',null,command as unknown as Record<string,unknown>,context,'CREATE','Created',undefined));
 }
 async createMaterial(actor:MasterActor,input:MaterialInput,context:MasterContext):Promise<Record<string,unknown>>{
  await this.registry.authorize(actor,'master-data.write');const command=validateMaterial(input);
  return this.transaction(tx=>this.mutate(tx,actor,'Material',null,command as unknown as Record<string,unknown>,context,'CREATE','Created',undefined));
 }
 async correctUnit(actor:MasterActor,id:string,command:MasterCorrection,context:MasterContext):Promise<Record<string,unknown>>{
  return this.correct(actor,'UnitOfMeasure',id,command,context);
 }
 async correctMaterial(actor:MasterActor,id:string,command:MasterCorrection,context:MasterContext):Promise<Record<string,unknown>>{
  return this.correct(actor,'Material',id,command,context);
 }
 private correction(type:MasterKind,command:MasterCorrection,external=false):void {
  keys(command,['expectedVersion','reason','patch']);version(command.expectedVersion);
  if(!text(command.reason,1000))throw Error('MASTER_DATA_CORRECTION_REASON_REQUIRED');
  object(command.patch);if(Object.keys(command.patch).length===0)throw Error('MASTER_DATA_INVALID_EMPTY_PATCH');
  validateFields(type,command.patch,external);
  if(type==='UnitOfMeasure'&&Object.hasOwn(command.patch,'code'))throw Error('MASTER_DATA_UNIT_CODE_IMMUTABLE');
 }
 private async correct(actor:MasterActor,type:MasterKind,id:string,command:MasterCorrection,context:MasterContext):Promise<Record<string,unknown>>{
  await this.registry.authorize(actor,'master-data.correct');this.identity(type,id);this.correction(type,command);
  return this.transaction(tx=>this.mutate(tx,actor,type,id,command.patch,context,'CORRECT',command.reason,command.expectedVersion));
 }
 /** Server composition explicitly registers this provider-neutral owner port; no import profile is installed automatically. */
 externalCommand():OwnerCommand {
  const validate=async(_tx:PoolClient,actor:MasterActor,e:Envelope,m:Record<string,unknown>):Promise<void>=>{
   this.local();await this.registry.authorize(actor,'master-data.external');
   if(e.tenantId!==actor.tenantId)throw Error('MASTER_DATA_FORBIDDEN_TENANT');
   if(e.direction!=='INBOUND'||e.operation!=='master-data.apply-external')throw Error('MASTER_DATA_INVALID_ENVELOPE');
   kind(e.entityType);this.identity(e.entityType,e.localId);
   keys(m,[...FIELDS[e.entityType],'expectedVersion','reason']);
   const {expectedVersion,reason,...patch}=m;this.correction(e.entityType,{expectedVersion:expectedVersion as string,reason:reason as string,patch},true);
   for(const field of Object.keys(patch)) {
    const policy=this.registry.field(actor.tenantId,e.entityType,field);
    if(policy.master!=='EXTERNAL_SYSTEM'||policy.profileId!==e.profileId||policy.profileVersion!==e.profileVersion||!policy.source)throw Error('MASTER_DATA_SOURCE_OF_TRUTH_CONFLICT');
   }
   if(!text(e.externalId,512)||!timestamp(e.observedAt)||!Number.isSafeInteger(e.profileVersion)||e.profileVersion<1||!UUID.test(e.id))throw Error('MASTER_DATA_INVALID_PROVENANCE');
   object(e.provenance);
   const provided=['importBatch','fileHash','sourceRow'].filter(k=>Object.hasOwn(e.provenance,k));
   if(provided.length&& (provided.length!==3||!text(e.provenance.importBatch)||!text(e.provenance.sourceRow)||typeof e.provenance.fileHash!=='string'||!/^[a-f0-9]{64}$/.test(e.provenance.fileHash)))throw Error('MASTER_DATA_INVALID_IMPORT_PROVENANCE');
  };
  return {operation:'master-data.apply-external',validate,execute:async(tx,actor,e,m)=>{
   // SAVEPOINT is rejected by PostgreSQL in autocommit; never accept an unbound raw handle.
   await tx.query('SAVEPOINT master_data_owner');
   try {
    await validate(tx,actor,e,m);
    const {expectedVersion,reason,...patch}=m;
    if(new Set(Object.keys(patch).map(field=>this.registry.field(actor.tenantId,e.entityType as MasterKind,field).source)).size!==1)throw Error('MASTER_DATA_SOURCE_OF_TRUTH_CONFLICT');
    const policy=this.registry.field(actor.tenantId,e.entityType as MasterKind,Object.keys(patch)[0]!);
    const context={idempotencyKey:`integration:${e.id}`,correlationId:e.correlationId,causationId:e.id};
    const result=await this.mutate(tx,actor,e.entityType as MasterKind,e.localId,patch,context,'EXTERNAL',reason as string,expectedVersion as string,
     {...e.provenance,source:policy.source,profileId:e.profileId,profileVersion:e.profileVersion,mappingVersion:e.profileVersion,externalId:e.externalId,envelopeId:e.id,observedAt:e.observedAt});
    await tx.query('RELEASE SAVEPOINT master_data_owner');return result;
   }catch(error){await tx.query('ROLLBACK TO SAVEPOINT master_data_owner').catch(()=>undefined);await tx.query('RELEASE SAVEPOINT master_data_owner').catch(()=>undefined);throw error;}
  }};
 }
 private async mutate(tx:PoolClient,actor:MasterActor,type:MasterKind,id:string|null,fields:Record<string,unknown>,context:MasterContext,operation:'CREATE'|'CORRECT'|'EXTERNAL',reason:string,expectedVersion?:string,externalProvenance?:Record<string,unknown>):Promise<Record<string,unknown>> {
  this.local();await this.registry.authorize(actor,operation==='CREATE'?'master-data.write':operation==='CORRECT'?'master-data.correct':'master-data.external');
  keys(context,['idempotencyKey','correlationId','causationId']);
  if(!text(context.idempotencyKey,200)||!text(context.correlationId,128)||!text(context.causationId,128))throw Error('MASTER_DATA_INVALID_CONTEXT');
  const policy=this.registry.sourcePolicy(actor.tenantId);
  for(const field of Object.keys(fields).filter(f=>f!=='organizationId')){
   const p=this.registry.field(actor.tenantId,type,field);
   if(operation!=='EXTERNAL'&&p.master!=='PLATFORM')throw Error('MASTER_DATA_EXTERNAL_MASTER_READONLY');
   if(operation==='EXTERNAL'&&(p.master!=='EXTERNAL_SYSTEM'||p.profileId!==externalProvenance?.profileId||p.profileVersion!==externalProvenance?.profileVersion))throw Error('MASTER_DATA_SOURCE_OF_TRUTH_CONFLICT');
  }
  const action=`${type}.${operation}`;
  const hash=fingerprint({actor:actor.subjectId,type,id,fields,reason,expectedVersion:expectedVersion??null,provenance:externalProvenance??null});
  try {
   const reservation=await tx.query('INSERT INTO master_data.command_idempotency(tenant_id,idempotency_key,action,fingerprint,response) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING idempotency_key',[actor.tenantId,context.idempotencyKey,action,hash,{pending:true}]);
   if(!reservation.rowCount){
    const old=(await tx.query('SELECT * FROM master_data.command_idempotency WHERE tenant_id=$1 AND idempotency_key=$2 FOR UPDATE',[actor.tenantId,context.idempotencyKey])).rows[0];
    if(old?.action!==action||old.fingerprint!==hash)throw Error('MASTER_DATA_IDEMPOTENCY_CONFLICT');return old.response;
   }
   // Serialize immutable policy version introduction across commands and restarts.
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,25))',[actor.tenantId]);
   const latest=await tx.query('SELECT version FROM master_data.source_policy WHERE tenant_id=$1 ORDER BY version DESC LIMIT 1',[actor.tenantId]);
   if(latest.rows[0]?.version>policy.version)throw Error('MASTER_DATA_SOURCE_POLICY_STALE');
   const policyHash=fingerprint(policy);
   await tx.query('INSERT INTO master_data.source_policy(tenant_id,version,config,fingerprint) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[actor.tenantId,policy.version,policy,policyHash]);
   const persisted=(await tx.query('SELECT fingerprint FROM master_data.source_policy WHERE tenant_id=$1 AND version=$2',[actor.tenantId,policy.version])).rows[0];
   if(persisted.fingerprint!==policyHash)throw Error('MASTER_DATA_SOURCE_POLICY_IMMUTABLE');
   let previous:Record<string,unknown>|undefined;
   if(id){previous=(await tx.query(`SELECT * FROM ${tables[type]} WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,[actor.tenantId,id])).rows[0];if(!previous)throw Error('MASTER_DATA_NOT_FOUND');}
   // A shared row lock prevents concurrent UOM semantic edits during reference creation.
   if(type==='Material'&&Object.hasOwn(fields,'baseUom')) {
    const u=await tx.query('SELECT id FROM master_data.unit_of_measure WHERE tenant_id=$1 AND code=$2 FOR SHARE',[actor.tenantId,fields.baseUom]);if(!u.rowCount)throw Error('MASTER_DATA_UNIT_NOT_FOUND');
   }
   const entityId=id??uuidv7(),commandId=randomUUID();
   const row=await executeCommandEffect({transaction:tx,expectedVersion,assertVersion:async()=>previous?.row_version===expectedVersion,effect:async()=>{
    if(previous){
     const entries=Object.entries(fields),assignments=entries.map(([field],i)=>`${columns[field]}=$${i+3}`);
     return (await tx.query(`UPDATE ${tables[type]} SET ${assignments.join(',')},row_version=row_version+1,updated_by=$${entries.length+3},updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 RETURNING *`,[actor.tenantId,entityId,...entries.map(([,v])=>v),actor.subjectId])).rows[0];
    }
    if(type==='UnitOfMeasure')return (await tx.query('INSERT INTO master_data.unit_of_measure(tenant_id,id,code,name,dimension,precision,row_version,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,1,$7,$7) RETURNING *',[actor.tenantId,entityId,fields.code,fields.name,fields.dimension,fields.precision,actor.subjectId])).rows[0];
    return (await tx.query('INSERT INTO master_data.material(tenant_id,id,organization_id,code,name,item_type,base_uom,active,row_version,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$9) RETURNING *',[actor.tenantId,entityId,fields.organizationId,fields.code,fields.name,fields.itemType,fields.baseUom,fields.active,actor.subjectId])).rows[0];
   }});
   const after=snapshot(row),revisionId=randomUUID(),occurredAt=new Date().toISOString();
   const prior=id?(await tx.query('SELECT id FROM master_data.revision WHERE tenant_id=$1 AND entity_type=$2 AND entity_id=$3 AND version=$4',[actor.tenantId,type,entityId,expectedVersion])).rows[0]?.id:null;
   const fieldSources=Object.fromEntries(Object.keys(fields).filter(f=>f!=='organizationId').map(f=>[f,this.registry.field(actor.tenantId,type,f)]));
   const provenance={...externalProvenance,fieldSources,source:externalProvenance?.source??'PLATFORM_MANUAL',actorId:actor.subjectId,commandId,correlationId:context.correlationId,causationId:context.causationId,idempotencyKey:context.idempotencyKey,receivedAt:occurredAt,policyVersion:policy.version};
   await tx.query('INSERT INTO master_data.revision(id,tenant_id,entity_type,entity_id,version,previous_revision,snapshot,reason,actor_id,command_id,correlation_id,causation_id,provenance,policy_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[revisionId,actor.tenantId,type,entityId,row.row_version,prior,after,reason,actor.subjectId,commandId,context.correlationId,context.causationId,provenance,policy.version]);
   const eventId=randomUUID(),eventName=type==='Material'?'master_data.material.changed':'master_data.unit.changed';
   const payload={eventId,entityId,entityType:type,tenantId:actor.tenantId,actorId:actor.subjectId,correlationId:context.correlationId,causationId:context.causationId,occurredAt,revision:row.row_version};
   await tx.query("INSERT INTO master_data.outbox_event(id,tenant_id,event_name,event_version,producer,entity_id,actor_id,correlation_id,causation_id,occurred_at,payload) VALUES($1,$2,$3,'1.0.0','master-data',$4,$5,$6,$7,$8,$9)",[eventId,actor.tenantId,eventName,entityId,actor.subjectId,context.correlationId,context.causationId,occurredAt,payload]);
   const response={...after,commandId,revisionId,correlationId:context.correlationId};
   await tx.query('UPDATE master_data.command_idempotency SET response=$3 WHERE tenant_id=$1 AND idempotency_key=$2',[actor.tenantId,context.idempotencyKey,response]);return response;
  }catch(error){
   const e=error as {code?:string;message?:string};
   if(e.code==='23505')throw Error('MASTER_DATA_BUSINESS_CODE_DUPLICATE');
   if(e.code==='23503')throw Error('MASTER_DATA_INVALID_RELATIONSHIP');
   throw error;
  }
 }
}
