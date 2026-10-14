import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
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
