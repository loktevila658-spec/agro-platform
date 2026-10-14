# WP49 Completion Report

- WP ID: WP49-014
- Title: Audit & correction framework
- Branch / implementation commit: `codex/wp49-014` / `58b9677dcdd9c4728abb103699f02cbcce55dae9`.
- Date: 2026-10-14
- Process status: [PR #27](https://github.com/loktevila658-spec/agro-platform/pull/27) is OPEN for review; **not DONE**. CR #25 and scope addendum #26 remain open. The prior G0 review found that migration 0004 did not block `TRUNCATE`; this correction adds statement-level guards and PostgreSQL integration assertions. New-head CI is pending at this report update; no post-merge CI exists.

## 1. Prerequisites verified

- `origin/main`: `715ecb50cbb465a7088be2a4ef1eb8947a0ffdce`; live remote, local remote-tracking ref, and worktree HEAD matched at final review.
- CR #25: APPROVED and OPEN. Its original body and approval decision were preserved.
- CR #26: APPROVED and OPEN. The project owner approval «одоряю» (obvious typo for «одобряю») was recorded in its body. It authorizes exactly the identity integration test expectation update and this report path.
- Frozen WP49-014 manifest was not edited:
  - `depends_on`: WP49-011, WP49-012, WP49-013
  - `allowed_paths_raw`: `/apps/api/modules/audit`
  - `exit_criteria`: `immutable audit, correction/supersession links.`
- Dependencies: WP49-011, WP49-012 and WP49-013 are merged; evidence is recorded in CR #25, including WP49-013 Completion Report and post-merge run `38612576311`.
- Schema/API compatibility: additive migration 0004 sets schema version 4. API schema-version response and migration integration tests agree. No OpenAPI or event schema changes.

## 2. Scope implemented

- Spec and governance: DOC47–DOC50 authority chain; CR #25 and approved scope addendum #26.
- Delivered an internal compiled audit/correction framework with isolated durable PostgreSQL append-only evidence and correction/supersession links. It does not write to, migrate, replace, backfill, or change `org.audit_entry` or `identity.security_audit`.
- The framework is registered in the API runtime but is not adopted by existing org or identity command paths. Its adoption contract defines owner-supplied identity/action, actor, correlation, provenance, authorization, and transaction context. Authorization fails closed by default. The framework-level verification scenario emits no domain event; future command owners decide event/no-event and use the transactional outbox when an authoritative event applies.
- Frozen exit criteria remain unchanged and are exercised by the PostgreSQL framework scenario.

## 3. Changed files

Every path is authorized by CR #25 or CR #26:

- `apps/api/src/modules/audit/audit.authorization.ts` — fail-closed authorization port and default provider.
- `apps/api/src/modules/audit/audit.module.ts` — internal module registration boundary.
- `apps/api/src/modules/audit/audit.service.ts` — append-only evidence writer and correction/supersession link creation.
- `apps/api/src/modules/audit/audit.transaction.ts` — transaction-scoped context with commit/rollback behavior.
- `apps/api/src/modules/audit/ADOPTION.md` — owner, input, authorization, atomicity, and event/no-event contract for future adopters.
- `apps/api/src/app.module.ts` — register the audit module in API runtime.
- `database/migrations/0004_audit_correction_framework.sql` — additive, isolated `platform_audit` schema with append-only tables and mutation guards.
- `database/test/migrate.test.mjs` — migration sequence/schema assertions and checks for isolated ownership.
- `database/test/database.integration.test.mjs` — real PostgreSQL/PostGIS migration, repeatability, schema-version and existing-store checks.
- `apps/api/src/schema-version.service.ts` — expected migration version 4.
- `apps/api/test/schema-version.test.mjs` — API schema-version expectations.
- `apps/api/test/audit.unit.test.mjs` — input validation and default-deny authorization tests.
- `apps/api/test/audit.integration.test.mjs` — real PostgreSQL append-only, link, rollback, ownership and fail-closed scenario.
- `apps/api/test/identity.integration.test.mjs` — only the expected `platform_meta.schema_version` value changed from 3 to 4; all identity and security-audit assertions remain unchanged.
- `tests/evidence/WP49-014_COMPLETION_REPORT.md` — this evidence report, authorized by CR #26.

## 4. Database / contracts

- Migration: `0004_audit_correction_framework.sql`, additive and isolated to `platform_audit`.
- Schema version: 4.
- Existing stores: `org.audit_entry` and `identity.security_audit` remain present and independently owned; integration checks observed no rows introduced or changed by the framework scenario.
- OpenAPI diff: none.
- Event catalog/schema diff: none; no event is emitted by the framework-level scenario.
- Permission catalog/RBAC diff: none; injected authorization defaults to deny, and no new permission keys are introduced.

## 5. Tests and quality gates

- Targeted identity integration test: **PASS**, real PostgreSQL, 1/1.
- WP49-014 audit unit tests: **PASS**.
- WP49-014 audit integration test: **PASS**, real PostgreSQL; checks append-only evidence/link, original-evidence retention, correction/supersession relation, rollback/atomicity, fail-closed authorization, and preservation of existing audit stores.
- `TRUNCATE` denial: **PASS**, real PostgreSQL; direct `TRUNCATE` of `platform_audit.correction_link` and `TRUNCATE ... CASCADE` targeting `platform_audit.evidence` are rejected with SQLSTATE `23514`, and the original evidence plus supersession link are re-read and verified after each rejection.
- Migration unit tests: **PASS**, 5/5.
- Full API package test suite: **PASS**, 28/28.
- Workspace unit gate (`node scripts/ci-gates.mjs unit`): **PASS** — workspace build, package tests, bootstrap regression (13/13), migration unit tests (5/5), and bootstrap validation.
- Lint gate: **PASS / N/A** — no repository lint script/tool is configured.
- Typecheck gate: **PASS** — workspace typecheck and architecture dependency guard (11/11).
- Contract gate: **PASS** — canonical contracts validate and generated clients have no drift.
- Migration gate: **PASS** — PostgreSQL/PostGIS integration applies and repeats migrations, validates schema version 4 and API response, and verifies required stores/tables.
- Runtime Compose smoke: **BLOCKED / NOT RUN**. Config validation passed, but the prescribed smoke cleanup runs `docker compose down --volumes --remove-orphans`, which can delete volumes in the shared Compose environment. No unsafe cleanup was performed. The prior incomplete local runtime attempt is not counted as PASS.
- Prior-head PR CI run [`38627127402`](https://github.com/loktevila658-spec/agro-platform/actions/runs/38627127402): **PASS** on head `2588c19136ef60138451713d6ca72e94321c0e97`; it predates this `TRUNCATE` correction and is not evidence for the corrected head. New-head pre-merge CI: **PENDING** at report update; the PR workflow runs required gates on its isolated runner.
- Post-merge CI: **NOT RUN** — PR #27 has not been merged.

- G0: PASS — dependencies and schema compatibility verified.
- G1: PASS — build, typecheck, architecture checks; lint is N/A as noted.
- G2: PASS — additive migration and schema-version checks pass on PostgreSQL.
- G3: PASS — unit and regression suites pass.
- G4: PASS — audit and migration integration checks pass on real PostgreSQL/PostGIS.
- G5: PASS — no API contract changes; contract gate passes.
- G6: PASS — no event contract changes; framework scenario emits no domain event.
- G7: PASS — default-deny authorization and negative authorization test pass.
- G8: NOT APPLICABLE — no offline behavior changed.
- G9: PASS — evidence/provenance and correction links are persisted and tested.
- G10: PASS — deterministic framework-level PostgreSQL scenario passes; it is not a product workflow.
- G11: PASS for applicable security checks — fail-closed authorization, existing identity security-audit assertions, and architecture checks pass. No separate performance/chaos gate was assigned or run.
- G12: BLOCKED — report is prepared and PR #27 is open, but pre-merge CI, review/merge approval, post-merge CI, and remaining governance steps are outstanding.

## 6. Deterministic demo / evidence

- Scenario: framework-level PostgreSQL test creates immutable evidence and a supersession link, verifies the original evidence remains intact after UPDATE/DELETE/TRUNCATE denials, exercises transaction rollback and denied authorization, and confirms the existing audit stores remain unchanged.
- Seed / clock: fixed test identifiers and payloads; database timestamps are not used as ordering oracles for expected business behavior.
- Result: PASS for the framework scenario.
- Evidence: this report; approved [CR #25](https://github.com/loktevila658-spec/agro-platform/issues/25); approved [scope addendum #26](https://github.com/loktevila658-spec/agro-platform/issues/26); [PR #27](https://github.com/loktevila658-spec/agro-platform/pull/27); local test and gate results listed above.

## 7. Limitations / follow-ups

- Local Compose runtime smoke remains BLOCKED/NOT RUN because the prescribed cleanup deletes volumes in the shared environment. Do not report it as passing. A safe isolated CI/runtime execution is still required.
- Implementation commit `58b9677dcdd9c4728abb103699f02cbcce55dae9` and PR #27 exist; pre-merge CI is pending, and post-merge CI and merge do not exist.
- CR #25 and CR #26 remain OPEN; neither has been closed.
- WP49-014 is not marked DONE. Do not start WP49-015.

## 8. Unlock decision

- **FAIL / NOT DONE** — corrected-head CI, review/merge approval, post-merge CI, and remaining governance evidence are outstanding. Local Compose runtime smoke remains BLOCKED / NOT RUN for the documented destructive cleanup reason.
- Newly unlockable WP: none.
