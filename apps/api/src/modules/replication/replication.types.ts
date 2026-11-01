/** Server-only owner projection. Not a mobile command or a cloud business write. */
export interface ReplicaChange {
  version: 1;
  tenantId: string;
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  revision: string;
  operation: 'UPSERT' | 'CORRECTION' | 'TOMBSTONE';
  supersedes: string | null;
  payload: Record<string, unknown>;
  provenance: {
    owner: string; sourceEventId: string; actorId: string;
    correlationId: string; causationId: string; occurredAt: string;
    evidence: Record<string, unknown>;
  };
  /** Metadata references only; object bytes are independently retryable. */
  objectRefs: { id: string; sha256: string }[];
}
export interface ReplicaMessage {
  version: 1; tenantId: string; siteId: string; installationId: string;
  sequence: string; hash: string; change: ReplicaChange;
}
export interface ReplicaAck {
  version: 1; tenantId: string; siteId: string; installationId: string;
  sequence: string; eventId: string; hash: string;
}
export interface Signed<T> { body: T; signature: string; }
export interface ReplicaTransport {
  readonly protocol: 'https:';
  /** Adapter must verify TLS peer and honor cancellation; never follow redirects with credentials. */
  send(message: Signed<ReplicaMessage>, signal: AbortSignal): Promise<Signed<ReplicaAck>>;
}
export interface ReplicaBinding {
  tenantId: string; siteId: string; installationId: string; subjectId: string;
  /** Supplied from external secrets; never stored in replication tables/logs. */
  key: string;
  timeoutMs: number; pollMs: number; maxAttempts: number;
}
export class ReplicationError extends Error {
  constructor(readonly code: string, readonly retryable = false) { super(code); this.name = 'ReplicationError'; }
}
export const REPLICATION_POOL = Symbol('REPLICATION_POOL');
