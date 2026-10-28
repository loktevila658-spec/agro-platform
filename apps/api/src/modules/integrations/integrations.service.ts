import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { ConnectorError, fingerprint, mapRecord, retryDelay, validatePolicy } from '../../../../../packages/connectors/src/index.cjs';
import type { Context, Envelope, Profile, Submission } from '../../../../../packages/connectors/src/index.cjs';
import { IntegrationsRegistry, IntegrationActor } from './integrations.registry';
export const INTEGRATIONS_POOL=Symbol('INTEGRATIONS_POOL');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const text=(s:unknown):s is string=>typeof s==='string'&&s.length>0&&s.length<=500;
interface Job { tenant_id:string; id:string; envelope:Envelope; actor:IntegrationActor; state:string; attempts:number; cycle_attempts:number; unknown_outcome:boolean; result:Record<string,unknown>|null; due:boolean; }
@Injectable()
export class IntegrationsService implements OnModuleInit,OnModuleDestroy {
 private timer:NodeJS.Timeout|undefined;
 private running:Promise<unknown>|undefined;
 private readonly logger=new Logger(IntegrationsService.name);
 constructor(@Inject(INTEGRATIONS_POOL) private readonly pool:Pool,private readonly registry:IntegrationsRegistry) {}
 onModuleInit():void {
  this.timer=setInterval(()=>{
   if(this.running||!this.registry.active())return;
   this.running=this.dispatchAvailable().catch(()=>this.logger.error('Integration dispatch failed')).finally(()=>{this.running=undefined;});
  },1000); this.timer.unref();
 }
 async onModuleDestroy():Promise<void> { if(this.timer)clearInterval(this.timer); await this.running; await this.pool.end(); }
 private local():void { if(process.env.AGRO_DEPLOYMENT_MODE!=='LOCAL_PRIMARY')throw Error('LOCAL_PRIMARY_REQUIRED'); }
 private async transaction<T>(fn:(tx:PoolClient)=>Promise<T>):Promise<T> {
  const tx=await this.pool.connect();
  try { await tx.query('BEGIN'); const result=await fn(tx); await tx.query('COMMIT'); return result; }
  catch(error) { await tx.query('ROLLBACK').catch(()=>undefined);throw error; } finally {tx.release();}
 }
 private async journal(tx:PoolClient,actor:IntegrationActor,id:string|null,action:string,detail:unknown={}):Promise<void> {
  await tx.query('INSERT INTO integrations.audit_entry(tenant_id,job_id,actor,action,detail) VALUES($1,$2,$3,$4,$5)',[actor.tenantId,id,actor,action,detail]);
  if(id)await tx.query('INSERT INTO integrations.outbox(tenant_id,job_id,state) VALUES($1,$2,$3)',[actor.tenantId,id,action]);
 }
 async configure(actor:IntegrationActor,profile:Profile):Promise<void> {
  this.local(); await this.registry.authorize(actor,'CONFIGURE',profile.id);
  if(!text(profile.id)||!text(profile.adapter)||!text(profile.schemaVersion)||!Number.isSafeInteger(profile.version)||profile.version<1)throw Error('INVALID_PROFILE');
  validatePolicy(profile.retry); this.registry.adapter(profile.adapter);
  // Validate mapping syntax even when source values are optional/missing.
  mapRecord({},profile.mapping.map(rule=>({...rule,required:false})));
  await this.transaction(async tx=>{
   const inserted=await tx.query('INSERT INTO integrations.profile(tenant_id,id,version,config) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',[actor.tenantId,profile.id,profile.version,profile]);
   if(!inserted.rowCount) {
    const old=await tx.query('SELECT config FROM integrations.profile WHERE tenant_id=$1 AND id=$2 AND version=$3',[actor.tenantId,profile.id,profile.version]);
    if(fingerprint(old.rows[0].config)!==fingerprint(profile))throw Error('PROFILE_VERSION_IMMUTABLE');
    return;
   }
   await this.journal(tx,actor,null,'PROFILE_CONFIGURED',{profileId:profile.id,version:profile.version});
  });
 }
 private async profile(tx:Pool|PoolClient,e:Envelope):Promise<Profile> {
  const result=await tx.query('SELECT config FROM integrations.profile WHERE tenant_id=$1 AND id=$2 AND version=$3',[e.tenantId,e.profileId,e.profileVersion]);
  if(!result.rowCount)throw Error('PROFILE_NOT_FOUND');return result.rows[0].config as Profile;
 }
 async stage(actor:IntegrationActor,envelope:Envelope):Promise<string> {
  this.local(); await this.registry.authorize(actor,'STAGE',envelope.profileId);
  if(envelope.tenantId!==actor.tenantId||!uuid.test(envelope.id)||!['INBOUND','OUTBOUND'].includes(envelope.direction)||
   !text(envelope.idempotencyKey)||!text(envelope.operation)||!text(envelope.entityType)||!text(envelope.localId)||
   !text(envelope.correlationId)||!text(envelope.schemaVersion)||!Number.isFinite(Date.parse(envelope.observedAt))||
   !envelope.payload||Array.isArray(envelope.payload)||typeof envelope.payload!=='object'||
   !envelope.provenance||Array.isArray(envelope.provenance)||typeof envelope.provenance!=='object'||
   (envelope.direction==='INBOUND'&&!text(envelope.externalId))||Buffer.byteLength(JSON.stringify(envelope))>1048576)throw Error('INVALID_ENVELOPE');
  const hash=fingerprint(envelope);
  return this.transaction(async tx=>{
   await this.profile(tx,envelope);
   const inserted=await tx.query(`INSERT INTO integrations.job(tenant_id,id,profile_id,profile_version,direction,idempotency_key,envelope,fingerprint,actor)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING id`,[actor.tenantId,envelope.id,envelope.profileId,envelope.profileVersion,envelope.direction,envelope.idempotencyKey,envelope,hash,actor]);
   if(!inserted.rowCount) {
    const previous=await tx.query('SELECT id,fingerprint FROM integrations.job WHERE tenant_id=$1 AND profile_id=$2 AND direction=$3 AND idempotency_key=$4',[actor.tenantId,envelope.profileId,envelope.direction,envelope.idempotencyKey]);
    if(previous.rows[0]?.fingerprint!==hash)throw Error('IDEMPOTENCY_CONFLICT');
    return previous.rows[0].id as string;
   }
   await this.journal(tx,actor,envelope.id,'STAGED',{hash,observedAt:envelope.observedAt});return envelope.id;
  });
 }
 async inspect(actor:IntegrationActor,id:string,profileId:string):Promise<Record<string,unknown>|undefined> {
  await this.registry.authorize(actor,'READ',profileId);
  const result=await this.pool.query('SELECT id,state,attempts,next_attempt_at,last_error,result FROM integrations.job WHERE tenant_id=$1 AND id=$2 AND profile_id=$3',[actor.tenantId,id,profileId]); return result.rows[0];
 }
 async replay(actor:IntegrationActor,id:string,profileId:string,reason:string):Promise<void> {
  this.local(); await this.registry.authorize(actor,'REPLAY',profileId); if(!text(reason))throw Error('REPLAY_REASON_REQUIRED');
  await this.transaction(async tx=>{
   const r=await tx.query(`UPDATE integrations.job SET state='QUEUED',cycle_attempts=0,next_attempt_at=clock_timestamp(),last_error=NULL
    WHERE tenant_id=$1 AND id=$2 AND profile_id=$3 AND state IN ('DEAD_LETTER','ACTION_REQUIRED') RETURNING id`,[actor.tenantId,id,profileId]);
   if(!r.rowCount)throw Error('NOT_REPLAYABLE');await this.journal(tx,actor,id,'REPLAY',{reason});
  });
 }
 async dispatchAvailable(limit=50):Promise<number> {
  this.local(); if(!Number.isSafeInteger(limit)||limit<1||limit>500)throw Error('INVALID_LIMIT');
  const jobs=await this.pool.query(`SELECT tenant_id,id FROM integrations.job WHERE state IN ('QUEUED','RETRYING','SENDING','SENT') AND next_attempt_at<=clock_timestamp() ORDER BY next_attempt_at,id LIMIT $1`,[limit]);
  let count=0;
  for(const row of jobs.rows) if(await this.process(row.tenant_id,row.id))count++;
  return count;
 }
 private async attempt(tx:PoolClient,job:Job,phase:string,outcome:string):Promise<void> {
  await tx.query('INSERT INTO integrations.attempt(tenant_id,job_id,number,phase,outcome) VALUES($1,$2,$3,$4,$5)',[job.tenant_id,job.id,job.attempts,phase,outcome]);
 }
 private async link(tx:PoolClient,job:Job,externalId:string):Promise<void> {
  const e=job.envelope;
  if(!text(externalId))throw new ConnectorError('EXTERNAL_ID_MISSING');
  // Serialize link revision allocation independently of job concurrency.
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([e.tenantId,e.profileId,e.entityType,externalId])]);
  await tx.query('INSERT INTO integrations.external_link(tenant_id,profile_id,entity_type,external_id,local_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[e.tenantId,e.profileId,e.entityType,externalId,e.localId]);
  const found=await tx.query('SELECT local_id FROM integrations.external_link WHERE tenant_id=$1 AND profile_id=$2 AND entity_type=$3 AND external_id=$4',[e.tenantId,e.profileId,e.entityType,externalId]);
  if(found.rows[0]?.local_id!==e.localId)throw new ConnectorError('EXTERNAL_ID_CONFLICT');
  await tx.query(`INSERT INTO integrations.link_revision(tenant_id,profile_id,entity_type,external_id,revision,job_id,provenance)
   SELECT $1,$2,$3,$4,COALESCE(MAX(revision),0)+1,$5,$6 FROM integrations.link_revision WHERE tenant_id=$1 AND profile_id=$2 AND entity_type=$3 AND external_id=$4`,[e.tenantId,e.profileId,e.entityType,externalId,e.id,{...e.provenance,observedAt:e.observedAt,profileVersion:e.profileVersion,correlationId:e.correlationId}]);
 }
 private async bounded<T>(ms:number,fn:(signal:AbortSignal)=>Promise<T>):Promise<T> {
  const controller=new AbortController(); let timer:NodeJS.Timeout|undefined;
  try {return await Promise.race([fn(controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ConnectorError('TIMEOUT'));},ms);})]);}
  finally {if(timer)clearTimeout(timer);}
 }
 private async process(tenantId:string,id:string):Promise<boolean> {
  const tx=await this.pool.connect(); const lock=JSON.stringify([tenantId,id]); let locked=false; let started=false; let job:Job|undefined; let profile:Profile|undefined;
  try {
   locked=(await tx.query('SELECT pg_try_advisory_lock(hashtextextended($1,1)) AS locked',[lock])).rows[0].locked;
   if(!locked)return false;
   const found=await tx.query<Job>(`SELECT *,next_attempt_at<=clock_timestamp() AS due FROM integrations.job WHERE tenant_id=$1 AND id=$2`,[tenantId,id]);
   job=found.rows[0]; if(!job||!job.due||!['QUEUED','RETRYING','SENDING','SENT'].includes(job.state))return false;
   profile=await this.profile(tx,job.envelope);
   await this.registry.authorize(job.actor,'EXECUTE',job.envelope.profileId);
   const adapter=this.registry.adapter(profile.adapter); const e=job.envelope;
   const mustReconcile=job.unknown_outcome||job.state==='SENDING'||job.state==='SENT';
   await tx.query('BEGIN');
   const updated=await tx.query(`UPDATE integrations.job SET state='SENDING',attempts=attempts+1,cycle_attempts=cycle_attempts+1,unknown_outcome=$3 WHERE tenant_id=$1 AND id=$2 RETURNING attempts,cycle_attempts`,[tenantId,id,e.direction==='OUTBOUND']);
   job={...job,...updated.rows[0]} as Job;
   await this.attempt(tx,job,'START','SENDING');await tx.query('COMMIT');started=true;
   // Mapping/schema/owner checks happen after durable staging, before any canonical effect.
   if(e.schemaVersion!==profile.schemaVersion)throw new ConnectorError('SCHEMA_CHANGED');
   const mapped=mapRecord(e.payload,profile.mapping);
   await this.bounded(profile.retry.timeoutMs,()=>adapter.validate(mapped,e.schemaVersion));
   let result:Record<string,unknown>; let externalId=e.externalId; let state='ACCEPTED';
   if(e.direction==='INBOUND') {
    await tx.query('BEGIN');
    await this.registry.authorize(job.actor,'EXECUTE',e.profileId);
    const owner=this.registry.command(e.operation);
    await owner.validate(tx,job.actor,e,mapped);
    result=await owner.execute(tx,job.actor,e,mapped);
   } else {
    const context=(signal:AbortSignal):Context=>({tenantId,profileId:e.profileId,jobId:id,idempotencyKey:e.idempotencyKey,correlationId:e.correlationId,signal});
    let submission:Submission|{status:'NOT_FOUND'|'UNKNOWN'}|undefined;
    if(mustReconcile)submission=await this.bounded(profile.retry.timeoutMs,signal=>adapter.reconcile(context(signal)));
    if(submission?.status==='UNKNOWN')throw new ConnectorError('TIMEOUT');
    if(!submission||submission.status==='NOT_FOUND') {
     if(job.cycle_attempts>profile.retry.maxAttempts)throw new ConnectorError('RETRIES_EXHAUSTED');
     await this.registry.authorize(job.actor,'EXECUTE',e.profileId);
     submission=await this.bounded(profile.retry.timeoutMs,signal=>adapter.submit(mapped,context(signal)));
    }
    if(submission.status!=='ACCEPTED'&&submission.status!=='SENT')throw new ConnectorError('SCHEMA_CHANGED');
    const accepted=submission as Submission;
    externalId=accepted.externalId;state=accepted.status;result={status:state,externalId,metadata:accepted.metadata};
    await tx.query('BEGIN');
   }
   if(state==='ACCEPTED')await this.link(tx,job,externalId);
   await tx.query(`UPDATE integrations.job SET state=$3,result=$4,unknown_outcome=$5,last_error=NULL,next_attempt_at=clock_timestamp()+($6::bigint*interval '1 millisecond') WHERE tenant_id=$1 AND id=$2`,[tenantId,id,state,result,state==='SENT',profile.retry.baseDelayMs]);
   await this.attempt(tx,job,'END',state);await this.journal(tx,job.actor,id,state,{externalId});await tx.query('COMMIT');return true;
  } catch(error) {
   await tx.query('ROLLBACK').catch(()=>undefined);
   if(!job||!profile)throw error;
   const known=error instanceof ConnectorError;
   const code=known?error.code:error instanceof Error&&error.message==='INTEGRATION_FORBIDDEN'?'FORBIDDEN':'COMMAND_OR_ADAPTER_ERROR';
   const exhausted=job.cycle_attempts>=profile.retry.maxAttempts;
   const state=code==='SCHEMA_CHANGED'||exhausted?'DEAD_LETTER':known&&error.retryable?'RETRYING':'ACTION_REQUIRED';
   const delay=state==='RETRYING'?retryDelay(profile.retry,Math.max(job.cycle_attempts,1),Math.random(),known?error.retryAfterMs:undefined):0;
   await tx.query('BEGIN');
   await tx.query(`UPDATE integrations.job SET state=$3,last_error=$4,next_attempt_at=clock_timestamp()+($5::bigint*interval '1 millisecond') WHERE tenant_id=$1 AND id=$2`,[tenantId,id,state,code,delay]);
   if(started)await this.attempt(tx,job,'END',state);
   // START may not exist when authorization failed before attempt allocation.
   await this.journal(tx,job.actor,id,state,{code});
   await tx.query('COMMIT');return false;
  } finally {
   let discard=false;
   if(locked) { try { await tx.query('SELECT pg_advisory_unlock(hashtextextended($1,1))',[lock]); } catch { discard=true; } }
   tx.release(discard);
  }
 }
}
