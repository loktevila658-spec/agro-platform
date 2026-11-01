import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildMigrationProgram,
  discoverMigrations,
  executeMigrationProgram,
} from '../migrate.mjs';

async function migrationDirectory(files) {
  const directory = await mkdtemp(join(tmpdir(), 'agro-migrations-'));
  await Promise.all(
    Object.entries(files).map(([name, sql]) =>
      writeFile(join(directory, name), sql, 'utf8'),
    ),
  );
  return directory;
}

test('migration discovery is ordered by explicit contiguous version', async () => {
  const directory = await migrationDirectory({
    '0002_second.sql': 'SELECT 2;\n',
    '0001_first.sql': 'SELECT 1;\n',
  });

  const migrations = await discoverMigrations(directory);

  assert.deepEqual(
    migrations.map(({ version, name }) => ({ version, name })),
    [
      { version: 1, name: 'first' },
      { version: 2, name: 'second' },
    ],
  );
  assert.match(migrations[0].checksum, /^[a-f0-9]{64}$/);
});

test('invalid filenames, duplicate versions, and version gaps fail early', async () => {
  const invalidName = await migrationDirectory({ 'baseline.sql': 'SELECT 1;\n' });
  await assert.rejects(discoverMigrations(invalidName), /invalid migration filename/);

  const duplicate = await migrationDirectory({
    '0001_first.sql': 'SELECT 1;\n',
    '0001_other.sql': 'SELECT 2;\n',
  });
  await assert.rejects(discoverMigrations(duplicate), /duplicate migration version 1/);

  const gap = await migrationDirectory({
    '0001_first.sql': 'SELECT 1;\n',
    '0003_third.sql': 'SELECT 3;\n',
  });
  await assert.rejects(discoverMigrations(gap), /expected version 2/);
});

test('migration program is deterministic and guards applied state', async () => {
  const directory = await migrationDirectory({
    '0001_first.sql': 'SELECT 1;\n',
  });
  const migrations = await discoverMigrations(directory);

  const first = buildMigrationProgram(migrations);
  const second = buildMigrationProgram(migrations);

  assert.equal(first, second);
  assert.match(first, /pg_advisory_lock/);
  assert.match(first, /checksum_matches/);
  assert.match(first, /ordering_valid/);
  assert.match(first, /schema_migrations/);
});

test('baseline, organization, identity, and audit framework migrations are ordered and declare owned schemas', async () => {
  const migrations = await discoverMigrations(
    new URL('../migrations', import.meta.url),
  );
  assert.deepEqual(migrations.map(({ version }) => version), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.match(migrations[0].sql, /CREATE EXTENSION IF NOT EXISTS postgis/i);
  assert.doesNotMatch(
    migrations[0].sql,
    /CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS\s+platform_meta\.schema_migrations)/i,
  );
  for (const table of ['tenant', 'organization', 'organization_unit', 'site', 'command_idempotency', 'audit_entry', 'outbox_event']) {
    assert.match(migrations[1].sql, new RegExp(`CREATE TABLE org\\.${table}\\b`, 'i'));
  }
  assert.match(migrations[1].sql, /CREATE TRIGGER/i);
  assert.match(migrations[1].sql, /WITH RECURSIVE/i);
  for (const table of ['user_account', 'registered_device', 'mfa_authenticator', 'mfa_challenge', 'auth_session', 'refresh_token', 'login_throttle', 'security_audit', 'outbox_event']) {
    assert.match(migrations[2].sql, new RegExp(`CREATE TABLE identity\\.${table}\\b`, 'i'));
  }
  assert.match(migrations[2].sql, /classification\s+text\s+NOT NULL\s+CHECK\s*\(classification\s*=\s*'SECURITY'\)/i);
  assert.match(migrations[3].sql, /CREATE SCHEMA platform_audit/i);
  assert.match(migrations[3].sql, /CREATE TABLE platform_audit\.evidence/i);
  assert.match(migrations[3].sql, /CREATE TABLE platform_audit\.correction_link/i);
  assert.match(migrations[3].sql, /BEFORE UPDATE OR DELETE ON platform_audit\.evidence/i);
  assert.match(migrations[3].sql, /BEFORE UPDATE OR DELETE ON platform_audit\.correction_link/i);
  assert.doesNotMatch(migrations[3].sql, /\b(?:ALTER|DROP|TRUNCATE)\s+(?:TABLE|SCHEMA)\s+(?:org\.audit_entry|identity\.security_audit)/i);
  assert.match(migrations[4].sql, /CREATE SCHEMA platform_events/i);
  assert.match(migrations[4].sql, /CREATE TABLE platform_events\.outbox_delivery/i);
  assert.match(migrations[4].sql, /PRIMARY KEY \(source, event_id\)/i);
  assert.match(migrations[4].sql, /CREATE TABLE platform_events\.inbox_event/i);
  assert.match(migrations[4].sql, /PRIMARY KEY \(consumer_name, event_id\)/i);
  assert.match(migrations[5].sql, /CREATE SCHEMA files/i);
  assert.match(migrations[5].sql, /CREATE TABLE files\.attachment/i);
  assert.match(migrations[5].sql, /CREATE TABLE files\.upload_part/i);
  assert.match(migrations[5].sql, /offset_bytes bigint NOT NULL/i);
  assert.match(migrations[5].sql, /part_status text NOT NULL DEFAULT 'STORED'/i);
  assert.match(migrations[5].sql, /CREATE TABLE files\.audit_entry/i);
  assert.match(migrations[5].sql, /BEFORE UPDATE OR DELETE OR TRUNCATE ON files\.audit_entry/i);
  assert.match(migrations[5].sql, /state <> 'AVAILABLE'.*scan_status = 'CLEAN'/is);
  assert.doesNotMatch(migrations[5].sql, /local_path|filesystem_path/i);
  for (const table of ['tenant_clock','device','command_receipt','change','ack','conflict_record','attachment_reference']) assert.match(migrations[6].sql,new RegExp(`CREATE TABLE sync\\.${table}\\b`,'i'));
  for (const table of ['profile','job','attempt','external_link','link_revision','audit_entry','outbox']) assert.match(migrations[7].sql,new RegExp(`CREATE TABLE integrations\\.${table}\\b`,'i'));
  assert.doesNotMatch(migrations[7].sql,/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:org|identity|files|sync)\./i);
  assert.doesNotMatch(migrations[6].sql,/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:org|identity|files)\./i);
});

test('database credentials are not exposed in psql process arguments', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agro-psql-'));
  const fakePsql = join(directory, 'psql');
  await writeFile(
    fakePsql,
    `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ argv: process.argv.slice(2), password: process.env.PGPASSWORD }));\n`,
    'utf8',
  );
  await chmod(fakePsql, 0o700);
  const databaseUrl = 'postgresql://migration_user:secret@example.invalid/agro';

  const result = executeMigrationProgram({
    databaseUrl,
    program: 'SELECT 1;',
    psqlBin: fakePsql,
  });
  const invocation = JSON.parse(result.stdout);

  assert.equal(invocation.password, 'secret');
  assert.ok(!invocation.argv.some((argument) => argument.includes('secret')));
  assert.ok(
    invocation.argv.includes('postgresql://migration_user@example.invalid/agro'),
  );
});
