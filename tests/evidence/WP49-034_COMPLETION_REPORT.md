# WP49-034 Completion Report

Date: 2026-11-25 Europe/Moscow.
Status at authoring: **G0–G11 PASS on accepted code. G12 and WP49-034 DONE activate only after the observed publication/merge/push conditions below are recorded in completed CR93.**
Baseline live main: `68ec7345e270867b2cb7a555310610d282b6f1b2`.
Accepted executable head: `98f70face2122896d78182f32aae6e8919ad99f8`.
Implementation/report [PR94](https://github.com/loktevila658-spec/agro-platform/pull/94).
Exact accepted-code [pull_request run45650302364](https://github.com/loktevila658-spec/agro-platform/actions/runs/45650302364): completed SUCCESS, all8 jobs individually SUCCESS.
Scope [CR93](https://github.com/loktevila658-spec/agro-platform/issues/93), [delegated approval before code](https://github.com/loktevila658-spec/agro-platform/issues/93#issuecomment-7166250756), [explicit public implementation/report/closeout authorization](https://github.com/loktevila658-spec/agro-platform/issues/93#issuecomment-7166988186).

Initially clean separate worktree `/private/tmp/agro-wp49-034-work`, branch `codex/wp49-034`, from an independent clone. Original dirty checkout untouched. This final report publication changes only its already approved path. Its exact head/checks/ordinary merge/push/final main are recorded in CR93 after observation, avoiding an infinite rewrite about the report's own eventual merge.

## Authority and G0

DOC50 execution > DOC48 frozen scope/RTM > DOC47 reconciliation > DOC49 build graph > product/domain contracts. No latest-document-wins. AGENTS/CODEX_INSTRUCTIONS, authority/release/order/gates/change classes/invariants and applicable scouting/field/season/GIS/task/work-fact/file/offline/security/correction sources inspected before implementation. Mapping: DOC34 §11, AGR34-052–061/063/064/066 and AT34-018–025 observation slice; DOC10 context/observer/time/optional GPS/note/GENERAL/OPEN/full severity vocabulary; DOC11 immutable observation, correction and source-linked Task; DOC12 O1, original device vs server time, independent attachments and retained rejected intent; DOC47 shared File ownership and distinct domain state machines. No MASTER-wide completion claim.

G0 entry PASS before code: exact live baseline reconfirmed after approval; clean separate worktree; competing WP034 PR/branch/CR searches clear. Reports, completed CR activations, merge ancestry and exact push metadata/all8 successful jobs independently checked. Static NOT_STARTED is not completion evidence.

| Dependency | Exact source/report merge and successful push | Governance |
|---|---|---|
|026|PR67 merge97574a4768085ec8e9c72bc96dd7372527f356f5 / push41516292979|CR65 completed|
|028|PR73 merge5a9afb7bb47ceaca678cf67028ff308df2547793 / push41689928078; PR74 report merge5df078ef543d7dfda0ae3ddee8f85404de1fe9de / push41701826258|CR72 completed activation inspected|
|031|PR77 merge07ae3230e8a514fe39a91fb580b3ca5e89037c38 / push41812251402; PR78 report merge1432b7bc81292d5fae7dbc3e4b07bb412a418c3e / push41815398666|CR76 completed activation inspected|
|033 owner contracts|PR92 report merge baseline68ec7345e270867b2cb7a555310610d282b6f1b2 / push45609064962|CR90 completed activation inspected|

Every merge is a baseline ancestor; exact run SHA/push event/conclusion and all8 jobs checked, not general CI. Inspected src-only compiler/AppModule/Docker layout, schema19 baseline, contracts/codegen/catalog assertions, actual Farm/FieldSeason/GIS/Task/ActualOperation/File/Sync owner ports, encrypted Flutter storage/queues and all globs/gates.

Frozen manifest remains byte-identical, including static status:
```yaml
id: WP49-034
title: Scouting
wave: W4
release: V1
depends_on:
  - WP49-026
  - WP49-028
  - WP49-031
allowed_paths_raw: /apps/api/modules/scouting /apps/mobile
exit_criteria: GPS/photo/voice observations, anomaly->task loop.
```
Literal API root was not reinterpreted: compiled runtime/companions have explicit CR93 approval. One complete45-path matrix before code; no additional CR, frozen/dependency/release/exit change, compiler broadening or gate waiver.

Initial public CR publication was auto-review rejected; owner explicitly authorized the exact payload/destination, then the same proposal was published and delegated approval recorded before code. Public PR publication was separately held; owner explicitly authorized source/tests/contracts/PR/report/CI/governance. Connector retry failed at transport; CLI completed the same authorized action. No rejection bypass. Delegated decisions are agent-recorded, not independent human reviews.

## Resulting behavior

Human observation on an authorized FieldSeason; Field/season/revisions/available pinned geometry resolve through a Farm transaction-bound owner query. Optional original GPS lat/lon/accuracy/provider/time retain precision and are never replaced by zeros. Manual text-only or typed observation without note/media works. GENERAL/OPEN and LOW/MEDIUM/HIGH/CRITICAL follow DOC10. Configured scalar answers retain form id/version and require trusted current form approval. Server actor/trusted employee/session/device, original observed time and server receipt remain distinct provenance.

Expected-version/reasoned correction appends immutable history, retains identity and previous media intents. No observation delete/resolve workflow; revisions/audit/outbox cannot be updated/deleted/truncated. Human signs/GPS/media do not become a diagnosis or an actual-operation fact.

Explicit online Scouting.CreateWork requires reported anomaly, current scouting.create-work plus Task owner task.create permissions and expected version. FieldSeason is inherited. Existing Task.apply validates operation/target/permissions in the same transaction, confirms a DRAFT Task and stores the exact observation/revision trace in Task transition provenance. One handoff per observation; replay returns its identity, fresh duplicate conflicts, and concurrent devices create one Task. No planning/assignment/dispatch or foreign business SQL.

Mobile reuses encrypted Workspace/entity cache/CommandQueue/AttachmentQueue and existing sync/upload workers. Cached field/season selection, type/optional note/anomaly, optional GPS, photo capture/import and voice recording; visible metadata state, retained conflicts and independent upload status/retry. Correction/handoff are canonical online HTTP/Sync owner commands; this mobile form captures observations. No parallel DB or queue.

Non-required immutable PHOTO/VOICE staged intents never gate valid metadata. Existing SyncFiles/File Service alone binds usable remote references after multipart/hash/content/malware validation. Scouting never marks pending media clean, stores canonical raw paths/bytes or changes file retention/deletion/legal hold. New tests cover staged references/current owner policy; shared real MinIO/ClamAV tests cover validation/scan enforcement.

Android permissions/hardware are optional; denied/unavailable devices preserve manual capture. Microphone cancels on form exit/background; stale location callbacks are ignored; Android12 fine/coarse permissions are requested together. Own AAC-only recordings are finalized as M4A only after MediaExtractor verifies one AAC track and ftyp; imported files are never relabelled. Final bytes are encrypted/hashed and still undergo unchanged server checks. Primary Android references are in module README. No transcription/diagnosis/recommendation/provider/remote-sensing/AI/CV.

## Complete approved changed paths

All45 public filenames/blob SHAs matched the local accepted head. Every listed path changed; no outside/unused path, dependency/lockfile, shared Sync/File implementation, CI configuration or glob change.

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

## Database, contracts and authority

Expand-only0020/schema20: owned OPEN observation heads/single handoff, immutable revisions/reasons/actor/time/source/form/media, optional geography(Point,4326)/GiST, tenant composite refs, audit/outbox and guarded head/version/current revision. No existing authoritative domain table change. Expanded event source CHECK; existing dispatcher/inbox leases/retry/replay retained.

SyncService supplies current authentication/permissions, actor/device idempotency receipt, expected version, transaction/rollback and atomic feed. Scout/Task mutations, both audits/outboxes and deltas commit or roll back together. Additive scouting.observation.changed@1.0.0 and explicit default-deny actions, no default grants. Canonical HTTP contracts and all4 generated TypeScript/Dart/mobile/hash outputs align; old contracts remain asserted.

Trusted current Scouting/Farm/Task policies, employee/form refs, finite capture scopes/signing keys and private existing storage/scanner endpoints must be provisioned. Missing policy denies. Only Capture receives signed O1 ScoutingCapture:FieldSeason grants; correction/handoff online-only. LOCAL_PRIMARY enforced by Sync and owner application commands.

## Verification

Initial acceptance fixtures RED on missing module before runtime. Local compile and targeted domain/permission/schema/contract/architecture checks passed. Broader local72:71 PASS, one web runtime failure because built web shell unavailable, never called PASS. Full install failed ENOSPC; only task-created incomplete install/store removed and matching existing dependencies used read-only. Docker daemon unavailable; targeted integration failed before service scenarios, no repeat loop/local real-service PASS. Flutter unavailable locally; pre-existing task-local Dart SDK formatted source. Hosted gates resolve these limits.

Exact accepted-code run45650302364 on98f70face2122896d78182f32aae6e8919ad99f8: pull_request, completed SUCCESS, all8 jobs. API238/238 (no skips), Flutter73/73, Android native9/9; format0 changes/analyze clean/enforce-lockfile/APK, real migration/PostGIS/Compose/runtime/MinIO/ClamAV/contracts/architecture passed. Native metadata P95≤250ms assertion passed. Deterministic scenario covers original owner/GPS/media refs, immutable correction, Task DRAFT/source trace, replay/fresh/concurrent duplicates, current permissions/tenant/owner negatives, rollback after Task effects, real dispatcher/inbox retry, signed finite grants/pull convergence/revoke purge and authenticated HTTP.

| Gate | Accepted implementation evidence |
|---|---|
|G0|PASS — exact dependencies/ancestry/closed CRs and compatible contracts/runtime/approved pre-code matrix|
|G1|PASS — Typecheck, applicable format/analyze/static/architecture; Lint capability (no configured application linter)|
|G2|PASS — clean/repeated/current/checksum-negative real PostGIS schema20, immutable/index/constraint checks|
|G3|PASS — API238/238, Flutter73/73, no skips; strict negatives retained|
|G4|PASS — real PostGIS/Farm/Task/Sync/HTTP/rollback, shared MinIO/ClamAV and Compose runtime|
|G5|PASS — canonical API/codegen/drift/backward regression and regenerated4 artifacts|
|G6|PASS — combined transaction/outboxes/feed, dispatcher/inbox retry/replay and actor/device idempotency|
|G7|PASS — current/revoked/default-deny/tenant/owner/Task permission negatives|
|G8|PASS — encrypted restart/response-loss identity, independent media, retained conflict/rejection, signed scopes/convergence/purge, native persistence/wipe|
|G9|PASS — immutable reasoned history/source/time/employee/actor/media and rollback|
|G10|PASS — deterministic observation→Task and native9/9/channel/persistence|
|G11|PASS applicable gates — file hash/content/malware/quarantine, device-denial/mic lifecycle, native P95 and unchanged upstream offline/NFR regression|
|G12|PENDING at authoring; activates only after all observed publication/merge/push/closeout conditions below|

Earlier/superseded runs retained, never substituted for final acceptance:
-45644123222/d41695b and45644492569/48aacb7: Mobile fatal analyzer unnecessary import; source import fixed, fatal check retained. Overall runs later cancelled/superseded.
-45644359855/18c8d69,45645646910/d69e15b,45646107245/b2b68a0,45646640450/40ae761: cancelled/superseded by bounded review fixes, no final-head PASS claim.
-45644765741/71b30dc: core jobs/API235/Flutter72 passed; cancelled during Android build by necessary fixes.
-45647209169/d2ac520: API238/Flutter73/native9 test assertions passed; emulator-runner hung after adb emu kill returned OK. Superseded/cancelled; whole Mobile never called PASS. Final45650302364 completed emulator cleanup and all8 jobs normally, no workflow/assertion/threshold workaround.
-One non-force push98f70fa hit GitHub Internal Server Error; identical retry succeeded.

Self-review only, no independent reviewer claim. Public path/blob/SQL ownership/mutation/permissions/retention/future-scope review complete. Fixes included fixture pool lifecycle, optional note/dictionary defaults/severity, media retention/retry, cross-device concurrency, recorder cleanup/M4A and Android12 permission pairing. No assertion, threshold or protection weakened.

## G12 activation and closeout

Mandatory observed conditions, recorded in this same CR93:
1. Report finalization changes only this already approved path relative to accepted executable98f70fa; product/runtime/test/contract blobs identical.
2. Exact final PR94 report-publication head checks SUCCESS, all8 jobs, under unchanged strict CI quality gates/enforce-admins/conversation protections; scope/reviews/threads clear.
3. Ordinary merge only, no auto-merge/admin/check bypass. Record final head/run, live base, merge SHA/parents and tested-head tree equality.
4. Exact merge-SHA event=push CI SUCCESS, all8 jobs individually verified; recheck final live main, metadata and report blob.
5. Record final G0–G12 acceptance and all exact publication facts in CR93, close completed; only then WP49-034 DONE.

Publication/merge/push are pending at authoring, not PASS. Completed CR93's activation record is the primary final post-publication evidence resolving this explicit condition without an infinite self-referential rewrite. Frozen manifest/status unchanged. No separate report PR/additional Scope CR required.

## Limitations

No production deployment/default policy/reference provisioning, independent review or physical-device/WAN/battery/ANR/iOS certification. Native tests cover encrypted persistence/queue budget/channel lifecycle; actual GPS/camera/microphone hardware certification not claimed. Voice is attachment, never transcript. File deletion/retention/legal hold unchanged.

No separate ScoutingTask lifecycle, auto route/polygon problem-zone engine, disease knowledge/diagnosis/treatment/AI/CV/provider, automatic dispatch, actual-operation/planning/GIS mutation, inventory/payroll/accounting/1C or later WP. Stop after closeout; WP49-035 not started.
