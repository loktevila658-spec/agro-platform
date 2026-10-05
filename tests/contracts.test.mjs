import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  parseYamlDocument,
  validateOpenApi,
} from '../packages/contracts/scripts/lib/contracts.mjs';

test('OpenAPI remains a bootstrap contract with only schema-version exposed', () => {
  const source = readFileSync('openapi/openapi.yaml', 'utf8');
  const { document, operations } = validateOpenApi(source);

  assert.equal(document.openapi, '3.1.0');
  assert.equal(document['x-status'], 'BOOTSTRAP');
  assert.deepEqual(Object.keys(document.paths), ['/system/schema-version']);
  assert.deepEqual(operations, [
    {
      method: 'GET',
      operationId: 'getSchemaVersion',
      path: '/system/schema-version',
      responseSchemaName: 'SchemaVersionResponse',
    },
  ]);

  const forbiddenDomains =
    /auth|identity|permission|audit|gis|fleet|warehouse|production/i;
  assert.doesNotMatch(Object.keys(document.paths).join('\n'), forbiddenDomains);
});

test('event catalog contains no domain events', () => {
  const source = readFileSync('events/catalog/index.yaml', 'utf8');
  const catalog = parseYamlDocument(source);

  assert.equal(catalog.status, 'BOOTSTRAP');
  assert.deepEqual(catalog.events, []);
});
