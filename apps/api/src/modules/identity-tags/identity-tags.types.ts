export interface TagActor { tenantId: string; subjectId: string; }
export type TagAction = 'identity-tags.resolve' | 'identity-tags.issue';
export const TAG_ACTIONS = new Set<TagAction>(['identity-tags.resolve', 'identity-tags.issue']);
export interface TagIdentity { version: 1; entityType: 'Material'; entityId: string; }
export interface TagResolution extends TagIdentity { status: 'RESOLVED' | 'UNAVAILABLE'; name?: string; code?: string; active?: boolean; }
export interface TagContext { idempotencyKey: string; correlationId: string; }
export type TagPolicy = (actor: Readonly<TagActor>, action: TagAction) => Promise<boolean>;
