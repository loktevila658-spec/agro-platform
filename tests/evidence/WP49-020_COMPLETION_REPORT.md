# WP49-020 Completion Report — Sync protocol & conflict model

Final status: **DONE takes effect only after** the final exact PR-head required
checks and review are clear, PR #51 is ordinarily merged, CI succeeds on that exact
merge SHA, and [CR #50](https://github.com/loktevila658-spec/agro-platform/issues/50)
is closed as completed with the final SHA/run evidence. Until those observed
conditions are recorded, status is **IN PROGRESS**. Final commit/run identifiers
are recorded in the CR closeout after success, avoiding a self-referential hash.

Baseline: live `main@77656151eceb1e54536acdc3b6dabd1ff0b2389f`, independently verified
with ls-remote/fetch on 2026-10-24. No intervening main changes at G0. Work runs in a
clean managed worktree/branch `codex/wp49-020-sync`; original dirty checkout untouched.

Frozen manifest remains byte-identical:
```yaml
depends_on:
- WP49-015
- WP49-016
- WP49-019
allowed_paths_raw: /apps/api/modules/sync /apps/mobile
exit_criteria: push/pull, cursor, conflicts, retries, 14-day offline tests.
```

## G0, authority and dependency verdict

PASS. IMPLEMENTATION_ORDER W2 places 020 immediately after completed 019; build
graph has direct edges 015/016/019 -> 020. No static manifest status is evidence.

- WP49-015: merged report, implementation #32 merge `92a98de5aa0078941e2842a3bcf3ba41f0f07f34`, exact successful post-merge run [38654141205](https://github.com/loktevila658-spec/agro-platform/actions/runs/38654141205), report #33/#34, CR #31 CLOSED.
- WP49-016: merged report, implementation #37 `d814ba0f768c9f9ba216954d2c9ec3e1708fb508`, report #38 `809b97de487844bf7db3d64ab95cb84a582d937f`; exact successful report post-merge run [38664024824](https://github.com/loktevila658-spec/agro-platform/actions/runs/38664024824), CR #35 CLOSED.
- WP49-019: implementation #48 `803d7e0e59ea5ae481f6b71b1499a2ad95a8cb0d`, report #49 merge equal to this baseline. Exact final post-merge run [40089547315](https://github.com/loktevila658-spec/agro-platform/actions/runs/40089547315) SUCCESS independently live-verified. CR #47 CLOSED with explicit DONE activation [closeout](https://github.com/loktevila658-spec/agro-platform/issues/47#issuecomment-6383673132).

Read/applied AGENTS.md, CODEX_INSTRUCTIONS, frozen authority/release/graph/gates and
DOC12/20/21/47–50. DOC47 REV47-015 and DOC50 LOCAL_PRIMARY override DOC12's historical
CLOUD_PRIMARY option. Domain commands, evidence-first, immutable provenance, audit,
outbox and owner-module boundaries remain mandatory. DOC20 NFR-MOB-007 establishes
14-day no-WAN baseline; DOC12 O1 7-day grant is not silently extended. Conservative
DOC12 batch maxima 50/500 implement DOC20 100/1000 benchmarks via consecutive pages.

## Scope/impact and process evidence

Single [Scope CR #50](https://github.com/loktevila658-spec/agro-platform/issues/50)
records the full runtime/mobile/contract/codegen/migration/schema assertions/CI/test
inventory and purposes. [Approval](https://github.com/loktevila658-spec/agro-platform/issues/50#issuecomment-6383718454)
was recorded under the owner's explicit advance authorization before implementation.
Literal frozen `/apps/api/modules/sync` was preserved, not reinterpreted: the actual
compiler consumes `apps/api/src/**/*.ts`, so compiled runtime requires approved paths.

Preflight defect disclosed: the initial inventory missed root `tests/contracts.test.mjs`
(the complete endpoint-list assertion). A repository-wide recheck found this one
additional required assertion path. The same CR was amended and [approval recorded](https://github.com/loktevila658-spec/agro-platform/issues/50#issuecomment-6383870588)
before editing that file. Every existing assertion was retained and expected Sync
operations added. This is not represented as a perfect initial scope pass. Dart
package imports also require canonical in-package generated output within frozen
apps/mobile; generator/drift tests cover it. No additional business scope/flow/WP,
broker, event catalog field, UX redesign, cloud write or foreign repository write.

## Implementation

Compiled registered sync module: session authentication/device/tenant binding,
owner registry current authorization and state/rule validation, original UUIDv7 IDs,
idempotency keys/base versions/observed time/provenance/attachment intents. Each
business adapter executes through the existing version boundary on a supplied
PostgreSQL transaction with owner audit/outbox, receipt, conflict and feed atomicity.
No simplified offline domain mutation path. Production registers no invented
business handler: concrete domain flows belong to their future owner WPs. Acceptance
uses clearly identified fixture-only application handlers.

Sync-owned migration 0007 adds device, monotonic locked tenant feed counter/change,
receipt, ACK, explicit conflict intent/server state, and delayed attachment binding.
Counter lock orders committed visibility, avoiding sequence allocation/commit gaps.
Signed cursor is bound to tenant/user/device/scope/schema, validates expiry/corruption
and signals reset. Pull rechecks owner current read access and sends PURGE on denial.
No feed compaction/receipt deletion is scheduled; compaction requires bootstrap
snapshot adapter before retained_from can advance. Existing history replays safely
on expired cursor without destroying pending intent.

Mobile additive v1->v2 migration; transactional pull apply/cursor plus post-commit
ACK/recovery; immutable command envelopes, partial-response and same-ID retry;
5/15/45/120/300/900/1800-second capped backoff/jitter/Retry-After/reconnect. Ordered
claim uses a partial delivery index; required pending evidence holds sequence.
Request auth/schema failure preserves intent without inventing a domain receipt.
Ed25519 bootstrap grant fields/device are checked with a provisioned pinned public
key. Existing shell authentication/lifecycle now starts/cancels data/media workers and updates the existing queue status, with no UX redesign. Unknown Wi-Fi policy is conservative (Wi-Fi-only remains queued). Separate media worker preserves sessions/5 MiB ACKs and stable local references
through delayed completion. Existing FilesService owns hash/MIME/quarantine/AVAILABLE
and current owner policies; sync writes no files-owned table. Optional delayed media
never prevents independent data sync. Cache reset retains queue/evidence/receipts.

Canonical additive OpenAPI includes JSON sync and binary part upload, regenerated
TS/shared Dart/in-package Dart clients and tested nested intent serialization. No
event/catalog change. Server schema expected version and all exact assertions updated
to 7; old migration-6 existence assertions remain true and unchanged. Existing API
wildcard and required Mobile job already include new suites/native integration;
CI definitions and required aggregate are unchanged.

## Validation at initial PR

- RED -> GREEN cursor fixture: missing implementation failed, signed tenant cursor
  roundtrip/corruption/expiry then passed.
- Workspace build PASS; workspace typecheck + architecture PASS (11/11).
- Targeted non-Docker protocol/contracts/migration/architecture tests PASS; latest
  combined run 46/46 and contract-focused run 23/23 before final additions; final
  focused protocol/contract/migration run 31/31. Canonical generated drift PASS.
- Full Flutter unit/widget/protocol/media/grant/migration/offline suite **32/32 PASS**.
  Fourteen no-WAN days: 280 locally committed intents, daily reopen, LAN O1 renewal
  at day 7, expired-grant denial, all 280 delivered exactly once by fixture authority.
- 14-day long-outage capacity: **50,000 queued UUIDv7 intents**, 100,000 operational
  rows (outbox+audit), 20,000 cached entities, encrypted reopen on day 14, all 50,000
  distinct IDs confirmed; **91,158 ms** convergence on local native Flutter/Dart
  protocol engineering fixture, below <=30 min lightweight LAN budget. No pending
  command loss. An earlier slow run was stopped for index-plan correction and is
  not claimed as PASS; indexed final complete suite passed in 99 s.
- Flutter analyzer/fatal infos PASS before final generated binary update; final
  analyzer/format rechecked before final head. Real local HTTP/generated serialization/Retry-After/redirect-refusal test plus engine suite: 6/6 PASS. API non-DB suite 46/46 and repository regressions 15/15 PASS. Dependency lockfile unchanged.
- Local Docker info/image lookup did not respond; task-owned probes were stopped.
  Local PostgreSQL/integration/runtime gates are NOT claimed PASS. Hosted required
  CI must run real PostgreSQL/PostGIS/MinIO/ClamAV and Compose plus Android native
  build/OS keystore/encrypted SQLite/pull transaction interruption before merge.
- Physical-device battery/ANR/full business workflow performance remain release
  qualification; this package claims protocol engineering tests only.

## Historical initial-PR G0–G12 decisions (superseded at final activation)

| Gate | Decision |
|---|---|
| G0 | PASS — live baseline, merged dependency reports/CI/closed CR, compatible contracts |
| G1 | Local build/typecheck/architecture PASS; final static/hosted checks pending |
| G2 | Additive mobile/server schema and local migration PASS; hosted real migration pending |
| G3 | Mobile 32/32 and focused server/contract tests PASS; hosted full unit pending |
| G4 | Hosted real DB/storage/HTTP and Android integration pending |
| G5 | Canonical/codegen/drift/nested/binary contract checks PASS; exact-head pending |
| G6 | Stable receipts/inbox/outbox transaction tests implemented; hosted PostgreSQL pending |
| G7 | Default deny, revoked permission/tenant/device/read purge tests; hosted pending |
| G8 | Mobile disconnect/reconnect/partial/restart/conflict/reset/media and 14-day PASS; server pending |
| G9 | Original intent and terminal receipts retained; owner audit/outbox transaction test pending |
| G10 | Deterministic protocol/native scenarios; Android/HTTP hosted pending |
| G11 | 14-day/50k capacity/convergence PASS; hosted server 100-command/1000-change NFR and security pending |
| G12 | IN PROGRESS — full approved path check/review/exact-head CI/ordinary merge/post-merge/closeout pending |

Final exact PR head, merge SHA/run and review are recorded in CR #50 only after
observed results. The full 49-file path inventory is below. DONE activation will use final CR closeout to avoid
self-referential report commit hashes. No auto-merge, force/admin bypass or waiver.

## Approved changed paths at initial implementation head

```text
apps/api/src/app.module.ts
apps/api/src/main.ts
apps/api/src/modules/files/files.module.ts
apps/api/src/modules/identity/identity.module.ts
apps/api/src/modules/sync/sync.controller.ts
apps/api/src/modules/sync/sync.crypto.ts
apps/api/src/modules/sync/sync.files.ts
apps/api/src/modules/sync/sync.module.ts
apps/api/src/modules/sync/sync.registry.ts
apps/api/src/modules/sync/sync.service.ts
apps/api/src/modules/sync/sync.tokens.ts
apps/api/src/modules/sync/sync.types.ts
apps/api/src/schema-version.service.ts
apps/api/test/identity.integration.test.mjs
apps/api/test/schema-version.test.mjs
apps/api/test/sync.integration.test.mjs
apps/api/test/sync.unit.test.mjs
apps/mobile/README.md
apps/mobile/SYNC_IMPACT_SCOPE.md
apps/mobile/lib/main.dart
apps/mobile/integration_test/persistence_test.dart
apps/mobile/lib/generated/contracts.dart
apps/mobile/lib/persistence/command_queue.dart
apps/mobile/lib/persistence/database.dart
apps/mobile/lib/persistence/workspace.dart
apps/mobile/lib/sync.dart
apps/mobile/lib/sync/attachment_worker.dart
apps/mobile/lib/sync/grant_verifier.dart
apps/mobile/lib/sync/http_transport.dart
apps/mobile/lib/sync/protocol.dart
apps/mobile/lib/sync/pull_store.dart
apps/mobile/lib/sync/sync_engine.dart
apps/mobile/test/sync_attachment_test.dart
apps/mobile/test/sync_engine_test.dart
apps/mobile/test/sync_grant_test.dart
apps/mobile/test/sync_migration_test.dart
apps/mobile/test/sync_offline_test.dart
apps/mobile/test/workspace_test.dart
database/migrations/0007_sync_protocol.sql
database/test/database.integration.test.mjs
database/test/migrate.test.mjs
openapi/openapi.yaml
packages/contracts/generated/dart/contracts.dart
packages/contracts/generated/manifest.json
packages/contracts/scripts/lib/contracts.mjs
packages/contracts/src/generated/contracts.ts
packages/contracts/test/contracts.test.mjs
tests/contracts.test.mjs
tests/evidence/WP49-020_COMPLETION_REPORT.md
```


## Resume audit and numeric cursor regression — 2026-10-28

Live main remains the baseline above and PR [#51](https://github.com/loktevila658-spec/agro-platform/pull/51)
remains open. Initial exact-head run [40092617342](https://github.com/loktevila658-spec/agro-platform/actions/runs/40092617342)
on `34af3fd4c1cd902f68def6221e8f2a2bdd389d53` did NOT pass: Unit reached its timeout
and the aggregate failed. Lint/typecheck/contract/migration/runtime and Mobile passed.
Hosted Mobile: **33/33** unit/widget tests, 14-day/50k convergence **264,980 ms**,
Android debug APK PASS, native encrypted-SQLite/OS-keystore/pull rollback/reopen
integration **1/1 PASS**, enqueue P95 **12 ms**, shared wipe <30 s. Those passes do
not substitute for the failed Unit/aggregate or authorize a merge.

Root cause: `SELECT seq::text ... ORDER BY seq` ordered the returned text alias
lexicographically. Beyond single digits it could advance a cursor past unseen
numeric changes and then stall convergence. Fixed to `ORDER BY sync.change.seq`
(the original bigint). The strengthened fixture requires strictly increasing
numeric sequence, exact equality with every persisted change ID, nonempty progress
until hasMore=false, and a bounded page loop. No timeout/acceptance threshold was
increased. Statement/probe diagnostics fail boundedly instead of silently hanging.

Real PostgreSQL RED -> GREEN reproduced on the same strengthened fixture: old SQL
fails `numeric sequence must strictly increase`; fixed SQL delivers **all 1,503**
changes without gaps in **10.0 ms** (four <=500-row pages), 100-command P95
**204.4 ms** (five samples, two <=50-command requests per sample). Full local
`node scripts/ci-gates.mjs unit` **PASS** after starting the existing Docker runtime.
The earlier local Docker limitation no longer blocks real integration verification.
Final exact-head CI, merge and post-merge activation remain pending.


## Final gate evaluation and activation contract

This evaluation becomes PASS only when the explicit final status conditions at
the top are observed and the CR closeout records the exact final PR head, ordinary
two-parent merge SHA and its successful post-merge run. It does not treat pending,
cancelled, skipped or failed checks as successful. Initial failed run 40092617342
remains recorded above and is not completion evidence. Final-head changes after
`1236136c8d500ddb9de22f8dbb1bcb01119d798a` are this report only.

| Gate | Evidence and final activation decision |
|---|---|
| G0 | PASS — live baseline/order/graph and dependency 015/016/019 reports, closed CRs, exact post-merge CI independently verified; main did not advance before implementation |
| G1 | PASS on activation — local build/typecheck/architecture and fatal Flutter analyze/format; required exact-head static jobs must also succeed |
| G2 | PASS on activation — additive server v7 and mobile v2, encrypted v1 migration preserves IDs/queue/evidence, future version fails closed; required real clean/repeated PostgreSQL migration |
| G3 | PASS on activation — full local Unit PASS, API 52/52; hosted Mobile 33/33 and final-head Unit/Mobile required |
| G4 | PASS on activation — real PostgreSQL atomic effect/audit/outbox/receipt/feed, delayed binding and HTTP acceptance locally PASS; required final-head PostgreSQL/PostGIS/MinIO/ClamAV plus Android APK/native integration |
| G5 | PASS on activation — additive canonical JSON/binary OpenAPI; generated TS/shared Dart/mobile copy, nested intent serialization, no drift; all previous assertions retained |
| G6 | PASS on activation — ten concurrent duplicate sends/restart/lost response/partial batch cause one fixture effect/audit/outbox; receipt and owner effect share transaction; no event catalog changes |
| G7 | PASS on activation — default deny, current server auth/permission/domain guard, tenant/device isolation, stale versions and permission-revoked projections PURGE; rejected receipt replay preserved |
| G8 | PASS on activation — mobile reconnect/partial/duplicate/conflict/rejection/cursor crash/reset/migration/delayed upload/restart; deterministic 14-day profiles and 50k IDs with zero loss |
| G9 | PASS on activation — immutable original command/provenance/evidence and explicit conflict snapshot; authoritative fixture effect/audit/outbox/receipt/feed commit or roll back together; production writes only sync-owned tables through owner application ports |
| G10 | PASS on activation — fixed-seed/time-shaped protocol fixtures, real HTTP/server and native Android pull interruption/reopen; future business flows are not claimed |
| G11 | PASS on activation — 100k operational rows/20k entities, 50k convergence <30 min; server 100-command P95 <2 s and all 1503 changes <2 s, numeric-order RED->GREEN, current permissions/authority/redirect protections; physical-device release qualification remains explicit |
| G12 | PASS only at activation — all 49 paths mapped to frozen/approved scope, manifest byte-identical, review findings clear, mandatory exact final-head checks successful, ordinary merge and exact successful post-merge CI, CR #50 closed with canonical evidence |

Review: numeric cursor alias data-loss defect and ordering-index performance issue
were corrected with meaningful regression evidence. Final review checks are made
again on the final head. No independent approval or self-approval is claimed;
repository protection requires `CI quality gates` and conversation resolution,
with no reviewer approval requirement. No auto-merge, admin/force bypass or test
waiver is used. The initial preflight omission is disclosed and approved in the
single Scope CR, rather than silently broadening paths.

Implemented boundaries/limits remain as documented: no registered invented
business command, no cloud operational writes, no direct foreign repository write,
no new event fields/broker/connector framework/UX redesign. File authorization and
required business evidence remain owner-domain rules; client transport hints never
authorize canonical domain changes. Feed compaction is not scheduled without a
snapshot adapter; retained history and pending intent are preserved. Unknown network
type keeps Wi-Fi-only media queued. Physical Android battery/ANR/production workflow
qualification belongs to the declared release profile and is not replaced by these
protocol engineering fixtures.
