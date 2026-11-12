# WP49-029 Completion Report

Date:2026-11-12 Europe/Moscow. Status: **corrected application and test-image candidate G0–G11 accepted; DONE activates only after G12 exact PR/merge/publication conditions below are fulfilled**. No unobserved corrected report-publication or CR closure is asserted.

Original baseline main `1432b7bc81292d5fae7dbc3e4b07bb412a418c3e`; corrective baseline `acfdd0e3a19d391bc06127b1aad03e82e4d755d7`.
Exact tested corrective implementation/PR head `9a1a3fc4702f70443be34738d76f8e72c54d925c`.
[Corrective PR81](https://github.com/loktevila658-spec/agro-platform/pull/81), ordinary merge `597352f3e98b4eae1f22c37623fb8d40875b05fa`.
Pre-opening [source81d6587/run43101550541](https://github.com/loktevila658-spec/agro-platform/actions/runs/43101550541) all8 SUCCESS; final exact [PR-head43105251930](https://github.com/loktevila658-spec/agro-platform/actions/runs/43105251930) all8 SUCCESS including concurrent retirement/full retained replay. [Exact corrective merge push43107514930](https://github.com/loktevila658-spec/agro-platform/actions/runs/43107514930) on597352f all8 SUCCESS.

Initial [PR79](https://github.com/loktevila658-spec/agro-platform/pull/79), tested heade12beaa8cc8a86bf47fc733d52e398c0bd946f7a, ordinary merge5f0d596296911888da20d4bbfbf97eb08efcf696 and its pre/PR/exact push checks passed. Initial [report PR80](https://github.com/loktevila658-spec/agro-platform/pull/80), head2b42f8f9cc69ac50e1ca5dac9c9900b77478157b, ordinary mergeacfdd0e3a19d391bc06127b1aad03e82e4d755d7 and PR checks passed; its merge push43094171359 FAILED and no G12/DONE activated. A G7 cache/feed issue was also found before completed CR75 closure. Those candidates remain historical and are superseded by the corrected candidate above; no failed/unknown result is promoted to PASS.

PUBLIC scope/source/tests/generated artifacts/PR/report/closeout publication is explicitly authorized in CR75. Original dirty checkout remains untouched. Previous corrected report-publication branch: `codex/wp49-029-final-closeout`; current test-image correction branch: `codex/wp49-029-postgis-abi`.

## Baseline and authority

Manifest spec_refs: DOC49/DOC50. Authority applied: DOC50 release/execution, DOC48 frozen scope/RTM, DOC47 reconciliation, DOC49 build graph/manifest. Requirement mapping is the approved offline fields/maps/tasks criterion, existing durable command/attachment/sync/O1 contracts, current permissions/tenant/audit/provenance and DOC20 Android engineering profile.

Live baseline verified on continuation: `main@1432b7bc81292d5fae7dbc3e4b07bb412a418c3e`. Work is isolated on `codex/wp49-029`; original dirty checkout untouched. Previous temporary drafts were absent on2026-11-11, so current implementation was reconstructed from approved scope and accepted baseline. Frozen manifest, static status, release and dependency list remain byte-identical:

```yaml
depends_on: [WP49-019, WP49-020, WP49-026, WP49-027, WP49-028]
allowed_paths_raw: /apps/mobile/features/map
exit_criteria: offline fields/maps/tasks with sync.
```

Declared dependency acceptance remains unchanged:019 runs40088257705/40089547315;02040724649127;02641516292979/41520797527;02741594731257/41606516160;02841689928078/41701826258. No unnecessary reruns of accepted prerequisites.

Task owner was accepted separately under approved scheduling: WP031 implementationPR77, merge07ae3230e8a514fe39a91fb580b3ca5e89037c38, exact push41812251402 all8 SUCCESS; reportPR78, merge1432b7bc81292d5fae7dbc3e4b07bb412a418c3e, exact push41815398666 all8 SUCCESS. CR76 CLOSED/completed; activation6628771238. This WP reuses actual TaskProjection/TaskRepository/Task.*@1 and existing queues unchanged; no invented Task lifecycle or projection owner.

## Approved change control

[CR75](https://github.com/loktevila658-spec/agro-platform/issues/75) remains OPEN. Original exact50-path amendment6628468931, SHA256 `0c715515133975c05ec927d96c068626a4f092476639add2045c108ceadad8e6`; explicit owner scope/PUBLIC approval6628473856 before code; G0 continuation6628786715. Native fixture debug2-path amendment6800678986, SHA256 `ce31a9b744707af9b51a633b3b4fe366b0e8d8ec2ce404c2840d613a2954ac71`; explicit owner scope/PUBLIC approval6800692436 before edits. Total54 exact paths below. No private specification extracts or raw audit published. Unit-runner amendment6805162849, exact draft SHA256 `e55eb812da8dd81c33c7a9eaf82d496ca447515705e559f3f596626cd53a824f`, explicitly approved with PUBLIC publication before edit. Only Unit runner selector is pinned to ubuntu-24.04; no test/timeout/gate/dependency changes.

## Test-image ABI amendment and pending revalidation

[Report PR82](https://github.com/loktevila658-spec/agro-platform/pull/82), exact head `f49390bcd861e3dd84bd3739dba5530c978ca4b7`, passed all8 checks in [43109642528](https://github.com/loktevila658-spec/agro-platform/actions/runs/43109642528). Ordinary merge `37e57d054f5f5a83173d4cffad04e3f890703cf1` had the same tested tree. Its exact push [43251783414](https://github.com/loktevila658-spec/agro-platform/actions/runs/43251783414) FAILED: Unit and Migration could not load PostGIS in baseline0001 (`undefined symbol: heap_datum_check`), before WP29 acceptance scenarios; Mobile and the other four individual gates passed. This publication never activated DONE; CR75 remained OPEN.

PostgreSQL16.16 released2026-11-12 introduces C-extension ABI changes ([official release notes](https://www.postgresql.org/docs/release/16.16/), [upstream ABI explanation](https://github.com/postgres/postgres/commit/0c8ffa1ad2f44be4b058a3ec96d9cb0c71f2593f)). The test image installed current PostGIS alone over an older base-image server. The owner explicitly approved a 54th exact path and PUBLIC publication before edit in [CR75 comment6828865947](https://github.com/loktevila658-spec/agro-platform/issues/75#issuecomment-6828865947), draft SHA256 `9930cfeda3eef953345148af8bf80a3dfa04877364971a0fc848ccd4df9a4412`.

Only `database/test/Dockerfile.postgis` changes: explicitly install/update `postgresql-16` together with `postgresql-16-postgis-3` in the same APT transaction. Major16/Bookworm, production deployment, migrations, assertions, timeouts, workflow gates and all application source/tests remain unchanged. No unsafe compatibility toggle or skipped test. Real image/extension/migration and full exact candidate/PR/merge/report checks remain mandatory; previous green runs do not replace them. Candidate `a22afc05dd37c294688f46aace453e7805f081c0` passed full pre-PR [run43255301937](https://github.com/loktevila658-spec/agro-platform/actions/runs/43255301937): all8 SUCCESS, API189/189, actual owner10/10 fail0/skipped0, Flutter52/52 and Android native4/4. Real PostGIS extension loading, clean/repeated schema16 migration and geometry operations passed. This report update changes evidence only; the exact final PR head and ordinary merge push still require all gates. Their observed SHA/run and final CR closure are recorded in the G12 activation comment below; no extra report-only rewrite is required.

## Implementation and boundaries

- Farm owns fields/seasons and GIS owns immutable geometry versions. Offline GIS reads owner application services with current permission/tenant/org/site/field checks; writes only owned derived package/field/audit/ordering tables. Current geometry pin remains exact; newer approved geometry marks staleness. No canonical geometry simplification or foreign table writes.
- One active package per registered device; Select/Refresh@1 use existing SyncService command authorization, version guards, idempotent identities/receipts and transactional derived feed. Actual owner events use existing dispatcher/inbox. Own tenant ordering protects first subscription; released read-phase savepoint preserves feed-clock/head lock order. Concurrent selection causes rollback/retry. Withdrawal uses atomic PURGE. Pull/replay recheck current authorization.
- Current read authorization also checks geometry actually retained in owned projections. A derived field projection identity has one read-permission class throughout its retained feed; geometry appearance/removal retires that ID through existing PURGE/UPSERT. The class is captured atomically with identity lookup, so asynchronous policy validation/concurrent retirement cannot replace a protected class with fresh metadata. Canonical Field/Task IDs and the shared sync protocol remain unchanged.
- Server schema15->16, mobile1/2->3. Existing queues, receipts, audit, attachments and cursors preserved. Encrypted complete-version cache activates atomically, retains consistent authorized snapshots across partial updates, fails closed on PURGE/scope reset. Native cache contains public licensed basemap only; private fields/tasks remain encrypted. Shared wipe/account switch requires successful native cleanup; PERSONAL logout clears external assets while retaining encrypted intent.
- Existing CommandQueue, sync protocol and real TaskRepository/TasksPage reused. Mobile displays bounded viewport polygons/clustered centers, source/license information, package progress/staleness and explicit conflicts/retries. No production provider, credential, Task fixture, TTL or retention invented. Trusted composition must install current policies/render profile/O1 TTL and licensed immutable PUBLIC HTTPS sources; absent policy denies, absent source exposes vector-only availability.
- Main/release cleartext prohibition unchanged. Approved debug XML denies cleartext globally and permits only localhost/127.0.0.1 for test-owned HTTP fixture; system TLS anchors only. Android is current shipped native target. iOS N/A under established DOC20/release applicability; this is not an iOS support claim.

## Database and contracts

Server migration `0016_offline_gis.sql` adds owned derived `offline_gis.package`, `field_projection`, immutable `audit` and `tenant_gate`; readiness expects schema16. Earlier migrations remain immutable. Mobile1/2->3 preserves existing encrypted queues, IDs, receipts, audit, attachment state and cursors. Shared sync schema stays1.

Additive canonical OpenAPI operations: GET sources, paginated GET fields, GET package and POST package commands with select/refresh action. They are under `/v1/offline-gis`; commands delegate to existing SyncService. All generated TypeScript/Dart/manifest copies are current. Explicit catalog actions are `offline-gis.package.read`, `.select`, `.refresh`, with no default role grants. Existing `gis.read` protects geometry. No new domain event schema or Task workflow is introduced; the real Farm/GIS/Land dispatcher/inbox feeds owned derived changes through the public sync port.

## G0–G12

Acceptance below records corrected source plus full test-image candidate run43255301937. Exact final PR-head and merge checks remain mandatory for G12 activation; failed run43251783414 is not acceptance.

| Gate | Current result and evidence |
|---|---|
| G0 Prerequisites | PASS: accepted declared dependencies, separately accepted Task owner, pre-code scope approvals, unchanged manifest. |
| G1 Static | PASS: exact approved54 paths, hosted typecheck/architecture/lint capability, enforced Flutter format/analyzer/lockfile, codegen current. |
| G2 Migration | PASS: real clean/repeated/current PostGIS schema16, old migration immutability, owned constraints and mobile1/2->3 preservation. |
| G3 Unit | PASS: full required Unit, API189/189 and Flutter52/52, zero skipped acceptance; initial local targeted45/45 and architecture11/11; corrective build/syntax/targeted10/10 PASS. |
| G4 Integration | PASS: actual PostGIS10/10 owner tests plus retained real API/infrastructure/runtime suites; no fake owner substitute. |
| G5 API Contract | PASS: additive canonical OpenAPI/codegen/backward checks, generated copies current, old and new exact operation assertions retained. |
| G6 Event Contract | PASS: actual dispatcher/inbox/failure/retry/derived-feed transactionality and command replay; no new domain event schema. |
| G7 Permissions | PASS: actual current/default-deny/org/site/field/tenant/GIS/source/replay negatives, cached geometry authorization, retired identities and atomic read-class capture. Before/during/after real owner delivery, old geometric IDs stay denied/PURGE and authorized fresh metadata has no geometry/version/bounds/center during complete retained replay. |
| G8 Offline | PASS: encrypted cache, command identity/receipts, partial bundles/PURGE, conflict/retry, real Task commands, actual native tiles/pixels/pause/persist/restart/resume. |
| G9 Audit/Provenance | PASS: actual immutable audit, original command/receipt/provenance, exact geometry pins, transactional fault rollback. |
| G10 Demo/E2E | PASS: deterministic actual owner/Task lifecycle/retry/fact and native server-shutdown raster/vector/cleanup scenarios. |
| G11 NFR/Security | PASS applicable engineering/security profile: retained capacity/convergence, bounded viewport, native cipher/keystore, licensed public cache/private-data isolation/wipe. iOS N/A; physical-device certification unclaimed. |
| G12 Evidence/Merge | PASS only at activation: exact corrective PR-head/ordinary merge/exact push, complete approved corrected report publication with its own normal exact checks/merge/push, and completed CR75. Conditions below remain mandatory. |

## Observed checks (historical candidates included)

| Exact head | Run | Observed result |
|---|---|---|
| e937d5f217b5b221ba8b35d35d258dd6cc905698 |43048967448|Initial mobile type/lint and old schema expectation failures fixed; no acceptance. Superseded.|
|31918cb134b593e4f5346df8284fb76eee1ac0bc|43051171934|Static/contracts/runtime/migration PASS; Flutter50/APK PASS; new native GIS zero tiles FAIL. Unit20-minute timeout during Ubuntu DNS failure before tests.|
|172b40abce7e1c81460b22e6a83a3160d9ce5be7|43054617048|Superseded. Nested node:test inherited runner context and skipped child; **no domain acceptance** attributed.|
|542e99fc273fd5d444df95712a0ace93f75c4d09|43055664929|Actual owner8/8 zero skipped verified after removing recursive runner context and asserting named scenarios. Static/contracts/runtime/migration PASS; Flutter52/APK PASS; native3/4, GIS zero tiles FAIL. Unit20-minute dependency DNS timeout.|
|a45d70834aa61bcd538a100f025e4e48ca826337|43059399296|Actual owner9/9 zero skipped including first-subscription race; static/contracts/runtime/migration PASS; analyzer clean, Flutter52/APK PASS; native3/4, GIS zero tiles FAIL. Unit same setup stall, canceled on superseding dispatch.|
|69ac8fc0b05149cdba9c83a9541b450e24e663b9|43061289158|Typecheck/Lint/Contract/Migration/Runtime SUCCESS; Mobile analyzer clean, Flutter52/APK and all4 actual Android native scenarios SUCCESS. Unit20-minute timeout during dependency DNS failures; no full acceptance.|
|ce20d46d62831a833587b4ee89f061678f4979d1|43086770346|Pre-PR full CI all8 SUCCESS: API188/188, Flutter52/52, owner9/9 zero skipped, Android native4/4, contracts/static/migration/runtime. Initial source checks passed; candidate later superseded before activation.|
|e12beaa8cc8a86bf47fc733d52e398c0bd946f7a|43088733764|Exact final PR79 head all8 SUCCESS; reviews/threads clear immediately before ordinary merge.|
|5f0d596296911888da20d4bbfbf97eb08efcf696|43090335620|Exact ordinary implementation merge push all8 SUCCESS, including full Unit and Android native; merge tree equals tested-head tree.|
|75b9682afc1ca9a2f666396b92d3896f2747d206|43095541980|Startup failure before jobs: public GitHub annotation reports unexpected internal error, request68a420f2-de0f-11f1-8c91-7f719ca9d52a. One normal rerun created no jobs. No test acceptance.|
|75b9682afc1ca9a2f666396b92d3896f2747d206|43099331953|Fresh identical-code dispatch ran normally: owner10/API189 PASS for cached pre-delivery case; superseded by retained-feed extension, not final acceptance.|
|81d6587bf5b293bfb7e8a5d668a65db563ccf17b|43101550541|Corrected full pre-PR all8 SUCCESS: API189/189, owner10/10 zero skipped including complete retained replay, Flutter52/52 and Android native4/4. Sequential replay validated before PR; final concurrent-retirement review head follows.|
|2b42f8f9cc69ac50e1ca5dac9c9900b77478157b|43092034411|Initial report PR80 exact-head all8 SUCCESS; activation remained conditional.|
|acfdd0e3a19d391bc06127b1aad03e82e4d755d7|43094171359|Initial report-merge push FAILED; not accepted for activation. G7 finding required the corrected candidate.|
|768f364a18b5b4973bd4e6a5f78204b47f6181fa|43103845496|Superseded during PR review by atomic read-class capture; no final acceptance attributed.|
|9a1a3fc4702f70443be34738d76f8e72c54d925c|43105251930|Final exact PR81 head all8 SUCCESS: API189/189, owner10/10 zero skipped including controlled concurrent retirement/full replay, Flutter52/52 and Android native4/4.|
|597352f3e98b4eae1f22c37623fb8d40875b05fa|43107514930|Exact corrective merge-SHA push all8 SUCCESS; final report publication/activation remains conditional.|

Native diagnosis on a45d708: direct Dart style precheck200 and native style request succeeded, SDK complete fraction1.0, tile requests0. Exact pinned native13.5.0 [zoom calculation](https://github.com/maplibre/maplibre-native/blob/android-v13.5.0/src/mbgl/util/tile_cover.cpp#L149) maps256px tile at map zoom0 to source zoom1; [offline cover](https://github.com/maplibre/maplibre-native/blob/android-v13.5.0/platform/default/src/mbgl/storage/offline_download.cpp#L38) intersected that with fixture maxzoom0, yielding empty coverage. Fixture PNG and declared tileSize corrected consistently to512. All tile/pause/resume/offline pixel/vector/privacy/wipe assertions and wait bounds retained.

Local Docker daemon unavailable: probed once, no repeated Compose launch or local integration PASS claim. Local Flutter SDK absent; hosted analyzer/native evidence is required. Formatting uses standalone official Dart3.13.7. No dependencies/lockfiles/gate assertions/timeouts weakened; only the explicitly approved Unit runner selector changes.

## Limitations

Pinned maplibre_gl0.27.1 Android resume loses observer after process restart and returns ResumeRegionError. Production fallback restarts the same persisted partial region definition through supported plugin API; public resources may download again, explicitly disclosed in UI. Complete cached regions avoid restart. Native test covers pause, encrypted workspace reopen, persisted definition and restart; no process-kill/byte-range, physical-device/battery/ANR or iOS certification claimed.

Corrective PR81 merged normally at597352f. Current corrected report publication/G12 conditions below remain mandatory. WP030 remains unstarted.

## Deterministic scenario and review

Owner fixture uses explicit manual field/operation/reference data, fixed effective/observed timestamps2026-11-04T00:00:00Z through05:00:00Z and fixed correlation. Random UUIDs/ephemeral ports isolate runs; they do not select business behavior. Actual Field correction, GIS approval with old pin retained, event failure/retry/replay, concurrent selection and first subscription, current permission withdrawal, HTTP guards, Task Create/Plan/Assign/Accept/Start/Complete and lost-response retry converge with one execution fact. Native fixture supplies a fixed512px RGB232/64/48 raster; it gates actual HTTP tile responses, pauses/reopens/restarts/resumes, stops the real server, checks cached pixels and rendered private vector, verifies native-cache isolation and wipes shared assets. Test policies/identity are explicit trusted fixtures; existing actual identity/session regressions also passed.

Self-review only; no independent reviewer claimed. Correction review checks owned-cache geometry authorization plus stable read-permission class per retained projection identity; canonical Field/Task IDs and shared sync are unchanged. Fixed findings: route/status/cursor validation, current scope/replay, feed-clock/head ordering and first-subscription convergence, atomic partial bundles/PURGE, migration preservation, persisted native observer recovery, fixture cleartext/zoom coverage and recursive node:test skipping. No acceptance assertion or timeout was relaxed. GitHub reviews/threads were empty immediately before each merge. For corrective PR81, live mainacfdd0e and exact head9a1a3fc were checked; run43105251930 all8 SUCCESS. Required aggregate strict=true, enforce_admins=true, conversation resolution=true, force pushes/deletions disabled; no independent review requirement configured. All4 public corrective PR filename/blob SHA matched the reviewed isolated head (initial full PR all53 also matched). Normal merge API enforced expected head; no auto-merge/bypass. Self-reviews: [initial PR79 review](https://github.com/loktevila658-spec/agro-platform/pull/79#issuecomment-6805491935), [initial report PR80 review](https://github.com/loktevila658-spec/agro-platform/pull/80#issuecomment-6806171792), [corrective PR81 review](https://github.com/loktevila658-spec/agro-platform/pull/81#issuecomment-6807998435). No blocking finding remained at corrective merge.

## Complete approved changed-file inventory

Every row below is explicitly authorized by CR75, including the separate two debug paths, one Unit-runner amendment and one test-image ABI amendment. Frozen literal path is preserved rather than reinterpreted.

| Exact path | Purpose | Owner | Verification |
|---|---|---|---|
| apps/mobile/lib/features/map/offline_package.dart | Typed versioned package manifest/state/provenance | Mobile map | Contract/unit |
| apps/mobile/lib/features/map/offline_package_store.dart | Encrypted metadata, crash-safe staging/activation, cache projection reads | Mobile map | Migration/reopen/purge |
| apps/mobile/lib/features/map/offline_package_controller.dart | Selection/download/update/pause/resume and canonical TaskRepository binding | Mobile map | Offline/retry/convergence |
| apps/mobile/lib/features/map/map_source.dart | Trusted provider-neutral licensed PUBLIC basemap configuration; deny missing/unlicensed sources | Mobile map | Source/URL/version/security negatives |
| apps/mobile/lib/features/map/maplibre_offline_regions.dart | Pinned native API download/status/resume and region/ambient cleanup | Mobile map | Actual Android download/restart/no-network |
| apps/mobile/lib/features/map/offline_map_page.dart | Region selection, package metadata/progress/stale/error, fields and existing TasksPage navigation | Mobile map | Widget/E2E |
| apps/mobile/lib/widgets/gis_map.dart | Render selected offline basemap and authorized encrypted-cache field vectors; bounded geometry batches | Mobile renderer | Widget/native rendering |
| apps/mobile/lib/main.dart | Authenticated map route, sync completion refresh and fail-closed logout/native cleanup | Mobile shell | Workspace/logout/reconnect |
| apps/mobile/lib/persistence/database.dart | Add schema3 package metadata; support upgrades1/2 preserving all queues/cursors | Mobile persistence | Fresh/1->3/2->3/crash compatibility |
| apps/mobile/lib/persistence/workspace.dart | Use current schema metadata and map asset cleanup before workspace switch | Mobile persistence | Shared wipe/failure/tenant isolation |
| apps/mobile/test/offline_package_test.dart | Selection/state/version/source validation | Mobile tests | Existing flutter test glob |
| apps/mobile/test/offline_package_store_test.dart | Atomic staging/activation/reopen/storage failure/isolation | Mobile tests | Existing flutter test glob |
| apps/mobile/test/offline_package_sync_test.dart | Real pull-store/TaskRepository/queue conflict/retry/purge/convergence | Mobile tests | Existing flutter test glob |
| apps/mobile/test/offline_map_page_test.dart | Selection/progress/stale/no-source/storage/action UI | Mobile tests | Existing flutter test glob |
| apps/mobile/test/offline_package_migration_test.dart | Upgrade keeps commands/attachments/receipts/cursors | Mobile tests | Existing flutter test glob |
| apps/mobile/test/gis_map_test.dart | Retain renderer baseline assertions and add field rendering | Mobile tests | Existing flutter test glob |
| apps/mobile/test/sync_migration_test.dart | Retain prior1->current queue/cursor migration assertions at schema3 | Mobile persistence tests | Existing flutter test glob |
| apps/mobile/test/workspace_test.dart | Retain workspace encryption/wipe assertions and add map cleanup | Mobile tests | Existing flutter test glob |
| apps/mobile/integration_test/offline_gis_test.dart | Actual test-owned HTTP tile fixture, MapLibre download/pause/reopen/resume/offline render/shared cleanup; real encrypted workspace | Mobile native tests | Existing Android integration_test glob; no mocked native acceptance |
| apps/api/src/modules/offline-gis/offline-gis.module.ts | Compose owner queries/SyncModule without EventsModule import cycle | Offline GIS delivery | Build/runtime |
| apps/api/src/modules/offline-gis/offline-gis.types.ts | Versioned package/field/source/query command contracts | Offline GIS delivery | Unit/contracts |
| apps/api/src/modules/offline-gis/offline-gis.validation.ts | Strict region/selection/zoom/compatibility input validation | Offline GIS delivery | Negative unit |
| apps/api/src/modules/offline-gis/offline-gis.registry.ts | Install-once default-deny trusted current organization/site/field and source/license policy | Offline GIS delivery | Permission/revoke/tenant |
| apps/api/src/modules/offline-gis/offline-gis.service.ts | Owned derived subscription/manifests/audit; transaction-bound owner queries; revalidate each request | Offline GIS delivery | Real PostGIS/rollback/pagination |
| apps/api/src/modules/offline-gis/offline-gis.controller.ts | Authenticated package/source selection and refresh endpoints wrapping existing registered-device/sync command path | Offline GIS delivery | Real HTTP/contracts |
| apps/api/src/modules/offline-gis/offline-gis.sync.ts | Register only GIS package/field projections and versioned selection/refresh delivery handlers in existing sync registry | Offline GIS delivery | Receipt/feed/replay/conflict |
| apps/api/src/modules/offline-gis/offline-gis.events.ts | Farm/GIS/Land consumer refreshes affected derived subscriptions via owner APIs; inbox/feed in supplied transaction | Offline GIS delivery | Actual dispatcher duplicate/failure/retry/out-of-order |
| apps/api/src/modules/offline-gis/README.md | Ownership/configuration/compatibility/recovery/security limitations | Offline GIS delivery | Review |
| apps/api/src/modules/farm/farm.service.ts | Narrow transaction-bound paginated authorized Field/FieldSeason delivery query with organization/site/revision filters; no writes | Farm | Owner-query/current permission/tenant/as-of negatives |
| apps/api/src/modules/gis/gis.service.ts | Narrow authorized immutable-version geometry payload query by exact pinned version; never silently choose latest | GIS | Pinned approved/rejected/version/provenance negatives |
| apps/api/src/modules/events/events.module.ts | Register offline GIS consumer retaining notifications/replication and existing dispatcher protocol | Platform events composition | Actual inbox/outbox retry regression |
| apps/api/src/app.module.ts | Register delivery composition | Application composition | Build/runtime |
| database/migrations/0016_offline_gis.sql | Owned derived package selection/subscription, monotonic delivery versions, immutable request audit; no foreign business-table writes | Offline GIS/schema | Clean/repeated migration/constraints |
| apps/api/src/schema-version.service.ts | Expected current schema16 | Schema contract | Readiness/current/ahead |
| apps/api/test/schema-version.test.mjs | Preserve current/ahead negatives at schema16 | Schema tests | Existing test/*.test.mjs glob |
| apps/api/test/identity.integration.test.mjs | Schema expectation15->16 only; retain identity security assertions | Identity tests | Existing test/*.test.mjs glob |
| database/test/database.integration.test.mjs | Fresh/repeated schema16 and owned constraints; retain prior owner checks | Database tests | Existing test/*.test.mjs glob |
| database/test/migrate.test.mjs | Contiguous immutable migration checks; retain prior assertions | Migration tests | Existing test/*.test.mjs glob |
| apps/api/test/offline-gis.unit.test.mjs | Selection/source/version/default-deny validation | Offline GIS tests | Existing test/*.test.mjs glob |
| apps/api/test/offline-gis.integration.test.mjs | Real owner mutations/event delivery/pull/HTTP + Task owner execution/reconnect/retry/revoke/convergence | Offline GIS tests | Existing test/*.test.mjs glob |
| apps/api/test/permissions.test.mjs | Register exact GIS-delivery action names without granting roles; retain old negatives | Permissions tests | Existing test/*.test.mjs glob |
| openapi/openapi.yaml | Additive canonical package/field/source/selection schemas and endpoints; Task contracts unchanged | API contracts | Compatibility/codegen |
| packages/contracts/src/generated/contracts.ts | Unchanged canonical generator output for additive GIS delivery contract | Contracts generation | Codegen drift/Dart analyzer |
| packages/contracts/generated/dart/contracts.dart | Unchanged canonical generator output for additive GIS delivery contract | Contracts generation | Codegen drift/Dart analyzer |
| packages/contracts/generated/manifest.json | Unchanged canonical generator output for additive GIS delivery contract | Contracts generation | Codegen drift/Dart analyzer |
| apps/mobile/lib/generated/contracts.dart | Unchanged canonical generator output for additive GIS delivery contract | Contracts generation | Codegen drift/Dart analyzer |
| packages/contracts/test/contracts.test.mjs | Add exact additive operation expectations retaining all existing checks | Contract tests | Contract regression |
| tests/contracts.test.mjs | Add exact additive operation expectations retaining all existing checks | Contract tests | Contract regression |
| permissions/catalog.yaml | Explicit GIS package read/select/refresh actions; no default grants | Permissions | Deny/current scope negatives |
| tests/evidence/WP49-029_COMPLETION_REPORT.md | Actual separate G0-G12 results/full files/SHA/CR/PR/run/limitations and activation evidence | Evidence | G12 |
| apps/mobile/android/app/src/debug/AndroidManifest.xml | Reference loopback-only debug security config | Android debug test profile | Native actual tile fixture; release unchanged |
| apps/mobile/android/app/src/debug/res/xml/offline_gis_test_network_security.xml | Deny base cleartext; allow only exact loopback fixture domains | Android debug test profile | Source security assertion and actual native download |
| `.github/workflows/ci-quality-gates.yml` | Unit runner selector only, ubuntu-latest -> ubuntu-24.04 | platform CI | approved CR75 amendment6805162849, exact SHA256e55eb812da8dd81c33c7a9eaf82d496ca447515705e559f3f596626cd53a824f; owner approval before edit |
| database/test/Dockerfile.postgis | Install/update core PostgreSQL16 together with PostGIS in the test image | Test infrastructure | Actual extension load, full migration/owner/API and CI; CR75 approval6828865947 |

## Permission correction and deterministic concurrency proof

Current owner geometry references alone were insufficient when old cached delivery retained geometry. After an owner-removal event, current cache shape alone was also insufficient because SyncService authorizes retained feed by entity identity. The corrected module therefore checks retained geometry, retires a derived field ID on geometry presence changes and captures the ID's geometric class atomically with its existence. It preserves the canonical Field/FieldSeason/Task identities and existing feed protocol; only owned derived rows/manifest/audit change.

Actual PostGIS proof removes the geometry through Farm at fixed effective05:00Z, denies current GIS reads, asserts old read denial and concrete pull PURGE, pauses a real old-ID read during asynchronous source policy validation, commits actual event delivery/ID retirement, then requires that paused read to stay denied. Fresh non-GIS metadata is readable. Complete replay from bootstrap returns old IDs only as PURGE and fresh metadata as UPSERT, with no geometry/version/bounds/center in any returned field projection. This runs inside both the mandatory Migration owner profile and full API suite. Final owner tests10/10 (parent included), fail0/skipped0; API189/189, fail0/skipped0.

The earlier private diagnostic was used only to locate the missing GIS check, not as PostGIS acceptance. Source75b9682 proved the pre-delivery case; source81d6587 added sequential retained replay; final9a1a3fc adds controlled concurrent retirement and is the accepted exact PR head. All current acceptance assertions are positive/negative actual-owner checks; no production fake Task owner/provider, hidden skip, weakened assertion/timeout or foreign write.

## G12 publication activation and unlock decision

Corrective merge597352f has exactly two parents: baselineacfdd0e3a19d391bc06127b1aad03e82e4d755d7 and tested head9a1a3fc4702f70443be34738d76f8e72c54d925c. Merge tree `655ceef465419eac2090b92ada88413a863f05d9` equals tested-head tree. Original implementation tree9bd6b1d5d769a98ac59d908186943770c8bf8c59 and initial report treec1d73f7960573d7ae461c1af3486afe2657aa6e8 likewise matched their tested heads; their publication did not activate DONE. Source/tests acceptance and corrected final report publication are separate records.

This final report path is already CR75-approved. The final test-image/report PR publishes both the one-line approved fixture correction and this consolidated Completion Report. Its publication must pass normal exact report PR-head checks, ordinary expected-head merge and exact report-merge-SHA push CI, with live main/protection/reviews/threads verified. After observing those results, record the corrected report PR/head/merge/run and completed CR75 closure in its activation comment. That activates G12 PASS / WP49-029 DONE without an infinite self-referential report rewrite. No unobserved corrected report-publication PASS is asserted here.

Unlock decision: corrected application implementation PASS; test-image candidate full pre-PR PASS; G12/DONE only on that activation. Frozen manifest/static NOT_STARTED intentionally unchanged as approved. WP030 remains UNSTARTED and must not be started by this closeout.
