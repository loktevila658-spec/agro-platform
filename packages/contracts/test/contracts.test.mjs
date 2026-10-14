import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
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
const require = createRequire(new URL('../../../apps/package.json', import.meta.url));
const typescript = require('typescript');
const syntheticEvent = {
  name: 'platform.synthetic',
  version: '1.0.0',
  producer: 'contract-test',
  consumers: ['contract-test-consumer'],
  schema: { type: 'object', additionalProperties: false, properties: {}, required: [] },
};

test('canonical OpenAPI declares the bootstrap and WP49-011 operations with exact request inputs', async () => {
  const { openapi } = await loadAndValidateContracts();
  assert.deepEqual(openapi.operations.map(({ method, operationId, path, responseSchemaName }) => ({ method, operationId, path, responseSchemaName })), [
    { method: 'GET', operationId: 'getLiveness', path: '/health/live', responseSchemaName: 'LivenessResponse' },
    { method: 'GET', operationId: 'getReadiness', path: '/health/ready', responseSchemaName: 'ReadinessResponse' },
    { method: 'GET', operationId: 'getMetrics', path: '/metrics', responseSchemaName: 'MetricsResponse' },
    { method: 'POST', operationId: 'createOrgOrganizationUnit', path: '/org/organization-units', responseSchemaName: 'OrganizationUnitResponse' },
    { method: 'POST', operationId: 'createOrgOrganization', path: '/org/organizations', responseSchemaName: 'OrganizationResponse' },
    { method: 'POST', operationId: 'createOrgSite', path: '/org/sites', responseSchemaName: 'SiteResponse' },
    { method: 'POST', operationId: 'createOrgTenant', path: '/org/tenants', responseSchemaName: 'TenantResponse' },
    { method: 'GET', operationId: 'getOrgHierarchy', path: '/org/tenants/{tenantId}/hierarchy', responseSchemaName: 'HierarchyResponse' },
    { method: 'GET', operationId: 'getSchemaVersion', path: '/system/schema-version', responseSchemaName: 'SchemaVersionResponse' },
    { method: 'POST', operationId: 'login', path: '/v1/auth/login', responseSchemaName: 'LoginResponse' },
    { method: 'POST', operationId: 'logout', path: '/v1/auth/logout', responseSchemaName: 'RevocationResponse' },
    { method: 'POST', operationId: 'verifyMfa', path: '/v1/auth/mfa/verify', responseSchemaName: 'TokenResponse' },
    { method: 'POST', operationId: 'refreshSession', path: '/v1/auth/refresh', responseSchemaName: 'TokenResponse' },
    { method: 'GET', operationId: 'listMySessions', path: '/v1/me/sessions', responseSchemaName: 'SessionListResponse' },
    { method: 'POST', operationId: 'revokeMySession', path: '/v1/me/sessions/{id}/commands/revoke', responseSchemaName: 'RevocationResponse' },
  ]);
  const tenant = openapi.operations.find(({ operationId }) => operationId === 'createOrgTenant');
  assert.deepEqual(tenant.inputs, {
    header: [
      { name: 'Authorization', required: true, type: 'string' },
      { name: 'Idempotency-Key', required: true, type: 'string' },
      { name: 'X-Causation-Id', required: false, type: 'string' },
      { name: 'X-Correlation-Id', required: false, type: 'string' },
    ],
    body: { schemaName: 'CreateTenantRequest', required: true },
  });
  assert.deepEqual(openapi.operations.find(({ operationId }) => operationId === 'getOrgHierarchy').inputs.path, [
    { name: 'tenantId', required: true, type: 'string' },
  ]);
  for (const operationId of ['getSchemaVersion', 'getLiveness', 'getReadiness', 'getMetrics']) {
    assert.deepEqual(openapi.operations.find((operation) => operation.operationId === operationId).inputs.header, [
      { name: 'X-Correlation-Id', required: false, type: 'string' },
    ]);
  }

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
  assert.deepEqual(contracts.events.events.map(({ name, version, producer }) => ({ name, version, producer })), [
    { name: 'org.tenant.created', version: '1.0.0', producer: 'org' },
    { name: 'org.organization.created', version: '1.0.0', producer: 'org' },
    { name: 'org.unit.created', version: '1.0.0', producer: 'org' },
    { name: 'org.site.created', version: '1.0.0', producer: 'org' },
    { name: 'security.session_created', version: '1.0.0', producer: 'identity' },
    { name: 'security.session_revoked', version: '1.0.0', producer: 'identity' },
    { name: 'security.mfa_changed', version: '1.0.0', producer: 'identity' },
  ]);
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

test('event names preserve org names and accept required lowercase snake_case segments', async () => {
  const { events, eventSchema } = await loadAndValidateContracts();
  for (const name of ['org.tenant.created', 'org.organization.created', 'org.unit.created', 'org.site.created', 'security.session_created', 'security.session_revoked', 'security.mfa_changed']) {
    assert.doesNotThrow(() => validateEventCatalog({ ...events, events: [{ ...syntheticEvent, name }] }, eventSchema), name);
  }
});

test('event names reject malformed separators and uppercase segments', async () => {
  const { events, eventSchema } = await loadAndValidateContracts();
  for (const name of ['security._session.created', 'security.session_.created', 'security.session__created', 'security..session', '.security.session', 'security.session.', 'security.Session_created', 'security.SESSION_created']) {
    assert.throws(() => validateEventCatalog({ ...events, events: [{ ...syntheticEvent, name }] }, eventSchema), /name does not match pattern/, name);
  }
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
  assert.match(artifacts.get('src/generated/contracts.ts'), /async getSchemaVersion\(xCorrelationId\?: string\): Promise<SchemaVersionResponse>/);
  assert.match(artifacts.get('src/generated/contracts.ts'), /headers\["X-Correlation-Id"\] = String\(xCorrelationId\)/);
  assert.match(artifacts.get('src/generated/contracts.ts'), /readonly sessions: readonly SessionSummary\[\];/);
  assert.match(artifacts.get('generated/dart/contracts.dart'), /final List<SessionSummary> sessions;/);
  assert.match(artifacts.get('generated/dart/contracts.dart'), /SessionSummary\.fromJson\(Map<String, Object\?>\.from\(item as Map\)\)/);
  assert.match(artifacts.get('src/generated/contracts.ts'), /async createOrgTenant\(authorization: string, idempotencyKey: string, body: CreateTenantRequest/);
  assert.match(artifacts.get('src/generated/contracts.ts'), /encodeURIComponent\(String\(tenantId\)\)/);
  assert.match(artifacts.get('src/generated/contracts.ts'), /JSON\.stringify\(body\)/);
  assert.match(artifacts.get('src/generated/contracts.ts'), /headers\["Idempotency-Key"\]/);
  assert.match(artifacts.get('generated/dart/contracts.dart'), /Future<SchemaVersionResponse> getSchemaVersion\(\{String\? xCorrelationId\}\) async/);
  assert.match(artifacts.get('generated/dart/contracts.dart'), /if \(xCorrelationId != null\) 'X-Correlation-Id': xCorrelationId!/);
  assert.match(artifacts.get('generated/dart/contracts.dart'), /Uri\.encodeComponent\(tenantId\)/);
  assert.match(artifacts.get('generated/dart/contracts.dart'), /jsonEncode\(body\.toJson\(\)\)/);
  assert.match(artifacts.get('generated/dart/contracts.dart'), /'Idempotency-Key': idempotencyKey/);
  assert.match(artifacts.get('generated/dart/contracts.dart'), /if \(parentId != null\) 'parentId': parentId/);

  const dart = artifacts.get('generated/dart/contracts.dart');
  for (const operationId of ['getSchemaVersion', 'getLiveness', 'getReadiness', 'getMetrics']) {
    const start = dart.indexOf(` ${operationId}({String? xCorrelationId}) async {`);
    assert.notEqual(start, -1, `${operationId} keeps an optional correlation argument`);
    const end = dart.indexOf('\n  Future<', start + 1);
    const method = dart.slice(start, end === -1 ? undefined : end);
    assert.match(method, /if \(headers\.isEmpty\) \{\s+json = await transport\(/, `${operationId} falls back to legacy transport`);
    assert.match(method, /else \{\s+final send = requestTransport;/, `${operationId} uses requestTransport for supplied headers`);
    assert.match(method, /headers: headers, body: null/, `${operationId} sends the optional header in the enriched request`);
  }
});

test('generated TypeScript client serializes body, path, query, and header inputs at runtime', async () => {
  const contracts = await loadAndValidateContracts();
  const withQueryOperation = {
    ...contracts,
    openapi: {
      ...contracts.openapi,
      operations: [
        ...contracts.openapi.operations,
        {
          method: 'GET',
          operationId: 'searchHierarchy',
          path: '/org/tenants/{tenantId}/search',
          responseSchemaName: 'HierarchyResponse',
          inputs: {
            path: [{ name: 'tenantId', required: true, type: 'string' }],
            query: [{ name: 'page size', required: false, type: 'integer' }],
            header: [{ name: 'X-Trace-Id', required: true, type: 'string' }],
          },
        },
      ],
    },
  };
  const source = renderGeneratedArtifacts(withQueryOperation).get('src/generated/contracts.ts');
  const dartSource = renderGeneratedArtifacts(withQueryOperation).get('generated/dart/contracts.dart');
  assert.match(dartSource, /Uri\.encodeComponent\(tenantId\)/);
  assert.match(dartSource, /queryParameters: <String, String>\{if \(pageSize != null\) 'page size': pageSize!\.toString\(\)\}/);
  assert.match(dartSource, /'X-Trace-Id': xTraceId/);
  const compiled = typescript.transpileModule(source, {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.ESNext },
  }).outputText;
  const { AgroPlatformApiClient } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const calls = [];
  const client = new AgroPlatformApiClient({
    baseUrl: 'https://example.test/api/',
    transport: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ tenantId: 'tenant' }) };
    },
  });

  await client.createOrgTenant('Bearer test-token', 'idem-1', { code: 'TEN', name: 'Tenant', timezone: 'UTC' });
  await client.getOrgHierarchy('tenant / A', 'Bearer test-token');
  await client.searchHierarchy('tenant / A', 'trace-1', 25);
  await client.getSchemaVersion();
  await client.getLiveness();
  await client.getReadiness();
  await client.getMetrics();
  await client.getSchemaVersion('compat-correlation');

  assert.equal(calls[0].url, 'https://example.test/api/org/tenants');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-token');
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'idem-1');
  assert.deepEqual(JSON.parse(calls[0].init.body), { code: 'TEN', name: 'Tenant', timezone: 'UTC' });
  assert.equal(calls[1].url, 'https://example.test/api/org/tenants/tenant%20%2F%20A/hierarchy');
  assert.equal(calls[2].url, 'https://example.test/api/org/tenants/tenant%20%2F%20A/search?page+size=25');
  assert.equal(calls[2].init.headers['X-Trace-Id'], 'trace-1');
  assert.deepEqual(calls.slice(3, 7).map(({ init }) => init), [
    { method: 'GET' }, { method: 'GET' }, { method: 'GET' }, { method: 'GET' },
  ]);
  assert.deepEqual(calls[7], {
    url: 'https://example.test/api/system/schema-version',
    init: { method: 'GET', headers: { 'X-Correlation-Id': 'compat-correlation' } },
  });
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
    assert.doesNotMatch(generated, /\/(?:identity|permissions?|audit|gis|fleet|warehouse|production)(?:\/|['`])/i);
    assert.doesNotMatch(generated, /(?:auth|identity|permissions?|audit|gis|fleet|warehouse)\.(?:created|updated|deleted)/i);
  }
});
