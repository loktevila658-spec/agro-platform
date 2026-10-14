import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import pg from 'pg';

import { AuditService } from '../dist/modules/audit/audit.service.js';
import { AuditTransactionContext } from '../dist/modules/audit/audit.transaction.js';

const { Pool } = pg;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const image = process.env.POSTGIS_TEST_IMAGE ?? 'agroplatform/wp49-003-postgis:test';
const actorId = '00000000-0000-4000-8000-000000000014';
const correlationId = 'wp49-014-framework-test';

function docker(args) {
  return spawnSync('docker', args, { cwd: repositoryRoot, encoding: 'utf8' });
}

function assertCommand(result, action) {
  assert.equal(result.status, 0, `${action} failed\n${result.stdout}\n${result.stderr}`);
}

class TestAuthorization {
  async authorize(request) {
    return request.actorId === actorId && ['APPEND', 'CORRECT', 'SUPERSEDE'].includes(request.operation);
  }
}

test('WP49-014 framework persists immutable evidence and correction links atomically in PostgreSQL', async (t) => {
  const container = `agro-wp49-014-${process.pid}`;
  const password = 'wp49_014_ephemeral_test_only';
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'agro-audit-integration-'));
  const psqlWrapper = join(temporaryDirectory, 'psql');
  await writeFile(psqlWrapper, `#!/bin/sh\nexec docker exec -i ${container} psql "$@"\n`, 'utf8');
  await chmod(psqlWrapper, 0o700);
  const imageCheck = docker(['image', 'inspect', image]);
  if (imageCheck.status !== 0 && !process.env.POSTGIS_TEST_IMAGE) {
    assertCommand(docker(['build', '--tag', image, '--file', 'database/test/Dockerfile.postgis', '.']), 'PostGIS image build');
  } else {
    assertCommand(imageCheck, 'PostGIS image lookup');
  }

  const started = docker([
    'run', '--detach', '--rm', '--publish', '127.0.0.1::5432', '--volume', `${repositoryRoot}:${repositoryRoot}:ro`, '--name', container,
    '--env', `POSTGRES_PASSWORD=${password}`, '--env', 'POSTGRES_DB=agro_test', image,
  ]);
  assertCommand(started, 'PostgreSQL container start');
  let pool;
  try {
    const portResult = docker(['inspect', '--format', '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}', container]);
    assertCommand(portResult, 'PostgreSQL port lookup');
    const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${portResult.stdout.trim()}/agro_test`;
    const migrationDatabaseUrl = 'postgresql:///agro_test?host=%2Fvar%2Frun%2Fpostgresql&user=postgres';
    pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 1000 });
    let stablePostmasterStartTime;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const probe = await pool.query(
          "SELECT current_database() AS database, current_setting('listen_addresses') AS listen_addresses, pg_postmaster_start_time()::text AS postmaster_start_time, pg_is_in_recovery() AS in_recovery",
        );
        const row = probe.rows[0];
        if (row.database === 'agro_test' && row.listen_addresses && !row.in_recovery) {
          if (row.postmaster_start_time === stablePostmasterStartTime) {
            ready = true;
            break;
          }
          stablePostmasterStartTime = row.postmaster_start_time;
        } else {
          stablePostmasterStartTime = undefined;
        }
      } catch {
        stablePostmasterStartTime = undefined;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    assert.equal(ready, true, 'PostgreSQL did not reach stable final-postmaster readiness');

    const migration = spawnSync(process.execPath, ['database/migrate.mjs'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: migrationDatabaseUrl, PSQL_BIN: psqlWrapper },
    });
    assertCommand(migration, 'Database migrations');
    assert.match(migration.stdout, /migration 4 applied/);

    const existingStores = await pool.query(`
      SELECT to_regclass('org.audit_entry') AS org_store,
             to_regclass('identity.security_audit') AS identity_store,
             (SELECT count(*)::int FROM org.audit_entry) AS org_count,
             (SELECT count(*)::int FROM identity.security_audit) AS identity_count
    `);
    assert.equal(existingStores.rows[0].org_store, 'org.audit_entry');
    assert.equal(existingStores.rows[0].identity_store, 'identity.security_audit');
    assert.equal(existingStores.rows[0].org_count, 0);
    assert.equal(existingStores.rows[0].identity_count, 0);

    await pool.query('CREATE TEMP TABLE owner_write_probe (probe_id integer PRIMARY KEY)');
    const service = new AuditService(new TestAuthorization());
    const client = await pool.connect();
    let originalId;
    try {
      await AuditTransactionContext.run(client, async (tx) => {
        await tx.client.query('INSERT INTO owner_write_probe VALUES (1)');
        originalId = await service.appendEvidence(tx, {
          ownerModule: 'wp49-014-test-owner',
          entityType: 'framework-test-record',
          entityId: 'record-1',
          action: 'framework.test.create',
          actorId,
          correlationId,
          provenance: [{ ownerModule: 'wp49-014-test-owner', recordType: 'fixture', recordId: 'source-1' }],
          evidence: { revision: 1, value: 'original' },
        });
      });
      assert.equal((await client.query('SELECT count(*)::int AS count FROM owner_write_probe')).rows[0].count, 1);

      const correction = await AuditTransactionContext.run(client, async (tx) => service.recordCorrection(tx, {
        originalEvidenceId: originalId,
        relation: 'SUPERSESSION',
        replacement: {
          ownerModule: 'wp49-014-test-owner',
          entityType: 'framework-test-record',
          entityId: 'record-1',
          action: 'framework.test.correct',
          actorId,
          correlationId: `${correlationId}-correction`,
          provenance: [{ ownerModule: 'wp49-014-test-owner', recordType: 'fixture', recordId: 'source-2' }],
          evidence: { revision: 2, value: 'replacement' },
        },
      }));

      const evidence = await client.query(
        'SELECT evidence_id, evidence FROM platform_audit.evidence ORDER BY recorded_at, evidence_id',
      );
      assert.equal(evidence.rowCount, 2);
      assert.deepEqual(evidence.rows.find((row) => row.evidence_id === originalId).evidence, { revision: 1, value: 'original' });
      const link = await client.query(
        `SELECT original_evidence_id, replacement_evidence_id, relation
         FROM platform_audit.correction_link WHERE link_id = $1`,
        [correction.linkId],
      );
      assert.deepEqual(link.rows[0], {
        original_evidence_id: originalId,
        replacement_evidence_id: correction.evidenceId,
        relation: 'SUPERSESSION',
      });

      await assert.rejects(
        client.query('UPDATE platform_audit.evidence SET evidence = $1 WHERE evidence_id = $2', [{ revision: 9 }, originalId]),
        (error) => error.code === '23514',
      );
      await assert.rejects(
        client.query('DELETE FROM platform_audit.correction_link WHERE link_id = $1', [correction.linkId]),
        (error) => error.code === '23514',
      );

      const assertEvidenceAndLinkPreserved = async () => {
        const preservedEvidence = await client.query(
          'SELECT evidence_id, evidence FROM platform_audit.evidence WHERE evidence_id = $1',
          [originalId],
        );
        assert.deepEqual(preservedEvidence.rows, [{
          evidence_id: originalId,
          evidence: { revision: 1, value: 'original' },
        }]);
        const preservedLink = await client.query(
          `SELECT original_evidence_id, replacement_evidence_id, relation
           FROM platform_audit.correction_link WHERE link_id = $1`,
          [correction.linkId],
        );
        assert.deepEqual(preservedLink.rows, [{
          original_evidence_id: originalId,
          replacement_evidence_id: correction.evidenceId,
          relation: 'SUPERSESSION',
        }]);
      };

      await assert.rejects(
        client.query('TRUNCATE TABLE platform_audit.correction_link'),
        (error) => error.code === '23514' && /append-only: correction_link/.test(error.message),
      );
      await assertEvidenceAndLinkPreserved();

      // PostgreSQL requires the referenced evidence table to be included or CASCADE used.
      await assert.rejects(
        client.query('TRUNCATE TABLE platform_audit.evidence CASCADE'),
        (error) => error.code === '23514' && /append-only: evidence/.test(error.message),
      );
      await assertEvidenceAndLinkPreserved();

      await assert.rejects(
        AuditTransactionContext.run(client, async (tx) => {
          await tx.client.query('INSERT INTO owner_write_probe VALUES (2)');
          await service.appendEvidence(tx, {
            ownerModule: 'wp49-014-test-owner', entityType: 'framework-test-record', entityId: 'record-2',
            action: 'framework.test.rollback', actorId, correlationId,
            provenance: [], evidence: { revision: 1 },
          });
          throw new Error('rollback sentinel');
        }),
        /rollback sentinel/,
      );
      assert.equal((await client.query('SELECT count(*)::int AS count FROM owner_write_probe')).rows[0].count, 1);
      assert.equal((await client.query("SELECT count(*)::int AS count FROM platform_audit.evidence WHERE entity_id = 'record-2'")).rows[0].count, 0);

      const denied = new AuditService({ authorize: async () => false });
      await assert.rejects(
        AuditTransactionContext.run(client, (tx) => denied.appendEvidence(tx, {
          ownerModule: 'wp49-014-test-owner', entityType: 'framework-test-record', entityId: 'record-denied',
          action: 'framework.test.denied', actorId, correlationId, provenance: [], evidence: { revision: 1 },
        })),
        /Audit operation is not authorized/,
      );
      assert.equal((await client.query("SELECT count(*)::int AS count FROM platform_audit.evidence WHERE entity_id = 'record-denied'")).rows[0].count, 0);

      const storesAfter = await client.query(`
        SELECT (SELECT count(*)::int FROM org.audit_entry) AS org_count,
               (SELECT count(*)::int FROM identity.security_audit) AS identity_count
      `);
      assert.deepEqual(storesAfter.rows[0], { org_count: 0, identity_count: 0 });
    } finally {
      client.release();
    }
    t.diagnostic('Framework scenario emits no domain event: it persists only internal framework evidence and links; adoption contract assigns event/no-event decisions to the canonical command owner.');
  } finally {
    await pool?.end();
    docker(['stop', container]);
  }
});
