import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('OpenAPI remains an empty bootstrap contract', () => {
  const source = readFileSync('openapi/openapi.yaml', 'utf8');
  assert.match(source, /^openapi: 3\.1\.0/m);
  assert.match(source, /^paths: \{\}$/m);
  assert.match(source, /^x-status: BOOTSTRAP$/m);
});

test('event catalog contains no domain events', () => {
  const source = readFileSync('events/catalog/index.yaml', 'utf8');
  assert.match(source, /^events: \[\]$/m);
  assert.match(source, /^status: BOOTSTRAP$/m);
});
