# WP49-026 Completion Report — GIS spatial foundation

Status: IMPLEMENTATION VALIDATED. G0–G11 PASS; G12 awaits exact final PR-head checks, ordinary merge and post-merge CI. No DONE or unobserved merge evidence claimed.

Baseline live main: `0ba90c70cb2b88556c3c01165fb2ec14ba44b476`.
Branch: `codex/wp49-026-gis`, separate initially clean worktree.
Date: 2026-11-02 Europe/Moscow. Original dirty checkout untouched.
[Scope CR #65](https://github.com/loktevila658-spec/agro-platform/issues/65),
[delegated owner approval](https://github.com/loktevila658-spec/agro-platform/issues/65#issuecomment-6584511976).
Approval precedes acceptance/runtime changes. It is not independent review.

## Authority and G0

DOC50 > DOC48 > DOC47 > DOC49 > DOC33/MASTER > domain contracts.
No latest-document-wins. DOC10/11 common canonical spatial/CRS/source/version rules,
DOC24 §§3/6–9 and GIS005/012–015/019–040/061–073/091–092/104–105/161/163–167/170,
GIS-T005–013/023–027, DOC34 geometry consumer boundary.
Frozen DOC49 manifest matches owner's supplied values verbatim:

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

G0 PASS before code. All dependency implementations and reports are merged and
their merges ancestors of baseline; current schema11 compatible. Reports read:
tests/evidence/WP49-{003,011,017}_COMPLETION_REPORT.md.
- WP003 PR3 merge `73dfd95e6196a5ccb5f253d656b1dede6570af18`.
  Live exact-SHA Actions query returned ZERO runs. Accepted merged report attributes
  historical local/PostGIS/migration/API checks to original PR. No historical CI
  PASS invented; this is the established evidence-reconstruction procedure.
- WP011 PR18 plus corrective19, merge
  `c66da8d67c019ca4a91556ff2289ed194040c13a`, actual event=push
  [38366585524](https://github.com/loktevila658-spec/agro-platform/actions/runs/38366585524),
  all7 then-required jobs individually SUCCESS; CR17 CLOSED/completed. Evidence-only
  report PR61 merged. Historical original readiness failure remains in that report.
- WP017 PR41 merge `99041cf69721040a9749b9d7cfca726ff7fea8c3`,
  event=push [38669122765](https://github.com/loktevila658-spec/agro-platform/actions/runs/38669122765)
  all7 jobs individually SUCCESS; report42/final closeout merged, CR40 completed.
- Prior W3 WP025 merge `73591bc241a4a64d76cbf62cd32dd87259ec2216`,
  event=push [41355973494](https://github.com/loktevila658-spec/agro-platform/actions/runs/41355973494)
  all8 SUCCESS, report64 merged, CR62 completed.
Static NOT_STARTED fields never used as completion evidence. No existing WP026
PR/CR/implementation branch found at preflight. Full live main SHA reconfirmed.
API src-only tsc, runtime imports/Docker/schema/migrations/test globs, web/mobile,
canonical contracts/codegen/event/permission regressions, storage/files/ClamAV,
integrations owner ports, dispatcher/inbox and complete CI workflow inspected.

## Unified expected/approved paths

Frozen raw roots stay verbatim, including uncompiled /apps/api/modules/gis.
Actual compiled runtime and necessary companion paths authorized by CR #65.
This unified table was complete and approved BEFORE first code; no manifest,
dependency, exit criterion or quality gate change. All45 exact expected paths:

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

## Implemented behavior and compatibility

Compiled GIS application module owns typed PostGIS4326 geometry assets, immutable
versions, append-only approve/reject/effective-time decisions, immutable sources,
staging, audit, receipts and outbox. It owns no LandPlot/Field/FieldSeason identity.
Future domain owners retain geometryVersionId; no foreign canonical writes.
Canonical 2D Polygon/MultiPolygon validation, geography area/method/version, no
silent repair/precision loss/overwrite. Corrections retain stable asset identity,
require current expected head version/reason; per-time reads select approved
effective winner, while historical version references remain resolvable.
Permission/action/tenant policy is trusted, immutable in composition, default deny,
checked before reads and again inside commands/replays. LOCAL_PRIMARY, shared
optimistic guard, transaction, idempotency, audit and existing dispatcher/inbox.

Dedicated GIS source ingress reuses real storage/scanner adapters; files' existing
media MIME allowlist unchanged. Source copied before awaits, scanned, SHA256 hashed,
private original retained. Read-only isolated GDAL handles GeoJSON/KML/KMZ/GPKG/SHP
bundle/WKT/WKB and explicit CSV coordinates; source CRS/encoding/layer/attributes/
feature provenance preserved. Bounded archive/time/memory/output checks, no remote
references/paths/VRT/extensions. Dry-run staging and preview create no canonical
geometry; explicit mapping, per-feature issues and exact spatial duplicate candidates.
ALL_OR_NOTHING/VALID_ONLY commit calls GIS owner commands within one transaction,
creates candidates only, replay safe and one batch cannot be committed twice.

Additive migration0012, schema12; only current-version regression expectations
advance. New versioned gis.geometry.changed event/action catalog and all4 generated
outputs regenerated together. No public HTTP API/OpenAPI or sync contract change.
Existing outbox delivery source enumeration expanded; lease/retry/inbox unchanged.
MapLibre GL JS5.23.0 and Flutter0.27.1 base uses network-free local style, honest
empty state, no fabricated fields/provider/credentials/location permissions.
Web /gis and authenticated native navigation; disposal releases renderer. No
offline region/task/sync package (WP029), land/farm/split/merge (WP027/028), agronomy,
remote sensing, exports, hardware/AI or production provider implementation.

## Tests and evidence so far

Acceptance unit tests RED before runtime (missing compiled GIS module); failure
recorded locally, not claimed as successful domain execution. API build, web
production build, targeted41/41 unit/schema/migration/contracts/permission tests,
full typecheck+architecture11/11, contract validation/codegen drift, lint capability
PASS (lint tool not configured/N/A); git diff --check PASS. UI mechanical detector
returned zero findings. Desktop and390px web browser inspection shows the actual
MapLibre canvas/controls and honest empty state, with no overflow. No weakened/removed test or skip.

Actual GDAL parser test attempted locally and failed before scenarios because
Python GDAL is absent. Real PostGIS integration attempted and failed before
scenarios because Docker Desktop is unable to start. No local parser/PostGIS PASS.
Full local Unit/Migration/Runtime attempted: blocked by unavailable Docker/GDAL,
not PASS. Local Mobile stops at flutter ENOENT. Hosted real-service checks below
resolve these environment limits without relabeling local failures.
Flutter absent locally; native smoke and unchanged offline regressions mandatory
in hosted Mobile. SDK provisioning attempts were read-only and unavailable;
no replacement of frozen project toolchain.

Deterministic scenario uses test-only geometry, source clock2026-11-02T00:00:00Z,
explicit versions/effective instants. Covers proposal->approval->correction/as-of,
races/stale conflict, old versions, tenant/current/revoked permissions/cloud denial,
invalid geometry, audit/outbox rollback and actual inbox retry/replay; real MinIO/
ClamAV/GDAL stage, dry-run, source hash/object provenance, invalid-point feature,
both commit modes and atomic owner failure. Representative10k spatial grid/GiST
plan and P95<=1500ms are observed in the successful hosted integration below.

| Gate | Current verdict |
|---|---|
| G0 | PASS — verified merged compatible prerequisites and accepted evidence |
| G1 | PASS locally — static/typecheck/architecture/contracts/diff |
| G2 | PASS — hosted clean/repeated/current/checksum-negative PostGIS schema12 |
| G3 | PASS — local targeted42/42; hosted API140/140, root15/15, migration5/5; no skips |
| G4 | PASS — actual PostGIS/MinIO/ClamAV/GDAL and production image runtime |
| G5 | PASS locally — unchanged HTTP, event codegen/drift |
| G6 | PASS — atomic producer, actual dispatcher/inbox retry/replay and batch rollback |
| G7 | PASS — default deny, current/revoked permissions, tenant/async-actor/cloud negatives |
| G8 | PASS — Flutter offline/persistence/sync/capacity regressions and native map; no new sync workflow |
| G9 | PASS — immutable original/hash/staging/version/decision/audit and reasoned corrections |
| G10 | PASS — fixed-source-clock actual PostGIS/storage/scanner/parser/owner/event scenario |
| G11 | PASS — bounded parser security/encoding/CRS, exact precision, 10k GiST P95=1.822ms<=1500ms, native render |
| G12 | PENDING MERGE — full45-path diff and review clear, approved CR; final PR-head and merge evidence pending |

## Exact validated code head and PR

Implementation PR is being prepared; its exact link/head/checks will be recorded
in CR #65 and final closeout below.
Code head `6f196513b56f762a3d67362978953c891f661d57`, exact workflow_dispatch
[41502255358](https://github.com/loktevila658-spec/agro-platform/actions/runs/41502255358)
SUCCESS, all8 jobs individually verified: Lint capability, Typecheck, Unit,
Contract, Migration, Runtime, Mobile and aggregate CI quality gates. This run
preceded PR creation. The report update changes no executable behavior; ordinary
PR CI must still pass on its precise final head before merge. No auto-merge/bypass.
API140/140, contracts20/20, config17/17, connectors2/2, root15/15, migration5/5;
Flutter34/34 plus2 actual Android emulator tests, enforce-lockfile, format/analyze,
APK and MapLibre local-style lifecycle. Deterministic10k query P95=1.821898ms,
actual GiST plan, actual positive spheroidal area, precise1e-20 import preserved.
First historical failed run remains failed; superseded41501385344 was cancelled
by the existing workflow concurrency rule after a new precision correction.

Supplemental dependency publication evidence rechecked during review: WP003
report PR36 merge `526d8a90ac076eec54ace955c7b61f5dc3617bf2`, exact event=push
[38659988701](https://github.com/loktevila658-spec/agro-platform/actions/runs/38659988701)
all7 SUCCESS; this does NOT invent CI for original PR3. WP011 report PR61 exact
merge `b62830ef3e7a673d5b5990e6a44b81ade12e72b9`, push41353416415 all8 SUCCESS.
WP017 final report PR43 merge `99c3f8b599c71d4c1b70abe4950bb654f66b4490`,
push38669938779 SUCCESS. Original G0 prerequisite implementation evidence remains
as recorded before code; these publication checks supplement it.

| Applicable frozen slice | Observable proof |
|---|---|
| GIS005/012–015/019–020; BR-GIS001/006/007 | GIS versions, source/status, explicit permissioned decisions/effective history; no Field/LandPlot mutation |
| GIS021–040; BR-GIS002/003; TZ50-039/040 | Typed4326, known source CRS, validation, geography area/method, GiST, bounded cut-antimeridian queries, canonical precision retained |
| GIS061–073 import portion / MASTER017 enabling core | Real formats, original hashes/attributes/feature metadata, preview/mapping/issues, dry-run, explicit commit modes/atomic owner commands, exact duplicate candidates |
| GIS091–092/104–105 base | Pinned MapLibre web/native local style; no unauthorized domain data/default provider; native lifecycle smoke |
| GIS161/163–167/170; INV01/06/09/10 | Trusted tenant policy, private scanned originals, bounded isolated parser, actual security/10k budget, immutable audit/outbox and replay |

This enables MASTER015/017 foundations; it does not claim completion of the entire
MASTER013–026 product lifecycle, field/season UI, advanced export or offline GIS
package assigned to neighboring WPs. Frozen scope is not promoted or rewritten.

## Hosted attempts and review findings

First workflow_dispatch run [41499222446](https://github.com/loktevila658-spec/agro-platform/actions/runs/41499222446)
on exact head `2c04c4b2c868dd4656c9e056c2bf9fe159bfbf51`: Lint/Typecheck/Contract/
Migration/Runtime SUCCESS. Unit FAIL138 PASS/1 FAIL: error-code sanitizer regex
omitted digits, truncating GIS_GEOJSON_RFC7946_REQUIRED to GIS_GEOJSON_RFC. The
strict expected error assertion remains; sanitizer now retains digits. Real GIS
PostGIS/MinIO/ClamAV owner/import/version/rollback/outbox scenario PASS, actual
GDAL3.8.4 format scenario PASS, representative10k GiST query P95=1.333252ms.
These focused results do not relabel the failed full Unit gate as PASS. Mobile SUCCESS, including enforce-lockfile/format0 changes/analyze,34 Flutter
tests, Android build and2 actual emulator tests (including MapLibre local style). Review also made PROPOSED explicit,
added cut antimeridian query and successful/all-effects-rollback ALL_OR_NOTHING
coverage, real KMZ success and projected3857->4326 normalization/unknown EPSG tests.
Review additionally snapshots actor/command inputs before asynchronous policy
checks; a new negative race test proves query tenant stays bound to authorized
identity. Final local targeted suite42/42 and root regression15/15 PASS.
No acceptance changed to accommodate a failure. All changes remain in CR65 paths. Final review also routes import commit from
retained original geometry, not rounded rendering GeoJSON; real PG acceptance
asserts preservation of1e-20 coordinates. Prior run41501385344 onab86b5c is
superseded by this final correction and will not be claimed as final-head evidence.

## Limits and closeout

No production/WAN/physical-device certification. Trusted deployment policy must
supply actual current permissions; no default role grants or source providers.
Parser deployment resource caps are explicit technical bounds, not invented
precision/tolerance/business data. Oversize sources require an approved processing
profile. Nonpolygon/Z/M/ambiguous encoding/unknown CRS stage issues or fail closed.
No automatic repair, arbitrary fuzzy merge, accounting/land facts or future scope.
Sources retained privately; failed DB command may leave an unreferenced private
object; no unapproved destructive lifecycle cleanup. Referenced evidence is retained.
Mobile lock entries use exact published package metadata/hashes; Flutter hosted
enforce-lockfile validated resolution. Native plugin requires JDK21 in CI.
Implementation PR and validated code-head run are recorded above. Final exact
PR-head/ordinary merge/push-run and CR closeout evidence remain pending.
WP49-027 is not started.
