import assert from 'node:assert/strict';
import test from 'node:test';

import { FailClosedAuditAuthorization } from '../dist/modules/audit/audit.authorization.js';
import { validateAuditEvidenceInput } from '../dist/modules/audit/audit.service.js';

const validInput = Object.freeze({
  ownerModule: 'test-owner',
  entityType: 'test-record',
  entityId: 'record-1',
  action: 'test.append',
  actorId: '00000000-0000-4000-8000-000000000001',
  correlationId: 'test-correlation-1',
  provenance: [{ ownerModule: 'test-owner', recordType: 'source', recordId: 'source-1' }],
  evidence: { version: 1 },
});

test('audit evidence input requires owner, actor, correlation, provenance and an object payload', () => {
  assert.doesNotThrow(() => validateAuditEvidenceInput(validInput));
  assert.throws(() => validateAuditEvidenceInput({ ...validInput, actorId: '' }), /actorId/);
  assert.throws(() => validateAuditEvidenceInput({ ...validInput, correlationId: '' }), /correlationId/);
  assert.throws(() => validateAuditEvidenceInput({ ...validInput, provenance: [{ ownerModule: '', recordType: 'source', recordId: '1' }] }), /provenance references/);
  assert.throws(() => validateAuditEvidenceInput({ ...validInput, evidence: [] }), /evidence must be an object/);
});

test('production authorization adapter denies by default', async () => {
  const authorization = new FailClosedAuditAuthorization();
  assert.equal(await authorization.authorize({
    operation: 'CORRECT',
    ownerModule: validInput.ownerModule,
    action: validInput.action,
    actorId: validInput.actorId,
    entityType: validInput.entityType,
    entityId: validInput.entityId,
  }), false);
});
