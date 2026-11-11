# WP49-029 Completion Report — corrective validation in progress

Date:2026-11-11 Europe/Moscow. Status: **NOT DONE; post-acceptance G7 regression found before CR closure; corrective validation required**. No unobserved report-publication CI or CR closure is asserted.

Baseline main `1432b7bc81292d5fae7dbc3e4b07bb412a418c3e`.
Exact tested implementation/PR head `e12beaa8cc8a86bf47fc733d52e398c0bd946f7a`.
[Implementation PR79](https://github.com/loktevila658-spec/agro-platform/pull/79), ordinary merge `5f0d596296911888da20d4bbfbf97eb08efcf696`.
[Pre-PR run43086770346](https://github.com/loktevila658-spec/agro-platform/actions/runs/43086770346) on ce20d46 and [exact PR-head run43088733764](https://github.com/loktevila658-spec/agro-platform/actions/runs/43088733764) all8 SUCCESS. [Exact merge push43090335620](https://github.com/loktevila658-spec/agro-platform/actions/runs/43090335620) on5f0d596 all8 SUCCESS. Implementation branch `codex/wp49-029`; report-publication branch `codex/wp49-029-closeout`.

PUBLIC scope/source/tests/generated artifacts/PR/report/closeout publication is explicitly authorized in CR75. Original dirty checkout remains untouched.

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
| G1 Static | PASS: exact approved53 paths, hosted typecheck/architecture/lint capability, enforced Flutter format/analyzer/lockfile, codegen current. |
| G2 Migration | PASS: real clean/repeated/current PostGIS schema16, old migration immutability, owned constraints and mobile1/2->3 preservation. |
| G3 Unit | PASS: full required Unit, API188/188 and Flutter52/52, zero skipped acceptance; local targeted45/45 and architecture11/11. |
| G4 Integration | PASS: actual PostGIS9/9 owner scenarios plus retained real API/infrastructure/runtime suites; no fake owner substitute. |
| G5 API Contract | PASS: additive canonical OpenAPI/codegen/backward checks, generated copies current, old and new exact operation assertions retained. |
| G6 Event Contract | PASS: actual dispatcher/inbox/failure/retry/derived-feed transactionality and command replay; no new domain event schema. |
| G7 Permissions | PENDING corrective validation: cached geometry must require current GIS permission even after its owner reference is removed. Prior targeted PASS is superseded for this case. Earlier checks: actual default-deny/current scope/org/tenant/GIS/source/replay negatives and fail-closed cache/PURGE. |
| G8 Offline | PASS: encrypted cache, command identity/receipts, partial bundles/PURGE, conflict/retry, real Task commands, actual native tiles/pixels/pause/persist/restart/resume. |
| G9 Audit/Provenance | PASS: actual immutable audit, original command/receipt/provenance, exact geometry pins, transactional fault rollback. |
| G10 Demo/E2E | PASS: deterministic actual owner/Task lifecycle/retry/fact and native server-shutdown raster/vector/cleanup scenarios. |
| G11 NFR/Security | PASS applicable engineering/security profile: retained capacity/convergence, bounded viewport, native cipher/keystore, licensed public cache/private-data isolation/wipe. iOS N/A; physical-device certification unclaimed. |
| G12 Evidence/Merge | PASS only at activation: exact PR-head/ordinary implementation merge and exact push, complete authorized report publication with its own normal checks/merge/push and completed CR75. Conditions below remain mandatory. |

## Observed checks

| Exact head | Run | Observed result |
|---|---|---|
| e937d5f217b5b221ba8b35d35d258dd6cc905698 |43048967448|Initial mobile type/lint and old schema expectation failures fixed; no acceptance. Superseded.|
|31918cb134b593e4f5346df8284fb76eee1ac0bc|43051171934|Static/contracts/runtime/migration PASS; Flutter50/APK PASS; new native GIS zero tiles FAIL. Unit20-minute timeout during Ubuntu DNS failure before tests.|
|172b40abce7e1c81460b22e6a83a3160d9ce5be7|43054617048|Superseded. Nested node:test inherited runner context and skipped child; **no domain acceptance** attributed.|
|542e99fc273fd5d444df95712a0ace93f75c4d09|43055664929|Actual owner8/8 zero skipped verified after removing recursive runner context and asserting named scenarios. Static/contracts/runtime/migration PASS; Flutter52/APK PASS; native3/4, GIS zero tiles FAIL. Unit20-minute dependency DNS timeout.|
|a45d70834aa61bcd538a100f025e4e48ca826337|43059399296|Actual owner9/9 zero skipped including first-subscription race; static/contracts/runtime/migration PASS; analyzer clean, Flutter52/APK PASS; native3/4, GIS zero tiles FAIL. Unit same setup stall, canceled on superseding dispatch.|
|69ac8fc0b05149cdba9c83a9541b450e24e663b9|43061289158|Typecheck/Lint/Contract/Migration/Runtime SUCCESS; Mobile analyzer clean, Flutter52/APK and all4 actual Android native scenarios SUCCESS. Unit20-minute timeout during dependency DNS failures; no full acceptance.|
|ce20d46d62831a833587b4ee89f061678f4979d1|43086770346|Pre-PR full CI all8 SUCCESS: API188/188, Flutter52/52, owner9/9 zero skipped, Android native4/4, contracts/static/migration/runtime. Source accepted; G12 publication/merge pending.|
|e12beaa8cc8a86bf47fc733d52e398c0bd946f7a|43088733764|Exact final PR79 head all8 SUCCESS; reviews/threads clear immediately before ordinary merge.|
|5f0d596296911888da20d4bbfbf97eb08efcf696|43090335620|Exact ordinary implementation merge push all8 SUCCESS, including full Unit and Android native; merge tree equals tested-head tree.|

Native diagnosis on a45d708: direct Dart style precheck200 and native style request succeeded, SDK complete fraction1.0, tile requests0. Exact pinned native13.5.0 [zoom calculation](https://github.com/maplibre/maplibre-native/blob/android-v13.5.0/src/mbgl/util/tile_cover.cpp#L149) maps256px tile at map zoom0 to source zoom1; [offline cover](https://github.com/maplibre/maplibre-native/blob/android-v13.5.0/platform/default/src/mbgl/storage/offline_download.cpp#L38) intersected that with fixture maxzoom0, yielding empty coverage. Fixture PNG and declared tileSize corrected consistently to512. All tile/pause/resume/offline pixel/vector/privacy/wipe assertions and wait bounds retained.

Local Docker daemon unavailable: probed once, no repeated Compose launch or local integration PASS claim. Local Flutter SDK absent; hosted analyzer/native evidence is required. Formatting uses standalone official Dart3.13.7. No dependencies/lockfiles/gate assertions/timeouts weakened; only the explicitly approved Unit runner selector changes.

## Limitations

Pinned maplibre_gl0.27.1 Android resume loses observer after process restart and returns ResumeRegionError. Production fallback restarts the same persisted partial region definition through supported plugin API; public resources may download again, explicitly disclosed in UI. Complete cached regions avoid restart. Native test covers pause, encrypted workspace reopen, persisted definition and restart; no process-kill/byte-range, physical-device/battery/ANR or iOS certification claimed.

Implementation PR79 merged normally at5f0d596. WP030 remains unstarted. G12 publication activation conditions below remain mandatory.

## Deterministic scenario and review

Owner fixture uses explicit manual field/operation/reference data, fixed effective/observed timestamps2026-11-04T00:00:00Z through04:00:00Z and fixed correlation. Random UUIDs/ephemeral ports isolate runs; they do not select business behavior. Actual Field correction, GIS approval with old pin retained, event failure/retry/replay, concurrent selection and first subscription, current permission withdrawal, HTTP guards, Task Create/Plan/Assign/Accept/Start/Complete and lost-response retry converge with one execution fact. Native fixture supplies a fixed512px RGB232/64/48 raster; it gates actual HTTP tile responses, pauses/reopens/restarts/resumes, stops the real server, checks cached pixels and rendered private vector, verifies native-cache isolation and wipes shared assets. Test policies/identity are explicit trusted fixtures; existing actual identity/session regressions also passed.

Self-review only; no independent reviewer claimed. Fixed findings: route/status/cursor validation, current scope/replay, feed-clock/head ordering and first-subscription convergence, atomic partial bundles/PURGE, migration preservation, persisted native observer recovery, fixture cleartext/zoom coverage and recursive node:test skipping. No acceptance assertion or timeout was relaxed. GitHub reviews/threads were empty immediately before merge; required aggregate strict=true, enforce_admins=true, conversation resolution=true, force pushes/deletions disabled. Main remained baseline1432b7b, PR head e12beaa was mergeable and exact PR-head run43088733764 all8 SUCCESS. Normal merge API enforced expected head; no auto-merge/bypass. Self-review recorded in PR79 comment6805491935.

## Complete approved changed-file inventory

Every row below is explicitly authorized by CR75, including the separate two debug paths and one Unit-runner amendment. Frozen literal path is preserved rather than reinterpreted.

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

## G12 publication activation and unlock decision

Implementation merge has exactly two parents: baseline1432b7bc81292d5fae7dbc3e4b07bb412a418c3e and tested heade12beaa8cc8a86bf47fc733d52e398c0bd946f7a. Merge tree `9bd6b1d5d769a98ac59d908186943770c8bf8c59` equals tested-head tree. Source/tests acceptance and report-only publication are separate records.

This final report path is already CR75-approved. Its publication must pass normal exact PR-head checks, ordinary merge and exact report-merge-SHA push CI, with live protection/reviews/threads verified. After observing those results, record the report PR/head/merge/run and completed closure in CR75. That activation makes G12 PASS and WP49-029 DONE without an infinite self-referential report rewrite. No unobserved report-publication PASS is asserted here.

Unlock decision: implementation PASS; G12/DONE only on that activation. Frozen manifest/static NOT_STARTED is intentionally unchanged as approved. WP030 is not started and must not be started by this closeout.

## Post-acceptance permission correction (not yet accepted)

Final review found that current owner geometry references alone were insufficient while an owner-removal event was pending: the old derived projection could retain geometry. A private diagnostic reproduced canRead=true with zero GIS policy calls after owner reference removal and GIS permission denial; this is not PostGIS acceptance evidence. The correction checks geometry actually retained in owned projections as well as current owner rows on read/pull. It writes no foreign data and adds no permission grants. A new actual Farm correction/current GIS denial/pull PURGE/delayed dispatcher/non-GIS metadata convergence scenario is mandatory in the hosted owner suite. All4 affected paths are already approved. Earlier source/report merges and successful CI remain historical facts but do not activate G12; CR75 stays OPEN until new full acceptance and corrected final publication.

Retained-feed extension: SyncService replays historical payloads but authorizes by current entity identity. After the cache drops geometry, reusing that identity would authorize old geometric feed rows as non-GIS metadata. The correction therefore retires a derived field projection identity whenever geometry presence changes. Existing PURGE/UPSERT and manifest completeness handle replacement; canonical Field/Task IDs and shared sync are unchanged. The actual regression now replays from bootstrap after real owner delivery and requires old IDs to PURGE, fresh metadata to UPSERT and all returned field projections to omit geometry/version/bounds/center under GIS denial. Earlier75b9682 owner10/API189 PASS covers the pre-delivery case only; the complete retained-replay extension requires new-head full CI.
