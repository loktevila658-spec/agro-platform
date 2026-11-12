import {TAG_ACTIONS} from '../dist/modules/identity-tags/identity-tags.types.js';
import {OFFLINE_GIS_ACTIONS} from '../dist/modules/offline-gis/offline-gis.types.js';
import { TASK_ACTIONS } from '../dist/modules/tasks/tasks.types.js';
import { FARM_ACTIONS } from '../dist/modules/farm/farm.types.js';
import { LAND_ACTIONS } from '../dist/modules/land/land.types.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { before } from 'node:test';

import { GIS_ACTIONS } from '../dist/modules/gis/gis.types.js';
import { MASTER_ACTIONS } from '../dist/modules/master-data/master-data.types.js';
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
  const [allPermissions, orgSource] = await Promise.all([
    loadCatalogPermissions(),
    readFile(resolve(repositoryRoot, 'apps/api/src/modules/org/org.service.ts'), 'utf8'),
  ]);
  const catalog = allPermissions.filter(({action})=>action.startsWith('org.'));
  assert.deepEqual([...MASTER_ACTIONS].sort(),allPermissions.filter(({action})=>action.startsWith('master-data.')).map(({action})=>action).sort());
  assert.deepEqual([...GIS_ACTIONS].sort(),allPermissions.filter(({action})=>action.startsWith('gis.')).map(({action})=>action).sort());
  assert.deepEqual([...FARM_ACTIONS].sort(),allPermissions.filter(({action})=>FARM_ACTIONS.has(action)).map(({action})=>action).sort());
  assert.deepEqual([...LAND_ACTIONS].sort(),allPermissions.filter(({action})=>action.startsWith('land.')).map(({action})=>action).sort());
  assert.deepEqual([...TASK_ACTIONS].sort(),allPermissions.filter(({action})=>action.startsWith('task.')).map(({action})=>action).sort());
  assert.deepEqual([...TAG_ACTIONS].sort(),allPermissions.filter(({action})=>action.startsWith('identity-tags.')).map(({action})=>action).sort());
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
  assert.deepEqual(catalog.map(({action,effect,scope})=>({action,effect,scope})), [
    {action:'org.hierarchy.read',effect:'allow',scope:'tenant'},
    {action:'org.tenant.create',effect:'allow',scope:'global'},
    {action:'org.organization.create',effect:'allow',scope:'tenant'},
    {action:'org.organization_unit.create',effect:'allow',scope:'tenant'},
    {action:'org.site.create',effect:'allow',scope:'tenant'},
    {action:'master-data.read',effect:'allow',scope:'tenant'},
    {action:'master-data.write',effect:'allow',scope:'tenant'},
    {action:'master-data.correct',effect:'allow',scope:'tenant'},
    {action:'master-data.external',effect:'allow',scope:'tenant'},
    {action:'gis.read',effect:'allow',scope:'tenant'},
    {action:'gis.propose',effect:'allow',scope:'tenant'},
    {action:'gis.approve',effect:'allow',scope:'tenant'},
    {action:'gis.reject',effect:'allow',scope:'tenant'},
    {action:'gis.import',effect:'allow',scope:'tenant'},
    {action:'field.read',effect:'allow',scope:'tenant'},
    {action:'field.create',effect:'allow',scope:'tenant'},
    {action:'field.correct',effect:'allow',scope:'tenant'},
    {action:'field.split',effect:'allow',scope:'tenant'},
    {action:'field.merge',effect:'allow',scope:'tenant'},
    {action:'season.create',effect:'allow',scope:'tenant'},
    {action:'season.correct',effect:'allow',scope:'tenant'},
    {action:'field-season.create',effect:'allow',scope:'tenant'},
    {action:'field-season.correct',effect:'allow',scope:'tenant'},
    {action:'land.read',effect:'allow',scope:'tenant'},
    {action:'land.create',effect:'allow',scope:'tenant'},
    {action:'land.correct',effect:'allow',scope:'tenant'},
    {action:'task.read',effect:'allow',scope:'tenant'},
    {action:'task.create',effect:'allow',scope:'tenant'},
    {action:'task.plan',effect:'allow',scope:'tenant'},
    {action:'task.assign',effect:'allow',scope:'tenant'},
    {action:'task.accept',effect:'allow',scope:'tenant'},
    {action:'task.start',effect:'allow',scope:'tenant'},
    {action:'task.pause',effect:'allow',scope:'tenant'},
    {action:'task.resume',effect:'allow',scope:'tenant'},
    {action:'task.complete',effect:'allow',scope:'tenant'},
    {action:'task.verify',effect:'allow',scope:'tenant'},
    {action:'task.close',effect:'allow',scope:'tenant'},
    {action:'task.return',effect:'allow',scope:'tenant'},
    {action:'task.cancel',effect:'allow',scope:'tenant'},
    {action:'task.abort',effect:'allow',scope:'tenant'},
    {action:'offline-gis.package.read',effect:'allow',scope:'tenant'},
    {action:'offline-gis.package.select',effect:'allow',scope:'tenant'},
    {action:'offline-gis.package.refresh',effect:'allow',scope:'tenant'},
    {action:'identity-tags.resolve',effect:'allow',scope:'tenant'},
    {action:'identity-tags.issue',effect:'allow',scope:'tenant'},


  ]);

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

test("GIS delivery actions remain explicit/default deny",()=>{for(const action of OFFLINE_GIS_ACTIONS)assert.ok(catalogActions.has(action));});
