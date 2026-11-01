# WP49-022 Completion Report — 1C connector skeleton

Status: IN PROGRESS until exact final PR-head required checks/review are clear,
ordinary merge succeeds, exact merge-SHA push CI succeeds and Scope CR #54 closes
as completed. Observing all those conditions activates DONE and the final G0–G12
verdicts below. Final identifiers are recorded in CR closeout, avoiding a report
that requires embedding its own resulting commit hash.

Baseline: fetched live origin/main and independently checked GitHub main SHA
`12fca8a7c63f75e205c28345b1dbd24785ff475e` on 2026-11-01. Expected baseline matched.
Clean managed worktree `wp49-022-one-c`, branch `codex/wp49-022-one-c`; original
dirty checkout left untouched. Main rechecked unchanged during final local review.

Frozen record preserved verbatim; manifest is byte-identical:
```yaml
depends_on:
- WP49-021
allowed_paths_raw: /apps/api/modules/integrations/1c
exit_criteria: mock-backed import/export, reconciliation shell.
```

## G0 and governing authority

PASS. IMPLEMENTATION_ORDER W2 places WP49-022 immediately after WP49-021. The live
build graph has direct dependency WP49-021 -> WP49-022. Static NOT_STARTED fields
are not evidence. WP49-021 has merged implementation PR #53 and canonical report,
closed completed Scope CR #52 with DONE activation, ordinary merge equal to this
baseline, and exact successful push CI
[41288067398](https://github.com/loktevila658-spec/agro-platform/actions/runs/41288067398).
All eight jobs independently inspected SUCCESS, including Mobile and aggregate.
Schema v8 and existing framework/API/events remain compatible with this expansion.

Read/applied AGENTS.md, CODEX_INSTRUCTIONS, SPEC_AUTHORITY, order/build graph,
manifest, source-of-truth, quality gates and change schema; DOC50 execution/release,
DOC48 frozen scope/RTM, DOC47 decisions, DOC49 WP graph; DOC13 integration architecture,
profiles, §7 1C directions, mapping, reliability, LOCAL_PRIMARY and INT-T001/T002;
DOC23 attribute SoT/reconciliation/provenance; REV47-023/025/035 and TZ50-082–093.
Authority follows DOC50 > DOC48 > DOC47 > DOC49, with canonical owner decisions;
no latest-document-wins rule. No release/FUTURE/adjacent-WP promotion.

1C provides configuration-specific accounting codes/requisites, personnel/master
references, accounting actual/posting/external status; can bootstrap/reference
stock snapshots subject to governance. It receives accounting reflection of CLOSED
consumption, output and platform operational facts. Direction of organization,
material/unit, warehouses, field/season and maintenance references depends on an
explicit profile. Accounting/tax/postings/regulated accounting remain 1C SoT;
platform retains operational identity/facts, assignments/permissions, warehouse
ledger/derived balances, production state and preliminary estimates. External GUIDs
are links, not platform primary keys; external rejection never deletes a local fact.

## Complete preflight and approved scope

[Single Scope CR #54](https://github.com/loktevila658-spec/agro-platform/issues/54)
contains the complete 16-path inventory, each reason, design, test/assertion impact
and exclusions. [Delegated approval](https://github.com/loktevila658-spec/agro-platform/issues/54#issuecomment-6555702236)
was recorded before implementation and clean worktree creation, under the owner's
explicit prior authorization. This is delegated approval, not independent review.

Preflight traced framework registry/policy, staging, immutable mapping/profile,
owner transaction, external IDs/provenance, idempotency, bounded retry/DLQ/unknown
outcome and replay; API compiler rootDir=src/include=src/**/*.ts, Nest composition,
Docker packaging, configuration, canonical contracts/codegen, migration discovery,
all current/count/sequence/ahead assertions, wildcard tests and CI graph. Frozen
`/apps/api/modules/integrations/1c` was not normalized: it is excluded by compilation.
Approved compiled paths are explicit. No partial implementation before approval,
no follow-on scope expansion, no lockfile/importer or dependency change.

Canonical public contracts/codegen/events need no change: this skeleton adds no
HTTP endpoint or public event. Existing API test wildcard, workspace scripts,
Docker compiled COPY and migration discovery already execute/package all additions;
CI files need no edit. Five affected schema assertion/runtime files were included
up front; historical migration assertions retained, current v9 and ahead v10 tested.

## Delivered behavior and limitations

Compiled Nest OneCModule registers only ONE_C_MOCK with the WP49-021 framework.
Trusted composition installs current server policy and registers actual canonical
owner application commands through a guarded port. Default deny; no default
business handler or invented domain process. Explicit immutable per-profile/version
binding pins operation/entity/direction and attribute aspect/authority/type/required
rules. ACCOUNTING remains ONE_C; OPERATIONAL remains PLATFORM and cannot be imported
as canonical facts. REFERENCE needs explicit authority. Customer-specific bidirectional
resolution is not guessed: this skeleton uses separate versioned IN/OUT profiles.

Inbound envelopes commit common staging before mapping/type/required/owner validation.
Owner permission/domain/version checks, canonical projection, owner audit/outbox,
external-ID link/provenance revision and connector completion share one transaction.
Failure rolls all canonical effects back; invalid payload remains staged/actionable.
Production connector code mutates only integrations-owned metadata; fixture owner
SQL lives solely in an isolated one_c_fixture test schema. No production domain
handler, accounting engine, payroll or treasury was added.

Mock acceptance explicitly says MOCK_ACCEPTED; it is not a real 1C posting. Stable
mock GUID/intent hash/provenance receipts are durable in PostgreSQL and deduplicate
by tenant/profile/key. Framework attempts/backoff/DLQ/reasoned replay continue to
apply. Lost response and durable SENDING reconcile before resend. NOT_FOUND is
conclusive only for this mock store; UNKNOWN/timeout does not authorize resend.
Integration outage/rejection leaves local operational facts intact and independent
writes usable. No arbitrary endpoint, network call, credentials, SDK, production
1C payload format, transport or exchange method is configured or implemented.

Reconciliation shell compares caller-provided mock snapshots of GUID, normalized
total and opaque modified version. It appends MATCHED/OPEN observations and explicit
GUID/TOTAL/VERSION/MISSING differences, actor, source observation time and correlation,
audit and internal reconciliation journal atomically. Concurrent same-key duplicates
return one observation; different intent conflicts. READ permission exposes latest
100 tenant/profile observations. It never fixes mappings, creates duplicate master
records, overwrites balances or mutates domain facts. Totals compare normalized
strings with caller-supplied consistent precision/units; no guessed conversion or
version ordering. Real-provider polling, status UI and correction workflows are
outside this shell. It claims no new complete UI or external connector SLA.

Migration 0009 expands v8->v9 with integrations.one_c_binding, one_c_mock_receipt,
one_c_reconciliation and one_c_reconciliation_outbox. Bindings, mock receipts and
observations/history are database-immutable; no purge/destructive DOWN. Existing
profiles/jobs remain valid. API expected version=9. Configure commits the common
profile first, then binding+audit: second-stage failure may leave an inert unbound
profile, safely completed by the same retry; unbound execution fails closed. Old
versions remain retained for in-flight interpretation. Future archival requires
retention/legal-hold policy. Raw staging redaction remains the existing framework's
trusted SecurityProfile input contract; no secret storage implementation was added.

## Verification

- RED: new acceptance imports fail with missing compiled 1C policy/runtime before
  implementation. GREEN targeted: **15/15** tests, zero skips/failures, including
  ten real-PostgreSQL exchange/reconciliation subscenarios and pure/runtime guards.
- Real PostgreSQL deterministic scenario with fixed observation time/correlation,
  explicit due-time advancement and fixture-only jitter=0: concurrent repeated
  inbound stage/dispatch -> one projection/owner audit/outbox/link revision;
  partial/type/mapping rejection after STAGED evidence; owner-effect rollback;
  recreated registry/adapter/services retry; stale version/GUID collision rejection;
  outbound dictionary mapping, concurrent duplicate acceptance and stable GUID;
  changed outbound intent rejection; lost committed mock response -> durable receipt
  reconciliation without resend; unavailable provider -> retries/exhaustion/DLQ/
  reasoned replay while separate local CLOSED fact commits; durable SENDING/unknown
  outcome; external rejection preserves CLOSED fact; GUID/total/version/missing/match
  observations; concurrent comparison dedup, audit+journal uniqueness and restart
  persistence; immutable versions/history, tenant isolation/current revoked policy
  and cloud-authority denial. No real provider contacted.
- The crash marker is deterministic durable state injection, not certification of
  physical power failure. Mock projections are explicit owner fixtures, not claims
  that future business modules were implemented.
- Initial full local Unit PASS: workspace build, API **79/79** before final extra
  negative tests; contracts **20/20**, config **17/17**, connectors **2/2**,
  repository regression **15/15**, migrations **5/5**, bootstrap validation.
- Final API suite with all unchanged assertions and sequential test-file execution
  PASS **81/81**, zero skips/failures. Final static/contracts, migration unit,
  repository regression and structural validation also PASS. Test-file sequencing
  controls local Docker fixture contention; concurrency within tests is retained.
  Default hosted Unit remains mandatory on the exact final head and merge SHA.
- Local Typecheck/architecture PASS (11 architecture checks), Contract validation
  and generated-client drift PASS, Migration real clean/repeated/PostGIS/current/API/
  checksum/invalid-state rejection PASS. Lint capability PASS with established N/A
  because no lint tool is configured; no new exemption.
- A repeat Unit run overlapping production Compose compilation failed the unchanged
  existing Sync 100-command P95 gate (2759 ms). No assertion/threshold was modified;
  an isolated full default-concurrency repeat also failed Sync P95 (2786 ms).
  Final sequential API execution passed all 81 tests without changing assertions.
  Both failed default runs are disclosed, not treated as PASS.
- Production Compose runtime smoke PASS. Exact final-head/post-merge hosted jobs
  must PASS before activation, as checked in CR closeout. Mobile source unchanged; local
  Flutter unavailable, so mandatory hosted Mobile including Android integration is
  required, not replaced by N/A.

## Final gate evaluation (activated only after observed closeout)

| Gate | Verdict/evidence |
|---|---|
| G0 | PASS — live main/order/graph, merged report/closed dependency CR/exact post-merge CI |
| G1 | PASS on activation — local compile/typecheck/architecture/diff check and final-head static jobs |
| G2 | PASS on activation — owned additive v9; complete assertions, clean/repeated/invalid-state migration |
| G3 | PASS on activation — targeted 15/15, full local Unit and final-head hosted Unit/Mobile |
| G4 | PASS on activation — real PostgreSQL mock exchange/owner transaction and project integration/runtime jobs |
| G5 | PASS on activation — public API/events unchanged; canonical validation/codegen drift |
| G6 | PASS on activation — common staging/receipt/key/link idempotency, transactional owner audit/outbox and reconciliation journal |
| G7 | PASS on activation — default deny/current policy/tenant and owner guards; cloud denial; no foreign production writes |
| G8 | PASS on activation — unavailable provider leaves local writes usable, durable retry/restart/unknown-outcome safety; unchanged Mobile/Sync regressions |
| G9 | PASS on activation — immutable profile/binding/receipt/envelope/provenance/observations, owner effect/audit/outbox atomic |
| G10 | PASS on activation — deterministic mock exchange/reconciliation fixture, fixed observation clock and controlled failures |
| G11 | PASS on activation — inherited bounded attempts/timeout, poison/rejection/DLQ, concurrent dedup/unknown outcome and boundary/security negative tests |
| G12 | PASS only at activation — approved exact 16 paths, frozen manifest unchanged, clear review/findings, exact-head required checks, ordinary merge and exact merge-SHA push CI, completed CR closure |

Local review checked module wiring, attribute SoT/direction, staged validation,
owner rollback, external identity/provenance, immutable intent/version, restart
reconciliation and tenant/default-deny boundaries. Restart test was strengthened
to recreate registry/adapter and services; schema-version validation was kept after durable staging (routing checks remain before staging), with a dedicated DLQ test and independent owner-denial assertion; explicit pre-DB denial/static network/
foreign-write checks were added. No independent reviewer or self-approval claimed.
Protection inspected: strict CI quality gates and conversation resolution; no
reviewer-approval requirement. No auto-merge/admin/force bypass or check weakening.
Final exact-head findings and post-merge evidence live in CR #54 closeout.

## Exact approved changed paths (16)

```text
apps/api/src/app.module.ts
apps/api/src/modules/integrations/1c/README.md
apps/api/src/modules/integrations/1c/one-c.types.ts
apps/api/src/modules/integrations/1c/one-c.policy.ts
apps/api/src/modules/integrations/1c/one-c.mock.ts
apps/api/src/modules/integrations/1c/one-c.service.ts
apps/api/src/modules/integrations/1c/one-c.module.ts
apps/api/src/schema-version.service.ts
apps/api/test/identity.integration.test.mjs
apps/api/test/one-c.unit.test.mjs
apps/api/test/one-c.integration.test.mjs
apps/api/test/schema-version.test.mjs
database/migrations/0009_one_c_skeleton.sql
database/test/migrate.test.mjs
database/test/database.integration.test.mjs
tests/evidence/WP49-022_COMPLETION_REPORT.md
```

No WP49-023/024, FGIS, general framework expansion or new domain workflow started.
