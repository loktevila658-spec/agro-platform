# LandPlot — WP49-027

Authority: DOC50 execution > DOC48 frozen scope > DOC47 reconciliation > DOC49
build graph, then DOC10 common/land metadata, DOC11 history rules, DOC23 registry
reference SoT and DOC24 immutable LandPlotSnapshot/source/geometry boundaries.
CR-0027 (#69) explicitly authorizes compiled paths; literal frozen
`/apps/api/modules/land` remains unchanged and is not silently normalized.

LandModule exports trusted server application contracts, as do MasterData and GIS.
No public HTTP controller, provider, role grants or production fixtures. Deployment
composition installs LandRegistry's current tenant permission callback; defaults
deny, policy errors deny, reads and commands check, commands recheck in transaction
including replay. Organization scope is optional and immutable, enforced by a
composite tenant/organization FK; no site relation is specified for this entity.

LandPlot canonical UUIDv7 is independent of cadastral identity and is distinct from
Field and FieldSeason. Only the documented ACTIVE status is used; this WP invents
no legal/parcel lifecycle. Land owns head, reviewed immutable snapshots and reference
claims; GIS remains the sole owner of geometry/assets/versions/CRS/import provenance.
Land only calls `GisService.versionInTransaction` to resolve a tenant version through
the permission-checked owner contract. No SQL reads/writes foreign authoritative
tables. Transaction-bound query rejects autocommit, resolves even a candidate as
reference evidence, and never approves/publishes geometry or creates a Field.

`create(actor,{organizationId?,snapshot,reason},context)` requires land.create;
`correct(actor,id,{expectedVersion,snapshot,reason},context)` requires land.correct.
A correction supplies a full reviewed replacement snapshot, not a silent partial
patch. Read/history require land.read. Geometry links additionally require gis.read.
Snapshot geometry is an explicit immutable version ID, with original GIS source,
import hash/batch/feature/CRS/measurement provenance preserved by the owner. Historical
snapshots retain old version refs after corrections. No duplicate geometry store,
spatial interpretation, active operational boundary or automatic source adoption.

Every snapshot explicitly supplies source name/profile/version/capturedAt/SHA256,
original JSON attributes and rights metadata (possibly empty). The hash identifies
the reviewed source; this service does not claim to retrieve/verify external bytes.
GIS file bytes, scan/storage/hash/CRS validation remain with the existing import
service; its returned version can be explicitly reviewed and linked here. Original
attributes are retained without an invented classifier/mapping or provider profile.
Source/capture metadata remains queryable without WAN/provider availability.

Optional cadastralNumber follows DOC10 varchar32 and bounded opaque lexical text
(no controls/whitespace); national/provider-specific syntax and remote existence
are not inferred. Unique reference claim is tenant/source/profile/version/cadastral
number/captured instant (effective source context), retained permanently and never
reassigned to another parcel. Later snapshots may add/correct references without
erasing old claims. Declared hectares are explicit decimal text for numeric(14,4)
semantics and remain separate from GIS-computed area; no rounding or inferred area.

Rights are documentary metadata only: documented OWNERSHIP/LEASE and optional
validFrom/validTo dates with ordered valid interval and explicit documentary source.
Empty rights mean unknown, not ownership inferred from registry geometry. No
land-contract/counterparty store, title adjudication, other right categories or legal
statuses are fabricated. All metadata sources can be corrected through new snapshots;
prior records, actor/reason/time/correlation/causation and before/after audit survive.

Authoritative commands require LOCAL_PRIMARY, strict fields, bounded JSON (64KiB,
depth12), max100 right records (technical synchronous resource bounds), current
permissions, shared optimistic guard under row lock, idempotency and one database
transaction. Snapshot/current pointer/claim/audit/metadata-only catalog event/stored
exact response commit together or roll back. Same key/different actor or intent
conflicts. Stable scope/version and immutable snapshots/reference claims/audit/outbox
are DB guarded; no delete/truncate/purge endpoint. Retention preserves evidence;
future archive policy must retain referenced history and legal holds.

Schema13 is expand-only from12; migrate before starting the new API expected13.
Existing HTTP/OpenAPI, GIS commands, sync and business events retain contracts.
`land.plot.changed@1.0.0` is metadata-only, producer land, no production consumer
invented. Existing WP016 dispatcher/inbox handles retries/dedup. All four canonical
generated outputs update together; generated mobile file is not a mobile feature.
Docker copies compiled dist through existing wiring, no new runtime dependency.

Deterministic real PostGIS test uses fixed source clock2026-11-03T00:00:00Z and
fixture values, explicit versions, tenant/org/permission denials, GIS/manual/import
links, correction history, concurrency, fault rollback and actual outbox/inbox
retry/replay. GIS owner-link import fixture uses memory storage/scanner adapters;
unchanged GIS suite supplies separate real MinIO/ClamAV/GDAL evidence. No production
provider/data/title/WAN/physical-device certification is implied. Offline command
registration/UI, Field/FieldSeason/allocation, full rights/contracts and WP028+ remain
outside this WP; existing offline/native regressions remain applicable.
