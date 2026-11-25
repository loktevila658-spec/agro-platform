import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { FarmService } from '../farm/farm.service';
import { TasksService } from '../tasks/tasks.service';
import { SyncConflict, type SyncActor, type SyncCommand, type SyncChange } from '../sync/sync.types';
import { ScoutingRegistry } from './scouting.registry';
import { SCOUTING_COMMANDS, type ScoutingAction, type ObservationRow } from './scouting.types';
import { fail, id, keys, text, timestamp, uuidv7, V7, validateObservation } from './scouting.validation';
export const SCOUTING_POOL=Symbol('SCOUTING_POOL');
export function projection(r:ObservationRow):Record<string,unknown>{return {id:r.id,organizationId:r.organization_id,fieldSeasonId:r.field_season_id,version:Number(r.version),revisionId:r.current_revision_id,data:r.data,attachments:r.provenance.attachments??[],sourceReferences:r.source_refs,authorId:r.author_id,actorId:r.actor_id,observedAt:new Date(r.observed_at).toISOString(),receivedAt:new Date(r.recorded_at).toISOString(),...(r.task_id?{taskId:r.task_id}:{})};}
@Injectable()
export class ScoutingService implements OnModuleDestroy {
 constructor(@Inject(SCOUTING_POOL)readonly pool:Pool,readonly registry:ScoutingRegistry,private readonly farm:FarmService,private readonly tasks:TasksService){}
 async onModuleDestroy(){await this.pool.end();}
 async reference(tx:PoolClient,a:{tenantId:string;subjectId:string},field:string){try{return await this.farm.scoutingReferenceInTransaction(tx,a,field);}catch(e){const m=e instanceof Error?e.message:'';if(m.startsWith('FARM_')){if(m.includes('FORBIDDEN'))throw new ForbiddenException('SCOUTING_OWNER_FORBIDDEN');throw new BadRequestException('SCOUTING_CONTEXT_UNAVAILABLE');}throw e;}}
 async row(tx:Pool|PoolClient,a:SyncActor,key:string,lock=false):Promise<ObservationRow|undefined>{id(key);return(await tx.query<ObservationRow>(`SELECT h.*,r.data,r.source_refs,r.author_id,r.actor_id,r.observed_at,r.recorded_at,r.provenance FROM scouting.observation h JOIN scouting.revision r ON r.tenant_id=h.tenant_id AND r.id=h.current_revision_id WHERE h.tenant_id=$1 AND h.id=$2${lock?' FOR UPDATE OF h':''}`,[a.tenantId,key])).rows[0];}
 action(c:SyncCommand):ScoutingAction{const a=c.type.slice(9) as ScoutingAction;if(!SCOUTING_COMMANDS.includes(a)||c.type!==`Scouting.${a}`||c.commandVersion!==1||c.aggregate.type!==(a==='Capture'?'ScoutingCapture':'Observation')||!V7.test(c.aggregate.id))fail();return a;}
 async authorize(tx:PoolClient,a:SyncActor,c:SyncCommand){const action=this.action(c);if(action==='Capture'){const d=validateObservation(c.payload.data);return c.aggregate.id===d.fieldSeasonId&&(await this.registry.scopes(a)).some(s=>s.fieldSeasonId===d.fieldSeasonId&&s.organizationId===d.organizationId)&&await this.registry.can(a,'scouting.capture',d.organizationId);}const r=await this.row(tx,a,c.aggregate.id);return !!r&&await this.registry.can(a,action==='Correct'?'scouting.correct':'scouting.create-work',r.organization_id);}
 async assertVersion(tx:PoolClient,a:SyncActor,c:SyncCommand){if(this.action(c)==='Capture')return c.baseVersion===0;const r=await this.row(tx,a,c.aggregate.id,true);return !!r&&Number(r.version)===c.baseVersion;}
 async current(tx:PoolClient,a:SyncActor,c:SyncCommand){const r=this.action(c)==='Capture'?undefined:await this.row(tx,a,c.aggregate.id);return r?projection(r):{};}
 async apply(tx:PoolClient,a:SyncActor,c:SyncCommand):Promise<{canonical:Record<string,unknown>;aggregateVersion:number;changes:SyncChange[]}>{
 if(process.env.AGRO_DEPLOYMENT_MODE!=='LOCAL_PRIMARY')throw new ForbiddenException('LOCAL_PRIMARY_REQUIRED');
 const action=this.action(c);keys(c.payload,['reason',...(action==='CreateWork'?['task']:['data'])]);text(c.payload.reason);if(!timestamp(c.observedAt))fail();
 if(action!=='Capture'&&c.offlineAuthId!=='online')throw new ForbiddenException('SCOUTING_ONLINE_ONLY');
 const before=action==='Capture'?undefined:await this.row(tx,a,c.aggregate.id,true);
 if(!await this.authorize(tx,a,c))throw new ForbiddenException('SCOUTING_FORBIDDEN');
 if(!await this.assertVersion(tx,a,c))throw new SyncConflict('VERSION_CONFLICT',before?projection(before):{});
 const key=before?.id??c.localCommandId,rid=uuidv7(),v=before?String(BigInt(before.version)+1n):'1';
 let d=before?.data,refs=before?.source_refs,taskId=before?.task_id??null,changes:SyncChange[]=[];
 if(action!=='CreateWork'){
 d=validateObservation(c.payload.data);if(before&&(d.organizationId!==before.organization_id||d.fieldSeasonId!==before.field_season_id))fail();
 const fieldSeason=await this.reference(tx,{tenantId:a.tenantId,subjectId:a.userId},d.fieldSeasonId);
 if(fieldSeason.organizationId!==d.organizationId)fail();await this.registry.form(a,d.form);
 refs={fieldSeason,observer:await this.registry.observer(tx,a,d.organizationId)};
 }else{
 if(!before!.data.anomaly||taskId)throw new SyncConflict('STATE_CONFLICT',projection(before!));
 if(c.attachments.length)fail();keys(c.payload.task,['operationTypeId','priority','plannedStart','plannedEnd','plannedQty','uom']);
 const result=await this.tasks.apply(tx,a,{...c,type:'Task.Create',aggregate:{type:'Task',id:uuidv7()},baseVersion:0,payload:{...c.payload.task,targetType:'FIELD_SEASON',targetId:before!.field_season_id},provenance:{...c.provenance,sourceObservation:{id:key,revisionId:before!.current_revision_id,fieldSeasonId:before!.field_season_id}},attachments:[]});
 if(result.canonical.status!=='DRAFT'||typeof result.canonical.id!=='string')throw Error('SCOUTING_TASK_CONFIRMATION_REQUIRED');
 taskId=result.canonical.id;changes=result.changes;
 }
 const evidence=c.attachments.map(x=>{if(x.required||!['PHOTO','VOICE'].includes(x.evidenceType)||(x.evidenceType==='PHOTO'&&!['image/jpeg','image/png'].includes(x.mime))||(x.evidenceType==='VOICE'&&!['audio/mpeg','audio/mp4'].includes(x.mime)))fail();return structuredClone(x);});
 // Metadata retains immutable staged references even when upload is pending or rejected.
 // SyncFiles alone binds usable remote references after content/hash/malware checks.
 const provenance={deviceId:a.deviceId,sessionId:a.sessionId,offlineAuthId:c.offlineAuthId,intent:c.provenance,attachments:action==='Capture'?evidence:[...((before!.provenance.attachments??[]) as unknown[]),...evidence]};
 if((provenance.attachments as unknown[]).length>100)fail();
 const observedAt=action==='CreateWork'?new Date(before!.observed_at).toISOString():c.observedAt,author=action==='Capture'?a.userId:before!.author_id;
 if(before)await tx.query('UPDATE scouting.observation SET version=$3,current_revision_id=$4,task_id=$5 WHERE tenant_id=$1 AND id=$2',[a.tenantId,key,v,rid,taskId]);
 else await tx.query('INSERT INTO scouting.observation(tenant_id,id,organization_id,field_season_id,version,current_revision_id) VALUES($1,$2,$3,$4,$5,$6)',[a.tenantId,key,d!.organizationId,d!.fieldSeasonId,v,rid]);
 const inserted=await tx.query('INSERT INTO scouting.revision(tenant_id,observation_id,id,version,previous_revision_id,data,source_refs,provenance,author_id,actor_id,observed_at,reason,action,command_id,task_id,geom) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CASE WHEN $16::double precision IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($16,$17),4326)::geography END) RETURNING recorded_at',[a.tenantId,key,rid,v,before?.current_revision_id??null,d,refs,provenance,author,a.userId,observedAt,c.payload.reason,action,c.localCommandId,taskId,d!.location?.longitude??null,d!.location?.latitude??null]);
 const canonical=projection({tenant_id:a.tenantId,id:key,organization_id:d!.organizationId,field_season_id:d!.fieldSeasonId,version:v,current_revision_id:rid,task_id:taskId,data:d!,source_refs:refs!,author_id:author,actor_id:a.userId,observed_at:observedAt,recorded_at:inserted.rows[0].recorded_at,provenance});
 const correlation=typeof c.provenance.correlationId==='string'?c.provenance.correlationId:c.localCommandId;text(correlation,128);
 await tx.query('INSERT INTO scouting.audit(id,tenant_id,observation_id,revision_id,action,actor_id,before_value,after_value,reason,command_id,correlation_id,causation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[randomUUID(),a.tenantId,key,rid,action,a.userId,before?projection(before):null,canonical,c.payload.reason,c.localCommandId,correlation,c.localCommandId]);
 const eventId=randomUUID(),occurredAt=new Date().toISOString(),payload={eventId,entityId:key,revisionId:rid,revision:v,tenantId:a.tenantId,actorId:a.userId,correlationId:correlation,causationId:c.localCommandId,occurredAt};
 await tx.query("INSERT INTO scouting.outbox_event(id,tenant_id,event_name,event_version,producer,entity_id,actor_id,correlation_id,causation_id,occurred_at,payload) VALUES($1,$2,'scouting.observation.changed','1.0.0','scouting',$3,$4,$5,$6,$7,$8)",[eventId,a.tenantId,key,a.userId,correlation,c.localCommandId,occurredAt,payload]);
 return {canonical,aggregateVersion:Number(v),changes:[...changes,{entityType:'Observation',entityId:key,entityVersion:Number(v),op:'UPSERT',projection:canonical,visibleUserIds:[...new Set([a.userId,author])]}]};
 }
 async read(a:SyncActor,key:string){const r=await this.row(this.pool,a,key);if(!r||!await this.registry.can(a,'scouting.read',r.organization_id))throw new NotFoundException('SCOUTING_NOT_AVAILABLE');return projection(r);}
 async list(a:SyncActor,org:string,after?:string){id(org);if(after!==undefined)id(after);if(!await this.registry.can(a,'scouting.read',org))throw new ForbiddenException('SCOUTING_FORBIDDEN');const rows=await this.pool.query('SELECT id FROM scouting.observation WHERE tenant_id=$1 AND organization_id=$2 AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT 100',[a.tenantId,org,after??null]);return Promise.all(rows.rows.map(r=>this.read(a,r.id)));}
 async history(a:SyncActor,key:string){await this.read(a,key);return(await this.pool.query('SELECT id AS "revisionId",version,previous_revision_id AS "previousRevisionId",data,source_refs AS "sourceReferences",provenance,author_id AS "authorId",actor_id AS "actorId",observed_at AS "observedAt",recorded_at AS "receivedAt",reason,action,task_id AS "taskId" FROM scouting.revision WHERE tenant_id=$1 AND observation_id=$2 ORDER BY version',[a.tenantId,key])).rows.map(r=>{if(r.previousRevisionId===null)delete r.previousRevisionId;if(r.taskId===null)delete r.taskId;return r;});}
 async contexts(a:SyncActor){const tx=await this.pool.connect();try{await tx.query('BEGIN');const result=[];for(const s of await this.registry.scopes(a)){if(!await this.registry.can(a,'scouting.capture',s.organizationId))continue;const ref=await this.reference(tx,{tenantId:a.tenantId,subjectId:a.userId},s.fieldSeasonId);if(ref.organizationId!==s.organizationId)fail();if(ref.geometryProvenance===null)delete ref.geometryProvenance;result.push({...s,...ref});}await tx.query('COMMIT');return result;}catch(e){await tx.query('ROLLBACK').catch(()=>undefined);throw e;}finally{tx.release();}}
}
