import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { TagIdentity } from './identity-tags.types';
export const TAG_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function strictObject(value: unknown, fields: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length || fields.some(k => !Object.hasOwn(value, k))) throw new BadRequestException('QR_INVALID_PAYLOAD');
}
function identity(type: unknown, id: unknown): TagIdentity {
  if (type !== 'Material') throw new BadRequestException('QR_TYPE_UNSUPPORTED');
  if (typeof id !== 'string' || !TAG_UUID.test(id)) throw new BadRequestException('QR_INVALID_ID');
  return { version: 1, entityType: type, entityId: id };
}
function checksum(id: string): string { return createHash('sha256').update(`v1/Material/${id}`, 'utf8').digest('hex'); }
export function encodePayload(type: unknown, id: unknown): string {
  const ref = identity(type, id);
  return `agro://v1/${ref.entityType}/${ref.entityId}?c=${checksum(ref.entityId)}`;
}
export function decodePayload(value: unknown): TagIdentity {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > 512) throw new BadRequestException('QR_INVALID_PAYLOAD');
  let v: unknown, t: unknown, id: unknown, c: unknown;
  if (value.startsWith('{')) {
    let data: unknown;
    try { data = JSON.parse(value); } catch { throw new BadRequestException('QR_INVALID_PAYLOAD'); }
    strictObject(data, ['v', 't', 'id', 'c']);
    // All four values are scalars; reject duplicate keys instead of JSON last-key-wins.
    if ((value.match(/"(?:v|t|id|c)"\s*:/g) ?? []).length !== 4) throw new BadRequestException('QR_INVALID_PAYLOAD');
    ({v, t, id, c} = data);
  } else {
    const m = /^agro:\/\/v([0-9]+)\/([A-Za-z_]+)\/([0-9a-f-]+)\?c=([0-9a-f]{64})$/.exec(value);
    if (!m) throw new BadRequestException('QR_INVALID_PAYLOAD');
    v = m[1] === '1' ? 1 : 0; t = m[2]; id = m[3]; c = m[4];
  }
  if (v !== 1) throw new BadRequestException('QR_VERSION_UNSUPPORTED');
  const ref = identity(t, id);
  if (typeof c !== 'string' || c !== checksum(ref.entityId)) throw new BadRequestException('QR_CHECKSUM_INVALID');
  return ref;
}
