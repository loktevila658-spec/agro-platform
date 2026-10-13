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

test('baseline and organization migrations are ordered and declare the WP49-011 hierarchy', async () => {
  const migrations = await discoverMigrations(
    new URL('../migrations', import.meta.url),
  );
  assert.deepEqual(migrations.map(({ version }) => version), [1, 2]);
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
