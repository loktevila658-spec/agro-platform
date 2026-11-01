import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { DomainEvent, EventHandler } from '../events/events.types';
import { ReplicationError } from './replication.types';
import { ReplicationService } from './replication.service';
const created: Readonly<Record<string,string>> = Object.freeze({'org.tenant.created':'tenant','org.organization.created':'organization','org.unit.created':'organization_unit','org.site.created':'site'});
@Injectable()
export class ReplicationConsumer implements EventHandler {
  readonly name = 'local-cloud-replication-v1';
  constructor(private readonly replication: ReplicationService) {}
  async handle(tx: PoolClient, event: DomainEvent): Promise<void> {
    if (process.env.AGRO_DEPLOYMENT_MODE !== 'LOCAL_PRIMARY') return;
    const type = created[event.eventName];
    if (event.source !== 'org' || event.producer !== 'org' || !type) return;
    const reject = (code: string): never => { const error = new ReplicationError(code); error.name = code; throw error; };
    if (event.eventVersion !== '1.0.0') reject('ORG_REPLICA_VERSION_UNSUPPORTED');
    // Catalog is metadata-only. Never export a raw row, identity/security payload or guessed snapshot.
    const p = event.payload;
    const metadata = {eventId:event.id,entityId:event.entityId,entityType:type,tenantId:event.tenantId,actorId:event.actorId,correlationId:event.correlationId,causationId:event.causationId,occurredAt:event.occurredAt.toISOString()};
    if (Object.keys(p).sort().join(',') !== Object.keys(metadata).sort().join(',') || Object.entries(metadata).some(([k,v])=>p[k] !== v)) reject('ORG_REPLICA_CATALOG_MISMATCH');
    await this.replication.append(tx,{version:1,tenantId:event.tenantId!,eventId:event.id,aggregateType:`org.${type}`,aggregateId:event.entityId,revision:'1',operation:'UPSERT',supersedes:null,
      payload:metadata,provenance:{owner:'org',sourceEventId:event.id,actorId:event.actorId!,correlationId:event.correlationId!,causationId:event.causationId!,occurredAt:event.occurredAt.toISOString(),evidence:{eventName:event.eventName,eventVersion:event.eventVersion,producer:event.producer}},objectRefs:[]});
  }
}
