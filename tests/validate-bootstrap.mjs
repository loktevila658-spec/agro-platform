import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const workspace = JSON.parse(readFileSync('apps/package.json', 'utf8'));
if (workspace.private !== true || workspace.packageManager !== 'pnpm@11.19.0') {
  throw new Error('workspace package metadata is not pinned');
}

const compose = readFileSync('apps/compose.yaml', 'utf8');
for (const service of ['api', 'web', 'workers', 'ai']) {
  if (!new RegExp(`^  ${service}:$`, 'm').test(compose)) {
    throw new Error(`compose service is missing: ${service}`);
  }
}

const mobile = readFileSync('apps/mobile/pubspec.yaml', 'utf8');
if (!/^  flutter:\n    sdk: flutter$/m.test(mobile)) {
  throw new Error('Flutter shell declaration is missing');
}

const pythonSyntax = spawnSync(
  'python3',
  [
    '-c',
    'import ast, pathlib; ast.parse(pathlib.Path("apps/ai/src/main.py").read_text())',
  ],
  { encoding: 'utf8' },
);
if (pythonSyntax.status !== 0) {
  process.stderr.write(pythonSyntax.stderr);
  process.exit(pythonSyntax.status ?? 1);
}

console.log('WP49-001 bootstrap validation passed');
