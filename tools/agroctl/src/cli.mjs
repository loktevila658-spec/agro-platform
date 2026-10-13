import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildComposeCandidates,
  composeArguments,
  selectComposeCli,
} from '../../../scripts/compose-cli.mjs';

export const EXIT_CODES = Object.freeze({
  success: 0,
  usage: 2,
  notConfigured: 3,
  commandUnavailable: 127,
  failure: 1,
});

const COMMANDS = Object.freeze({
  bootstrap: {
    usage: 'agroctl bootstrap',
    help: 'Start the development services with the repository Compose file.',
  },
  migrate: {
    usage: 'agroctl migrate',
    help: 'Delegate to database/migrate.mjs using DATABASE_URL and PSQL_BIN.',
  },
  seed: {
    usage: 'agroctl seed [--profile MINIMAL]',
    help: 'Delegate to the deterministic demo fixture loader (MINIMAL profile by default).',
  },
  verify: {
    usage: 'agroctl verify',
    help: 'Run read-only bootstrap, migration-unit, and contract checks.',
  },
});

const VERIFY_CHECKS = Object.freeze([
  Object.freeze({
    name: 'bootstrap structure',
    args: ['tests/validate-bootstrap.mjs'],
  }),
  Object.freeze({
    name: 'migration unit checks',
    args: ['--test', 'database/test/migrate.test.mjs'],
  }),
  Object.freeze({
    name: 'OpenAPI and event contract validation',
    args: ['packages/contracts/scripts/contracts.mjs', 'validate'],
  }),
  Object.freeze({
    name: 'generated contracts drift',
    args: ['packages/contracts/scripts/contracts.mjs', 'check'],
  }),
]);

function isRepositoryRoot(directory) {
  try {
    return [
      join(directory, 'apps', 'compose.yaml'),
      join(directory, 'database', 'migrate.mjs'),
      join(directory, 'scripts', 'compose-cli.mjs'),
    ].every((path) => statSync(path).isFile());
  } catch {
    return false;
  }
}

export function resolveRepositoryRoot(moduleUrl = import.meta.url, _currentDirectory = process.cwd()) {
  let directory = dirname(fileURLToPath(moduleUrl));
  while (true) {
    if (isRepositoryRoot(directory)) return directory;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error('agroctl could not locate the repository root');
}

function helpText() {
  return [
    'agroctl — AgroPlatform developer CLI',
    '',
    'Usage: agroctl <bootstrap|migrate|seed|verify> [--help]',
    '',
    'Commands:',
    ...Object.entries(COMMANDS).map(([name, command]) => `  ${name.padEnd(10)} ${command.help}`),
    '',
    'Exit codes: 0 success, 1 operation failed, 2 invalid usage,',
    '            3 capability not configured, 127 required command unavailable.',
    '',
  ].join('\n');
}

function commandHelp(name) {
  const command = COMMANDS[name];
  const seedDetails = name === 'seed'
    ? '\n\nOptions:\n  --profile NAME  Fixture profile to load (supported: MINIMAL).\n'
    : '';
  return `${command.usage}\n\n${command.help}${seedDetails}\n`;
}

function sanitizeOutput(value, environment) {
  let output = String(value ?? '');
  const secrets = new Set();

  for (const [name, secret] of Object.entries(environment)) {
    if (/(password|secret|token|credential|private.?key)/i.test(name) && secret) {
      secrets.add(String(secret));
    }
  }

  const databaseUrl = environment.DATABASE_URL;
  if (databaseUrl) {
    secrets.add(String(databaseUrl));
    try {
      const parsed = new URL(databaseUrl);
      if (parsed.password) {
        secrets.add(parsed.password);
        secrets.add(decodeURIComponent(parsed.password));
      }
      if (parsed.username) secrets.add(decodeURIComponent(parsed.username));
    } catch {
      // Invalid connection strings are still covered by exact-value redaction.
    }
  }

  for (const secret of secrets) {
    if (secret.length > 0) output = output.replaceAll(secret, '[REDACTED]');
  }

  return output
    .replace(/\b(?:postgres(?:ql)?):\/\/[^\s/@]+@[^\s]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/\b(PGPASSWORD|password|token|secret|credential|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}

function signalExitCode(signal) {
  const number = osConstants.signals?.[signal];
  return typeof number === 'number'
    ? Math.min(255, 128 + number)
    : EXIT_CODES.failure;
}

function processOutcome(result, command, environment) {
  if (result?.error) {
    const missing = result.error.code === 'ENOENT';
    return {
      code: missing ? EXIT_CODES.commandUnavailable : EXIT_CODES.failure,
      message: missing
        ? `required executable unavailable: ${basename(command)}`
        : `failed to start ${basename(command)}`,
      stdout: '',
      stderr: '',
    };
  }

  if (result?.signal) {
    return {
      code: signalExitCode(result.signal),
      message: `terminated by signal ${result.signal}`,
      stdout: sanitizeOutput(result.stdout, environment),
      stderr: sanitizeOutput(result.stderr, environment),
    };
  }

  if (Number.isInteger(result?.status) && result.status >= 0) {
    return {
      code: result.status,
      message: result.status === 0 ? '' : `exit code ${result.status}`,
      stdout: sanitizeOutput(result.stdout, environment),
      stderr: sanitizeOutput(result.stderr, environment),
    };
  }

  return {
    code: EXIT_CODES.failure,
    message: 'child process did not provide an exit status',
    stdout: '',
    stderr: '',
  };
}

function createProcessRunner(runProcess, repoRoot, environment) {
  return (command, args) => runProcess(command, args, {
    cwd: repoRoot,
    env: environment,
    encoding: 'utf8',
    windowsHide: true,
  });
}

export function createCli({
  env = process.env,
  platform = process.platform,
  repoRoot = resolveRepositoryRoot(),
  runProcess = spawnSync,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const environment = { ...env };
  const run = createProcessRunner(runProcess, repoRoot, environment);

  function reportOutcome(label, command, args, result, { forwardOutput = true } = {}) {
    const outcome = processOutcome(result, command, environment);
    if (forwardOutput && outcome.stdout) stdout.write(outcome.stdout);
    if (outcome.stderr) stderr.write(outcome.stderr);
    if (outcome.code !== 0) {
      stderr.write(`agroctl: ${label} failed: ${outcome.message}\n`);
    }
    return outcome.code;
  }

  function bootstrap() {
    const selectedCompose = selectComposeCli(
      buildComposeCandidates(environment, platform),
      (command, args) => run(command, args),
    );
    if (!selectedCompose) {
      stderr.write('agroctl: Docker Compose is unavailable; install Docker Desktop or docker-compose.\n');
      return EXIT_CODES.commandUnavailable;
    }

    const args = composeArguments(selectedCompose, [
      '-f', 'apps/compose.yaml', 'up', '--build', '--detach',
    ]);
    const result = run(selectedCompose.command, args);
    const code = reportOutcome('bootstrap', selectedCompose.command, args, result);
    if (code === 0) {
      stdout.write('agroctl: development services started; use the Compose down command to stop them.\n');
    }
    return code;
  }

  function migrate() {
    const args = [join(repoRoot, 'database', 'migrate.mjs')];
    return reportOutcome('migrate', process.execPath, args, run(process.execPath, args));
  }

  function seed(args = []) {
    const profileIndex = args.indexOf('--profile');
    if (profileIndex !== -1 && (!args[profileIndex + 1] || args.indexOf('--profile', profileIndex + 1) !== -1)) {
      stderr.write('agroctl: usage: agroctl seed [--profile MINIMAL] [--help]\n');
      return EXIT_CODES.usage;
    }
    const profile = profileIndex === -1 ? 'MINIMAL' : args[profileIndex + 1];
    const loaderArgs = [join(repoRoot, 'demo', 'src', 'loader.mjs'), '--profile', profile];
    return reportOutcome('seed', process.execPath, loaderArgs, run(process.execPath, loaderArgs));
  }

  function verify() {
    let failed = false;
    for (const check of VERIFY_CHECKS) {
      stdout.write(`[verify] ${check.name}\n`);
      const result = run(process.execPath, check.args);
      const code = reportOutcome(check.name, process.execPath, check.args, result);
      if (code === 0) {
        stdout.write(`[verify] PASS ${check.name}\n`);
      } else {
        stderr.write(`[verify] FAIL ${check.name}: exit code ${code}\n`);
        failed = true;
      }
    }

    if (failed) {
      stderr.write('agroctl: verify failed; review the named checks above.\n');
      return EXIT_CODES.failure;
    }
    stdout.write('[verify] verify: PASS\n');
    return EXIT_CODES.success;
  }

  return function runCli(args = []) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
      stdout.write(helpText());
      return EXIT_CODES.success;
    }

    const [name, ...commandArgs] = args;
    if (!Object.hasOwn(COMMANDS, name)) {
      stderr.write(`agroctl: unknown command: ${name}\n\n${helpText()}`);
      return EXIT_CODES.usage;
    }
    if (commandArgs.length === 1 && ['--help', '-h'].includes(commandArgs[0])) {
      stdout.write(commandHelp(name));
      return EXIT_CODES.success;
    }
    if (name === 'seed') {
      const validSeedArgs = commandArgs.length === 0
        || (commandArgs.length === 2 && commandArgs[0] === '--profile');
      if (!validSeedArgs) {
        stderr.write('agroctl: usage: agroctl seed [--profile MINIMAL] [--help]\n');
        return EXIT_CODES.usage;
      }
    } else if (commandArgs.length > 0) {
      stderr.write(`agroctl: usage: ${COMMANDS[name].usage} [--help]\n`);
      return EXIT_CODES.usage;
    }

    if (name === 'bootstrap') return bootstrap();
    if (name === 'migrate') return migrate();
    if (name === 'seed') return seed(commandArgs);
    return verify();
  };
}

export function runCli(args = process.argv.slice(2)) {
  return createCli()(args);
}
