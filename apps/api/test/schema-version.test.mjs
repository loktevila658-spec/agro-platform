import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXPECTED_SCHEMA_VERSION,
  parseSchemaVersionOutput,
  SchemaVersionUnavailableError,
} from '../dist/schema-version.service.js';

test('schema-version output is parsed into the public API model', () => {
  assert.deepEqual(parseSchemaVersionOutput('2|3.5.2\n'), {
    schemaVersion: 2,
    expectedSchemaVersion: 2,
    postgisVersion: '3.5.2',
    status: 'current',
  });
});

test('schema-version state reports behind and ahead deterministically', () => {
  assert.equal(parseSchemaVersionOutput('1|3.5.2').status, 'behind');
  assert.equal(parseSchemaVersionOutput('3|3.5.2').status, 'ahead');
});

test('malformed or incomplete database output fails closed', () => {
  assert.throws(
    () => parseSchemaVersionOutput('not-a-version|3.5.2'),
    SchemaVersionUnavailableError,
  );
  assert.throws(
    () => parseSchemaVersionOutput('2|'),
    SchemaVersionUnavailableError,
  );
});

test('API expected version matches the migration baseline', () => {
  assert.equal(EXPECTED_SCHEMA_VERSION, 2);
});
