# WP49 Completion Report

- WP ID: WP49-026
- Title: GIS spatial foundation
- Status: **DONE — all applicable G0–G12 PASS**
- Baseline live main: `0ba90c70cb2b88556c3c01165fb2ec14ba44b476`
- Implementation branches: `codex/wp49-026-gis`, `codex/wp49-026-csv-validation`
- Final corrective executable/PR head: `5289c3ef2b24fb161a64dc4c87f5112a2a30dd61`
- Original validated executable code: `6f196513b56f762a3d67362978953c891f661d57`
- Original implementation PR head: `146bfd9f0c03e4b0f15ce01d37cc49cf3d4eb2a3`
- [Implementation PR #66](https://github.com/loktevila658-spec/agro-platform/pull/66), original merge `4d02a867c72a6f88b49a512d4028e449cb426950`
- [Corrective PR #67](https://github.com/loktevila658-spec/agro-platform/pull/67), final ordinary merge `97574a4768085ec8e9c72bc96dd7372527f356f5`
- Exact corrective PR-head [run 41514111313](https://github.com/loktevila658-spec/agro-platform/actions/runs/41514111313): SUCCESS all8
- Exact merge-SHA event=push [run 41516292979](https://github.com/loktevila658-spec/agro-platform/actions/runs/41516292979): SUCCESS, all8 jobs individually verified
- Date: 2026-11-02 Europe/Moscow
- [Scope CR #65](https://github.com/loktevila658-spec/agro-platform/issues/65), [delegated owner approval](https://github.com/loktevila658-spec/agro-platform/issues/65#issuecomment-6584511976), [final closeout](https://github.com/loktevila658-spec/agro-platform/issues/65#issuecomment-6587567965)

This report reconciles observed implementation evidence in the already approved
report path. Publication-only checks for the reconciliation are recorded in CR #65;
no unobserved publication run is asserted here. Original dirty checkout untouched;
all implementation took place in a separate initially clean worktree.

## 1. Prerequisites verified

Authority: DOC50 > DOC48 > DOC47 > DOC49 > DOC33/MASTER > detailed contracts.
No latest-document-wins. G0 PASS before code; all dependency implementations and
reports were merged and compatible with baseline schema11. Their merges are
ancestors. Actual live main SHA, branches/PR/CR search, src-only tsc/AppModule/
Docker wiring, schema/migrations/test globs, web/mobile, OpenAPI/codegen/catalog
regressions, files/storage/ClamAV, integration owner ports, dispatcher/inbox and
all7 CI quality jobs+aggregate were inspected before implementation.

| Dependency | Accepted completion and exact evidence |
|---|---|
| WP49-003 | PR3 merge73dfd95e6196a5ccb5f253d656b1dede6570af18; original exact-head/merge Actions query returned ZERO runs. Accepted report explicitly attributes historical local/PostGIS/migration/API checks; no historical CI PASS invented. Report PR36 merge526d8a90ac076eec54ace955c7b61f5dc3617bf2, actual push38659988701 all7 SUCCESS supplements publication evidence. |
| WP49-011 | PR18 plus corrective19 mergec66da8d67c019ca4a91556ff2289ed194040c13a; exact push38366585524 all7 SUCCESS; CR17 CLOSED/completed. Report PR61 mergeb62830ef3e7a673d5b5990e6a44b81ade12e72b9/push41353416415 all8 SUCCESS. Original readiness failure remains in its report. |
| WP49-017 | PR41 merge99041cf69721040a9749b9d7cfca726ff7fea8c3/push38669122765 all7 SUCCESS; CR40 completed; report42/final43 merged. Final report43 merge99c3f8b599c71d4c1b70abe4950bb654f66b4490/push38669938779 SUCCESS. |

Reports: tests/evidence/WP49-003_COMPLETION_REPORT.md,
WP49-011_COMPLETION_REPORT.md and WP49-017_COMPLETION_REPORT.md. Publication
supplements were rechecked during review and do not replace historical execution
facts. Prior W3 WP49-025 merge73591bc241a4a64d76cbf62cd32dd87259ec2216/
push41355973494 all8 SUCCESS, report64 merged and CR62 completed. Static
NOT_STARTED fields never served as evidence of incompletion or completion.

Frozen manifest matched the supplied values verbatim, with no discrepancy:
```yaml
id: WP49-026
title: GIS spatial foundation
wave: W3
release: MVP
depends_on:
- WP49-003
- WP49-011
- WP49-017
allowed_paths_raw: /apps/api/modules/gis /apps/web /apps/mobile
exit_criteria: PostGIS, geometry versions, MapLibre base, imports.
```

## 2. Scope implemented

SpecRefs: DOC49/DOC50 execution, DOC48 frozen scope, DOC47/REV47 GIS ownership;
DOC10/11 shared fields/CRS/version rules, DOC24 §§3/6–9 and detailed spatial/import/
map/operations contracts, DOC34 consumes GIS geometry authority. MASTER-015/017
enabling foundation, BR-GIS-001/002/003/006/007, TZ50-034/035/039/040, INV-01…INV-12.
No FUTURE/REJECTED requirement or neighboring WP was promoted.

GIS owns typed geometry assets, immutable versions, append-only approve/reject
and effective-time decisions, immutable sources/staging, audit, command receipts
and outbox. Stable geometry identity survives corrections; expected head version
and reason required. Only approved effective versions appear in bounded spatial
reads; historical facts retain explicit version references. Source/time/CRS/
available accuracy/method/quality metadata retained. No silent repair/overwrite,
no Field/LandPlot/FieldSeason identity or foreign canonical writes.

Import scans and hashes a bounded original, retains it privately, then inspects/
stages/previews/mapping/validates. GeoJSON, KML/KMZ, GeoPackage, SHP bundle,
WKT/WKB and explicit CSV coordinate mapping use an isolated read-only GDAL worker.
Per-feature issues and exact spatial duplicate candidates are exposed. Explicit
ALL_OR_NOTHING or VALID_ONLY calls GIS owner commands in the same transaction.
Imports create candidates only, never automatically approve or create a field.
Original attributes and mapped metadata remain resolvable through batch/feature
provenance; replay is one-effect and a batch cannot commit twice.

Pinned MapLibre GL JS5.23.0 and Flutter0.27.1 provide web /gis and authenticated
native navigation with a local background-only style and honest empty state.
No remote provider, fake fields, credentials or location permission; native map
loads without WAN and disposes its renderer. Offline region/task/field cache and
sync package belong to WP49-029; land/farm/season/split/merge to WP49-027/028. No public
GIS HTTP endpoint, advanced maps, exports, agronomy, rasters, accounting, hardware
or AI implementation.

| Applicable slice | Observable proof |
|---|---|
| GIS-005/012–015/019–020 | Immutable versions/source/status, permissioned effective decisions and correction history |
| GIS-021–040 | Typed4326, known source CRS, validity, geography method/version, GiST, bounded cut-antimeridian reads, canonical precision retained |
| GIS-061–073 import portion / MASTER-017 foundation | Actual formats, immutable original hash/attributes/feature provenance, preview/mapping/issues, dry-run, explicit atomic commit modes and exact duplicates |
| GIS-091–092/104–105 base | Pinned provider-neutral web/native renderer; no unauthorized domain layers or invented attribution |
| GIS-161/163–167/170 | Trusted tenant permissions, private scanned originals, bounded parser, actual 10k budget, audit/outbox and replay |

This does not claim the entire MASTER-013–026 product lifecycle or later-WP UI.

Corrective PR #67 fixes existing GIS-066/068/165 import-boundary contracts in
only the two originally approved parser/test paths: duplicate CSV headers and
unnamed surplus cells fail explicit mapping; quoted multiline attributes are
preserved. KML DTD/prohibited references are checked on parsed XML structure
across encodings/namespaces. A validated temporary copy is encoded as UTF-8 for
GDAL identification; original bytes/hash remain unchanged. Positive UTF-16 input
compares geometry and Cyrillic attributes with UTF-8; negative encoded DTD/links
remain blocked. No source/business contract/schema/permission/gate change or new
scope path. This correction is part of WP49-026, not a new WP.

## 3. Changed files

Single unified complete pre-code matrix:45 exact files, approved in CR #65 before
first acceptance/runtime edits. Literal frozen roots remain verbatim; compiled
src runtime and companion files have explicit CR authorization. No manifest,
dependency, release, exit criterion, compiler or gate weakening. Published PR
filenames match this exact matrix with no outside or missing path. This report-only
reconciliation changes only its already approved evidence path.

| Path | Purpose | Authorization |
|---|---|---|
| apps/api/src/modules/gis/gis.types.ts | Internal geometry/command/source/import contracts | CR #65 |
| apps/api/src/modules/gis/gis.validation.ts | Strict CRS/geometry/context/limits validation; UUIDv7 | CR #65 |
| apps/api/src/modules/gis/gis.registry.ts | Trusted current permission policy, deny by default | CR #65 |
| apps/api/src/modules/gis/gis.parser.ts | Bounded isolated parser invocation; no URLs or shell | CR #65 |
| apps/api/src/modules/gis/gis-parser.py | Read-only GDAL format allowlist, archive/CRS/encoding limits and transformation | CR #65 |
| apps/api/src/modules/gis/gis.service.ts | GIS-owned proposals, approval/rejection/correction, version/as-of/bbox reads, audit/outbox/idempotency | CR #65 |
| apps/api/src/modules/gis/gis-imports.service.ts | Scanned original objects, staging/preview/mapping/issues, explicit commit mode, atomic GIS owner commands | CR #65 |
| apps/api/src/modules/gis/gis.module.ts | Actual compiled Nest/runtime composition and bounded pools | CR #65 |
| apps/api/src/modules/gis/README.md | Authority/SoT/format/runtime/limits and future owner integration contract | CR #65 |
| apps/api/src/app.module.ts | Register compiled GIS module | CR #65 |
| apps/api/Dockerfile | GDAL/Python dependency and parser file runtime copy | CR #65 |
| apps/api/src/modules/files/files.module.ts | Export existing storage/scanner application tokens for GIS-specific source ingestion; existing media allowlist unchanged | CR #65 |
| apps/api/src/modules/events/events.types.ts | Explicit GIS producer source | CR #65 |
| apps/api/src/modules/events/outbox-dispatcher.service.ts | GIS outbox discovery/loading using existing inbox/retry protocol | CR #65 |
| database/migrations/0012_gis_spatial_foundation.sql | Typed geometry/GiST/versions/staging/immutable provenance/audit/outbox; expand event source CHECK | CR #65 |
| apps/api/src/schema-version.service.ts | Expected schema12 | CR #65 |
| apps/api/test/schema-version.test.mjs | current12/ahead13, retain malformed/behind negatives | CR #65 |
| apps/api/test/identity.integration.test.mjs | Only current schema11->12 assertion | CR #65 |
| database/test/migrate.test.mjs | Contiguous12 and GIS schema/immutable/index checks | CR #65 |
| database/test/database.integration.test.mjs | Clean/repeated/current12 and GIS schema checks | CR #65 |
| apps/api/test/gis.unit.test.mjs | Deny/shape/limits/CRS/source/version negative acceptance tests | CR #65 |
| apps/api/test/gis.parser.test.mjs | Actual GDAL formats/CRS/archive/encoding fixtures generated in temp, no production fakes | CR #65 |
| apps/api/test/gis.integration.test.mjs | Real PostGIS version/conflict/correction/tenant/area/GiST/performance/import/rollback/outbox demo | CR #65 |
| apps/api/test/permissions.test.mjs | Exact GIS action catalog additions; retain original registry/grant/tenant negatives | CR #65 |
| events/catalog/index.yaml | Versioned GIS changed event, producer/source/envelope metadata | CR #65 |
| permissions/catalog.yaml | Explicit tenant GIS read/propose/approve/reject/import actions, no default grants | CR #65 |
| packages/contracts/src/generated/contracts.ts | Regenerated canonical event outputs | CR #65 |
| packages/contracts/generated/dart/contracts.dart | Regenerated canonical event outputs | CR #65 |
| packages/contracts/generated/manifest.json | Generated hashes | CR #65 |
| apps/mobile/lib/generated/contracts.dart | Existing codegen mobile output; frozen authorized | Frozen app root |
| packages/contracts/test/contracts.test.mjs | Exact new event assertions; retain existing contracts | CR #65 |
| tests/contracts.test.mjs | Exact new event assertions; retain existing contracts | CR #65 |
| apps/pnpm-lock.yaml | Pinned web MapLibre resolution | CR #65 |
| apps/web/package.json | Pinned MapLibre GL JS | Frozen app root |
| apps/web/src/app/gis/page.tsx | Base map route with honest empty/error state | Frozen app root |
| apps/web/src/app/gis/gis-map.tsx | Provider-neutral MapLibre canvas, bounded geometry inputs and cleanup | Frozen app root |
| apps/web/src/app/gis/gis.css | Responsive accessible map layout and status | Frozen app root |
| apps/mobile/pubspec.yaml | Pinned native MapLibre Flutter package | Frozen app root |
| apps/mobile/pubspec.lock | Resolved exact MapLibre dependencies | Frozen app root |
| apps/mobile/lib/widgets/gis_map.dart | Network-free default MapLibre base, lifecycle disposal; optional trusted configured style | Frozen app root |
| apps/mobile/lib/main.dart | Authenticated navigation to base map; no new sync protocol | Frozen app root |
| apps/mobile/test/gis_map_test.dart | Base map contract/empty state tests | Frozen app root |
| apps/mobile/integration_test/gis_map_test.dart | Actual native base-map smoke without WAN/provider credentials | Frozen app root |
| .github/workflows/ci-quality-gates.yml | Provision real GDAL for Unit parser tests and JDK21 required by pinned native plugin; all existing gates unchanged | CR #65 |
| tests/evidence/WP49-026_COMPLETION_REPORT.md | Unified path matrix/G0-G12/exact commit PR run CR and closeout evidence | CR #65 |

## 4. Database / contracts

Expand-only migration0012, schema12. GIS-owned geometry_head, geometry_version,
geometry_decision, import_batch, feature_staging, audit, command_idempotency and
outbox_event. Canonical2D MultiPolygon4326, ST_IsValid/nonempty constraints,
GiST and tenant composite references. Area uses PostGIS geography spheroid,
method/library version retained; business declared area is not invented or
replaced. Old versions, decisions, sources, staging, audit/outbox are immutable;
head identity cannot change or be hard deleted. As-of reads preserve old boundary
interpretation. Imported owner effects use original normalized geometry, never a
rounded rendering representation; exact1e-20 preservation is tested.

OpenAPI: unchanged, no public HTTP contract. Event: additive version1.0.0
`gis.geometry.changed`, producer gis, nine existing envelope metadata fields;
source enumeration/dispatcher extended, existing lease/retry/inbox semantics kept.
All4 canonical TypeScript/Dart/mobile/hash outputs regenerated. Permissions:
`gis.read`, `gis.propose`, `gis.approve`, `gis.reject`, `gis.import`, all tenant
scoped; no default role grants. Trusted current policy, actor snapshot before
async checks, deny-by-default and LOCAL_PRIMARY on mutations. Shared optimistic
guard, idempotency, transaction, audit and outbox; no Redis business authority.

GIS source ingress reuses existing private MinIO and real ClamAV adapters through
exported tokens; media attachment MIME allowlist unchanged. Missing scanner/
storage/parser fails closed. No public buckets, raw object paths/URLs, embedded
provider credentials or binary database storage. Production image installs GDAL/
Python and copies the parser with compiled runtime; CI provisions real GDAL and
JDK21 required by the pinned native plugin. No test/check removed.

## 5. Tests and quality gates

Acceptance unit tests RED before runtime (missing GIS module). Local final
API/web builds, targeted42/42, root15/15, static+architecture11/11, contracts/
codegen drift and git diff --check PASS. Lint capability PASS/N/A: project has no
configured lint tool. Mechanical UI detector0 findings; desktop and390px browser
inspection shows actual MapLibre controls/canvas and readable empty state.

Local GDAL/PostGIS/full Unit/Migration/Runtime attempts failed before relevant
scenarios because GDAL/Docker Desktop unavailable; local Mobile stops at flutter
ENOENT. These are not recast as local PASS. Hosted full real-service/native checks
resolve those limits: API140/140, contracts20/20, config17/17, connectors2/2,
root15/15, migration5/5, Flutter34/34 plus2 actual Android emulator tests,
enforce-lockfile, format0 changes, analyze, APK and native MapLibre lifecycle.
No skipped tests or weakened assertions. Actual parser environment GDAL3.8.4.

| Exact run | Decision |
|---|---|
| workflow_dispatch41499222446, head2c04c4b2c868dd4656c9e056c2bf9fe159bfbf51 | FAILED Unit138 PASS/1 FAIL: error sanitizer stripped digits from RFC7946 code. Strict assertion retained; sanitizer fixed. Other quality jobs incl native passed. |
| workflow_dispatch41501385344, headab86b5c1e1f71c4a38359a432d4ccddeff6f0f2f | CANCELLED/superseded by final precision correction; never claimed final-head PASS. |
| workflow_dispatch41502255358, code6f196513b56f762a3d67362978953c891f661d57 | SUCCESS all8, before PR creation. Following146bfd9 only docs/evidence. |
| pull_request41504803803, final head146bfd9f0c03e4b0f15ce01d37cc49cf3d4eb2a3 | SUCCESS all8 on exact PR head before merge. |
| push41507077817, original merge4d02a867c72a6f88b49a512d4028e449cb426950 | Attempt1 FAILED Mobile Maven lookup for two Kotlin2.2.21 jars; Flutter34/34 and other jobs passed. Both exact official URLs returned HTTP200; unchanged failed-jobs retry attempt2 SUCCESS all8. Original failure retained. |
| workflow_dispatch41508856176, head00a8d924cea2c96b766274ae7d94181b4a8f3601 | CANCELLED/superseded by encoded KML guard; not final-head evidence. |
| workflow_dispatch41510468074, headcbc70754e56a51caae8ebc5690a9bbab64b0bbdf | Overall CANCELLED/superseded; Unit FAILED new positive UTF-16 GDAL3.8 identification. Assertion retained/strengthened; temporary encoding normalization fixed the implementation. |
| workflow_dispatch41511712980, corrective head5289c3ef2b24fb161a64dc4c87f5112a2a30dd61 | SUCCESS all8 before corrective PR. API140/140 and real parser/PG/native cases including CSV/XML fixes. |
| pull_request41514111313, corrective head5289c3ef2b24fb161a64dc4c87f5112a2a30dd61 | SUCCESS all8 exact corrective PR head before ordinary merge. |
| push41516292979, final merge97574a4768085ec8e9c72bc96dd7372527f356f5 | SUCCESS all8 on exact ordinary merge SHA. |

Eight jobs individually verified: Lint capability, Typecheck, Unit, Contract,
Migration, Runtime, Mobile and aggregate CI quality gates. Review fixes additionally
cover CSV/XML source fidelity/security, explicit PROPOSED, immutable async actor binding, antimeridian/effective
history, real KMZ/projected CRS and full-batch rollback/precision. No independent
reviewer claimed; no GitHub review submissions/unresolved threads/blocking findings.
Protected main required current CI quality gates with enforce_admins; no bypass
actors, auto-merge/admin/check bypass. Merge has two parents and tested-head tree.

| Gate | Final verdict |
|---|---|
| G0 | PASS — merged compatible prerequisites and accepted exact evidence |
| G1 | PASS — static/typecheck/architecture/contracts/diff; applicable formatting |
| G2 | PASS — actual clean/repeated/current/checksum-negative schema12 PostGIS |
| G3 | PASS — targeted42/42 and full hosted suites, no skips |
| G4 | PASS — real PostGIS/MinIO/ClamAV/GDAL and production image/runtime |
| G5 | PASS — unchanged HTTP, additive event codegen and compatibility/drift |
| G6 | PASS — atomic producer/owner/outbox and actual dispatcher/inbox retry/replay |
| G7 | PASS — default/current/revoked/tenant/async actor/cloud negatives |
| G8 | PASS for applicable unchanged offline/persistence/sync/capacity/native regressions; no new sync workflow |
| G9 | PASS — immutable originals/hash/staging/versions/decisions/audit and reasoned corrections |
| G10 | PASS — fixed-source-clock actual owner/import/storage/event scenario |
| G11 | PASS — parser/encoding/archive/CRS security, exact precision and10k GiST threshold/native |
| G12 | PASS — complete report/45 approved paths/review, approved ordinary merge and exact push success; CR #65 closed completed |

## 6. Deterministic demo / evidence

Scenario WP49-026-GIS: propose->approve->correct/as-of; stale/concurrent conflicts,
retained versions, cut antimeridian, invalid geometry, current/revoked/tenant/cloud
permissions, audit/outbox failure, raw source/scan/hash/object provenance, dry-run,
invalid point feature, both commit policies, two owner effects rolled back by final
batch audit failure, precise1e-20 and actual inbox retry/replay. All PASS.
Source clock2026-11-02T00:00:00Z, explicit versions/effective instants; isolated
fixture IDs do not decide outcomes.10k synthetic test-only spatial grid, actual
GiST plan and service query P95=2.343044ms in final corrective pre-PR run41511712980 (limit1500ms).
No production reference GIS values or fabricated provider results.

Artifacts: apps/api/test/gis.unit.test.mjs, gis.parser.test.mjs and
gis.integration.test.mjs; database/test/migrate.test.mjs and
database.integration.test.mjs; apps/mobile/test/gis_map_test.dart and
apps/mobile/integration_test/gis_map_test.dart. Exact CI job logs in runs above
contain deterministic scenario output, parser/native cases and all regressions.

## 7. Limitations / follow-ups

No production/WAN/physical-device certification. Trusted deployment supplies real
current permissions; no default grants/provider profiles. Internal GIS application
ports are the foundation; no new public API or import UI is promised.2D polygons
baseline; points/tracks/unsupported Z/M/ambiguous encoding/unknown CRS remain
issues or fail closed, never fabricated boundaries. RFC7946 cut MultiPolygons are
supported; uncut antimeridian input retains supplied planar semantics and callers
should cut ambiguous interiors explicitly. No automatic repair/fuzzy merge.

Explicit technical deployment bounds:16MiB source/decompressed/parsed payload,
32 archive members/layers,100x expansion,1000 features,5000 vertices, CPU15s,
wall20s/memory768MiB/output16MiB, bounded bbox3600 square degrees and1000 responses.
No invented business precision/tolerance. Larger sources require an approved
processing profile. Original private evidence retained; failed DB transaction can
leave an unreferenced private object. No destructive cleanup/retention policy was
invented. Existing media MIME/security and offline sync contracts unchanged.
No land/field/season/agronomy/rasters/advanced maps/exports/provider/accounting/
hardware/AI scope. CR #65 (CR-0026) is the sole scope authorization; no scope amendment needed.

## 8. Unlock decision

PASS — WP49-026 DONE, applicable G0–G12 and frozen exit criteria evidenced.
CR #65 closed completed with exact head/merge/push evidence and delegated approval.
WP49-027 becomes eligible because WP49-025 and WP49-026 are complete; it is NOT started.
No general wave or other dependent WP unlock is asserted. Stop at WP49-026.
