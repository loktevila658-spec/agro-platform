import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  configuredLintScripts,
  gateDefinitions,
  repositoryRoot,
  runCommand,
} from '../scripts/ci-gates.mjs';

const workflowPath = join(
  repositoryRoot,
  '.github/workflows/ci-quality-gates.yml',
);

test('CI exposes the complete deterministic gate set', () => {
  assert.deepEqual(Object.keys(gateDefinitions), [
    'lint',
    'typecheck',
    'unit',
    'contract',
    'migration',
    'runtime',
  ]);

  assert.deepEqual(
    gateDefinitions.lint.steps.map(({ label }) => label),
    ['lint capability'],
  );
  assert.equal(gateDefinitions.typecheck.steps[0].label, 'workspace typecheck');
  assert.deepEqual(
    gateDefinitions.contract.steps.map(({ label }) => label),
    ['contract validation', 'generated contract drift'],
  );
  assert.match(
    gateDefinitions.migration.steps.at(-1).args.join(' '),
    /database\/test\/database\.integration\.test\.mjs/,
  );
  assert.match(
    gateDefinitions.runtime.steps.at(-1).args.join(' '),
    /tests\/compose-smoke\.mjs --require-engine/,
  );
});

test('lint capability is reported honestly when no lint script is configured', () => {
  assert.deepEqual(configuredLintScripts(), []);
  assert.equal(gateDefinitions.lint.steps[0].kind, 'lint-capability');
});

test('a failed command fails closed with its original exit status', () => {
  const fixture = join(repositoryRoot, 'tests/fixtures/ci/fail.mjs');

  assert.throws(
    () =>
      runCommand({
        label: 'intentional negative-path fixture',
        command: process.execPath,
        args: [fixture],
      }),
    (error) => error.exitStatus === 23,
  );
});

test('an unknown gate is rejected', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/ci-gates.mjs', 'not-a-real-gate'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown CI gate/);
});

test('pull-request workflow runs every blocking gate and a fail-closed aggregate', () => {
  const workflow = readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /^name: CI Quality Gates$/m);
  assert.match(workflow, /^  pull_request:\n    branches: \[main\]$/m);
  assert.match(workflow, /^permissions:\n  contents: read$/m);

  for (const gate of Object.keys(gateDefinitions)) {
    assert.match(workflow, new RegExp(`node scripts/ci-gates\\.mjs ${gate}`));
  }

  assert.match(
    workflow,
    /needs: \[lint, typecheck, unit, contract, migration, runtime\]/,
  );
  assert.match(workflow, /name: CI quality gates/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
  assert.doesNotMatch(
    workflow,
    /uses: [^\n]+@v\d/,
    'third-party actions must be pinned to immutable commits',
  );
});
