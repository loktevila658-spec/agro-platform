# WP49 Completion Report

- WP ID: WP49-013
- Title: RBAC/permissions engine — approved compiled permission checks for existing org operations
- Branch / commit: implementation branch `codex/wp49-013`, head `53bd3fdb50dee81f234325d472060c9169998287`; merged by PR #23 as `0c648d51e419827edc27c508826ae9b0c9615033`
- Date: 2026-10-14

## 1. Prerequisites verified

- dependsOn merged: PASS.
  - WP49-011: PRs #18 and #19 merged; CR #17 closed.
  - WP49-012: PR #21 merged at `073cbc43efd5bd176c9f87ad75a969c8ff21e2df`; post-merge run [38506340208](https://github.com/loktevila658-spec/agro-platform/actions/runs/38506340208) SUCCESS; CR #20 closed.
- schema/API/event compatibility: PASS. No database schema, OpenAPI, or event schema/version changes are included. Contract and migration quality gates passed on WP49-013's merge commit.

Sources: [WP49-013 manifest](https://github.com/loktevila658-spec/agro-platform/blob/0c648d51e419827edc27c508826ae9b0c9615033/codex/work-packages/WP49-013.yaml), [PR #18](https://github.com/loktevila658-spec/agro-platform/pull/18), [PR #19](https://github.com/loktevila658-spec/agro-platform/pull/19), [PR #21](https://github.com/loktevila658-spec/agro-platform/pull/21), [CR #17](https://github.com/loktevila658-spec/agro-platform/issues/17), [CR #20](https://github.com/loktevila658-spec/agro-platform/issues/20).

## 2. Scope implemented

- Frozen WP record was preserved verbatim and not edited:
  - depends_on: WP49-011, WP49-012
  - allowed_paths_raw: `/apps/api/modules/permissions /permissions`
  - exit_criteria: `server-side permission checks + tests.`
- Approved additional implementation paths, per [CR #22](https://github.com/loktevila658-spec/agro-platform/issues/22):
  - `apps/api/src/modules/permissions/**`
  - `apps/api/src/modules/org/org.module.ts`
  - `apps/api/src/modules/org/org.service.ts`
  - `apps/api/test/permissions.test.mjs`
  - `apps/api/test/org.integration.test.mjs`
- Observable behavior: a compiled permission engine is registered in OrgModule and checks the approved catalog action/scope after existing WP49-011 bootstrap authorization. Both checks must pass. Existing bearer authentication, server-configured actor/action allowlist, tenant-scope checks, and domain relationship checks remain in place.
- Operation mappings: `POST /org/tenants` → `org.tenant.create` / global; `POST /org/organizations` → `org.organization.create` / tenant body `tenantId`; `POST /org/organization-units` → `org.organization_unit.create` / tenant body `tenantId`; `POST /org/sites` → `org.site.create` / tenant body `tenantId`; `GET /org/tenants/:tenantId/hierarchy` → `org.hierarchy.read` / route `tenantId`.
- specRefs: DOC49 and DOC50 from the WP manifest; DOC47/DOC48 frozen governance and scope are referenced in CR #22.
- MASTER / MD / BGR references: none assigned by this WP manifest.
- Applicable requirement references listed by CR #22: RT48-111, RT48-112, RT48-120, TZ50-070, TZ50-071, TZ50-080, TZ50-118, TZ50-158.

## 3. Changed files

PR #23 changed six files, each within a path authorized by CR #22:

- `apps/api/src/modules/permissions/permission-engine.ts` — compiled deny-by-default action/scope engine.
- `apps/api/src/modules/permissions/permissions.module.ts` — exports the engine provider.
- `apps/api/src/modules/org/org.module.ts` — registers the permissions module for OrgService.
- `apps/api/src/modules/org/org.service.ts` — invokes the new check after existing bootstrap checks for the five selected operations.
- `apps/api/test/permissions.test.mjs` — catalog synchronization, action/scope allow and deny cases, tenant isolation, wildcard/missing-action denial, and read-only/create action separation.
- `apps/api/test/org.integration.test.mjs` — HTTP denial and existing bootstrap/domain/audit/outbox regression coverage.

Source: [PR #23 changed files](https://github.com/loktevila658-spec/agro-platform/pull/23/files).

## 4. Database / contracts

- migrations: none.
- OpenAPI diff: none.
- event schema diff: none.
- permission/workflow changes: runtime checks use existing catalog action keys and scopes for the approved slice; the permission catalog and workflow definitions were not changed.

## 5. Tests and quality gates

Pre-merge run [38609031415](https://github.com/loktevila658-spec/agro-platform/actions/runs/38609031415) completed SUCCESS on head `53bd3fdb50dee81f234325d472060c9169998287`. Post-merge run [38610630581](https://github.com/loktevila658-spec/agro-platform/actions/runs/38610630581) completed SUCCESS on merge commit `0c648d51e419827edc27c508826ae9b0c9615033`. Every job, including aggregate `CI quality gates`, passed in both runs. PR #23 records workspace build/typecheck/validation and API tests 25/25, including real PostgreSQL integration.

- G0: PASS — WP49-011 and WP49-012 are merged; prerequisite and compatibility evidence is listed above.
- G1: PASS — PR #23 records workspace typecheck/build/validation; pre- and post-merge lint and typecheck gates passed.
- G2: NOT APPLICABLE — no schema migration. Migration quality gate passed.
- G3: PASS — permission-engine unit coverage passed; Unit quality gate passed pre- and post-merge.
- G4: PASS — PR #23 records API integration against real PostgreSQL; Runtime quality gate passed pre- and post-merge.
- G5: NOT APPLICABLE — no API contract changes. Contract quality gate passed.
- G6: NOT APPLICABLE — no event contract changes; existing outbox regression coverage remained in the API integration suite. Contract quality gate passed.
- G7: PASS — deny-by-default, missing action, wildcard, tenant-boundary/horizontal denial, and read-only-versus-create action separation have unit/API negative coverage; quality gates passed.
- G8: NOT APPLICABLE — no offline behavior changed.
- G9: PASS — existing audit/outbox regression coverage remained in the real PostgreSQL integration suite; no audit framework changes.
- G10: PASS — PR #23 records the deterministic org API permission allow/deny end-to-end scenario and passing test result. No separate DEMO27 scenario is assigned by this WP manifest.
- G11: PASS — relevant authorization/security regressions are covered by the passing unit and API integration suites.
- G12: PASS — merge was explicitly authorized by the project owner; PR #23 merged; post-merge gates passed; this report records the evidence; no implementation scope outside CR #22 is included.

## 6. Deterministic demo / evidence

- scenario: selected org-operation permission integration scenario in `apps/api/test/org.integration.test.mjs`.
- seed / clock: no separate DEMO27 seed or reference clock is assigned by WP49-013; the report does not claim one.
- result: PASS per PR #23's test evidence and successful pre-merge/post-merge runs above.
- artifact paths: `tests/evidence/WP49-013_COMPLETION_REPORT.md`; [PR #23](https://github.com/loktevila658-spec/agro-platform/pull/23); [pre-merge run 38609031415](https://github.com/loktevila658-spec/agro-platform/actions/runs/38609031415); [post-merge run 38610630581](https://github.com/loktevila658-spec/agro-platform/actions/runs/38610630581); [CR #22](https://github.com/loktevila658-spec/agro-platform/issues/22).

## 7. Limitations / follow-ups

- Compose runtime smoke was not run; PR #23 records it was skipped because cleanup would run `docker compose down --volumes` against the shared Compose project. The separate GitHub Runtime quality gate passed on both the pre-merge head and merge commit.
- No formal GitHub review submission or review thread is recorded. The read-only review in the control chat was PASS with no findings; merge used the explicit project-owner authorization. No PR comments or blocking review threads were present at close-out.
- At report preparation, CR #22 was APPROVED and OPEN pending completion evidence and closure.
- No later WP was started.

## 8. Unlock decision

- PASS / DONE.
- Newly unlockable WP: WP49-014 — not started, as instructed. WP49-015 remains blocked on WP49-014; other downstream WPs retain their remaining dependencies.
