# WP49-029 Completion Report — IN PROGRESS

WP49-029 is **NOT DONE**. No implementation PR or merge has occurred. Final exact-head CI and native acceptance are outstanding. This report replaces earlier draft checkpoints; unknown gates are not PASS.

## Baseline and authority

Live baseline verified on continuation: `main@1432b7bc81292d5fae7dbc3e4b07bb412a418c3e`. Work is isolated on `codex/wp49-029`; original dirty checkout untouched. Previous temporary drafts were absent on2026-11-11, so current implementation was reconstructed from approved scope and accepted baseline. Frozen manifest, static status, release and dependency list remain byte-identical:

```yaml
depends_on: [WP49-019, WP49-020, WP49-026, WP49-027, WP49-028]
allowed_paths_raw: /apps/mobile/features/map
exit_criteria: offline fields/maps/tasks with sync.
```

Declared dependency acceptance remains unchanged:019 runs40088257705/40089547315;02040724649127;02641516292979/41520797527;02741594731257/41606516160;02841689928078/41701826258. No unnecessary reruns of accepted prerequisites.

Task owner was accepted separately under approved scheduling: WP031 implementationPR77, merge07ae3230e8a514fe39a91fb580b3ca5e89037c38, exact push41812251402 all8 SUCCESS; reportPR78, merge1432b7bc81292d5fae7dbc3e4b07bb412a418c3e, exact push41815398666 all8 SUCCESS. CR76 CLOSED/completed; activation6628771238. This WP reuses actual TaskProjection/TaskRepository/Task.*@1 and existing queues unchanged; no invented Task lifecycle or projection owner.

## Approved change control

[CR75](https://github.com/loktevila658-spec/agro-platform/issues/75) remains OPEN. Original exact50-path amendment6628468931, SHA256 `0c715515133975c05ec927d96c068626a4f092476639add2045c108ceadad8e6`; explicit owner scope/PUBLIC approval6628473856 before code; G0 continuation6628786715. Native fixture debug2-path amendment6800678986, SHA256 `ce31a9b744707af9b51a633b3b4fe366b0e8d8ec2ce404c2840d613a2954ac71`; explicit owner scope/PUBLIC approval6800692436 before edits. Total53 exact paths below. No private specification extracts or raw audit published. Unit-runner amendment6805162849, exact draft SHA256 `e55eb812da8dd81c33c7a9eaf82d496ca447515705e559f3f596626cd53a824f`, explicitly approved with PUBLIC publication before edit. Only Unit runner selector is pinned to ubuntu-24.04; no test/timeout/gate/dependency changes.

## Implementation and boundaries

- Farm owns fields/seasons and GIS owns immutable geometry versions. Offline GIS reads owner application services with current permission/tenant/org/site/field checks; writes only owned derived package/field/audit/ordering tables. Current geometry pin remains exact; newer approved geometry marks staleness. No canonical geometry simplification or foreign table writes.
- One active package per registered device; Select/Refresh@1 use existing SyncService command authorization, version guards, idempotent identities/receipts and transactional derived feed. Actual owner events use existing dispatcher/inbox. Own tenant ordering protects first subscription; released read-phase savepoint preserves feed-clock/head lock order. Concurrent selection causes rollback/retry. Withdrawal uses atomic PURGE. Pull/replay recheck current authorization.
- Server schema15->16, mobile1/2->3. Existing queues, receipts, audit, attachments and cursors preserved. Encrypted complete-version cache activates atomically, retains consistent authorized snapshots across partial updates, fails closed on PURGE/scope reset. Native cache contains public licensed basemap only; private fields/tasks remain encrypted. Shared wipe/account switch requires successful native cleanup; PERSONAL logout clears external assets while retaining encrypted intent.
- Existing CommandQueue, sync protocol and real TaskRepository/TasksPage reused. Mobile displays bounded viewport polygons/clustered centers, source/license information, package progress/staleness and explicit conflicts/retries. No production provider, credential, Task fixture, TTL or retention invented. Trusted composition must install current policies/render profile/O1 TTL and licensed immutable PUBLIC HTTPS sources; absent policy denies, absent source exposes vector-only availability.
- Main/release cleartext prohibition unchanged. Approved debug XML denies cleartext globally and permits only localhost/127.0.0.1 for test-owned HTTP fixture; system TLS anchors only. Android is current shipped native target. iOS N/A under established DOC20/release applicability; this is not an iOS support claim.

## G0–G12

| Gate | Current result and evidence |
|---|---|
| G0 Prerequisites | PASS: accepted declared dependencies, separately accepted Task owner, pre-code scope approvals, unchanged manifest. |
| G1 Static | PARTIAL: hosted typecheck/lint/architecture/contracts pass; prior exacta45d708 mobile format/analyzer zero issues; final-head mobile gate pending. |
| G2 Migration | PARTIAL: hosted PostGIS schema16/rollback/compatibility and owner tests pass; mobile1/2->3 preservation passed in52-test suite on a45d708; final exact CI pending. |
| G3 Unit | PENDING full required Unit: runner cannot finish system GDAL dependency installation; local targeted45/45 and architecture11/11 PASS, hosted Flutter52/52 PASS on a45d708. These do not substitute full Unit. |
| G4 Integration | PARTIAL: actual PostGIS9/9 owner scenarios, zero skipped, verified a45d708 run43059399296; existing full-suite integration still requires Unit completion. |
| G5 API Contract | PASS targeted hosted additive OpenAPI/codegen/backward checks; final exact PR-head/full CI still required. |
| G6 Event Contract | PASS targeted actual dispatcher/inbox/failure/retry/derived-feed tests, no new domain event schema; final full CI remains required. |
| G7 Permissions | PASS targeted actual default-deny/current scope/org/tenant/GIS/source/replay negatives; final full CI remains required. |
| G8 Offline | PARTIAL: encrypted cache, queue identity, receipts, partial bundles, PURGE, conflict/retry and actual Task commands verified; real native tiles/pixels/resume PASS on69ac8fc; final new-head/full CI pending. |
| G9 Audit/Provenance | PASS targeted actual audit, command replay, immutable owner pins and transaction fault rollback; final full CI remains required. |
| G10 Demo/E2E | PARTIAL: actual deterministic owner/Task lifecycle/retry/fact scenario passes; native fixture PASS on69ac8fc; final new-head/full CI pending. |
| G11 NFR/Security | PARTIAL: inherited capacity/convergence and native cipher/keystore tests pass; viewport bound/security negatives pass. Native map scenario PASS on69ac8fc; final new-head/full CI pending; iOS N/A. |
| G12 Evidence/Merge | PENDING: final inventory/report, reviewed successful source head, PR checks/reviews, normal merge, exact push checks and CR closeout. |

## Observed checks

| Exact head | Run | Observed result |
|---|---|---|
| e937d5f217b5b221ba8b35d35d258dd6cc905698 |43048967448|Initial mobile type/lint and old schema expectation failures fixed; no acceptance. Superseded.|
|31918cb134b593e4f5346df8284fb76eee1ac0bc|43051171934|Static/contracts/runtime/migration PASS; Flutter50/APK PASS; new native GIS zero tiles FAIL. Unit20-minute timeout during Ubuntu DNS failure before tests.|
|172b40abce7e1c81460b22e6a83a3160d9ce5be7|43054617048|Superseded. Nested node:test inherited runner context and skipped child; **no domain acceptance** attributed.|
|542e99fc273fd5d444df95712a0ace93f75c4d09|43055664929|Actual owner8/8 zero skipped verified after removing recursive runner context and asserting named scenarios. Static/contracts/runtime/migration PASS; Flutter52/APK PASS; native3/4, GIS zero tiles FAIL. Unit20-minute dependency DNS timeout.|
|a45d70834aa61bcd538a100f025e4e48ca826337|43059399296|Actual owner9/9 zero skipped including first-subscription race; static/contracts/runtime/migration PASS; analyzer clean, Flutter52/APK PASS; native3/4, GIS zero tiles FAIL. Unit same setup stall, canceled on superseding dispatch.|
|69ac8fc0b05149cdba9c83a9541b450e24e663b9|43061289158|Typecheck/Lint/Contract/Migration/Runtime SUCCESS; Mobile analyzer clean, Flutter52/APK and all4 actual Android native scenarios SUCCESS. Unit still stalls in system dependency setup; no full acceptance.|

Native diagnosis on a45d708: direct Dart style precheck200 and native style request succeeded, SDK complete fraction1.0, tile requests0. Exact pinned native13.5.0 [zoom calculation](https://github.com/maplibre/maplibre-native/blob/android-v13.5.0/src/mbgl/util/tile_cover.cpp#L149) maps256px tile at map zoom0 to source zoom1; [offline cover](https://github.com/maplibre/maplibre-native/blob/android-v13.5.0/platform/default/src/mbgl/storage/offline_download.cpp#L38) intersected that with fixture maxzoom0, yielding empty coverage. Fixture PNG and declared tileSize corrected consistently to512. All tile/pause/resume/offline pixel/vector/privacy/wipe assertions and wait bounds retained.

Local Docker daemon unavailable: probed once, no repeated Compose launch or local integration PASS claim. Local Flutter SDK absent; hosted analyzer/native evidence is required. Formatting uses standalone official Dart3.13.7. No dependencies/lockfiles/gate assertions/timeouts weakened; only the explicitly approved Unit runner selector changes.

## Limitations

Pinned maplibre_gl0.27.1 Android resume loses observer after process restart and returns ResumeRegionError. Production fallback restarts the same persisted partial region definition through supported plugin API; public resources may download again, explicitly disclosed in UI. Complete cached regions avoid restart. Native test covers pause, encrypted workspace reopen, persisted definition and restart; no process-kill/byte-range, physical-device/battery/ANR or iOS certification claimed.

No implementation PR/merge/closeout exists yet. WP030 remains unstarted. Final report must record actual PR heads, reviews and exact post-merge checks before DONE.

## Complete approved changed-file inventory

- `apps/mobile/lib/features/map/offline_package.dart`
- `apps/mobile/lib/features/map/offline_package_store.dart`
- `apps/mobile/lib/features/map/offline_package_controller.dart`
- `apps/mobile/lib/features/map/map_source.dart`
- `apps/mobile/lib/features/map/maplibre_offline_regions.dart`
- `apps/mobile/lib/features/map/offline_map_page.dart`
- `apps/mobile/lib/widgets/gis_map.dart`
- `apps/mobile/lib/main.dart`
- `apps/mobile/lib/persistence/database.dart`
- `apps/mobile/lib/persistence/workspace.dart`
- `apps/mobile/test/offline_package_test.dart`
- `apps/mobile/test/offline_package_store_test.dart`
- `apps/mobile/test/offline_package_sync_test.dart`
- `apps/mobile/test/offline_map_page_test.dart`
- `apps/mobile/test/offline_package_migration_test.dart`
- `apps/mobile/test/gis_map_test.dart`
- `apps/mobile/test/sync_migration_test.dart`
- `apps/mobile/test/workspace_test.dart`
- `apps/mobile/integration_test/offline_gis_test.dart`
- `apps/api/src/modules/offline-gis/offline-gis.module.ts`
- `apps/api/src/modules/offline-gis/offline-gis.types.ts`
- `apps/api/src/modules/offline-gis/offline-gis.validation.ts`
- `apps/api/src/modules/offline-gis/offline-gis.registry.ts`
- `apps/api/src/modules/offline-gis/offline-gis.service.ts`
- `apps/api/src/modules/offline-gis/offline-gis.controller.ts`
- `apps/api/src/modules/offline-gis/offline-gis.sync.ts`
- `apps/api/src/modules/offline-gis/offline-gis.events.ts`
- `apps/api/src/modules/offline-gis/README.md`
- `apps/api/src/modules/farm/farm.service.ts`
- `apps/api/src/modules/gis/gis.service.ts`
- `apps/api/src/modules/events/events.module.ts`
- `apps/api/src/app.module.ts`
- `database/migrations/0016_offline_gis.sql`
- `apps/api/src/schema-version.service.ts`
- `apps/api/test/schema-version.test.mjs`
- `apps/api/test/identity.integration.test.mjs`
- `database/test/database.integration.test.mjs`
- `database/test/migrate.test.mjs`
- `apps/api/test/offline-gis.unit.test.mjs`
- `apps/api/test/offline-gis.integration.test.mjs`
- `apps/api/test/permissions.test.mjs`
- `openapi/openapi.yaml`
- `packages/contracts/src/generated/contracts.ts`
- `packages/contracts/generated/dart/contracts.dart`
- `packages/contracts/generated/manifest.json`
- `apps/mobile/lib/generated/contracts.dart`
- `packages/contracts/test/contracts.test.mjs`
- `tests/contracts.test.mjs`
- `permissions/catalog.yaml`
- `tests/evidence/WP49-029_COMPLETION_REPORT.md`
- `apps/mobile/android/app/src/debug/AndroidManifest.xml`
- `apps/mobile/android/app/src/debug/res/xml/offline_gis_test_network_security.xml`

- `.github/workflows/ci-quality-gates.yml`

Native acceptance: run43061289158/job130664459026 succeeded with actual tile download gated/pause/persisted definition/restart/resume, complete native status/bytes, actual fixture server shutdown, cached raster pixel assertion, runtime private vector render query, private name absent from native DB, empty region metadata and native/shared workspace wipe. This is genuine native acceptance on69ac8fc, not a source-only/mocked substitute. New runner/report head and subsequent PR/merge exact checks remain required.
