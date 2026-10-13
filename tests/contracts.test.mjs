import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  parseYamlDocument,
  validateOpenApi,
} from '../packages/contracts/scripts/lib/contracts.mjs';

test('OpenAPI remains a bootstrap contract with only authorized system and observability operations', () => {
  const source = readFileSync('openapi/openapi.yaml', 'utf8');
  const { document, operations } = validateOpenApi(source);

  assert.equal(document.openapi, '3.1.0');
  assert.equal(document['x-status'], 'BOOTSTRAP');
  assert.deepEqual(Object.keys(document.paths).sort(), [
    '/health/live',
    '/health/ready',
    '/metrics',
    '/system/schema-version',
  ]);
  assert.deepEqual(operations, [
    {
      method: 'GET',
      operationId: 'getLiveness',
      path: '/health/live',
      responseSchemaName: 'LivenessResponse',
    },
    {
      method: 'GET',
      operationId: 'getReadiness',
      path: '/health/ready',
      responseSchemaName: 'ReadinessResponse',
    },
    {
      method: 'GET',
      operationId: 'getMetrics',
      path: '/metrics',
      responseSchemaName: 'MetricsResponse',
    },
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
  assert.deepEqual(Object.keys(document.paths).filter((path) => ![
    '/system/schema-version',
    '/health/live',
    '/health/ready',
    '/metrics',
  ].includes(path)), []);
});

test('event catalog contains no domain events', () => {
  const source = readFileSync('events/catalog/index.yaml', 'utf8');
  const catalog = parseYamlDocument(source);

  assert.equal(catalog.status, 'BOOTSTRAP');
  assert.deepEqual(catalog.events, []);
});
