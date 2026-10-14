# WP49 Completion Report

- WP ID: WP49-015
- Title: Idempotency & command envelope
- Branch / commit: `codex/wp49-015-command`; implementation commit [`c9d897106d09ce884d0ead7fec9beb1bceb9cb9e`](https://github.com/loktevila658-spec/agro-platform/commit/c9d897106d09ce884d0ead7fec9beb1bceb9cb9e).
- Date: 2026-10-15
- Implementation baseline: live `origin/main@c32bad99aa3db460b641a2ce0e96d4edc0c62aea`.
- Current main after report closeout PR #33: `4d533b13af141bcfc0e69e399be111aadb3039e6`.
- Governance: CR #31 is CLOSED as completed. The owner approval is in [comment #6180542708](https://github.com/loktevila658-spec/agro-platform/issues/31#issuecomment-6180542708), and the completion/closure evidence is in [comment #6180817702](https://github.com/loktevila658-spec/agro-platform/issues/31#issuecomment-6180817702). Its approved body and paths were checked against this diff.
- Frozen manifest values were preserved verbatim: `allowed_paths_raw: /apps/api/common`; `exit_criteria: idempotency key, commandId, optimistic version.`

## 1. Prerequisites verified

- G0: PASS. Dependencies WP49-011, WP49-012, WP49-013 and WP49-014 are merged on the baseline; their evidence is in their completion reports and PRs #18/#19/#21/#23/#27. The verified WP49-014 merge is `716d745a585615331cb63f036fadab467daf81fb`. Existing organization API, database and event contracts are compatible; this change is an additive response field and introduces no schema or event migration.
- Before implementation, `git ls-remote origin refs/heads/main` returned the exact implementation baseline above. The implementation merged at `92a98de5aa0078941e2842a3bcf3ba41f0f07f34`; report closeout PR #33 then merged at `4d533b13af141bcfc0e69e399be111aadb3039e6`, the current verified live `main`. CR #31's body is unchanged, its owner approval is recorded, and it is closed with linked completion evidence.

## 2. Scope implemented

- Authority used: DOC50 execution baseline, DOC48 frozen scope, DOC47 reconciliation, DOC49 build graph, WP49-015 manifest, and the exact paths/additional interpretation approved in CR #31.
- Existing organization create commands retain the idempotency reservation and business effect/audit/outbox in one PostgreSQL transaction. Same-key/same-payload replay returns the exact persisted original response; incompatible action/payload reuse remains HTTP 409.
- A new reservation gets a server UUID `commandId`; it is stored with the JSONB response and returned. A real PostgreSQL concurrent retry test observes the same response and command ID, with exactly one tenant, audit entry and outbox event.
- The reusable `apps/api/src/common/command-boundary.ts` production primitive invokes a caller-provided, transaction-scoped atomic version guard before the effect callback. A stale value throws HTTP 409 before that callback; a fresh expected value permits its effect once. The adapter test serializes two concurrent commands against one version and observes one effect and one conflict.
- No existing versioned aggregate or update command is selected by DOC48/DOC49/DOC50. Therefore the guard accepts opaque expected values and a caller-supplied atomic compare/lock; this WP adds no domain version semantics, update endpoint, version column or migration. Current create commands do not supply an expected version.
- Historical idempotency JSONB responses from before this change are replayed without mutation or invented IDs. `commandId` is optional in the additive response schema for that backwards-compatible case; every command accepted by the new code persists and returns it.
- Permission checks, canonical tenant ownership, LOCAL_PRIMARY writes, transaction boundaries, audit/provenance, outbox, actor, correlation and causation behavior remain in the existing command flow.

## 3. Changed files

All changed paths are in the exact set approved by CR #31:

- `apps/api/src/common/command-boundary.ts` — compiled reusable production guard/executor.
- `apps/api/src/modules/org/org.service.ts` — command ID persistence/replay and production guard placement before the authoritative insert.
- `apps/api/test/org.unit.test.mjs` — stale guard/no-effect, concurrent single-effect and legacy replay compatibility tests.
- `apps/api/test/org.integration.test.mjs` — command ID and persisted replay response assertions; concurrent PostgreSQL replay proves single business/audit/outbox effect.
- `openapi/openapi.yaml` — additive UUID `commandId` response property on the four existing org create schemas; optional only to represent pre-release stored responses.
- `packages/contracts/src/generated/contracts.ts` — regenerated TypeScript contract output.
- `packages/contracts/generated/dart/contracts.dart` — regenerated Dart contract output.
- `packages/contracts/generated/manifest.json` — regenerated source/output checksums.
- `packages/contracts/test/contracts.test.mjs` — canonical and generated TypeScript/Dart response-shape regression.
- `tests/contracts.test.mjs` — repository-level OpenAPI response-shape regression.
- `tests/evidence/WP49-015_COMPLETION_REPORT.md` — this report, permitted by CR #31.

No manifest, status field, dependency, exit criterion, event catalog, migration, generator implementation, app/module registration or WP49-011/012 behavior was changed.

## 4. Database / contracts

- Migrations: none. The existing JSONB idempotency response stores `commandId`; no aggregate version persistence is introduced.
- OpenAPI: additive `commandId` UUID property on TenantResponse, OrganizationResponse, OrganizationUnitResponse and SiteResponse. The field is optional for old stored replay responses; newly accepted commands always include it.
- Generated TypeScript and Dart outputs were regenerated from canonical OpenAPI. `contracts:check` confirms no generated drift.
- Event schema/catalog: unchanged. Existing PostgreSQL integration confirms one outbox event per successful command and preserves actor/correlation/causation and audit assertions.
- Permissions/workflows: unchanged; existing fail-closed permission mapping remains in use.

## 5. Tests and quality gates

All local checks below were run against implementation commit `c9d897106d09ce884d0ead7fec9beb1bceb9cb9e` before report creation. Implementation PR #32, report closeout PR #33, their required CI, and CR #31 closure are complete.

- `pnpm install --frozen-lockfile` from `apps`: PASS.
- API targeted tests: `node --test apps/api/test/org.unit.test.mjs apps/api/test/org.integration.test.mjs` — PASS, 12/12; integration used real PostgreSQL.
- API workspace package suite: PASS, 31/31; includes authorization, HTTP and real PostgreSQL tests.
- Contracts package tests: PASS, 19/19; repository contract tests: PASS, 3/3.
- `node scripts/ci-gates.mjs lint`: PASS / N/A — repository has no configured lint script/tool.
- `node scripts/ci-gates.mjs typecheck`: PASS — workspace typecheck and architecture dependency guard (11/11).
- `node scripts/ci-gates.mjs unit`: PASS — workspace build, package tests, bootstrap regressions, migration unit tests (5/5) and bootstrap validation.
- `node scripts/ci-gates.mjs contract`: PASS — OpenAPI/event validation and generated contract drift check.
- `node scripts/ci-gates.mjs migration`: PASS — real PostgreSQL/PostGIS migration integration (1/1); no WP migration was added.
- `COMPOSE_PROJECT_NAME=wp49-015 node scripts/ci-gates.mjs runtime`: PASS — compose config and isolated runtime smoke; the script's `down --volumes` was scoped to this unique project name.
- `git diff --check`: PASS.
- The first sandbox attempts of the migration and runtime gates could not write Docker buildx activity files under `~/.docker`; each was rerun with the required system access and passed. No application/test failure was hidden.
- PR [#32](https://github.com/loktevila658-spec/agro-platform/pull/32) — pre-merge workflow [run 38653962394](https://github.com/loktevila658-spec/agro-platform/actions/runs/38653962394): PASS on head `f5febe226043c0087262eba5b64294acb9507ff5`; all six quality jobs and aggregate `CI quality gates` passed. The repository requires the aggregate check and has no mandatory reviewer approval; the author performed a line-by-line review before merge.
- PR #32 merged into implementation baseline `c32bad99aa3db460b641a2ce0e96d4edc0c62aea` as merge commit [`92a98de5aa0078941e2842a3bcf3ba41f0f07f34`](https://github.com/loktevila658-spec/agro-platform/commit/92a98de5aa0078941e2842a3bcf3ba41f0f07f34). Live `origin/main` points to this SHA.
- Post-merge workflow [run 38654141205](https://github.com/loktevila658-spec/agro-platform/actions/runs/38654141205): SUCCESS on exact merge commit `92a98de5aa0078941e2842a3bcf3ba41f0f07f34`. Lint, typecheck, unit, contract, migration, runtime and aggregate `CI quality gates` all passed.
- Report closeout PR [#33](https://github.com/loktevila658-spec/agro-platform/pull/33) merged at `4d533b13af141bcfc0e69e399be111aadb3039e6`. Its pre-merge run [38654396638](https://github.com/loktevila658-spec/agro-platform/actions/runs/38654396638) passed on head `33c512d5c34ec303bdc1de6322abb60d406f0daa`; post-merge run [38654595019](https://github.com/loktevila658-spec/agro-platform/actions/runs/38654595019) passed on exact merge commit `4d533b13af141bcfc0e69e399be111aadb3039e6`.
- CR #31 was closed as completed with [closure comment #6180817702](https://github.com/loktevila658-spec/agro-platform/issues/31#issuecomment-6180817702), linking owner approval, implementation merge, report closeout and both post-merge CI runs.

- G0: PASS — all four declared dependencies are merged and existing API/database/event contracts are compatible.
- G1: PASS — API/workspace build and typecheck, architecture guard and diff check pass; lint is N/A because no lint tool is configured.
- G2: N/A — no migration or aggregate-version persistence is in scope; the migration gate passes.
- G3: PASS — domain/idempotency/version guard unit tests and the unit gate pass.
- G4: PASS — organization API integration and migration integration run against real PostgreSQL/PostGIS.
- G5: PASS — additive OpenAPI field, regenerated TypeScript/Dart clients, response-shape tests and contract gate pass; old stored replay responses remain representable.
- G6: PASS — event schema is unchanged; PostgreSQL integration verifies a single outbox effect and existing correlation/causation fields.
- G7: PASS — deny-by-default and negative permission cases pass in the API/unit suites; existing authorization call order is preserved.
- G8: N/A — this WP changes no offline queue or sync behavior; no offline-capable command flow is introduced.
- G9: PASS — PostgreSQL integration verifies the command still commits one audit row and one outbox row atomically with one authoritative effect.
- G10: PASS — deterministic org command create/replay API scenario passes against PostgreSQL. The WP manifest assigns no separate DEMO27 scenario; no unrelated demo profile is claimed as evidence.
- G11: PASS for applicable checks — security/architecture and permission regressions pass; no new endpoint or performance-sensitive aggregate operation is added. No separate performance/chaos scenario is assigned to this WP.
- G12: PASS — implementation PR #32 and report closeout PR #33 are merged; required PR checks and post-merge CI passed on the exact head/merge SHAs above; CR #31 is closed with linked evidence; no unmapped scope remains.

## 6. Deterministic demo / evidence

- Scenario: existing organization create API with same-key replay and concurrent same-key retries.
- Inputs: stable actor and command payload; unique test key/code isolate the test run. Assertions do not depend on generated timestamps or UUID values other than UUID shape and equality across retries.
- Result: PASS on PostgreSQL. Two concurrent calls return the same response/commandId and yield one business row, audit row and outbox row.
- Artifact paths: `apps/api/test/org.integration.test.mjs`, `apps/api/test/org.unit.test.mjs`, `packages/contracts/test/contracts.test.mjs`.

## 7. Limitations / follow-ups

- The optimistic-version primitive has no current aggregate caller because no versioned update command or persistence target exists in frozen scope. It is production code used by the shared command executor and accepts an atomic, transaction-scoped caller guard; the isolated adapter tests stale rejection and concurrent compare-and-effect. No product version semantics are inferred.
- The owner is also the PR author, so a second self-approval was not submitted. Repository branch protection requires `CI quality gates`, not a reviewer approval; all PR checks passed and the merge was performed without bypass or auto-merge.
- CR #31 is CLOSED as completed; the owner decision and closure evidence are linked above.

## 8. Unlock decision

- **PASS / DONE** — implementation PR #32 is merged, post-merge CI passed, final report closeout PR #33 is merged, and CR #31 is closed with evidence. Newly prerequisite-satisfied WPs: WP49-016 and WP49-019. No adjacent WP was started.

## 9. Post-merge completion evidence

- Implementation PR: [#32](https://github.com/loktevila658-spec/agro-platform/pull/32), merged head `f5febe226043c0087262eba5b64294acb9507ff5` into base `c32bad99aa3db460b641a2ce0e96d4edc0c62aea` as merge commit [`92a98de5aa0078941e2842a3bcf3ba41f0f07f34`](https://github.com/loktevila658-spec/agro-platform/commit/92a98de5aa0078941e2842a3bcf3ba41f0f07f34).
- Pre-merge GitHub Actions [run 38653962394](https://github.com/loktevila658-spec/agro-platform/actions/runs/38653962394) completed SUCCESS on exact PR head `f5febe226043c0087262eba5b64294acb9507ff5`; all required quality jobs and aggregate passed.
- Post-merge GitHub Actions [run 38654141205](https://github.com/loktevila658-spec/agro-platform/actions/runs/38654141205) completed SUCCESS on exact merge commit `92a98de5aa0078941e2842a3bcf3ba41f0f07f34`; all required quality jobs and aggregate passed.
- Live `origin/main` was verified at `4d533b13af141bcfc0e69e399be111aadb3039e6`; this report's PASS / DONE record and closure evidence are present in `main`.
