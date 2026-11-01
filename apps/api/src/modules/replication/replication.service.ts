import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { IntegrationsRegistry, IntegrationActor } from '../integrations/integrations.registry';
import { ReplicationRegistry } from './replication.registry';
import { REPLICATION_POOL, ReplicationError } from './replication.types';
import type { ReplicaChange, ReplicaMessage } from './replication.types';
import { canonical, digest, identifier, signBody, validateChange, verifyBody } from './replication.validation';
@Injectable()
export class ReplicationService {
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<unknown> | undefined;
  private readonly logger = new Logger(ReplicationService.name);
  constructor(@Inject(REPLICATION_POOL) private readonly pool: Pool, private readonly registry: ReplicationRegistry, private readonly policy: IntegrationsRegistry) {}
  onModuleInit(): void {
    this.timer = setInterval(() => {
      if (this.running || process.env.AGRO_DEPLOYMENT_MODE !== 'LOCAL_PRIMARY') return;
      this.running = this.dispatchAvailable().catch(() => this.logger.error('Replication cycle failed; local backlog retained')).finally(() => { this.running = undefined; });
    },1000);
    this.timer.unref();
  }
  async onModuleDestroy(): Promise<void> { if (this.timer) clearInterval(this.timer); await this.running; await this.pool.end(); }
  private local(): void { if (process.env.AGRO_DEPLOYMENT_MODE !== 'LOCAL_PRIMARY') throw new ReplicationError('LOCAL_PRIMARY_REQUIRED'); }
  /** Owner application/outbox consumer transaction only. Caller owns commit/rollback. */
  async append(tx: PoolClient, input: ReplicaChange): Promise<string> {
    this.local(); validateChange(input);
    const change = JSON.parse(canonical(input)) as ReplicaChange;
    const hash = digest(change);
    // Reject accidental autocommit: sequence + content must share caller transaction.
    await tx.query('SAVEPOINT replication_append');
    await tx.query('INSERT INTO replication.local_clock(tenant_id) VALUES($1) ON CONFLICT DO NOTHING',[change.tenantId]);
    await tx.query('SELECT sequence FROM replication.local_clock WHERE tenant_id=$1 FOR UPDATE',[change.tenantId]);
    const prior = (await tx.query('SELECT sequence,hash FROM replication.local_outbox WHERE tenant_id=$1 AND event_id=$2',[change.tenantId,change.eventId])).rows[0];
    if (prior) { if (prior.hash !== hash) throw new ReplicationError('DUPLICATE_CONFLICT'); await tx.query('RELEASE SAVEPOINT replication_append'); return prior.sequence; }
    const clock = (await tx.query('UPDATE replication.local_clock SET sequence=sequence+1 WHERE tenant_id=$1 RETURNING sequence',[change.tenantId])).rows[0];
    await tx.query('INSERT INTO replication.local_outbox(tenant_id,sequence,event_id,change,hash) VALUES($1,$2,$3,$4,$5)',[change.tenantId,clock.sequence,change.eventId,change,hash]);
    await this.journal(tx,change.tenantId,clock.sequence,'STAGED',{hash,eventId:change.eventId});
    await tx.query('RELEASE SAVEPOINT replication_append');
    return clock.sequence;
  }
  private async journal(tx: PoolClient, tenantId: string, sequence: string, action: string, detail: unknown): Promise<void> {
    await tx.query('INSERT INTO replication.journal(tenant_id,sequence,action,detail) VALUES($1,$2,$3,$4)',[tenantId,sequence,action,detail]);
  }
  async status(actor: IntegrationActor): Promise<Record<string,unknown> | undefined> {
    const identity = {...actor};
    await this.policy.authorize(identity,'READ','replication');
    const row = (await this.pool.query(`SELECT c.sequence::text,c.ack_sequence::text,c.last_ack_at,c.binding,
      count(o.sequence)::int AS backlog_count,COALESCE(sum(octet_length(o.change::text)),0)::text AS backlog_bytes,
      min(o.created_at) AS oldest_unsent,EXTRACT(EPOCH FROM clock_timestamp()-min(o.created_at))::float AS lag_seconds,
      count(*) FILTER(WHERE o.state='DEAD_LETTER')::int AS dead_letters,
      (SELECT last_error FROM replication.local_outbox WHERE tenant_id=c.tenant_id AND sequence=c.ack_sequence+1) AS last_error
      FROM replication.local_clock c LEFT JOIN replication.local_outbox o ON o.tenant_id=c.tenant_id AND o.sequence>c.ack_sequence
      WHERE c.tenant_id=$1 GROUP BY c.tenant_id`,[identity.tenantId])).rows[0];
    const entry = this.registry.get(identity.tenantId);
    if (row && !entry?.transport) row.last_error = 'DESTINATION_UNCONFIGURED';
    else if (row?.binding && entry && canonical(row.binding) !== canonical({tenantId:identity.tenantId,siteId:entry.binding.siteId,installationId:entry.binding.installationId})) row.last_error = 'BINDING_CONFLICT';
    return row;
  }
  /** Explicit replay does not advance/checkpoint or drop poison data. Current permission + reason journal. */
  async replay(actor: IntegrationActor, reason: string): Promise<void> {
    this.local(); const identity = {...actor};
    if (!identifier(reason)) throw new ReplicationError('REPLAY_REASON_REQUIRED');
    await this.policy.authorize(identity,'REPLAY','replication');
    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');
      const clock = (await tx.query('SELECT ack_sequence FROM replication.local_clock WHERE tenant_id=$1 FOR UPDATE',[identity.tenantId])).rows[0];
      if (!clock) throw new ReplicationError('STREAM_NOT_FOUND');
      const seq = String(BigInt(clock.ack_sequence)+1n);
      const row = await tx.query("UPDATE replication.local_outbox SET state='PENDING',cycle_attempts=0,next_attempt_at=clock_timestamp(),last_error=NULL WHERE tenant_id=$1 AND sequence=$2 AND state='DEAD_LETTER' RETURNING sequence",[identity.tenantId,seq]);
      if (!row.rowCount) throw new ReplicationError('NOT_REPLAYABLE');
      await this.journal(tx,identity.tenantId,seq,'REPLAY',{subjectId:identity.subjectId,reason});
      await tx.query('COMMIT');
    } catch(error) { await tx.query('ROLLBACK').catch(()=>undefined); throw error; } finally { tx.release(); }
  }
  /** Controlled rebootstrap from complete retained history; no compaction/deletion exists. */
  async rebuild(actor: IntegrationActor, reason: string): Promise<void> {
    this.local(); const identity = {...actor};
    if (!identifier(reason)) throw new ReplicationError('REPLAY_REASON_REQUIRED');
    await this.policy.authorize(identity,'REPLAY','replication');
    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');
      // Serialize against the sender, including its network/ACK window.
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,24))',[identity.tenantId]);
      const clock = (await tx.query('SELECT sequence FROM replication.local_clock WHERE tenant_id=$1 FOR UPDATE',[identity.tenantId])).rows[0];
      if (!clock || clock.sequence === '0') throw new ReplicationError('STREAM_NOT_FOUND');
      await tx.query('UPDATE replication.local_clock SET ack_sequence=0,last_ack_at=NULL WHERE tenant_id=$1',[identity.tenantId]);
      await tx.query("UPDATE replication.local_outbox SET state='PENDING',cycle_attempts=0,next_attempt_at=clock_timestamp(),last_error=NULL,acked_at=NULL WHERE tenant_id=$1",[identity.tenantId]);
      await this.journal(tx,identity.tenantId,clock.sequence,'REBUILD',{subjectId:identity.subjectId,reason});
      await tx.query('COMMIT');
    } catch(error) { await tx.query('ROLLBACK').catch(()=>undefined); throw error; } finally { tx.release(); }
  }
  async dispatchAvailable(limit = 10): Promise<number> {
    this.local();
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw new ReplicationError('INVALID_LIMIT');
    const tenants = this.registry.activeTenants();
    if (!tenants.length) return 0;
    const rows = (await this.pool.query(`SELECT c.tenant_id FROM replication.local_clock c JOIN replication.local_outbox o ON o.tenant_id=c.tenant_id AND o.sequence=c.ack_sequence+1
      WHERE c.tenant_id=ANY($2::text[]) AND o.state<>'DEAD_LETTER' AND o.next_attempt_at<=clock_timestamp() AND c.next_send_at<=clock_timestamp() ORDER BY o.next_attempt_at,c.tenant_id LIMIT $1`,[limit,tenants])).rows;
    let delivered = 0;
    for (const row of rows) if (await this.deliver(row.tenant_id)) delivered++;
    return delivered;
  }
  private async deliver(tenantId: string): Promise<boolean> {
    const entry = this.registry.get(tenantId);
    if (!entry?.transport) return false;
    const {binding,transport} = entry;
    const tx = await this.pool.connect();
    let locked = false; let started = false; let row: any;
    try {
      // Session lock survives the short state transaction, but releases on process/DB loss.
      locked = (await tx.query('SELECT pg_try_advisory_lock(hashtextextended($1,24)) AS locked',[tenantId])).rows[0].locked;
      if (!locked) return false;
      await tx.query('BEGIN');
      const clock = (await tx.query('SELECT *,next_send_at<=clock_timestamp() AS send_due FROM replication.local_clock WHERE tenant_id=$1 FOR UPDATE',[tenantId])).rows[0];
      if (!clock || !clock.send_due) { await tx.query('COMMIT'); return false; }
      row = (await tx.query('SELECT *,next_attempt_at<=clock_timestamp() AS due FROM replication.local_outbox WHERE tenant_id=$1 AND sequence=$2 FOR UPDATE',[tenantId,String(BigInt(clock.ack_sequence)+1n)])).rows[0];
      if (!row || !row.due || row.state === 'DEAD_LETTER') { await tx.query('COMMIT'); return false; }
      const identity = {tenantId,siteId:binding.siteId,installationId:binding.installationId};
      if (clock.binding && canonical(clock.binding) !== canonical(identity)) throw new ReplicationError('BINDING_CONFLICT');
      await tx.query("UPDATE replication.local_clock SET binding=$2,next_send_at=clock_timestamp()+($3::int*interval '1 millisecond') WHERE tenant_id=$1",[tenantId,identity,binding.pollMs]);
      row = (await tx.query(`UPDATE replication.local_outbox SET state='SENDING',attempts=attempts+1,cycle_attempts=cycle_attempts+1,
        next_attempt_at=clock_timestamp()+($3::int*interval '1 millisecond') WHERE tenant_id=$1 AND sequence=$2 RETURNING *`,[tenantId,row.sequence,Math.max(binding.timeoutMs,binding.pollMs)])).rows[0];
      await this.journal(tx,tenantId,row.sequence,'SENDING',{attempt:row.attempts});
      await tx.query('COMMIT'); started = true;
      await this.policy.authorize({tenantId,subjectId:binding.subjectId},'EXECUTE','replication');
      validateChange(row.change);
      if (row.hash !== digest(row.change)) throw new ReplicationError('HASH_MISMATCH');
      const message: ReplicaMessage = {version:1,...identity,sequence:row.sequence,hash:row.hash,change:row.change};
      const controller = new AbortController(); let timer: NodeJS.Timeout | undefined;
      let raw;
      try {
        raw = await Promise.race([Promise.resolve().then(()=>transport.send(signBody('message',message,binding.key),controller.signal)),new Promise<never>((_,reject)=>{
          timer = setTimeout(()=>{ reject(new ReplicationError('TIMEOUT',true)); controller.abort(); },binding.timeoutMs);
        })]);
      } finally { if (timer) clearTimeout(timer); }
      const ack = verifyBody('ack',raw,binding.key);
      const expected = {version:1,...identity,sequence:row.sequence,eventId:row.event_id,hash:row.hash};
      if (canonical(ack) !== canonical(expected)) throw new ReplicationError('ACK_MISMATCH');
      // No payload/command from Cloud is ever executed; only exact delivery receipt metadata.
      await tx.query('BEGIN');
      const updated = await tx.query('UPDATE replication.local_clock SET ack_sequence=$2,last_ack_at=clock_timestamp() WHERE tenant_id=$1 AND ack_sequence=$3 RETURNING tenant_id',[tenantId,row.sequence,String(BigInt(row.sequence)-1n)]);
      if (!updated.rowCount) throw new ReplicationError('ACK_CONSISTENCY');
      await tx.query("UPDATE replication.local_outbox SET state='ACKED',acked_at=clock_timestamp(),last_error=NULL WHERE tenant_id=$1 AND sequence=$2",[tenantId,row.sequence]);
      await this.journal(tx,tenantId,row.sequence,'ACKED',{hash:row.hash});
      // Bound per-stream bandwidth even when invoked concurrently/repeatedly by operators.
      await tx.query(`UPDATE replication.local_outbox SET next_attempt_at=GREATEST(next_attempt_at,clock_timestamp()+($3::int*interval '1 millisecond')) WHERE tenant_id=$1 AND sequence=$2`,[tenantId,String(BigInt(row.sequence)+1n),binding.pollMs]);
      await tx.query('COMMIT');
      return true;
    } catch(error) {
      await tx.query('ROLLBACK').catch(()=>undefined);
      if (started) {
        const code = error instanceof ReplicationError ? error.code : 'UNAVAILABLE';
        const retry = !(error instanceof ReplicationError) || error.retryable;
        const dead = !retry || row.cycle_attempts >= binding.maxAttempts;
        const delay = Math.max(binding.pollMs,Math.min(300000,1000*2**Math.min(row.cycle_attempts-1,9)));
        await tx.query('BEGIN');
        await tx.query(`UPDATE replication.local_outbox SET state=$3,last_error=$4,next_attempt_at=clock_timestamp()+($5::int*interval '1 millisecond') WHERE tenant_id=$1 AND sequence=$2 AND state<>'ACKED'`,[tenantId,row.sequence,dead?'DEAD_LETTER':'RETRY_WAIT',code,delay]);
        await this.journal(tx,tenantId,row.sequence,dead?'DEAD_LETTER':'RETRY_WAIT',{code,attempt:row.attempts});
        await tx.query('COMMIT');
      } else throw error;
      return false;
    } finally {
      // A failed retry transaction must never leak into the next pool user.
      await tx.query('ROLLBACK').catch(()=>undefined);
      if (locked) await tx.query('SELECT pg_advisory_unlock(hashtextextended($1,24))',[tenantId]).catch(()=>undefined);
      tx.release();
    }
  }
}
