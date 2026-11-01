# WP49-025 Completion Report — Master Data core

Date: 2026-11-02 (Europe/Moscow). Branch: codex/wp49-025-master-data.
Status: IN PROGRESS. No DONE claim before clear exact-head findings/required CI,
ordinary merge, exact merge-SHA push CI and completed Scope CR #62 closeout.

## 1. G0 and frozen authority

Initial clean implementation baseline: independently verified live main
`f20d89c48ff5fc3b753548f785961e9578c19b28`. Worktree created only after G0 PASS
and exact complete scope approval, at /private/tmp/agro-wp49-025-master-data.
Original dirty checkout was untouched. Later evidence-only WP011 PR #61 merged
`b62830ef3e7a673d5b5990e6a44b81ade12e72b9`, fast-forwarded before implementation
commit. Reports/CR comments distinguish implementation evidence from report CI.

Implementation order W3 starts WP025. Manifest/DOC49/build graph agree on direct
011/014/015/016. Static statuses never establish evidence. Verified dependencies:
- WP011 PR #18 merge2b73b00a194738ea5a0e93501cdeb8b71608b93c; readiness correction
  PR #19 mergec66da8d67c019ca4a91556ff2289ed194040c13a. Actual exact push
  [38366585524](https://github.com/loktevila658-spec/agro-platform/actions/runs/38366585524)
  all7 then-required jobs SUCCESS; CR #17 CLOSED/completed. Missing report produced
  in PR #61 under prior CR #30 approved evidence path; now merged. Old proposal
  incorrectly called PR run38366351744 post-merge; the new report preserves that
  distinction and the initial failed38365014594 rather than relabelling failures.
- WP014 merged report, PR #27 merge716d745a585615331cb63f036fadab467daf81fb,
  exact push38633756492 all7 SUCCESS; report/final governance PR #28/#29, CR #25/#26
  CLOSED/completed. Local blocked historical Compose is not claimed PASS.
- WP015 merged report, PR #32 merge92a98de5aa0078941e2842a3bcf3ba41f0f07f34,
  exact push38654141205 all7 SUCCESS; report #33/final #34 and CR #31 completed.
- WP016 merged report, PR #37 merged814ba0f768c9f9ba216954d2c9ec3e1708fb508,
  exact push38663300581 all7 SUCCESS; report/final #38/#39, CR #35 completed.
All four exact push events/SHAs/conclusions/jobs and final closed CRs independently
checked. Contracts/schema remain compatible; all dependency merges are ancestors.

Prior wave WP024: live SHA matches owner's expected f20d89c…, CR #58 closed
completed, final DONE/G0–G12 comment6564065197 and exact push41350936656 all8
SUCCESS confirmed without re-auditing implementation. Report-only PR #60 changes
only its already approved Completion Report to reflect those fulfilled facts.
Its initial Mobile failure is hosted system-image installation `No space left on
device`, before Android test launch; unchanged failed-job retry, then strict-base
update proceed normally. No gate bypass or CR reopening. These report-only checks
are separate from already established WP024 implementation/dependency closeout.

Authority: DOC50 execution > DOC48 scope/release/RTM > DOC47 reconciliation/REV47
field SoT > DOC49 graph; DOC10 common/UOM/item/external-link fields, DOC11 core/org
rules, DOC13 integration directions/mapping, DOC23 field policy/provenance/history.
No latest-document-wins. MVP shared references do not promote V1/V1.5 classifiers,
imports, inventory/production/quality features or broader governance tooling.

Frozen manifest byte-identical, literal path not normalized:
```yaml
depends_on:
- WP49-011
- WP49-014
- WP49-015
- WP49-016
allowed_paths_raw: /apps/api/modules/master-data
exit_criteria: materials, products, units, external codes, provenance.
```

## 2. Complete pre-code scope

[Scope CR #62](https://github.com/loktevila658-spec/agro-platform/issues/62)
contains the complete pre-code 27-path matrix and each file's purpose, after the
full compiler/runtime/Nest/Docker/tenant/org/auth/audit/command/events/integration/
mock1C/schema/codegen/test-glob/CI pass. Delegated owner approval comment6564206128
precedes worktree/code. G0 decision6564253010 corrects an unnecessary self-imposed
wait for separate report-only merge: project rules require merged dependency
implementation, passed gates and produced report, not an invented extra report
merge condition. Report #61 was already produced/published at that decision and
its implementation/corrective merge/exact CI/closed CR were confirmed. No gate
waiver or permission inferred from static statuses; unrelated broad CR #30 stays open.

API includes src/**/*.ts, literal frozen path is uncompiled. Approved compiled
runtime path and explicit Nest registration are used. Existing test wildcard
includes all new tests. Full current-schema search found only four existing test
files requiring expectations (API schema/identity, database migration unit/integration).
Historical applied-migration assertions stay unchanged. New catalog events require
explicit dispatcher/source CHECK expansion, strict contract arrays and all four
existing generated outputs together. No OpenAPI endpoint, generator change, CI,
script, dependency/lock, compiler, shared config or UI/mobile workflow change.

## 3. Delivered core and field SoT

| Fields/aspect | Canonical owner / SoT |
|---|---|
| Material UUIDv7/tenant/organization scope | master-data / PLATFORM Local Primary, independent of external IDs |
| code/name/itemType/baseUom/active | master-data operational references / PLATFORM, with explicit trusted field override only; local edits of external-owned fields denied |
| Product | FINISHED Material over same canonical identity, no duplicate product/inventory store |
| UOM code/name/dimension/precision | master-data/Formula Owner reference semantics, explicit field policy; no invented values/conversions |
| accountingCode | external-owned projection, ONE_C only when explicitly selected; never universal Material authority or accounting ledger |
| gtin | external-owned identifier projection, not canonical PK |
| external profile/type/ID/alias/provenance | integrations external_link/link_revision through owner/query contracts, no parallel mapping store |
| revision/rowVersion/current snapshot/actor/time/command/provenance | master-data server metadata with immutable source policy and linked historical versions |

Trusted bootstrap installs current permission callback (deny by default, errors
also deny) and immutable tenant policy with explicit business owner/steward/version.
No names, catalogs, units, material data or production profiles seeded. Policy
snapshots/fingerprints are persisted; changed same version/stale policy fails.
Each revision records changed-field sources; one accountingCode source never
assigns whole-object authority. Local/external permissions are rechecked on replay.

Commands require LOCAL_PRIMARY, strict fields, tenant/composite organization/UOM
relationships, same-scope unique codes, canonical UUIDv7, optimistic expectedVersion
and reason for corrections. Shared command guard runs under transaction locks.
Idempotency reservation/current row/revision audit/metadata event/stored exact
response commit atomically. Failed revision/outbox rolls back all effects. Updates
retain previous revision and original snapshots; deactivation preserves history.
Unit code and identity are immutable; in-use dimension/precision cannot silently
reinterpret history. No destructive delete/merge/fuzzy dedup or conversion arithmetic.

Provider-neutral external owner port requires existing transaction, matching tenant/
kind/operation, current permissions, exact field source profile/version, existing
canonical UUID, expected local version/reason, observedAt and source provenance.
Import provenance, when present, requires complete batch/fileHash/sourceRow triple.
It registers no production handler/profile by default. WP021 owns staging, mapping,
receipts, retry/actionable errors and external links; WP022 mock skeleton is unchanged.
Tests compose only ONE_C_MOCK with explicit fixture binding. No production exchange,
provider protocol, wholesale catalog import or invented import policy is installed.

Narrow framework metadata expansion permits many external aliases per canonical
record while keeping unique tenant/profile/type/external key. Old GUIDs resolve to
the same UUID. A collision to a different canonical UUID rolls back owner revision/
audit/outbox and remains ACTION_REQUIRED with original staging evidence. Master-data
reads external mappings through new permission-checked integration query contracts;
its runtime never writes or reads foreign authoritative tables directly.

Schema11 owns unit/material/source_policy/revision/command_idempotency/outbox_event.
Revision snapshots form immutable audit/correction chain, not direct platform_audit
writes. New master_data.unit.changed/material.changed@1.0.0 catalog events are
metadata-only and discovered by WP016 with existing lease/retry/inbox dedup. Current
org/identity contracts/consumers remain compatible, no new product/replica consumer.
Schema/HTTP compatibility expands forward-only; no purge or destructive DOWN.

## 4. Exact approved changed files (28)

| Path | Function |
|---|---|
| apps/api/src/modules/master-data/master-data.types.ts | Shared core command/actor/field policy/revision contracts and actions |
| apps/api/src/modules/master-data/master-data.validation.ts | Strict field/provenance/version/UUIDv7/size validation, exact known enums |
| apps/api/src/modules/master-data/master-data.registry.ts | Trusted fail-closed permission and immutable attribute source policies, no default external profiles |
| apps/api/src/modules/master-data/master-data.service.ts | Local commands/queries, current/version/history, idempotency, correction/deactivation, guarded external owner-command port and existing integration mapping queries |
| apps/api/src/modules/master-data/master-data.module.ts | Compiled bounded pool lifecycle, registry/service composition with integration application port |
| apps/api/src/modules/master-data/README.md | Field ownership/SoT, scope, provenance/corrections/policies, deployment compatibility and limits |
| apps/api/src/app.module.ts | Actual compiled Nest module registration |
| apps/api/src/modules/integrations/integrations.service.ts | Permission-checked external-reference query contracts over existing owned mappings/history, no foreign SQL |
| apps/api/src/modules/events/events.types.ts | Add explicit master-data EventSource |
| apps/api/src/modules/events/outbox-dispatcher.service.ts | Discover/load master-data producer outbox, preserve org/identity semantics and inbox dedup/retry |
| database/migrations/0011_master_data_core.sql | Add owned unit/material/revision/idempotency/outbox and immutable histories; narrowly expand events-owned source CHECK and integrations-owned alias cardinality, preserve unique external key/no foreign facts |
| apps/api/src/schema-version.service.ts | Expected schema 11 |
| apps/api/test/schema-version.test.mjs | Current11/ahead12 with behind/malformed retained |
| apps/api/test/identity.integration.test.mjs | Full-chain current-version assertion10->11 only |
| database/test/migrate.test.mjs | Contiguous v11, new owned tables/constraints/immutable/no foreign authoritative writes |
| database/test/database.integration.test.mjs | Clean/repeated/current/count/API v11/new schema, all invalid-state cases retained |
| apps/api/test/master-data.unit.test.mjs | Source policy/default deny/strict fields/version/provenance/UUID/Nest registration contracts |
| apps/api/test/master-data.integration.test.mjs | Real PG tenant/org/uniqueness/concurrency/idempotency/stale/rollback/audit/correction/immutability/unit-reference/product/shared-mapping/source-policy/owner port/mock/reconciliation/outbox-inbox deterministic scenario |
| events/catalog/index.yaml | Versioned master_data.unit.changed and master_data.material.changed metadata contracts, producer master-data, no invented consumers |
| permissions/catalog.yaml | Internal tenant-scoped read/write/correct/external attribute actions, no role grants |
| packages/contracts/src/generated/contracts.ts | Regenerate canonical event definitions |
| packages/contracts/generated/dart/contracts.dart | Regenerate canonical event definitions |
| packages/contracts/generated/manifest.json | Generated source/output hashes |
| apps/mobile/lib/generated/contracts.dart | Existing generator's mobile output, no mobile feature change |
| packages/contracts/test/contracts.test.mjs | Keep exact existing event assertions and append exact two new definitions |
| tests/contracts.test.mjs | Keep exact existing root event assertions and append exact two new definitions |
| tests/evidence/WP49-025_COMPLETION_REPORT.md | G0/full scope/field ownership/implementation/tests/gates/limits and exact closeout evidence |

| apps/api/test/permissions.test.mjs | Approved amendment in CR #62: exact existing org and combined nine action/scope/effect assertions; retain all negatives |

## 5. Tests, demo and gates

Acceptance tests written before runtime. Unit RED: missing master-data registry;
integration initial import RED stopped first on the unbuilt baseline inbox module
(the fresh worktree had no dist). No claim that the latter exercised domain rules. API build PASS. Initial focused local unit/schema/migration/
package+root contracts37/37 PASS; after strict permission/provenance additions,
final focused43/43 PASS; full static typecheck/architecture11/11, contract
validation/codegen drift and lint capability PASS (lint N/A, no tool configured).
Generated outputs regenerated from canonical catalog, not hand-edited.

Local targeted real PostgreSQL, full Unit, migration and runtime gates attempted
unchanged, failed before relevant database scenarios because Docker Desktop is
unable to start. Full Unit also affects unchanged integration suites; no local
full-Unit or real-PG/runtime PASS is claimed. No test skip/threshold relaxation,
destructive Docker reset or CI change. Local Flutter absent; exact-head and exact
merge-SHA hosted full Unit/Migration/Runtime/Mobile/native Android remain mandatory.

Deterministic fixture scenario uses only test-specific values, source observation
2026-11-02T00:00:00Z, explicit expected versions; generated IDs isolate runs rather
than determine business decisions. It covers tenant/org uniqueness, races, one-effect
replay, stale/concurrent correction, original history, deactivation, unit semantics,
forced audit/outbox rollback, revoked permission, cloud rejection, explicit mock
external field ownership, GUID aliases/collision/actionable mismatch, and actual
WP016 outbox/inbox failure/retry/replay. Successful real-PG demo output must be
observed in hosted CI before claiming G10 PASS.

| Gate | Current evidence / required activation |
|---|---|
| G0 | PASS — merged compatible direct implementations, reports/closed CRs/exact push evidence |
| G1 | PASS locally — typecheck/architecture/contract/diff; exact-head required |
| G2 | Pending hosted real clean/repeated/current/invalid v11 migration |
| G3 | Focused37/37 PASS; full Unit pending hosted Docker |
| G4 | Pending hosted real PostgreSQL/core/integration/runtime |
| G5 | PASS locally — unchanged HTTP, exact new event contract/codegen; hosted required |
| G6 | Pending hosted actual atomic outbox/inbox/idempotency rollback/replay |
| G7 | Unit default deny/field SoT PASS; hosted permission/tenant/owner negatives required |
| G8 | No new offline workflow; unchanged sync/mobile mandatory hosted regression |
| G9 | Pending hosted immutable correction/provenance/source policy/mapping scenario |
| G10 | Pending hosted deterministic real PostgreSQL scenario |
| G11 | Static/security negatives PASS; hosted full regression including existing performance budget required |
| G12 | Pending exact-head findings/checks, ordinary merge, exact push CI, CR #62 completed |

Initial hosted run41353718892 on08e66c6: new real-PG scenario PASS, Migration
and Runtime PASS; full Unit FAIL due exactly two old org-only full-catalog
assertions in permissions.test.mjs. This was a missed pre-code scope dependency.
Stopped before editing that path, repeated full catalog/assertion scan and recorded
one narrow amendment/approval in the same CR #62. Revised complete scope is28
paths. Original org action/scope assertions are retained against its owned subset;
exact combined9 actions/effects/scopes and master registry equality are asserted,
all old negative tests retained. No acceptance weakened or extra feature added.
Review added negative tests for persisted policy same-version conflict/restart,
explicit upgrade and stale-policy rejection, plus policy history immutability.
Review also strengthened enum input type validation (no array coercion) and RFC3339
source observation timestamp validation within already approved paths.

Hosted run41354172094 onad1b7f2 passed all original core scenarios and permission
regressions, but the added policy-history TRUNCATE assertion hit PostgreSQL's
foreign-key refusal before the immutability trigger. The fixture now requests
TRUNCATE of both referenced policy and revision tables, so the unchanged strict
IMMUTABLE expectation exercises the actual protection. It does not relax the
assertion or remove the foreign key. Failed attempt remains failed evidence.

## 6. Limits and closeout

No UI, mobile write registration/snapshot distribution, GIS/fields, inventory ledger,
batches/quality specifications, bulk import, production1C/provider protocol,
governance work queues or golden-record merges are implemented. Future domains
reuse this canonical identity/application boundary under their WPs. No reference
values or unit conversion factors invented. Default-deny trusted composition must
supply real current permission/governance/source policies; no production import
profile automatically active. Physical device/WAN/production deployments are not
certified by fixture/hosted tests. MASTER_HISTORY retains prior data; no cleanup can
delete these records. No future/FUTURE/REJECTED requirement promoted.

Final exact-head/merge/run/CR IDs and all gate decisions are recorded after actual
observation in the CR closeout and this report. Ordinary merge only after clear
findings and strict required checks, no auto-merge/admin/force/check bypass. DONE
requires all applicable G0–G12 observed, exact merge push all8 SUCCESS and completed
CR closure. This interim report does not assert that outcome yet.
