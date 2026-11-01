export type MasterKind = 'Material' | 'UnitOfMeasure';
export interface MasterActor { tenantId: string; subjectId: string; }
export const MASTER_ACTIONS = new Set(['master-data.read','master-data.write','master-data.correct','master-data.external']);
export type MasterPolicy = (actor: Readonly<MasterActor>, action: string) => Promise<boolean>;
export interface FieldSource {
  master: 'PLATFORM' | 'EXTERNAL_SYSTEM';
  source?: string;
  profileId?: string;
  profileVersion?: number;
}
/** Trusted server composition, never a client-supplied grant or import profile. */
export interface MasterSourcePolicy {
  tenantId: string;
  version: number;
  dataOwnerId: string;
  stewardId: string;
  fields: Record<string, FieldSource>;
}
export interface MasterContext { idempotencyKey: string; correlationId: string; causationId: string; }
export interface UnitInput { code: string; name: string; dimension: string; precision: number; }
export interface MaterialInput { code: string; name: string; itemType: string; baseUom: string; organizationId?: string | null; active?: boolean; }
export interface MasterCorrection { expectedVersion: string; reason: string; patch: Record<string, unknown>; }
