import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultImage = 'agroplatform/wp49-003-postgis:test';
const image = process.env.POSTGIS_TEST_IMAGE ?? defaultImage;

function docker(args, options = {}) {
  return spawnSync('docker', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    ...options,
  });
}

function processFailure(action, result) {
  return `${action} failed (status=${result.status ?? 'running'}, signal=${result.signal ?? 'none'}, error=${result.error?.message ?? 'none'})\nstdout:\n${result.stdout ?? ''}\nstderr:\n${result.stderr ?? ''}`;
}

function query(container, databaseUrl, sql) {
  const result = docker([
    'exec',
    container,
    'psql',
    '--dbname',
    databaseUrl,
    '--no-psqlrc',
    '--tuples-only',
    '--no-align',
    '--command',
    sql,
  ]);
  assert.equal(result.status, 0, processFailure(`Database query (${sql})`, result));
  return result.stdout.trim();
}

async function waitForPostgres(container, databaseUrl) {
  let stablePostmasterStartTime;
  let lastProbe;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = docker([
      'exec',
      container,
      'psql',
      '--dbname',
      databaseUrl,
      '--no-psqlrc',
      '--tuples-only',
      '--no-align',
      '--field-separator',
      '|',
      '--command',
      "SELECT current_database(), current_setting('listen_addresses'), pg_postmaster_start_time()::text, pg_is_in_recovery();",
    ]);
    lastProbe = result;
    const fields = result.status === 0 ? result.stdout.trim().split('|') : [];
    const [database, listenAddresses, postmasterStartTime, inRecovery] = fields;

    // The Docker entrypoint's temporary initialization server disables network listeners.
    // Require the final server configuration and the same postmaster across two SQL probes.
    if (
      database === 'agro_test'
      && listenAddresses?.length > 0
      && postmasterStartTime
      && inRecovery === 'f'
    ) {
      if (postmasterStartTime === stablePostmasterStartTime) return;
      stablePostmasterStartTime = postmasterStartTime;
    } else {
      stablePostmasterStartTime = undefined;
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`PostgreSQL/PostGIS target database did not reach stable post-initialization readiness\n${processFailure('Last PostgreSQL readiness probe', lastProbe ?? {})}`);
}

async function waitForHttp(url, processHandle) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (processHandle.exitCode !== null) break;
    try {
      return await fetch(url);
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  throw new Error(`API schema-version endpoint did not become ready (${processHandle.exitCode ?? 'still running'}, signal=${processHandle.signalCode ?? 'none'})\nstdout:\n${processHandle.stdoutText}\nstderr:\n${processHandle.stderrText}`);
}

test('clean, repeated, PostGIS, API, and invalid-state migration behavior', async () => {
  const container = `agro-wp49-003-${process.pid}`;
  const password = 'wp49_003_ephemeral_test_only';
  const databaseUrl =
    'postgresql:///agro_test?host=%2Fvar%2Frun%2Fpostgresql&user=postgres';
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'agro-db-integration-'));
  const psqlWrapper = join(temporaryDirectory, 'psql');
  const port = 32000 + (process.pid % 1000);
  let api;

  await writeFile(
    psqlWrapper,
    `#!/bin/sh\nexec docker exec -i ${container} psql "$@"\n`,
    'utf8',
  );
  await chmod(psqlWrapper, 0o700);

  if (!process.env.POSTGIS_TEST_IMAGE) {
    const built = docker([
      'build',
      '--tag',
      defaultImage,
      '--file',
      'database/test/Dockerfile.postgis',
      '.',
    ]);
    assert.equal(built.status, 0, processFailure('PostGIS image build', built));
  }

  const started = docker([
    'run',
    '--detach',
    '--rm',
    '--volume',
    `${repositoryRoot}:${repositoryRoot}:ro`,
    '--name',
    container,
    '--env',
    `POSTGRES_PASSWORD=${password}`,
    '--env',
    'POSTGRES_DB=agro_test',
    image,
  ]);
  assert.equal(started.status, 0, processFailure('PostgreSQL container start', started));

  try {
    await waitForPostgres(container, databaseUrl);
    const migrationEnvironment = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PSQL_BIN: psqlWrapper,
    };

    const first = spawnSync(process.execPath, ['database/migrate.mjs'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: migrationEnvironment,
    });
    assert.equal(first.status, 0, processFailure('First migration run', first));
    assert.match(first.stdout, /migration 1 applied/);
    assert.match(first.stdout, /migration 2 applied/);
    assert.match(first.stdout, /migration 3 applied/);
    assert.match(first.stdout, /migration 4 applied/);
    assert.match(first.stdout, /migration 5 applied/);
    assert.match(first.stdout, /migration 6 applied/);
    assert.match(first.stdout, /migration 7 applied/);

    const second = spawnSync(process.execPath, ['database/migrate.mjs'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: migrationEnvironment,
    });
    assert.equal(second.status, 0, processFailure('Repeated migration run', second));
    assert.match(second.stdout, /migration 1 already applied/);
    assert.match(second.stdout, /migration 2 already applied/);
    assert.match(second.stdout, /migration 3 already applied/);
    assert.match(second.stdout, /migration 4 already applied/);
    assert.match(second.stdout, /migration 5 already applied/);
    assert.match(second.stdout, /migration 6 already applied/);
    assert.match(second.stdout, /migration 7 already applied/);

    assert.equal(
      query(
        container,
        databaseUrl,
        'SELECT current_version FROM platform_meta.schema_version;',
      ),
      '7',
    );
    assert.match(
      query(
        container,
        databaseUrl,
        "SELECT extversion FROM pg_extension WHERE extname = 'postgis';",
      ),
      /^3\./,
    );
    assert.equal(
      query(
        container,
        databaseUrl,
        'SELECT COUNT(*) FROM platform_meta.schema_migrations;',
      ),
      '7',
    );

    assert.equal(
      query(
        container,
        databaseUrl,
        `SELECT count(*) FROM information_schema.tables
         WHERE table_schema = 'platform_audit'
           AND table_name IN ('evidence', 'correction_link');`,
      ),
      '2',
    );
    assert.equal(
      query(
        container,
        databaseUrl,
        `SELECT count(*) FROM information_schema.tables
         WHERE table_schema = 'files'
           AND table_name IN ('attachment', 'upload_part', 'audit_entry');`,
      ),
      '3',
    );
    assert.equal(
      query(
        container,
        databaseUrl,
        `SELECT count(*) FROM information_schema.tables
         WHERE table_schema = 'platform_events'
           AND table_name IN ('outbox_delivery', 'inbox_event');`,
      ),
      '2',
    );
    assert.equal(
      query(
        container,
        databaseUrl,
        `SELECT count(*) FROM information_schema.tables
         WHERE (table_schema, table_name) IN (('org', 'audit_entry'), ('identity', 'security_audit'));`,
      ),
      '2',
    );

    api = spawn(process.execPath, ['apps/api/dist/main.js'], {
      cwd: repositoryRoot,
      env: {
        ...migrationEnvironment,
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    api.stdoutText = '';
    api.stderrText = '';
    api.stdout.setEncoding('utf8').on('data', (chunk) => { api.stdoutText += chunk; });
    api.stderr.setEncoding('utf8').on('data', (chunk) => { api.stderrText += chunk; });
    const response = await waitForHttp(
      `http://127.0.0.1:${port}/system/schema-version`,
      api,
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, {
      schemaVersion: 7,
      expectedSchemaVersion: 7,
      postgisVersion: body.postgisVersion,
      status: 'current',
    });
    assert.match(body.postgisVersion, /^3\./);

    query(
      container,
      databaseUrl,
      "UPDATE platform_meta.schema_migrations SET checksum = repeat('0', 64) WHERE version = 1;",
    );
    const invalid = spawnSync(process.execPath, ['database/migrate.mjs'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: migrationEnvironment,
    });
    assert.notEqual(invalid.status, 0, processFailure('Invalid checksum migration run unexpectedly succeeded', invalid));
    assert.match(`${invalid.stdout}\n${invalid.stderr}`, /checksum or name mismatch/, processFailure('Invalid checksum migration run had an unexpected failure', invalid));
  } finally {
    api?.kill('SIGTERM');
    docker(['rm', '--force', container]);
  }
});
