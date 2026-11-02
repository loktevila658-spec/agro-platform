# WP49-025 Completion Report — Master Data core

Date: 2026-11-02 (Europe/Moscow). Branch: codex/wp49-025-master-data.
Status: **DONE**. All applicable G0–G12 PASS. This report-only update records
the completed implementation closeout; it changes no runtime code or frozen scope.

- Implementation [PR #63](https://github.com/loktevila658-spec/agro-platform/pull/63),
  tested head `5e53fbac7c638fb3332a1f0a6468d9438cf3dd10`.
- Exact-head [run 41354805870](https://github.com/loktevila658-spec/agro-platform/actions/runs/41354805870),
  all eight required jobs completed SUCCESS.
- Ordinary two-parent implementation merge `73591bc241a4a64d76cbf62cd32dd87259ec2216`, pre-merge baseline
  `961b8a5421155e5fe42226dc2666bfddcb77fb59`; merge tree equals tested-head tree.
- Exact merge-SHA event=push
  [run 41355973494](https://github.com/loktevila658-spec/agro-platform/actions/runs/41355973494),
  all eight jobs completed SUCCESS, individually observed including full Unit,
  Migration, Runtime, Mobile/native Android and aggregate.
- [Final DONE/G0–G12 closeout](https://github.com/loktevila658-spec/agro-platform/issues/62#issuecomment-6583684194),
  CR #62 CLOSED/completed. Required review/findings/protection and exact28-path
  diff/frozen-manifest checks cleared; no auto-merge/bypass or independent review claim.
- WP024 report-only PR #60 merged `961b8a5421155e5fe42226dc2666bfddcb77fb59`,
  exact-head41353582321 and exact push41354560401 all8 SUCCESS, CR #58 stays closed.
  WP011 report PR #61 merged `b62830ef3e7a673d5b5990e6a44b81ade12e72b9`,
  exact-head41352405133 and exact push41353416415 all8 SUCCESS.

Final hosted exact-head/post-merge checks resolve the disclosed local Docker/Flutter
verification limits. API126/126, contracts20/20, config17/17, connectors2/2,
root regressions15/15 and migration units5/5 PASS; no skipped API tests.
The real-PG deterministic scenario and immutable policy upgrade/restart tests pass.
Mobile unit tests and native Android scenario pass; this does not certify physical
devices or production WAN/TLS/1C deployments. Failed earlier attempts remain below.

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
Its initial Mobile failure was hosted system-image installation `No space left on
device`, before Android test launch; unchanged failed-job retry and strict-base
update were followed by the successful exact-head/post-merge runs above. No gate bypass or CR reopening. These report-only checks
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
merge-SHA hosted full Unit/Migration/Runtime/Mobile/native Android have passed.

Deterministic fixture scenario uses only test-specific values, source observation
2026-11-02T00:00:00Z, explicit expected versions; generated IDs isolate runs rather
than determine business decisions. It covers tenant/org uniqueness, races, one-effect
replay, stale/concurrent correction, original history, deactivation, unit semantics,
forced audit/outbox rollback, revoked permission, cloud rejection, explicit mock
external field ownership, GUID aliases/collision/actionable mismatch, and actual
WP016 outbox/inbox failure/retry/replay. Successful real-PG demo output was observed in hosted CI; G10 PASS.

| Gate | Final decision |
|---|---|
| G0 | PASS — compatible merged dependencies, reports/closed CRs/exact push evidence |
| G1 | PASS — final typecheck/architecture11/11, contracts, lint capability and exact diff |
| G2 | PASS — real clean/repeated/current/checksum-invalid v11 migrations/API |
| G3 | PASS — targeted43/43 and hosted full Unit/API126/126, no skips |
| G4 | PASS — real PG owner/core/framework integration and full runtime |
| G5 | PASS — compatible HTTP, exact event contracts and all4 generated outputs/drift |
| G6 | PASS — actual atomic revision/outbox/idempotency rollback, WP016 inbox retry/replay |
| G7 | PASS — deny by default, current/revoked permissions, tenant/org/source negatives |
| G8 | PASS for applicable regressions — unchanged sync/mobile/native Android; no new offline write workflow |
| G9 | PASS — immutable before/after revision chain, reason/version/source policies/import provenance and aliases |
| G10 | PASS — deterministic real PostgreSQL/mock-field/mapping/fault scenario |
| G11 | PASS — source/security/type/bounds negatives and unchanged full performance/offline budgets |
| G12 | PASS — exact28 approved paths/report, clear findings/checks, ordinary merge/exact push success, completed CR |


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

Final input review also rejects impossible calendar dates and 24:00 timestamps,
which Date.parse would otherwise normalize; negative tests pass. Final exact-head/
merge/run/CR evidence is recorded above after observation. All
applicable gates passed before completed CR closure. No subsequent WP is started
in this closeout. This report-only reconciliation uses the already approved report
path and does not reopen the CR or re-audit implementation.
