import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { fingerprint } from '../../../../../packages/connectors/src/index.cjs';
import { executeCommandEffect } from '../../common/command-boundary';
import { GisRegistry } from './gis.registry';
import type { GisActor,GisContext,GisResult,Proposal } from './gis.types';
import { bbox,context,geometry,id,keys,source,text,timestamp,uuidv7,version } from './gis.validation';
export const GIS_POOL=Symbol('GIS_POOL');
const selection=`v.id,v.geometry_id,v.revision,v.source,v.reason,v.area_ha,v.measurement_method,ST_AsGeoJSON(ST_ForcePolygonCCW(v.geometry),17,0)::json AS geometry,COALESCE(d.status,'PROPOSED') AS status,d.effective_at`;
@Injectable()
export class GisService implements OnModuleDestroy {
 constructor(@Inject(GIS_POOL) readonly pool:Pool,readonly registry:GisRegistry){}
 async onModuleDestroy():Promise<void>{await this.pool.end();}
 local():void{if(process.env.AGRO_DEPLOYMENT_MODE!=='LOCAL_PRIMARY')throw Error('GIS_LOCAL_PRIMARY_REQUIRED');}
 async transaction<T>(fn:(tx:PoolClient)=>Promise<T>):Promise<T>{const tx=await this.pool.connect();try{await tx.query('BEGIN');const r=await fn(tx);await tx.query('COMMIT');return r;}catch(e){await tx.query('ROLLBACK').catch(()=>undefined);throw e;}finally{tx.release();}}
 async command<T>(tx:PoolClient,actor:GisActor,action:string,input:unknown,ctx:GisContext,effect:()=>Promise<T>):Promise<T>{
  this.local();await this.registry.authorize(actor,action);context(ctx);
  const hash=fingerprint({actor:actor.subjectId,action,input});
  const r=await tx.query('INSERT INTO gis.command_idempotency(tenant_id,idempotency_key,action,fingerprint,response) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING idempotency_key',[actor.tenantId,ctx.idempotencyKey,action,hash,{pending:true}]);
  if(!r.rowCount){const old=(await tx.query('SELECT * FROM gis.command_idempotency WHERE tenant_id=$1 AND idempotency_key=$2 FOR UPDATE',[actor.tenantId,ctx.idempotencyKey])).rows[0];if(old?.action!==action||old.fingerprint!==hash)throw Error('GIS_IDEMPOTENCY_CONFLICT');return old.response as T;}
  const result=await effect();
  await tx.query('UPDATE gis.command_idempotency SET response=$3 WHERE tenant_id=$1 AND idempotency_key=$2',[actor.tenantId,ctx.idempotencyKey,result]);return result;
 }
 async audit(tx:PoolClient,actor:GisActor,entityId:string,action:string,before:unknown,after:unknown,reason:string,ctx:GisContext):Promise<void>{
  await tx.query('INSERT INTO gis.audit(id,tenant_id,entity_id,action,actor_id,before_value,after_value,reason,correlation_id,causation_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[randomUUID(),actor.tenantId,entityId,action,actor.subjectId,before,after,reason,ctx.correlationId,ctx.causationId,ctx.idempotencyKey]);
 }
 private async changed(tx:PoolClient,actor:GisActor,result:GisResult,ctx:GisContext):Promise<void>{
  const eventId=randomUUID(),occurredAt=new Date().toISOString();
  const payload={eventId,entityId:result.geometryId,entityType:'Geometry',tenantId:actor.tenantId,actorId:actor.subjectId,correlationId:ctx.correlationId,causationId:ctx.causationId,occurredAt,revision:result.headVersion};
  await tx.query("INSERT INTO gis.outbox_event(id,tenant_id,event_name,event_version,producer,entity_id,actor_id,correlation_id,causation_id,occurred_at,payload) VALUES($1,$2,'gis.geometry.changed','1.0.0','gis',$3,$4,$5,$6,$7,$8)",[eventId,actor.tenantId,result.geometryId,actor.subjectId,ctx.correlationId,ctx.causationId,occurredAt,payload]);
 }
 async validateGeometry(tx:PoolClient,input:unknown):Promise<unknown>{
  const g=geometry(input);
  const result=await tx.query(`WITH candidate AS (SELECT ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1),4326)) AS g) SELECT ST_IsValid(g) AND NOT ST_IsEmpty(g) AS valid,ST_Area(g::geography)/10000 AS area FROM candidate`,[JSON.stringify(g)]);
  if(!result.rows[0]?.valid||!(Number(result.rows[0].area)>0))throw Error('GIS_INVALID_GEOMETRY');return g;
 }
 async propose(actor:GisActor,input:Proposal,ctx:GisContext):Promise<GisResult>{actor=Object.freeze({...actor});input=structuredClone(input);ctx=structuredClone(ctx);await this.registry.authorize(actor,'gis.propose');return this.transaction(tx=>this.proposeInTransaction(tx,actor,input,ctx));}
 /** Reject an autocommit handle; imports call this owned command inside their transaction. */
 async proposeInTransaction(tx:PoolClient,actor:GisActor,input:Proposal,ctx:GisContext):Promise<GisResult>{
  actor=Object.freeze({...actor});input=structuredClone(input);ctx=structuredClone(ctx);
  await tx.query('SAVEPOINT gis_owner');
  try{const r=await this.command(tx,actor,'gis.propose',input,ctx,async()=>{
   keys(input,['geometryId','expectedVersion','geometry','source','reason']);version(input.expectedVersion);source(input.source);
   if(!text(input.reason))throw Error('GIS_REASON_REQUIRED');
   const g=await this.validateGeometry(tx,input.geometry);
   if(input.source.type!=='IMPORT'&&input.source.sourceCrs!=='EPSG:4326')throw Error('GIS_CANONICAL_CRS_REQUIRED');
   let importIndex:number|null=null,provenance={...input.source};
   if(input.source.type==='IMPORT'){
    const staged=await tx.query(`SELECT s.feature_index,s.source_crs,b.sha256,ST_Equals(s.geometry,ST_SetSRID(ST_GeomFromGeoJSON($4),4326)) AS matches FROM gis.feature_staging s JOIN gis.import_batch b ON b.tenant_id=s.tenant_id AND b.id=s.batch_id WHERE s.tenant_id=$1 AND s.batch_id=$2 AND s.source_feature_id=$3 AND s.issues='[]'::jsonb`,[actor.tenantId,input.source.importBatchId,input.source.sourceFeatureId,JSON.stringify(g)]);
    if(staged.rowCount!==1||(!staged.rows[0].matches||staged.rows[0].source_crs!==input.source.sourceCrs))throw Error('GIS_INVALID_IMPORT_REFERENCE');importIndex=staged.rows[0].feature_index;
    provenance={...provenance,...{fileSha256:staged.rows[0].sha256}};
   }
   const geometryId=input.geometryId??uuidv7();id(geometryId);
   const previous=(await tx.query('SELECT row_version FROM gis.geometry_head WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[actor.tenantId,geometryId])).rows[0];
   const current=previous?.row_version??'0';
   const headVersion=String(BigInt(current)+1n),versionId=uuidv7();
   await executeCommandEffect({transaction:tx,expectedVersion:input.expectedVersion,assertVersion:async()=>current===input.expectedVersion,effect:async()=>{
    if(previous)await tx.query('UPDATE gis.geometry_head SET row_version=row_version+1 WHERE tenant_id=$1 AND id=$2',[actor.tenantId,geometryId]);
    else await tx.query('INSERT INTO gis.geometry_head(tenant_id,id,row_version) VALUES($1,$2,1)',[actor.tenantId,geometryId]);
    await tx.query(`INSERT INTO gis.geometry_version(tenant_id,geometry_id,id,revision,geometry,area_ha,measurement_method,source,reason,import_batch_id,feature_index) SELECT $1,$2,$3,$4,g,ST_Area(g::geography)/10000,'PostGIS.geography.spheroid/'||postgis_lib_version(),$6,$7,$8,$9 FROM (SELECT ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5),4326)) AS g) candidate`,[actor.tenantId,geometryId,versionId,headVersion,JSON.stringify(g),provenance,input.reason,input.source.importBatchId??null,importIndex]);
   }});
   const result={geometryId,versionId,headVersion};await this.audit(tx,actor,geometryId,'PROPOSE',previous??null,{...result,source:provenance},input.reason,ctx);await this.changed(tx,actor,result,ctx);return result;
  });await tx.query('RELEASE SAVEPOINT gis_owner');return r;
  }catch(e){await tx.query('ROLLBACK TO SAVEPOINT gis_owner').catch(()=>undefined);await tx.query('RELEASE SAVEPOINT gis_owner').catch(()=>undefined);throw e;}
 }
 async decide(actor:GisActor,input:{geometryId:string;versionId:string;expectedVersion:string;decision:'APPROVED'|'REJECTED';effectiveAt?:string;reason:string},ctx:GisContext):Promise<GisResult>{
  actor=Object.freeze({...actor});input=structuredClone(input);ctx=structuredClone(ctx);
  const action=input?.decision==='APPROVED'?'gis.approve':'gis.reject';await this.registry.authorize(actor,action);
  keys(input,['geometryId','versionId','expectedVersion','decision','effectiveAt','reason']);id(input.geometryId);id(input.versionId);version(input.expectedVersion);
  if(!['APPROVED','REJECTED'].includes(input.decision)||!text(input.reason)||(input.decision==='APPROVED'?!timestamp(input.effectiveAt):input.effectiveAt!==undefined))throw Error('GIS_INVALID_DECISION');
  return this.transaction(tx=>this.command(tx,actor,action,input,ctx,async()=>{
   const head=(await tx.query('SELECT row_version FROM gis.geometry_head WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[actor.tenantId,input.geometryId])).rows[0];if(!head)throw Error('GIS_NOT_FOUND');
   const candidate=(await tx.query('SELECT id FROM gis.geometry_version WHERE tenant_id=$1 AND geometry_id=$2 AND id=$3',[actor.tenantId,input.geometryId,input.versionId])).rows[0];if(!candidate)throw Error('GIS_NOT_FOUND');
   const prior=(await tx.query('SELECT version_id FROM gis.geometry_decision WHERE tenant_id=$1 AND version_id=$2',[actor.tenantId,input.versionId])).rows[0];if(prior)throw Error('GIS_ALREADY_DECIDED');
   await executeCommandEffect({transaction:tx,expectedVersion:input.expectedVersion,assertVersion:async()=>head.row_version===input.expectedVersion,effect:async()=>{
    await tx.query('INSERT INTO gis.geometry_decision(tenant_id,geometry_id,version_id,status,effective_at,reason) VALUES($1,$2,$3,$4,$5,$6)',[actor.tenantId,input.geometryId,input.versionId,input.decision,input.effectiveAt??null,input.reason]);
    await tx.query('UPDATE gis.geometry_head SET row_version=row_version+1 WHERE tenant_id=$1 AND id=$2',[actor.tenantId,input.geometryId]);
   }});
   const result={geometryId:input.geometryId,versionId:input.versionId,headVersion:String(BigInt(head.row_version)+1n)};
   await this.audit(tx,actor,input.geometryId,input.decision,{headVersion:head.row_version},{...result,effectiveAt:input.effectiveAt??null},input.reason,ctx);await this.changed(tx,actor,result,ctx);return result;
  }));
 }
 /** Public owner query for immutable version links. Transaction-bound, tenant-checked, no mutation. */
 async versionInTransaction(tx:PoolClient,actor:GisActor,versionId:string):Promise<Record<string,unknown>>{
  actor=Object.freeze({...actor});await this.registry.authorize(actor,'gis.read');id(versionId);
  await tx.query('SAVEPOINT gis_version_query');
  try{
   const r=await tx.query(`SELECT v.id,v.geometry_id,v.revision,v.source,v.area_ha,v.measurement_method FROM gis.geometry_version v WHERE v.tenant_id=$1 AND v.id=$2`,[actor.tenantId,versionId]);
   if(!r.rowCount)throw Error('GIS_NOT_FOUND');
   await tx.query('RELEASE SAVEPOINT gis_version_query');return r.rows[0];
  }catch(e){await tx.query('ROLLBACK TO SAVEPOINT gis_version_query').catch(()=>undefined);await tx.query('RELEASE SAVEPOINT gis_version_query').catch(()=>undefined);throw e;}
 }
 async history(actor:GisActor,geometryId:string):Promise<Record<string,unknown>[]>{actor=Object.freeze({...actor});await this.registry.authorize(actor,'gis.read');id(geometryId);return(await this.pool.query(`SELECT ${selection},h.row_version AS head_version FROM gis.geometry_version v JOIN gis.geometry_head h ON h.tenant_id=v.tenant_id AND h.id=v.geometry_id LEFT JOIN gis.geometry_decision d ON d.tenant_id=v.tenant_id AND d.version_id=v.id WHERE v.tenant_id=$1 AND v.geometry_id=$2 ORDER BY v.revision`,[actor.tenantId,geometryId])).rows;}
 async query(actor:GisActor,bounds:number[],asOf:string,limit=100):Promise<Record<string,unknown>>{
  actor=Object.freeze({...actor});bounds=structuredClone(bounds);
  await this.registry.authorize(actor,'gis.read');bbox(bounds,limit);if(!timestamp(asOf))throw Error('GIS_INVALID_AS_OF');
  const [w,s,e,n]=bounds;
  const envelope=w!>e!?`ST_Union(ST_MakeEnvelope($2,$3,180,$5,4326),ST_MakeEnvelope(-180,$3,$4,$5,4326))`:`ST_MakeEnvelope($2,$3,$4,$5,4326)`;
  // Filter spatially first; NOT EXISTS selects the effective winner, including versions outside bbox.
  const r=await this.pool.query(`SELECT ${selection} FROM gis.geometry_version v JOIN gis.geometry_decision d ON d.tenant_id=v.tenant_id AND d.version_id=v.id WHERE v.tenant_id=$1 AND d.status='APPROVED' AND d.effective_at<=$6 AND v.geometry && ${envelope} AND ST_Intersects(v.geometry,${envelope}) AND NOT EXISTS(SELECT 1 FROM gis.geometry_decision newer JOIN gis.geometry_version nv ON nv.tenant_id=newer.tenant_id AND nv.id=newer.version_id WHERE newer.tenant_id=v.tenant_id AND newer.geometry_id=v.geometry_id AND newer.status='APPROVED' AND newer.effective_at<=$6 AND (newer.effective_at,nv.revision)>(d.effective_at,v.revision)) ORDER BY v.geometry_id LIMIT $7`,[actor.tenantId,w,s,e,n,asOf,limit+1]);
  return {type:'FeatureCollection',asOf,truncated:r.rows.length>limit,features:r.rows.slice(0,limit).map(row=>({type:'Feature',id:row.id,geometry:row.geometry,properties:{geometryId:row.geometry_id,geometryVersionId:row.id,areaHa:row.area_ha,measurementMethod:row.measurement_method,effectiveAt:row.effective_at}}))};
 }
}
