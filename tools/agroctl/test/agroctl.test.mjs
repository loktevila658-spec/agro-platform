import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createCli, resolveRepositoryRoot } from '../src/cli.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

function capture() {
  let output = '';
  return {
    stream: { write: (chunk) => { output += chunk; } },
    read: () => output,
  };
}

function makeCli({ runProcess = () => ({ status: 0, stdout: '', stderr: '' }), env = {} } = {}) {
  const stdout = capture();
  const stderr = capture();
  const cli = createCli({
    env,
    platform: 'linux',
    repoRoot: repositoryRoot,
    runProcess,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });
  return { cli, stdout: stdout.read, stderr: stderr.read };
}

test('global and command help are deterministic and dispatch without spawning', () => {
  let called = false;
  const { cli, stdout } = makeCli({
    runProcess: () => { called = true; return { status: 0 }; },
  });

  assert.equal(cli(['--help']), 0);
  assert.match(stdout(), /agroctl <bootstrap\|migrate\|seed\|verify>/);
  assert.equal(cli(['migrate', '--help']), 0);
  assert.match(stdout(), /Delegate to database\/migrate\.mjs/);
  assert.equal(called, false);
});

test('unknown command and unexpected arguments return usage exit code', () => {
  const { cli, stderr } = makeCli();

  assert.equal(cli(['deploy']), 2);
  assert.match(stderr(), /unknown command: deploy/);
  assert.equal(cli(['verify', 'anything']), 2);
  assert.match(stderr(), /usage: agroctl verify/);
});

test('bootstrap prefers modern Compose and delegates an up operation from repository root', () => {
  const calls = [];
  const { cli, stdout, stderr } = makeCli({
    runProcess: (command, args, options) => {
      calls.push({ command, args, options });
      if (args[0] === 'compose' && args[1] === 'version') {
        return { status: 0, stdout: 'Docker Compose version v2', stderr: '' };
      }
      return { status: 0, stdout: 'services started\n', stderr: '' };
    },
  });

  assert.equal(cli(['bootstrap']), 0);
  assert.deepEqual(calls.map(({ command, args }) => [command, args]), [
    ['docker', ['compose', 'version']],
    ['docker', ['compose', '-f', 'apps/compose.yaml', 'up', '--build', '--detach']],
  ]);
  assert.ok(calls.every(({ options }) => options.cwd === repositoryRoot));
  assert.match(stdout(), /services started/);
  assert.equal(stderr(), '');
});

test('bootstrap propagates Compose failure and handles unavailable Compose', () => {
  const failed = makeCli({
    runProcess: (_command, args) => args.at(-1) === 'version'
      ? { status: 0, stdout: '', stderr: '' }
      : { status: 17, stdout: '', stderr: 'compose failed\n' },
  });
  assert.equal(failed.cli(['bootstrap']), 17);
  assert.match(failed.stderr(), /compose failed/);

  const unavailable = makeCli({
    runProcess: () => ({ status: null, error: { code: 'ENOENT' } }),
  });
  assert.equal(unavailable.cli(['bootstrap']), 127);
  assert.match(unavailable.stderr(), /Docker Compose is unavailable/);
});

test('migrate delegates to the existing migration runner and preserves connection environment', () => {
  const databaseUrl = 'postgresql://operator:very-secret@localhost/agro';
  const psqlBin = '/opt/postgres/bin/psql';
  let call;
  const { cli } = makeCli({
    env: { DATABASE_URL: databaseUrl, PSQL_BIN: psqlBin, PATH: '/bin' },
    runProcess: (command, args, options) => {
      call = { command, args, options };
      return { status: 0, stdout: 'database schema is current\n', stderr: '' };
    },
  });

  assert.equal(cli(['migrate']), 0);
  assert.equal(call.command, process.execPath);
  assert.deepEqual(call.args, [join(repositoryRoot, 'database/migrate.mjs')]);
  assert.equal(call.options.env.DATABASE_URL, databaseUrl);
  assert.equal(call.options.env.PSQL_BIN, psqlBin);
  assert.equal(call.options.cwd, repositoryRoot);
});

test('migrate redacts credentials in subprocess output and propagates failure status', () => {
  const databaseUrl = 'postgresql://operator:very-secret@localhost/agro';
  const { cli, stdout, stderr } = makeCli({
    env: { DATABASE_URL: databaseUrl, PGPASSWORD: 'very-secret' },
    runProcess: () => ({
      status: 9,
      stdout: `failed for ${databaseUrl}\n`,
      stderr: 'password=very-secret PGPASSWORD=very-secret\n',
    }),
  });

  assert.equal(cli(['migrate']), 9);
  assert.doesNotMatch(stdout() + stderr(), /operator|very-secret|postgresql:\/\//);
  assert.match(stderr(), /\[REDACTED\]/);
});

test('seed reports an explicit not-configured foundation and never claims data was seeded', () => {
  let spawned = false;
  const { cli, stderr } = makeCli({
    runProcess: () => { spawned = true; return { status: 0 }; },
  });

  assert.equal(cli(['seed']), 3);
  assert.match(stderr(), /no seed provider is configured/i);
  assert.match(stderr(), /WP49-008/);
  assert.equal(spawned, false);
});

test('verify runs every read-only check and aggregates failures by check name', () => {
  const calls = [];
  const { cli, stdout, stderr } = makeCli({
    runProcess: (_command, args, options) => {
      calls.push({ args, options });
      return args.some((argument) => argument.endsWith('contracts.mjs'))
        && args.includes('check')
        ? { status: 4, stdout: '', stderr: 'generated drift\n' }
        : { status: 0, stdout: 'ok\n', stderr: '' };
    },
  });

  assert.equal(cli(['verify']), 1);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(({ options }) => options.cwd === repositoryRoot));
  assert.match(stdout(), /PASS.*bootstrap structure/s);
  assert.match(stderr(), /FAIL.*generated contracts.*exit code 4/s);
  assert.match(stderr(), /generated drift/);
});

test('verify succeeds only when all read-only checks succeed', () => {
  const { cli, stdout, stderr } = makeCli();

  assert.equal(cli(['verify']), 0);
  assert.match(stdout(), /verify: PASS/);
  assert.equal(stderr(), '');
});

test('repository root resolution is independent of an unrelated current directory', async (t) => {
  const outsideDirectory = await mkdtemp(join(tmpdir(), 'agroctl-cwd-'));
  t.after(() => rm(outsideDirectory, { recursive: true, force: true }));

  assert.equal(resolveRepositoryRoot(import.meta.url, outsideDirectory), repositoryRoot);
});

test('child signal output is redacted and signal/spawn errors use deterministic exit codes', () => {
  const databaseUrl = 'postgresql://operator:signal-secret@localhost/agro';
  const signaled = makeCli({
    env: { DATABASE_URL: databaseUrl },
    runProcess: () => ({
      status: null,
      signal: 'SIGTERM',
      stdout: `subprocess received ${databaseUrl}\n`,
      stderr: 'PGPASSWORD=signal-secret\n',
    }),
  });
  assert.equal(signaled.cli(['migrate']), 143);
  assert.match(signaled.stderr(), /terminated by signal SIGTERM/);
  assert.doesNotMatch(signaled.stdout() + signaled.stderr(), /operator|signal-secret|postgresql:\/\//);
  assert.match(signaled.stdout() + signaled.stderr(), /\[REDACTED\]/);

  const missing = makeCli({
    runProcess: () => ({ status: null, error: { code: 'ENOENT', message: 'spawn failed' } }),
  });
  assert.equal(missing.cli(['migrate']), 127);
  assert.match(missing.stderr(), /required executable unavailable: node/);
});
