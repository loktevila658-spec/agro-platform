import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  detectGeneratedDrift,
  loadAndValidateContracts,
  renderGeneratedArtifacts,
  validateEventCatalog,
  validateEventSchema,
  validateOpenApi,
} from '../scripts/lib/contracts.mjs';

const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url);
const syntheticEvent = {
  name: 'platform.synthetic',
  version: '1.0.0',
  producer: 'contract-test',
  consumers: ['contract-test-consumer'],
  schema: { type: 'object', additionalProperties: false, properties: {}, required: [] },
};

test('canonical OpenAPI validates and declares only authorized bootstrap operations', async () => {
  const { openapi } = await loadAndValidateContracts();
  assert.deepEqual(openapi.operations, [
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
});

test('malformed OpenAPI syntax fails deterministically', async () => {
  const source = await readFile(fixture('malformed-openapi.yaml'), 'utf8');
  assert.throws(() => validateOpenApi(source), /Invalid OpenAPI syntax/);
});

test('invalid OpenAPI structure fails deterministically', async () => {
  const source = await readFile(fixture('invalid-openapi.yaml'), 'utf8');
  assert.throws(() => validateOpenApi(source), /Invalid OpenAPI structure/);
});

test('canonical event schema and single YAML catalog validate', async () => {
  const contracts = await loadAndValidateContracts();
  assert.equal(contracts.events.catalogVersion, '1.0.0');
  assert.deepEqual(contracts.events.events, []);
  assert.deepEqual(Object.keys(contracts.sources).sort(), [
    'events/catalog/index.yaml',
    'events/schemas/event-catalog.schema.json',
    'openapi/openapi.yaml',
  ]);
});

test('event schema rejects unsupported evaluator keywords', async () => {
  const { eventSchema } = await loadAndValidateContracts();
  assert.throws(() => validateEventSchema({ ...eventSchema, const: true }), /unsupported keyword const/);
});

test('event schema enforces required properties and rejects additional properties', async () => {
  const { events, eventSchema } = await loadAndValidateContracts();
  const missing = structuredClone(events);
  delete missing.catalogVersion;
  assert.throws(() => validateEventCatalog(missing, eventSchema), /catalogVersion is required/);
  assert.throws(() => validateEventCatalog({ ...events, unexpected: true }, eventSchema), /unexpected is not allowed/);
});

test('event schema enforces patterns', async () => {
  const { events, eventSchema } = await loadAndValidateContracts();
  const invalid = { ...events, events: [{ ...syntheticEvent, name: 'Invalid Event' }] };
  assert.throws(() => validateEventCatalog(invalid, eventSchema), /name does not match pattern/);
});

test('event schema enforces unique array entries', async () => {
  const { events, eventSchema } = await loadAndValidateContracts();
  const invalid = { ...events, events: [{ ...syntheticEvent, consumers: ['same', 'same'] }] };
  assert.throws(() => validateEventCatalog(invalid, eventSchema), /consumers must contain unique items/);
});

test('event schema rejects invalid event payload schema shape', async () => {
  const { events, eventSchema } = await loadAndValidateContracts();
  const invalid = { ...events, events: [{ ...syntheticEvent, schema: { type: 'string' } }] };
  assert.throws(
    () => validateEventCatalog(invalid, eventSchema),
    /schema\.additionalProperties is required|schema\.type does not match pattern/,
  );
});

test('malformed event catalog fails declared schema validation', async () => {
  const { eventSchema } = await loadAndValidateContracts();
  const invalid = JSON.parse(await readFile(fixture('invalid-event-catalog.json'), 'utf8'));
  assert.throws(() => validateEventCatalog(invalid, eventSchema), /Invalid event catalog/);
});

test('schema-version operation is generated in TypeScript and Dart', async () => {
  const artifacts = renderGeneratedArtifacts(await loadAndValidateContracts());
  assert.match(artifacts.get('src/generated/contracts.ts'), /async getSchemaVersion\(\): Promise<SchemaVersionResponse>/);
  assert.match(artifacts.get('generated/dart/contracts.dart'), /Future<SchemaVersionResponse> getSchemaVersion\(\) async/);
});

test('synthetic event is generated deterministically in TypeScript and Dart', async () => {
  const contracts = await loadAndValidateContracts();
  const withEvent = { ...contracts, events: { ...contracts.events, events: [syntheticEvent] } };
  const first = renderGeneratedArtifacts(withEvent);
  const second = renderGeneratedArtifacts(withEvent);
  assert.deepEqual(first, second);
  assert.match(first.get('src/generated/contracts.ts'), /"name": "platform\.synthetic"/);
  assert.match(first.get('generated/dart/contracts.dart'), /name: 'platform\.synthetic'/);
});

test('repeated canonical generation is byte-identical with stable output ordering', async () => {
  const contracts = await loadAndValidateContracts();
  const first = renderGeneratedArtifacts(contracts);
  const second = renderGeneratedArtifacts(contracts);
  assert.deepEqual(first, second);
  assert.deepEqual([...first.keys()], [
    'generated/dart/contracts.dart',
    'generated/manifest.json',
    'src/generated/contracts.ts',
  ]);
});

test('generated-output drift is detected without rewriting files', async () => {
  const expected = renderGeneratedArtifacts(await loadAndValidateContracts());
  const actual = new Map(expected);
  actual.set('generated/dart/contracts.dart', '// manually edited\n');
  assert.deepEqual(detectGeneratedDrift(expected, actual), ['generated/dart/contracts.dart']);
});

test('canonical generated clients remain free of unauthorized domains', async () => {
  const artifacts = renderGeneratedArtifacts(await loadAndValidateContracts());
  for (const generated of artifacts.values()) {
    assert.doesNotMatch(generated, /identity|permission|audit|warehouse|production/i);
  }
});
