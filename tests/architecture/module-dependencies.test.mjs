import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  applicationBoundaryRule,
  evidenceFor,
  repositoryRoot,
  scanRepository,
  scanSourceFiles,
} from './guard.mjs';

function fixtureRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'agro-architecture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function source(root, path, contents) {
  const absolute = join(root, path);
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, contents);
  return absolute;
}

function typescriptPackage(root, packageRoot, imports = '') {
  source(root, `${packageRoot}/package.json`, '{"name":"fixture-package"}\n');
  source(root, `${packageRoot}/tsconfig.json`, JSON.stringify({
    compilerOptions: { outDir: 'dist', rootDir: 'src' },
  }));
  source(root, `${packageRoot}/test/imports.mjs`, imports);
}

test('allowed application-to-shared-package dependency passes', (t) => {
  const root = fixtureRoot(t);
  const importer = source(root, 'apps/api/src/controller.ts', "import {\n  contract,\n} from '../../../packages/contracts/src/index.ts';\n");
  source(root, 'packages/contracts/src/index.ts', 'export const contract = {};\n');

  const result = scanSourceFiles(root, [importer]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.violations, []);
  assert.equal(result.dependencies.length, 1);
});

test('forbidden application-to-application implementation import fails with source, target, and rule', (t) => {
  const root = fixtureRoot(t);
  const importer = source(root, 'apps/api/src/controller.ts', "import { page } from '../../../apps/web/src/page.ts';\n");
  source(root, 'apps/web/src/page.ts', 'export const page = {};\n');

  const result = scanSourceFiles(root, [importer]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].rule, applicationBoundaryRule);
  assert.equal(result.violations[0].source, 'apps/api/src/controller.ts');
  assert.equal(result.violations[0].sourceApplication, 'api');
  assert.equal(result.violations[0].target, 'apps/web/src/page.ts');
  assert.match(result.violations[0].message, /another application implementation/);
});

test('Python and Dart application imports are checked against the same boundary', (t) => {
  const root = fixtureRoot(t);
  const pythonImporter = source(root, 'apps/ai/src/main.py', 'from apps.web.src import page\n');
  source(root, 'apps/web/src/__init__.py', '');
  source(root, 'apps/web/src/page.py', 'page = None\n');
  const dartImporter = source(root, 'apps/mobile/lib/main.dart', "import '../../web/src/app/page.tsx';\n");
  source(root, 'apps/web/src/app/page.tsx', 'export const page = {};\n');

  const result = scanSourceFiles(root, [pythonImporter, dartImporter]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.violations.map(({ source: path }) => path), [
    'apps/ai/src/main.py',
    'apps/mobile/lib/main.dart',
  ]);
  assert.ok(result.violations.every(({ rule }) => rule === applicationBoundaryRule));
});

test('repository scan emits stable machine-readable evidence and evaluates real imports', () => {
  const first = scanRepository();
  const second = scanRepository();
  assert.deepEqual(first, second);
  assert.deepEqual(first.errors, []);
  assert.deepEqual(first.violations, []);
  assert.ok(first.dependencies.length > 0, 'repository source imports must be inspected');
  assert.ok(first.dependencies.some(({ source: from, target }) =>
    from === 'apps/api/src/main.ts' && target === 'security/headers.cjs'),
  'must evaluate an actual source import rather than only a policy graph');
  const evidence = evidenceFor(first);
  assert.equal(evidence.gate, 'G1-architecture');
  assert.equal(evidence.result, 'PASS');
  assert.equal(evidence.sourceDependenciesChecked, first.dependencies.length);
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
});

test('repository root resolution is independent of the current working directory', (t) => {
  const otherCwd = fixtureRoot(t);
  const moduleUrl = new URL('./guard.mjs', import.meta.url).href;
  const child = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    `import { repositoryRoot } from ${JSON.stringify(moduleUrl)}; process.stdout.write(repositoryRoot)`,
  ], { cwd: otherCwd, encoding: 'utf8' });

  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, repositoryRoot);
  assert.equal(repositoryRoot, resolve(new URL('../..', import.meta.url).pathname));
});

test('unresolved local import fails closed with source and specifier', (t) => {
  const root = fixtureRoot(t);
  const importer = source(root, 'apps/api/src/controller.ts', "import './missing.js';\n");

  const result = scanSourceFiles(root, [importer]);
  assert.deepEqual(result.violations, []);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /apps\/api\/src\/controller\.ts/);
  assert.match(result.errors[0], /unresolved local import '\.\/missing\.js'/);
  assert.equal(evidenceFor(result).result, 'FAIL');
});

test('API test imports resolve dist outputs to src TypeScript without dist artifacts', (t) => {
  const root = fixtureRoot(t);
  typescriptPackage(root, 'apps/api', "import '../dist/main.js';\nimport '../dist/schema-version.service.js';\n");
  source(root, 'apps/api/src/main.ts', 'export {};\n');
  source(root, 'apps/api/src/schema-version.service.ts', 'export {};\n');

  assert.equal(existsSync(join(root, 'apps/api/dist')), false);
  const result = scanSourceFiles(root, [join(root, 'apps/api/test/imports.mjs')]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.dependencies.map(({ target }) => target), [
    'apps/api/src/main.ts',
    'apps/api/src/schema-version.service.ts',
  ]);
});

test('package test import resolves dist/index.js to src/index.ts without dist artifacts', (t) => {
  const root = fixtureRoot(t);
  typescriptPackage(root, 'packages/config', "import '../dist/index.js';\n");
  source(root, 'packages/config/src/index.ts', 'export {};\n');

  assert.equal(existsSync(join(root, 'packages/config/dist')), false);
  const result = scanSourceFiles(root, [join(root, 'packages/config/test/imports.mjs')]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.dependencies[0].target, 'packages/config/src/index.ts');
});

test('compiled output with no corresponding source still fails closed', (t) => {
  const root = fixtureRoot(t);
  typescriptPackage(root, 'apps/api', "import '../dist/missing.js';\n");

  assert.equal(existsSync(join(root, 'apps/api/dist')), false);
  const result = scanSourceFiles(root, [join(root, 'apps/api/test/imports.mjs')]);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /compiled output 'dist\/missing\.js' has no matching source under 'src'/);
});

test('fake output mapping cannot escape the importing application package', (t) => {
  const root = fixtureRoot(t);
  typescriptPackage(root, 'apps/api', "import '../../web/dist/index.js';\n");
  typescriptPackage(root, 'apps/web');
  source(root, 'apps/web/src/index.ts', 'export {};\n');

  const importer = join(root, 'apps/api/test/imports.mjs');
  const result = scanSourceFiles(root, [importer]);
  assert.deepEqual(result.violations, []);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /unresolved local import '\.\.\/\.\.\/web\/dist\/index\.js'/);
});

test('pristine repository fixture scan is deterministic with no dist directories', (t) => {
  const root = fixtureRoot(t);
  typescriptPackage(root, 'apps/api', "import '../dist/main.js';\n");
  source(root, 'apps/api/src/main.ts', 'export {};\n');
  mkdirSync(join(root, 'packages'), { recursive: true });
  typescriptPackage(root, 'packages/config', "import '../dist/index.js';\n");
  source(root, 'packages/config/src/index.ts', 'export {};\n');

  assert.equal(existsSync(join(root, 'apps/api/dist')), false);
  assert.equal(existsSync(join(root, 'packages/config/dist')), false);
  const first = scanRepository(root);
  const second = scanRepository(root);
  assert.deepEqual(first, second);
  assert.deepEqual(first.errors, []);
  assert.deepEqual(first.violations, []);
  assert.equal(first.dependencies.length, 2);
});
