import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Pool } from 'pg';

import { EVENT_HANDLERS, EVENTS_POOL } from './events.tokens';
import type { DomainEvent, EventHandler, EventSource } from './events.types';
import { InboxService } from './inbox.service';

const BATCH_SIZE = 50;
const LEASE_MILLISECONDS = 30_000;
const POLL_MILLISECONDS = 1_000;
const MAX_RETRY_MILLISECONDS = 5 * 60_000;

interface ClaimedEvent {
  source: EventSource;
  event_id: string;
  attempts: number;
}

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(EVENTS_POOL) private readonly pool: Pool,
    @Inject(EVENT_HANDLERS) private readonly handlers: EventHandler[],
    private readonly inbox: InboxService,
  ) {
    const names = handlers.map(({ name }) => name);
    if (new Set(names).size !== names.length) {
      throw new Error('Event handler names must be unique');
    }
  }

  onModuleInit(): void {
    if (this.handlers.length === 0) return;
    this.timer = setInterval(() => {
      void this.dispatchAvailable().catch((error: unknown) => {
        this.logger.error(`Outbox dispatch cycle failed: ${this.errorCode(error)}`);
      });
    }, POLL_MILLISECONDS);
    this.timer.unref();
    void this.dispatchAvailable().catch((error: unknown) => {
      this.logger.error(`Initial outbox dispatch failed: ${this.errorCode(error)}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.pool.end();
  }

  async dispatchAvailable(limit = BATCH_SIZE): Promise<number> {
    if (this.handlers.length === 0) return 0;
    await this.discoverEvents();
    const claimed = await this.claimEvents(limit);
    let completed = 0;

    for (const delivery of claimed) {
      try {
        const event = await this.loadEvent(delivery.source, delivery.event_id);
        if (!event) throw new Error('OutboxEventMissing');
        for (const handler of this.handlers) {
          await this.inbox.process(handler.name, event.id, (client) => handler.handle(client, event));
        }
        await this.markDelivered(delivery);
        completed += 1;
      } catch (error) {
        await this.scheduleRetry(delivery, error);
      }
    }
    return completed;
  }

  private async discoverEvents(): Promise<void> {
    await this.pool.query(`
      INSERT INTO platform_events.outbox_delivery (source, event_id)
      SELECT 'org', id FROM org.outbox_event
      UNION ALL
      SELECT 'identity', id FROM identity.outbox_event
      ON CONFLICT (source, event_id) DO NOTHING
    `);
  }

  private async claimEvents(limit: number): Promise<ClaimedEvent[]> {
    const result = await this.pool.query<ClaimedEvent>(`
      WITH candidates AS (
        SELECT source, event_id
        FROM platform_events.outbox_delivery
        WHERE delivered_at IS NULL
          AND next_attempt_at <= clock_timestamp()
          AND (lease_until IS NULL OR lease_until <= clock_timestamp())
        ORDER BY next_attempt_at, source, event_id
        FOR UPDATE SKIP LOCKED
        LIMIT $1
      )
      UPDATE platform_events.outbox_delivery AS delivery
      SET attempts = delivery.attempts + 1,
          lease_until = clock_timestamp() + ($2::integer * interval '1 millisecond')
      FROM candidates
      WHERE delivery.source = candidates.source
        AND delivery.event_id = candidates.event_id
      RETURNING delivery.source, delivery.event_id, delivery.attempts
    `, [limit, LEASE_MILLISECONDS]);
    return result.rows;
  }

  private async loadEvent(source: EventSource, eventId: string): Promise<DomainEvent | undefined> {
    const table = source === 'org' ? 'org.outbox_event' : 'identity.outbox_event';
    const actorColumn = source === 'org' ? "payload->>'actorId'" : 'actor_id';
    const result = await this.pool.query<{
      id: string;
      event_name: string;
      event_version: string;
      producer: string;
      entity_id: string;
      tenant_id: string | null;
      actor_id: string | null;
      correlation_id: string | null;
      causation_id: string | null;
      occurred_at: Date;
      payload: Record<string, unknown>;
    }>(`SELECT id, event_name, event_version, producer, entity_id, tenant_id,
              ${actorColumn} AS actor_id,
              correlation_id, causation_id, occurred_at, payload
       FROM ${table} WHERE id = $1`, [eventId]);
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      source,
      eventName: row.event_name,
      eventVersion: row.event_version,
      producer: row.producer,
      entityId: row.entity_id,
      tenantId: row.tenant_id,
      actorId: row.actor_id,
      correlationId: row.correlation_id,
      causationId: row.causation_id,
      occurredAt: row.occurred_at,
      payload: row.payload,
    };
  }

  private async markDelivered(delivery: ClaimedEvent): Promise<void> {
    await this.pool.query(`
      UPDATE platform_events.outbox_delivery
      SET delivered_at = clock_timestamp(), lease_until = NULL, last_error = NULL
      WHERE source = $1 AND event_id = $2 AND delivered_at IS NULL
    `, [delivery.source, delivery.event_id]);
  }

  private async scheduleRetry(delivery: ClaimedEvent, error: unknown): Promise<void> {
    const delay = Math.min(1_000 * (2 ** Math.min(delivery.attempts - 1, 8)), MAX_RETRY_MILLISECONDS);
    await this.pool.query(`
      UPDATE platform_events.outbox_delivery
      SET next_attempt_at = clock_timestamp() + ($3::integer * interval '1 millisecond'),
          lease_until = NULL,
          last_error = $4
      WHERE source = $1 AND event_id = $2 AND delivered_at IS NULL
    `, [delivery.source, delivery.event_id, delay, this.errorCode(error)]);
  }

  private errorCode(error: unknown): string {
    return error instanceof Error ? error.name.slice(0, 100) : 'DeliveryError';
  }
}
