import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const { Client } = require('minio');
const { FilesService } = require('../dist/modules/files/files.service.js');
const { ClamAvScanner } = require('../dist/modules/files/clamav-scanner.js');
const { MinioObjectStorage } = require('../../../packages/storage/src/index.cjs');

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const postgisImage = process.env.POSTGIS_TEST_IMAGE ?? 'agroplatform/wp49-003-postgis:test';
const minioImage = process.env.MINIO_TEST_IMAGE ?? 'netiedge/minio@sha256:e6c282005f6c8496256f8fd07e9a8b82073344c217ea87436d9af888db67eb0e';
const clamavImage = process.env.CLAMAV_TEST_IMAGE ?? 'clamav/clamav:1.4.6-debian13-slim';
const jpegHeader = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2w==', 'base64');
const EICAR = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');

function docker(args) {
  return spawnSync('docker', args, { cwd: repositoryRoot, encoding: 'utf8' });
}

function dockerOk(args, label) {
  const result = docker(args);
  assert.equal(result.status, 0, `${label} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function sleep(ms) { return new Promise((resolveWait) => setTimeout(resolveWait, ms)); }

async function waitFor(check, label, timeout = 180_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try { if (await check()) return; } catch (error) { lastError = error; }
    await sleep(500);
  }
  throw new Error(`${label} did not become ready${lastError ? `: ${lastError.message}` : ''}`);
}

function sha256(data) { return createHash('sha256').update(data).digest('hex'); }

async function* oneChunk(data) { yield data; }

function testActor(tenantId, actorId) {
  return {
    tenantId,
    actorId,
    correlationId: randomUUID(),
  };
}

test('WP49-017 streams resumable parts to MinIO, verifies quarantine, ClamAV retry and clean/malware scan results', { timeout: 900_000 }, async (t) => {
  const suffix = `${process.pid}-${randomUUID().slice(0, 8)}`;
  const postgres = `agro-wp49-017-pg-${suffix}`;
  const minio = `agro-wp49-017-minio-${suffix}`;
  const clamav = `agro-wp49-017-clamav-${suffix}`;
  const password = `wp49_017_${randomUUID()}`;
  const dbPort = 35000 + (process.pid % 1000);
  const s3Port = 36000 + (process.pid % 1000);
  const scannerPort = 37000 + (process.pid % 1000);
  const minioUser = `wp49${process.pid}`;
  const minioPassword = `wp49_017_minio_${randomUUID()}`;
  const temp = await mkdtemp(join(tmpdir(), 'agro-wp49-017-'));
  const psqlWrapper = join(temp, 'psql');
  let pool;
  let started = [];

  try {
    const imageCheck = docker(['image', 'inspect', postgisImage]);
    if (imageCheck.status !== 0 && !process.env.POSTGIS_TEST_IMAGE) dockerOk(['build', '--tag', postgisImage, '--file', 'database/test/Dockerfile.postgis', '.'], 'PostGIS image build');
    dockerOk(['run', '--detach', '--rm', '--publish', `127.0.0.1:${dbPort}:5432`, '--name', postgres, '--volume', `${repositoryRoot}:${repositoryRoot}:ro`, '--env', `POSTGRES_PASSWORD=${password}`, '--env', 'POSTGRES_DB=agro_test', postgisImage], 'PostgreSQL start');
    started.push(postgres);
    dockerOk(['run', '--detach', '--rm', '--publish', `127.0.0.1:${s3Port}:9000`, '--name', minio, '--env', `MINIO_ROOT_USER=${minioUser}`, '--env', `MINIO_ROOT_PASSWORD=${minioPassword}`, minioImage, 'server', '/data', '--address', ':9000', '--console-address', ':9001'], 'MinIO start');
    started.push(minio);
    dockerOk(['run', '--detach', '--rm', '--publish', `127.0.0.1:${scannerPort}:3310`, '--name', clamav, clamavImage], 'ClamAV start');
    started.push(clamav);

    await waitFor(async () => docker(['exec', postgres, 'pg_isready', '-U', 'postgres', '-d', 'agro_test']).status === 0, 'PostgreSQL');
    await waitFor(async () => {
      try { const response = await fetch(`http://127.0.0.1:${s3Port}/minio/health/ready`); return response.ok; } catch { return false; }
    }, 'MinIO');
    await waitFor(async () => docker(['exec', clamav, 'sh', '-c', 'printf "PING\\n" | nc -w 2 127.0.0.1 3310 | grep -q PONG']).status === 0, 'ClamAV');

    await writeFile(psqlWrapper, `#!/bin/sh\nexec docker exec -i ${postgres} psql "$@"\n`, 'utf8');
    await chmod(psqlWrapper, 0o700);
    const socketUrl = 'postgresql:///agro_test?host=%2Fvar%2Frun%2Fpostgresql&user=postgres';
    const migrated = spawnSync(process.execPath, ['database/migrate.mjs'], {
      cwd: repositoryRoot, encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: socketUrl, PSQL_BIN: psqlWrapper },
    });
    assert.equal(migrated.status, 0, `migration failed\n${migrated.stdout}\n${migrated.stderr}`);
    assert.match(migrated.stdout, /migration 6 applied/);

    const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${dbPort}/agro_test`;
    pool = new Pool({ connectionString: databaseUrl });
    const tenantId = randomUUID();
    const actorId = randomUUID();
    await pool.query('INSERT INTO org.tenant(id,code,name,timezone,created_by) VALUES ($1,$2,$3,$4,$5)', [tenantId, `F-${process.pid}`, 'Files integration', 'UTC', actorId]);

    process.env.FILES_MINIO_ENDPOINT = `http://127.0.0.1:${s3Port}`;
    process.env.FILES_MINIO_ACCESS_KEY = minioUser;
    process.env.FILES_MINIO_SECRET_KEY = minioPassword;
    process.env.FILES_MINIO_BUCKET = `wp49-${process.pid}`;
    process.env.FILES_CLAMD_ENDPOINT = `tcp://127.0.0.1:${scannerPort}`;
    const storage = new MinioObjectStorage(
      new Client({ endPoint: '127.0.0.1', port: s3Port, useSSL: false, accessKey: minioUser, secretKey: minioPassword }),
      process.env.FILES_MINIO_BUCKET,
    );
    await storage.ensureBucket();
    const scanner = new ClamAvScanner();
    const authorization = { async authorize() { return true; } };
    const policy = { maxBytes() { return 2 * 1024 * 1024 * 1024; } };
    const service = new FilesService(pool, storage, scanner, authorization, policy);
    const actor = testActor(tenantId, actorId);

    const partA = Buffer.alloc(5 * 1024 * 1024);
    jpegHeader.copy(partA);
    const partB = Buffer.alloc(5 * 1024 * 1024, 0x41);
    const expected = sha256(Buffer.concat([partA, partB]));
    const upload = await service.initUpload(actor, {
      ownerRef: `inspection:${randomUUID()}`, evidenceType: 'photo', sizeBytes: partA.length + partB.length,
      declaredMime: 'image/jpeg', idempotencyKey: randomUUID(),
    });
    assert.equal(upload.resumable, true);
    assert.equal(upload.chunkSizeBytes, 5 * 1024 * 1024);
    const retryPart = await service.uploadPart(actor, upload.attachmentId, { partNumber: 1, expectedSha256: sha256(partA), body: oneChunk(partA) });
    assert.equal(retryPart.sizeBytes, partA.length);
    assert.equal((await service.uploadPart(actor, upload.attachmentId, { partNumber: 1, expectedSha256: sha256(partA), body: oneChunk(partA) })).sha256, sha256(partA));
    await service.uploadPart(actor, upload.attachmentId, { partNumber: 2, expectedSha256: sha256(partB), body: oneChunk(partB) });

    process.env.FILES_CLAMD_ENDPOINT = 'tcp://127.0.0.1:1';
    await assert.rejects(service.completeUpload(actor, upload.attachmentId, expected), /Malware scan failed|scanner/);
    assert.equal((await pool.query('SELECT state, scan_status FROM files.attachment WHERE id=$1', [upload.attachmentId])).rows[0].state, 'QUARANTINED');
    await assert.rejects(service.getAvailableReference(actor, upload.attachmentId), /not available/);

    process.env.FILES_CLAMD_ENDPOINT = `tcp://127.0.0.1:${scannerPort}`;
    const completed = await service.completeUpload(actor, upload.attachmentId, expected);
    assert.equal(completed.state, 'AVAILABLE');
    const available = await service.getAvailableReference(actor, upload.attachmentId);
    assert.equal(available.sha256, expected);
    assert.equal(available.mime, 'image/jpeg');
    assert.equal((await pool.query('SELECT scan_status FROM files.attachment WHERE id=$1', [upload.attachmentId])).rows[0].scan_status, 'CLEAN');
    const object = (await pool.query('SELECT object_key FROM files.attachment WHERE id=$1', [upload.attachmentId])).rows[0];
    const minioClient = new Client({ endPoint: '127.0.0.1', port: s3Port, useSSL: false, accessKey: minioUser, secretKey: minioPassword });
    const objectMetadata = await minioClient.statObject(process.env.FILES_MINIO_BUCKET, object.object_key);
    assert.equal(objectMetadata.metaData.sha256, expected, JSON.stringify(objectMetadata));

    assert.equal(await scanner.scan(oneChunk(EICAR)), 'INFECTED', 'real ClamAV daemon detects its standard malware validation signature');
    const audit = await pool.query('SELECT event_type FROM files.audit_entry WHERE attachment_id=$1 ORDER BY audit_id', [upload.attachmentId]);
    assert.deepEqual(audit.rows.map((row) => row.event_type), ['UPLOAD_INITIALIZED', 'PART_STORED', 'PART_STORED', 'OBJECT_QUARANTINED', 'MALWARE_SCAN_CLEAN']);
    await assert.rejects(pool.query('UPDATE files.audit_entry SET details = details WHERE attachment_id=$1', [upload.attachmentId]), /immutable/);
    await assert.rejects(pool.query('DELETE FROM files.audit_entry WHERE attachment_id=$1', [upload.attachmentId]), /immutable/);
    await assert.rejects(pool.query('TRUNCATE files.audit_entry'), /immutable/);
    t.diagnostic(`verified MinIO objects, PostgreSQL migration 6, streamed 10 MiB multipart hash, resumable retry, scanner outage quarantine, clean release, and real ClamAV EICAR detection`);
  } finally {
    await pool?.end();
    for (const container of started.reverse()) docker(['rm', '--force', container]);
    for (const key of ['FILES_MINIO_ENDPOINT', 'FILES_MINIO_ACCESS_KEY', 'FILES_MINIO_SECRET_KEY', 'FILES_MINIO_BUCKET', 'FILES_CLAMD_ENDPOINT']) delete process.env[key];
  }
});
