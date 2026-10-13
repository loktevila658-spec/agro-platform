import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import test from 'node:test';
import pg from 'pg';

import { parseYamlDocument } from '../../../packages/contracts/scripts/lib/contracts.mjs';

const { Pool } = pg;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const image = process.env.POSTGIS_TEST_IMAGE ?? 'agroplatform/wp49-003-postgis:test';
const actorId = '7b7a5a80-01c9-4f88-9cc0-2c21d2eab1a7';
const token = 'wp49-011-integration-bootstrap-secret';
const actions = [
  'org.hierarchy.read',
  'org.tenant.create',
  'org.organization.create',
  'org.organization_unit.create',
  'org.site.create',
].join(',');

function docker(args, options = {}) {
  return spawnSync('docker', args, { cwd: repositoryRoot, encoding: 'utf8', ...options });
}

function processFailure(action, result) {
  return `${action} failed (status=${result.status ?? result.exitCode ?? 'running'}, signal=${result.signal ?? result.signalCode ?? 'none'}, error=${result.error?.message ?? 'none'})\nstdout:\n${result.stdout ?? result.stdoutText ?? ''}\nstderr:\n${result.stderr ?? result.stderrText ?? ''}`;
}

function assertDocker(result, action) {
  assert.equal(result.status, 0, processFailure(action, result));
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolveListen));
  const { port } = server.address();
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

async function startApi(databaseUrl, permissions, tenantIds = '') {
  const port = await availablePort();
  const api = spawn(process.execPath, ['apps/api/dist/main.js'], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PORT: String(port),
      ORG_BOOTSTRAP_TOKEN: token,
      ORG_BOOTSTRAP_ACTOR_ID: actorId,
      ORG_BOOTSTRAP_PERMISSIONS: permissions,
      ORG_BOOTSTRAP_TENANT_IDS: tenantIds,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  api.stdoutText = '';
  api.stderrText = '';
  api.stdout.setEncoding('utf8').on('data', (chunk) => { api.stdoutText += chunk; });
  api.stderr.setEncoding('utf8').on('data', (chunk) => { api.stderrText += chunk; });
  const url = `http://127.0.0.1:${port}`;
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (api.exitCode !== null) throw new Error(processFailure('API process exited before readiness', api));
      try {
        const response = await fetch(`${url}/health/live`);
        if (response.ok) return { api, url };
      } catch {}
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    throw new Error(processFailure('API process did not reach HTTP readiness', api));
  } catch (error) {
    await stopApi(api);
    throw error;
  }
}

async function stopApi(api) {
  if (!api || api.exitCode !== null) return;
  const closed = new Promise((resolveClose) => api.once('close', resolveClose));
  api.kill('SIGTERM');
  const timer = setTimeout(() => api.kill('SIGKILL'), 5000);
  await closed;
  clearTimeout(timer);
}

function post(url, path, body, key, bearer = token, correlationId = `wp011-${key ?? 'missing'}`, causationId) {
  return fetch(`${url}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(key ? { 'idempotency-key': key } : {}),
      ...(correlationId === null ? {} : { 'x-correlation-id': correlationId }),
      ...(causationId ? { 'x-causation-id': causationId } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function json(response) {
  return response.json();
}

test('WP49-011 HTTP hierarchy, authorization, idempotency, audit and outbox use real PostgreSQL', async (t) => {
  const container = `agro-wp49-011-${process.pid}`;
  const password = 'wp49_011_ephemeral_test_only';
  const temp = await mkdtemp(join(tmpdir(), 'agro-org-integration-'));
  const psqlWrapper = join(temp, 'psql');
  let api;
  let testPool;
  let containerStarted = false;

  try {
    t.diagnostic('org integration: starting PostgreSQL fixture');
    const imageCheck = docker(['image', 'inspect', image]);
    if (imageCheck.status !== 0 && !process.env.POSTGIS_TEST_IMAGE) {
      assertDocker(docker(['build', '--tag', image, '--file', 'database/test/Dockerfile.postgis', '.']), 'PostGIS test image build');
    } else {
      assertDocker(imageCheck, 'PostGIS test image lookup');
    }

    const started = docker([
      'run', '--detach', '--rm', '--publish', '127.0.0.1::5432', '--name', container,
      '--volume', `${repositoryRoot}:${repositoryRoot}:ro`,
      '--env', `POSTGRES_PASSWORD=${password}`, '--env', 'POSTGRES_DB=agro_test', image,
    ]);
    assertDocker(started, 'PostgreSQL container start');
    containerStarted = true;
    t.diagnostic('org integration: PostgreSQL container started');
    const portResult = docker(['inspect', '--format', '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}', container]);
    assertDocker(portResult, 'PostgreSQL port lookup');
    const port = portResult.stdout.trim();
    const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/agro_test`;
    const socketDatabaseUrl = 'postgresql:///agro_test?host=%2Fvar%2Frun%2Fpostgresql&user=postgres';
    let ready = false;
    let lastProbe;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const probe = docker(['exec', container, 'pg_isready', '--username=postgres', '--dbname=agro_test']);
      lastProbe = probe;
      if (probe.status === 0) { ready = true; break; }
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    assert.equal(ready, true, processFailure('PostgreSQL readiness probe', lastProbe ?? {}));
    t.diagnostic('org integration: PostgreSQL ready');

    await writeFile(psqlWrapper, `#!/bin/sh\nexec docker exec -i ${container} psql "$@"\n`, 'utf8');
    await chmod(psqlWrapper, 0o700);
    const migration = spawnSync(process.execPath, ['database/migrate.mjs'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: socketDatabaseUrl, PSQL_BIN: psqlWrapper },
    });
    assert.equal(migration.status, 0, processFailure('Migration process', migration));
    t.diagnostic('org integration: migrations applied');
    assert.match(migration.stdout, /migration 2 applied/);

    testPool = new Pool({ connectionString: databaseUrl });
    const limited = await startApi(databaseUrl, 'org.hierarchy.read');
    api = limited.api;
    t.diagnostic('org integration: API child process listening with limited permissions');
    const denied = await post(limited.url, '/org/tenants', { code: 'DENIED', name: 'Denied', timezone: 'Europe/Moscow' }, 'denied', null);
    assert.equal(denied.status, 401);
    const forbidden = await post(limited.url, '/org/tenants', { code: 'FORBIDDEN', name: 'Forbidden', timezone: 'Europe/Moscow' }, 'forbidden');
    assert.equal(forbidden.status, 403);
    await stopApi(api);
    api = undefined;
    const full = await startApi(databaseUrl, actions);
    api = full.api;
    let baseUrl = full.url;

    const tenantCommand = { code: `TEN-${process.pid}`, name: 'Integration Tenant', timezone: 'Europe/Moscow' };
    const tenantFirst = await post(baseUrl, '/org/tenants', tenantCommand, 'tenant-create', token, null);
    assert.equal(tenantFirst.status, 201);
    const generatedCorrelation = tenantFirst.headers.get('x-correlation-id');
    assert.ok(generatedCorrelation);
    const tenant = await json(tenantFirst);
    assert.equal(tenant.correlationId, generatedCorrelation);
    const tenantAudit = (await testPool.query('SELECT correlation_id, causation_id FROM org.audit_entry WHERE entity_id = $1', [tenant.id])).rows[0];
    const tenantOutbox = (await testPool.query('SELECT correlation_id, causation_id FROM org.outbox_event WHERE entity_id = $1', [tenant.id])).rows[0];
    assert.deepEqual(tenantAudit, { correlation_id: generatedCorrelation, causation_id: generatedCorrelation });
    assert.deepEqual(tenantOutbox, { correlation_id: generatedCorrelation, causation_id: generatedCorrelation });
    const tenantRetry = await post(baseUrl, '/org/tenants', tenantCommand, 'tenant-create');
    assert.equal(tenantRetry.status, 201);
    assert.deepEqual(await json(tenantRetry), tenant);
    assert.equal((await testPool.query('SELECT count(*)::int AS n FROM org.tenant WHERE code = $1', [tenantCommand.code])).rows[0].n, 1);
    assert.equal((await testPool.query('SELECT count(*)::int AS n FROM org.audit_entry WHERE entity_id = $1', [tenant.id])).rows[0].n, 1);
    assert.equal((await testPool.query('SELECT count(*)::int AS n FROM org.outbox_event WHERE entity_id = $1', [tenant.id])).rows[0].n, 1);

    await stopApi(api);
    const tenantScoped = await startApi(databaseUrl, actions, tenant.id);
    api = tenantScoped.api;
    baseUrl = tenantScoped.url;

    const organizationCommand = { tenantId: tenant.id, code: 'ORG-01', name: 'Integration Farm', organizationType: 'FARM' };
    const providedCorrelation = 'provided-org-correlation-01';
    const explicitCausation = 'cause-org-command-01';
    const organizationResponse = await post(baseUrl, '/org/organizations', organizationCommand, 'organization-create', token, providedCorrelation, explicitCausation);
    assert.equal(organizationResponse.status, 201);
    assert.equal(organizationResponse.headers.get('x-correlation-id'), providedCorrelation);
    const organization = await json(organizationResponse);
    assert.equal(organization.correlationId, providedCorrelation);
    const organizationAudit = (await testPool.query('SELECT correlation_id, causation_id FROM org.audit_entry WHERE entity_id = $1', [organization.id])).rows[0];
    const organizationOutbox = (await testPool.query('SELECT correlation_id, causation_id FROM org.outbox_event WHERE entity_id = $1', [organization.id])).rows[0];
    assert.deepEqual(organizationAudit, { correlation_id: providedCorrelation, causation_id: explicitCausation });
    assert.deepEqual(organizationOutbox, { correlation_id: providedCorrelation, causation_id: explicitCausation });
    const incompatibleReuse = await post(baseUrl, '/org/organizations', { ...organizationCommand, name: 'Changed payload' }, 'organization-create');
    assert.equal(incompatibleReuse.status, 409);
    assert.equal((await testPool.query('SELECT count(*)::int AS n FROM org.organization WHERE tenant_id = $1', [tenant.id])).rows[0].n, 1);

    const invalidIncomingCorrelation = 'not valid correlation';
    const unitResponse = await post(baseUrl, '/org/organization-units', {
      tenantId: tenant.id, organizationId: organization.id, code: 'UNIT-A', name: 'Division A', unitType: 'DIVISION',
    }, 'unit-root', token, invalidIncomingCorrelation);
    assert.equal(unitResponse.status, 201);
    const replacementCorrelation = unitResponse.headers.get('x-correlation-id');
    assert.ok(replacementCorrelation);
    assert.notEqual(replacementCorrelation, invalidIncomingCorrelation);
    const unit = await json(unitResponse);
    assert.equal(unit.correlationId, replacementCorrelation);
    const unitAudit = (await testPool.query('SELECT correlation_id, causation_id FROM org.audit_entry WHERE entity_id = $1', [unit.id])).rows[0];
    const unitOutbox = (await testPool.query('SELECT correlation_id, causation_id FROM org.outbox_event WHERE entity_id = $1', [unit.id])).rows[0];
    assert.deepEqual(unitAudit, { correlation_id: replacementCorrelation, causation_id: replacementCorrelation });
    assert.deepEqual(unitOutbox, { correlation_id: replacementCorrelation, causation_id: replacementCorrelation });
    const childResponse = await post(baseUrl, '/org/organization-units', {
      tenantId: tenant.id, organizationId: organization.id, parentId: unit.id, code: 'UNIT-B', name: 'Team B', unitType: 'TEAM',
    }, 'unit-child');
    assert.equal(childResponse.status, 201);
    const child = await json(childResponse);
    const invalidParent = await post(baseUrl, '/org/organization-units', {
      tenantId: tenant.id, organizationId: organization.id, parentId: '40000000-0000-4000-8000-000000000000', code: 'UNIT-X', name: 'Invalid parent', unitType: 'TEAM',
    }, 'unit-invalid-parent');
    assert.equal(invalidParent.status, 409);
    await assert.rejects(
      testPool.query('UPDATE org.organization_unit SET parent_id = $1 WHERE id = $2', [child.id, unit.id]),
      (error) => error.code === '23514',
      'database must reject a recursive hierarchy cycle',
    );

    const otherTenantResponse = await post(baseUrl, '/org/tenants', { code: `OTHER-${process.pid}`, name: 'Other Tenant', timezone: 'Europe/Moscow' }, 'other-tenant');
    assert.equal(otherTenantResponse.status, 201);
    const otherTenant = await json(otherTenantResponse);
    const crossTenantSite = await post(baseUrl, '/org/sites', {
      tenantId: otherTenant.id, organizationId: organization.id, code: 'CROSS', name: 'Cross tenant', siteType: 'FARM', timezone: 'Europe/Moscow',
    }, 'cross-tenant-site');
    assert.equal(crossTenantSite.status, 403);

    const siteCommand = {
      tenantId: tenant.id, organizationId: organization.id, organizationUnitId: child.id,
      code: 'SITE-01', name: 'North Farm', siteType: 'FARM', address: 'Rural road 1', timezone: 'Europe/Moscow',
    };
    const siteResponse = await post(baseUrl, '/org/sites', siteCommand, 'site-create');
    assert.equal(siteResponse.status, 201);
    const site = await json(siteResponse);
    const hierarchyResponse = await fetch(`${baseUrl}/org/tenants/${tenant.id}/hierarchy`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(hierarchyResponse.status, 200);
    const hierarchy = await json(hierarchyResponse);
    assert.equal(hierarchy.tenantId, tenant.id);
    assert.deepEqual(JSON.parse(hierarchy.organizationsJson).map((row) => row.id), [organization.id]);
    assert.deepEqual(JSON.parse(hierarchy.organizationUnitsJson).map((row) => row.id).sort(), [unit.id, child.id].sort());
    assert.deepEqual(JSON.parse(hierarchy.sitesJson).map((row) => row.id), [site.id]);

    const catalog = parseYamlDocument(await (await import('node:fs/promises')).readFile(resolve(repositoryRoot, 'events/catalog/index.yaml'), 'utf8'));
    const outbox = await testPool.query('SELECT event_name, event_version, producer, payload FROM org.outbox_event WHERE tenant_id = $1 ORDER BY created_at, id', [tenant.id]);
    const catalogEvents = new Map(catalog.events.map((event) => [event.name, event]));
    for (const event of outbox.rows) {
      const contract = catalogEvents.get(event.event_name);
      assert.ok(contract, `uncatalogued outbox event ${event.event_name}`);
      assert.equal(event.event_version, contract.version);
      assert.equal(event.producer, contract.producer);
      for (const required of contract.schema.required) assert.ok(Object.hasOwn(event.payload, required));
    }
    assert.equal(outbox.rows.length, 5);

    await testPool.query(`CREATE FUNCTION org.fail_test_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test atomic rollback'; END $$`);
    await testPool.query('CREATE TRIGGER fail_test_outbox BEFORE INSERT ON org.outbox_event FOR EACH ROW EXECUTE FUNCTION org.fail_test_outbox()');
    const rollbackCommand = { code: `ROLLBACK-${process.pid}`, name: 'Rollback Tenant', timezone: 'Europe/Moscow' };
    const rollbackResponse = await post(baseUrl, '/org/tenants', rollbackCommand, 'rollback-tenant');
    assert.equal(rollbackResponse.status, 503);
    assert.equal((await testPool.query('SELECT count(*)::int AS n FROM org.tenant WHERE code = $1', [rollbackCommand.code])).rows[0].n, 0);
    assert.equal((await testPool.query('SELECT count(*)::int AS n FROM org.command_idempotency WHERE idempotency_key = $1', ['rollback-tenant'])).rows[0].n, 0);
    await testPool.query('DROP TRIGGER fail_test_outbox ON org.outbox_event');
    await testPool.query('DROP FUNCTION org.fail_test_outbox()');

    const malformed = await post(baseUrl, '/org/sites', { ...siteCommand, siteType: 'UNKNOWN' }, 'bad-site');
    assert.equal(malformed.status, 400);
    t.diagnostic('Observed HTTP 201/400/401/403/409/503 and persisted facts, audit, idempotency, and outbox on PostgreSQL.');
  } catch (error) {
    t.diagnostic(processFailure('WP49-011 integration test', { status: 1, stdoutText: '', stderrText: error?.stack ?? String(error) }));
    throw error;
  } finally {
    await stopApi(api);
    if (testPool) await testPool.end();
    const removed = docker(['rm', '--force', container]);
    if (containerStarted) assertDocker(removed, 'PostgreSQL container cleanup');
  }
});
