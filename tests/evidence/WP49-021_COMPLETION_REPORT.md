# WP49-021 Completion Report — Connector framework core

Status: IN PROGRESS until final exact PR-head required CI and findings are clear,
ordinary merge succeeds, exact merge-SHA push CI succeeds and Scope CR #52 is
closed as completed with final evidence. Those observed conditions activate DONE
and the G0–G12 final decisions below. Exact final head/merge/run identifiers live
in the CR closeout, avoiding a self-referential report hash.

Baseline: independently fetched and ls-remote verified live origin/main
`d20c5fc2142eeefcc2892f10320ffb46273ff07c` (2026-10-28). Expected baseline matched;
main remained unchanged at final local review. Clean managed worktree
`wp49-021-connectors`, branch `codex/wp49-021-connectors`; original dirty checkout
was left untouched.

Frozen record preserved verbatim and manifest byte-identical:
```yaml
depends_on:
- WP49-016
allowed_paths_raw: /apps/api/modules/integrations /packages/connectors
exit_criteria: retries, DLQ, mapping, external IDs.
```

## G0 and authority

PASS. IMPLEMENTATION_ORDER W2 places 021 immediately after 020; live build graph
has direct dependency WP49-016 -> WP49-021. NOT_STARTED is not completion evidence.

- WP49-020: merged canonical report in baseline, implementation PR #51 ordinary
  merge equal to baseline; exact successful push run
  [40724649127](https://github.com/loktevila658-spec/agro-platform/actions/runs/40724649127),
  all eight jobs independently verified. CR #50 CLOSED with final DONE activation.
- WP49-016: implementation PR #37 merge
  `d814ba0f768c9f9ba216954d2c9ec3e1708fb508`, report PR #38 merge
  `809b97de487844bf7db3d64ab95cb84a582d937f`; canonical merged report, CR #35 CLOSED,
  exact report post-merge run
  [38664024824](https://github.com/loktevila658-spec/agro-platform/actions/runs/38664024824)
  independently verified SUCCESS. Existing schemas/API/events remain compatible.

Read/applied AGENTS.md, CODEX_INSTRUCTIONS, machine-readable authority, order,
graph, manifests and gates; applicable DOC47–50, DOC13 framework sections 2–6,
19–27, DOC44 connector/reliability boundaries, DOC20/21/27 integration acceptance.
DOC50 release/execution > DOC48 frozen scope > DOC47 reconciliation > DOC49 graph;
no latest-document-wins. LOCAL_PRIMARY, current owner rules/permissions,
transactional command/audit/outbox, immutable provenance and module ownership hold.

## Preflight and approved scope

Single [Scope CR #52](https://github.com/loktevila658-spec/agro-platform/issues/52)
contains complete file functions/scope rationale and pre-code impact analysis.
[Delegated owner approval](https://github.com/loktevila658-spec/agro-platform/issues/52#issuecomment-6475113826)
was recorded before implementation under the owner's explicit advance authority.
Literal frozen API path was not normalized: compiler rootDir=src and
include=src/**/*.ts exclude it. The approved additional compiled module, wiring,
Docker copy, persistence, schema assertions, tests and report are required.

Preflight defect disclosed: initial 19-file inventory incorrectly claimed no
lockfile impact. Dependency installation incidentally generated a two-line empty
workspace importer for the new dependency-free package in apps/pnpm-lock.yaml.
[Correction/approval](https://github.com/loktevila658-spec/agro-platform/issues/52#issuecomment-6475197528)
added this exact twentieth path before its inclusion in the implementation diff.
No dependency/version changed. This is not represented as a perfect initial full
inventory. All affected schema assertions/test paths were enumerated before code;
there were no successive missing-test scope expansions or weakened assertions.

Preflight covered actual API/runtime/DI, shared package discovery/build, Docker,
configuration/deployment mode, common command boundary, identity/audit, sync,
events/outbox/inbox, migrations, contracts/codegen, all schema-version assertions,
unit/integration suites and architecture/quality-gate/workflow scripts. No new
public HTTP endpoint, public event or provider: OpenAPI/codegen and complete
operation assertions need no change. Existing API/package wildcard tests and
migration/runtime jobs cover every added test/package; CI definitions unchanged.

## Delivered behavior and boundaries

Compiled registered Nest integrations module and dependency-free shared library.
Trusted composition installs adapter, current server policy and owner application
command ports; production registers no invented provider or business command.
Default deny and LOCAL_PRIMARY guard configure/stage/replay/execution. Service
actors are trusted authenticated server principals; no request-body identity or
new unauthenticated facade. Current policy is rechecked on every job execution;
owner validation checks authoritative state/version and permission in its transaction.

Inbound envelope first commits to integrations-owned staging with tenant/profile/
direction/idempotency uniqueness and stable payload fingerprint. Mapping/schema
validation precedes owner domain command invocation. Canonical effect, owner audit,
owner outbox, connector receipt/status/external link and connector audit/internal
journal share one transaction. Failure rolls back the whole effect. Framework SQL
mutates no foreign domain table; adapter receives no DB handle. Fixture-only owner
SQL exists solely in an isolated test schema, not production registration.

Migration 0008 expands v7->v8 with immutable versioned profiles/mappings/envelopes,
durable job retry/DLQ state, append-only attempts, external bindings/provenance
revisions, audit and internal transactional lifecycle journal. This journal is not
a new public domain event; existing catalog and platform dispatch/inbox are unchanged.
All schema current/count/sequence/ahead assertions updated; historical migration
existence checks retained. No purge/down migration introduced; retained old profile
versions interpret in-flight jobs. Future archival requires a retention policy.

Every outbound attempt records SENDING before I/O. Per-job session advisory locks
exclude concurrent workers; PostgreSQL connection loss releases locks. Restart,
SENT or lost response requires reconciliation before resend; UNKNOWN never allows
resend, NOT_FOUND must be conclusive under the adapter contract. Stable idempotency
key/correlation survive retries. Bounded timeout passes AbortSignal; an aborted
request may still have external effect, so unknown outcomes remain durable.
Transport SENT is distinct from business ACCEPTED. Exactly-once external effect
requires the provider/adapter idempotency/reconciliation contract, not a claim that
arbitrary external APIs can be made exactly-once by the framework.

Explicit configured attempts/backoff cap/jitter/timeout; Retry-After respected.
Retryable network/timeout/temporary/rate errors retry; auth/validation/mapping/owner
errors need action; unknown schema/exhaustion go to DLQ. Reasoned authorized replay
preserves original intent/history and starts a new bounded cycle with monotonic
lifetime attempts. Corrected data/mappings require a new version/envelope with
supersession provenance, not editing old poison intent. No provider-specific values
or credentials/default business mapping were invented. Explicit field/dictionary
rules reject missing/unknown/unsafe paths; no eval or inferred conversion.

External identity binds tenant/profile/entityType/externalId uniquely to localId,
with inverse uniqueness. A conflict rolls back canonical effects; observations
append revisioned source/job/observedAt/profileVersion/correlation provenance.
Remapping requires a future explicit correction workflow. Provider external status
never silently overwrites internal business state. Payload/result ports require
redacted/allowlisted values under deployment SecurityProfile; raw secrets are not
part of profiles or transport config in this core.

No WP49-022 1C implementation, WP49-023 weather/cadastral provider, WP49-024 cloud
replication, new domain workflow, file-format import SDK, extension SDK, status UI,
broker, secret store or provider transport/auth strategy is claimed.

## Verification and deterministic demonstration

- RED: mapping/retry acceptance imports fail before implementation. GREEN: shared
  package mapping/policy/fingerprint tests 2/2; required/dictionary/unsafe/duplicate
  targets reject without guessed defaults.
- Local full Unit gate PASS: API **66/66**, shared contracts **20/20**, config
  **17/17**, connectors **2/2**, repository regression **15/15**, migrations **5/5**,
  workspace build and bootstrap validation. Real PostgreSQL/PostGIS/MinIO/ClamAV
  integrations included by existing suites. No test waived or timeout raised.
- Targeted real PostgreSQL/HTTP deterministic connector scenario: ten concurrent
  duplicate stages/workers -> one canonical effect/audit/outbox/external revision;
  rollback after owner effect; worker restart; HTTP 429 Retry-After/503/401; bounded
  actual HTTP timeout; unknown outcome/no resend; response loss -> reconciliation
  with unchanged submit count; durable SENDING crash fixture; SENT -> ACCEPTED poll;
  exhaustion/DLQ/reasoned replay; immutable profile version pinning; schema/mapping
  poison; out-of-order owner version guard; external-ID collisions; tenant isolation,
  revoked policy; database-enforced immutable envelope/history/provenance. All PASS.
- The crash fixture preserves a durable SENDING marker before recreating the worker;
  it is deterministic crash-state injection, not a claimed physical host power-loss
  certification. Fixture clock/observedAt are fixed; due-time is advanced explicitly
  in SQL, and retry jitter=0 only in fixtures. No real provider is contacted.
- G1 local typecheck/architecture PASS (11 architecture checks); lint capability PASS
  with existing N/A because no lint tool configured. No new lint exemption.
- G2 local real clean/repeated migration/API current-version/PostGIS/checksum and
  invalid-state rejection PASS. Existing data migration assertions retained.
- G5 canonical validation/generated-client drift PASS; no public contract diff.
- Local production Compose smoke PASS including actual shared runtime packaging.
- Flutter is unavailable on this local shell; Mobile is unchanged and mandatory
  hosted Mobile gate (including Android native integration) must pass on final head
  and exact merge SHA. This report does not replace hosted evidence with N/A.

## Final G0–G12 evaluation and activation contract

| Gate | Final decision/evidence |
|---|---|
| G0 | PASS — live baseline/order/graph and completed predecessor/direct dependency evidence above |
| G1 | PASS on activation — local static/build/architecture plus final-head required static jobs |
| G2 | PASS on activation — additive owned migration v8, clean/repeated/current/checksum/invalid states and hosted Migration |
| G3 | PASS on activation — local complete Unit and final-head hosted Unit/Mobile |
| G4 | PASS on activation — actual PostgreSQL/HTTP plus existing PostGIS/storage/scan integration and hosted Runtime/Migration/Unit |
| G5 | PASS on activation — unchanged public API/generated contracts, validation/drift and final-head Contract |
| G6 | PASS on activation — durable unique staging receipt, transactional effect/audit/outbox, concurrent replay and rollback; no public event change |
| G7 | PASS on activation — default deny, current policy/owner guards, tenant isolation, cloud denial, no foreign writes |
| G8 | PASS on activation — connector outage/retry/restart/lost-response/unknown outcome; existing Mobile/Sync regression required, no new mobile flow |
| G9 | PASS on activation — immutable envelopes, profiles, attempts/audit/external links/provenance revisions, reasoned replay, atomic canonical owner evidence |
| G10 | PASS on activation — deterministic fixture-only connector scenario with fixed observation clock and controlled real HTTP/DB failure injection |
| G11 | PASS on activation — bounded external I/O, capped configured retries, concurrent duplicate locks, poison/DLQ, unknown-outcome safety, unsafe mapping paths/current permission negatives; existing security/runtime checks; no invented provider SLA |
| G12 | PASS only at activation — exact approved 20-path diff, frozen manifest unchanged, clear findings, required final-head CI, ordinary merge, successful exact merge-SHA push CI and completed CR #52 closeout |

Local review checked authority/tenant/idempotency boundaries, owner transaction
rollback, immutable mapping and provenance, timeout/unknown response/reconciliation,
SENT vs ACCEPTED and schema/packaging/assertions. Review found and fixed duplicate
mapping-target validation when inputs are missing, bounded post-crash resend
budget and discard of a connection when advisory unlock fails. Required CI and
GitHub findings must be rechecked on the exact final head; no independent approval
or self-approval is claimed. Branch protection currently requires strict `CI quality
gates` and conversation resolution, with no reviewer-approval requirement. No
auto-merge, admin/force bypass, weakening or waiver is authorized.

## Complete approved changed paths (20)

```text
apps/api/Dockerfile
apps/api/src/app.module.ts
apps/api/src/modules/integrations/integrations.module.ts
apps/api/src/modules/integrations/integrations.registry.ts
apps/api/src/modules/integrations/integrations.service.ts
apps/api/src/schema-version.service.ts
apps/api/test/identity.integration.test.mjs
apps/api/test/integrations.integration.test.mjs
apps/api/test/integrations.unit.test.mjs
apps/api/test/schema-version.test.mjs
apps/pnpm-lock.yaml
database/migrations/0008_connector_framework.sql
database/test/database.integration.test.mjs
database/test/migrate.test.mjs
packages/connectors/README.md
packages/connectors/package.json
packages/connectors/src/index.cjs
packages/connectors/src/index.d.cts
packages/connectors/test/connectors.test.mjs
tests/evidence/WP49-021_COMPLETION_REPORT.md
```

Final exact head/merge/CI/closeout evidence is appended to CR #52 after observation.
The report's conditional activation never treats pending/failed/skipped checks as
successful. Adjacent work packages are not started by this report.
