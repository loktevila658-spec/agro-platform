import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { ReplicaChange, ReplicaMessage, Signed } from './replication.types';
import { ReplicationError } from './replication.types';
export const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(v);
export const sequence = (v: unknown): v is string => typeof v === 'string' && /^[1-9][0-9]{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n;
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype; }
function keys(v: Record<string, unknown>, expected: string[]): boolean { return Object.keys(v).sort().join(',') === expected.sort().join(','); }
/** Strict JSON before serialization: no undefined/nonfinite/date/prototype coercion. */
export function canonical(v: unknown, depth = 0): string {
  if (depth > 24) throw new ReplicationError('INVALID_JSON');
  if (v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(x => canonical(x, depth + 1)).join(',')}]`;
  if (object(v)) return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k], depth + 1)}`).join(',')}}`;
  throw new ReplicationError('INVALID_JSON');
}
export function digest(v: unknown): string { return createHash('sha256').update(canonical(v)).digest('hex'); }
export function validateChange(v: unknown): asserts v is ReplicaChange {
  if (!object(v) || !keys(v, ['version','tenantId','eventId','aggregateType','aggregateId','revision','operation','supersedes','payload','provenance','objectRefs']) ||
    v.version !== 1 || ![v.tenantId,v.eventId,v.aggregateType,v.aggregateId].every(identifier) || !sequence(v.revision) ||
    !['UPSERT','CORRECTION','TOMBSTONE'].includes(v.operation as string) || (v.operation === 'UPSERT' ? v.supersedes !== null : !identifier(v.supersedes)) ||
    !object(v.payload) || (v.operation === 'TOMBSTONE' && Object.keys(v.payload).length !== 0) || !object(v.provenance) ||
    !keys(v.provenance,['owner','sourceEventId','actorId','correlationId','causationId','occurredAt','evidence']) ||
    ![v.provenance.owner,v.provenance.sourceEventId,v.provenance.actorId,v.provenance.correlationId,v.provenance.causationId].every(identifier) ||
    v.provenance.sourceEventId !== v.eventId || typeof v.provenance.occurredAt !== 'string' || !/^\d{4}-.*Z$/.test(v.provenance.occurredAt) || !Number.isFinite(Date.parse(v.provenance.occurredAt)) || !object(v.provenance.evidence) ||
    !Array.isArray(v.objectRefs) || v.objectRefs.length > 100 || v.objectRefs.some(r => !object(r) || !keys(r,['id','sha256']) || !identifier(r.id) || typeof r.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(r.sha256))) throw new ReplicationError('INVALID_CHANGE');
  if (Buffer.byteLength(canonical(v)) > 1024 * 1024) throw new ReplicationError('PAYLOAD_LIMIT');
}
export function validateMessage(v: unknown): asserts v is ReplicaMessage {
  if (!object(v) || !keys(v,['version','tenantId','siteId','installationId','sequence','hash','change']) || v.version !== 1 ||
    ![v.tenantId,v.siteId,v.installationId].every(identifier) || !sequence(v.sequence)) throw new ReplicationError('INVALID_MESSAGE');
  validateChange(v.change);
  if (v.tenantId !== v.change.tenantId || v.hash !== digest(v.change)) throw new ReplicationError('HASH_MISMATCH');
}
export function signBody<T>(purpose: 'message' | 'ack', body: T, key: string): Signed<T> {
  const detached = JSON.parse(canonical(body)) as T;
  return { body: detached, signature: createHmac('sha256',key).update(`replication/1:${purpose}:` + canonical(detached)).digest('hex') };
}
export function verifyBody<T>(purpose: 'message' | 'ack', value: Signed<T>, key: string): T {
  if (!object(value) || !keys(value,['body','signature']) || typeof value.signature !== 'string' || !/^[a-f0-9]{64}$/.test(value.signature) || Buffer.byteLength(canonical(value.body)) > 1100000) throw new ReplicationError('AUTHENTICATION_FAILED');
  const expected = signBody(purpose,value.body,key);
  if (!timingSafeEqual(Buffer.from(expected.signature,'hex'),Buffer.from(value.signature,'hex'))) throw new ReplicationError('AUTHENTICATION_FAILED');
  return expected.body;
}
