import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import { EVENTS_POOL } from './events.tokens';

export interface InboxResult {
  processed: boolean;
}

@Injectable()
export class InboxService {
  constructor(@Inject(EVENTS_POOL) private readonly pool: Pool) {}

  async process<T>(
    consumerName: string,
    eventId: string,
    effect: (client: PoolClient) => Promise<T>,
  ): Promise<InboxResult> {
    if (!consumerName.trim()) throw new Error('consumerName is required');
    if (!eventId.trim()) throw new Error('eventId is required');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO platform_events.inbox_event (consumer_name, event_id)
         VALUES ($1, $2)
         ON CONFLICT (consumer_name, event_id) DO NOTHING
         RETURNING event_id`,
        [consumerName, eventId],
      );
      if (inserted.rowCount === 0) {
        await client.query('COMMIT');
        return { processed: false };
      }

      await effect(client);
      await client.query('COMMIT');
      return { processed: true };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
