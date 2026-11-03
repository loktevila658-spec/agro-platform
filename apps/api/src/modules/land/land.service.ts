import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { fingerprint } from '../../../../../packages/connectors/src/index.cjs';
import { executeCommandEffect } from '../../common/command-boundary';
import { GisService } from '../gis/gis.service';
import { context, id, keys, text, uuidv7, version } from '../gis/gis.validation';
import { LandRegistry } from './land.registry';
import { validateSnapshot } from './land.validation';
import type { LandActor, LandContext, LandCreate, LandCorrection, LandResult } from './land.types';
export const LAND_POOL=Symbol('LAND_POOL');
@Injectable()
export class LandService implements OnModuleDestroy {
 constructor(@Inject(LAND_POOL) private readonly pool:Pool,private readonly registry:LandRegistry,private readonly gis:GisService){}
 async onModuleDestroy():Promise<void>{await this.pool.end();}
 private async transaction<T>(effect:(tx:PoolClient)=>Promise<T>):Promise<T>{
  const tx=await this.pool.connect();try{await tx.query('BEGIN');const result=await effect(tx);await tx.query('COMMIT');return result;}catch(e){await tx.query('ROLLBACK').catch(()=>undefined);throw e;}finally{tx.release();}
 }
 async create(actor:LandActor,input:LandCreate,ctx:LandContext):Promise<LandResult>{return this.mutate(actor,null,input,ctx);}
 async correct(actor:LandActor,landPlotId:string,input:LandCorrection,ctx:LandContext):Promise<LandResult>{id(landPlotId);return this.mutate(actor,landPlotId,input,ctx);}
 private async mutate(actor:LandActor,landPlotId:string|null,input:LandCreate|LandCorrection,ctx:LandContext):Promise<LandResult>{
  actor=Object.freeze({...actor});input=structuredClone(input);ctx=structuredClone(ctx);
  const action=landPlotId?'land.correct':'land.create';await this.registry.authorize(actor,action);
  if(process.env.AGRO_DEPLOYMENT_MODE!=='LOCAL_PRIMARY')throw Error('LAND_LOCAL_PRIMARY_REQUIRED');
  keys(input,landPlotId?['expectedVersion','snapshot','reason']:['organizationId','snapshot','reason']);context(ctx);
  if(!text(input.reason))throw Error('LAND_REASON_REQUIRED');validateSnapshot(input.snapshot);
  const expected=landPlotId?(input as LandCorrection).expectedVersion:'0';version(expected);
  const organizationId=(input as LandCreate).organizationId??null;if(organizationId!==null)id(organizationId);
  const hash=fingerprint({actor:actor.subjectId,action,landPlotId,input});
  return this.transaction(async tx=>{
   // Recheck current server policy inside the command transaction, including replay.
   await this.registry.authorize(actor,action);
   const reserve=await tx.query('INSERT INTO land.command_idempotency(tenant_id,idempotency_key,action,fingerprint,response) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING idempotency_key',[actor.tenantId,ctx.idempotencyKey,action,hash,{pending:true}]);
   if(!reserve.rowCount){const old=(await tx.query('SELECT * FROM land.command_idempotency WHERE tenant_id=$1 AND idempotency_key=$2 FOR UPDATE',[actor.tenantId,ctx.idempotencyKey])).rows[0];if(old?.fingerprint!==hash||old.action!==action)throw Error('LAND_IDEMPOTENCY_CONFLICT');return old.response as LandResult;}
   const entityId=landPlotId??uuidv7();
   const before=landPlotId?(await tx.query('SELECT * FROM land.land_plot WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[actor.tenantId,landPlotId])).rows[0]:null;
   if(landPlotId&&!before)throw Error('LAND_NOT_FOUND');
   const current=before?.row_version??'0';
   const geometry=input.snapshot.geometryVersionId?await this.gis.versionInTransaction(tx,actor,input.snapshot.geometryVersionId):null;
   const result={landPlotId:entityId,snapshotId:uuidv7(),version:String(BigInt(current)+1n)};
   await executeCommandEffect({transaction:tx,expectedVersion:expected,assertVersion:async()=>current===expected,effect:async()=>{
    if(!before)await tx.query('INSERT INTO land.land_plot(tenant_id,id,organization_id,status,row_version,current_snapshot_id) VALUES($1,$2,$3,\'ACTIVE\',1,$4)',[actor.tenantId,entityId,organizationId,result.snapshotId]);
    else await tx.query('UPDATE land.land_plot SET row_version=row_version+1,current_snapshot_id=$3 WHERE tenant_id=$1 AND id=$2',[actor.tenantId,entityId,result.snapshotId]);
    const s=input.snapshot;
    if(s.cadastralNumber){
     const claim=[actor.tenantId,s.source.source,s.source.profile,s.source.profileVersion,s.cadastralNumber,s.source.capturedAt];
     await tx.query('INSERT INTO land.cadastral_reference(tenant_id,registry_source,profile,profile_version,cadastral_number,captured_at,land_plot_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[...claim,entityId]);
     const existing=(await tx.query('SELECT land_plot_id FROM land.cadastral_reference WHERE tenant_id=$1 AND registry_source=$2 AND profile=$3 AND profile_version=$4 AND cadastral_number=$5 AND captured_at=$6',claim)).rows[0];
     if(existing?.land_plot_id!==entityId)throw Error('LAND_CADASTRAL_REFERENCE_CONFLICT');
    }
    await tx.query('INSERT INTO land.snapshot(tenant_id,land_plot_id,id,revision,previous_snapshot_id,metadata,geometry_version_id,geometry_provenance,actor_id,reason,correlation_id,causation_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[actor.tenantId,entityId,result.snapshotId,result.version,before?.current_snapshot_id??null,s,s.geometryVersionId??null,geometry,actor.subjectId,input.reason,ctx.correlationId,ctx.causationId,ctx.idempotencyKey]);
    const previous=before?(await tx.query('SELECT metadata FROM land.snapshot WHERE tenant_id=$1 AND id=$2',[actor.tenantId,before.current_snapshot_id])).rows[0]?.metadata:null;
    await tx.query('INSERT INTO land.audit(id,tenant_id,land_plot_id,actor_id,before_value,after_value,reason,correlation_id,causation_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[randomUUID(),actor.tenantId,entityId,actor.subjectId,previous,{...result,metadata:s},input.reason,ctx.correlationId,ctx.causationId,ctx.idempotencyKey]);
    const eventId=randomUUID(),occurredAt=new Date().toISOString();
    const payload={eventId,entityId,entityType:'LandPlot',tenantId:actor.tenantId,actorId:actor.subjectId,correlationId:ctx.correlationId,causationId:ctx.causationId,occurredAt,revision:result.version};
    await tx.query("INSERT INTO land.outbox_event(id,tenant_id,event_name,event_version,producer,entity_id,actor_id,correlation_id,causation_id,occurred_at,payload) VALUES($1,$2,'land.plot.changed','1.0.0','land',$3,$4,$5,$6,$7,$8)",[eventId,actor.tenantId,entityId,actor.subjectId,ctx.correlationId,ctx.causationId,occurredAt,payload]);
    await tx.query('UPDATE land.command_idempotency SET response=$3 WHERE tenant_id=$1 AND idempotency_key=$2',[actor.tenantId,ctx.idempotencyKey,result]);
   }});
   return result;
  });
 }
 /** Permission-checked immutable parcel reference; caller must own an open transaction. */
 async referenceInTransaction(tx:PoolClient,actor:LandActor,landPlotId:string):Promise<Record<string,unknown>>{
  actor=Object.freeze({...actor});await this.registry.authorize(actor,'land.read');id(landPlotId);
  await tx.query('SAVEPOINT land_reference_query');
  try{
   const r=await tx.query('SELECT p.id,p.organization_id,s.id AS snapshot_id,s.revision,s.metadata FROM land.land_plot p JOIN land.snapshot s ON s.tenant_id=p.tenant_id AND s.id=p.current_snapshot_id WHERE p.tenant_id=$1 AND p.id=$2',[actor.tenantId,landPlotId]);
   if(!r.rowCount)throw Error('LAND_NOT_FOUND');await tx.query('RELEASE SAVEPOINT land_reference_query');return r.rows[0];
  }catch(e){await tx.query('ROLLBACK TO SAVEPOINT land_reference_query').catch(()=>undefined);await tx.query('RELEASE SAVEPOINT land_reference_query').catch(()=>undefined);throw e;}
 }
 async read(actor:LandActor,landPlotId:string):Promise<Record<string,unknown>>{
  actor=Object.freeze({...actor});await this.registry.authorize(actor,'land.read');id(landPlotId);
  const result=await this.pool.query('SELECT p.id AS land_plot_id,p.organization_id,p.status,p.row_version,s.* FROM land.land_plot p JOIN land.snapshot s ON s.tenant_id=p.tenant_id AND s.id=p.current_snapshot_id WHERE p.tenant_id=$1 AND p.id=$2',[actor.tenantId,landPlotId]);
  if(!result.rowCount)throw Error('LAND_NOT_FOUND');return result.rows[0];
 }
 async history(actor:LandActor,landPlotId:string):Promise<Record<string,unknown>[]>{
  actor=Object.freeze({...actor});await this.read(actor,landPlotId);
  return(await this.pool.query('SELECT * FROM land.snapshot WHERE tenant_id=$1 AND land_plot_id=$2 ORDER BY revision',[actor.tenantId,landPlotId])).rows;
 }
}
