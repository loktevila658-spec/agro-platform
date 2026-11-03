export const LAND_ACTIONS = new Set(['land.read', 'land.create', 'land.correct']);
export interface LandActor { tenantId: string; subjectId: string; }
export interface LandContext { idempotencyKey: string; correlationId: string; causationId: string; }
export type LandPolicy = (actor: Readonly<LandActor>, action: string) => Promise<boolean>;
/** Documentary evidence only. Source does not establish legal title. */
export interface LandSource { source: string; profile: string; profileVersion: string; capturedAt: string; sourceHash: string; }
export interface RightMetadata { rightType: 'OWNERSHIP' | 'LEASE'; validFrom?: string; validTo?: string; source: LandSource; }
export interface LandSnapshot {
 source: LandSource;
 cadastralNumber?: string;
 declaredAreaHa?: string;
 geometryVersionId?: string;
 attributes: Record<string, unknown>;
 rights: RightMetadata[];
}
export interface LandCreate { organizationId?: string; snapshot: LandSnapshot; reason: string; }
export interface LandCorrection { expectedVersion: string; snapshot: LandSnapshot; reason: string; }
export interface LandResult { landPlotId: string; snapshotId: string; version: string; }
