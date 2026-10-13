import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PROFILE_PATHS = Object.freeze({
  MINIMAL: new URL('../profiles/minimal.json', import.meta.url),
});
const RESOURCE_TYPES = Object.freeze([
  'enterprise',
  'site',
  'field',
  'machine',
  'warehouse',
  'productionLine',
]);
const RESOURCE_TYPE_SET = new Set(RESOURCE_TYPES);
const PROFILE_FIELDS = new Set(['profile', 'version', 'datasetVersion', 'resources']);

export class ProfileError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProfileError';
  }
}

export class PersistenceTargetUnavailableError extends Error {
  constructor() {
    super('no supported demo persistence adapter is configured; no data was seeded');
    this.name = 'PersistenceTargetUnavailableError';
  }
}

export function stableResourceId(profileName, datasetVersion, type, key) {
  const name = `agroplatform:demo:${profileName}:${datasetVersion}:${type}:${key}`;
  const bytes = createHash('sha256').update(name, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function assertRecord(value, label, allowedFields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProfileError(`${label} must be an object`);
  }
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) throw new ProfileError(`${label} has unknown field: ${field}`);
  }
}

export function validateProfile(profile, expectedName) {
  if (!Object.hasOwn(PROFILE_PATHS, expectedName)) {
    throw new ProfileError(`unknown profile: ${expectedName}`);
  }
  assertRecord(profile, 'profile', PROFILE_FIELDS);
  if (profile.profile !== expectedName) {
    throw new ProfileError(`profile name must be ${expectedName}`);
  }
  if (!Number.isSafeInteger(profile.version) || profile.version !== 1) {
    throw new ProfileError('profile version must be 1');
  }
  if (typeof profile.datasetVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(profile.datasetVersion)) {
    throw new ProfileError('datasetVersion must use numeric major.minor.patch format');
  }
  if (!Array.isArray(profile.resources) || profile.resources.length !== RESOURCE_TYPES.length) {
    throw new ProfileError(`MINIMAL resources must contain exactly ${RESOURCE_TYPES.length} entries`);
  }

  const seen = new Set();
  const seenTypes = new Set();
  for (const [index, resource] of profile.resources.entries()) {
    assertRecord(resource, `resources[${index}]`, new Set(['type', 'key']));
    if (!RESOURCE_TYPE_SET.has(resource.type)) {
      throw new ProfileError(`resources[${index}].type is unsupported`);
    }
    if (seenTypes.has(resource.type)) {
      throw new ProfileError(`duplicate resource type: ${resource.type}`);
    }
    if (typeof resource.key !== 'string' || !/^[A-Z0-9][A-Z0-9-]*$/.test(resource.key)) {
      throw new ProfileError(`resources[${index}].key must be a stable uppercase canonical key`);
    }
    const identity = `${resource.type}:${resource.key}`;
    if (seen.has(identity)) throw new ProfileError(`duplicate resource: ${identity}`);
    seen.add(identity);
    seenTypes.add(resource.type);
  }

  return profile;
}

export async function loadProfile(profileName = 'MINIMAL') {
  if (!Object.hasOwn(PROFILE_PATHS, profileName)) {
    throw new ProfileError(`unknown profile: ${profileName}`);
  }
  const profile = JSON.parse(await readFile(PROFILE_PATHS[profileName], 'utf8'));
  return validateProfile(profile, profileName);
}

export function buildExecutionPlan(profile) {
  const validated = validateProfile(profile, profile?.profile);
  const resourcesByType = new Map(validated.resources.map((resource) => [resource.type, resource]));
  return Object.freeze(RESOURCE_TYPES.map((type) => {
    const { key } = resourcesByType.get(type);
    return Object.freeze({
      operation: 'upsert',
      type,
      key,
      id: stableResourceId(validated.profile, validated.datasetVersion, type, key),
    });
  }));
}

export async function applyProfile(profile, target) {
  if (!target || typeof target.upsert !== 'function') {
    throw new PersistenceTargetUnavailableError();
  }

  const plan = buildExecutionPlan(profile);
  for (const operation of plan) {
    await target.upsert(operation);
  }
  return Object.freeze({
    profile: profile.profile,
    datasetVersion: profile.datasetVersion,
    applied: plan.length,
    ids: Object.freeze(plan.map(({ id }) => id)),
  });
}

function parseArguments(args) {
  let profile = 'MINIMAL';
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--profile' && args[index + 1]) {
      profile = args[index + 1];
      index += 1;
    } else {
      throw new ProfileError(`unexpected argument: ${args[index]}`);
    }
  }
  return profile;
}

export async function runSeedCli(args = process.argv.slice(2), { stderr = process.stderr } = {}) {
  try {
    const profileName = parseArguments(args);
    const profile = await loadProfile(profileName);
    const plan = buildExecutionPlan(profile);
    stderr.write(`agro-demo: ${profileName} plan validated (${plan.length} deterministic upserts); no persistence adapter is configured, no data was seeded\n`);
    return 3;
  } catch (error) {
    stderr.write(`agro-demo: ${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runSeedCli();
}
