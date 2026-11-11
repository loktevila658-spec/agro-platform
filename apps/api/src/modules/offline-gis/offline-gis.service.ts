import {BadRequestException,ForbiddenException,Inject,Injectable} from '@nestjs/common';
import {Pool,PoolClient} from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {stableJson} from '../sync/sync.crypto';
import {SyncService} from '../sync/sync.service';
import type {SyncActor,SyncCommand,SyncChange} from '../sync/sync.types';
import type {DomainEvent} from '../events/events.types';
import {FarmService} from '../farm/farm.service';
import {GisService} from '../gis/gis.service';
import {id,keys} from '../gis/gis.validation';
import {OfflineGisRegistry} from './offline-gis.registry';
import {selection} from './offline-gis.validation';
import type {PackageRow,Selection,Scope,MapSource} from './offline-gis.types';
export const OFFLINE_GIS_POOL=Symbol('OFFLINE_GIS_POOL');
const hash=(value:unknown)=>createHash('sha256').update(stableJson(value)).digest('hex');
@Injectable()
export class OfflineGisService {
 constructor(@Inject(OFFLINE_GIS_POOL) readonly pool:Pool,readonly registry:OfflineGisRegistry,private readonly farm:FarmService,private readonly gis:GisService,private readonly sync:SyncService){}
 async onModuleDestroy():Promise<void>{await this.pool.end();}
 local():void{if(process.env.AGRO_DEPLOYMENT_MODE!=='LOCAL_PRIMARY')throw Error('OFFLINE_GIS_LOCAL_PRIMARY_REQUIRED');}
 async row(tx:Pool|PoolClient,actor:SyncActor,packageId:string,lock=false):Promise<PackageRow|undefined>{try{id(packageId);}catch{throw new BadRequestException('OFFLINE_GIS_INVALID_PACKAGE_ID');}return(await tx.query<PackageRow>(`SELECT * FROM offline_gis.package WHERE tenant_id=$1 AND id=$2 AND user_id=$3 AND device_id=$4${lock?' FOR UPDATE':''}`,[actor.tenantId,packageId,actor.userId,actor.deviceId])).rows[0];}
 private async fields(tx:PoolClient,actor:SyncActor,scope:Scope,chosen?:Selection,after?:string){try{return await this.farm.offlineFieldsInTransaction(tx,{tenantId:actor.tenantId,subjectId:actor.userId},scope,chosen?.targets,after);}catch(e){if((e as Error).message==='FARM_FORBIDDEN')throw new ForbiddenException('OFFLINE_GIS_OWNER_FORBIDDEN');throw e;}}
 private async geometryPermission(actor:SyncActor,rows:Record<string,unknown>[],cached=false):Promise<void>{try{if(cached||rows.some(r=>r.geometry_provenance))await this.gis.registry.authorize({tenantId:actor.tenantId,subjectId:actor.userId},'gis.read');}catch(e){if((e as Error).message==='GIS_FORBIDDEN')throw new ForbiddenException('OFFLINE_GIS_OWNER_FORBIDDEN');throw e;}}
 private async configuredSource(actor:SyncActor,chosen:Selection):Promise<MapSource|undefined>{if(chosen.sourceId===undefined)return undefined;const s=(await this.registry.sources(actor)).find(v=>v.id===chosen.sourceId);if(!s||chosen.minZoom<s.minZoom||chosen.maxZoom>s.maxZoom)throw new ForbiddenException('OFFLINE_GIS_SOURCE_FORBIDDEN');return s;}
 async transaction<T>(work:(tx:PoolClient)=>Promise<T>):Promise<T>{const tx=await this.pool.connect();try{await tx.query('BEGIN');const r=await work(tx);await tx.query('COMMIT');return r;}catch(e){await tx.query('ROLLBACK').catch(()=>undefined);throw e;}finally{tx.release();}}
 async candidates(actor:SyncActor,after?:string):Promise<Record<string,unknown>>{if(after!==undefined){try{id(after);}catch{throw new BadRequestException('OFFLINE_GIS_INVALID_CURSOR');}}const scope=await this.registry.scope(actor);return this.transaction(async tx=>{const rows=await this.fields(tx,actor,scope,undefined,after);return {items:rows.map(r=>({id:r.id,kind:r.kind,fieldId:r.field_id,name:r.name,organizationId:r.organization_id,revisionId:r.revision_id})),...(rows.length===1000?{nextAfter:rows.at(-1)!.id}:{})};});}
 private async cachedGeometry(tx:PoolClient,actor:SyncActor,packageId:string,targetId?:string):Promise<boolean>{return (await tx.query("SELECT EXISTS(SELECT 1 FROM offline_gis.field_projection WHERE tenant_id=$1 AND package_id=$2 AND ($3::uuid IS NULL OR target_id=$3) AND (projection ? 'geometryVersionId' OR projection ? 'geometry')) AS present",[actor.tenantId,packageId,targetId??null])).rows[0].present===true;}
 async canRead(actor:SyncActor,entityType:string,entityId:string):Promise<boolean>{
  try{return await this.transaction(async tx=>{
   const scope=await this.registry.scope(actor);let row:PackageRow|undefined,targetId:string|undefined,retainedGeometry=false;
   if(entityType==='OfflineGisField'){
    // Capture this identity's read class with its existence. Concurrent retirement
    // must not replace that class with the fresh metadata-only projection's class.
    const item=(await tx.query("SELECT package_id,target_id,(projection ? 'geometryVersionId' OR projection ? 'geometry') AS has_geometry FROM offline_gis.field_projection WHERE tenant_id=$1 AND id=$2",[actor.tenantId,entityId])).rows[0];
    if(!item)return false;targetId=item.target_id;retainedGeometry=item.has_geometry===true;row=await this.row(tx,actor,item.package_id);
   }else row=await this.row(tx,actor,entityId);
   if(!row||row.content_hash==='WITHDRAWN')return false;
   await this.configuredSource(actor,row.selection);
   const targets=targetId?row.selection.targets.filter(t=>t.id===targetId):row.selection.targets,rows=await this.fields(tx,actor,scope,{...row.selection,targets});
   await this.geometryPermission(actor,rows,retainedGeometry||await this.cachedGeometry(tx,actor,row.id,targetId));
   return rows.length===targets.length;
  });}catch{return false;}
 }
 async read(actor:SyncActor,packageId:string):Promise<Record<string,unknown>>{return this.transaction(async tx=>{const scope=await this.registry.scope(actor);const row=await this.row(tx,actor,packageId);if(!row||row.content_hash==='WITHDRAWN')throw new ForbiddenException('OFFLINE_GIS_FORBIDDEN');await this.configuredSource(actor,row.selection);const rows=await this.fields(tx,actor,scope,row.selection);await this.geometryPermission(actor,rows,await this.cachedGeometry(tx,actor,row.id));if(rows.length!==row.selection.targets.length)throw new ForbiddenException('OFFLINE_GIS_FORBIDDEN');return row.manifest;});}

 async authorize(tx:PoolClient,actor:SyncActor,c:SyncCommand):Promise<boolean>{try{if(c.aggregate.type!=='OfflineGisPackage'||c.aggregate.id!==actor.deviceId)return false;const action=c.type==='OfflineGis.Select'?'select':c.type==='OfflineGis.Refresh'?'refresh':undefined;if(!action)return false;const scope=await this.registry.scope(actor,`offline-gis.package.${action}`);const row=await this.row(tx,actor,c.aggregate.id);const chosen=action==='select'?selection(c.payload):row?.selection;if(!chosen)return false;if(action==='refresh')keys(c.payload,[]);await this.configuredSource(actor,chosen);const rows=await this.fields(tx,actor,scope,chosen);await this.geometryPermission(actor,rows);return rows.length===chosen.targets.length;}catch(e){if(e instanceof ForbiddenException||/^(FARM_FORBIDDEN|GIS_FORBIDDEN)$/.test(String((e as Error).message)))return false;throw e;}}
 async current(tx:PoolClient,actor:SyncActor,c:SyncCommand):Promise<Record<string,unknown>>{const row=await this.row(tx,actor,c.aggregate.id);return row?{id:row.id,version:Number(row.version)}:{};}
 async assertVersion(tx:PoolClient,actor:SyncActor,c:SyncCommand):Promise<boolean>{const row=await this.row(tx,actor,c.aggregate.id,true);return Number(row?.version??0)===c.baseVersion;}
 private async subscriptionGate(tx:PoolClient,tenantId:string):Promise<void>{
  await tx.query('INSERT INTO offline_gis.tenant_gate(tenant_id) VALUES($1) ON CONFLICT DO NOTHING',[tenantId]);
  await tx.query('SELECT tenant_id FROM offline_gis.tenant_gate WHERE tenant_id=$1 FOR UPDATE',[tenantId]);
 }
 async apply(tx:PoolClient,actor:SyncActor,c:SyncCommand){this.local();await this.subscriptionGate(tx,actor.tenantId);const old=await this.row(tx,actor,c.aggregate.id,true);const chosen=c.type==='OfflineGis.Select'?selection(c.payload):old!.selection;const scope=await this.registry.scope(actor,`offline-gis.package.${c.type==='OfflineGis.Select'?'select':'refresh'}`);return this.build(tx,actor,old,chosen,scope,c);}
 private async build(tx:PoolClient,actor:SyncActor,old:PackageRow|undefined,chosen:Selection,scope:Scope,command?:SyncCommand,event?:DomainEvent){
  const version=Number(old?.version??0)+1,source=await this.configuredSource(actor,chosen),rows=await this.fields(tx,actor,scope,chosen);
  if(command&&rows.length!==chosen.targets.length)throw new ForbiddenException('OFFLINE_GIS_FIELD_FORBIDDEN');
  const previous=(await tx.query('SELECT * FROM offline_gis.field_projection WHERE tenant_id=$1 AND package_id=$2',[actor.tenantId,actor.deviceId])).rows;
  const payloads:Record<string,unknown>[]=[];
  for(const r of rows){const pin=r.geometry_provenance as Record<string,unknown>|null;const g=pin?await this.gis.offlineVersionInTransaction(tx,{tenantId:actor.tenantId,subjectId:actor.userId},String(pin.id),scope.renderProfile.toleranceDegrees):undefined;
   // A projection ID has one read-permission class for its entire retained feed.
   // Retire it when geometry appears/disappears so replay cannot expose old GIS
   // payloads through a now-authorized metadata-only identity.
   const retained=previous.find(p=>p.target_id===r.id),hadGeometry=retained!==undefined&&('geometryVersionId' in retained.projection||'geometry' in retained.projection);
   const projectionId=retained&&hadGeometry===Boolean(g)?retained.id:randomUUID();
   payloads.push({id:projectionId,packageId:actor.deviceId,targetId:r.id,kind:r.kind,fieldId:r.field_id,name:r.name,organizationId:r.organization_id,ownerRevisionId:r.revision_id,fieldRevisionId:r.field_revision_id,ownerVersion:String(r.row_version),...(r.site_id?{siteId:r.site_id}:{}),...(g?{geometryVersionId:g.id,geometry:g.geometry,bounds:g.bounds,center:(g.center as {coordinates:number[]}).coordinates}:{}),sourceChanged:g?.newer_approved===true,provenance:{owner:'Farm',effectiveAt:r.effective_at,geometry:pin,renderProfile:scope.renderProfile}});
  }
  const contentHash=hash({chosen,source:source??null,renderProfile:scope.renderProfile,payloads});
  if(event&&old?.content_hash===contentHash){const locked=await this.row(tx,actor,actor.deviceId,true);if(locked?.version!==old.version)throw Error('OFFLINE_GIS_RETRY_CONCURRENT_SELECTION');return {canonical:old.manifest,aggregateVersion:Number(old.version),changes:[] as SyncChange[]};}
  const now=new Date().toISOString();const manifest={id:actor.deviceId,version,tenantId:actor.tenantId,userId:actor.userId,deviceId:actor.deviceId,selection:chosen,createdAt:old?.manifest.createdAt??now,lastValidatedAt:now,entries:payloads.map(p=>p.id),renderProfile:scope.renderProfile,...(source?{source}:{}),sourceChanged:payloads.some(p=>p.sourceChanged),contentHash};
  const changes:SyncChange[]=[...previous.filter(p=>!payloads.some(v=>v.id===p.id)).map(p=>({entityType:'OfflineGisField',entityId:p.id,op:'PURGE' as const,projection:{},visibleUserIds:[actor.userId]})),...payloads.map(p=>({entityType:'OfflineGisField',entityId:String(p.id),entityVersion:version,op:'UPSERT' as const,projection:{...p,bundleVersion:version},visibleUserIds:[actor.userId]})),{entityType:'OfflineGisPackage',entityId:actor.deviceId,entityVersion:version,op:'UPSERT',projection:manifest,visibleUserIds:[actor.userId]}];
  if(event){
   // Append actual derived deltas through the public sync port FIRST. It owns
   // the feed clock lock; verify our read after that lock, before owned writes.
   await this.sync.appendChanges(tx,actor.tenantId,changes);
   const locked=await this.row(tx,actor,actor.deviceId,true);
   if(locked?.version!==old?.version)throw Error('OFFLINE_GIS_RETRY_CONCURRENT_SELECTION');
  }
  await tx.query(`INSERT INTO offline_gis.package(tenant_id,id,user_id,device_id,session_id,version,selection,manifest,content_hash) VALUES($1,$2,$3,$2,$4,$5,$6,$7,$8) ON CONFLICT(tenant_id,id) DO UPDATE SET session_id=EXCLUDED.session_id,version=EXCLUDED.version,selection=EXCLUDED.selection,manifest=EXCLUDED.manifest,content_hash=EXCLUDED.content_hash`,[actor.tenantId,actor.deviceId,actor.userId,actor.sessionId,version,chosen,manifest,contentHash]);
  for(const p of previous.filter(p=>!payloads.some(v=>v.id===p.id)))await tx.query('DELETE FROM offline_gis.field_projection WHERE tenant_id=$1 AND id=$2',[actor.tenantId,p.id]);
  for(const p of payloads)await tx.query(`INSERT INTO offline_gis.field_projection(tenant_id,package_id,id,target_id,kind,version,projection) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant_id,id) DO UPDATE SET version=EXCLUDED.version,projection=EXCLUDED.projection`,[actor.tenantId,actor.deviceId,p.id,p.targetId,p.kind,version,{...p,bundleVersion:version}]);
  await tx.query('INSERT INTO offline_gis.audit(tenant_id,package_id,version,actor_id,action,command_id,source_event_id,observed_at,before_value,after_value,provenance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[actor.tenantId,actor.deviceId,version,event?.actorId??actor.userId,command?.type??event!.eventName,command?.localCommandId??null,event?.id??null,command?.observedAt??event!.occurredAt,old?.manifest??null,manifest,{actor,command:command??null,sourceEvent:event??null}]);
  return {canonical:manifest,aggregateVersion:version,changes:event?[]:changes};
 }
 private async withdraw(tx:PoolClient,p:PackageRow,event:DomainEvent):Promise<void>{
  if(p.content_hash==='WITHDRAWN')return;
  const fields=(await tx.query('SELECT id FROM offline_gis.field_projection WHERE tenant_id=$1 AND package_id=$2',[p.tenant_id,p.id])).rows;
  await this.sync.appendChanges(tx,p.tenant_id,[...fields.map(f=>({entityType:'OfflineGisField',entityId:f.id,op:'PURGE' as const,projection:{},visibleUserIds:[p.user_id]})),{entityType:'OfflineGisPackage',entityId:p.id,op:'PURGE',projection:{},visibleUserIds:[p.user_id]}]);
  const actor={tenantId:p.tenant_id,userId:p.user_id,deviceId:p.device_id,sessionId:p.session_id},locked=await this.row(tx,actor,p.id,true);
  if(locked?.version!==p.version)throw Error('OFFLINE_GIS_RETRY_CONCURRENT_SELECTION');
  const version=Number(p.version)+1,manifest={id:p.id,version,withdrawn:true};
  await tx.query('DELETE FROM offline_gis.field_projection WHERE tenant_id=$1 AND package_id=$2',[p.tenant_id,p.id]);
  await tx.query("UPDATE offline_gis.package SET version=$3,manifest=$4,content_hash='WITHDRAWN' WHERE tenant_id=$1 AND id=$2",[p.tenant_id,p.id,version,manifest]);
  await tx.query('INSERT INTO offline_gis.audit(tenant_id,package_id,version,actor_id,action,source_event_id,observed_at,before_value,after_value,provenance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[p.tenant_id,p.id,version,event.actorId,'WITHDRAW',event.id,event.occurredAt,p.manifest,manifest,{sourceEvent:event}]);
 }
 async consume(tx:PoolClient,event:DomainEvent):Promise<void>{if(!['farm','gis','land'].includes(event.source)||!event.tenantId)return;this.local();
  // Wait for a first/in-flight selection before taking the subscription snapshot.
  // Release this owned read-phase lock BEFORE the public sync port acquires its
  // feed clock; this preserves clock->head ordering and avoids an inverse lock.
  await tx.query('SAVEPOINT offline_subscription_read');
  await this.subscriptionGate(tx,event.tenantId);
  const packages=(await tx.query<PackageRow>('SELECT * FROM offline_gis.package WHERE tenant_id=$1 ORDER BY id',[event.tenantId])).rows;
  await tx.query('ROLLBACK TO SAVEPOINT offline_subscription_read');
  await tx.query('RELEASE SAVEPOINT offline_subscription_read');
  for(const p of packages){const actor={tenantId:p.tenant_id,userId:p.user_id,deviceId:p.device_id,sessionId:p.session_id};try{const scope=await this.registry.scope(actor);await this.build(tx,actor,p,p.selection,scope,undefined,event);}catch(e){if(!(e instanceof ForbiddenException)&&!/^FARM_FORBIDDEN|^GIS_FORBIDDEN|^OFFLINE_GIS_UNLICENSED_SOURCE/.test(String((e as Error).message)))throw e;await this.withdraw(tx,p,event);}}
 }
}
