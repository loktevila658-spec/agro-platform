import assert from 'node:assert/strict';
import test from 'node:test';

import { InboxService } from '../dist/modules/events/inbox.service.js';
import { OutboxDispatcherService } from '../dist/modules/events/outbox-dispatcher.service.js';

class MemoryPool {
  constructor() {
    this.inbox = new Set();
    this.calls = [];
    this.delivery = { source: 'org', event_id: '00000000-0000-4000-8000-000000000001', attempts: 0, pending: true };
    this.event = {
      id: this.delivery.event_id,
      event_name: 'org.tenant_created',
      event_version: '1.0.0',
      producer: 'org',
      entity_id: '00000000-0000-4000-8000-000000000002',
      tenant_id: '00000000-0000-4000-8000-000000000003',
      actor_id: '00000000-0000-4000-8000-000000000004',
      correlation_id: 'corr-1',
      causation_id: 'cause-1',
      occurred_at: new Date('2026-01-01T00:00:00Z'),
      payload: { eventId: this.delivery.event_id },
    };
  }

  async connect() {
    let transactionInboxKey;
    const pool = this;
    return {
      async query(sql, values = []) {
        pool.calls.push({ sql, values });
        if (sql === 'BEGIN') return { rowCount: null, rows: [] };
        if (sql === 'COMMIT') {
          if (transactionInboxKey) pool.inbox.add(transactionInboxKey);
          return { rowCount: null, rows: [] };
        }
        if (sql === 'ROLLBACK') return { rowCount: null, rows: [] };
        if (sql.includes('INSERT INTO platform_events.inbox_event')) {
          transactionInboxKey = `${values[0]}:${values[1]}`;
          return pool.inbox.has(transactionInboxKey)
            ? { rowCount: 0, rows: [] }
            : { rowCount: 1, rows: [{ event_id: values[1] }] };
        }
        throw new Error(`unexpected client SQL: ${sql}`);
      },
      release() {},
    };
  }

  async query(sql, values = []) {
    this.calls.push({ sql, values });
    if (sql.includes('INSERT INTO platform_events.outbox_delivery')) return { rowCount: 0, rows: [] };
    if (sql.includes('WITH candidates AS')) {
      if (!this.delivery.pending) return { rowCount: 0, rows: [] };
      this.delivery.attempts += 1;
      return { rowCount: 1, rows: [{ ...this.delivery }] };
    }
    if (sql.includes('FROM org.outbox_event WHERE id = $1')) return { rowCount: 1, rows: [this.event] };
    if (sql.includes('SET delivered_at = clock_timestamp()')) {
      this.delivery.pending = false;
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes('SET next_attempt_at = clock_timestamp()')) return { rowCount: 1, rows: [] };
    throw new Error(`unexpected pool SQL: ${sql}`);
  }
}

test('inbox commits consumer effects with the first delivery and suppresses replay', async () => {
  const pool = new MemoryPool();
  const inbox = new InboxService(pool);
  let effects = 0;
  const first = await inbox.process('projection', pool.event.id, async () => { effects += 1; });
  const replay = await inbox.process('projection', pool.event.id, async () => { effects += 1; });

  assert.deepEqual(first, { processed: true });
  assert.deepEqual(replay, { processed: false });
  assert.equal(effects, 1);
  assert.equal(pool.calls.filter(({ sql }) => sql === 'COMMIT').length, 2);
});

test('inbox rolls back its deduplication record when the consumer effect fails', async () => {
  const pool = new MemoryPool();
  const inbox = new InboxService(pool);
  await assert.rejects(inbox.process('projection', pool.event.id, async () => { throw new Error('effect failed'); }), /effect failed/);
  assert.equal(pool.inbox.size, 0);
  assert.equal(pool.calls.filter(({ sql }) => sql === 'ROLLBACK').length, 1);
});

test('outbox retries a failed consumer and replay is suppressed by the inbox', async () => {
  const pool = new MemoryPool();
  const inbox = new InboxService(pool);
  let attempts = 0;
  let effects = 0;
  const dispatcher = new OutboxDispatcherService(pool, [{
    name: 'projection',
    async handle() {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary failure');
      effects += 1;
    },
  }], inbox);

  assert.equal(await dispatcher.dispatchAvailable(), 0);
  pool.delivery.pending = true;
  assert.equal(await dispatcher.dispatchAvailable(), 1);
  pool.delivery.pending = true;
  assert.equal(await dispatcher.dispatchAvailable(), 1);
  assert.equal(attempts, 2);
  assert.equal(effects, 1);
  assert.ok(pool.calls.some(({ sql }) => sql.includes('SET next_attempt_at = clock_timestamp()')));
  assert.ok(pool.calls.some(({ sql }) => sql.includes('SET delivered_at = clock_timestamp()')));
});
