import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

const required = [
  'apps/api/src/main.ts',
  'apps/web/src/app/page.tsx',
  'apps/mobile/lib/main.dart',
  'apps/ai/src/main.py',
  'apps/workers/src/main.ts',
  'packages/contracts/src/index.ts',
  'database/migrations',
  'openapi/openapi.yaml',
  'events/catalog/index.yaml',
];

test('WP49-001 repository skeleton is complete', () => {
  for (const path of required) {
    assert.equal(existsSync(path), true, `missing required bootstrap path: ${path}`);
  }
});

test('later work-package modules are absent', () => {
  const forbidden = [
    'apps/api/modules/identity',
    'apps/api/modules/permissions',
    'apps/api/modules/audit',
    'apps/api/modules/gis',
    'apps/api/modules/warehouse',
    'apps/api/modules/production',
  ];

  for (const path of forbidden) {
    assert.equal(existsSync(path), false, `out-of-scope module exists: ${path}`);
  }
});
