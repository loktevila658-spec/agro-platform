import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCapture,
  nextActualState,
  precision,
} from "../dist/modules/agronomy/actual-operation.validation.js";
const id = "019a0000-0000-7000-8000-000000000033";
const fact = () => ({
  organizationId: id,
  fieldSeasonId: id,
  operationTypeId: id,
  startedAt: "2026-11-18T00:00:00Z",
  completedAt: "2026-11-18T01:00:00Z",
  actualQuantity: "1.25",
  unit: "fixture",
  executors: [id],
  materials: [],
  labor: [],
  sourceType: "USER_MOBILE",
});
test("explicit actual capture and Task-linked capture retain original input", () => {
  assert.deepEqual(validateCapture(fact()), fact());
  const task = {
    organizationId: id,
    fieldSeasonId: id,
    taskId: id,
    materials: [],
    labor: [],
    sourceType: "USER_MOBILE",
  };
  assert.deepEqual(validateCapture(task), task);
});
test("unsafe payloads and duplicate resources reject", () => {
  for (const patch of [
    { actualQuantity: "-1" },
    { actualQuantity: "1.1234567" },
    { executors: [] },
    { status: "CONFIRMED" },
    { taskId: id },
    { completedAt: "2026-11-17T00:00:00Z" },
    { sourceType: "IOT" },
    {
      labor: [
        { employeeId: id, quantity: "1", unit: "x" },
        { employeeId: id, quantity: "2", unit: "x" },
      ],
    },
  ])
    assert.throws(() => validateCapture({ ...fact(), ...patch }));
});
test("review and correction preserve the lifecycle", () => {
  assert.equal(nextActualState("CAPTURED", "Submit"), "PENDING_CONFIRMATION");
  assert.equal(nextActualState("PENDING_CONFIRMATION", "Confirm"), "CONFIRMED");
  assert.equal(nextActualState("CONFIRMED", "Correct"), "CORRECTED_VERSION");
  assert.throws(() => nextActualState("CONFIRMED", "Submit"));
  assert.throws(() => nextActualState("CAPTURED", "Confirm"));
  precision("1.230000", 2);
  assert.throws(() => precision("1.234", 2));
});

import { ActualOperationRegistry } from "../dist/modules/agronomy/actual-operation.registry.js";
test("actual policy denies by default and preserves current revoked rights", async () => {
  const r = new ActualOperationRegistry(),
    a = { tenantId: id, userId: id, deviceId: id, sessionId: id };
  assert.equal(await r.can(a, "agronomy.operation.capture", id), false);
  assert.throws(() => r.rules());
  assert.throws(() => r.install({ authorize: async () => true }));
  let allowed = true;
  r.install({
    authorize: async () => allowed,
    reference: async () => undefined,
    validateOperation: async () => false,
    captureScopes: async () => [],
    rules: { maxFutureSkewMs: 0, requireIndependentConfirmation: true },
  });
  assert.equal(await r.can(a, "agronomy.operation.capture", id), true);
  allowed = false;
  assert.equal(await r.can(a, "agronomy.operation.capture", id), false);
  assert.equal(await r.can(a, "agronomy.operation.*", id), false);
  assert.throws(() => r.install({}));
});
