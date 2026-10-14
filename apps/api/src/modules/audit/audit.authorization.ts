export type AuditOperation = 'APPEND' | 'CORRECT' | 'SUPERSEDE';

export interface AuditAuthorizationRequest {
  readonly operation: AuditOperation;
  readonly ownerModule: string;
  readonly action: string;
  readonly actorId: string;
  readonly entityType: string;
  readonly entityId: string;
}

/** A consuming module supplies a trusted, server-side policy adapter. */
export interface AuditAuthorizationPort {
  authorize(request: AuditAuthorizationRequest): Promise<boolean>;
}

export const AUDIT_AUTHORIZATION = Symbol('AUDIT_AUTHORIZATION');

/** Production default: authorization is denied until an approved adapter is wired. */
export class FailClosedAuditAuthorization implements AuditAuthorizationPort {
  async authorize(_request: AuditAuthorizationRequest): Promise<boolean> {
    return false;
  }
}
