import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { SignJWT } from 'jose';

const { IdentityService } = await import('../dist/modules/identity/identity.service.js');
const jwtKey = randomBytes(32);

async function validAuthorization() {
  return `Bearer ${await new SignJWT({ tid: randomUUID(), did: randomUUID(), sid: randomUUID(), ast: 'password' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(randomUUID()).setIssuedAt().setExpirationTime('5m').sign(jwtKey)}`;
}

function withAuthConfiguration(callback) {
  const previous = { databaseUrl: process.env.DATABASE_URL, signingKey: process.env.AUTH_JWT_SIGNING_KEY };
  process.env.AUTH_JWT_SIGNING_KEY = jwtKey.toString('base64');
  return Promise.resolve().then(callback).finally(() => {
    if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.databaseUrl;
    if (previous.signingKey === undefined) delete process.env.AUTH_JWT_SIGNING_KEY;
    else process.env.AUTH_JWT_SIGNING_KEY = previous.signingKey;
  });
}

test('protected identity authentication fails closed when DATABASE_URL is absent', async () => withAuthConfiguration(async () => {
  delete process.env.DATABASE_URL;
  const service = new IdentityService({ query: async () => { throw new Error('query must not run'); } });
  await assert.rejects(service.authenticate(await validAuthorization()), (error) => error.getStatus() === 503 && error.message === 'Authentication service is unavailable');
}));

test('protected identity database errors map to ServiceUnavailable while invalid credentials stay 401', async () => withAuthConfiguration(async () => {
  process.env.DATABASE_URL = 'postgresql://identity.test';
  const unavailable = new IdentityService({ query: async () => { throw new Error('database unavailable'); } });
  await assert.rejects(unavailable.authenticate(await validAuthorization()), (error) => error.getStatus() === 503 && error.message === 'Authentication service is unavailable');
  const noSession = new IdentityService({ query: async () => ({ rowCount: 0, rows: [] }) });
  await assert.rejects(noSession.authenticate(await validAuthorization()), (error) => error.getStatus() === 401);
}));

test('malformed self-session identifiers return not found before database access', async () => {
  let connectCalls = 0;
  const service = new IdentityService({ connect: async () => { connectCalls += 1; throw new Error('database must not be queried'); } });
  await assert.rejects(service.revoke({ userId: randomUUID(), tenantId: randomUUID() }, 'not-a-uuid'), (error) => error.getStatus() === 404 && error.message === 'Session not found');
  assert.equal(connectCalls, 0);
});

test('identity audit fixes SECURITY classification and includes it in the HMAC record', async () => {
  const key = randomBytes(32);
  const previousKey = process.env.AUTH_AUDIT_HMAC_KEY;
  process.env.AUTH_AUDIT_HMAC_KEY = key.toString('base64');
  let insertParameters;
  const previousHash = '1'.repeat(64);
  const client = {
    async query(sql, parameters) {
      if (sql.startsWith('SELECT last_event_hmac_sha256')) return { rows: [{ last_event_hmac_sha256: previousHash }] };
      if (sql.startsWith('INSERT INTO identity.security_audit')) insertParameters = parameters;
      return { rows: [] };
    },
  };
  try {
    const service = new IdentityService({});
    await service.audit(client, { action: 'auth.login', resourceType: 'account', outcome: 'failure', reasonCode: 'credentials_invalid', correlationId: 'unit-correlation' });
    assert.equal(insertParameters[10], 'SECURITY');
    const canonicalRecord = { id: insertParameters[0], tenantId: insertParameters[1], actorType: insertParameters[2], actorId: insertParameters[3], action: insertParameters[4], resourceType: insertParameters[5], resourceId: insertParameters[6], outcome: insertParameters[7], reasonCode: insertParameters[8], correlationId: insertParameters[9], classification: insertParameters[10], occurredAt: insertParameters[11] };
    const expectedHmac = createHmac('sha256', key).update(previousHash).update('\n').update(JSON.stringify(canonicalRecord)).digest('hex');
    assert.equal(insertParameters[12], previousHash);
    assert.equal(insertParameters[13], expectedHmac);
  } finally {
    if (previousKey === undefined) delete process.env.AUTH_AUDIT_HMAC_KEY;
    else process.env.AUTH_AUDIT_HMAC_KEY = previousKey;
  }
});
