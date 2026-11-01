# WP49-011 Completion Report — Organization/site hierarchy

Evidence-only reconstruction, 2026-11-02 (Europe/Moscow), baseline
`f20d89c48ff5fc3b753548f785961e9578c19b28`. No implementation changes or historical
rerun. Report path approved in [CR #30 owner decision](https://github.com/loktevila658-spec/agro-platform/issues/30#issuecomment-6179704284).
The broader CR #30 remains open; this report addresses only WP49-011.

## 1. Authority and prerequisites

DOC50 > DOC48 > DOC47 > DOC49; no latest-document-wins. Frozen manifest unchanged:
```yaml
depends_on:
- WP49-003
- WP49-004
allowed_paths_raw: /apps/api/modules/org /database
exit_criteria: Enterprise/Site hierarchy, API/events/audit.
```
Historical implementation baseline `9265e3ee8a78b86df6dda7dcd4aed99deda49d36`.
PR #18 records G0 PASS: dependency merges #3 (`73dfd95e6196a5ccb5f253d656b1dede6570af18`)
and #5 (`f8001bfd3d1122e5752d6c6e0b63e69694aaa4df`) were ancestors with compatible
schema/contracts. This is historical recorded G0, not a new claim that all broader
CR #30 evidence gaps are resolved. WP49-003 now has its separate merged report.

## 2. Implemented scope and approved paths

[CR #17](https://github.com/loktevila658-spec/agro-platform/issues/17) and its two
owner approval comments authorize the compiled runtime, integration and contract
paths. CR #17 is CLOSED/completed. Frozen scope/status was not edited.

Actual baseline-to-corrected-merge paths (23), grouped by function:
- `apps/api/src/modules/org/{org.controller.ts,org.module.ts,org.service.ts,org.tokens.ts}`:
  compiled Nest tenant/organization/recursive organization-unit/site application API.
- `apps/api/src/app.module.ts`: runtime registration.
- `apps/api/package.json`, `apps/pnpm-lock.yaml`: transaction-capable pg runtime.
- `database/migrations/0002_organization_hierarchy.sql`: owned hierarchy, integrity,
  cycle guard, tenant boundaries, idempotency, audit and outbox.
- `apps/api/src/schema-version.service.ts`, `apps/api/test/schema-version.test.mjs`:
  schema v2 compatibility (approved amendment).
- `apps/api/test/org.unit.test.mjs`, `apps/api/test/org.integration.test.mjs`:
  validation/permission/HTTP/real PG/rollback/idempotency and readiness correction.
- `database/test/migrate.test.mjs`, `database/test/database.integration.test.mjs`:
  clean/repeated/current migration and API schema evidence (frozen /database).
- `openapi/openapi.yaml`, `events/catalog/index.yaml`, `permissions/catalog.yaml`:
  canonical HTTP, four versioned org events and five server permission actions.
- `packages/contracts/scripts/lib/contracts.mjs`, `packages/contracts/test/contracts.test.mjs`,
  `tests/contracts.test.mjs`: generic mutation generation and strict regression
  expectations (approved amendment).
- `packages/contracts/src/generated/contracts.ts`, `packages/contracts/generated/dart/contracts.dart`,
  `packages/contracts/generated/manifest.json`: generated client outputs.

Endpoints: POST /org/tenants, /org/organizations, /org/organization-units, /org/sites;
GET /org/tenants/{tenantId}/hierarchy. Four created events @1.0.0:
org.tenant.created, org.organization.created, org.unit.created, org.site.created.
Server credential/actor/action/tenant scopes are configured server-side, fail
closed. Transaction contains canonical effect, audit, outbox and idempotency
response; failed outbox rolls back the whole command. No foreign authoritative
writes, production connector, cloud authority, UI or mobile flow was introduced.

## 3. Exact historical CI and merge evidence

[PR #18](https://github.com/loktevila658-spec/agro-platform/pull/18), head
`c3faef94f06027a43f35889a44e400efd156af07`, ordinary merge
`2b73b00a194738ea5a0e93501cdeb8b71608b93c`.
Its push run [38365014594](https://github.com/loktevila658-spec/agro-platform/actions/runs/38365014594)
FAILED Unit: temporary PostgreSQL initialization postmaster shutdown/readiness race;
Migration passed. This historical failure remains a failure.

[PR #19](https://github.com/loktevila658-spec/agro-platform/pull/19) corrects only the
already authorized org integration fixture readiness test. Head
`62d5fd1fb1ee8a0a792dd65331e32e58448bfd3c`; exact-head pull_request
[38366351744](https://github.com/loktevila658-spec/agro-platform/actions/runs/38366351744)
SUCCESS. Ordinary corrective merge `c66da8d67c019ca4a91556ff2289ed194040c13a`;
exact merge-SHA event=push
[38366585524](https://github.com/loktevila658-spec/agro-platform/actions/runs/38366585524)
SUCCESS, all seven then-required jobs individually observed: Lint capability,
Typecheck, Unit, Contract, Migration, Runtime and aggregate CI quality gates.
Run 38366351744 is PR-head evidence, not post-merge evidence; the older CR #30
proposal mislabels it. This report uses the actual push run instead.

PR #18 records focused local unit/PG/contract/codegen/migration/API/static/demo
checks; broad local workspace typecheck was environment-blocked by unrelated web
dependencies. Clean hosted Typecheck resolves that limitation, without relabelling
local blocked checks. No new historical/current rerun was performed for this report.

## 4. Gates and deterministic scenario

| Gate | Evidence and decision |
|---|---|
| G0 | PASS per recorded implementation prerequisite check; dependencies merged/compatible |
| G1 | PASS — corrected-head and corrective-merge Typecheck, lint capability; architecture guard in project gate |
| G2 | PASS — real clean/repeated PostGIS migrations and schema v2 compatibility |
| G3 | PASS — corrected-head/merge full Unit, org rules and idempotency |
| G4 | PASS — real PG HTTP/hierarchy/rollback and hosted runtime integration |
| G5 | PASS — canonical OpenAPI and generated mutation clients/drift |
| G6 | PASS — four catalogued events and atomic producer outbox |
| G7 | PASS — unauthenticated/permission/tenant-negative checks |
| G8 | N/A — no mobile/offline queue added; server replay idempotency covered |
| G9 | PASS — actor/correlation/causation/audit/outbox transaction assertions |
| G10 | PASS — deterministic hierarchy/create/replay/rollback integration scenario |
| G11 | PASS for applicable security/architecture tests; no assigned separate performance/chaos budget |
| G12 | PASS on this report's publication — implementation/correction merged, exact push CI success, CR #17 completed; approved report path |

Scenario: create tenant, organization, parent/child unit and site; read hierarchy;
replay same command; reject cross-tenant/invalid hierarchy; force outbox insertion
failure and assert no partial business/idempotency state. Fixture identifiers are
isolated; decisions assert relations/counts, not wall-clock values. Source artifacts:
apps/api/test/org.unit.test.mjs and org.integration.test.mjs at corrected merge.

## 5. Limitations and verdict

No physical device, WAN or production deployment certification is claimed. No broad
CR #30 closeout, other missing report, or unobserved historical check is implied.
The original dirty checkout was untouched. WP49-011 implementation exit is PASS;
its missing report is supplied here, and DONE is effective once this evidence-only
report is merged with successful required checks and exact post-merge CI.
