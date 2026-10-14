# WP49 Completion Report

- WP ID: WP49-014
- Title: Audit & correction framework
- Branch: `codex/wp49-014`.
- Initial implementation commit (historical): [`58b9677dcdd9c4728abb103699f02cbcce55dae9`](https://github.com/loktevila658-spec/agro-platform/commit/58b9677dcdd9c4728abb103699f02cbcce55dae9).
- G0 `TRUNCATE` protection correction commit: [`1e69c7e52c8e56a645cab5156ddaf10345bb2fe4`](https://github.com/loktevila658-spec/agro-platform/commit/1e69c7e52c8e56a645cab5156ddaf10345bb2fe4).
- Date: 2026-10-14
- Process status: implementation PR [#27](https://github.com/loktevila658-spec/agro-platform/pull/27) is merged at `716d745a585615331cb63f036fadab467daf81fb`; its post-merge CI passed on that exact commit. Report-only evidence PR [#28](https://github.com/loktevila658-spec/agro-platform/pull/28) is merged at `2195408cc4d639b1bb6826385a73c8d688cc4f41`, and CR #25/#26 have since been closed as completed. The prior G0 review found that migration 0004 did not block `TRUNCATE`; the correction commit above adds statement-level guards and PostgreSQL integration assertions. CI run `38630316221` passed on the correction commit. Previous report-only head `f0952281effb28f82221df737fe17f623831622d` was separately checked by run `38631428907`; this final report-only closeout is proposed in PR #29 and has not yet been merged.

## 1. Prerequisites verified

- Initial G0 baseline: `main@715ecb50cbb465a7088be2a4ef1eb8947a0ffdce`; PR #27 targeted that baseline. The implementation was subsequently merged, and the verified current `main` is merge commit `716d745a585615331cb63f036fadab467daf81fb`. At the corrected-code CI review, PR branch `codex/wp49-014` was at `1e69c7e52c8e56a645cab5156ddaf10345bb2fe4`.
- CR #25: APPROVED; subsequently closed as completed after merged implementation/report evidence and successful post-merge CI. Its original body and approval decision were preserved.
- CR #26: APPROVED; subsequently closed as completed after the authorized identity integration test expectation update, report merge and successful post-merge CI. The project owner approval «одоряю» (obvious typo for «одобряю») was recorded in its body. It authorizes exactly the identity integration test expectation update and this report path.
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
- Local Compose runtime smoke: **BLOCKED / NOT RUN**. The prescribed smoke cleanup runs `docker compose down --volumes --remove-orphans`, which can delete volumes in the shared Compose environment. No unsafe cleanup was performed. This local status is separate from the successful isolated GitHub Runtime quality gate.
- Corrected-code PR CI run [`38630316221`](https://github.com/loktevila658-spec/agro-platform/actions/runs/38630316221): **PASS** on exact commit `1e69c7e52c8e56a645cab5156ddaf10345bb2fe4` (PR head before this report-only update). Successful jobs: Lint capability gate, Unit quality gate, Typecheck quality gate, Runtime quality gate, Contract quality gate, Migration quality gate, and aggregate `CI quality gates`. This run is not evidence for the subsequent report-only commit.
- The subsequent report-only PR head `f0952281effb28f82221df737fe17f623831622d` was checked separately by GitHub Actions run [`38631428907`](https://github.com/loktevila658-spec/agro-platform/actions/runs/38631428907): **PASS** on that exact report-only commit. Successful jobs: Lint capability gate, Unit quality gate, Typecheck quality gate, Runtime quality gate, Contract quality gate, Migration quality gate, and aggregate `CI quality gates`. The implementation evidence is the correction commit `1e69c7e52c8e56a645cab5156ddaf10345bb2fe4`; `f0952281effb28f82221df737fe17f623831622d` is the subsequent report-only commit.
- Post-merge CI run [`38633756492`](https://github.com/loktevila658-spec/agro-platform/actions/runs/38633756492): **PASS** on exact merge commit `716d745a585615331cb63f036fadab467daf81fb`. Successful jobs: Migration quality gate, Lint capability gate, Contract quality gate, Runtime quality gate, Unit quality gate, Typecheck quality gate, and aggregate `CI quality gates`.

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
- G12: PASS for the completed WP evidence — implementation PR #27 and report-only PR #28 are merged, merge approval is recorded, required post-merge CI passed, and CR #25/#26 were closed as completed with linked evidence comments. This final report-only closeout is proposed as PR #29; the DONE record takes effect when that authorized report update is reviewed and merged.

## 6. Deterministic demo / evidence

- Scenario: framework-level PostgreSQL test creates immutable evidence and a supersession link, verifies the original evidence remains intact after UPDATE/DELETE/TRUNCATE denials, exercises transaction rollback and denied authorization, and confirms the existing audit stores remain unchanged.
- Seed / clock: fixed test identifiers and payloads; database timestamps are not used as ordering oracles for expected business behavior.
- Result: PASS for the framework scenario.
- Evidence: this report; approved [CR #25](https://github.com/loktevila658-spec/agro-platform/issues/25); approved [scope addendum #26](https://github.com/loktevila658-spec/agro-platform/issues/26); [PR #27](https://github.com/loktevila658-spec/agro-platform/pull/27); local test and gate results listed above.

## 7. Limitations / follow-ups

- Local Compose runtime smoke remains BLOCKED/NOT RUN because the prescribed cleanup deletes volumes in the shared environment. Do not report local smoke as passing. The isolated GitHub Runtime quality gate passed in run `38630316221`.
- Historical implementation commit `58b9677dcdd9c4728abb103699f02cbcce55dae9`, correction commit `1e69c7e52c8e56a645cab5156ddaf10345bb2fe4`, and PR #27 remain the implementation history. Run `38630316221` passed on the correction commit; run `38631428907` passed on prior report-only head `f0952281effb28f82221df737fe17f623831622d`; post-merge run `38633756492` passed on merge commit `716d745a585615331cb63f036fadab467daf81fb`.
- CR #25 and CR #26 were closed as completed after PR #28 and its successful post-merge CI; their closure comments link the implementation, report and CI evidence.
- The main-branch report before PR #29 still records WP49-014 as NOT DONE. This PR proposes the final PASS / DONE closeout record; do not start WP49-015 before the report update is merged.

## 8. Unlock decision

- **PASS / DONE (proposed closeout record)** — implementation PR #27 and report-only PR #28 are merged; post-merge CI passed; CR #25 and #26 are closed as completed. This final report update is the only remaining review/merge step before this DONE record is present in `main`. Local Compose runtime smoke remains BLOCKED / NOT RUN for the documented destructive cleanup reason; the GitHub Runtime quality gate passed.
- Newly unlockable WP: none.

## 9. Post-merge completion evidence

- Implementation PR: [#27](https://github.com/loktevila658-spec/agro-platform/pull/27), merged from head `11696b2dbf47fc590bc6a03950cf77ee51f419ba` into base `715ecb50cbb465a7088be2a4ef1eb8947a0ffdce` as merge commit [`716d745a585615331cb63f036fadab467daf81fb`](https://github.com/loktevila658-spec/agro-platform/commit/716d745a585615331cb63f036fadab467daf81fb). GitHub `main` points to this merge commit.
- Post-merge GitHub Actions run [`38633756492`](https://github.com/loktevila658-spec/agro-platform/actions/runs/38633756492) completed **SUCCESS** on exact merge commit `716d745a585615331cb63f036fadab467daf81fb`. Required jobs all passed: Migration quality gate, Lint capability gate, Contract quality gate, Runtime quality gate, Unit quality gate, Typecheck quality gate, and aggregate `CI quality gates`.
- CR #25 and CR #26 were APPROVED and OPEN when PR #28's report update was prepared. Both were later closed as completed after the evidence below was in `main`; [CR #25 closure evidence](https://github.com/loktevila658-spec/agro-platform/issues/25#issuecomment-6178270712) and [CR #26 closure evidence](https://github.com/loktevila658-spec/agro-platform/issues/26#issuecomment-6178272572) link the PRs and CI runs.
- Local Compose runtime smoke remains **BLOCKED / NOT RUN** because the prescribed cleanup would run destructive `docker compose down --volumes --remove-orphans` in the shared environment. The GitHub Runtime quality gate is **PASS** in post-merge run `38633756492`; this does not convert the local smoke status to PASS.
- WP49-014's final **PASS / DONE** record is proposed by PR #29 after implementation/report merges, successful post-merge CI and closure of CR #25/#26. It becomes the main-branch completion record when this report-only PR is reviewed and merged. No implementation scope or frozen manifest/status field is changed.
