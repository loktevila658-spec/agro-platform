import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';

import { InboxService } from '../dist/modules/events/inbox.service.js';
import { OutboxDispatcherService } from '../dist/modules/events/outbox-dispatcher.service.js';

const { Pool } = pg;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const image = process.env.POSTGIS_TEST_IMAGE ?? 'agroplatform/wp49-003-postgis:test';

function docker(args) {
  return spawnSync('docker', args, { cwd: repositoryRoot, encoding: 'utf8' });
}

function assertCommand(result, action) {
  assert.equal(result.status, 0, `${action} failed\n${result.stdout}\n${result.stderr}`);
}

test('outbox retry, transactional inbox effect, and duplicate delivery are replay safe in PostgreSQL', async (t) => {
  const container = `agro-wp49-016-events-${process.pid}`;
  const password = 'wp49_016_ephemeral_test_only';
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'agro-events-integration-'));
  const psqlWrapper = join(temporaryDirectory, 'psql');
  let pool;
  let started = false;

  try {
    await writeFile(psqlWrapper, `#!/bin/sh\nexec docker exec -i ${container} psql "$@"\n`, 'utf8');
    await chmod(psqlWrapper, 0o700);
    const imageCheck = docker(['image', 'inspect', image]);
    if (imageCheck.status !== 0 && !process.env.POSTGIS_TEST_IMAGE) {
      assertCommand(docker(['build', '--tag', image, '--file', 'database/test/Dockerfile.postgis', '.']), 'PostGIS image build');
    } else {
      assertCommand(imageCheck, 'PostGIS image lookup');
    }
    assertCommand(docker([
      'run', '--detach', '--rm', '--publish', '127.0.0.1::5432', '--volume', `${repositoryRoot}:${repositoryRoot}:ro`,
      '--name', container, '--env', `POSTGRES_PASSWORD=${password}`, '--env', 'POSTGRES_DB=agro_test', image,
    ]), 'PostgreSQL test container start');
    started = true;
    const portResult = docker(['inspect', '--format', '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}', container]);
    assertCommand(portResult, 'PostgreSQL port lookup');
    const port = portResult.stdout.trim();
    const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/agro_test`;
    const socketUrl = 'postgresql:///agro_test?host=%2Fvar%2Frun%2Fpostgresql&user=postgres';
    pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 1000 });

    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        const probe = await pool.query("SELECT current_database() AS name, pg_is_in_recovery() AS replica");
        if (probe.rows[0].name === 'agro_test' && !probe.rows[0].replica) { ready = true; break; }
      } catch {}
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    assert.equal(ready, true, 'PostgreSQL did not become ready');

    const migration = spawnSync(process.execPath, ['database/migrate.mjs'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: socketUrl, PSQL_BIN: psqlWrapper },
    });
    assertCommand(migration, 'Database migrations');
    assert.match(migration.stdout, /migration 5 applied/);

    const tenantId = randomUUID();
    const eventId = randomUUID();
    const entityId = randomUUID();
    await pool.query('INSERT INTO org.tenant (id, code, name, timezone, created_by) VALUES ($1, $2, $3, $4, $5)', [tenantId, `EV-${process.pid}`, 'Events integration', 'UTC', randomUUID()]);
    await pool.query(`INSERT INTO org.outbox_event (id, tenant_id, event_name, event_version, producer, entity_type, entity_id, correlation_id, causation_id, occurred_at, payload)
      VALUES ($1, $2, 'org.tenant_created', '1.0.0', 'org', 'tenant', $3, 'corr-016', 'cause-016', clock_timestamp(), $4)`, [eventId, tenantId, entityId, { eventId, entityId, tenantId }]);
    await pool.query('CREATE TABLE platform_events.test_effect (event_id uuid PRIMARY KEY, effect_count integer NOT NULL)');

    let failFirst = true;
    const inbox = new InboxService(pool);
    const dispatcher = new OutboxDispatcherService(pool, [{
      name: 'test-projection',
      async handle(client, event) {
        await client.query(`INSERT INTO platform_events.test_effect (event_id, effect_count) VALUES ($1, 1)
          ON CONFLICT (event_id) DO UPDATE SET effect_count = platform_events.test_effect.effect_count + 1`, [event.id]);
        if (failFirst) { failFirst = false; throw new Error('temporary handler failure'); }
      },
    }], inbox);

    assert.equal(await dispatcher.dispatchAvailable(), 0);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM platform_events.test_effect')).rows[0].count, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM platform_events.inbox_event')).rows[0].count, 0);
    await pool.query('UPDATE platform_events.outbox_delivery SET next_attempt_at = clock_timestamp() WHERE source = $1 AND event_id = $2', ['org', eventId]);

    assert.equal(await dispatcher.dispatchAvailable(), 1);
    assert.equal((await pool.query('SELECT effect_count FROM platform_events.test_effect WHERE event_id = $1', [eventId])).rows[0].effect_count, 1);
    await pool.query('UPDATE platform_events.outbox_delivery SET delivered_at = NULL, next_attempt_at = clock_timestamp() WHERE source = $1 AND event_id = $2', ['org', eventId]);
    assert.equal(await dispatcher.dispatchAvailable(), 1);
    assert.equal((await pool.query('SELECT effect_count FROM platform_events.test_effect WHERE event_id = $1', [eventId])).rows[0].effect_count, 1);
    assert.equal((await pool.query('SELECT attempts FROM platform_events.outbox_delivery WHERE source = $1 AND event_id = $2', ['org', eventId])).rows[0].attempts, 3);
  } finally {
    if (pool) await pool.end();
    if (started) docker(['rm', '--force', container]);
  }
});
