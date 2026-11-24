import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadAndValidateContracts } from "../../../packages/contracts/scripts/lib/contracts.mjs";
test("actual canonical API declares six authenticated operations and five versioned events", async () => {
  const { openapi, events } = await loadAndValidateContracts();
  const ops = openapi.operations.filter((o) =>
    o.operationId.startsWith("actualOperation"),
  );
  assert.equal(ops.length, 6);
  for (const o of ops)
    assert.ok(
      o.inputs.header.some((h) => h.name === "Authorization" && h.required),
    );
  assert.deepEqual(
    events.events
      .filter((e) => e.producer === "agronomy-actual")
      .map((e) => e.name),
    [
      "agronomy.operation.captured",
      "agronomy.operation.submitted",
      "agronomy.operation.confirmed",
      "agronomy.operation.rejected",
      "agronomy.operation.corrected",
    ],
  );
});
test("actual runtime uses owner ports and retains existing command transaction path", () => {
  const s = readFileSync(
    new URL(
      "../src/modules/agronomy/actual-operation.service.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(s, /actualReferenceInTransaction/);
  assert.match(s, /actualPlannedReferenceInTransaction/);
  assert.doesNotMatch(
    s,
    /(?:FROM|JOIN|INTO|UPDATE)\s+(?:tasks|farm|master_data|org)\./i,
  );
});
