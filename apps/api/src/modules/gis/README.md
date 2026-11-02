# GIS spatial foundation — WP49-026

DOC50 execution > DOC48 scope > DOC47 reconciliation > DOC49 graph; DOC10/11,
DOC24 geometry/CRS/import/map contracts and DOC34 consumer boundary. CR #65
approves actual compiled runtime and complete path matrix. Frozen manifest unchanged.

GIS owns `geometry_head`, immutable `geometry_version`, append-only approval/reject
`geometry_decision`, source batches/features, command receipts, audit and outbox.
A geometry asset is NOT a Field, LandPlot or FieldSeason. Future domain owners call
GIS commands and retain `geometryVersionId`; this WP writes no foreign facts and
creates no domain field/parcel/season. No public HTTP route is added. Application
services are exported by the compiled Nest module; there is no shadow uncompiled
module under the frozen raw path.

The registry requires a trusted server composition to install a current tenant
permission policy. Default deny; actor/action/tenant checked before reads and
again in mutation transactions, including idempotent replay. No role grants or
production source/provider profiles are installed. Writes require LOCAL_PRIMARY,
command validation, expected head version, PostgreSQL transaction, immutable audit
and transactional outbox. The existing dispatcher/inbox discovers GIS events,
retains its retry/lease/dedup behavior, and never writes GIS facts itself.

## Geometry contract

Explicit 2D Polygon/MultiPolygon, canonical EPSG:4326, longitude/latitude. PostGIS
checks validity and nonempty positive spheroidal geography area; no EPSG:3857 area,
no automatic repair, canonical precision truncation or destructive overwrite.
Source CRS and available accuracy/time/method/quality flags are retained. Import
provenance is checked against the actual immutable tenant staging feature/hash.
GiST supports bounded bbox/intersects reads; antimeridian bbox is split into two
indexed envelopes. RFC7946 split MultiPolygons remain supported. Uncut rings that
cross the antimeridian have the planar polygon semantics supplied by GeoJSON;
callers should provide RFC7946 cut representations to avoid ambiguous interiors.

Propose allocates a stable geometry UUIDv7 and immutable version UUIDv7. Subsequent
corrections retain that stable ID, require expected `headVersion` and reason, and
allocate a new version. Head version advances for every proposal/decision, so it
is an optimistic command revision, not a count of approved shapes. Approval and
rejection have separate permissions, retain reason/actor and never edit the
version. Only approved versions are returned by spatial queries. Caller must
provide an explicit as-of instant. For each asset, latest approved effective time
at/before that instant wins; at the same effective time, later geometry revision
supersedes earlier interpretation. Historical facts retain their explicit version
reference even after corrections. History includes all candidates/decisions.
No Field active pointer or split/merge workflow is implemented here.

## Import contract and deployment

`GisImportsService.stage` is the explicit GIS source-ingestion application port;
it is separate from the files service's media MIME profile. It uses the existing
private MinIO storage and real ClamAV scanner adapters. It does not weaken the
media allowlist, accept unscanned references, expose a new upload route or put
binary data in PostgreSQL. Missing scanner/storage/parser fails closed. File bytes
are copied before awaits, scanned, hashed and retained as a private tenant object;
metadata includes original filename/size/format/options/parser version. No public
buckets, embedded credentials or user-supplied object paths/URLs.

The GDAL Python worker opens only allowlisted local drivers, read-only, without
remote paths, VRT, SQL extensions or network-linked KML. ZIP paths/symlinks/duplicate
entries/nested archives/ambiguous layers/expansion are rejected before extraction.
GDAL/PROJ axis mapping is explicit lon/lat. Source CRS must be supplied/detected;
conflicting overrides fail. GeoJSON uses RFC7946 and rejects legacy `crs` objects.
KML with two-component coordinates is kept 2D; unsupported Z/M is not silently
accepted. SHP requires an explicit known encoding or a recognized CPG; legacy
field names/attributes are retained without pretending truncated names are full
names. GPKG layer selection is explicit if multiple layers exist. WKT/WKB require
explicit EPSG metadata. CSV requires explicit coordinate columns/CRS and POINTS
or VERTICES mode; only closed polygon vertices can become geometry candidates.
Nonpolygon features remain staged with issues for explicit review/conversion;
this WP does not fabricate polygon boundaries around points/tracks.

Stage is a dry-run with no canonical geometry. Preview exposes original attributes,
explicit mapped metadata, per-feature issues and bounded exact spatial duplicate
candidates; no invented fuzzy tolerance/natural-key merge. Original bytes retain
all source information. Commit explicitly selects ALL_OR_NOTHING or VALID_ONLY;
only valid features enter the GIS owner command in the same transaction as the
batch receipt/audit. Every imported version references its source batch/feature
and SHA256. Imports never approve geometry or create Field/LandPlot facts.
Repeated commit replays its receipt; another key cannot commit a batch twice.
Source/preview metadata is immutable: a changed mapping/source creates a new batch.

Deployment bounds (technical resource policy, not frozen business precision):
16MiB source/decompressed/parsed payload, 32 archive members/layers, expansion100x,
1000 features, 5000 vertices per synchronous polygon, CPU15s, wall20s, memory768MiB,
output16MiB; bounded bbox3600 square degrees and response1000 features. Larger
sources fail explicitly and require a separate approved processing profile.
Original objects are retained; a failed DB transaction may leave an unreferenced
private source object. No automatic deletion/retention policy is invented; a
production lifecycle policy must preserve referenced evidence. Replay-only unused
copies can be safely removed. Database evidence remains authoritative.

Production image installs Python/GDAL and copies the parser alongside compiled
runtime (`GIS_PARSER_SCRIPT`). Direct source build resolves the source Python file;
`GIS_PYTHON` defaults `/usr/bin/python3`. Hosted Unit provisions python3-gdal and
runs real parser acceptance; runtime smoke builds the actual image. GDAL version
is included in import provenance; PROJ is supplied by that runtime and network
grid downloads are disabled. Existing file storage and ClamAV
configuration applies. Schema12 is additive; migrate before starting new runtime.
Older clients/OpenAPI/sync command contracts are unchanged.

## Map base and limits

Web `/gis` and authenticated mobile Map route use pinned MapLibre packages. Local
background-only style requests no remote provider, permission, location or fake
fields. No domain data is exposed by the base. Real authorized sources/styles and
attribution must be supplied by their owning feature. Map disposal releases its
renderer when the route is removed. Downloadable offline regions, field/task
caches and sync integration belong to WP49-029. No cloud authority, provider API,
land/season/agronomy/remote sensing/advanced maps/exports/hardware/AI is added.
