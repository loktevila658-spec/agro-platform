# WP49-034 Completion Report

Date: 2026-11-25 Europe/Moscow.
Status: IMPLEMENTATION IN PROGRESS — gates below are pending until exact hosted evidence is observed. NOT DONE.
Baseline live main: `68ec7345e270867b2cb7a555310610d282b6f1b2`.
Branch/worktree: `codex/wp49-034`, `/private/tmp/agro-wp49-034-work`.
Scope [CR93](https://github.com/loktevila658-spec/agro-platform/issues/93); formal delegated approval7166250756 before implementation. Original dirty checkout untouched.

## Authority and G0

DOC50 > DOC48 > DOC47 > DOC49 > product/domain contracts; no latest-document-wins. AGENTS/CODEX_INSTRUCTIONS, authority/release/order/gates/change classes/invariants and applicable frozen/source contracts were inspected. Frozen WP49-034 W4/V1, depends026/028/031, literal `/apps/api/modules/scouting /apps/mobile`, exit `GPS/photo/voice observations, anomaly->task loop.` are byte-identical. Static NOT_STARTED is not completion evidence.

G0 implementation entry PASS before code: separate clean worktree, unchanged live baseline rechecked after approval; no competing WP034 PR/branch/CR. Runtime src-only compiler, AppModule, current schema19, contract generator, permission/event catalogs, real Farm/FieldSeason/Task/ActualOperation/File/Sync/Flutter owner boundaries and all existing globs/gates inspected.

| Dependency | Exact merged source/report evidence | Governance |
|---|---|---|
|026|PR67 merge97574a4768085ec8e9c72bc96dd7372527f356f5 / push41516292979|CR65 CLOSED/completed|
|028|PR73 merge5a9afb7bb47ceaca678cf67028ff308df2547793 / push41689928078; report PR74 merge5df078ef543d7dfda0ae3ddee8f85404de1fe9de / push41701826258|CR72 completed final activation read|
|031|PR77 merge07ae3230e8a514fe39a91fb580b3ca5e89037c38 / push41812251402; report PR78 merge1432b7bc81292d5fae7dbc3e4b07bb412a418c3e / push41815398666|CR76 completed final activation read|
|033 current owner contracts|PR92 report merge baseline68ec7345... / push45609064962|CR90 completed final activation read|

Every listed merge is a baseline ancestor. Exact push SHA/event/conclusion and all8 jobs individually successful were independently checked, not inferred from general CI.

One complete pre-code45-path matrix was prepared. Initial public issue publication was rejected by automatic review; owner explicitly authorized this exact CR93 payload/public destination and delegated approval in control chat. The identical proposal was then published normally, with no bypass. Formal delegated decision is agent-recorded, not a separate independent human approval. Frozen API root remains uncompiled and unchanged; additional compiled paths below are explicitly approved.

## Scope and changed paths

Manual observation, optional original GPS/provider/accuracy/time, human reported type/anomaly/note and versioned configurable form answers. Farm-owned transaction query pins FieldSeason/Field/season/revisions/available geometry. Trusted employee provenance, original observed time and server receipt remain separate. Immutable reasoned corrections and expected-version conflicts preserve history. Explicit anomaly create-work calls Task.apply in the same transaction, with both current permissions and original source trace, confirms a DRAFT Task, and records one handoff identity. No automatic planning/assignment/dispatch.

Mobile capture reuses encrypted Workspace/entity cache/CommandQueue/AttachmentQueue and existing sync/upload workers. GPS/photo/audio are optional; denied/unavailable device leaves manual text capture. Media pending/failure never gates metadata, bypasses File Service or becomes authoritative by device origin. Correct/handoff are online owner commands via HTTP/Sync; the mobile form captures observations. There is no transcription/diagnosis/recommendation/remote-sensing implementation.

| Path | Purpose | Owner | Authorization | Verification |
|---|---|---|---|---|
| apps/api/src/modules/scouting/scouting.types.ts | Compiled scouting types: owned observations, immutable corrections, explicit anomaly handoff, current permissions and existing Sync/File contracts | Scouting | CR93 | G1/G3/G4/G7/G8/G9 |
| apps/api/src/modules/scouting/scouting.validation.ts | Compiled scouting validation: owned observations, immutable corrections, explicit anomaly handoff, current permissions and existing Sync/File contracts | Scouting | CR93 | G1/G3/G4/G7/G8/G9 |
| apps/api/src/modules/scouting/scouting.registry.ts | Compiled scouting registry: owned observations, immutable corrections, explicit anomaly handoff, current permissions and existing Sync/File contracts | Scouting | CR93 | G1/G3/G4/G7/G8/G9 |
| apps/api/src/modules/scouting/scouting.service.ts | Compiled scouting service: owned observations, immutable corrections, explicit anomaly handoff, current permissions and existing Sync/File contracts | Scouting | CR93 | G1/G3/G4/G7/G8/G9 |
| apps/api/src/modules/scouting/scouting.sync.ts | Compiled scouting sync: owned observations, immutable corrections, explicit anomaly handoff, current permissions and existing Sync/File contracts | Scouting | CR93 | G1/G3/G4/G7/G8/G9 |
| apps/api/src/modules/scouting/scouting.controller.ts | Compiled scouting controller: owned observations, immutable corrections, explicit anomaly handoff, current permissions and existing Sync/File contracts | Scouting | CR93 | G1/G3/G4/G7/G8/G9 |
| apps/api/src/modules/scouting/scouting.module.ts | Compiled scouting module: owned observations, immutable corrections, explicit anomaly handoff, current permissions and existing Sync/File contracts | Scouting | CR93 | G1/G3/G4/G7/G8/G9 |
| apps/api/src/modules/scouting/README.md | Authority and requirement mapping, limits and production policy provisioning | Scouting | CR93 | G12 |
| apps/api/src/app.module.ts | Register compiled ScoutingModule | Composition | CR93 | G1/G4 |
| apps/api/src/modules/farm/farm.service.ts | Narrow authorized transaction-bound FieldSeason/Field/season/pinned geometry reference query; no foreign writes | Farm | CR93 | G4/G7 |
| apps/api/src/modules/events/events.types.ts | Explicit scouting producer source | Events | CR93 | G6 |
| apps/api/src/modules/events/outbox-dispatcher.service.ts | Discover/load scouting outbox through existing inbox/retry mechanism | Events | CR93 | G6 |
| database/migrations/0020_scouting_observation.sql | Owned heads/revisions/typed optional GPS/index/audit/outbox, immutable history, one handoff per observation; expand source constraint | Database/Scouting | CR93 | G2/G4/G9 |
| apps/api/src/schema-version.service.ts | Expected schema20 | Schema | CR93 | G2 |
| apps/api/test/schema-version.test.mjs | Only current/ahead schema alignment preserving all negatives | API tests | CR93 | G2/G3 |
| apps/api/test/identity.integration.test.mjs | Only current/ahead schema alignment preserving all negatives | API tests | CR93 | G2/G3 |
| database/test/migrate.test.mjs | Contiguous/current20 and new owned schema/constraint assertions; retain regression checks | Database tests | CR93 | G2/G4 |
| database/test/database.integration.test.mjs | Contiguous/current20 and new owned schema/constraint assertions; retain regression checks | Database tests | CR93 | G2/G4 |
| apps/api/test/scouting.unit.test.mjs | RED validation/current policy/file owner/domain negatives | Scouting tests | CR93 | G3/G7 |
| apps/api/test/scouting.integration.test.mjs | Real PostGIS/Farm/Task/Sync/HTTP/scanned-file binding, correction, isolation, concurrency, replay/rollback/delivery deterministic scenario | Scouting tests | CR93 | G0-G11 |
| apps/api/test/permissions.test.mjs | Exact scouting catalog registry assertions, retain prior checks | Permission tests | CR93 | G7 |
| permissions/catalog.yaml | Explicit scouting read/capture/correct/create-work permissions, no default grants | Permissions | CR93 | G7 |
| events/catalog/index.yaml | Add versioned scouting observation change event metadata only | Contracts | CR93 | G6 |
| openapi/openapi.yaml | Add observation capture/context/read/history/correction/create-work schemas/routes; Task payload remains owner-defined | Contracts | CR93 | G5 |
| packages/contracts/src/generated/contracts.ts | Existing canonical generator output only | Contracts | CR93 | G5 |
| packages/contracts/generated/dart/contracts.dart | Existing canonical generator output only | Contracts | CR93 | G5 |
| packages/contracts/generated/manifest.json | Existing canonical generator output only | Contracts | CR93 | G5 |
| apps/mobile/lib/generated/contracts.dart | Existing canonical generator output only | Contracts | Frozen /apps/mobile | G5 |
| packages/contracts/test/contracts.test.mjs | Add exact canonical scouting expectations, preserve earlier contracts | Contracts tests | CR93 | G5 |
| tests/contracts.test.mjs | Add exact canonical scouting expectations, preserve earlier contracts | Contracts tests | CR93 | G5 |
| apps/mobile/lib/features/scouting/scouting_commands.dart | Typed observation forms/context/manual-only capture, optional GPS/photo/voice, encrypted existing persistence/command/attachment queues and visible retry/conflict status | Mobile | Frozen /apps/mobile | G3/G8/G10/G11 |
| apps/mobile/lib/features/scouting/scouting_repository.dart | Typed observation forms/context/manual-only capture, optional GPS/photo/voice, encrypted existing persistence/command/attachment queues and visible retry/conflict status | Mobile | Frozen /apps/mobile | G3/G8/G10/G11 |
| apps/mobile/lib/features/scouting/scouting_page.dart | Typed observation forms/context/manual-only capture, optional GPS/photo/voice, encrypted existing persistence/command/attachment queues and visible retry/conflict status | Mobile | Frozen /apps/mobile | G3/G8/G10/G11 |
| apps/mobile/lib/features/scouting/scouting_capture.dart | Typed observation forms/context/manual-only capture, optional GPS/photo/voice, encrypted existing persistence/command/attachment queues and visible retry/conflict status | Mobile | Frozen /apps/mobile | G3/G8/G10/G11 |
| apps/mobile/lib/main.dart | Authenticated navigation/context refresh and existing worker integration | Mobile shell | Frozen /apps/mobile | G8/G10 |
| apps/mobile/android/app/src/main/kotlin/ru/agroplatform/agroplatform_mobile/MainActivity.kt | Register optional native capture channel with lifecycle cleanup | Android | Frozen /apps/mobile | G10/G11 |
| apps/mobile/android/app/src/main/kotlin/ru/agroplatform/agroplatform_mobile/ScoutingCapture.kt | Native location accuracy/provider/time; optional photo/audio capture/import, permission/cancel/timeouts, private temporary files | Android | Frozen /apps/mobile | G10/G11 |
| apps/mobile/android/app/src/main/AndroidManifest.xml | Optional location/microphone hardware and runtime permissions, private capture provider | Android | Frozen /apps/mobile | G7/G11 |
| apps/mobile/android/app/src/main/res/xml/scouting_capture_paths.xml | Private scoped temporary media paths only | Android | Frozen /apps/mobile | G11 |
| apps/mobile/test/scouting_repository_test.dart | Domain/grant/isolation/encrypted restart/independent attachment/retry/conflict/manual and device denial tests | Mobile tests | Frozen /apps/mobile | G3/G7/G8 |
| apps/mobile/test/scouting_offline_test.dart | Domain/grant/isolation/encrypted restart/independent attachment/retry/conflict/manual and device denial tests | Mobile tests | Frozen /apps/mobile | G3/G7/G8 |
| apps/mobile/test/scouting_page_test.dart | Domain/grant/isolation/encrypted restart/independent attachment/retry/conflict/manual and device denial tests | Mobile tests | Frozen /apps/mobile | G3/G7/G8 |
| apps/mobile/test/scouting_capture_test.dart | Domain/grant/isolation/encrypted restart/independent attachment/retry/conflict/manual and device denial tests | Mobile tests | Frozen /apps/mobile | G3/G7/G8 |
| apps/mobile/integration_test/scouting_test.dart | Native encrypted restart/queue persistence and optional channel/device-unavailable smoke | Android tests | Frozen /apps/mobile | G8/G10 |
| tests/evidence/WP49-034_COMPLETION_REPORT.md | Complete pre-code matrix, G0-G12, exact dependency/head/PR/CR/run/merge/closeout evidence and limitations | Evidence | CR93 | G12 |

## Compatibility and verification

Expand-only schema20, owned typed optional geography(Point,4326), GiST, tenant composite references, immutable revision/audit/outbox, guarded head and single Task handoff. Existing SyncService provides auth/current permissions, version, actor/device-bound idempotency receipt, transactional feed and rollback. New scouting event1.0.0 is delivered by the existing dispatcher/inbox; no foreign business-table SQL. Canonical OpenAPI/codegen and permission catalogs updated together; no new default grants, dependency/lockfile/compiler/glob/CI mutation.

Acceptance fixtures were RED on missing scouting module before runtime. Initial local targeted4/4 passed; later targeted14/14 including current-schema and exact permission regressions passed. Full workspace install failed ENOSPC; only task-created incomplete install/store was removed, and existing matching dependency trees were used read-only. Docker daemon unavailable; no repeated Docker loop or local real-service PASS claimed. Flutter unavailable locally; existing task-local Dart SDK formats source. Hosted real-service/native checks must resolve these limits. Pending run metadata will be recorded after observation.

| Gate | Current verdict |
|---|---|
|G0|PASS — dependency/contract/runtime/path/approval evidence above|
|G1|PENDING — local compile/targeted/static supplement; hosted exact head required|
|G2|PENDING — schema20 real migration gate|
|G3|PENDING — complete unit/API/Flutter suites|
|G4|PENDING — real database/File/Task/Sync/runtime|
|G5|PENDING — contracts/codegen/compatibility|
|G6|PENDING — transactional outbox/inbox/retry/idempotency|
|G7|PENDING — current permissions/isolation/negative suites|
|G8|PENDING — encrypted restart/independent media/retry/conflict/native|
|G9|PENDING — immutable corrections/provenance/rollback|
|G10|PENDING — deterministic observation-to-Task scenario/native|
|G11|PENDING — relevant file/security/native regressions|
|G12|PENDING — review/exact head checks/ordinary merge/exact push/report/CR closeout|

## Review and limitations

No independent reviewer approval is claimed. All assertions/thresholds/protections remain in force. Source PR/head/run/merge/post-merge checks and final report publication/closeout must be observed before DONE. UNKNOWN/PENDING is never PASS.

Production policies/employee/form references, finite scopes/signing keys and private File storage/scanner provisioning remain mandatory and default-deny. No production deployment, physical-device/WAN/battery/iOS certification. No separate ScoutingTask state machine, problem-zone/route engine, AI/CV/diagnosis/treatment, actual-operation/planning/inventory/payroll/accounting/1C changes or later WP. WP49-035 not started.
