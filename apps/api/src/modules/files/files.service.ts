import {
  BadRequestException, ConflictException, ForbiddenException, Injectable,
  NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { PassThrough, Readable } from 'node:stream';
import { Pool } from 'pg';

import { FILES_AUTHORIZATION, FILES_POOL, FILES_SCANNER, FILES_SIZE_POLICY, FILES_STORAGE } from './files.tokens';
import { FileContentError, sniffAllowedMime, validatePdfActiveText } from './content-validation';
import {
  DEFAULT_MAX_FILE_SIZE, FileActor, FileAuthorizationPort, FileSizePolicy, FileUploadReference,
  FilesPool, InitFileUpload, MalwareScanner, MIN_CHUNK_SIZE, ObjectStorage,
  RESUMABLE_THRESHOLD, UploadPartInput,
} from './files.types';

const SHA256 = /^[a-f0-9]{64}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class FilesService {
  constructor(
    @Inject(FILES_POOL) private readonly pool: FilesPool,
    @Inject(FILES_STORAGE) private readonly storage: ObjectStorage,
    @Inject(FILES_SCANNER) private readonly scanner: MalwareScanner,
    @Inject(FILES_AUTHORIZATION) private readonly authorization: FileAuthorizationPort,
    @Inject(FILES_SIZE_POLICY) private readonly sizePolicy: FileSizePolicy,
  ) {}

  async initUpload(actor: FileActor, input: InitFileUpload): Promise<FileUploadReference> {
    const command = validateInit(input);
    const maxSize = this.sizePolicy.maxBytes(actor.tenantId, command.evidenceType) || DEFAULT_MAX_FILE_SIZE;
    if (command.sizeBytes > maxSize) throw new BadRequestException('File exceeds the configured size limit');
    await this.authorize({ ...actor, action: 'file.upload', ownerRef: command.ownerRef });
    const existing = await this.pool.query(
      'SELECT id, state, size_bytes, owner_ref, evidence_type, declared_mime FROM files.attachment WHERE tenant_id = $1 AND idempotency_key = $2',
      [actor.tenantId, command.idempotencyKey],
    );
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (!sameInitRequest(row, command)) throw new ConflictException('Idempotency key was already used for a different upload');
      return reference(String(row.id), String(row.state), command.sizeBytes);
    }
    const attachmentId = uuidV7();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO files.attachment
          (id, tenant_id, owner_ref, evidence_type, size_bytes, declared_mime, idempotency_key, state, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'QUARANTINED',$8)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
         RETURNING id, state, size_bytes`,
        [attachmentId, actor.tenantId, command.ownerRef, command.evidenceType, command.sizeBytes, command.declaredMime, command.idempotencyKey, actor.actorId],
      );
      let row = inserted.rows[0];
      if (!row) {
        const duplicate = await client.query('SELECT id, state, size_bytes, owner_ref, evidence_type, declared_mime FROM files.attachment WHERE tenant_id=$1 AND idempotency_key=$2 FOR UPDATE', [actor.tenantId, command.idempotencyKey]);
        row = duplicate.rows[0];
        if (!row || !sameInitRequest(row, command)) throw new ConflictException('Idempotency key was already used for a different upload');
      } else {
        await appendAudit(client, actor, String(row.id), 'UPLOAD_INITIALIZED', { sizeBytes: command.sizeBytes, declaredMime: command.declaredMime });
      }
      await client.query('COMMIT');
      return reference(String(row.id), String(row.state), Number(row.size_bytes));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async uploadPart(actor: FileActor, attachmentIdInput: string, input: UploadPartInput): Promise<{ partNumber: number; sha256: string; sizeBytes: number }> {
    const attachmentId = requireUuid(attachmentIdInput, 'attachmentId');
    const partNumber = input.partNumber;
    if (!Number.isSafeInteger(partNumber) || partNumber < 1 || !SHA256.test(input.expectedSha256)) throw new BadRequestException('Invalid part number or checksum');
    const attachment = await this.getAuthorizedAttachment(actor, attachmentId, 'file.part');
    if (attachment.state !== 'QUARANTINED' || attachment.completed_at) throw new ConflictException('Upload is not accepting parts');
    const partCount = Math.ceil(Number(attachment.size_bytes) / MIN_CHUNK_SIZE);
    if (partNumber > partCount) throw new BadRequestException('Part number exceeds declared upload size');
    const expectedSize = partNumber < partCount ? MIN_CHUNK_SIZE : Number(attachment.size_bytes) - (partCount - 1) * MIN_CHUNK_SIZE;
    const existing = await this.pool.query('SELECT sha256, size_bytes FROM files.upload_part WHERE attachment_id=$1 AND part_number=$2', [attachmentId, partNumber]);
    if (existing.rows[0]) {
      if (String(existing.rows[0].sha256) !== input.expectedSha256.toLowerCase()) throw new ConflictException('Part was already uploaded with a different checksum');
      return { partNumber, sha256: String(existing.rows[0].sha256), sizeBytes: Number(existing.rows[0].size_bytes) };
    }
    const key = `quarantine/${actor.tenantId}/${attachmentId}/parts/${partNumber}/${randomUUID()}`;
    const pass = new PassThrough({ highWaterMark: 64 * 1024 });
    const put = this.storage.putObject(key, pass, expectedSize, { 'x-amz-meta-attachment-id': attachmentId, 'x-amz-meta-sha256': input.expectedSha256.toLowerCase() });
    void put.catch((error) => pass.destroy(error));
    const hash = createHash('sha256');
    let size = 0;
    try {
      for await (const raw of input.body) {
        const chunk = Buffer.from(raw);
        size += chunk.length;
        if (size > expectedSize) throw new BadRequestException('Part exceeds its required size');
        hash.update(chunk);
        if (!pass.write(chunk)) await new Promise<void>((resolve) => pass.once('drain', resolve));
      }
      pass.end();
      await put;
      if (size !== expectedSize) throw new BadRequestException('Part size does not match the required size');
      const digest = hash.digest('hex');
      if (!safeEqualHex(digest, input.expectedSha256.toLowerCase())) throw new BadRequestException('Part checksum does not match uploaded content');
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const state = await client.query("SELECT state, completed_at FROM files.attachment WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [attachmentId, actor.tenantId]);
        if (state.rows[0]?.state !== 'QUARANTINED' || state.rows[0]?.completed_at) throw new ConflictException('Upload is not accepting parts');
        await client.query('INSERT INTO files.upload_part (attachment_id, part_number, offset_bytes, object_key, size_bytes, sha256) VALUES ($1,$2,$3,$4,$5,$6)', [attachmentId, partNumber, (partNumber - 1) * MIN_CHUNK_SIZE, key, size, digest]);
        await appendAudit(client, actor, attachmentId, 'PART_STORED', { partNumber, sizeBytes: size, sha256: digest });
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
      return { partNumber, sha256: digest, sizeBytes: size };
    } catch (error) {
      pass.destroy();
      await put.catch(() => undefined);
      await this.storage.removeObject(key).catch(() => undefined);
      throw error;
    }
  }

  async completeUpload(actor: FileActor, attachmentIdInput: string, expectedSha256: string): Promise<FileUploadReference> {
    const attachmentId = requireUuid(attachmentIdInput, 'attachmentId');
    if (!SHA256.test(expectedSha256)) throw new BadRequestException('Expected final SHA-256 is invalid');
    const attachment = await this.getAuthorizedAttachment(actor, attachmentId, 'file.complete');
    if (attachment.state === 'AVAILABLE') {
      if (String(attachment.sha256) !== expectedSha256.toLowerCase()) throw new ConflictException('Attachment was completed with a different checksum');
      return reference(attachmentId, 'AVAILABLE', Number(attachment.size_bytes));
    }
    if (attachment.state !== 'QUARANTINED') throw new ConflictException('Attachment cannot be completed');
    if (attachment.completed_at) {
      if (String(attachment.sha256) !== expectedSha256.toLowerCase()) throw new ConflictException('Quarantined upload was completed with a different checksum');
      const scanResult = await this.scanner.scan(await this.storage.getObject(String(attachment.object_key)));
      if (scanResult === 'INFECTED') {
        await this.transition(actor, attachmentId, 'REJECTED', 'MALWARE_DETECTED', { sha256: String(attachment.sha256) });
        return reference(attachmentId, 'REJECTED', Number(attachment.size_bytes));
      }
      await this.transition(actor, attachmentId, 'AVAILABLE', 'MALWARE_SCAN_CLEAN', { sha256: String(attachment.sha256) });
      return reference(attachmentId, 'AVAILABLE', Number(attachment.size_bytes));
    }
    const parts = await this.pool.query('SELECT part_number, object_key, size_bytes, sha256 FROM files.upload_part WHERE attachment_id=$1 ORDER BY part_number', [attachmentId]);
    const totalBytes = Number(attachment.size_bytes);
    const count = Math.ceil(totalBytes / MIN_CHUNK_SIZE);
    if (parts.rows.length !== count) throw new ConflictException('Upload is missing one or more parts');
    for (let index = 0; index < count; index += 1) {
      const part = parts.rows[index];
      if (!part) throw new ConflictException('Upload parts are incomplete');
      const expectedPartSize = index + 1 < count ? MIN_CHUNK_SIZE : totalBytes - index * MIN_CHUNK_SIZE;
      if (Number(part.part_number) !== index + 1 || Number(part.size_bytes) !== expectedPartSize || !SHA256.test(String(part.sha256))) throw new ConflictException('Upload parts are not contiguous or valid');
    }
    const finalKey = `quarantine/${actor.tenantId}/${attachmentId}/object`;
    const hash = createHash('sha256');
    let size = 0;
    let prefix = Buffer.alloc(0);
    let tail = '';
    const output = new PassThrough({ highWaterMark: 64 * 1024 });
    const put = this.storage.putObject(finalKey, output, totalBytes, {
      'x-amz-meta-attachment-id': attachmentId,
      'x-amz-meta-sha256': expectedSha256.toLowerCase(),
      'x-amz-meta-state': 'quarantine',
      'x-amz-meta-declared-mime': String(attachment.declared_mime),
      'Content-Type': String(attachment.declared_mime),
      'Content-Disposition': 'attachment',
    });
    void put.catch((error) => output.destroy(error));
    const stitched = async function* (storage: ObjectStorage, records: Record<string, unknown>[]) {
      for (const part of records) {
        const stream = await storage.getObject(String(part.object_key));
        for await (const chunk of stream) yield Buffer.from(chunk as Uint8Array);
      }
    };
    try {
      for await (const chunk of stitched(this.storage, parts.rows)) {
        size += chunk.length;
        if (size > totalBytes) throw new BadRequestException('Stored parts exceed the declared upload size');
        hash.update(chunk);
        if (prefix.length < 8192) prefix = Buffer.concat([prefix, chunk.subarray(0, 8192 - prefix.length)]);
        if (prefix.subarray(0, 5).toString('ascii') === '%PDF-') {
          const scanText = tail + new TextDecoder('latin1').decode(chunk);
          validatePdfActiveText(scanText);
          tail = scanText.slice(-128);
        }
        if (!output.write(chunk)) await new Promise<void>((resolve) => output.once('drain', resolve));
      }
      output.end();
      await put;
      if (size !== totalBytes) throw new BadRequestException('Stored parts do not match the declared upload size');
      const digest = hash.digest('hex');
      if (!safeEqualHex(digest, expectedSha256.toLowerCase())) throw new BadRequestException('Final SHA-256 does not match uploaded content');
      const actualMime = await sniffAllowedMime(prefix, String(attachment.declared_mime));
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("UPDATE files.attachment SET completed_at=clock_timestamp(), object_key=$2, sha256=$3, actual_mime=$4, updated_at=clock_timestamp() WHERE id=$1 AND state='QUARANTINED'", [attachmentId, finalKey, digest, actualMime]);
        await appendAudit(client, actor, attachmentId, 'OBJECT_QUARANTINED', { sizeBytes: size, sha256: digest, actualMime });
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
      const scanResult = await this.scanner.scan(await this.storage.getObject(finalKey));
      if (scanResult === 'INFECTED') {
        await this.transition(actor, attachmentId, 'REJECTED', 'MALWARE_DETECTED', { sha256: digest });
        return reference(attachmentId, 'REJECTED', totalBytes);
      }
      await this.transition(actor, attachmentId, 'AVAILABLE', 'MALWARE_SCAN_CLEAN', { sha256: digest });
      return reference(attachmentId, 'AVAILABLE', totalBytes);
    } catch (error) {
      output.destroy();
      await put.catch(() => undefined);
      if (error instanceof FileContentError || error instanceof BadRequestException) {
        await this.transition(actor, attachmentId, 'REJECTED', 'CONTENT_REJECTED', { reason: safeError(error) }).catch(() => undefined);
        await this.storage.removeObject(finalKey).catch(() => undefined);
      }
      throw error;
    } finally {
      for (const part of parts.rows) await this.storage.removeObject(String(part.object_key)).catch(() => undefined);
    }
  }

  async getAvailableReference(actor: FileActor, attachmentIdInput: string): Promise<FileUploadReference & { sha256: string; mime: string; ownerRef: string; evidenceType: string }> {
    const attachmentId = requireUuid(attachmentIdInput, 'attachmentId');
    const attachment = await this.getAuthorizedAttachment(actor, attachmentId, 'file.read');
    if (attachment.state !== 'AVAILABLE') throw new NotFoundException('Attachment is not available');
    return {
      ...reference(attachmentId, 'AVAILABLE', Number(attachment.size_bytes)),
      sha256: String(attachment.sha256), mime: String(attachment.actual_mime),
      ownerRef: String(attachment.owner_ref), evidenceType: String(attachment.evidence_type),
    };
  }

  private async getAuthorizedAttachment(actor: FileActor, attachmentId: string, action: 'file.part' | 'file.complete' | 'file.read'): Promise<Record<string, unknown>> {
    const result = await this.pool.query('SELECT * FROM files.attachment WHERE id=$1 AND tenant_id=$2', [attachmentId, actor.tenantId]);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Attachment not found');
    await this.authorize({ ...actor, action, ownerRef: String(row.owner_ref), attachmentId });
    return row;
  }

  private async authorize(request: Parameters<FileAuthorizationPort['authorize']>[0]): Promise<void> {
    if (!await this.authorization.authorize(request)) throw new ForbiddenException('Permission denied');
  }

  private async transition(actor: FileActor, attachmentId: string, state: 'AVAILABLE' | 'REJECTED', event: string, details: Record<string, unknown>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const changed = await client.query(
        `UPDATE files.attachment
         SET state=$2,
             scan_status=CASE WHEN $3='MALWARE_SCAN_CLEAN' THEN 'CLEAN' WHEN $3='MALWARE_DETECTED' THEN 'INFECTED' ELSE scan_status END,
             malware_scanned_at=CASE WHEN $3 IN ('MALWARE_SCAN_CLEAN','MALWARE_DETECTED') THEN clock_timestamp() ELSE malware_scanned_at END,
             updated_at=clock_timestamp()
         WHERE id=$1 AND state='QUARANTINED' RETURNING id`,
        [attachmentId, state, event],
      );
      if (changed.rows.length) await appendAudit(client, actor, attachmentId, event, details);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}

function validateInit(input: InitFileUpload): InitFileUpload {
  if (!input || typeof input !== 'object') throw new BadRequestException('Upload metadata is required');
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1) throw new BadRequestException('sizeBytes must be a positive safe integer');
  for (const [name, value, max] of [['ownerRef', input.ownerRef, 300], ['evidenceType', input.evidenceType, 100], ['idempotencyKey', input.idempotencyKey, 200]] as const) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new BadRequestException(`${name} is invalid`);
  }
  if (typeof input.declaredMime !== 'string' || !/^[\w.+-]+\/[\w.+-]+$/.test(input.declaredMime)) throw new BadRequestException('declaredMime is invalid');
  return { ...input, ownerRef: input.ownerRef.trim(), evidenceType: input.evidenceType.trim(), declaredMime: input.declaredMime.toLowerCase() };
}

function sameInitRequest(row: Record<string, unknown>, command: InitFileUpload): boolean {
  return Number(row.size_bytes) === command.sizeBytes
    && String(row.owner_ref) === command.ownerRef
    && String(row.evidence_type) === command.evidenceType
    && String(row.declared_mime) === command.declaredMime;
}

function requireUuid(value: string, name: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new BadRequestException(`${name} must be a UUID`);
  return value;
}

function reference(attachmentId: string, state: string, sizeBytes: number): FileUploadReference {
  return Object.freeze({ attachmentId, state: state as FileUploadReference['state'], sizeBytes, chunkSizeBytes: MIN_CHUNK_SIZE, resumable: sizeBytes >= RESUMABLE_THRESHOLD });
}

function safeEqualHex(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex'); const b = Buffer.from(right, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function uuidV7(): string {
  const bytes = Buffer.from(randomUUID().replaceAll('-', ''), 'hex');
  let now = BigInt(Date.now());
  for (let index = 5; index >= 0; index -= 1) { bytes[index] = Number(now & 0xffn); now >>= 8n; }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

async function appendAudit(client: { query(sql: string, values?: unknown[]): Promise<unknown> }, actor: FileActor, attachmentId: string, event: string, details: Record<string, unknown>): Promise<void> {
  await client.query('INSERT INTO files.audit_entry (tenant_id, attachment_id, actor_id, correlation_id, event_type, details) VALUES ($1,$2,$3,$4,$5,$6::jsonb)', [actor.tenantId, attachmentId, actor.actorId, actor.correlationId ?? null, event, JSON.stringify(details)]);
}

function safeError(error: unknown): string { return error instanceof Error ? error.message.slice(0, 200) : 'invalid content'; }
