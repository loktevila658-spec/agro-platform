import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID, sign } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { executeCommandEffect } from '../../common/command-boundary';
import { IdentityService } from '../identity/identity.service';
import { SyncRegistry } from './sync.registry';
import { SYNC_POOL } from './sync.tokens';
import { decodeCursor, encodeCursor, stableJson } from './sync.crypto';
import { AttachmentIntent, Cursor, PushRequest, SyncActor, SyncChange, SyncCommand, SyncConflict, SyncResult } from './sync.types';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const v7 = /^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
export function validateAttachment(a: AttachmentIntent): void {
  if (!object(a) || !v7.test(a.localAttachmentId) || !text(a.ownerRef) || !text(a.evidenceType) || !/^[a-f0-9]{64}$/.test(a.sha256) || !['image/jpeg','image/png','application/pdf','audio/mpeg','audio/mp4'].includes(a.mime) || !positive(a.sizeBytes) || a.sizeBytes > 2*1024*1024*1024 || typeof a.required !== 'boolean') throw new BadRequestException('Invalid attachment intent');
}
export function validatePush(body: PushRequest): void {
  if (!object(body) || !uuid.test(body.deviceId) || !positive(body.scopeVersion) || body.schemaVersion !== 1) throw new BadRequestException('SYNC_SCHEMA_UNSUPPORTED');
  if (!Array.isArray(body.commands) || body.commands.length > 50 || Buffer.byteLength(JSON.stringify(body)) > 1048576) throw new BadRequestException('SYNC_BATCH_LIMIT');
  const ids = new Set<string>(); let seq = 0;
  for (const c of body.commands) {
    if (!object(c) || !v7.test(c.localCommandId) || c.idempotencyKey !== c.localCommandId || ids.has(c.localCommandId) || !positive(c.deviceSeq) || c.deviceSeq <= seq || !object(c.aggregate) || !text(c.aggregate.type) || !text(c.aggregate.id) || !text(c.type) || !positive(c.commandVersion) || !text(c.offlineAuthId) || !text(c.observedAt, 64) || !/^\d{4}-.*Z$/.test(c.observedAt) || !Number.isFinite(Date.parse(c.observedAt)) || (c.baseVersion !== undefined && (!Number.isSafeInteger(c.baseVersion) || c.baseVersion < 0)) || !object(c.payload) || !object(c.provenance) || !Array.isArray(c.attachments) || c.attachments.length > 100) throw new BadRequestException('Invalid command envelope');
    ids.add(c.localCommandId); seq = c.deviceSeq;
    for (const a of c.attachments) { validateAttachment(a); if (a.ownerRef !== `${c.aggregate.type}:${c.aggregate.id}`) throw new BadRequestException('ATTACHMENT_OWNER_MISMATCH'); }
  }
}
@Injectable()
export class SyncService {
  constructor(@Inject(SYNC_POOL) readonly pool: Pool, readonly registry: SyncRegistry, readonly identity: IdentityService) {}
  async onModuleDestroy(): Promise<void> { await this.pool.end(); }
  private authority(): void {
    if (process.env.AGRO_DEPLOYMENT_MODE !== 'LOCAL_PRIMARY') throw new ForbiddenException('AUTHORITY_MODE_MISMATCH');
  }
  private key(): string {
    const key = process.env.SYNC_CURSOR_KEY;
    if (!key || Buffer.byteLength(key) < 32) throw new ServiceUnavailableException('Sync cursor key unavailable');
    return key;
  }
  async actor(authorization?: string): Promise<SyncActor> { this.authority(); return this.identity.authenticate(authorization); }
  private async device(client: PoolClient | Pool, actor: SyncActor, deviceId: string, scopeVersion?: number): Promise<any> {
    if (deviceId !== actor.deviceId) throw new ForbiddenException('Device binding mismatch');
    const { rows } = await client.query('SELECT * FROM sync.device WHERE tenant_id=$1 AND device_id=$2 AND user_id=$3 AND revoked_at IS NULL', [actor.tenantId, deviceId, actor.userId]);
    const row = rows[0];
    if (!row) throw new ForbiddenException('Device is not registered');
    if (scopeVersion !== undefined && row.scope_version !== scopeVersion) throw new ConflictException('SCOPE_VERSION_MISMATCH');
    return row;
  }
  async registeredActor(authorization?:string):Promise<SyncActor> { const actor=await this.actor(authorization);await this.device(this.pool,actor,actor.deviceId);return actor; }
  async register(authorization: string | undefined, body: { deviceId: string; installationId: string; schemaVersion: number }): Promise<Record<string, unknown>> {
    const actor = await this.actor(authorization);
    if (!body || !uuid.test(body.installationId) || body.deviceId !== actor.deviceId || body.schemaVersion !== 1) throw new BadRequestException('SYNC_SCHEMA_UNSUPPORTED');
    const row = await this.pool.query(`INSERT INTO sync.device(tenant_id,device_id,user_id,installation_id) VALUES($1,$2,$3,$4)
      ON CONFLICT(tenant_id,device_id) DO UPDATE SET device_id=EXCLUDED.device_id
      WHERE sync.device.user_id=EXCLUDED.user_id AND sync.device.installation_id=EXCLUDED.installation_id AND sync.device.revoked_at IS NULL RETURNING scope_version`, [actor.tenantId, actor.deviceId, actor.userId, body.installationId]);
    if (!row.rowCount) throw new ForbiddenException('Device binding mismatch');
    return { deviceId:actor.deviceId, authorityMode:'LOCAL_PRIMARY', schemaVersion:1, scopeVersion:row.rows[0].scope_version };
  }
  private cursor(actor: SyncActor, scope: number, seq: string): string {
    return encodeCursor({ tenantId:actor.tenantId,userId:actor.userId,deviceId:actor.deviceId, scopeVersion:scope, schemaVersion:1, seq, issuedAt:Date.now() }, this.key());
  }
  async bootstrap(authorization: string | undefined, body: { deviceId: string; schemaVersion: number }): Promise<Record<string, unknown>> {
    const actor = await this.actor(authorization);
    if (body?.schemaVersion !== 1) throw new BadRequestException('SYNC_SCHEMA_UNSUPPORTED');
    const device = await this.device(this.pool, actor, body.deviceId);
    // Replaying retained deltas is safe; do not skip pre-existing authorized data.
    const clock = await this.pool.query('SELECT retained_from FROM sync.tenant_clock WHERE tenant_id=$1', [actor.tenantId]);
    if (BigInt(clock.rows[0]?.retained_from ?? 0) > 0n) throw new ServiceUnavailableException('Bootstrap snapshot adapter required after feed compaction');
    const grants = [];
    for (const handler of this.registry.all()) {
      const policy = await handler.offlinePolicy?.(actor);
      if (!policy || !policy.owners.length) continue;
      if (!positive(policy.ttlSeconds) || (policy.risk === 'O1' && policy.ttlSeconds > 7*86400)) throw new ServiceUnavailableException('Invalid offline policy');
      const privateKey = process.env.SYNC_GRANT_PRIVATE_KEY;
      if (!privateKey) throw new ServiceUnavailableException('Offline signing key unavailable');
      const now = Date.now();
      const value = { id:randomUUID(), tenant:actor.tenantId, user:actor.userId, deviceId:actor.deviceId, scopeVersion:device.scope_version, issuedAt:new Date(now).toISOString(), expiresAt:new Date(now+policy.ttlSeconds*1000).toISOString(), commands:[handler.commandType], owners:[...policy.owners].sort(), risk:policy.risk };
      const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
      const signedEnvelope = `${payload}.${sign(null, Buffer.from(payload), privateKey).toString('base64url')}`;
      grants.push({ ...value, signedEnvelope });
    }
    return { authorityMode:'LOCAL_PRIMARY', schemaVersion:1, scopeVersion:device.scope_version, initialCursor:this.cursor(actor,device.scope_version,'0'), grants };
  }
  async push(authorization: string | undefined, body: PushRequest): Promise<{ results:SyncResult[]; serverTime:string }> {
    validatePush(body);
    await this.actor(authorization);
    const results: SyncResult[] = [];
    // Each command has its own transaction. A dropped/partial batch is recovered
    // by resending the original IDs; no batch-wide synthetic command identity.
    for (const command of body.commands) results.push(await this.command(authorization, body, command));
    return { results, serverTime:new Date().toISOString() };
  }
  private async command(authorization: string | undefined, body: PushRequest, command: SyncCommand): Promise<SyncResult> {
    const actor = await this.actor(authorization); // re-authenticate every command, including replays
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO sync.tenant_clock(tenant_id) VALUES($1) ON CONFLICT DO NOTHING',[actor.tenantId]);
      await client.query('SELECT seq FROM sync.tenant_clock WHERE tenant_id=$1 FOR UPDATE',[actor.tenantId]);
      const device = await this.device(client,actor,body.deviceId,body.scopeVersion);
      const handler = this.registry.get(command.type);
      const allowed = !!handler && await handler.authorize(client,actor,command);
      const hash = createHash('sha256').update(stableJson(command)).digest('hex');
      const previous = (await client.query('SELECT * FROM sync.command_receipt WHERE tenant_id=$1 AND command_id=$2',[actor.tenantId,command.localCommandId])).rows[0];
      if (previous) {
        if (previous.payload_hash !== hash || previous.user_id !== actor.userId || previous.device_id !== actor.deviceId) throw new ConflictException('IDEMPOTENCY_PAYLOAD_MISMATCH');
        if (!allowed && previous.result.status !== 'REJECTED') throw new ForbiddenException('PERMISSION_CHANGED_OFFLINE');
        await client.query('COMMIT'); return previous.result;
      }
      if (command.deviceSeq <= Number(device.last_seq)) throw new ConflictException('DEVICE_SEQUENCE_DECREASE');
      let result: SyncResult = { localCommandId:command.localCommandId,status:'REJECTED',code:'PERMISSION_CHANGED_OFFLINE',receivedAt:new Date().toISOString() };
      await client.query('SAVEPOINT domain_effect');
      try {
        if (allowed && handler) {
          if (command.commandVersion !== handler.version) result.code = 'SYNC_SCHEMA_UNSUPPORTED';
          else {
            if (handler.requiresVersion && command.baseVersion === undefined) throw new BadRequestException('Expected version required');
            for (const attachment of command.attachments) await this.referenceIntent(client,actor,attachment);
            if (command.attachments.some(a => a.required && !a.localAttachmentId)) throw new BadRequestException('Required evidence missing');
            const missing = await client.query(`SELECT 1 FROM sync.attachment_reference WHERE tenant_id=$1 AND local_id=ANY($2::uuid[]) AND remote_id IS NULL`,[actor.tenantId,command.attachments.filter(a=>a.required).map(a=>a.localAttachmentId)]);
            if (missing.rowCount) result = { ...result,status:'ACTION_REQUIRED',code:'PENDING_ATTACHMENT',localIntent:command };
            else {
              const value = await executeCommandEffect({ transaction:client,expectedVersion:handler.requiresVersion ? command.baseVersion : undefined,
                assertVersion:async tx => { if(!await handler.assertVersion!(tx,actor,command))throw new SyncConflict('VERSION_CONFLICT',await handler.currentState!(tx,actor,command));return true; }, effect:()=>handler.execute(client,actor,command) });
              await this.appendChanges(client,actor.tenantId,value.changes);
              result = { localCommandId:command.localCommandId,status:'ACCEPTED',canonical:value.canonical,aggregateVersion:value.aggregateVersion,receivedAt:result.receivedAt };
            }
          }
        }
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT domain_effect');
        if (error instanceof SyncConflict || error instanceof ConflictException) result = { ...result,status:'CONFLICT',code:error instanceof SyncConflict ? error.kind : 'VERSION_CONFLICT',canonical:error instanceof SyncConflict ? error.snapshot : {},localIntent:command };
        else if (error instanceof BadRequestException || error instanceof ForbiddenException) result = { ...result,status:'REJECTED',code:error instanceof ForbiddenException ? 'PERMISSION_CHANGED_OFFLINE' : 'DOMAIN_REJECTED',localIntent:command };
        else throw error;
      }
      await client.query('INSERT INTO sync.command_receipt(tenant_id,command_id,idempotency_key,device_id,user_id,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)',[actor.tenantId,command.localCommandId,command.idempotencyKey,actor.deviceId,actor.userId,hash,result]);
      if (result.status === 'CONFLICT') await client.query('INSERT INTO sync.conflict_record(tenant_id,command_id,conflict_type,local_intent,server_state) VALUES($1,$2,$3,$4,$5)',[actor.tenantId,command.localCommandId,result.code,command,result.canonical]);
      await client.query('UPDATE sync.device SET last_seq=$3 WHERE tenant_id=$1 AND device_id=$2',[actor.tenantId,actor.deviceId,command.deviceSeq]);
      await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK').catch(()=>undefined); throw error; } finally { client.release(); }
  }
  async referenceIntent(client: PoolClient, actor: SyncActor, attachment: AttachmentIntent): Promise<void> {
    validateAttachment(attachment);
    await client.query('INSERT INTO sync.attachment_reference(tenant_id,local_id,user_id,device_id,intent) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[actor.tenantId,attachment.localAttachmentId,actor.userId,actor.deviceId,attachment]);
    const row = (await client.query('SELECT * FROM sync.attachment_reference WHERE tenant_id=$1 AND local_id=$2',[actor.tenantId,attachment.localAttachmentId])).rows[0];
    if (row.user_id !== actor.userId || row.device_id !== actor.deviceId || stableJson(row.intent) !== stableJson(attachment)) throw new ConflictException('ATTACHMENT_OWNER_MISMATCH');
  }
  /** Called only inside the domain command transaction. Counter lock orders
   * COMMIT visibility, unlike PostgreSQL sequences allocated before commit. */
  async appendChanges(client: PoolClient, tenantId: string, changes: SyncChange[]): Promise<void> {
    for (const c of changes) {
      if (!c.visibleUserIds.length || !c.visibleUserIds.every(id=>uuid.test(id)) || !object(c.projection) || !['UPSERT','PURGE'].includes(c.op)) throw Error('Invalid owner sync projection');
      if (Buffer.byteLength(JSON.stringify(c)) > 1024*1024) throw Error('Projection exceeds bounded pull page');
      await client.query('INSERT INTO sync.tenant_clock(tenant_id) VALUES($1) ON CONFLICT DO NOTHING',[tenantId]);
      const { rows } = await client.query('UPDATE sync.tenant_clock SET seq=seq+1 WHERE tenant_id=$1 RETURNING seq',[tenantId]);
      await client.query('INSERT INTO sync.change(tenant_id,seq,entity_type,entity_id,entity_version,op,projection,visible_user_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[tenantId,rows[0].seq,c.entityType,c.entityId,c.entityVersion ?? null,c.op,c.projection,c.visibleUserIds]);
    }
  }
  private async readCursor(actor: SyncActor, body: { deviceId:string; scopeVersion:number; cursor:string }): Promise<Cursor> {
    await this.device(this.pool,actor,body.deviceId,body.scopeVersion);
    const cursor = decodeCursor(body.cursor,this.key());
    if (cursor.tenantId !== actor.tenantId || cursor.userId !== actor.userId || cursor.deviceId !== actor.deviceId || cursor.scopeVersion !== body.scopeVersion) throw Error('RESET_REQUIRED');
    const clock = (await this.pool.query('SELECT seq,retained_from FROM sync.tenant_clock WHERE tenant_id=$1',[actor.tenantId])).rows[0];
    if (BigInt(cursor.seq) < BigInt(clock?.retained_from ?? 0) || BigInt(cursor.seq) > BigInt(clock?.seq ?? 0)) throw Error('RESET_REQUIRED');
    return cursor;
  }
  async pull(authorization: string | undefined, body: { deviceId:string; scopeVersion:number; cursor:string; limit?:number }): Promise<Record<string,unknown>> {
    const actor = await this.actor(authorization);
    if (!body || !positive(body.limit ?? 500) || (body.limit ?? 500)>500) throw new BadRequestException('SYNC_BATCH_LIMIT');
    let cursor: Cursor;
    try { cursor = await this.readCursor(actor,body); } catch(error) {
      if (error instanceof ForbiddenException) throw error;
      return { changes:[],resetRequired:true,code:error instanceof Error && error.message==='CURSOR_EXPIRED' ? 'CURSOR_EXPIRED' : 'RESET_REQUIRED',hasMore:false,nextCursor:body.cursor };
    }
    const rows = (await this.pool.query(`SELECT seq::text,entity_type AS "entityType",entity_id AS "entityId",entity_version::int AS "entityVersion",op,projection FROM sync.change
      WHERE tenant_id=$1 AND seq>$2 AND $3::uuid=ANY(visible_user_ids) ORDER BY seq LIMIT $4`,[actor.tenantId,cursor.seq,actor.userId,(body.limit??500)+1])).rows;
    const changes = []; let bytes = 4096;
    for (const raw of rows.slice(0,body.limit??500)) { const row = await this.registry.canRead(actor,raw.entityType,raw.entityId) ? raw : {seq:raw.seq,entityType:raw.entityType,entityId:raw.entityId,op:'PURGE',projection:{}}; const size = Buffer.byteLength(JSON.stringify(row)); if (bytes+size>2*1024*1024) break; changes.push(row); bytes += size; }
    const seq = changes.at(-1)?.seq ?? cursor.seq;
    return { changes,nextCursor:this.cursor(actor,body.scopeVersion,seq),hasMore:rows.length>changes.length,resetRequired:false };
  }
  async ack(authorization: string | undefined, body: { deviceId:string; scopeVersion:number; cursor:string }): Promise<{ acknowledged:boolean }> {
    const actor = await this.actor(authorization);
    let cursor: Cursor; try { cursor = await this.readCursor(actor,body); } catch { throw new BadRequestException('RESET_REQUIRED'); }
    await this.pool.query(`INSERT INTO sync.ack(tenant_id,device_id,user_id,seq,cursor) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,device_id) DO UPDATE SET seq=EXCLUDED.seq,cursor=EXCLUDED.cursor,acknowledged_at=clock_timestamp() WHERE sync.ack.seq<=EXCLUDED.seq`,[actor.tenantId,actor.deviceId,actor.userId,cursor.seq,body.cursor]);
    return { acknowledged:true };
  }
  async health(authorization?: string): Promise<Record<string,unknown>> { await this.actor(authorization); return { authorityMode:'LOCAL_PRIMARY',schemaVersion:1,serverTime:new Date().toISOString() }; }
}
