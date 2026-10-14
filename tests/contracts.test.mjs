import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  parseYamlDocument,
  validateOpenApi,
} from '../packages/contracts/scripts/lib/contracts.mjs';

test('OpenAPI contains the exact bootstrap and WP49-011 operation set', () => {
  const source = readFileSync('openapi/openapi.yaml', 'utf8');
  const { document, operations } = validateOpenApi(source);

  assert.equal(document.openapi, '3.1.0');
  assert.equal(document['x-status'], 'BOOTSTRAP');
  assert.deepEqual(Object.keys(document.paths).sort(), [
    '/health/live',
    '/health/ready',
    '/metrics',
    '/org/organization-units',
    '/org/organizations',
    '/org/sites',
    '/org/tenants',
    '/org/tenants/{tenantId}/hierarchy',
    '/system/schema-version',
    '/v1/auth/login',
    '/v1/auth/logout',
    '/v1/auth/mfa/verify',
    '/v1/auth/refresh',
    '/v1/me/sessions',
    '/v1/me/sessions/{id}/commands/revoke',
  ]);
  assert.deepEqual(operations.map(({ method, operationId, path }) => ({ method, operationId, path })), [
    { method: 'GET', operationId: 'getLiveness', path: '/health/live' },
    { method: 'GET', operationId: 'getReadiness', path: '/health/ready' },
    { method: 'GET', operationId: 'getMetrics', path: '/metrics' },
    { method: 'POST', operationId: 'createOrgOrganizationUnit', path: '/org/organization-units' },
    { method: 'POST', operationId: 'createOrgOrganization', path: '/org/organizations' },
    { method: 'POST', operationId: 'createOrgSite', path: '/org/sites' },
    { method: 'POST', operationId: 'createOrgTenant', path: '/org/tenants' },
    { method: 'GET', operationId: 'getOrgHierarchy', path: '/org/tenants/{tenantId}/hierarchy' },
    { method: 'GET', operationId: 'getSchemaVersion', path: '/system/schema-version' },
    { method: 'POST', operationId: 'login', path: '/v1/auth/login' },
    { method: 'POST', operationId: 'logout', path: '/v1/auth/logout' },
    { method: 'POST', operationId: 'verifyMfa', path: '/v1/auth/mfa/verify' },
    { method: 'POST', operationId: 'refreshSession', path: '/v1/auth/refresh' },
    { method: 'GET', operationId: 'listMySessions', path: '/v1/me/sessions' },
    { method: 'POST', operationId: 'revokeMySession', path: '/v1/me/sessions/{id}/commands/revoke' },
  ]);

  const compatibilityOperations = [
    ['GET', '/system/schema-version', 'getSchemaVersion'],
    ['GET', '/health/live', 'getLiveness'],
    ['GET', '/health/ready', 'getReadiness'],
    ['GET', '/metrics', 'getMetrics'],
  ];
  for (const [method, path, operationId] of compatibilityOperations) {
    const operation = document.paths[path][method.toLowerCase()];
    assert.deepEqual(operation.parameters, [{ $ref: '#/components/parameters/CorrelationId' }]);
    assert.deepEqual(operations.find((item) => item.operationId === operationId).inputs.header, [
      { name: 'X-Correlation-Id', required: false, type: 'string' },
    ]);
  }

  assert.deepEqual(operations.filter(({ path }) => path.startsWith('/v1/auth/') || path.startsWith('/v1/me/')).map(({ operationId }) => operationId), [
    'login', 'logout', 'verifyMfa', 'refreshSession', 'listMySessions', 'revokeMySession',
  ]);
  assert.deepEqual(operations.filter(({ path }) => path.startsWith('/org/')).map(({ operationId }) => operationId), [
    'createOrgOrganizationUnit', 'createOrgOrganization', 'createOrgSite', 'createOrgTenant', 'getOrgHierarchy',
  ]);
});

test('event catalog preserves WP49-011 organization events and appends the DOC19 identity events', () => {
  const source = readFileSync('events/catalog/index.yaml', 'utf8');
  const catalog = parseYamlDocument(source);

  assert.equal(catalog.status, 'BOOTSTRAP');
  assert.deepEqual(catalog.events.map(({ name, version, producer }) => ({ name, version, producer })), [
    { name: 'org.tenant.created', version: '1.0.0', producer: 'org' },
    { name: 'org.organization.created', version: '1.0.0', producer: 'org' },
    { name: 'org.unit.created', version: '1.0.0', producer: 'org' },
    { name: 'org.site.created', version: '1.0.0', producer: 'org' },
    { name: 'security.session_created', version: '1.0.0', producer: 'identity' },
    { name: 'security.session_revoked', version: '1.0.0', producer: 'identity' },
    { name: 'security.mfa_changed', version: '1.0.0', producer: 'identity' },
  ]);
});
