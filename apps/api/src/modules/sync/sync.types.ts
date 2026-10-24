import type { PoolClient } from 'pg';
export interface SyncActor { tenantId: string; userId: string; deviceId: string; sessionId: string; }
export interface SyncCommand {
  localCommandId: string; idempotencyKey: string; deviceSeq: number;
  aggregate: { type: string; id: string }; baseVersion?: number;
  type: string; commandVersion: number; observedAt: string; offlineAuthId: string;
  payload: Record<string, unknown>; provenance: Record<string, unknown>;
  attachments: AttachmentIntent[];
}
export interface AttachmentIntent { localAttachmentId: string; ownerRef: string; evidenceType: string; sha256: string; mime: string; sizeBytes: number; required: boolean; }
export interface SyncChange { entityType: string; entityId: string; entityVersion?: number; op: 'UPSERT' | 'PURGE'; projection: Record<string, unknown>; visibleUserIds: string[]; }
export interface SyncResult { localCommandId: string; status: 'ACCEPTED' | 'CONFLICT' | 'REJECTED' | 'ACTION_REQUIRED'; code?: string; canonical?: Record<string, unknown>; aggregateVersion?: number; receivedAt: string; localIntent?: SyncCommand; }
export class SyncConflict extends Error {
  constructor(readonly kind: 'STATE_CONFLICT' | 'STOCK_CONFLICT' | 'WEIGH_CONFLICT' | 'BATCH_CONFLICT' | 'APPROVAL_LEGAL' | 'VERSION_CONFLICT', readonly snapshot: Record<string, unknown>) { super(kind); }
}
/** Owning application contract. All effect, state validation, audit and outbox
 * must use transaction. Never call a handler's repository directly from sync. */
export interface SyncHandler {
  readonly commandType: string;
  readonly version: number;
  readonly requiresVersion: boolean;
  authorize(transaction: PoolClient, actor: SyncActor, command: SyncCommand): Promise<boolean>;
  currentState?(transaction: PoolClient, actor: SyncActor, command: SyncCommand): Promise<Record<string, unknown>>;
  assertVersion?(transaction: PoolClient, actor: SyncActor, command: SyncCommand): Promise<boolean>;
  execute(transaction: PoolClient, actor: SyncActor, command: SyncCommand): Promise<{ canonical: Record<string, unknown>; aggregateVersion?: number; changes: SyncChange[] }>;
  offlinePolicy?(actor: SyncActor): Promise<{ owners: string[]; risk: 'O1' | 'O2'; ttlSeconds: number } | undefined>;
}
export interface PushRequest { deviceId: string; scopeVersion: number; schemaVersion: number; commands: SyncCommand[]; }
export interface Cursor { tenantId: string; userId: string; deviceId: string; scopeVersion: number; schemaVersion: number; seq: string; issuedAt: number; }
