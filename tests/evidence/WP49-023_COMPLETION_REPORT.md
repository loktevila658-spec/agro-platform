# WP49-023 Completion Report — External provider abstraction

Date: 2026-11-01. Branch: `codex/wp49-023-providers`.
Status: IN PROGRESS until exact final PR-head required checks and findings are
clear, ordinary merge succeeds, exact merge-SHA push CI succeeds and Scope CR #56
closes as completed. Those observed conditions activate DONE and final G0–G12
verdicts below. Exact head/merge/run IDs live in the CR closeout, avoiding a report
that must embed its own resulting commit hash.

## 1. Prerequisites and authority

Baseline: fetched live `origin/main` and independently checked live GitHub main
and ls-remote `a423df38b157c0b0ab65950ef0ed2fcb1fd40b8c`, matching the expected SHA.
Pre-code G0 PASS; main rechecked unchanged during implementation. Clean worktree
`/private/tmp/agro-wp49-023-providers` was created only after G0 and CR approval.
Original dirty checkout left untouched.

IMPLEMENTATION_ORDER W2 places WP49-023 immediately after WP49-022; build graph
and live manifest specify direct dependency WP49-021, not WP49-022. Static
NOT_STARTED status fields were never completion evidence.

- WP49-022: merged PR #55 and canonical Completion Report; CR #54 CLOSED/COMPLETED
  with DONE activation. Exact baseline merge-SHA event=push
  [run 41308745846](https://github.com/loktevila658-spec/agro-platform/actions/runs/41308745846)
  independently inspected: all eight jobs SUCCESS, including Mobile and aggregate.
- WP49-021: merged PR #53/report at `12fca8a7c63f75e205c28345b1dbd24785ff475e`,
  CR #52 CLOSED/COMPLETED with DONE activation; exact merge-SHA push
  [run 41288067398](https://github.com/loktevila658-spec/agro-platform/actions/runs/41288067398),
  all eight jobs independently inspected SUCCESS.
- Existing database v9, public HTTP/events and generated clients remain compatible.

Read/applied AGENTS.md, CODEX_INSTRUCTIONS, authority/source-of-truth rules,
implementation order/build graph, live manifests, change schema and quality gates;
DOC50 release/execution > DOC48 frozen scope/RTM > DOC47 reconciliation > DOC49
graph. Relevant DOC13 §§2–6/8/13/14/23–27, DOC23 data layers/attribute SoT/GIS/
lineage, DOC24 provider/GIS-041–048/snapshot contracts; TZ50-084–086/089–091/093,
INT-GIS-001/005 and INT-T009/014/015 are applied at this abstraction boundary.
No latest-document-wins, release promotion or adjacent-WP implementation.

Provider is an external data/evidence/reference source with identity, time,
provenance and freshness. It owns its source metadata/legal status only, never
platform operational facts. LandPlot != Field != FieldSeason. External cadastral
geometry is reference evidence; adoption needs a later owner domain command.
Satellite owns scene metadata; platform later owns derived per-field metrics.
Daily manual workflows do not require external availability, hardware or AI.

Frozen record preserved verbatim; manifest is byte-identical:
```yaml
depends_on:
- WP49-021
allowed_paths_raw: /apps/api/modules/providers
exit_criteria: weather/satellite/cadastre provider contracts.
```
No discrepancy against the owner's supplied frozen fields.

## 2. Complete preflight and approved scope

Single [Scope CR #56](https://github.com/loktevila658-spec/agro-platform/issues/56)
contains the complete nine-path allowlist with per-file rationale and pre-code
test/assertion impact. [Delegated owner approval](https://github.com/loktevila658-spec/agro-platform/issues/56#issuecomment-6558416099)
was recorded before implementation/worktree creation using the owner's explicit
advance authorization. This is delegated approval, not independent review.

Preflight traced WP021 registry/current policy, versioned mapping/profile, durable
staging/owner transaction/audit/outbox, external IDs/provenance/retry/DLQ; WP022 mock
framework/immutable receipt and reconciliation; API compiler/Nest/runtime modules,
Docker, config/external secret references, schema v9/migration assertions, canonical
OpenAPI/event catalog/codegen, tests, architecture scanner and CI graph.
`rootDir=src`, `include=src/**/*.ts` excludes literal frozen API path; it was not
silently normalized. CR explicitly approves the compiled implementation.

No new dependency/package/lockfile, migration/schema assertion, public endpoint/
event/generated-client or CI definition is necessary. Existing `test/*.test.mjs`,
workspace scripts and Docker `dist` COPY discover/package every addition. All
potentially affected schema current/count/sequence/ahead assertions were inspected
before code: schema remains v9, so none change. Existing connector/1C, config,
database, contracts, identity/org, files/events, mobile/sync and runtime tests are
required regressions. The only new test paths were both enumerated before code.

## 3. Delivered contracts and runtime

Versioned internal `external-provider/1` read ports: weather FORECAST/HISTORY
point/period, satellite bbox/period/cloud scene search and cadastral-number lookup.
Exact normalized version pinning fails closed; provider API and opaque source
version remain separate. Provider replacement requires no Field schema migration.
No vendor model, endpoint, SDK, tariff or real service is configured.

Every normalized snapshot carries provider/API/external ID/source version/source
hash and capture/processing/retrieval timestamps. Weather includes model/run,
spatial method/resolution, explicit units and nullable values. Satellite includes
collection/cloud/quality/footprint, canonical band references and processing
version. Cadastre includes available area/category/use, optional reference geometry
and source CRS; UNKNOWN/PENDING means null geometry/CRS, no invented polygon/title.
Capture/processing can be honestly unknown for cadastre; weather/scene capture
is required. Source SHA-256 is an adapter-supplied source-material hash, not a
claim to hash the normalized record. There is no geometry validity/intersection,
weather unit conversion, NDVI/GDD/raster processing or canonical adoption engine.

Strict JSON/known-field/type/range/time/version checks, <=1000 records / 1 MiB,
detached validated staging and deep immutability precede return of any evidence.
Non-finite numbers are rejected before JSON can coerce them to null; the initial
negative test caught that coercion and implementation was corrected. Query
binding rejects unrelated cadastral numbers/weather point/mode/period or scene
time/cloud results. Satellite spatial intersection belongs to the concrete
adapter; an opaque footprint reference cannot prove intersection here.

Explicit trusted clock/maxAge policy yields FRESH/STALE/UNKNOWN from weather run
or source capture, never retrieval. Equal threshold is fresh; future/unknown
source time is unknown. Stale data retains its provenance and remains inspectable.
Successful empty batch is MISSING, distinct from ERROR. Identical observations
coalesce only within a batch, with earliest retrieval retained deterministically.
Conflicting same observation fails; distinct runs/revisions remain separate in
source/run + processing order. Stable identity tie-break does not assert opaque
version recency. No cache, history overwrite or cross-call durable dedup claim.

Nest ProvidersModule exports server-only ProvidersService. Trusted composition
registers immutable tenant/profile descriptor and port, no production provider.
WP021 current READ authorization defaults deny, checks before and after await;
query/options/actor intent is pinned before the first await. Local Server mode
required. Tenant lookup prevents cross-tenant profile reuse. Descriptor includes
access/license provenance; PORTAL_ONLY/DISCOVERY_REQUIRED never invokes the port.
No credential/token/URL field, new config variable or secret resolver. Future
concrete adapters must use external secret-store references/shared config.

Bounded asynchronous reads receive AbortSignal; timeout cannot stop arbitrary
blocking JavaScript or force a non-cooperative adapter to cancel. Late completion
cannot publish evidence here. Stable errors distinguish timeout/temporary/rate/
unavailable from auth/validation/version/conflict; valid Retry-After retained,
unknown exception text/raw body suppressed. No automatic retry loop/default is
invented. Adapter receives no DB pool, canonical command or foreign-table access.

## 4. Database, events and persistence decision

No DB migration, public HTTP/OpenAPI, event, permission namespace or workflow
change. No authoritative mutation, audit entry or outbox is emitted by a read.
Current-policy READ is inherited through the existing integration registry.

Manifest exit criterion is common contracts only; persistence is unnecessary.
Staging here is an in-memory validation boundary, not a durable import. Future
business imports must use WP021 durable staging/mapping, guarded owner permission/
domain command, transaction/audit/outbox. Weather snapshot/cache persistence is
WP035; scene catalog/processing is WP036; owning GIS WPs handle geometry adoption.
Those WPs must specify retention/license and preserve immutable provenance. No
restart persistence, production provider access or complete later workflow claimed.

## 5. Tests and project gates

- RED before runtime: both acceptance imports failed with missing compiled provider
  modules, as expected. Final targeted suite **12/12 PASS**, no skips/failures.
- Full default project Unit **PASS**: workspace build, API **93/93** (including
  real PostgreSQL integration regressions), contracts **20/20**, config **17/17**,
  connectors **2/2**, repository regressions **15/15**, migration units **5/5**,
  bootstrap structural validation. Unchanged Sync P95 **1076.3 ms**, below its
  existing threshold. No acceptance assertion or threshold weakened.
- Typecheck/architecture **PASS**, 11 architecture tests. Canonical contract
  validation and generated-client drift **PASS**. Lint capability **PASS**, existing
  N/A because no lint tool is configured, no new exemption.
- Migration and production Compose initial attempts stopped on sandbox Docker
  Buildx activity-file permission before tests. Required authorized retries are
  recorded below; these initial failures are not relabelled PASS.
- Migration authorized retry **PASS**: clean/repeated PostgreSQL/PostGIS, API
  readiness/current v9/checksums and invalid-state rejection, 1/1 integration test.
- Production Compose authorized retry **PASS**: configuration validation and
  production built API/web/workers/AI runtime smoke.
- Local Mobile gate unavailable: Flutter executable absent. Exact-head and
  merge-SHA hosted Mobile/Android remains mandatory, never replaced by N/A.
- Exact final-head hosted checks/review and merge-SHA push CI remain required for
  DONE activation; identifiers and observed results are recorded in CR closeout.

| Gate | Final verdict, activated only after observed closeout |
|---|---|
| G0 | PASS — order/graph, live main, merged dependencies/reports/closed CRs/exact push CI |
| G1 | PASS on activation — local typecheck/architecture/lint capability/diff and exact-head static checks |
| G2 | PASS on activation — schema v9 unchanged; real clean/repeated/invalid-state migration regression |
| G3 | PASS on activation — targeted 12/12, full Unit 93 API tests and mandatory hosted jobs |
| G4 | PASS on activation — real Nest composition/external read fixtures and unchanged PostgreSQL/runtime regressions |
| G5 | PASS on activation — exact internal version/schema/query validation; public API/events/codegen unchanged and drift PASS |
| G6 | PASS on activation — deterministic batch duplicates/conflicts/order; no new writes/events; durable framework regressions PASS |
| G7 | PASS on activation — current READ default deny/tenant/subject/revocation and Local mode tests; no canonical capability |
| G8 | PASS on activation — pure retained-evidence evaluation/freshness, outage independent from manual intent; unchanged offline/sync/Mobile regressions |
| G9 | PASS on activation — preserved detached immutable source IDs/hash/time/model/run; separate revisions and no silent overwrite |
| G10 | PASS on activation — deterministic fixture below, fixed clock and injected failures |
| G11 | PASS on activation — limits/strict negatives/abort timeout/sanitized errors, existing security/performance gates |
| G12 | PASS only on activation — approved nine-path diff/report, clear findings, exact-head required checks, ordinary merge, exact merge-SHA push CI and completed CR closure |

Gate names/IDs follow executable `codex/QUALITY_GATES.yaml` (DOC50); DOC49's older
table labels some G4–G8 differently. Both substance sets are covered above; no
gate is omitted due to label differences.

## 6. Deterministic demo and review

Tests: `apps/api/test/providers.contract.test.mjs` and
`apps/api/test/providers.runtime.test.mjs`. Fixed clock `2026-11-01T12:00:00.000Z`,
source hash `a` repeated 64, stable fixture IDs; no random provider state or network.
All three normalized schemas validated; partial/unknown/type/time/version rejected;
weather newer/older runs retain source/hash with deterministic order; conflicting
duplicate rejected; missing reading stays null; missing geometry stays pending.
Real Nest context boots/closes. Current policy/tenant/subject/authority/revocation
negatives; pinned intent across await; timeout abort/late response, auth/rate/unknown
error/version/missing, replacement provider and blocked portal profile exercised.

Runtime emits machine-readable demo evidence:
```json
{"scenario":"WP49-023-contracts","clock":"2026-11-01T12:00:00.000Z","duplicateCount":1,"stale":true,"timeoutAborted":true,"manualFactPreserved":true,"provenancePreserved":true}
```
The manual fact assertion is a capability-isolation fixture, not a newly
implemented Field workflow or physical offline-device certification. Existing
local operational integrations and mandatory hosted mobile/sync test actual
platform persistence. Source boundary tests assert no provider network/SQL/owner
command registration; ports are fixture-only. No independent reviewer claimed.

Local review checked full source/test diff, query/response binding, timestamp and
numeric validation, immutable provenance, tenant/current-policy boundaries,
timeout/late-result safety, exact scope and no foreign writes or vendor code.
Final GitHub findings/protection and exact-head checks must be clear before merge;
strict `CI quality gates` and conversation resolution are required, no reviewer
approval requirement observed. No auto-merge/admin/force bypass or waived check.
Pre-commit staged diff independently compared with CR #56: exactly the nine
approved files below, no unstaged change; `git diff --cached --check` PASS,
frozen manifest byte-identical. Main independently rechecked unchanged.

## 7. Exact approved changed files (9)

| Path | Why allowed by Scope CR #56 |
|---|---|
| apps/api/src/modules/providers/providers.contracts.v1.ts | Versioned normalized ports/queries/evidence/errors/freshness types |
| apps/api/src/modules/providers/providers.validation.ts | Runtime schema/version/query/freshness/duplicate/order/provenance validation |
| apps/api/src/modules/providers/providers.service.ts | Authorized bounded read facade and trusted tenant/profile registration |
| apps/api/src/modules/providers/providers.module.ts | Compiled Nest registration and shared policy composition |
| apps/api/src/modules/providers/README.md | Source/SoT/version/config/persistence handoff and limitations |
| apps/api/src/app.module.ts | Real compiled API module wiring |
| apps/api/test/providers.contract.test.mjs | All three schemas/version/freshness/provenance/dedup/order fixtures |
| apps/api/test/providers.runtime.test.mjs | Real Nest/failure/permission/tenant/pinned-query/security/discovery tests |
| tests/evidence/WP49-023_COMPLETION_REPORT.md | Canonical applicable G0–G12 evidence and closeout activation |

## 8. Limitations and unlock decision

No unapproved scope or adjacent implementation. Limitations are the intentional
contracts-only boundary approved in CR #56, not omissions of this exit criterion.
No real vendor/secret, durable weather/scene store, public GIS workflow, field
canonical mutation, hardware dependency or downstream integration was started.

Unlock PASS only when all activation conditions at the top are observed and CR
#56 is closed completed. Order next is WP49-024, whose direct dependencies remain
WP49-016/020. WP49-035 and WP49-036 gain this prerequisite only; their remaining
GIS/Field dependencies must independently PASS. This report does not unlock them
prematurely and no next WP is started here.
