# WP49-031 Completion Report

Status: IN PROGRESS. This report does not assert DONE before final exact-head,
ordinary merge, post-merge CI and governance closeout.

Baseline `5df078ef543d7dfda0ae3ddee8f85404de1fe9de`, branch codex/wp49-031,
separate clean worktree; original dirty checkout untouched.
Scheduling decision [CR75](https://github.com/loktevila658-spec/agro-platform/issues/75),
explicit owner scope and PUBLIC publication authorization
[CR76 comment6616269717](https://github.com/loktevila658-spec/agro-platform/issues/76#issuecomment-6616269717).
Frozen manifest is unchanged. Only WP031 implementation is active; WP029 waits.

## Prerequisites

WP013 report/PR23 merge0c648d51e419827edc27c508826ae9b0c9615033, exact push38610630581
all7 SUCCESS; report PR24 merge715ecb50cbb465a7088be2a4ef1eb8947a0ffdce,
exact push38612576311 all7 SUCCESS; CR22 closed/completed with closeout6175090309.
WP020 merged/accepted exact push40724649127 all8 SUCCESS, CR50 completed.
WP028 implementation/report exact push41689928078/41701826258 all8 SUCCESS,
CR72 completed. Main unchanged, so accepted WP020/028 evidence reused.
Existing sync schema1, encrypted mobile schema2 and backend schema14 are compatible;
Task adds backend schema15 without rewriting historical migrations.

## Implementation

Task owner uses documented WorkOrder transitions, explicit assignments with trusted
employee-to-user resolution, permission policy, immutable manual completion facts,
transition before/after audit and task.changed outbox. Existing versioned SyncHandler
transaction performs state/version validation and canonical mutation; HTTP wraps the
same receipt/feed command path. Generated task projection/API permits future GIS use.
Default deny persists until trusted deployment policy is installed. No fake tasks.

Mobile reads canonical Task cache and overlays only durable pending intent, uses
existing verified grants/command queues, preserves errors/conflict evidence, and
chains valid offline execution intents without changing canonical cache. Android
native acceptance is required. iOS N/A for current support profile under DOC20
NFR-MOB-001/current Android release/CI, not an iOS support claim.

## Gate status before hosted acceptance

| Gate | Result |
|---|---|
| G0 | PASS — dependency evidence and explicit pre-code scope approval |
| G1 | Local workspace typecheck/architecture11 PASS; Dart3.13.7 format PASS; Flutter analyzer pending hosted |
| G2 | Migration unit PASS; real clean/repeated schema15 pending hosted |
| G3 | Local targeted42 PASS; mobile/widget pending hosted |
| G4 | Real PostGIS/HTTP task scenario pending hosted |
| G5 | Additive canonical API/events/codegen drift and exact old/new expectations PASS locally |
| G6 | Actual task receipt/feed/outbox/inbox retry/replay pending hosted |
| G7 | Local policy/default-deny unit PASS; real tenant/revoke negatives pending hosted |
| G8 | Offline local queue/reopen/conflict/native and actual convergence pending hosted |
| G9 | Immutable Task transition/fact provenance implementation; real rollback tests pending hosted |
| G10 | Deterministic task scenario pending hosted |
| G11 | Current Android native/security/isolation acceptance pending hosted; iOS N/A |
| G12 | PENDING — review, full changed-path inventory, exact PR checks/merge/post-merge/CR closeout |

## Limits and verification

Local Docker probe returned `Docker Desktop is unable to start`; no repeated startup
loop or local PostGIS PASS is claimed. Local Flutter SDK unavailable; Dart3.13.7 was
installed only in temp for format, with missing flutter_lints package warning. Hosted
unchanged project workflow supplies real infrastructure and full Flutter/native gates.
No CI, compiler, dependency, lockfile, generator or shared sync changes requested.
No production provider/credentials, WP029/030, universal task machine, foreign writes,
accounting/payroll, material ledger or agronomy expansion. Material-consumption input
rejects explicitly. Unsupported external reference families do not become fake facts.
Historical execution is immutable; RETURNED is explicit and does not invent a future
correction workflow. No production/WAN/physical-device certification is claimed.

The full final changed-path table and observed PR/CI/merge evidence will be reconciled
in this already approved report path before final acceptance/closeout.


## Complete approved changed-path inventory

| Path | Purpose | Owner | Verification |
|---|---|---|---|
| apps/api/src/app.module.ts | Register task module | Application composition | Build/runtime |
| apps/api/src/modules/events/events.types.ts | Explicit tasks event source | Platform events | Typecheck |
| apps/api/src/modules/events/outbox-dispatcher.service.ts | Task outbox discovery/loading through existing delivery protocol | Platform events | Actual inbox retry/replay |
| apps/api/src/modules/farm/farm.service.ts | Narrow transaction-bound authorized task-target reference query | Farm | Tenant/owner reference negatives |
| apps/api/src/modules/tasks/README.md | Contract ownership and integration limitations | Tasks | Review |
| apps/api/src/modules/tasks/tasks.controller.ts | Authenticated versioned task HTTP boundary | Tasks | Real HTTP contract |
| apps/api/src/modules/tasks/tasks.module.ts | Task application composition and pool lifecycle | Tasks | Runtime/build |
| apps/api/src/modules/tasks/tasks.registry.ts | Current task permission/scope policy | Tasks | Deny/revoke/tenant |
| apps/api/src/modules/tasks/tasks.service.ts | Owned lifecycle/assignment/execution transaction and immutable facts | Tasks | Real PostGIS/rollback/replay |
| apps/api/src/modules/tasks/tasks.sync.ts | Existing sync handler/projection/grant/file policy bindings | Tasks | Retry/conflict/convergence |
| apps/api/src/modules/tasks/tasks.types.ts | Versioned task application contracts | Tasks | Contract/unit |
| apps/api/src/modules/tasks/tasks.validation.ts | Task input and transition validation | Tasks | Negative unit |
| apps/api/src/schema-version.service.ts | Expected current schema15 | Schema contract | Schema unit/runtime |
| apps/api/test/identity.integration.test.mjs | Current schema assertion14 to15 only | API tests | Integration regression |
| apps/api/test/permissions.test.mjs | Add exact task actions retaining all prior assertions | Permission tests | Negative regression |
| apps/api/test/schema-version.test.mjs | Current/ahead version assertions preserving negatives | API tests | Unit |
| apps/api/test/tasks.integration.test.mjs | Real owner/HTTP/lifecycle/offline replay/conflict/delivery deterministic scenario | Tasks tests | Existing test/*.test.mjs |
| apps/api/test/tasks.unit.test.mjs | Domain/transition/validation/policy fixtures | Tasks tests | Existing test/*.test.mjs |
| apps/mobile/integration_test/tasks_test.dart | Native encrypted workspace and queue execution/reopen | Mobile native tests | Existing Android integration_test glob |
| apps/mobile/lib/features/tasks/task_commands.dart | Owner-defined command drafts/local validation; no parallel queue | Mobile tasks | Grant/state/intent tests |
| apps/mobile/lib/features/tasks/task_repository.dart | Typed cached task reads and existing command queue binding | Mobile tasks | Unit/offline |
| apps/mobile/lib/features/tasks/tasks_page.dart | Task list/details and permitted execution/conflict state | Mobile tasks | Widget |
| apps/mobile/lib/generated/contracts.dart | Existing generator output identical to shared Dart | Contracts generation | Codegen drift/analyzer |
| apps/mobile/lib/main.dart | Authenticated route/workspace/worker integration | Mobile shell | Widget/native |
| apps/mobile/test/tasks_offline_test.dart | Durable restart/retry/revoke/conflict/receipt behavior | Mobile tests | Existing flutter test glob |
| apps/mobile/test/tasks_page_test.dart | Task lifecycle UI and conflict/error visibility | Mobile tests | Existing flutter test glob |
| apps/mobile/test/tasks_repository_test.dart | Cache/intent/isolation/grant tests | Mobile tests | Existing flutter test glob |
| database/migrations/0015_task_work_order.sql | Task-owned storage, immutable execution/audit/receipts/outbox and event-source compatibility | Tasks/platform events | Clean/repeated migration |
| database/test/database.integration.test.mjs | Clean/repeated schema15 and task constraints | Database tests | Real PostGIS |
| database/test/migrate.test.mjs | Contiguous schema and task migration assertions | Database tests | Migration unit |
| events/catalog/index.yaml | Versioned task event metadata | Contracts | Catalog validation |
| openapi/openapi.yaml | Canonical task payload/projection/command HTTP schemas | API contracts | OpenAPI/codegen compatibility |
| packages/contracts/generated/dart/contracts.dart | Existing generator output | Contracts generation | Drift |
| packages/contracts/generated/manifest.json | Generator hashes | Contracts generation | Drift |
| packages/contracts/src/generated/contracts.ts | Existing generator output | Contracts generation | Drift |
| packages/contracts/test/contracts.test.mjs | Add task operation/event expectations without weakening old checks | Contract tests | Regression |
| permissions/catalog.yaml | Explicit task action registration; no default grants | Permissions | Deny-by-default regression |
| tests/contracts.test.mjs | Add exact canonical expectations retaining old checks | Root tests | Regression |
| tests/evidence/WP49-031_COMPLETION_REPORT.md | G0–G12 evidence, full paths, actual CI/merge/closeout | Evidence | G12 |


## Acceptance findings and execution history

Initial run41727130117 on076a973 FAILED: ambiguous UUID/text placeholder in task
transition insert and Flutter lint findings. No threshold/assertion was weakened.
Later source revisions corrected conditional quantity policy, resource validation,
canonical receipt/pull ordering, conflict visibility, event recipients, HTTP status
and URI conventions, read pagination, immutable command/device provenance and
current organization-scope rechecks on Create replay. Domain-provided quantity/unit
policy is explicit; omitted priority uses the documented50 default.

Runs41727695087/41728137383/41728332040/41728536223/41728638943/41728971421/
41729387158 were superseded/cancelled after actual changes and are not full PASS
acceptance. Partial Unit173/173 success is not substitute for an aggregate result.
Run41729922835 on7afee3d FAILED only Mobile:39 successful Flutter tests, new widget
test deadlocked on real Drift I/O in the fake-async zone and timed out at unchanged
10 minutes. All6 other jobs succeeded, including real task PostGIS/HTTP/receipt/feed
API173/173; no full-run PASS is claimed.
The test now controls only I/O scheduling, calls the actual repository/queue/cache,
keeps its assertions and adds a durable queue-count assertion. No production domain
or persistence implementation is replaced with a fake adapter.

Local Flutter3.47.8/Dart3.13.7 was subsequently acquired from its official tag/engine.
Analyzer fatal-infos PASS. Initial local test attempts hit full disk; a single-widget
attempt then failed the unchanged encrypted-SQLite guard on the Mac host. No plaintext
fallback, crypto/check waiver or local Flutter test PASS is claimed. Temporary SDK
cache/configuration is outside the repository. Linux/Android hosted gates remain the
acceptance environment; no iOS/Mac shipping support is claimed. Frozen lockfile package
versions/hashes are unchanged; automatic quote-only pub serialization was restored.

Task reference provenance is limited to owner IDs, kind, organization and immutable
revision; foreign field/geometry payloads are not copied into Task projections.
Task event delivery retains command participants and assignees, with current read
policy checked on pull. Scope changes use the existing platform scope-reset contract.
All39 changed paths remain within frozen mobile scope or CR76's exact additional list.
No independent reviewer is claimed; no open local blocking finding remains after
this correction batch. Final exact-head hosted acceptance and ordinary PR/merge/
post-merge/publication closeout remain required before DONE.
