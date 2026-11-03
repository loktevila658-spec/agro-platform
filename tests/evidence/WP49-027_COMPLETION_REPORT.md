# WP49-027 Completion Report — LandPlot

Date: 2026-11-03 Europe/Moscow. Branch: codex/wp49-027-land.
Status: IN PROGRESS — G12 pending exact hosted/head/merge/governance evidence.
Baseline live main: `92b6a5318a526d8ac7ba58dbac0305112dbc3fb8`.
Scope CR: [CR-0027 #69](https://github.com/loktevila658-spec/agro-platform/issues/69).
[Delegated approval before implementation](https://github.com/loktevila658-spec/agro-platform/issues/69#issuecomment-6597195848).

## 1. Prerequisites verified

G0 PASS. Live main matched expected baseline. Clean isolated checkout in
/private/tmp/agro-wp49-027-land, branch codex/wp49-027-land; old dirty checkout
untouched. No unfinished WP027 branch/PR/CR found (prior closeout mentions excluded).
Both dependency merges ancestors; static NOT_STARTED is not completion evidence.
- WP025 implementation PR63, ordinary merge73591bc241a4a64d76cbf62cd32dd87259ec2216;
  exact event=push [41355973494](https://github.com/loktevila658-spec/agro-platform/actions/runs/41355973494)
  all8 jobs individually SUCCESS. CR62 CLOSED/completed and final governance
  verified; DONE report merged, report-only PR64 merge0ba90c70cb2b88556c3c01165fb2ec14ba44b476.
- WP026 PR66 + corrective67, final executable merge97574a4768085ec8e9c72bc96dd7372527f356f5;
  exact event=push [41516292979](https://github.com/loktevila658-spec/agro-platform/actions/runs/41516292979)
  all8 individually SUCCESS, CR65 CLOSED/completed and final comments verified.
  DONE report PR68 merge92b6a5318a526d8ac7ba58dbac0305112dbc3fb8, exact push41520797527 SUCCESS.
Schema12/API/events compatible. MasterData owns Material/UOM and source policies,
not LandPlot. GIS owns geometry versions/import evidence; no canonical owner change.

## 2. Scope implemented

AGENTS/CODEX_INSTRUCTIONS, SPEC_AUTHORITY/RELEASE_BASELINE/IMPLEMENTATION_ORDER/
QUALITY_GATES/CHANGE_CLASSES/invariants inspected on main. DOC50 execution > DOC48
scope/RTM > DOC47 canonical ownership/REV47 > DOC49 graph, then DOC10 common fields/
land_plot/land_right, DOC11 history, DOC23 external registry reference SoT, DOC24
canonical snapshots and GIS-015/016/017/019/020/047/048/049/054/055; DOC34 consumes
GIS ownership. DOC48 MASTER land/cadastral mappings and DOC50 spatial/authority
requirements apply without promoting broader map/provider/field features. No
latest-document-wins. Frozen manifest byte-identical:
```yaml
id: WP49-027
title: LandPlot
wave: W3
release: MVP
depends_on:
- WP49-025
- WP49-026
allowed_paths_raw: /apps/api/modules/land
exit_criteria: cadastre refs, geometry history, rights metadata.
```

Tenant UUIDv7 parcel identity, optional immutable organization context, documented
ACTIVE status, opaque cadastral refs and separate declared area. Reviewed immutable
snapshots preserve source/profile/version/capture/hash/attributes, explicit GIS
version and documentary OWNERSHIP/LEASE metadata/dates. Empty rights remain unknown;
no cadastral inference of legal title. Correction requires version/reason, preserves
before/after and previous snapshot chain. Stable source/effective-context claims
cannot be reassigned across parcels. GIS permission-checked transaction-bound query
is the only geometry integration; no foreign SQL or geometry duplication. No public
HTTP route, transport/auth redesign, provider, Field/Season or UI feature.

## 3. Changed files / complete pre-code scope

Literal frozen path is outside src-only compiler. One complete pre-code CR approved
all28 exact paths below; no silent manifest normalization. Existing test glob,
Docker dist layout, schema assertions, strict event/action tests, four generated
outputs and Completion Report path inspected before edits. No package, compiler,
Docker, CI/glob, fixed fixture or OpenAPI change required. All paths are CR additions.

| Path | Why required | Authorization | Verification |
|---|---|---|---|
| apps/api/src/modules/land/land.types.ts | Internal LandPlot/snapshot/right/reference contracts and explicit actions | CR-0027 additional | Unit/typecheck |
| apps/api/src/modules/land/land.validation.ts | Strict fields, provenance, metadata dates and bounds; no invented national cadastre syntax | CR-0027 additional | Unit negative cases |
| apps/api/src/modules/land/land.registry.ts | Trusted current tenant permission callback; deny by default | CR-0027 additional | Permission negatives |
| apps/api/src/modules/land/land.service.ts | Local create/correction/read/history, immutable snapshots/reference claims, GIS owner-query integration, atomic audit/outbox/receipt | CR-0027 additional | Real PostGIS deterministic integration |
| apps/api/src/modules/land/land.module.ts | Compiled Nest application composition; bounded pool lifecycle | CR-0027 additional | Build/runtime |
| apps/api/src/modules/land/README.md | Authority/SoT, metadata scope and deployment/retention limits | CR-0027 additional | Review |
| apps/api/src/modules/gis/gis.service.ts | Narrow permission-checked transaction-bound immutable version/source query contract; no existing behavior change | CR-0027 additional | Owner boundary/tenant/import integration |
| apps/api/src/app.module.ts | Register LandModule in actual runtime | CR-0027 additional | Build/runtime |
| database/migrations/0013_land_plot.sql | Owned head/snapshot/cadastral-reference/audit/receipt/outbox, immutable history/composite tenant relationships; event source CHECK | CR-0027 additional | Real clean/repeated migration and negative constraints |
| apps/api/src/schema-version.service.ts | Expected current schema13 | CR-0027 additional | Schema API |
| apps/api/test/schema-version.test.mjs | Current13/ahead14, retain all malformed/behind negatives | CR-0027 additional | Unit |
| apps/api/test/identity.integration.test.mjs | Current schema assertion12->13 only | CR-0027 additional | Regression |
| database/test/migrate.test.mjs | Contiguous13 and new schema/immutability contracts | CR-0027 additional | Migration unit |
| database/test/database.integration.test.mjs | Clean/repeated/count/current13 and new schema checks | CR-0027 additional | Real PostGIS |
| apps/api/test/land.unit.test.mjs | RED validation/registry/runtime/boundary tests | CR-0027 additional | Targeted unit |
| apps/api/test/land.integration.test.mjs | RED real-PG land/cadastre/history/rights/GIS/import/tenant/permissions/concurrency/rollback/outbox scenario | CR-0027 additional | Hosted full Unit |
| apps/api/test/permissions.test.mjs | Append exact Land actions and registry equality, preserve prior actions and negatives | CR-0027 additional | Permission regression |
| apps/api/src/modules/events/events.types.ts | Explicit land source | CR-0027 additional | Typecheck |
| apps/api/src/modules/events/outbox-dispatcher.service.ts | Discover/load land outbox through existing delivery/inbox semantics | CR-0027 additional | Integration retry/replay |
| events/catalog/index.yaml | Versioned metadata-only land.plot.changed event; no invented consumer | CR-0027 additional | Contract validation |
| permissions/catalog.yaml | Tenant land.read/create/correct actions, no default role grants | CR-0027 additional | Permission regression |
| packages/contracts/src/generated/contracts.ts | Regenerated event contract | CR-0027 additional | Codegen drift |
| packages/contracts/generated/dart/contracts.dart | Regenerated event contract | CR-0027 additional | Codegen drift |
| packages/contracts/generated/manifest.json | Regenerated source/output hashes | CR-0027 additional | Codegen drift |
| apps/mobile/lib/generated/contracts.dart | Existing generator output only; no mobile feature | CR-0027 additional | Codegen drift/mobile regression |
| packages/contracts/test/contracts.test.mjs | Append exact event to existing contract assertions | CR-0027 additional | Contract regression |
| tests/contracts.test.mjs | Append exact event to existing root assertions | CR-0027 additional | Contract regression |
| tests/evidence/WP49-027_COMPLETION_REPORT.md | Full G0-G12/path/requirement/CI/PR/CR report and post-merge reconciliation | CR-0027 additional | Evidence review |

## 4. Database / contracts

Additive migration0013_land_plot.sql, expected schema13. Owned head/snapshot/
reference/audit/idempotency/outbox. Composite tenant organization and current
snapshot/revision pointer FKs; immutable histories/references and reasoned previous
revision chain. No spatial SQL/data owned by Land; GIS remains authoritative.
Commands LOCAL_PRIMARY/current server permission/strict validation/transaction/
shared optimistic guard/idempotency/atomic audit/outbox. New land.plot.changed1.0.0
metadata event uses existing dispatcher/inbox, no new production consumer. Three
tenant actions land.read/create/correct, no grants. Codegen4 outputs regenerated
from catalog; exact previous event/actions retained. OpenAPI unchanged.

## 5. Tests and quality gates

RED Land unit test before runtime: missing compiled LandRegistry (module absent),
not a domain-rule failure claim. Targeted local41/41 PASS after implementation:
Land validation/default deny/boundary, all permission negatives, schema, migration
units, root/package contract regressions. Initial development failures (catalog
entry placement, new migration-test helper typo) fixed without relaxing assertions.
Local Docker probe: Docker Desktop unable to start. No local PostGIS/runtime PASS
claimed; exact hosted workflow_dispatch required before PR. Flutter/GDAL capability
and project final gates recorded below as observed, never UNKNOWN->PASS.
Local targeted real-PG scenario attempt failed at Docker image build before DB
startup. Flutter absent and /usr/bin/python3 lacks osgeo; no destructive reset,
repeated Docker attempts, test skips or CI changes. Hosted evidence is required.

| Gate | Current evidence |
|---|---|
| G0 | PASS — dependency exact pushes/closed CRs/merged reports/compatibility |
| G1 | PASS local typecheck/architecture11/11 and lint capability (lint N/A); hosted pending |
| G2 | Pending real clean/repeated schema13 migration |
| G3 | Targeted41/41 PASS; full hosted Unit pending |
| G4 | Pending real PostGIS and runtime |
| G5 | PASS local contract validation/codegen drift and targeted regressions; hosted pending |
| G6 | Pending real atomic effects/dispatcher/inbox scenario |
| G7 | Targeted default-deny/catalog negatives PASS; real tenant/replay pending |
| G8 | Pending unchanged offline/mobile/native regressions; no new offline write |
| G9 | Pending real immutable correction/provenance scenario |
| G10 | Pending deterministic real-PG scenario |
| G11 | Pending applicable hosted security/bounds/regression gates |
| G12 | Pending exact approved diff, review, hosted checks, ordinary merge, exact push and CR closure |

## 6. Deterministic demo / evidence

Fixed fixture source timestamp2026-11-03T00:00:00Z; source labels/hashes/cadastral
identifiers/rights explicitly test-only, UUIDs isolate runs and do not drive rules.
Real PostGIS create/replay, org/tenant isolation, manual geometry link, GIS correction
with retained old version, documentary rights correction, stale/concurrent conflict,
permission revoke/default deny, cloud rejection, import-version provenance,
forced snapshot/audit/outbox rollback, actual dispatcher/inbox failure/retry/replay.
Memory storage/scanner isolates the GIS import owner-link test; unchanged GIS test
provides real MinIO/ClamAV/GDAL separately. No fake hosted infrastructure PASS claim.

## 7. Limitations / follow-ups

Trusted deployment composition supplies current permissions, defaults deny. Basic
lexical bounded cadastral strings do not assert national syntax or remote existence.
Source hashes identify reviewed documentary inputs, not retrieved legal truth.
Only documented OWNERSHIP/LEASE metadata; no full rights/contracts/title processing,
external/provider integration, scraping, seed data, production/WAN/physical-device
certification. No Field/Season/allocation/UI/offline registration or WP028. Historical
records retained; no purge/retention policy invented. Local Docker verification
limit awaits hosted evidence. No frozen scope or future/rejected item promoted.

## 8. Unlock decision / exact closeout

NOT DONE. G12 pending; no next WP started. Exact code/head/PR/CI/merge/CR closeout
will be recorded after observation. Same approved report path covers reconciliation;
report publication checks remain distinct from executable implementation evidence.
