import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(new URL('../package.json', import.meta.url));
const { hash, Algorithm } = require('@node-rs/argon2');
const { generateSecret, generate } = require('otplib');
const { SignJWT } = await import('jose');
const { loadAndValidateContracts, validateJsonSchema } = await import('../../../packages/contracts/scripts/lib/contracts.mjs');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const image = process.env.POSTGIS_TEST_IMAGE ?? 'agroplatform/wp49-003-postgis:test';
const jwtKey = randomBytes(32);
const mfaKey = randomBytes(32);
const auditKey = randomBytes(32);
const jwtEncoded = jwtKey.toString('base64');
const mfaEncoded = mfaKey.toString('base64');
const auditEncoded = auditKey.toString('base64');

function docker(args, options = {}) { return spawnSync('docker', args, { cwd: repositoryRoot, encoding: 'utf8', ...options }); }
function failure(action, result) { return `${action} failed (${result.status ?? result.signal ?? result.error?.message})\n${result.stdoutText ?? result.stdout ?? ''}\n${result.stderrText ?? result.stderr ?? ''}`; }
function assertDocker(result, action) { assert.equal(result.status, 0, failure(action, result)); }
function psql(container, sql) {
  const result = docker(['exec', container, 'psql', '--dbname', 'postgresql:///agro_test?host=%2Fvar%2Frun%2Fpostgresql&user=postgres', '--no-psqlrc', '--tuples-only', '--no-align', '--command', sql]);
  assertDocker(result, 'PostgreSQL query');
  return result.stdout.trim();
}
async function waitForDatabase(container) {
  let stableStart;
  for (let i = 0; i < 100; i += 1) {
    const result = docker(['exec', container, 'psql', '--dbname=postgresql:///agro_test?host=%2Fvar%2Frun%2Fpostgresql&user=postgres', '--no-psqlrc', '--tuples-only', '--no-align', '--field-separator=|', '--command', "SELECT current_database(),current_setting('listen_addresses'),pg_postmaster_start_time()::text,pg_is_in_recovery();"]);
    const fields = result.status === 0 ? result.stdout.trim().split('|') : [];
    if (fields[0] === 'agro_test' && fields[1] && fields[2] && fields[3] === 'f') {
      if (fields[2] === stableStart) return;
      stableStart = fields[2];
    } else stableStart = undefined;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('PostgreSQL test container did not become ready');
}
async function startApi(databaseUrl, port) {
  const api = spawn(process.execPath, ['apps/api/dist/main.js'], { cwd: repositoryRoot, env: {
    ...process.env, DATABASE_URL: databaseUrl, PORT: String(port), AUTH_JWT_SIGNING_KEY: jwtEncoded,
    AUTH_MFA_ENCRYPTION_KEY: mfaEncoded, AUTH_MFA_KEY_REFERENCE: 'integration-key-v1', AUTH_AUDIT_HMAC_KEY: auditEncoded,
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  api.stdoutText = ''; api.stderrText = '';
  api.stdout.setEncoding('utf8').on('data', (chunk) => { api.stdoutText += chunk; });
  api.stderr.setEncoding('utf8').on('data', (chunk) => { api.stderrText += chunk; });
  const base = `http://127.0.0.1:${port}`;
  let lastStatus;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (api.exitCode !== null) throw new Error(failure('API startup', api));
    try { const response = await fetch(`${base}/health/live`); lastStatus = response.status; if (response.ok) return { api, base }; } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  api.kill('SIGTERM');
  throw new Error(`${failure('API readiness', api)}\nLast HTTP status: ${lastStatus}`);
}
async function stopApi(api) {
  if (!api || api.exitCode !== null) return;
  const closed = new Promise((resolveClose) => api.once('close', resolveClose));
  api.kill('SIGTERM');
  const timer = setTimeout(() => api.kill('SIGKILL'), 5000);
  await closed; clearTimeout(timer);
}
async function post(base, route, body, token, correlationId) {
  const response = await fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(correlationId ? { 'x-correlation-id': correlationId } : {}) }, body: JSON.stringify(body) });
  return { response, body: await response.json() };
}

test('WP49-012 identity, MFA, rotation, self-session policy and redaction use real PostgreSQL', async (t) => {
  const container = `agro-wp49-012-${process.pid}`;
  const password = 'wp49_012_ephemeral_database_only';
  const temp = await mkdtemp(join(tmpdir(), 'agro-identity-integration-'));
  const psqlWrapper = join(temp, 'psql');
  const port = 34000 + process.pid % 1000;
  let api;
  let pool;
  let started = false;
  const createdUsers = [];

  try {
    const imageCheck = docker(['image', 'inspect', image]);
    if (imageCheck.status !== 0 && !process.env.POSTGIS_TEST_IMAGE) assertDocker(docker(['build', '--tag', image, '--file', 'database/test/Dockerfile.postgis', '.']), 'PostGIS image build');
    assertDocker(docker(['run', '--detach', '--rm', '--publish', `127.0.0.1:${port}:5432`, '--name', container, '--volume', `${repositoryRoot}:${repositoryRoot}:ro`, '--env', `POSTGRES_PASSWORD=${password}`, '--env', 'POSTGRES_DB=agro_test', image]), 'PostgreSQL test container start');
    started = true;
    await waitForDatabase(container);
    await writeFile(psqlWrapper, `#!/bin/sh\nexec docker exec -i ${container} psql "$@"\n`, 'utf8');
    await chmod(psqlWrapper, 0o700);
    const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/agro_test`;
    const socketUrl = 'postgresql:///agro_test?host=%2Fvar%2Frun%2Fpostgresql&user=postgres';
    const migration = spawnSync(process.execPath, ['database/migrate.mjs'], { cwd: repositoryRoot, encoding: 'utf8', env: { ...process.env, DATABASE_URL: socketUrl, PSQL_BIN: psqlWrapper } });
    assert.equal(migration.status, 0, failure('Database migrations', migration));
    assert.match(migration.stdout, /migration 3 applied/);

    const pg = require('pg');
    pool = new pg.Pool({ connectionString: databaseUrl });
    const tenantId = randomUUID();
    await pool.query('INSERT INTO org.tenant(id,code,name,timezone,created_by) VALUES ($1,$2,$3,$4,$5)', [tenantId, `ID-${process.pid}`, 'Identity test', 'UTC', randomUUID()]);
    const accounts = {};
    for (const [name, login, pass, mfaRequired, params] of [
      ['alice', `alice-${process.pid}`, 'correct horse battery staple', false, { algorithm: Algorithm.Argon2id, memoryCost: 4096, timeCost: 1, parallelism: 1 }],
      ['bob', `bob-${process.pid}`, 'another correct password', false, { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }],
      ['mfa', `mfa-${process.pid}`, 'mfa correct password', true, { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }],
    ]) {
      const id = randomUUID(); const passwordHash = await hash(pass, params);
      await pool.query('INSERT INTO identity.user_account(id,tenant_id,login,password_hash,mfa_required) VALUES ($1,$2,$3,$4,$5)', [id, tenantId, login, passwordHash, mfaRequired]);
      accounts[name] = { id, login, password: pass, originalHash: passwordHash };
      createdUsers.push(login);
    }
    const totpSecret = generateSecret();
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', mfaKey, nonce);
    const encryptedSecret = Buffer.concat([cipher.update(totpSecret, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    await pool.query('INSERT INTO identity.mfa_authenticator(user_id,tenant_id,encrypted_secret,nonce,auth_tag,key_reference) VALUES ($1,$2,$3,$4,$5,$6)', [accounts.mfa.id, tenantId, encryptedSecret, nonce, authTag, 'integration-key-v1']);

    const { api: child, base } = await startApi(databaseUrl, port + 1000); api = child;
    const wrong = await post(base, '/v1/auth/login', { login: accounts.alice.login, password: 'wrong password', deviceId: randomUUID() });
    const missing = await post(base, '/v1/auth/login', { login: `missing-${process.pid}`, password: 'wrong password', deviceId: randomUUID() });
    assert.equal(wrong.response.status, 401); assert.equal(missing.response.status, 401); assert.deepEqual(wrong.body, missing.body);
    assert.equal(wrong.body.message, 'Authentication failed');
    await new Promise((resolveWait) => setTimeout(resolveWait, 1200));

    const throttleLogin = `throttle-${process.pid}`;
    const throttleHash = createHash('sha256').update(throttleLogin.toLowerCase()).digest('hex');
    const delays = [];
    for (let i = 0; i < 3; i += 1) {
      await post(base, '/v1/auth/login', { login: throttleLogin, password: 'incorrect', deviceId: randomUUID() });
      const throttleRow = (await pool.query('SELECT failure_count,extract(epoch from next_allowed_at-clock_timestamp()) AS delay_seconds FROM identity.login_throttle WHERE login_sha256=$1', [throttleHash])).rows[0];
      assert.equal(throttleRow.failure_count, i + 1);
      delays.push(Number(throttleRow.delay_seconds));
    }
    assert.ok(delays[0] > 0 && delays[1] > delays[0] && delays[2] > delays[1]);

    const aliceDevice = randomUUID();
    const validCorrelationId = `wp012-valid-${process.pid}`;
    const loginA = await post(base, '/v1/auth/login', { login: accounts.alice.login, password: accounts.alice.password, deviceId: aliceDevice }, undefined, validCorrelationId);
    assert.equal(loginA.response.status, 200); assert.equal(loginA.body.mfaRequired, false);
    assert.equal(loginA.response.headers.get('x-correlation-id'), validCorrelationId);
    const aliceToken = loginA.body.accessToken; const aliceRefresh = loginA.body.refreshToken;
    const aliceSessionForCorrelation = (await pool.query('SELECT id FROM identity.auth_session WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', [accounts.alice.id])).rows[0].id;
    const aliceCorrelationAudit = await pool.query("SELECT correlation_id FROM identity.security_audit WHERE action='auth.login' AND resource_id=$1 AND outcome='success' ORDER BY sequence_no DESC LIMIT 1", [accounts.alice.id]);
    const aliceCorrelationEvent = (await pool.query("SELECT correlation_id,payload FROM identity.outbox_event WHERE event_name='security.session_created' AND entity_id=$1", [aliceSessionForCorrelation])).rows[0];
    assert.equal(aliceCorrelationAudit.rows[0].correlation_id, validCorrelationId);
    assert.equal(aliceCorrelationEvent.correlation_id, validCorrelationId);
    assert.equal(aliceCorrelationEvent.payload.correlationId, validCorrelationId);
    const storedHash = (await pool.query('SELECT password_hash FROM identity.user_account WHERE id=$1', [accounts.alice.id])).rows[0].password_hash;
    assert.match(storedHash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/); assert.notEqual(storedHash, accounts.alice.password); assert.notEqual(storedHash, accounts.alice.originalHash);

    const mfaLogin = await post(base, '/v1/auth/login', { login: accounts.mfa.login, password: accounts.mfa.password, deviceId: randomUUID() });
    assert.equal(mfaLogin.response.status, 200); assert.equal(mfaLogin.body.mfaRequired, true); assert.ok(mfaLogin.body.challengeToken); assert.equal(mfaLogin.body.accessToken, undefined); assert.equal(mfaLogin.body.refreshToken, undefined);
    assert.equal(Number((await pool.query('SELECT count(*)::int AS n FROM identity.auth_session WHERE user_id=$1', [accounts.mfa.id])).rows[0].n), 0);
    const challengeHash = (await pool.query('SELECT challenge_sha256 FROM identity.mfa_challenge WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', [accounts.mfa.id])).rows[0].challenge_sha256;
    assert.notEqual(challengeHash, mfaLogin.body.challengeToken);
    assert.ok((await pool.query('SELECT encrypted_secret FROM identity.mfa_authenticator WHERE user_id=$1', [accounts.mfa.id])).rows[0].encrypted_secret.toString('utf8') !== totpSecret);
    const invalidMfa = await post(base, '/v1/auth/mfa/verify', { challengeToken: mfaLogin.body.challengeToken, code: '000000' });
    assert.equal(invalidMfa.response.status, 401);
    const totp = await generate({ secret: totpSecret });
    const verified = await post(base, '/v1/auth/mfa/verify', { challengeToken: mfaLogin.body.challengeToken, code: totp });
    assert.equal(verified.response.status, 200); assert.ok(verified.body.accessToken); assert.ok(verified.body.refreshToken);
    const replayChallenge = await post(base, '/v1/auth/mfa/verify', { challengeToken: mfaLogin.body.challengeToken, code: totp });
    assert.equal(replayChallenge.response.status, 401);
    const expiredLogin = await post(base, '/v1/auth/login', { login: accounts.mfa.login, password: accounts.mfa.password, deviceId: randomUUID() });
    const expiredChallenge = expiredLogin.body.challengeToken;
    const expiredHash = createHash('sha256').update(expiredChallenge).digest('hex');
    await pool.query('UPDATE identity.mfa_challenge SET expires_at=clock_timestamp()-interval \'1 second\' WHERE challenge_sha256=$1', [expiredHash]);
    const expiredMfa = await post(base, '/v1/auth/mfa/verify', { challengeToken: expiredChallenge, code: await generate({ secret: totpSecret }) });
    assert.equal(expiredMfa.response.status, 401);

    const listed = await fetch(`${base}/v1/me/sessions`, { headers: { authorization: `Bearer ${aliceToken}` } });
    assert.equal(listed.status, 200);
    const aliceSessions = (await listed.json()).sessions;
    assert.ok(aliceSessions.some((session) => session.current));
    const listedOwners = await pool.query('SELECT DISTINCT user_id FROM identity.auth_session WHERE id=ANY($1::uuid[])', [aliceSessions.map((session) => session.sessionId)]);
    assert.deepEqual(listedOwners.rows.map((row) => row.user_id), [accounts.alice.id]);
    const [jwtHeader, jwtPayload, jwtSignature] = aliceToken.split('.');
    const tamperedSignature = `${jwtSignature[0] === 'A' ? 'B' : 'A'}${jwtSignature.slice(1)}`;
    const tampered = await fetch(`${base}/v1/me/sessions`, { headers: { authorization: `Bearer ${jwtHeader}.${jwtPayload}.${tamperedSignature}` } });
    assert.equal(tampered.status, 401);
    const aliceSession = (await pool.query('SELECT id FROM identity.auth_session WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', [accounts.alice.id])).rows[0].id;
    const expiredJwt = await new SignJWT({ tid: tenantId, did: aliceDevice, sid: aliceSession, ast: 'password' }).setProtectedHeader({ alg: 'HS256' }).setSubject(accounts.alice.id).setIssuedAt(Math.floor(Date.now() / 1000) - 1200).setExpirationTime(Math.floor(Date.now() / 1000) - 1).sign(jwtKey);
    const expiredAccess = await fetch(`${base}/v1/me/sessions`, { headers: { authorization: `Bearer ${expiredJwt}` } });
    assert.equal(expiredAccess.status, 401);

    const aliceSecond = await post(base, '/v1/auth/login', { login: accounts.alice.login, password: accounts.alice.password, deviceId: randomUUID() });
    const aliceSecondSessionId = (await pool.query('SELECT id FROM identity.auth_session WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', [accounts.alice.id])).rows[0].id;
    const bobLogin = await post(base, '/v1/auth/login', { login: accounts.bob.login, password: accounts.bob.password, deviceId: randomUUID() }, undefined, 'invalid correlation id');
    const replacedCorrelationId = bobLogin.response.headers.get('x-correlation-id');
    assert.ok(replacedCorrelationId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(replacedCorrelationId));
    assert.notEqual(replacedCorrelationId, 'invalid correlation id');
    const bobSession = (await pool.query('SELECT id FROM identity.auth_session WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', [accounts.bob.id])).rows[0].id;
    const bobCorrelationAudit = await pool.query("SELECT correlation_id FROM identity.security_audit WHERE action='auth.login' AND resource_id=$1 AND outcome='success' ORDER BY sequence_no DESC LIMIT 1", [accounts.bob.id]);
    const bobCorrelationEvent = (await pool.query("SELECT correlation_id,payload FROM identity.outbox_event WHERE event_name='security.session_created' AND entity_id=$1", [bobSession])).rows[0];
    assert.equal(bobCorrelationAudit.rows[0].correlation_id, replacedCorrelationId);
    assert.equal(bobCorrelationEvent.correlation_id, replacedCorrelationId);
    assert.equal(bobCorrelationEvent.payload.correlationId, replacedCorrelationId);
    const crossUser = await post(base, `/v1/me/sessions/${bobSession}/commands/revoke`, undefined, aliceToken);
    assert.equal(crossUser.response.status, 404);
    const malformedSession = await post(base, '/v1/me/sessions/not-a-uuid/commands/revoke', undefined, aliceToken);
    assert.equal(malformedSession.response.status, 404);
    const healthyAfterMalformedSession = await fetch(`${base}/health/live`);
    assert.equal(healthyAfterMalformedSession.status, 200);
    const selfRevoke = await post(base, `/v1/me/sessions/${aliceSecondSessionId}/commands/revoke`, undefined, aliceToken);
    assert.equal(selfRevoke.response.status, 200);
    assert.equal((await pool.query('SELECT revoked_at IS NOT NULL AS revoked FROM identity.auth_session WHERE id=$1', [aliceSecondSessionId])).rows[0].revoked, true);

    const rotated = await post(base, '/v1/auth/refresh', { refreshToken: aliceRefresh });
    assert.equal(rotated.response.status, 200); assert.notEqual(rotated.body.refreshToken, aliceRefresh);
    const replayRefresh = await post(base, '/v1/auth/refresh', { refreshToken: aliceRefresh });
    assert.equal(replayRefresh.response.status, 401);
    const revokedRefresh = await post(base, '/v1/auth/refresh', { refreshToken: rotated.body.refreshToken });
    assert.equal(revokedRefresh.response.status, 401);
    const revokedRefreshAudit = (await pool.query("SELECT reason_code FROM identity.security_audit WHERE action='auth.refresh' AND outcome='failure' AND resource_id=$1 ORDER BY sequence_no DESC LIMIT 1", [aliceSessionForCorrelation])).rows[0];
    assert.equal(revokedRefreshAudit.reason_code, 'session_revoked');

    await pool.query('UPDATE identity.refresh_token SET expires_at=clock_timestamp()-interval \'1 second\' WHERE token_sha256=$1', [createHash('sha256').update(bobLogin.body.refreshToken).digest('hex')]);
    const expiredRefresh = await post(base, '/v1/auth/refresh', { refreshToken: bobLogin.body.refreshToken });
    assert.equal(expiredRefresh.response.status, 401);
    const expiredRefreshAudit = (await pool.query("SELECT reason_code FROM identity.security_audit WHERE action='auth.refresh' AND outcome='failure' AND resource_id=$1 ORDER BY sequence_no DESC LIMIT 1", [bobSession])).rows[0];
    assert.equal(expiredRefreshAudit.reason_code, 'credential_expired');

    const logout = await post(base, '/v1/auth/logout', undefined, bobLogin.body.accessToken);
    assert.equal(logout.response.status, 200);
    const afterLogout = await fetch(`${base}/v1/me/sessions`, { headers: { authorization: `Bearer ${bobLogin.body.accessToken}` } });
    assert.equal(afterLogout.status, 401);
    const logoutRefresh = await post(base, '/v1/auth/refresh', { refreshToken: bobLogin.body.refreshToken });
    assert.equal(logoutRefresh.response.status, 401);

    const createdSessions = Number(psql(container, `SELECT count(*) FROM identity.outbox_event WHERE event_name='security.session_created';`));
    const persistedSessions = Number(psql(container, `SELECT count(*) FROM identity.auth_session;`));
    assert.equal(createdSessions, persistedSessions);
    const eventContracts = await loadAndValidateContracts(repositoryRoot);
    const storedEvents = (await pool.query('SELECT event_name,payload FROM identity.outbox_event ORDER BY created_at,id')).rows;
    for (const event of storedEvents) {
      const definition = eventContracts.events.events.find(({ name }) => name === event.event_name);
      assert.ok(definition, `catalog entry exists for ${event.event_name}`);
      assert.deepEqual(validateJsonSchema(definition.schema, event.payload), []);
    }
    const revokedEvents = Number(psql(container, `SELECT count(*) FROM identity.outbox_event WHERE event_name='security.session_revoked';`));
    const revokedSessions = Number(psql(container, 'SELECT count(*) FROM identity.auth_session WHERE revoked_at IS NOT NULL;'));
    assert.ok(revokedEvents >= 3); assert.equal(revokedEvents, revokedSessions);
    assert.equal(Number(psql(container, `SELECT count(*) FROM identity.outbox_event WHERE event_name='security.mfa_changed';`)), 0);
    const auditRows = (await pool.query('SELECT id,tenant_id,actor_type,actor_id,action,resource_type,resource_id,outcome,reason_code,correlation_id,classification,occurred_at,sequence_no,previous_sha256,event_hmac_sha256 FROM identity.security_audit ORDER BY sequence_no')).rows;
    assert.ok(auditRows.length > 0); assert.equal(auditRows[0].previous_sha256, '0'.repeat(64));
    assert.ok(auditRows.every((row) => row.classification === 'SECURITY'));
    for (let i = 0; i < auditRows.length; i += 1) {
      const row = auditRows[i];
      if (i > 0) assert.equal(row.previous_sha256, auditRows[i - 1].event_hmac_sha256);
      const canonicalRecord = { id: row.id, tenantId: row.tenant_id, actorType: row.actor_type, actorId: row.actor_id, action: row.action, resourceType: row.resource_type, resourceId: row.resource_id, outcome: row.outcome, reasonCode: row.reason_code, correlationId: row.correlation_id, classification: row.classification, occurredAt: row.occurred_at.toISOString() };
      const expectedHmac = createHmac('sha256', auditKey).update(row.previous_sha256).update('\n').update(JSON.stringify(canonicalRecord)).digest('hex');
      assert.equal(row.event_hmac_sha256, expectedHmac);
    }
    assert.ok(auditRows.every((row) => row.event_hmac_sha256 !== '0'.repeat(64)));
    await assert.rejects(pool.query('UPDATE identity.security_audit SET reason_code=\'changed\' WHERE sequence_no=1'), /append-only/);
    const secretEvidence = JSON.stringify((await pool.query(`SELECT (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM identity.security_audit a) AS audit,(SELECT coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM identity.outbox_event e) AS events`)).rows);
    for (const secret of [accounts.alice.password, accounts.bob.password, accounts.mfa.password, aliceToken, aliceRefresh, mfaLogin.body.challengeToken, totpSecret, jwtEncoded, mfaEncoded, auditEncoded]) assert.ok(!secretEvidence.includes(secret));
    for (const secret of [accounts.alice.password, aliceRefresh, mfaLogin.body.challengeToken, totpSecret, jwtEncoded, mfaEncoded, auditEncoded]) assert.ok(!api.stdoutText.includes(secret) && !api.stderrText.includes(secret));
    assert.equal(Number(psql(container, 'SELECT current_version FROM platform_meta.schema_version;')), 3);
  } finally {
    await stopApi(api);
    if (pool) await pool.end();
    if (started) docker(['rm', '--force', container]);
  }
});
