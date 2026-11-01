import { fingerprint } from '../../../../../packages/connectors/src/index.cjs';
import { PROVIDER_CONTRACT, ProviderError } from './providers.contracts.v1';
import type { EvaluatedSnapshot, Freshness, ProviderDescriptor, ProviderQuery, Snapshot } from './providers.contracts.v1';

type ObjectValue = Record<string, unknown>;
const object = (v: unknown): v is ObjectValue => v !== null && typeof v === 'object' && !Array.isArray(v);
export const identifier = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 500;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const instant = (v: unknown): v is string => typeof v === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v) && Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 19) === v.slice(0, 19);
const nullableTime = (v: unknown) => v === null || instant(v);
const percent = (v: unknown) => finite(v) && v >= 0 && v <= 100;
function exact(v: ObjectValue, required: string[], optional: string[] = []): boolean {
  return required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => required.includes(k) || optional.includes(k));
}
function point(v: unknown): boolean {
  return Array.isArray(v) && v.length === 2 && finite(v[0]) && finite(v[1]) && Math.abs(v[0]) <= 180 && Math.abs(v[1]) <= 90;
}
function fail(): never { throw new ProviderError('INVALID_RESPONSE'); }
export function immutable<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
export function validateDescriptor(v: unknown): asserts v is ProviderDescriptor {
  if (!object(v)) throw new ProviderError('INVALID_REQUEST');
  if (v.contractVersion !== PROVIDER_CONTRACT) throw new ProviderError('VERSION_UNSUPPORTED');
  if (!exact(v, ['kind', 'provider', 'apiVersion', 'contractVersion', 'access', 'licenseRef']) ||
      !['weather', 'satellite', 'cadastre'].includes(String(v.kind)) || !identifier(v.provider) || !identifier(v.apiVersion) ||
      !identifier(v.licenseRef) || !['API_CONFIRMED', 'LICENSED_API', 'PORTAL_ONLY', 'FILE_IMPORT', 'DISCOVERY_REQUIRED'].includes(String(v.access))) {
    throw new ProviderError('INVALID_REQUEST');
  }
}
export function validateQuery(v: unknown): asserts v is ProviderQuery {
  let valid = false;
  if (object(v)) {
    if (v.kind === 'cadastre') valid = exact(v, ['kind', 'cadastralNumber']) && identifier(v.cadastralNumber);
    if (v.kind === 'weather') valid = exact(v, ['kind', 'mode', 'point', 'from', 'to']) &&
      ['FORECAST', 'HISTORY'].includes(String(v.mode)) && point(v.point);
    if (v.kind === 'satellite') {
      const b = v.bbox;
      valid = exact(v, ['kind', 'bbox', 'from', 'to', 'maxCloudPercent']) && Array.isArray(b) && b.length === 4 &&
        point(b.slice(0, 2)) && point(b.slice(2)) && b[0] < b[2] && b[1] < b[3] && percent(v.maxCloudPercent);
    }
    if (v.kind === 'weather' || v.kind === 'satellite') valid = valid && instant(v.from) && instant(v.to) && Date.parse(v.from) <= Date.parse(v.to);
  }
  if (!valid) throw new ProviderError('INVALID_REQUEST');
}
function validateSnapshot(v: unknown, d: ProviderDescriptor): asserts v is Snapshot {
  if (!object(v)) fail();
  if (v.contractVersion !== PROVIDER_CONTRACT) throw new ProviderError('VERSION_UNSUPPORTED');
  if (!exact(v, ['contractVersion', 'kind', 'provider', 'apiVersion', 'externalId', 'sourceVersion', 'sourceHash', 'capturedAt', 'processedAt', 'retrievedAt', 'data']) ||
      v.kind !== d.kind || v.provider !== d.provider || v.apiVersion !== d.apiVersion || !identifier(v.externalId) ||
      !identifier(v.sourceVersion) || typeof v.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(v.sourceHash) ||
      !nullableTime(v.capturedAt) || !nullableTime(v.processedAt) || !instant(v.retrievedAt) || !object(v.data)) fail();
  // Unknown capture/processing is honest metadata, not a fabricated date. Future capture is invalid;
  // processing may predate a forecast's target period, but never retrieval.
  if ((v.capturedAt !== null && Date.parse(v.capturedAt as string) > Date.parse(v.retrievedAt)) ||
      (v.processedAt !== null && Date.parse(v.processedAt as string) > Date.parse(v.retrievedAt)) ||
      (v.capturedAt !== null && v.processedAt !== null && Date.parse(v.processedAt as string) < Date.parse(v.capturedAt as string))) fail();
  const data = v.data;
  if (v.kind === 'weather') {
    if (v.capturedAt === null || !exact(data, ['mode', 'model', 'runAt', 'spatialMethod', 'resolution', 'point', 'variables']) ||
        !['FORECAST', 'HISTORY'].includes(String(data.mode)) || !identifier(data.model) || !instant(data.runAt) ||
        Date.parse(data.runAt) > Date.parse(v.retrievedAt) || !identifier(data.spatialMethod) || !identifier(data.resolution) ||
        !point(data.point) || !Array.isArray(data.variables) || !data.variables.length || data.variables.length > 10000) fail();
    for (const value of data.variables) {
      if (!object(value) || !exact(value, ['name', 'unit', 'at', 'value']) || !identifier(value.name) || !identifier(value.unit) ||
          !instant(value.at) || !(value.value === null || finite(value.value))) fail();
    }
  } else if (v.kind === 'satellite') {
    if (v.capturedAt === null || !exact(data, ['collection', 'cloudPercent', 'footprintRef', 'assets', 'quality', 'processingVersion']) ||
        !identifier(data.collection) || !(data.cloudPercent === null || percent(data.cloudPercent)) || !identifier(data.footprintRef) ||
        !identifier(data.quality) || !(data.processingVersion === null || identifier(data.processingVersion)) ||
        !Array.isArray(data.assets) || !data.assets.length || data.assets.length > 100) fail();
    for (const asset of data.assets) if (!object(asset) || !exact(asset, ['band', 'ref']) || !identifier(asset.band) || !identifier(asset.ref)) fail();
  } else {
    if (!exact(data, ['cadastralNumber', 'geometryStatus', 'geometryRef', 'sourceCrs', 'attributes']) || !identifier(data.cadastralNumber) ||
        !['AVAILABLE', 'UNKNOWN', 'PENDING'].includes(String(data.geometryStatus)) || !object(data.attributes) ||
        !exact(data.attributes, [], ['areaM2', 'category', 'use'])) fail();
    if (data.geometryStatus === 'AVAILABLE' ? !identifier(data.geometryRef) || !identifier(data.sourceCrs) : data.geometryRef !== null || data.sourceCrs !== null) fail();
    const a = data.attributes;
    if ((a.areaM2 !== undefined && (!finite(a.areaM2) || a.areaM2 < 0)) ||
        (a.category !== undefined && !identifier(a.category)) || (a.use !== undefined && !identifier(a.use))) fail();
  }
}
/** Retrieval does not make old evidence fresh. No opaque revision/version comparison. */
export function freshness(s: Snapshot, now: string, maxAgeMs: number): Freshness {
  if (!instant(now) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 0) throw new ProviderError('INVALID_REQUEST');
  const referenceAt = s.kind === 'weather' ? s.data.runAt : s.capturedAt;
  const ageMs = referenceAt === null ? null : Date.parse(now) - Date.parse(referenceAt);
  return immutable({state: ageMs === null || ageMs < 0 ? 'UNKNOWN' : ageMs <= maxAgeMs ? 'FRESH' : 'STALE',
    referenceAt, ageMs, evaluatedAt: now, maxAgeMs});
}
function identity(s: Snapshot): string {
  return JSON.stringify([s.externalId, s.sourceVersion, s.capturedAt, s.processedAt,
    s.kind === 'weather' ? [s.data.mode, s.data.model, s.data.runAt, s.data.spatialMethod, s.data.point, s.data.resolution] :
      s.kind === 'satellite' ? [s.data.collection, s.data.processingVersion] : s.data.cadastralNumber]);
}
export function validateBatch(input: unknown, descriptor: ProviderDescriptor, now: string, maxAgeMs: number): readonly EvaluatedSnapshot[] {
  validateDescriptor(descriptor);
  if (!instant(now) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 0) throw new ProviderError('INVALID_REQUEST');
  if (!Array.isArray(input) || input.length > 1000) fail();
  // Validate before JSON can coerce non-finite numbers to null or strip undefined fields.
  for (const value of input) validateSnapshot(value, descriptor);
  // JSON-only, bounded detached staging before returning any normalized evidence.
  let encoded: string;
  try { encoded = JSON.stringify(input); } catch { return fail(); }
  if (Buffer.byteLength(encoded) > 1048576) fail();
  const staged: unknown[] = JSON.parse(encoded);
  const unique = new Map<string, { snapshot: Snapshot; hash: string }>();
  for (const value of staged) {
    validateSnapshot(value, descriptor);
    const key = identity(value);
    // Retrieval is observation metadata; repeated retrieval of identical evidence is a duplicate.
    const hash = fingerprint({...value, retrievedAt: null});
    const previous = unique.get(key);
    if (previous && previous.hash !== hash) throw new ProviderError('DUPLICATE_CONFLICT');
    if (!previous || Date.parse(value.retrievedAt) < Date.parse(previous.snapshot.retrievedAt)) unique.set(key, {snapshot: value, hash});
  }
  const ordered = [...unique.values()].map(v => v.snapshot).sort((a, b) => {
    const time = (s: Snapshot) => Date.parse((s.kind === 'weather' ? s.data.runAt : s.capturedAt) ?? '') || 0;
    const delta = time(b) - time(a) || (Date.parse(b.processedAt ?? '') || 0) - (Date.parse(a.processedAt ?? '') || 0);
    return delta || (identity(a) < identity(b) ? -1 : identity(a) > identity(b) ? 1 : 0);
  });
  return immutable(ordered.map(snapshot => ({snapshot, freshness: freshness(snapshot, now, maxAgeMs)})));
}

/** A valid record for a different parcel/query must never be presented as this result. */
export function matchesQuery(s: Snapshot, query: ProviderQuery): boolean {
  if (s.kind !== query.kind) return false;
  if (s.kind === 'cadastre' && query.kind === 'cadastre') return s.data.cadastralNumber === query.cadastralNumber;
  if (s.kind === 'weather' && query.kind === 'weather') return s.data.mode === query.mode &&
    s.data.point.every((v, i) => v === query.point[i]) && s.data.variables.every(v => Date.parse(v.at) >= Date.parse(query.from) && Date.parse(v.at) <= Date.parse(query.to));
  if (s.kind === 'satellite' && query.kind === 'satellite') return s.capturedAt !== null &&
    Date.parse(s.capturedAt) >= Date.parse(query.from) && Date.parse(s.capturedAt) <= Date.parse(query.to) &&
    (s.data.cloudPercent === null || s.data.cloudPercent <= query.maxCloudPercent);
  return false;
}
