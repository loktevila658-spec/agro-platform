import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  AUDIT_AUTHORIZATION,
  type AuditAuthorizationPort,
  type AuditOperation,
} from './audit.authorization';
import { AuditTransactionContext } from './audit.transaction';

export interface AuditProvenanceReference {
  readonly ownerModule: string;
  readonly recordType: string;
  readonly recordId: string;
}

export interface AuditEvidenceInput {
  readonly ownerModule: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly provenance: readonly AuditProvenanceReference[];
  readonly evidence: Readonly<Record<string, unknown>>;
}

export type CorrectionRelation = 'CORRECTION' | 'SUPERSESSION';

export interface AuditCorrectionInput {
  readonly originalEvidenceId: string;
  readonly relation: CorrectionRelation;
  readonly replacement: AuditEvidenceInput;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export function validateAuditEvidenceInput(input: AuditEvidenceInput): void {
  for (const [name, value] of Object.entries({
    ownerModule: input.ownerModule,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actorId: input.actorId,
    correlationId: input.correlationId,
  })) {
    if (typeof value !== 'string' || !ID.test(value)) {
      throw new TypeError(`${name} is required and must be a valid identifier`);
    }
  }
  if (!Array.isArray(input.provenance)) throw new TypeError('provenance must be an array');
  for (const reference of input.provenance) {
    if (!reference || !ID.test(reference.ownerModule) || !ID.test(reference.recordType) || !ID.test(reference.recordId)) {
      throw new TypeError('provenance references require ownerModule, recordType, and recordId');
    }
  }
  if (!input.evidence || typeof input.evidence !== 'object' || Array.isArray(input.evidence)) {
    throw new TypeError('evidence must be an object');
  }
}

@Injectable()
export class AuditService {
  constructor(@Inject(AUDIT_AUTHORIZATION) private readonly authorization: AuditAuthorizationPort) {}

  async appendEvidence(tx: AuditTransactionContext, input: AuditEvidenceInput): Promise<string> {
    validateAuditEvidenceInput(input);
    await this.requireAuthorization('APPEND', input);
    return this.insertEvidence(tx, input);
  }

  async recordCorrection(tx: AuditTransactionContext, input: AuditCorrectionInput): Promise<{ evidenceId: string; linkId: string }> {
    validateAuditEvidenceInput(input.replacement);
    if (!ID.test(input.originalEvidenceId)) throw new TypeError('originalEvidenceId is required');
    if (input.relation !== 'CORRECTION' && input.relation !== 'SUPERSESSION') {
      throw new TypeError('relation must be CORRECTION or SUPERSESSION');
    }

    const operation: AuditOperation = input.relation === 'CORRECTION' ? 'CORRECT' : 'SUPERSEDE';
    await this.requireAuthorization(operation, input.replacement);

    const original = await tx.client.query<{
      owner_module: string;
      entity_type: string;
      entity_id: string;
    }>(
      `SELECT owner_module, entity_type, entity_id
       FROM platform_audit.evidence
       WHERE evidence_id = $1`,
      [input.originalEvidenceId],
    );
    const source = original.rows[0];
    if (original.rowCount !== 1 || !source) throw new TypeError('original evidence does not exist');
    if (source.owner_module !== input.replacement.ownerModule
      || source.entity_type !== input.replacement.entityType
      || source.entity_id !== input.replacement.entityId) {
      throw new TypeError('correction evidence must retain the original owner and entity identity');
    }

    const evidenceId = await this.insertEvidence(tx, input.replacement);
    const linkId = randomUUID();
    await tx.client.query(
      `INSERT INTO platform_audit.correction_link
        (link_id, original_evidence_id, replacement_evidence_id, relation, actor_id, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [linkId, input.originalEvidenceId, evidenceId, input.relation, input.replacement.actorId, input.replacement.correlationId],
    );
    return { evidenceId, linkId };
  }

  private async requireAuthorization(operation: AuditOperation, input: AuditEvidenceInput): Promise<void> {
    let allowed = false;
    try {
      allowed = await this.authorization.authorize({
        operation,
        ownerModule: input.ownerModule,
        action: input.action,
        actorId: input.actorId,
        entityType: input.entityType,
        entityId: input.entityId,
      });
    } catch {
      allowed = false;
    }
    if (!allowed) throw new UnauthorizedException('Audit operation is not authorized');
  }

  private async insertEvidence(tx: AuditTransactionContext, input: AuditEvidenceInput): Promise<string> {
    const evidenceId = randomUUID();
    await tx.client.query(
      `INSERT INTO platform_audit.evidence
        (evidence_id, owner_module, entity_type, entity_id, action, actor_id,
         correlation_id, provenance, evidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
      [evidenceId, input.ownerModule, input.entityType, input.entityId, input.action,
        input.actorId, input.correlationId, JSON.stringify(input.provenance), JSON.stringify(input.evidence)],
    );
    return evidenceId;
  }
}
