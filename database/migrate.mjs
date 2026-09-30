#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const migrationPattern = /^(?<version>[0-9]{4})_(?<name>[a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
const runnerDirectory = dirname(fileURLToPath(import.meta.url));
export const defaultMigrationsDirectory = resolve(runnerDirectory, 'migrations');

function asPath(value) {
  return value instanceof URL ? fileURLToPath(value) : resolve(value);
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function psqlIncludePath(value) {
  if (/[\r\n]/.test(value)) {
    throw new Error('migration path must not contain a newline');
  }
  return `'${value.replaceAll("'", "''")}'`;
}

export function psqlConnection(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use the postgres or postgresql scheme');
  }

  const password = decodeURIComponent(parsed.password);
  parsed.password = '';
  return Object.freeze({ databaseUrl: parsed.toString(), password });
}

export async function discoverMigrations(directory = defaultMigrationsDirectory) {
  const root = asPath(directory);
  const entries = await readdir(root, { withFileTypes: true });
  const sqlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name);

  if (sqlFiles.length === 0) {
    throw new Error(`no migrations found in ${root}`);
  }

  const parsed = [];
  for (const filename of sqlFiles) {
    const match = migrationPattern.exec(filename);
    if (!match?.groups) {
      throw new Error(
        `invalid migration filename ${filename}; expected NNNN_lower_snake_case.sql`,
      );
    }
    parsed.push({
      filename,
      name: match.groups.name,
      version: Number(match.groups.version),
    });
  }

  parsed.sort((left, right) =>
    left.version === right.version
      ? left.filename.localeCompare(right.filename, 'en')
      : left.version - right.version,
  );

  for (let index = 0; index < parsed.length; index += 1) {
    const migration = parsed[index];
    const expectedVersion = index + 1;
    if (migration.version !== expectedVersion) {
      if (
        index > 0 &&
        parsed[index - 1].version === migration.version
      ) {
        throw new Error(`duplicate migration version ${migration.version}`);
      }
      throw new Error(
        `migration sequence expected version ${expectedVersion}, found ${migration.version}`,
      );
    }
  }

  return Promise.all(
    parsed.map(async (migration) => {
      const path = resolve(root, migration.filename);
      const sql = await readFile(path, 'utf8');
      const checksum = createHash('sha256').update(sql, 'utf8').digest('hex');
      return Object.freeze({ ...migration, path, sql, checksum });
    }),
  );
}

export function buildMigrationProgram(migrations) {
  if (migrations.length === 0) {
    throw new Error('cannot build an empty migration program');
  }

  const expectedVersions = migrations.map(({ version }) => version).join(', ');
  const lines = [
    '\\set ON_ERROR_STOP on',
    "SELECT pg_advisory_lock(hashtext('agroplatform.schema_migrations'));",
    'CREATE SCHEMA IF NOT EXISTS platform_meta;',
    `CREATE TABLE IF NOT EXISTS platform_meta.schema_migrations (
      version integer PRIMARY KEY CHECK (version > 0),
      name text NOT NULL,
      checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );`,
    `SELECT NOT EXISTS (
      SELECT 1
      FROM platform_meta.schema_migrations
      WHERE version NOT IN (${expectedVersions})
    ) AS catalog_valid \\gset`,
    '\\if :catalog_valid',
    '\\else',
    `DO $migration_error$ BEGIN
      RAISE EXCEPTION 'migration catalog contains an unknown version';
    END $migration_error$;`,
    '\\endif',
  ];

  for (const migration of migrations) {
    const version = migration.version;
    const name = sqlLiteral(migration.name);
    const checksum = sqlLiteral(migration.checksum);
    lines.push(
      `SELECT EXISTS (
        SELECT 1 FROM platform_meta.schema_migrations WHERE version = ${version}
      ) AS migration_exists \\gset`,
      '\\if :migration_exists',
      `SELECT (name = ${name} AND checksum = ${checksum}) AS checksum_matches
        FROM platform_meta.schema_migrations
        WHERE version = ${version} \\gset`,
      '\\if :checksum_matches',
      `\\echo migration ${version} already applied`,
      '\\else',
      `DO $migration_error$ BEGIN
        RAISE EXCEPTION 'migration ${version} checksum or name mismatch';
      END $migration_error$;`,
      '\\endif',
      '\\else',
      `SELECT NOT EXISTS (
        SELECT 1 FROM platform_meta.schema_migrations WHERE version > ${version}
      ) AS ordering_valid \\gset`,
      '\\if :ordering_valid',
      'BEGIN;',
      `\\ir ${psqlIncludePath(migration.path)}`,
      `INSERT INTO platform_meta.schema_migrations (version, name, checksum)
        VALUES (${version}, ${name}, ${checksum});`,
      'COMMIT;',
      `\\echo migration ${version} applied`,
      '\\else',
      `DO $migration_error$ BEGIN
        RAISE EXCEPTION 'migration ${version} cannot be applied after a later version';
      END $migration_error$;`,
      '\\endif',
      '\\endif',
    );
  }

  lines.push(
    'SELECT COALESCE(MAX(version), 0) AS schema_version FROM platform_meta.schema_migrations;',
    "SELECT pg_advisory_unlock(hashtext('agroplatform.schema_migrations'));",
    '',
  );
  return lines.join('\n');
}

export function executeMigrationProgram({ databaseUrl, program, psqlBin = 'psql' }) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const connection = psqlConnection(databaseUrl);
  const result = spawnSync(
    psqlBin,
    [
      '--dbname',
      connection.databaseUrl,
      '--no-psqlrc',
      '--set',
      'ON_ERROR_STOP=1',
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        ...(connection.password ? { PGPASSWORD: connection.password } : {}),
      },
      input: program,
      maxBuffer: 4 * 1024 * 1024,
    },
  );

  if (result.error) {
    throw new Error(`failed to start psql: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`migration failed with psql exit code ${result.status}`);
  }

  return Object.freeze({ stdout: result.stdout, stderr: result.stderr });
}

export async function runMigrations({
  databaseUrl = process.env.DATABASE_URL,
  migrationsDirectory = defaultMigrationsDirectory,
  psqlBin = process.env.PSQL_BIN ?? 'psql',
} = {}) {
  const migrations = await discoverMigrations(migrationsDirectory);
  const program = buildMigrationProgram(migrations);
  const execution = executeMigrationProgram({ databaseUrl, program, psqlBin });
  return Object.freeze({
    currentVersion: migrations.at(-1).version,
    migrationCount: migrations.length,
    ...execution,
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  runMigrations()
    .then(({ currentVersion, stdout, stderr }) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      process.stdout.write(`database schema is current at version ${currentVersion}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
