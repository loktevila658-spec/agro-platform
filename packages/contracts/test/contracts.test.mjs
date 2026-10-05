import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  detectGeneratedDrift,
  loadAndValidateContracts,
  renderGeneratedArtifacts,
  validateEventCatalog,
  validateOpenApi,
} from '../scripts/lib/contracts.mjs';

const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url);

test('canonical OpenAPI and event catalog validate', async () => {
  const contracts = await loadAndValidateContracts();
  assert.equal(contracts.openapi.openapiVersion, '3.1.0');
  assert.equal(contracts.events.catalogVersion, '1.0.0');
  assert.deepEqual(contracts.events.events, []);
});

test('invalid OpenAPI state fails with an actionable error', async () => {
  const source = await readFile(fixture('invalid-openapi.yaml'), 'utf8');
  assert.throws(() => validateOpenApi(source), /OpenAPI version must be 3\.1\.x/);
});

test('invalid event catalog state reports every contract violation', async () => {
  const source = JSON.parse(await readFile(fixture('invalid-event-catalog.json'), 'utf8'));
  assert.throws(
    () => validateEventCatalog(source),
    (error) => {
      assert.match(error.message, /catalogVersion must be semantic version/);
      assert.match(error.message, /event name/);
      assert.match(error.message, /producer/);
      assert.match(error.message, /consumers must be unique/);
      assert.match(error.message, /schema type must be object/);
      return true;
    },
  );
});

test('TypeScript generation is deterministic', async () => {
  const contracts = await loadAndValidateContracts();
  const first = renderGeneratedArtifacts(contracts);
  const second = renderGeneratedArtifacts(contracts);
  assert.equal(
    first.get('src/generated/contracts.ts'),
    second.get('src/generated/contracts.ts'),
  );
});

test('Dart generation is deterministic', async () => {
  const contracts = await loadAndValidateContracts();
  const first = renderGeneratedArtifacts(contracts);
  const second = renderGeneratedArtifacts(contracts);
  assert.equal(
    first.get('generated/dart/contracts.dart'),
    second.get('generated/dart/contracts.dart'),
  );
});

test('repeated generation keeps stable output ordering', async () => {
  const first = renderGeneratedArtifacts(await loadAndValidateContracts());
  assert.deepEqual(
    [...first.keys()],
    [
      'generated/dart/contracts.dart',
      'generated/manifest.json',
      'src/generated/contracts.ts',
    ],
  );
});

test('generated-output drift is detected without rewriting files', async () => {
  const expected = renderGeneratedArtifacts(await loadAndValidateContracts());
  const actual = new Map(expected);
  actual.set('generated/dart/contracts.dart', '// manually edited\n');
  assert.deepEqual(detectGeneratedDrift(expected, actual), ['generated/dart/contracts.dart']);
});

test('generated clients remain domain-free at bootstrap', async () => {
  const artifacts = renderGeneratedArtifacts(await loadAndValidateContracts());
  const typescript = artifacts.get('src/generated/contracts.ts');
  const dart = artifacts.get('generated/dart/contracts.dart');
  assert.match(typescript, /class AgroPlatformApiClient/);
  assert.match(dart, /class AgroPlatformApiClient/);
  assert.doesNotMatch(typescript, /identity|permission|audit|warehouse|production/i);
  assert.doesNotMatch(dart, /identity|permission|audit|warehouse|production/i);
});
