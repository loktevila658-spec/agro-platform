import type { Pool } from 'pg';
import { ReplicationRegistry } from './replication.registry';
import { ReplicationError } from './replication.types';
import type { ReplicaAck, ReplicaMessage, Signed } from './replication.types';
import { signBody, validateMessage, verifyBody } from './replication.validation';
/** Dedicated holding capability. No Local pool, domain repository, command or reverse port. */
export class ReplicationReceiver {
  constructor(private readonly pool: Pool, private readonly registry: ReplicationRegistry) {}
  async receive(signed: Signed<ReplicaMessage>): Promise<Signed<ReplicaAck>> {
    const entry = this.registry.get(signed?.body?.tenantId);
    if (!entry) throw new ReplicationError('AUTHENTICATION_FAILED');
    const message = verifyBody('message',signed,entry.binding.key);
    validateMessage(message);
    const {tenantId,siteId,installationId,sequence,hash,change} = message;
    if (siteId !== entry.binding.siteId || installationId !== entry.binding.installationId) throw new ReplicationError('AUTHENTICATION_FAILED');
    const args = [tenantId,siteId,installationId];
    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');
      await tx.query('INSERT INTO replication.cloud_stream(tenant_id,site_id,installation_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',args);
      const stream = (await tx.query('SELECT sequence FROM replication.cloud_stream WHERE tenant_id=$1 AND site_id=$2 AND installation_id=$3 FOR UPDATE',args)).rows[0];
      const old = (await tx.query('SELECT event_id,hash,sequence FROM replication.cloud_history WHERE tenant_id=$1 AND site_id=$2 AND installation_id=$3 AND (sequence=$4 OR event_id=$5)',[...args,sequence,change.eventId])).rows;
      if (old.length) {
        if (old.length !== 1 || old[0].event_id !== change.eventId || old[0].hash !== hash || old[0].sequence !== sequence) throw new ReplicationError('DUPLICATE_CONFLICT');
      } else {
        if (BigInt(sequence) !== BigInt(stream.sequence) + 1n) throw new ReplicationError('SEQUENCE_GAP',true);
        const current = (await tx.query('SELECT revision,event_id FROM replication.cloud_read_model WHERE tenant_id=$1 AND site_id=$2 AND installation_id=$3 AND aggregate_type=$4 AND aggregate_id=$5',[...args,change.aggregateType,change.aggregateId])).rows[0];
        if ((current && (change.operation === 'UPSERT' || BigInt(change.revision) <= BigInt(current.revision))) || (change.operation !== 'UPSERT' && current?.event_id !== change.supersedes)) throw new ReplicationError('REVISION_CONFLICT');
        await tx.query('INSERT INTO replication.cloud_history(tenant_id,site_id,installation_id,sequence,event_id,hash,change) VALUES($1,$2,$3,$4,$5,$6,$7)',[...args,sequence,change.eventId,hash,change]);
        await tx.query(`INSERT INTO replication.cloud_read_model(tenant_id,site_id,installation_id,aggregate_type,aggregate_id,revision,event_id,tombstone,change) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT(tenant_id,site_id,installation_id,aggregate_type,aggregate_id) DO UPDATE SET revision=EXCLUDED.revision,event_id=EXCLUDED.event_id,tombstone=EXCLUDED.tombstone,change=EXCLUDED.change`,[...args,change.aggregateType,change.aggregateId,change.revision,change.eventId,change.operation === 'TOMBSTONE',change]);
        await tx.query('UPDATE replication.cloud_stream SET sequence=$4,last_received_at=clock_timestamp() WHERE tenant_id=$1 AND site_id=$2 AND installation_id=$3',[...args,sequence]);
      }
      await tx.query('COMMIT');
      return signBody('ack',{version:1,tenantId,siteId,installationId,sequence,eventId:change.eventId,hash},entry.binding.key);
    } catch(error) { await tx.query('ROLLBACK').catch(()=>undefined); throw error; }
    finally { tx.release(); }
  }
}
