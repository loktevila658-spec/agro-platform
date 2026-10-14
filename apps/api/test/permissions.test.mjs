import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { before } from 'node:test';

import { PermissionEngine } from '../dist/modules/permissions/permission-engine.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const tenantId = '6b7a5a80-01c9-4f88-9cc0-2c21d2eab1a7';
const outsideTenantId = '8b7a5a80-01c9-4f88-9cc0-2c21d2eab1a7';
const engine = new PermissionEngine();
let catalogActions = new Set();

before(async () => {
  catalogActions = new Set((await loadCatalogPermissions()).map(({ action }) => action));
});

async function loadCatalogPermissions() {
  const source = await readFile(resolve(repositoryRoot, 'permissions/catalog.yaml'), 'utf8');
  assert.match(source, /^status: BOOTSTRAP$/m);
  assert.match(source, /^deny_by_default: true$/m);
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line === 'permissions:');
  assert.notEqual(start, -1, 'catalog must declare its permissions');

  const permissions = [];
  let current;
  for (const line of lines.slice(start + 1)) {
    if (line.length > 0 && !line.startsWith(' ')) break;
    const action = line.match(/^  - action: ([A-Za-z0-9._-]+)$/);
    if (action) {
      if (current) permissions.push(current);
      current = { action: action[1] };
      continue;
    }
    const property = line.match(/^    (effect|scope): (allow|global|tenant)$/);
    if (property && current) current[property[1]] = property[2];
    else if (line.trim() !== '' && !/^    description: /.test(line)) throw new Error(`Unsupported permission catalog entry: ${line}`);
  }
  if (current) permissions.push(current);
  if (permissions.some(({ effect, scope }) => effect !== 'allow' || !['global', 'tenant'].includes(scope))) {
    throw new Error('Permission catalog contains an unsupported effect or scope');
  }
  if (new Set(permissions.map(({ action }) => action)).size !== permissions.length) throw new Error('Permission catalog contains duplicate action keys');
  return permissions;
}

test('OrgService action registry stays synchronized with the canonical permission catalog', async () => {
  const [catalog, orgSource] = await Promise.all([
    loadCatalogPermissions(),
    readFile(resolve(repositoryRoot, 'apps/api/src/modules/org/org.service.ts'), 'utf8'),
  ]);
  const actionSet = orgSource.match(/const ACTIONS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(actionSet, 'OrgService must keep an explicit action allowlist');
  const actions = [...actionSet[1].matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
  assert.deepEqual(actions, catalog.map(({ action }) => action).sort());

  const scopedCalls = [...orgSource.matchAll(/this\.authorize\(context,\s*'([^']+)'\s*,\s*\{\s*kind:\s*'(global|tenant)'(?:\s*,\s*tenantId:\s*([^}]+))?\s*\}\s*\)/g)]
    .map(([, action, scope, tenantInput]) => ({ action, scope, tenantInput: tenantInput?.trim() ?? null }))
    .sort((left, right) => left.action.localeCompare(right.action));
  const catalogScopes = catalog.map(({ action, scope }) => ({
    action,
    scope,
    tenantInput: scope === 'tenant'
      ? (action === 'org.hierarchy.read' ? 'tenantIdInput' : 'commandInput?.tenantId')
      : null,
  })).sort((left, right) => left.action.localeCompare(right.action));
  assert.deepEqual(scopedCalls, catalogScopes, 'operation scope inputs must match the canonical catalog');
});

test('allows configured catalog actions at their declared global or tenant scope', async () => {
  const catalog = await loadCatalogPermissions();
  assert.equal(catalog.length, 5);

  for (const permission of catalog) {
    const check = {
      action: permission.action,
      registeredActions: catalogActions,
      configuredActions: [permission.action],
      scope: permission.scope === 'global' ? { kind: 'global' } : { kind: 'tenant', tenantId },
      configuredTenantScopes: [tenantId],
    };
    assert.equal(engine.isAllowed(check), true, `${permission.action} should be allowed at its catalog scope`);
    assert.equal(engine.isAllowed({ ...check, configuredActions: [] }), false, `${permission.action} should be denied without a configured grant`);
  }
});

test('denies by default for absent, unknown, and wildcard actions', () => {
  assert.equal(engine.isAllowed({ action: 'org.site.create', registeredActions: catalogActions, configuredActions: [], configuredTenantScopes: [] }), false);
  assert.equal(engine.isAllowed({ action: 'org.unknown.action', registeredActions: catalogActions, configuredActions: ['org.unknown.action'], configuredTenantScopes: [] }), false);
  assert.equal(engine.isAllowed({ action: 'org.site.create', registeredActions: catalogActions, configuredActions: ['*'], scope: { kind: 'tenant', tenantId }, configuredTenantScopes: [tenantId] }), false);
});

test('requires a configured tenant scope for tenant-scoped requests', () => {
  const check = { action: 'org.site.create', registeredActions: catalogActions, configuredActions: ['org.site.create'], configuredTenantScopes: [tenantId] };
  assert.equal(engine.isAllowed({ ...check, scope: { kind: 'tenant', tenantId } }), true);
  assert.equal(engine.isAllowed({ ...check, scope: { kind: 'tenant', tenantId: outsideTenantId } }), false);
  assert.equal(engine.isAllowed({ ...check, scope: { kind: 'tenant', tenantId: '' } }), false);
  assert.equal(engine.isAllowed({ ...check, scope: { kind: 'tenant', tenantId: 42 } }), false);
  assert.equal(engine.isAllowed({ ...check, scope: undefined }), false);
});

test('read-only permission does not authorize a create action', () => {
  assert.equal(engine.isAllowed({
    action: 'org.site.create',
    registeredActions: catalogActions,
    configuredActions: ['org.hierarchy.read'],
    scope: { kind: 'tenant', tenantId },
    configuredTenantScopes: [tenantId],
  }), false);
});
