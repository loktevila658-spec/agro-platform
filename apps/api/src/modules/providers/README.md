# External provider abstraction — WP49-023

`ProvidersModule` exports the compiled server-only `ProvidersService`. No HTTP
endpoint, concrete provider, scheduled fetch or business command is installed.
The literal frozen `/apps/api/modules/providers` is excluded by the API compiler;
Scope CR #56 approves these compiled paths without changing the frozen manifest.

DOC50 > DOC48 > DOC47 > DOC49 governs scope. DOC13 §§8/13/14, DOC23 layers/SoT/
lineage and DOC24 GIS-041–048 define the external evidence boundary. Weather model
and run, satellite scene and processing metadata, cadastral external/reference
attributes belong to their source. Field/LandPlot/FieldSeason and production
geometry remain platform-owned. External IDs are links, never platform keys.
Registry spatial data alone does not establish legal title. Manual workflows
have no dependency on this module's availability or optional sensors/AI.

## Version 1 contract

Import `providers.contracts.v1` for `WeatherProvider`, `SatelliteProvider`,
`CadastralProvider`, their queries and normalized snapshots. `read(query, context)`
is a read port, never WP021 `submit` or an owner command. Weather supports
FORECAST/HISTORY at a point and UTC period; satellite supports bbox/period/cloud
search; cadastre supports a cadastral-number lookup. Unsupported schemas fail
closed. Version 1 is pinned exactly as `external-provider/1`; a future breaking
schema needs a separate contract/validator and explicit negotiation. Provider API
version and opaque source version are separate from our normalized contract.
No lexicographic source-version comparison implies recency.

Snapshots carry provider/API/external identity, source revision and SHA-256 source
hash, capture/processing/retrieval UTC timestamps. Hash is supplied by the adapter
over its source material, not claimed to be the hash of the normalized object.
Weather adds model/run/spatial method/resolution and explicit units with nullable
values; adapters normalize units/names, this abstraction guesses no conversion.
Satellite adds collection/cloud/quality/footprint, band asset references and
processing version; no raster processing or spatial intersection engine exists
here. Cadastre adds available area/category/use, reference geometry and source
CRS; absent geometry is UNKNOWN/PENDING with null geometry and CRS, never an
approximate polygon. Optional unknown capture/processing timestamps stay null;
weather and scene capture is required. Forecast target times are variable `at`
timestamps; `capturedAt` is the source capture, not a future forecast target.

The validator requires JSON-only, exact known fields, valid UTC timestamps,
finite numbers, bounded identifiers/arrays and at most 1 MiB / 1000 snapshots.
No raw response or credential metadata bag crosses this boundary. It detaches,
validates and deeply freezes the entire batch before returning any evidence.
Weather mode/point/variable time, scene time/cloud and cadastral number are bound
to the query. Satellite footprint intersection belongs to the concrete spatial
adapter; opaque footprint refs cannot prove that intersection here.

Freshness is evaluated at explicit trusted server `now` with caller policy
`maxAgeMs`: weather uses run time, other records use capture time. Retrieval never
refreshes an old observation. Unknown/future reference is UNKNOWN; age above the
threshold is STALE; equal threshold is FRESH. `MISSING` means a successful empty
result, distinct from ERROR. A stale result remains visible with provenance.

Exact duplicate observations coalesce within one batch. Identity includes external
ID/source version/capture/processing and kind-specific model/run/collection context.
Same identity with different content/source hash is DUPLICATE_CONFLICT; differing
retrieval alone retains the earliest retrieval deterministically. Distinct runs
and revisions remain separate, sorted by source/run then processing time with a
stable identity tie-break. Tie-break is presentation order, not version authority.
No snapshot is persisted or overwritten, and no cross-call dedup is claimed.

## Trusted composition and failures

Server composition registers a tenant/profile, immutable descriptor and read port.
Descriptor contains kind/provider/API/contract version, license reference and
access availability (API_CONFIRMED/LICENSED_API/PORTAL_ONLY/FILE_IMPORT/
DISCOVERY_REQUIRED). Portal/discovery descriptors never invoke a read port.
No URL/auth/token field is supported. Actual future adapters obtain credentials
through deployment secret-store references using the shared secure config boundary;
this WP neither resolves secrets nor invents a new environment variable.

The shared WP021 registry checks current READ permissions before and after the
await, defaults deny, and receives trusted authenticated server actors. Profile
registration is tenant-scoped and cannot be replaced silently. Query/options/actor
intent is copied before the first await. Local Server mode is required. The
adapter receives only the frozen query, tenant/profile/correlation and AbortSignal;
no pool, canonical command or secret is given by this service.

Explicit positive timeout bounds the asynchronous read and signals cancellation.
Adapters must honor AbortSignal; timeout cannot forcibly stop arbitrary blocking
JavaScript. Late completion cannot publish evidence or cause a second call here.
Stable sanitized errors distinguish auth/validation/version/conflict from retryable
timeout/temporary/rate-limit/unavailable conditions. Valid Retry-After milliseconds
are retained. Unknown exceptions expose no raw body/message. Caller orchestration
owns any bounded retry; no automatic retry loop or invented retry default exists.

## Persistence and integration handoff

This contracts-only WP has no canonical writes, DB table/migration, durable cache,
inbox/outbox, external-link mutation or audit event. Validation staging is in
memory, not WP021's durable import staging. Any future business import must use
that framework's durable staging, mapping, owner permission/domain command,
transaction, audit and outbox. The read port cannot bypass those steps.

Snapshot/cache/retention/catalog implementations belong to WP035/WP036 and the
owning GIS WPs, with immutable provenance retained there. Future legal retention,
license/cache and correction rules must be explicit. No restart durability or
production provider access is claimed. Retained caller snapshots can still be
validated/evaluated offline with the pure helpers; core manual scenarios do not
call this facade. Existing public API/events, generated clients and schema v9
are unchanged. Existing API wildcard tests, workspace build and Docker `dist`
packaging cover all additions without changing dependencies or CI definitions.
