import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after, before } from 'node:test';

import { OrgService } from '../dist/modules/org/org.service.js';

const actorId = '7b7a5a80-01c9-4f88-9cc0-2c21d2eab1a7';
const tenantId = '6b7a5a80-01c9-4f88-9cc0-2c21d2eab1a7';
const otherTenantId = '8b7a5a80-01c9-4f88-9cc0-2c21d2eab1a7';
const organizationId = '9b7a5a80-01c9-4f88-9cc0-2c21d2eab1a7';
const parentUnitId = 'ab7a5a80-01c9-4f88-9cc0-2c21d2eab1a7';
const context = (idempotencyKey = 'unit-key') => ({ token: 'wp49-011-unit-token', idempotencyKey });

const envKeys = ['ORG_BOOTSTRAP_TOKEN', 'ORG_BOOTSTRAP_ACTOR_ID', 'ORG_BOOTSTRAP_PERMISSIONS', 'ORG_BOOTSTRAP_TENANT_IDS', 'DATABASE_URL'];
let originalEnv;

before(() => {
  originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.ORG_BOOTSTRAP_TOKEN = 'wp49-011-unit-token';
  process.env.ORG_BOOTSTRAP_ACTOR_ID = actorId;
  process.env.ORG_BOOTSTRAP_PERMISSIONS = [
    'org.hierarchy.read', 'org.tenant.create', 'org.organization.create',
    'org.organization_unit.create', 'org.site.create',
  ].join(',');
  process.env.ORG_BOOTSTRAP_TENANT_IDS = tenantId;
  process.env.DATABASE_URL = 'postgresql://unit.invalid/agro';
});

after(() => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

function serviceWithPool({ query = async () => ({ rows: [], rowCount: 0 }), clientQuery } = {}) {
  const calls = [];
  let connects = 0;
  const pool = {
    async query(sql, params) {
      calls.push({ kind: 'pool', sql, params });
      return query(sql, params);
    },
    async connect() {
      connects += 1;
      return {
        async query(sql, params) {
          calls.push({ kind: 'client', sql, params });
          return clientQuery ? clientQuery(sql, params) : { rows: [], rowCount: 1 };
        },
        release() {},
      };
    },
    async end() {},
  };
  return { service: new OrgService(pool), calls, get connects() { return connects; } };
}

test('rejects empty authoritative command input before database access', async () => {
  const { service, calls, connects } = serviceWithPool();
  await assert.rejects(
    service.createTenant({ code: '  ', name: 'Farm', timezone: 'Europe/Moscow' }, context()),
    (error) => error.getStatus() === 400,
  );
  assert.equal(calls.length, 0);
  assert.equal(connects, 0);
});

test('rejects unsupported organization type before persistence', async () => {
  const { service, calls, connects } = serviceWithPool();
  await assert.rejects(
    service.createOrganization({ tenantId, code: 'org', name: 'Farm', organizationType: 'UNSUPPORTED' }, context()),
    (error) => error.getStatus() === 400,
  );
  assert.equal(calls.length, 0);
  assert.equal(connects, 0);
});

test('rejects a tenant-scoped command outside the configured tenant scope', async () => {
  const { service, calls, connects } = serviceWithPool();
  await assert.rejects(
    service.createOrganization({ tenantId: otherTenantId, code: 'org', name: 'Farm', organizationType: 'FARM' }, context()),
    (error) => error.getStatus() === 403,
  );
  assert.equal(calls.length, 0);
  assert.equal(connects, 0);
});

test('permission mapping denies missing and unknown actions by default', async (t) => {
  const original = process.env.ORG_BOOTSTRAP_PERMISSIONS;
  t.after(() => { process.env.ORG_BOOTSTRAP_PERMISSIONS = original; });

  const { service: missingService, calls: missingCalls } = serviceWithPool();
  process.env.ORG_BOOTSTRAP_PERMISSIONS = 'org.hierarchy.read';
  await assert.rejects(
    missingService.createTenant({ code: 't', name: 'Tenant', timezone: 'UTC' }, context()),
    (error) => error.getStatus() === 403,
  );
  assert.equal(missingCalls.length, 0);

  const { service: unknownService, calls: unknownCalls } = serviceWithPool();
  process.env.ORG_BOOTSTRAP_PERMISSIONS = 'org.tenant.create,org.superuser';
  await assert.rejects(
    unknownService.createTenant({ code: 't', name: 'Tenant', timezone: 'UTC' }, context()),
    (error) => error.getStatus() === 403,
  );
  assert.equal(unknownCalls.length, 0);
  process.env.ORG_BOOTSTRAP_PERMISSIONS = original;
});

test('rejects organization and parent-unit relationships before persistence', async () => {
  const { service, calls, connects } = serviceWithPool();
  await assert.rejects(
    service.createOrganization({ tenantId, code: 'org', name: 'Farm', organizationType: 'FARM' }, context()),
    (error) => error.getStatus() === 409,
  );
  assert.equal(connects, 0);

  const parentMismatch = serviceWithPool({ query: async () => ({ rows: [], rowCount: 0 }) });
  await assert.rejects(
    parentMismatch.service.createOrganizationUnit({ tenantId, organizationId, parentId: parentUnitId, code: 'unit', name: 'North', unitType: 'DEPARTMENT' }, context()),
    (error) => error.getStatus() === 409,
  );
  assert.equal(parentMismatch.connects, 0);
  assert.equal(calls.filter((call) => call.kind === 'client').length, 0);
});

function tenantClient({ reservationCount = 1, priorHash } = {}) {
  const hashes = [];
  const queries = [];
  return {
    hashes,
    queries,
    async query(sql, params = []) {
      queries.push(sql);
      if (sql.startsWith('INSERT INTO org.command_idempotency')) {
        hashes.push(params[3]);
        return { rows: reservationCount ? [{ idempotency_key: params[1] }] : [], rowCount: reservationCount };
      }
      if (sql.startsWith('SELECT command_name, payload_sha256')) {
        return { rows: [{ command_name: 'org.tenant.create', payload_sha256: priorHash, response: { id: 'prior' } }], rowCount: 1 };
      }
      if (sql.startsWith('INSERT INTO org.tenant')) {
        return { rows: [{ id: tenantId, code: params[0], name: params[1], timezone: params[2] }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
}

test('uses a deterministic idempotency fingerprint for equivalent command payloads', async () => {
  const firstClient = tenantClient();
  const secondClient = tenantClient();
  const first = serviceWithPool({ clientQuery: firstClient.query.bind(firstClient) });
  const second = serviceWithPool({ clientQuery: secondClient.query.bind(secondClient) });
  await first.service.createTenant({ code: 'farm', name: 'Farm', timezone: 'UTC' }, context('same-key'));
  await second.service.createTenant({ timezone: 'UTC', name: 'Farm', code: 'farm' }, context('same-key'));

  assert.match(firstClient.hashes[0], /^[a-f0-9]{64}$/);
  assert.equal(secondClient.hashes[0], firstClient.hashes[0]);
});

test('rejects reuse of an idempotency key with an incompatible payload', async () => {
  const client = tenantClient({ reservationCount: 0, priorHash: createHash('sha256').update('different payload').digest('hex') });
  const { service } = serviceWithPool({ clientQuery: client.query.bind(client) });
  await assert.rejects(
    service.createTenant({ code: 'farm', name: 'Farm', timezone: 'UTC' }, context('same-key')),
    (error) => error.getStatus() === 409,
  );
  assert.equal(client.queries.includes('ROLLBACK'), true);
  assert.equal(client.queries.includes('COMMIT'), false);
});
