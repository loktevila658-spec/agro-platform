# WP49-028 Completion Report — Field & FieldSeason

Status: IN PROGRESS; not DONE. Date: 2026-11-03 Europe/Moscow.
Baseline main: `1a09fd46437a886e22cb7cc01507ac08116f3692`.
Branch: codex/wp49-028, separate initially clean worktree; original dirty checkout untouched.
Scope CR: [#72](https://github.com/loktevila658-spec/agro-platform/issues/72).
[Explicit owner approval record](https://github.com/loktevila658-spec/agro-platform/issues/72#issuecomment-6599968834).

## Prerequisites and scope

G0 PASS before code. Frozen manifest matches requested id/title/W3/MVP/dependency,
literal `/apps/api/modules/farm` and exit criterion separating parcel/Field/FieldSeason
with split/merge history. It remains unchanged, including static NOT_STARTED.
Dependency WP027 report merged, CR69 completed, PR70 ordinary merge
5f08a7bed35484e6ad6ca7bb49edd06194936ac7 exact push41594731257 all8 SUCCESS;
report PR71 merge1a09fd46437a886e22cb7cc01507ac08116f3692 exact push41606516160
all8 SUCCESS. Exact run event/SHAs/jobs and ancestry checked. Compatible schema13.
Source precedence and current repository governance were read; no latest-document-wins.

Pre-code inspection found literal frozen directory excluded by src-only compiler.
One complete29-path scope request covers compiled module, owner query integration,
registration, migration/current schema, exact event/action regressions, four generated
outputs and evidence. Owner classified only the reduced request PUBLIC, publication72
was permitted and independently matched byte-for-byte. A delegated-approval attempt
was rejected; direct owner approval was then obtained and recorded before code.
No implementation preceded approval. No compiler/Docker/CI/glob/package/fixture change.

## Changed files / approved scope

| Path | Purpose | Authorization | Verification |
|---|---|---|---|
| apps/api/src/modules/farm/farm.types.ts | Field, AgriculturalSeason, FieldSeason, allocation and lineage command contracts | CR-0028 additional | Typecheck/domain tests |
| apps/api/src/modules/farm/farm.validation.ts | Strict identity/area/date/effective/provenance validation | CR-0028 additional | Negative unit tests |
| apps/api/src/modules/farm/farm.registry.ts | Current server policy, tenant identity, deny by default | CR-0028 additional | Permission negatives |
| apps/api/src/modules/farm/farm.service.ts | Owned commands, versioned corrections, N:M allocations, approved GIS refs, FieldSeason uniqueness, atomic split/merge DAG and effects | CR-0028 additional | Real PostGIS deterministic integration |
| apps/api/src/modules/farm/farm.module.ts | Compiled Nest composition and bounded pool | CR-0028 additional | Build/runtime |
| apps/api/src/modules/farm/README.md | Authority, requirement mapping, compatibility, limits | CR-0028 additional | Review |
| apps/api/src/modules/land/land.service.ts | Narrow permission-checked transaction-bound LandPlot reference query | CR-0028 additional | Farm integration/tenant/ownership |
| apps/api/src/modules/gis/gis.service.ts | Narrow approved-as-of version query for operational reference binding | CR-0028 additional | Approval/effective/tenant negatives |
| apps/api/src/app.module.ts | Register compiled FarmModule | CR-0028 additional | Build/runtime |
| database/migrations/0014_field_field_season.sql | Owned fields/seasons/revisions/allocations/lineage/audit/receipt/outbox, tenant constraints and event source CHECK | CR-0028 additional | Clean/repeated migration/PostGIS |
| apps/api/src/schema-version.service.ts | Expected schema14 | CR-0028 additional | Schema tests |
| apps/api/test/schema-version.test.mjs | Current14/ahead15, keep all negatives | CR-0028 additional | Unit |
| apps/api/test/identity.integration.test.mjs | Current schema assertion13->14 only | CR-0028 additional | Regression |
| database/test/migrate.test.mjs | Contiguous14 and immutable Farm schema assertions | CR-0028 additional | Migration unit |
| database/test/database.integration.test.mjs | Clean/repeated/count/current14 and Farm schema checks | CR-0028 additional | Real PostGIS |
| apps/api/test/farm.unit.test.mjs | RED shape/domain/registry/runtime/boundary acceptance | CR-0028 additional | Existing test/*.test.mjs glob |
| apps/api/test/farm.integration.test.mjs | RED actual database/owner/season/allocations/lineage/concurrency/rollback/delivery deterministic scenario | CR-0028 additional | Hosted full Unit |
| apps/api/test/permissions.test.mjs | Append exact Farm actions; preserve registry equality and prior negatives | CR-0028 additional | Permission regression |
| apps/api/src/modules/events/events.types.ts | Explicit farm producer source | CR-0028 additional | Typecheck |
| apps/api/src/modules/events/outbox-dispatcher.service.ts | Farm discovery/load via existing inbox/retry protocol | CR-0028 additional | Actual retry/replay |
| events/catalog/index.yaml | Add farm.entity.changed@1 metadata envelope | CR-0028 additional | Contract validation |
| permissions/catalog.yaml | Explicit field/season actions, no default grants | CR-0028 additional | Permission tests |
| packages/contracts/src/generated/contracts.ts | Regenerated additive event contract | CR-0028 additional | Codegen drift |
| packages/contracts/generated/dart/contracts.dart | Regenerated additive event contract | CR-0028 additional | Codegen drift |
| packages/contracts/generated/manifest.json | Generated hashes | CR-0028 additional | Codegen drift |
| apps/mobile/lib/generated/contracts.dart | Existing generator output only | CR-0028 additional | Codegen/mobile regression |
| packages/contracts/test/contracts.test.mjs | Append exact event, retain previous assertions | CR-0028 additional | Contract regression |
| tests/contracts.test.mjs | Append exact event, retain previous assertions | CR-0028 additional | Root regression |
| tests/evidence/WP49-028_COMPLETION_REPORT.md | G0-G12, full matrix, exact head/PR/merge/CI/CR and closeout | CR-0028 additional | Evidence review |


## Implementation and compatibility

Separate operational Field, registered explicit AgriculturalSeason and FieldSeason;
reasoned immutable effective revisions and N:M time-scoped parcel allocations.
GIS-approved immutable version refs resolve via its owner query; parcel refs through
Land owner query. No foreign writes or copied geometry, cadastral/legal inference,
implicit season values, public HTTP route/OpenAPI, UI feature or later work package.
Split and merge create explicit new targets, archive sources, retain historical
provenance and record acyclic lineage without transferring seasonal records/facts.
Commands require Local authority, current server policy, tenant/org validation,
shared version guards, actor-bound idempotency, transaction, audit and outbox.
Additive schema14; nine explicit actions without grants; farm.entity.changed@1.0.0
metadata event and existing dispatcher/inbox. Four codegen artifacts regenerated.

## Tests / deterministic scenario

RED unit/integration fixtures written before runtime; both failed missing Farm compiled
module as expected, no domain-rule failure claimed. Targeted47/47 PASS after build:
Farm/Land unit, permission/schema, migration and root/package contract regressions.
Contract validation/codegen drift PASS. Local Docker probe failed Desktop unable to
start; no local real-PG/runtime PASS. Hosted exact-head evidence pending.

Fixed source/effective timestamp2026-11-03T00:00:00Z, explicit fixture business-year
and noncalendar date range. Scenario covers parcel+approved geometry+allocation,
separate seasonal identity, duplicate year, effective correction/concurrency,
tenant/org/site/current policy/cloud denials, split+merge DAG, immutable history,
fault-injected rollback and actual delivery retry/replay. No production seed data.

| Gate | Current evidence |
|---|---|
| G0 | PASS — merged compatible dependency/exact CI and scope approval before code |
| G1 | PENDING full static/architecture |
| G2 | PENDING real clean/repeated schema14 |
| G3 | Targeted47/47 PASS; full suite PENDING |
| G4 | PENDING real infrastructure |
| G5 | PASS local contract validation/codegen; full CI PENDING |
| G6 | PENDING real atomic outbox/inbox retry/replay |
| G7 | Unit negatives PASS; integration PENDING |
| G8 | PENDING unchanged applicable offline/native regressions; no new sync workflow |
| G9 | PENDING real immutable correction/audit/allocation/lineage scenario |
| G10 | PENDING actual deterministic PostGIS scenario |
| G11 | PENDING applicable negative/security/full regressions |
| G12 | PENDING review/precise head checks/ordinary merge/exact push/report/CR closeout |

## Limitations / unlock decision

Trusted current policy composition defaults deny until installed. No new public route,
provider, UI, crop catalog/FieldCrop/operations/plans, new mobile sync or WP029.
Historical records retained; no retention/purge or production/WAN/device certification.
Field code/org and seasonal business year are identity attributes in this slice;
corrections retain identity and append metadata revisions. Bounds1000 allocations or
lineage inputs/outputs are deployment limits. Farm writers currently serialize by
tenant; no Field-specific throughput SLA invented. Local Docker limit requires hosted
real-infrastructure evidence. WP028 not DONE; WP029 not started.
