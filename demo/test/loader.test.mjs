import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  applyProfile,
  buildExecutionPlan,
  loadProfile,
  PersistenceTargetUnavailableError,
  runSeedCli,
  stableResourceId,
  validateProfile,
} from '../src/loader.mjs';

test('MINIMAL is an explicitly versioned six-resource profile', async () => {
  const profile = await loadProfile('MINIMAL');
  assert.equal(profile.profile, 'MINIMAL');
  assert.equal(profile.version, 1);
  assert.equal(profile.datasetVersion, '1.0.0');
  assert.deepEqual(profile.resources.map(({ type }) => type), [
    'enterprise', 'site', 'field', 'machine', 'warehouse', 'productionLine',
  ]);
});

test('normalized execution plan and stable identifiers are deterministic', async () => {
  const profile = await loadProfile('MINIMAL');
  const first = buildExecutionPlan(profile);
  const second = buildExecutionPlan(JSON.parse(JSON.stringify(profile)));
  const reordered = buildExecutionPlan({ ...profile, resources: [...profile.resources].reverse() });
  assert.deepEqual(first, second);
  assert.deepEqual(first, reordered);
  assert.deepEqual(first.map(({ id }) => id), [
    'b729c712-f21a-861e-972f-cece566bb6b1',
    'b2ab8ff2-534c-89c9-b6f8-d1a20e63c039',
    'd4be9344-1e5e-8a6f-9bce-cbc9c8361579',
    'a2cfeb7a-22d6-843a-ab22-8ecdd4b6cdb2',
    '54ed4087-ef40-8330-a9b1-17f3e3d89fde',
    '45dc6bce-d44a-8b41-829f-2e1ef09f6ce8',
  ]);
  assert.equal(stableResourceId('MINIMAL', '1.0.0', 'enterprise', 'AGRO-DEMO-01'), first[0].id);
});

test('test adapter upserts make repeated application idempotent', async () => {
  const profile = await loadProfile('MINIMAL');
  const rows = new Map();
  const target = {
    async upsert(resource) {
      rows.set(resource.id, resource);
    },
  };

  const first = await applyProfile(profile, target);
  const firstSnapshot = JSON.stringify([...rows.entries()]);
  const second = await applyProfile(profile, target);
  assert.equal(rows.size, 6);
  assert.equal(JSON.stringify([...rows.entries()]), firstSnapshot);
  assert.deepEqual(second, first);
});

test('loader contains no runtime randomness or clock-derived fixture generation', async () => {
  const source = await readFile(new URL('../src/loader.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random|Date\.now|randomUUID|randomBytes/);
});

test('unknown and structurally invalid profiles fail deterministically', async () => {
  await assert.rejects(loadProfile('DEMO'), /unknown profile: DEMO/);
  const profile = await loadProfile('MINIMAL');
  assert.throws(() => validateProfile({ ...profile, injected: true }, 'MINIMAL'), /unknown field/);
  assert.throws(() => validateProfile({ ...profile, resources: [profile.resources[0], profile.resources[0]] }, 'MINIMAL'), /exactly 6 entries/);
  assert.throws(() => validateProfile({
    ...profile,
    resources: [profile.resources[0], { ...profile.resources[0], key: 'AGRO-DEMO-02' }, ...profile.resources.slice(2)],
  }, 'MINIMAL'), /duplicate resource type/);
});

test('missing adapter and failed upserts never report successful application', async () => {
  const profile = await loadProfile('MINIMAL');
  await assert.rejects(applyProfile(profile), PersistenceTargetUnavailableError);
  let writes = 0;
  await assert.rejects(applyProfile(profile, {
    async upsert() {
      writes += 1;
      throw new Error('target rejected resource');
    },
  }), /target rejected resource/);
  assert.equal(writes, 1);

  let stderr = '';
  const code = await runSeedCli([], { stderr: { write: (chunk) => { stderr += chunk; } } });
  assert.equal(code, 3);
  assert.match(stderr, /no persistence adapter is configured, no data was seeded/);
});

test('fixture profile JSON validates without hidden runtime dependencies', async () => {
  const profile = JSON.parse(await readFile(new URL('../profiles/minimal.json', import.meta.url), 'utf8'));
  assert.equal(validateProfile(profile, 'MINIMAL'), profile);
});
