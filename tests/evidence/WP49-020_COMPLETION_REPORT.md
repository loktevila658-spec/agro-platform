# WP49-020 Completion Report — Sync protocol & conflict model

Status: **IN PROGRESS**. No DONE activation until required exact-head review/checks,
ordinary merge and exact post-merge CI, final evidence closeout and CR #50 closure.

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

## G0–G12 decisions (pending exact-head CI)

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

Final exact PR head, merge SHA/run, review and final path inventory will be added
only after observed results. DONE activation will use final CR closeout to avoid
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
