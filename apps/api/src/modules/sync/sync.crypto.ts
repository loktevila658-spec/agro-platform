import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Cursor } from './sync.types';
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function encodeCursor(cursor: Cursor, key: string): string {
  const body = Buffer.from(JSON.stringify(cursor)).toString('base64url');
  return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`;
}
export function decodeCursor(token: string, key: string, now = Date.now()): Cursor {
  try {
    if (typeof token !== 'string' || token.length > 4096) throw Error();
    const [body, signature, extra] = token.split('.');
    const expected = createHmac('sha256', key).update(body!).digest();
    const actual = Buffer.from(signature!, 'base64url');
    if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw Error();
    const value = JSON.parse(Buffer.from(body!, 'base64url').toString()) as Cursor;
    if (!value.tenantId || !value.userId || !value.deviceId || !Number.isSafeInteger(value.scopeVersion) || value.schemaVersion !== 1 || !/^\d+$/.test(value.seq) || !Number.isSafeInteger(value.issuedAt) || value.issuedAt > now + 60000) throw Error();
    if (now - value.issuedAt > 90 * 86400000) throw Error('CURSOR_EXPIRED');
    return value;
  } catch (error) { throw Error(error instanceof Error && error.message === 'CURSOR_EXPIRED' ? 'CURSOR_EXPIRED' : 'RESET_REQUIRED'); }
}
