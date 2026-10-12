import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
);

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

export const gateDefinitions = Object.freeze({
  lint: {
    description: 'Run repository lint scripts where supported',
    steps: [{ label: 'lint capability', kind: 'lint-capability' }],
  },
  typecheck: {
    description: 'Workspace static typecheck',
    steps: [
      {
        label: 'workspace typecheck',
        command: pnpm,
        args: ['--dir', 'apps', 'typecheck'],
      },
    ],
  },
  unit: {
    description: 'Build and unit/regression test suites',
    steps: [
      {
        label: 'workspace build prerequisite',
        command: pnpm,
        args: ['--dir', 'apps', 'build'],
      },
      {
        label: 'workspace package tests',
        command: pnpm,
        args: ['--dir', 'apps', '-r', '--if-present', 'test'],
      },
      {
        label: 'bootstrap regression tests',
        command: pnpm,
        args: ['--dir', 'apps', 'test'],
      },
      {
        label: 'migration unit tests',
        command: process.execPath,
        args: ['--test', 'database/test/migrate.test.mjs'],
      },
      {
        label: 'bootstrap structural validation',
        command: pnpm,
        args: ['--dir', 'apps', 'validate'],
      },
    ],
  },
  contract: {
    description: 'Canonical contract validation and generated-client drift',
    steps: [
      {
        label: 'contract validation',
        command: pnpm,
        args: [
          '--dir',
          'apps',
          '--filter',
          '@agroplatform/contracts',
          'contracts:validate',
        ],
      },
      {
        label: 'generated contract drift',
        command: pnpm,
        args: [
          '--dir',
          'apps',
          '--filter',
          '@agroplatform/contracts',
          'contracts:check',
        ],
      },
    ],
  },
  migration: {
    description: 'Real PostgreSQL/PostGIS migration and API integration',
    steps: [
      {
        label: 'API build prerequisite',
        command: pnpm,
        args: ['--dir', 'apps', '--filter', '@agroplatform/api', 'build'],
      },
      {
        label: 'PostgreSQL/PostGIS integration',
        command: process.execPath,
        args: ['--test', 'database/test/database.integration.test.mjs'],
      },
    ],
  },
  runtime: {
    description: 'Docker Compose bootstrap regression',
    steps: [
      {
        label: 'Compose runtime smoke',
        command: process.execPath,
        args: ['tests/compose-smoke.mjs', '--require-engine'],
      },
    ],
  },
});

function manifestDirectories() {
  const directories = [join(repositoryRoot, 'apps')];

  for (const parent of ['apps', 'packages']) {
    const parentPath = join(repositoryRoot, parent);
    for (const entry of readdirSync(parentPath, { withFileTypes: true })) {
      if (entry.isDirectory()) directories.push(join(parentPath, entry.name));
    }
  }

  return directories;
}

export function configuredLintScripts() {
  const scripts = [];

  for (const directory of manifestDirectories()) {
    try {
      const manifest = JSON.parse(
        readFileSync(join(directory, 'package.json'), 'utf8'),
      );
      if (typeof manifest.scripts?.lint === 'string') {
        scripts.push({ name: manifest.name, directory });
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  return scripts;
}

export function runCommand(step) {
  process.stdout.write(`\n[CI gate] ${step.label}\n`);
  const result = spawnSync(step.command, step.args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(
      `${step.label} failed with exit status ${String(result.status)}`,
    );
    error.exitStatus = result.status;
    throw error;
  }
}

function runLintCapability() {
  const lintScripts = configuredLintScripts();
  if (lintScripts.length === 0) {
    process.stdout.write(
      '\n[CI gate] lint: N/A — no repository lint script/tool is configured\n',
    );
    return;
  }

  runCommand({
    label: `workspace lint (${lintScripts.length} configured package(s))`,
    command: pnpm,
    args: ['--dir', 'apps', '-r', '--if-present', 'lint'],
  });
}

export function runGate(name) {
  const definition = gateDefinitions[name];
  if (!definition) throw new Error(`Unknown CI gate: ${name}`);

  process.stdout.write(`\n=== ${name}: ${definition.description} ===\n`);
  for (const step of definition.steps) {
    if (step.kind === 'lint-capability') runLintCapability();
    else runCommand(step);
  }
  process.stdout.write(`\n=== ${name}: PASS ===\n`);
}

function usage() {
  return `Usage: node scripts/ci-gates.mjs <${Object.keys(gateDefinitions).join('|')}|all|--list>`;
}

function main() {
  const selection = process.argv[2];
  if (selection === '--list') {
    process.stdout.write(`${Object.keys(gateDefinitions).join('\n')}\n`);
    return;
  }
  if (selection === 'all') {
    for (const name of Object.keys(gateDefinitions)) runGate(name);
    return;
  }
  if (!selection) throw new Error(usage());
  runGate(selection);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;

if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
