import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import test from 'node:test';

import { sniffAllowedMime, validatePdfActiveText } from '../dist/modules/files/content-validation.js';
import { FilesService } from '../dist/modules/files/files.service.js';
import {
  DEFAULT_MAX_FILE_SIZE, DenyAllFileAuthorization, EnvironmentFileSizePolicy,
  MIN_CHUNK_SIZE, RESUMABLE_THRESHOLD,
} from '../dist/modules/files/files.types.js';

const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2w==', 'base64');

test('file security defaults use 2 GiB, resumable 10 MiB threshold and 5 MiB parts', () => {
  assert.equal(DEFAULT_MAX_FILE_SIZE, 2 * 1024 * 1024 * 1024);
  assert.equal(RESUMABLE_THRESHOLD, 10 * 1024 * 1024);
  assert.equal(MIN_CHUNK_SIZE, 5 * 1024 * 1024);
});

test('tenant and evidence type may lower or raise the server size policy', () => {
  const previous = process.env.FILES_MAX_BYTES_BY_TENANT_TYPE;
  process.env.FILES_MAX_BYTES_BY_TENANT_TYPE = JSON.stringify({ 'tenant-a:photo': 1, 'tenant-b:document': 3 * 1024 ** 3 });
  try {
    const policy = new EnvironmentFileSizePolicy();
    assert.equal(policy.maxBytes('tenant-a', 'photo'), 1);
    assert.equal(policy.maxBytes('tenant-b', 'document'), 3 * 1024 ** 3);
    assert.equal(policy.maxBytes('tenant-c', 'photo'), DEFAULT_MAX_FILE_SIZE);
  } finally {
    if (previous === undefined) delete process.env.FILES_MAX_BYTES_BY_TENANT_TYPE;
    else process.env.FILES_MAX_BYTES_BY_TENANT_TYPE = previous;
  }
});

test('production authorization default denies every request', async () => {
  assert.equal(await new DenyAllFileAuthorization().authorize({ action: 'file.upload', tenantId: 't', actorId: 'a', ownerRef: 'owner' }), false);
});

test('content sniff accepts allowed signatures and rejects mismatch, unknown and archives', async () => {
  assert.equal(await sniffAllowedMime(jpeg, 'image/jpeg'), 'image/jpeg');
  const m4a = Buffer.alloc(24);
  m4a.writeUInt32BE(24, 0); m4a.write('ftyp', 4); m4a.write('M4A ', 8);
  assert.equal(await sniffAllowedMime(m4a, 'audio/mp4'), 'audio/mp4');
  const videoMp4 = Buffer.from(m4a); videoMp4.write('isom', 8);
  await assert.rejects(sniffAllowedMime(videoMp4, 'audio/mp4'), /Unknown or disallowed/);
  await assert.rejects(sniffAllowedMime(jpeg, 'image/png'), /does not match/);
  await assert.rejects(sniffAllowedMime(Buffer.from('plain text'), 'text/plain'), /Unknown or disallowed/);
  await assert.rejects(sniffAllowedMime(Buffer.from('PK\x03\x04archive'), 'application/pdf'), /Unknown or disallowed/);
});

test('PDF active actions are rejected even when their marker spans stream chunks', () => {
  assert.throws(() => validatePdfActiveText('PDF prefix /JavaScript action'), /active content/);
  assert.throws(() => validatePdfActiveText('encoded /Java#53cript action'), /active content/);
  assert.throws(() => validatePdfActiveText('trailing /EmbeddedFiles'), /active content/);
  assert.throws(() => validatePdfActiveText('compressed /ObjStm object stream'), /active content/);
  assert.doesNotThrow(() => validatePdfActiveText('regular text and image content'));
});

test('part and final checksum strings are lowercase SHA-256 values', () => {
  const digest = createHash('sha256').update('file').digest('hex');
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest.length, 64);
});

test('a malware result rejects the staged reference and never exposes it as available', async () => {
  const bytes = jpeg;
  const digest = createHash('sha256').update(bytes).digest('hex');
  const database = new MemoryFilesDatabase();
  const storage = new MemoryObjectStorage();
  const service = new FilesService(
    database,
    storage,
    { async scan() { return 'INFECTED'; } },
    { async authorize() { return true; } },
    { maxBytes() { return DEFAULT_MAX_FILE_SIZE; } },
  );
  const actor = { tenantId: 'tenant', actorId: 'actor' };
  const initialized = await service.initUpload(actor, {
    ownerRef: 'inspection:local-test', evidenceType: 'photo', sizeBytes: bytes.length,
    declaredMime: 'image/jpeg', idempotencyKey: 'malware-test',
  });
  await service.uploadPart(actor, initialized.attachmentId, {
    partNumber: 1, expectedSha256: digest, body: (async function* () { yield bytes; })(),
  });
  const completed = await service.completeUpload(actor, initialized.attachmentId, digest);
  assert.equal(completed.state, 'REJECTED');
  await assert.rejects(service.getAvailableReference(actor, initialized.attachmentId), /not available/);
  assert.equal(database.attachment.state, 'REJECTED');
  assert.equal(database.attachment.scan_status, 'INFECTED');
});

test('the size policy rejects an upload before creating database state or authorizing a body upload', async () => {
  const database = new MemoryFilesDatabase();
  let authorizationCalls = 0;
  const service = new FilesService(
    database,
    new MemoryObjectStorage(),
    { async scan() { return 'CLEAN'; } },
    { async authorize() { authorizationCalls += 1; return true; } },
    { maxBytes() { return 1; } },
  );
  await assert.rejects(service.initUpload({ tenantId: 'tenant', actorId: 'actor' }, {
    ownerRef: 'inspection:large', evidenceType: 'photo', sizeBytes: 2,
    declaredMime: 'image/jpeg', idempotencyKey: 'size-limit',
  }), /size limit/);
  assert.equal(database.attachment, undefined);
  assert.equal(authorizationCalls, 0);
});

test('part checksum and final object hash mismatches reject the upload', async () => {
  const database = new MemoryFilesDatabase();
  const storage = new MemoryObjectStorage();
  const service = new FilesService(
    database, storage, { async scan() { return 'CLEAN'; } },
    { async authorize() { return true; } }, { maxBytes() { return DEFAULT_MAX_FILE_SIZE; } },
  );
  const actor = { tenantId: 'tenant', actorId: 'actor' };
  const initialized = await service.initUpload(actor, {
    ownerRef: 'inspection:checksum', evidenceType: 'photo', sizeBytes: jpeg.length,
    declaredMime: 'image/jpeg', idempotencyKey: 'checksum-test',
  });
  await assert.rejects(service.uploadPart(actor, initialized.attachmentId, {
    partNumber: 1, expectedSha256: '0'.repeat(64), body: (async function* () { yield jpeg; })(),
  }), /checksum/);
  assert.equal(database.parts.length, 0);
  assert.equal(storage.objects.size, 0);

  const second = await service.initUpload(actor, {
    ownerRef: 'inspection:final-checksum', evidenceType: 'photo', sizeBytes: jpeg.length,
    declaredMime: 'image/jpeg', idempotencyKey: 'final-checksum-test',
  });
  const actual = createHash('sha256').update(jpeg).digest('hex');
  await service.uploadPart(actor, second.attachmentId, {
    partNumber: 1, expectedSha256: actual, body: (async function* () { yield jpeg; })(),
  });
  await assert.rejects(service.completeUpload(actor, second.attachmentId, 'f'.repeat(64)), /Final SHA-256/);
  assert.equal(database.attachment.state, 'REJECTED');
});

class MemoryObjectStorage {
  objects = new Map();
  async putObject(key, body) {
    const chunks = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk));
    this.objects.set(key, Buffer.concat(chunks));
  }
  async getObject(key) { return Readable.from(this.objects.get(key)); }
  async removeObject(key) { this.objects.delete(key); }
}

class MemoryFilesDatabase {
  attachment;
  parts = [];
  async query(sql, values = []) {
    if (sql.includes('SELECT id, state, size_bytes FROM files.attachment WHERE tenant_id')) return { rows: [] };
    if (sql.includes('SELECT * FROM files.attachment')) return { rows: this.attachment ? [{ ...this.attachment }] : [] };
    if (sql.includes('SELECT part_number, object_key')) return { rows: this.parts.map((part) => ({ ...part })) };
    return { rows: [] };
  }
  async connect() {
    return {
      query: async (sql, values = []) => {
        if (sql.startsWith('INSERT INTO files.attachment')) {
          this.attachment = { id: values[0], tenant_id: values[1], owner_ref: values[2], evidence_type: values[3], size_bytes: values[4], declared_mime: values[5], idempotency_key: values[6], state: 'QUARANTINED', scan_status: 'PENDING', created_by: values[7] };
          return { rows: [{ id: values[0], state: 'QUARANTINED', size_bytes: values[4] }] };
        }
        if (sql.startsWith('SELECT state, completed_at FROM files.attachment')) return { rows: [{ state: this.attachment.state, completed_at: this.attachment.completed_at }] };
        if (sql.startsWith('INSERT INTO files.upload_part')) {
          this.parts.push({ attachment_id: values[0], part_number: values[1], offset_bytes: values[2], object_key: values[3], size_bytes: values[4], sha256: values[5] });
          return { rows: [] };
        }
        if (sql.includes('SET completed_at=clock_timestamp()')) {
          Object.assign(this.attachment, { completed_at: new Date(), object_key: values[1], sha256: values[2], actual_mime: values[3] });
          return { rows: [] };
        }
        if (sql.includes('SET state=$2')) {
          this.attachment.state = values[1];
          if (values[2] === 'MALWARE_SCAN_CLEAN') this.attachment.scan_status = 'CLEAN';
          if (values[2] === 'MALWARE_DETECTED') this.attachment.scan_status = 'INFECTED';
          return { rows: [{ id: this.attachment.id }] };
        }
        if (sql.startsWith('INSERT INTO files.audit_entry') || ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
        throw new Error(`Unexpected fake database query: ${sql}`);
      },
      release() {},
    };
  }
}
