# WP49-031 Completion Report

Date: 2026-11-04 Europe/Moscow.
Status: **implementation G0–G11 accepted; DONE activates only after G12 publication
conditions below are fulfilled**. No report-only CI or closure is asserted before observation.

Baseline main `5df078ef543d7dfda0ae3ddee8f85404de1fe9de`.
Exact tested implementation/PR head `a92d6cb45863b31ae3e772c5c8a790566989a126`.
Implementation PR [77](https://github.com/loktevila658-spec/agro-platform/pull/77),
ordinary merge `07ae3230e8a514fe39a91fb580b3ca5e89037c38`.
Scope [CR76](https://github.com/loktevila658-spec/agro-platform/issues/76),
[explicit owner approval before code](https://github.com/loktevila658-spec/agro-platform/issues/76#issuecomment-6616269717).
PUBLIC publication of scope/source/tests/generated artifacts/PR/report/closeout is
explicitly authorized. Separate ordering decision [CR75](https://github.com/loktevila658-spec/agro-platform/issues/75#issuecomment-6616194392).
Original dirty checkout untouched; independent clean worktrees used.

## 1 Prerequisites and authority

G0 dependency evidence PASS before code. WP013 PR23 merge
0c648d51e419827edc27c508826ae9b0c9615033 / exact push 38610630581 all 7 SUCCESS;
report PR24 merge 715ecb50cbb465a7088be2a4ef1eb8947a0ffdce / push 38612576311 all 7
SUCCESS; CR22 completed with closeout 6175090309. WP020 report/CR50 completed,
exact push 40724649127 all 8 SUCCESS. WP028 implementation/report/CR72 completed,
exact push 41689928078/41701826258 all 8 SUCCESS. These accepted WP020/028 records
were reused while main remained unchanged; no general CI substituted for dependency evidence.
Merges are ancestors and current schema/API/sync interfaces compatible.

Read frozen execution/authority/release/gate/change-control/invariant sources.
DOC50/48/47/49 precedence applied, with task/work-order distinctions and core workflow,
data, API, offline, security and NFR contracts; no latest-document-wins. Requirement
mapping: WF02 task lifecycle; assignment/immutable execution references; DOC12 O1,
state/version conflicts and durable intent; command API/codegen; current server
permission/provenance/outbox; DOC20 Android support profile and 2k cached task budget.
No unverified MASTER ID or later agronomy requirement is claimed implemented.

## 2 Frozen and approved scope

Frozen `/apps/api/modules/tasks /apps/mobile`, dependencies and exit criterion
`task lifecycle, assignee, offline execution.` remain byte-identical, including static
NOT_STARTED (not used as noncompletion evidence). The literal API path was not
reinterpreted as compiled src: CR76 explicitly approves the needed additional paths.
Exactly 39 changed paths below, every public PR filename/blob SHA independently matched
against the reviewed local head. No compiler/CI/glob/dependency/lockfile/generator
implementation or shared sync mutation. Mobile lockfile byte-identical to baseline.

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
| apps/api/src/schema-version.service.ts | Expected current schema 15 | Schema contract | Schema unit/runtime |
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
| database/test/database.integration.test.mjs | Clean/repeated schema 15 and task constraints | Database tests | Real PostGIS |
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

## 3 Result and compatibility

Task owner implements explicit WorkOrder lifecycle and assignment, distinct from
scouting/WMS/maintenance task families. Employee-to-user resolution, operation and
unit validation, optional asset resolution and current permission/scope are trusted
server composition ports; defaults deny and unresolved references reject. No production
fixtures or implicit role grants. Field/FieldSeason references use Farm's permission-
checked transaction-bound owner query and retain only IDs/kind/org/revision, not foreign
geometry/field payloads. Other resource-owner families fail explicitly until their port exists.

Manual completion facts and before/after transition audit are immutable. Original
command payload/provenance, device/session, offline authorization reference and
command version are retained; reason does not disappear after Pause. Quantity is
conditional on the pinned operation policy; nonquantitative facts retain null qty/unit.
Decimal strings/numeric(18,6) preserve precision; priority defaults 50 per data baseline.
Closed/returned facts are not overwritten, and no future correction workflow is fabricated.

Task.<Action>@1 reuses existing SyncCommand, version guard and transaction; permission
is checked again under the task lock. HTTP endpoints use lowercase verbs and wrap the
same registered-device/scope/idempotency/receipt/feed path rather than a second writer.
Create replay rechecks the current organization scope before returning its old result.
Metadata task.changed@1.0.0 outbox uses existing dispatcher/inbox retry/replay.
Read-model recipients retain command participants/assignees so creator views converge
after executor changes; current read policy still controls each pull/PURGE. Permission
changes advance device scope through the existing platform sync contract, not foreign
policy-table writes by Tasks. Read-list pagination advances by last scanned candidate.

Expand-only backend schema 14->15: Task-owned head/immutable execution/transition/outbox,
reference constraints and event-source compatibility; migration checks/checksums retained.
Deployment runs migration before current-schema readiness; no destructive rollback.
Existing mobile schema 2/sync schema 1 unchanged. Additive API/events regenerate all four
canonical artifacts using unchanged generator. No hand-maintained protocol DTO.

Mobile uses existing encrypted workspace/cache/command and attachment infrastructure,
pinned grant verification and state preconditions. It overlays only durable pending intent;
confirmed receipts bridge a delayed pull, conflicts show canonical state, and a purged
owner is not resurrected from receipts. Original rejected/conflict evidence stays durable.
Valid O1 execution can chain offline; TTL is deployment-supplied, capped 7 days, not
silently extended. Large cache reads/signature verification are batched rather than per task.
No new crypto, queue, cloud write fallback, server fact bypass or optional-hardware requirement.

## 4 Exact validation evidence

Pre-PR [41810093126](https://github.com/loktevila658-spec/agro-platform/actions/runs/41810093126)
workflow_dispatch on exact a92d6cb... all 8 jobs individually SUCCESS.
PR [41811178705](https://github.com/loktevila658-spec/agro-platform/actions/runs/41811178705)
pull_request on the same exact head all 8 SUCCESS before ordinary merge.
Implementation merge push [41812251402](https://github.com/loktevila658-spec/agro-platform/actions/runs/41812251402)
on exact 07ae323...: all 8 jobs individually SUCCESS (event push, exact head verified).

Observed full profile: API 174/174, root 15/15, migration units 8/8, retained config/
contracts/connectors and infrastructure regressions; Flutter 40/40, no skipped acceptance;
Android debug APK and native 3/3 including OS keystore/cipher/reopen/wipe and MapLibre.
Task 2k cached-list test retains <=1s engineering assertion and checks one verification
per signed grant. Existing offline 50k/14-day profile remains intact. These engineering
runner/emulator measurements do not assert physical reference-device/battery/ANR certification.
Local targeted 42/42, workspace typecheck/architecture 11/11, API build, codegen drift,
Dart 3.13.7 format and Flutter 3.47.8 analyzer fatal-infos PASS.

Local Docker returned Desktop unable to start; no repeated Compose loop or local-PG PASS.
Mac local Flutter tests hit full disk, then the unchanged encrypted-SQLite guard. No
plaintext fallback or local native-test PASS claimed. Temporary SDK acquisition/CPU
probe issues were diagnosed without changing project gates; task-created caches were
cleaned. Hosted Linux/Android supplies actual applicable acceptance instead.

## 5 G0–G12

| Gate | Result and evidence |
|---|---|
| G0 | PASS — accepted compatible dependency reports/merges/exact CI and explicit pre-code CR76 approval |
| G1 | PASS — typecheck/architecture 11, enforced format/analyzer/lockfile, exact approved 39-path diff; lint N/A where no configured linter |
| G2 | PASS — real clean/repeated/current schema 15 and immutable migration checks |
| G3 | PASS — targeted 42 and full API 174/Flutter 40, no skipped acceptance |
| G4 | PASS — real PostGIS owner/HTTP/receipt/feed/rollback integration plus retained full infrastructure/runtime |
| G5 | PASS — additive canonical API/codegen/old+new exact contract expectations; all generated copies current |
| G6 | PASS — Task fact/audit/outbox/receipt/feed atomicity, actual dispatcher/inbox failure/retry/replay |
| G7 | PASS — default/current/revoked organization scope on replay, tenant/owner/resource negatives and cache PURGE |
| G8 | PASS — durable offline chain/reopen, conflict intent retention, response loss/retry/convergence, native encrypted state and unchanged full sync regression |
| G9 | PASS — immutable execution/transition history, source revision refs, original intent and trusted actor/device/session provenance |
| G10 | PASS — deterministic actual task lifecycle/two-device/HTTP/permission/rollback/delivery scenarios |
| G11 | PASS applicable engineering/security/cache/native gates; iOS N/A current Android profile; physical-device release certification unclaimed |
| G12 | PASS only at activation — required exact PR checks, ordinary merge/exact push, complete authorized report publication and completed CR76; conditions below remain mandatory |

## 6 Deterministic scenario and review

Fixed observed/effective source time 2026-11-04T01:00:00Z, explicit manual fixture field
and operation reference. Random UUIDs isolate runs and do not select business behavior.
Actual canonical Create/Plan/Assign/Accept/Start/Pause/Resume/Complete/Verify/Close,
lost response with one fact, second-device stale conflict, current role/org revoke,
private target-reference shape, unresolved resource denial, quantitative/nonquantitative
policy, creator/executor feed convergence, current-scope PURGE, real HTTP and forced
rollback/actual delivery retry. Test identity/policy composition is explicitly injected;
no fake production Task handler/domain and no new full JWT-certification claim. Existing
real identity/session regressions remain mandatory and passed.

Self-review only; no independent reviewer claimed. Closed findings: UUID/text placeholder,
conditional quantity, resource resolution, HTTP status/verb casing, pagination/recipients,
foreign payload minimization, missing audit payload/device context, Create replay scope,
receipt/pull order/conflict view, cache batching, awaited negative futures and fake-async
widget I/O. Widget test keeps actual domain/store code; only I/O scheduling is controlled.
All assertions/thresholds retained. GitHub reviews/threads clear at merge; strict required
aggregate/enforce-admins/conversation protection retained, no bypass actors/auto-merge.

Failed initial 41727130117 remains FAILED (SQL/lint). Intermediate 41727695087,
41728137383,41728332040,41728536223,41728638943,41728971421,41729387158 were
superseded/CANCELLED and are not full PASS. Run 41729922835 on 7afee3d had 6 component
jobs successful but FAILED Mobile at unchanged 10-minute widget timeout (39 passed);
not accepted. Corrected final a92d6cb... full runs above establish acceptance.

## 7 Limitations and G12 activation

Trusted policy/employee/operation/asset composition defaults deny until provisioned;
this package does not create HR/asset catalogs. No material ledger, later agronomy,
planning/tech-map, accounting/payroll, provider credentials or uncontrolled AI/hardware
writes. Unsupported cross-domain effects reject. No retention/pruning policy invented.
No iOS/Mac shipping, WAN/production or physical-device certification claimed. Android
is current native profile under DOC20 NFR-MOB-001 and existing release/CI matrix.

Merge has exactly two parents: baseline 5df078e... and tested head a92d6cb...;
merge tree 0d85217f493fb07e98a583773e44c597e03e5e2f equals tested-head tree.
Source/tests/manifest acceptance and report-only publication are separate records.
This final report path is already CR76-approved; its publication must still pass normal
required checks, ordinary merge and exact merge-SHA push CI. Once observed, record the
report PR/head/merge/run and completed closure in CR76; this activates G12/DONE without
an infinite self-referential report rewrite. No unobserved publication PASS is asserted here.

Only after that activation may WP029 repeat its G0 against the accepted Task boundary
and finalize its own scope. WP029 is not DONE; WP030 was not started.
