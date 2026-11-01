/** Internal normalized evidence contract. No vendor wire schema or canonical mutation. */
export const PROVIDER_CONTRACT = 'external-provider/1' as const;
export type ProviderKind = 'weather' | 'satellite' | 'cadastre';
export type ProviderAccess = 'API_CONFIRMED' | 'LICENSED_API' | 'PORTAL_ONLY' | 'FILE_IMPORT' | 'DISCOVERY_REQUIRED';
export interface ProviderDescriptor {
  kind: ProviderKind;
  provider: string;
  apiVersion: string;
  contractVersion: typeof PROVIDER_CONTRACT;
  access: ProviderAccess;
  licenseRef: string;
}
export interface WeatherQuery {
  kind: 'weather'; mode: 'FORECAST' | 'HISTORY'; point: [number, number]; from: string; to: string;
}
export interface SatelliteQuery {
  kind: 'satellite'; bbox: [number, number, number, number]; from: string; to: string; maxCloudPercent: number;
}
export interface CadastreQuery { kind: 'cadastre'; cadastralNumber: string; }
export interface Queries { weather: WeatherQuery; satellite: SatelliteQuery; cadastre: CadastreQuery; }
export type ProviderQuery = Queries[ProviderKind];
export interface WeatherData {
  mode: 'FORECAST' | 'HISTORY'; model: string; runAt: string; spatialMethod: string; resolution: string;
  point: [number, number];
  /** Adapter supplies normalized names and explicit units; missing readings stay null, never zero. */
  variables: { name: string; unit: string; at: string; value: number | null }[];
}
export interface SatelliteData {
  collection: string; cloudPercent: number | null; footprintRef: string;
  assets: { band: string; ref: string }[]; quality: string; processingVersion: string | null;
}
export interface CadastreData {
  cadastralNumber: string; geometryStatus: 'AVAILABLE' | 'UNKNOWN' | 'PENDING';
  geometryRef: string | null; sourceCrs: string | null;
  attributes: { areaM2?: number; category?: string; use?: string };
}
export interface ProviderData { weather: WeatherData; satellite: SatelliteData; cadastre: CadastreData; }
export interface ProviderSnapshot<K extends ProviderKind = ProviderKind> {
  contractVersion: typeof PROVIDER_CONTRACT; kind: K; provider: string; apiVersion: string;
  /** IDs/versions are external references, never platform primary keys or sortable versions. */
  externalId: string; sourceVersion: string; sourceHash: string;
  capturedAt: string | null; processedAt: string | null; retrievedAt: string;
  data: ProviderData[K];
}
export type Snapshot = { [K in ProviderKind]: ProviderSnapshot<K> }[ProviderKind];
export interface ProviderReadContext {
  tenantId: string; profileId: string; correlationId: string; signal: AbortSignal;
}
export interface ProviderPort<K extends ProviderKind> {
  read(query: Readonly<Queries[K]>, context: Readonly<ProviderReadContext>): Promise<ProviderSnapshot<K>[]>;
}
export type WeatherProvider = ProviderPort<'weather'>;
export type SatelliteProvider = ProviderPort<'satellite'>;
export type CadastralProvider = ProviderPort<'cadastre'>;
export interface Freshness {
  state: 'FRESH' | 'STALE' | 'UNKNOWN'; referenceAt: string | null; ageMs: number | null; evaluatedAt: string; maxAgeMs: number;
}
export type Immutable<T> = T extends object ? { readonly [P in keyof T]: Immutable<T[P]> } : T;
export interface EvaluatedSnapshot { snapshot: Immutable<Snapshot>; freshness: Readonly<Freshness>; }
export type ProviderErrorCode = 'INVALID_REQUEST' | 'INVALID_RESPONSE' | 'VERSION_UNSUPPORTED' | 'DUPLICATE_CONFLICT' |
  'TIMEOUT' | 'TEMPORARY' | 'RATE_LIMIT' | 'AUTH' | 'NOT_FOUND' | 'UNAVAILABLE';
export const PROVIDER_ERRORS: readonly ProviderErrorCode[] = Object.freeze([
  'INVALID_REQUEST', 'INVALID_RESPONSE', 'VERSION_UNSUPPORTED', 'DUPLICATE_CONFLICT',
  'TIMEOUT', 'TEMPORARY', 'RATE_LIMIT', 'AUTH', 'NOT_FOUND', 'UNAVAILABLE',
]);
export class ProviderError extends Error {
  constructor(readonly code: ProviderErrorCode, readonly retryAfterMs?: number) {
    super(code); this.name = 'ProviderError';
  }
}
export interface ReadOptions { correlationId: string; timeoutMs: number; maxAgeMs: number; now: string; }
export interface ProviderResult {
  status: 'AVAILABLE' | 'MISSING' | 'ERROR'; profileId: string; correlationId: string;
  records: readonly EvaluatedSnapshot[];
  error?: { code: ProviderErrorCode; retryable: boolean; retryAfterMs?: number };
}
