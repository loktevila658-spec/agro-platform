import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { MasterDataService } from '../master-data/master-data.service';
import { IdentityTagsRegistry } from './identity-tags.registry';
import { decodePayload, encodePayload, strictObject } from './identity-tags.payload';
import type { TagActor, TagContext, TagIdentity, TagResolution } from './identity-tags.types';
export const TAGS_POOL = Symbol('TAGS_POOL');
function uuidv7(): string {
  const b = randomBytes(16); b.writeUIntBE(Date.now(), 0, 6); b[6] = (b[6]! & 15) | 112; b[8] = (b[8]! & 63) | 128;
  const h = b.toString('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
@Injectable()
export class IdentityTagsService implements OnModuleDestroy {
  constructor(@Inject(TAGS_POOL) private readonly pool: Pool, readonly registry: IdentityTagsRegistry, private readonly master: MasterDataService) {}
  async onModuleDestroy(): Promise<void> { await this.pool.end(); }
  private local(): void { if (process.env.AGRO_DEPLOYMENT_MODE !== 'LOCAL_PRIMARY') throw new ForbiddenException('LOCAL_PRIMARY_REQUIRED'); }
  private async projection(actor: TagActor, ref: TagIdentity): Promise<TagResolution> {
    try {
      const entity = await this.master.read(actor, 'Material', ref.entityId);
      if (entity.active !== true) return {...ref, status: 'UNAVAILABLE'};
      return {...ref, status: 'RESOLVED', name: String(entity.name), code: String(entity.code), active: true};
    } catch (error) {
      // Same result for absent and foreign-tenant IDs; never swallow policy errors.
      if (error instanceof Error && error.message === 'MASTER_DATA_NOT_FOUND') return {...ref, status: 'UNAVAILABLE'};
      if (error instanceof Error && error.message === 'MASTER_DATA_FORBIDDEN') throw new ForbiddenException('QR_FORBIDDEN');
      throw error;
    }
  }
  async resolve(actor: TagActor, body: unknown): Promise<TagResolution> {
    this.local(); await this.registry.authorize(actor, 'identity-tags.resolve');
    strictObject(body, ['payload']); const ref = decodePayload(body.payload);
    const result = await this.projection(actor, ref);
    await this.registry.authorize(actor, 'identity-tags.resolve');
    return result;
  }
  async issue(actor: TagActor, body: unknown, context: TagContext): Promise<{qrCodeId: string; payload: string; version: 1}> {
    this.local(); await this.registry.authorize(actor, 'identity-tags.issue');
    strictObject(body, ['entityType', 'entityId']);
    const payload = encodePayload(body.entityType, body.entityId), ref = decodePayload(payload);
    if (!context || typeof context.idempotencyKey !== 'string' || typeof context.correlationId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(context.idempotencyKey) || !/^[A-Za-z0-9._:-]{1,128}$/.test(context.correlationId)) throw new BadRequestException('QR_INVALID_CONTEXT');
    if ((await this.projection(actor, ref)).status !== 'RESOLVED') throw new ConflictException('QR_ENTITY_UNAVAILABLE');
    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,30))', [`${actor.tenantId}:${context.idempotencyKey}`]);
      const previous = (await tx.query('SELECT * FROM identity_tags.tag WHERE tenant_id=$1 AND idempotency_key=$2', [actor.tenantId, context.idempotencyKey])).rows[0];
      if (previous && (previous.actor_id !== actor.subjectId || previous.entity_id !== ref.entityId || previous.entity_type !== ref.entityType)) throw new ConflictException('QR_IDEMPOTENCY_CONFLICT');
      const qrCodeId: string = previous?.id ?? uuidv7();
      if (!previous) {
        await tx.query('INSERT INTO identity_tags.tag(tenant_id,id,entity_type,entity_id,payload,actor_id,idempotency_key,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [actor.tenantId, qrCodeId, ref.entityType, ref.entityId, payload, actor.subjectId, context.idempotencyKey, context.correlationId]);
        await tx.query('INSERT INTO identity_tags.audit(tenant_id,tag_id,actor_id,correlation_id) VALUES($1,$2,$3,$4)', [actor.tenantId, qrCodeId, actor.subjectId, context.correlationId]);
        const eventId = randomUUID(), occurredAt = new Date().toISOString();
        const event = {eventId, qrCodeId, entityType: ref.entityType, entityId: ref.entityId, version: 1, tenantId: actor.tenantId, actorId: actor.subjectId, correlationId: context.correlationId, causationId: context.idempotencyKey, occurredAt};
        await tx.query("INSERT INTO identity_tags.outbox_event(id,tenant_id,event_name,event_version,producer,entity_id,actor_id,correlation_id,causation_id,occurred_at,payload) VALUES($1,$2,'qr_code.created','1.0.0','identity-tags',$3,$4,$5,$6,$7,$8)", [eventId, actor.tenantId, ref.entityId, actor.subjectId, context.correlationId, context.idempotencyKey, occurredAt, event]);
      }
      // Replays and in-flight issuance both recheck current permission and owner state.
      await this.registry.authorize(actor, 'identity-tags.issue');
      if ((await this.projection(actor, ref)).status !== 'RESOLVED') throw new ConflictException('QR_ENTITY_UNAVAILABLE');
      await tx.query('COMMIT'); return {qrCodeId, payload, version: 1};
    } catch (error) { await tx.query('ROLLBACK').catch(() => undefined); throw error; } finally { tx.release(); }
  }
}
