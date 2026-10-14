import { hash, verify, Algorithm } from '@node-rs/argon2';
import { Injectable, OnModuleDestroy, UnauthorizedException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { verify as verifyTotp } from 'otplib';
import { Pool, PoolClient } from 'pg';
import { IDENTITY_POOL } from './identity.tokens';

const ACCESS_SECONDS = 600;
const REFRESH_DAYS = 14;
const MFA_CHALLENGE_SECONDS = 300;
const ARGON = { algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };
const GENERIC_AUTH = 'Authentication failed';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const opaque = (bytes = 32) => randomBytes(bytes).toString('base64url');
function needsPolicyRehash(encoded: string): boolean {
  const match = /^\$argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(encoded);
  return !match || Number(match[1]) !== 19 || Number(match[2]) !== ARGON.memoryCost || Number(match[3]) !== ARGON.timeCost || Number(match[4]) !== ARGON.parallelism;
}

type IdentityContext = { userId: string; tenantId: string; deviceId: string; sessionId: string; authStrength: string };

function configuredKey(name: string, length: number): Buffer {
  const raw = process.env[name];
  if (!raw) throw new ServiceUnavailableException('Authentication service is unavailable');
  let key: Buffer;
  try { key = Buffer.from(raw, 'base64'); } catch { throw new ServiceUnavailableException('Authentication service is unavailable'); }
  if (key.length !== length || key.toString('base64') !== raw) throw new ServiceUnavailableException('Authentication service is unavailable');
  return key;
}

@Injectable()
export class IdentityService implements OnModuleDestroy {
  private dummyHashPromise?: Promise<string>;
  constructor(@Inject(IDENTITY_POOL) private readonly pool: Pool) {}
  async onModuleDestroy(): Promise<void> { await this.pool.end(); }

  private async signingKey(): Promise<Uint8Array> { return configuredKey('AUTH_JWT_SIGNING_KEY', 32); }
  private correlation(value?: string): string { return value && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : randomUUID(); }
  private async audit(client: PoolClient, input: { tenantId?: string | null; actorId?: string | null; action: string; resourceType: string; resourceId?: string | null; outcome: 'success' | 'failure'; reasonCode: string; correlationId: string }): Promise<void> {
    const key = configuredKey('AUTH_AUDIT_HMAC_KEY', 32);
    const head = await client.query('SELECT last_event_hmac_sha256 FROM identity.security_audit_head WHERE singleton=true FOR UPDATE');
    const previous = String(head.rows[0]?.last_event_hmac_sha256 ?? '');
    if (!/^[a-f0-9]{64}$/.test(previous)) throw new ServiceUnavailableException('Authentication service is unavailable');
    const id = randomUUID();
    const occurredAt = new Date().toISOString();
    const classification = 'SECURITY' as const;
    const record = { id, tenantId: input.tenantId ?? null, actorType: input.actorId ? 'user' : 'anonymous', actorId: input.actorId ?? null, action: input.action, resourceType: input.resourceType, resourceId: input.resourceId ?? null, outcome: input.outcome, reasonCode: input.reasonCode, correlationId: input.correlationId, classification, occurredAt };
    const eventHmac = createHmac('sha256', key).update(previous).update('\n').update(JSON.stringify(record)).digest('hex');
    await client.query(`INSERT INTO identity.security_audit(id,tenant_id,actor_type,actor_id,action,resource_type,resource_id,outcome,reason_code,correlation_id,classification,occurred_at,previous_sha256,event_hmac_sha256) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [id, input.tenantId ?? null, record.actorType, input.actorId ?? null, input.action, input.resourceType, input.resourceId ?? null, input.outcome, input.reasonCode, input.correlationId, classification, occurredAt, previous, eventHmac]);
    await client.query('UPDATE identity.security_audit_head SET last_event_hmac_sha256=$1 WHERE singleton=true', [eventHmac]);
  }
  private async begin(): Promise<PoolClient> {
    if (!process.env.DATABASE_URL) throw new ServiceUnavailableException('Authentication service is unavailable');
    try { return await this.pool.connect(); } catch { throw new ServiceUnavailableException('Authentication service is unavailable'); }
  }
  private async accessToken(context: IdentityContext): Promise<string> {
    const key = await this.signingKey();
    return new SignJWT({ tid: context.tenantId, did: context.deviceId, sid: context.sessionId, ast: context.authStrength })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(context.userId).setIssuedAt().setExpirationTime(`${ACCESS_SECONDS}s`).sign(key);
  }
  private async issueSession(client: PoolClient, user: any, deviceId: string, authStrength: string, correlationId: string): Promise<Record<string, unknown>> {
    const sessionId = randomUUID();
    const refresh = opaque();
    const expiresAt = new Date(Date.now() + REFRESH_DAYS * 86_400_000);
    await client.query(`INSERT INTO identity.auth_session(id,user_id,tenant_id,device_id,auth_strength,expires_at) VALUES ($1,$2,$3,$4,$5,$6)`, [sessionId, user.id, user.tenant_id, deviceId, authStrength, expiresAt]);
    await client.query(`INSERT INTO identity.refresh_token(session_id,token_sha256,expires_at) VALUES ($1,$2,$3)`, [sessionId, sha256(refresh), expiresAt]);
    await this.audit(client, { tenantId: user.tenant_id, actorId: user.id, action: 'security.session_created', resourceType: 'session', resourceId: sessionId, outcome: 'success', reasonCode: 'authenticated', correlationId });
    const eventId = randomUUID();
    const occurredAt = new Date().toISOString();
    await client.query(`INSERT INTO identity.outbox_event(id,event_name,event_version,producer,entity_id,tenant_id,actor_id,correlation_id,causation_id,occurred_at,payload) VALUES ($1,'security.session_created','1.0.0','identity',$2,$3,$4,$5,$5,$6,$7)`, [eventId, sessionId, user.tenant_id, user.id, correlationId, occurredAt, JSON.stringify({ eventId, entityId: sessionId, entityType: 'session', sessionId, tenantId: user.tenant_id, actorId: user.id, userId: user.id, deviceId, authStrength, correlationId, causationId: correlationId, occurredAt })]);
    const accessToken = await this.accessToken({ userId: user.id, tenantId: user.tenant_id, deviceId, sessionId, authStrength });
    return { accessToken, tokenType: 'Bearer', expiresIn: ACCESS_SECONDS, refreshToken: refresh, refreshExpiresAt: expiresAt.toISOString() };
  }
  private async ensureDevice(client: PoolClient, user: any, deviceId: string): Promise<void> {
    if (!uuidPattern.test(deviceId)) throw new UnauthorizedException(GENERIC_AUTH);
    const found = await client.query(`INSERT INTO identity.registered_device(id,user_id,tenant_id,label) VALUES ($1,$2,$3,'Local device') ON CONFLICT (id) DO UPDATE SET last_seen_at=clock_timestamp() WHERE identity.registered_device.user_id=EXCLUDED.user_id AND identity.registered_device.tenant_id=EXCLUDED.tenant_id RETURNING id`, [deviceId, user.id, user.tenant_id]);
    if (!found.rowCount) throw new UnauthorizedException(GENERIC_AUTH);
  }
  private async dummyHash(): Promise<string> {
    this.dummyHashPromise ??= hash(randomBytes(32), ARGON);
    return this.dummyHashPromise;
  }
  async login(input: { login?: string; password?: string; deviceId?: string }, correlation?: string): Promise<Record<string, unknown>> {
    const correlationId = this.correlation(correlation);
    const login = typeof input?.login === 'string' ? input.login.trim() : '';
    const password = typeof input?.password === 'string' ? input.password : '';
    const deviceId = typeof input?.deviceId === 'string' ? input.deviceId : '';
    const client = await this.begin();
    try {
      await client.query('BEGIN');
      const throttleKey = sha256(login.toLowerCase());
      const throttle = await client.query('SELECT failure_count,next_allowed_at > clock_timestamp() AS blocked FROM identity.login_throttle WHERE login_sha256=$1 FOR UPDATE', [throttleKey]);
      const userResult = await client.query('SELECT id,tenant_id,login,password_hash,mfa_required,active FROM identity.user_account WHERE login=$1 AND active=true LIMIT 1', [login]);
      const user = userResult.rows[0];
      const hashValue = user?.password_hash ?? await this.dummyHash();
      let validPassword = false;
      try { validPassword = await verify(hashValue, password); } catch { validPassword = false; }
      if (throttle.rows[0]?.blocked || !user || !validPassword || !uuidPattern.test(deviceId)) {
        const prior = Number(throttle.rows[0]?.failure_count ?? 0);
        const count = Math.min(prior + 1, 8);
        const seconds = Math.min(2 ** Math.max(count - 1, 0), 300);
        await client.query(`INSERT INTO identity.login_throttle(login_sha256,failure_count,next_allowed_at) VALUES ($1,$2,clock_timestamp()+($3 * interval '1 second')) ON CONFLICT(login_sha256) DO UPDATE SET failure_count=$2,next_allowed_at=clock_timestamp()+($3 * interval '1 second'),updated_at=clock_timestamp()`, [throttleKey, count, seconds]);
        await this.audit(client, { action: 'auth.login', resourceType: 'account', outcome: 'failure', reasonCode: 'credentials_invalid', correlationId });
        await client.query('COMMIT');
        throw new UnauthorizedException(GENERIC_AUTH);
      }
      if (needsPolicyRehash(user.password_hash)) {
        const upgraded = await hash(password, ARGON);
        await client.query('UPDATE identity.user_account SET password_hash=$1 WHERE id=$2', [upgraded, user.id]);
      }
      await client.query('DELETE FROM identity.login_throttle WHERE login_sha256=$1', [throttleKey]);
      await this.ensureDevice(client, user, deviceId);
      if (user.mfa_required) {
        const challenge = opaque();
        await client.query(`INSERT INTO identity.mfa_challenge(challenge_sha256,user_id,tenant_id,device_id,expires_at) VALUES ($1,$2,$3,$4,clock_timestamp()+($5 * interval '1 second'))`, [sha256(challenge), user.id, user.tenant_id, deviceId, MFA_CHALLENGE_SECONDS]);
        await this.audit(client, { tenantId: user.tenant_id, actorId: user.id, action: 'auth.login', resourceType: 'account', resourceId: user.id, outcome: 'success', reasonCode: 'mfa_required', correlationId });
        await client.query('COMMIT');
        return { mfaRequired: true, challengeToken: challenge, expiresIn: MFA_CHALLENGE_SECONDS };
      }
      const tokens = await this.issueSession(client, user, deviceId, 'password', correlationId);
      await this.audit(client, { tenantId: user.tenant_id, actorId: user.id, action: 'auth.login', resourceType: 'account', resourceId: user.id, outcome: 'success', reasonCode: 'authenticated', correlationId });
      await client.query('COMMIT');
      return { mfaRequired: false, ...tokens };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
  private async totpSecret(userId: string): Promise<string> {
    const key = configuredKey('AUTH_MFA_ENCRYPTION_KEY', 32);
    const reference = process.env.AUTH_MFA_KEY_REFERENCE;
    if (!reference) throw new ServiceUnavailableException('Authentication service is unavailable');
    const { rows } = await this.pool.query('SELECT encrypted_secret,nonce,auth_tag,key_reference FROM identity.mfa_authenticator WHERE user_id=$1', [userId]);
    const row = rows[0];
    if (!row || row.key_reference !== reference) throw new UnauthorizedException(GENERIC_AUTH);
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, row.nonce);
      decipher.setAuthTag(row.auth_tag);
      return Buffer.concat([decipher.update(row.encrypted_secret), decipher.final()]).toString('utf8');
    } catch { throw new UnauthorizedException(GENERIC_AUTH); }
  }
  async verifyMfa(input: { challengeToken?: string; code?: string }, correlation?: string): Promise<Record<string, unknown>> {
    const correlationId = this.correlation(correlation);
    const token = typeof input?.challengeToken === 'string' ? input.challengeToken : '';
    const code = typeof input?.code === 'string' ? input.code : '';
    const client = await this.begin();
    try {
      await client.query('BEGIN');
      const result = await client.query(`SELECT c.*,u.login,u.password_hash,u.mfa_required,u.active FROM identity.mfa_challenge c JOIN identity.user_account u ON u.id=c.user_id AND u.tenant_id=c.tenant_id WHERE c.challenge_sha256=$1 FOR UPDATE`, [sha256(token)]);
      const challenge = result.rows[0];
      if (!challenge || challenge.consumed_at || new Date(challenge.expires_at).getTime() <= Date.now() || !challenge.active || !challenge.mfa_required) {
        await this.audit(client, { action: 'auth.mfa.verify', resourceType: 'challenge', outcome: 'failure', reasonCode: 'challenge_invalid', correlationId });
        await client.query('COMMIT');
        throw new UnauthorizedException(GENERIC_AUTH);
      }
      const secret = await this.totpSecret(challenge.user_id);
      const checked = await verifyTotp({ secret, token: code });
      if (!checked.valid) {
        await this.audit(client, { tenantId: challenge.tenant_id, actorId: challenge.user_id, action: 'auth.mfa.verify', resourceType: 'challenge', outcome: 'failure', reasonCode: 'totp_invalid', correlationId });
        await client.query('COMMIT');
        throw new UnauthorizedException(GENERIC_AUTH);
      }
      await client.query('UPDATE identity.mfa_challenge SET consumed_at=clock_timestamp() WHERE id=$1', [challenge.id]);
      const tokens = await this.issueSession(client, { id: challenge.user_id, tenant_id: challenge.tenant_id }, challenge.device_id, 'password+mfa', correlationId);
      await this.audit(client, { tenantId: challenge.tenant_id, actorId: challenge.user_id, action: 'auth.mfa.verify', resourceType: 'challenge', resourceId: challenge.id, outcome: 'success', reasonCode: 'totp_verified', correlationId });
      await client.query('COMMIT');
      return tokens;
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }
  async authenticate(authorization?: string): Promise<IdentityContext> {
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Authentication required');
    const key = await this.signingKey();
    let claims: any;
    try { ({ payload: claims } = await jwtVerify(authorization.slice(7), key, { algorithms: ['HS256'] })); } catch { throw new UnauthorizedException('Authentication required'); }
    if (typeof claims.sub !== 'string' || typeof claims.tid !== 'string' || typeof claims.did !== 'string' || typeof claims.sid !== 'string' || !['password', 'password+mfa'].includes(claims.ast)) throw new UnauthorizedException('Authentication required');
    if (!process.env.DATABASE_URL) throw new ServiceUnavailableException('Authentication service is unavailable');
    let result: { rowCount: number | null };
    try {
      result = await this.pool.query(`SELECT id,user_id,tenant_id,device_id,auth_strength FROM identity.auth_session WHERE id=$1 AND user_id=$2 AND tenant_id=$3 AND device_id=$4 AND auth_strength=$5 AND revoked_at IS NULL AND expires_at>clock_timestamp()`, [claims.sid, claims.sub, claims.tid, claims.did, claims.ast]);
    } catch { throw new ServiceUnavailableException('Authentication service is unavailable'); }
    if (!result.rowCount) throw new UnauthorizedException('Authentication required');
    return { userId: claims.sub, tenantId: claims.tid, deviceId: claims.did, sessionId: claims.sid, authStrength: claims.ast };
  }
  async refresh(input: { refreshToken?: string }, correlation?: string): Promise<Record<string, unknown>> {
    const correlationId = this.correlation(correlation);
    const token = typeof input?.refreshToken === 'string' ? input.refreshToken : '';
    const client = await this.begin();
    try {
      await client.query('BEGIN');
      const found = await client.query(`SELECT r.*,s.user_id,s.tenant_id,s.device_id,s.auth_strength,s.revoked_at,s.expires_at AS session_expires FROM identity.refresh_token r JOIN identity.auth_session s ON s.id=r.session_id WHERE r.token_sha256=$1 FOR UPDATE OF r,s`, [sha256(token)]);
      const row = found.rows[0];
      if (!row) {
        await this.audit(client, { action: 'auth.refresh', resourceType: 'refresh_token', outcome: 'failure', reasonCode: 'credential_invalid', correlationId });
        await client.query('COMMIT');
        throw new UnauthorizedException(GENERIC_AUTH);
      }
      if (row.consumed_at) {
        await this.revokeInTransaction(client, row, 'refresh_replay', correlationId);
        await this.audit(client, { tenantId: row.tenant_id, actorId: row.user_id, action: 'auth.refresh', resourceType: 'session', resourceId: row.session_id, outcome: 'failure', reasonCode: 'refresh_replay', correlationId });
        await client.query('COMMIT');
        throw new UnauthorizedException(GENERIC_AUTH);
      }
      if (row.revoked_at || new Date(row.expires_at).getTime() <= Date.now() || new Date(row.session_expires).getTime() <= Date.now()) {
        const reasonCode = row.revoked_at ? 'session_revoked' : 'credential_expired';
        await this.audit(client, { tenantId: row.tenant_id, actorId: row.user_id, action: 'auth.refresh', resourceType: 'session', resourceId: row.session_id, outcome: 'failure', reasonCode, correlationId });
        await client.query('COMMIT');
        throw new UnauthorizedException(GENERIC_AUTH);
      }
      await client.query('UPDATE identity.refresh_token SET consumed_at=clock_timestamp() WHERE id=$1', [row.id]);
      const refresh = opaque();
      await client.query('INSERT INTO identity.refresh_token(session_id,token_sha256,expires_at) VALUES ($1,$2,$3)', [row.session_id, sha256(refresh), row.session_expires]);
      await client.query('UPDATE identity.auth_session SET last_seen_at=clock_timestamp() WHERE id=$1', [row.session_id]);
      const accessToken = await this.accessToken({ userId: row.user_id, tenantId: row.tenant_id, deviceId: row.device_id, sessionId: row.session_id, authStrength: row.auth_strength });
      await this.audit(client, { tenantId: row.tenant_id, actorId: row.user_id, action: 'auth.refresh', resourceType: 'session', resourceId: row.session_id, outcome: 'success', reasonCode: 'rotated', correlationId });
      await client.query('COMMIT');
      return { accessToken, tokenType: 'Bearer', expiresIn: ACCESS_SECONDS, refreshToken: refresh, refreshExpiresAt: new Date(row.session_expires).toISOString() };
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }
  private async revokeInTransaction(client: PoolClient, row: any, reason: string, correlationId: string): Promise<void> {
    if (row.revoked_at) return;
    await client.query('UPDATE identity.auth_session SET revoked_at=clock_timestamp(),revocation_reason=$2 WHERE id=$1 AND revoked_at IS NULL', [row.session_id ?? row.id, reason]);
    const sessionId = row.session_id ?? row.id;
    const eventId = randomUUID();
    const occurredAt = new Date().toISOString();
    await client.query(`INSERT INTO identity.outbox_event(id,event_name,event_version,producer,entity_id,tenant_id,actor_id,correlation_id,causation_id,occurred_at,payload) VALUES ($1,'security.session_revoked','1.0.0','identity',$2,$3,$4,$5,$5,$6,$7)`, [eventId, sessionId, row.tenant_id, row.user_id, correlationId, occurredAt, JSON.stringify({ eventId, entityId: sessionId, entityType: 'session', sessionId, tenantId: row.tenant_id, actorId: row.user_id, userId: row.user_id, deviceId: row.device_id, reason, correlationId, causationId: correlationId, occurredAt })]);
    await this.audit(client, { tenantId: row.tenant_id, actorId: row.user_id, action: 'security.session_revoked', resourceType: 'session', resourceId: sessionId, outcome: 'success', reasonCode: reason, correlationId });
  }
  async logout(context: IdentityContext, correlation?: string): Promise<{ revoked: boolean }> { await this.revoke(context, context.sessionId, 'logout', correlation); return { revoked: true }; }
  async revoke(context: IdentityContext, sessionId: string, reason = 'self_revoked', correlation?: string): Promise<{ revoked: boolean }> {
    if (!uuidPattern.test(sessionId)) throw new NotFoundException('Session not found');
    const correlationId = this.correlation(correlation);
    const client = await this.begin();
    try {
      await client.query('BEGIN');
      const result = await client.query(`SELECT id AS session_id,user_id,tenant_id,device_id,revoked_at FROM identity.auth_session WHERE id=$1 AND user_id=$2 AND tenant_id=$3 FOR UPDATE`, [sessionId, context.userId, context.tenantId]);
      const row = result.rows[0];
      if (!row) { await client.query('ROLLBACK'); throw new NotFoundException('Session not found'); }
      if (!row.revoked_at) await this.revokeInTransaction(client, row, reason, correlationId);
      await client.query('COMMIT');
      return { revoked: true };
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }
  async listSessions(context: IdentityContext, correlation?: string): Promise<Record<string, unknown>> {
    const client = await this.begin();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`SELECT s.id AS "sessionId",s.device_id AS "deviceId",d.label AS "deviceLabel",s.auth_strength AS "authStrength",s.created_at AS "createdAt",s.last_seen_at AS "lastSeenAt",s.expires_at AS "expiresAt",(s.revoked_at IS NOT NULL) AS "revoked",(s.id=$3) AS "current" FROM identity.auth_session s JOIN identity.registered_device d ON d.id=s.device_id WHERE s.user_id=$1 AND s.tenant_id=$2 ORDER BY s.created_at DESC`, [context.userId, context.tenantId, context.sessionId]);
      await this.audit(client, { tenantId: context.tenantId, actorId: context.userId, action: 'auth.session.list', resourceType: 'session_collection', outcome: 'success', reasonCode: 'self_service', correlationId: this.correlation(correlation) });
      await client.query('COMMIT');
      return { sessions: rows };
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }
}
