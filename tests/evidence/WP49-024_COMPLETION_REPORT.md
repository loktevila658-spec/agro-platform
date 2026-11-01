# WP49-024 Completion Report — Cloud replication pipeline

Date: 2026-11-01–02 (Europe/Moscow). Branch: `codex/wp49-024-replication`.
Status: **DONE**. All applicable G0–G12 PASS. This report-only correction records
already completed closeout; it changes no implementation or frozen scope and does
not reopen CR #58.

Observed final closeout evidence:
- [PR #59](https://github.com/loktevila658-spec/agro-platform/pull/59), tested head
  `d92d2fa9d29c8055a81c19c0d82eb036a409c19a`; exact-head
  [run 41350221688](https://github.com/loktevila658-spec/agro-platform/actions/runs/41350221688),
  attempt 1, all eight required jobs SUCCESS; no outstanding review findings.
- Ordinary two-parent merge `f20d89c48ff5fc3b753548f785961e9578c19b28`, parents
  baseline `d7b2cdac29ee7e4dfc5aad5fc48658866ac836e3` and tested head above;
  tree `0b787fb569664f85da3df26b73c121665b626e6b` equals tested-head tree.
- Exact merge-SHA event=push
  [run 41350936656](https://github.com/loktevila658-spec/agro-platform/actions/runs/41350936656),
  attempt 1, completed SUCCESS: Unit, Migration, Runtime, Mobile, Typecheck,
  Contract, Lint and aggregate CI quality gates (8/8).
- [Final DONE/G0–G12 closeout comment](https://github.com/loktevila658-spec/agro-platform/issues/58#issuecomment-6564065197);
  [CR #58](https://github.com/loktevila658-spec/agro-platform/issues/58) CLOSED,
  state_reason=completed, closed 2026-11-01T21:21:57Z. Activation conditions fulfilled.
- Rechecked 2026-11-02: live main equals exact merge SHA, CR closure and final
  comment retained, exact push run and all eight successful jobs observed.

Hosted final-head Unit API 112/112, replication 19/19, contracts 20/20, config
17/17, connectors 2/2, root regressions 15/15 and migration units 5/5 PASS.
Post-merge Unit API 112/112 (zero failures/skips), unchanged sync P95=648.1ms
(<2s), all 1503 changes without gaps. Mobile 33/33 and native Android 1/1 PASS;
14-day/50k convergence=89610ms, 100k operational rows/20k entities/zero lost IDs,
emulator enqueue P95=7ms. Hosted evidence resolves the local Docker/Flutter
verification limitations disclosed below; no local failed attempt is relabelled.
These emulator measurements do not certify physical devices or production WAN/TLS.

## 1. G0 and authority

Live `origin/main` independently verified using ls-remote at
`d7b2cdac29ee7e4dfc5aad5fc48658866ac836e3`, matching owner's expected baseline.
Repeated main checks remained unchanged during implementation. Completion Report
of WP49-023 is present in that exact tree; merged PR #57/closed completed CR #56
activate its DONE conditions. Exact baseline merge-SHA event=push
[run 41314307864](https://github.com/loktevila658-spec/agro-platform/actions/runs/41314307864)
was independently checked: all eight jobs SUCCESS, including Mobile/aggregate.

Authoritative IMPLEMENTATION_ORDER W2 puts WP49-024 after 023, before W3. Live
manifest/build graph/DOC49 specify dependencies WP49-016 and WP49-020. Completion
evidence, never static manifest status, establishes both dependencies:

- WP49-016 report/merged PR #37, ordinary merge
  `d814ba0f768c9f9ba216954d2c9ec3e1708fb508`, closed completed CR #35. Exact push
  [run 38663300581](https://github.com/loktevila658-spec/agro-platform/actions/runs/38663300581)
  independently checked: all seven then-required jobs SUCCESS. Report closeout
  PR #38 is also in baseline.
- WP49-020 report/merged PR #51, ordinary merge
  `d20c5fc2142eeefcc2892f10320ffb46273ff07c`, closed completed CR #50 with explicit
  DONE activation. Exact push
  [run 40724649127](https://github.com/loktevila658-spec/agro-platform/actions/runs/40724649127)
  independently checked: all eight jobs SUCCESS.

AGENTS/CODEX_INSTRUCTIONS, authority/SoT/REV47 decisions, order/graph/manifests,
change schema and executable quality gates applied. DOC50 execution/release >
DOC48 scope/RTM > DOC47 reconciliation/ownership > DOC49 graph; DOC22 §§1–4/12/22.3
(DEP-002–008/113–122), DOC23 data layers/attribute SoT/lineage/retention/corrections,
TZ50-017/018/034/069 and outage/read-model acceptance govern this package.
No latest-document-wins, release promotion, adjacent-WP implementation or new
business authority. Local remains sole operational authority through all failures.

Frozen manifest remains byte-identical. Literal fields preserved verbatim:
```yaml
allowed_paths_raw: /apps/api/modules/replication
exit_criteria: async local->cloud, cloud cannot overwrite local authority.
```

## 2. Complete scope and preflight

One [Scope CR #58](https://github.com/loktevila658-spec/agro-platform/issues/58)
records the complete exact 19-path additional allowlist and per-file rationale.
[Delegated owner approval](https://github.com/loktevila658-spec/agro-platform/issues/58#issuecomment-6563711062)
was recorded before worktree/code using the owner's explicit advance authorization;
this is delegated approval, not independent review. Initial sandbox ref-lock denial
was resolved by authorized worktree creation. Clean isolated worktree
`/private/tmp/agro-wp49-024-replication` starts at baseline; original dirty checkout
was not edited.

Preflight traced compiled rootDir=src/include=src/**/*.ts, actual Nest registration,
Docker dist packaging; WP016 durable discovery/inbox transaction and retry leases;
WP020 tenant commit-ordered clock/device/user cursor/receipts/ACK/feed/attachments;
WP021 jobs/owner-command/policy/staging/retry/DLQ and WP023 evidence/provider
contracts; current LOCAL_PRIMARY-only configuration/external secret-reference
boundary; migrations/current/ahead/count assertions; OpenAPI/event catalog/codegen,
API test wildcard, full project workflow/gates and existing regression suites.
The literal frozen path is uncompiled and was not silently normalized.

Full default baseline Unit PASS before code, API 93/93 including real existing
PostgreSQL integration regressions. Schema assertion search covered API/database/
root tests: expected/current/ahead in schema-version test, current version in
identity integration, contiguous version in migration unit and clean/repeated/
count/API versions in database integration. Those four exact files were included
before implementation. Other suites assert historical migrations and remain
unchanged. No new package/lock/config/CI/script/public HTTP/event payload/generated
client path is required. Public contracts remain compatible; database expands v9→10.

Existing notification factory's direct one-argument invocation surfaced in the
first implementation full Unit; compiled factory now preserves that contract via
additional variadic handlers while actual Nest injects both consumers. No test
was weakened/edited or extra scope added. Review found org.unit.created's actual
owner entity type is organization_unit; capture and all-four-type regression now
preserve it exactly. These corrections are disclosed, not hidden as initial passes.

## 3. Delivered Local → Holding pipeline

Local `ReplicationModule` registers durable capture/worker in compiled API. WP016
consumer supplies the same inbox transaction to replication-owned append. The
initial permitted feed is the four catalog org.*.created@1.0.0 metadata events,
validated against exact catalog fields and actual owner entity type/identity/time.
Known org events with unsupported versions fail capture with a named WP016 retry
error rather than becoming silently processed inbox entries. Security/identity
payloads are excluded. The current org catalog is metadata-only; no full business
snapshot is fabricated, no foreign business rows are read for replication.

A server-only owner append contract supports explicit approved projections with
protocol version, event/tenant/aggregate identity, owner revision, actor/source
provenance, correlation/causation/original time/evidence, correction/tombstone and
object refs/hash. Owner command/consumer transaction is mandatory (autocommit
SAVEPOINT fails). Domain validation/permission/audit/outbox remain owning-module
responsibilities. No future owner/domain/provider is registered. This port is not
a user or Cloud command endpoint.

Tenant clock locks serialize committed sequence allocation; rollbacks cannot leave
a skipped visible sequence. Local durable outbox retains original immutable content,
hash, attempts, PENDING/SENDING/ACKED/RETRY_WAIT/DEAD_LETTER state, next-attempt and
error. Append/journal share the caller transaction; duplicate event content is
idempotent and conflicting reuse fails. No PostgreSQL multi-master, row mirroring,
Redis business authority or dependency on external availability/hardware/AI.

Worker sends bounded asynchronous messages only to a trusted registered HTTPS port
under current default-deny WP021 EXECUTE policy. One event/stream/cycle, <=10 streams,
<=1 MiB change and durable minimum stream interval bound bandwidth; inactive
unconfigured tenants do not starve configured streams. No production destination
is installed by default, so retained backlog reports DESTINATION_UNCONFIGURED.
Local connection/statement timeouts are bounded to 5s. Per-stream session lock
serializes multiple workers through send/ACK; crash releases lock, persisted SENDING
and next-attempt resume from the same event. Exponential 1s–5min retry, timeout/abort
and bounded attempts lead to visible DLQ. Poison head blocks its stream, never
silently skipped or acknowledged. Unknown errors are sanitized to UNAVAILABLE.

Cloud receiver is a separate server-only capability with holding pool/registry,
not a Local Nest provider/controller. Its only SQL targets are replication-owned
stream, immutable history and derived current read-model. Actual PostgreSQL grants
in tests permit only those tables and reject an attempted org authoritative write.
Cloud receives no Local pool/domain service/command port. There is no reverse
transport, last-write-wins, failover authority or command-bearing ACK.

Messages authenticate the installation with externally supplied per-installation
secret and domain-separated HMAC. Exact tenant/site/installation/version/hash/ID/
sequence validation precedes apply. Cloud locks stream, commits dedup/history,
read-model and contiguous cursor in one transaction, then returns signed ACK.
Exact duplicates return the original event ACK even after later events. Gaps are
retryable; conflicting sequence/event/hash and stale/unlinked revisions fail.
Initial UPSERT cannot silently overwrite an existing aggregate. CORRECTION and
TOMBSTONE require increasing owner revision and exact prior event ID. Original
versions/provenance remain immutable; tombstone keeps history. Object references
are preserved while independently arriving bytes are not required for metadata ACK.

Local accepts only the exact signed version/tenant/site/installation/event/hash/
sequence receipt. Outbox ACK/checkpoint/journal commit together. Cloud cannot supply
business data or a command through this receipt. Lost ACK or Local ACK transaction
failure safely resends the identical event without a second Cloud effect. Late
Cloud completion after timeout may commit there, but cannot advance Local ACK.

READ status reports backlog count/bytes, oldest unsent/lag, last ACK, errors and
DLQ. Unreachable Local DB surfaces existing runtime failure/logging; it cannot
persist a metric about its own outage. REPLAY requires current permission/reason,
journals identity and retries the same poison event, without content/checkpoint edit.
Controlled rebuild takes sender lock, journals actor/reason, resets delivery cursor
to zero and replays complete retained history into a fresh/surviving holding copy.
No history compaction/deletion or invented snapshot contract exists. Permanent
semantic poison requires approved owner recovery; it cannot be cleared by forcing
ACK, deleting history or silently editing content.

## 4. Configuration, schema and limits

Trusted bootstrap binds one authoritative site/installation per tenant (many
tenants per holding receiver), service subject, external key >=32 bytes, explicit
timeout/minimum poll/max attempts and optional transport. Binding immutable in
registry and persisted without secrets on first send; changed destination identity
is rejected/observable. No production URL/vendor/storage/deployment layout/shared
config authority expansion was guessed. HTTPS adapter must verify TLS peer, avoid
credential redirects, bound response parsing and honor cancellation. Test transport
exercises full protocol but does not certify a production TLS/WAN deployment.

Migration 0010 is additive and replication-owned: local_clock/local_outbox/journal,
cloud_stream/cloud_history/cloud_read_model and immutability triggers. API expects
v10; clean/repeated/checksum-invalid/current/readiness assertions cover migration.
Use distinct Local/Holding databases and restricted receiver credentials; a
holding receiver is not another Local business API and replica is not Local
backup/PITR. No public endpoint/event/schema/client change or compatibility waiver.

## 5. Tests, review and gates

Acceptance imports RED before implementation (both missing compiled modules).
Targeted replication **19/19 PASS** on the last working Docker run; together with unchanged notification
regressions **22/22 PASS**. Real integration uses three independent PostgreSQL DBs:
Local, restricted Holding and empty rebuilt Holding. All tests execute, no skips.
Fixed scenario clock 2026-11-01T00:00:00Z/source hashes; UUID/container isolation is
not a source of business decision time. Machine-readable demo emitted:
```json
{"scenario":"WP49-024","clock":"2026-11-01T00:00:00Z","numericEvents":12,"lostAckResumed":true,"cloudRollback":true,"localAckRollback":true,"correctionHistory":true,"tombstone":true,"cloudAuthoritativeWriteRejected":true}
```

Tests exercise autocommit/rollback/commit-order, successful numeric >9 send,
concurrent duplicate stage/send/receive, signed wrong key/site/version/content,
receiver gaps/conflicting duplicates, fresh worker+pool after lost ACK/SENDING,
real Cloud transaction rollback, real Local ACK transaction failure, exact ACK
mismatch, bounded durable backoff/DLQ/permissioned replay, increasing correction/
tombstone/immutable history, full rebuild into an empty DB, delayed object metadata,
late receive after abort, denied Cloud authoritative SQL, actual WP016 org capture,
all four owner types, compiled Nest and default-deny/no receiver/foreign-write path.

Local gate results and disclosed initial attempts:
- Typecheck/architecture PASS (11/11); lint capability PASS, existing N/A because
  no configured lint tool. Contracts/codegen PASS, no generated drift.
- First full Unit exposed notification factory compatibility and sync P95
  2725.5ms above its unchanged 2s budget while Docker builds ran concurrently.
  Neither failure accepted. Factory fixed; unchanged full Unit rerun without
  parallel builds subsequently hit Docker daemon failure before completing; no
  full implementation Unit PASS is claimed locally. No threshold/test-timeout increase.
- During durable rate-limit edit an SQL string quoting compile error was caught
  and fixed; subsequent build/typecheck/targeted tests PASS. Failed attempts are
  not completion evidence.
- Migration initial attempt failed before tests on sandbox Docker Buildx activity
  file permission. Authorized unchanged-gate retry PASS, real clean/repeated v10,
  table presence/current API/checksum-invalid tests (1/1).
- Production Compose initial attempt similarly failed on Buildx permissions;
  authorized retry PASS, real API/web/workers/AI runtime smoke.
- Local Mobile unavailable (flutter ENOENT). Required hosted Mobile/Android on exact
  final head and merge SHA cannot be substituted with N/A.
- Subsequent final-targeted/full-Unit attempts stopped on infrastructure errors:
  Docker Desktop returned `Docker Desktop is unable to start`, including existing
  audit/events/files suites. Attempts to open the installed app returned
  kLSNoExecutableErr; failures are not relabelled PASS. Final build and static
  gates pass; final real Unit/replication verification is mandatory in hosted CI.
- Exact final full Unit counts and CI IDs are appended/recorded below and in CR
  closeout after observation. Exact-head findings and required checks must be clear
  before ordinary merge; exact merge-SHA push CI and completed CR closure remain
  mandatory before DONE.

| Gate | Final decision — closeout observed |
|---|---|
| G0 | PASS — live main, order/DAG/manifest, merged reports/closed CRs/exact dependency push runs |
| G1 | PASS — typecheck/architecture/lint capability, diff scope and required exact-head static jobs |
| G2 | PASS — additive v10, real clean/repeated/current/checksum-invalid migration/API |
| G3 | PASS — targeted 19/19, full Unit and all exact-head mandatory checks |
| G4 | PASS — real Local/Holding/fresh rebuild PG transactions/grants plus existing integration/runtime regressions |
| G5 | PASS — unchanged public HTTP/event/mobile clients; strict internal replication/1 and codegen drift PASS |
| G6 | PASS — WP016 transactional capture, commit-visible sequence, signed exact ACK/inbox dedup/retry/crash rollback |
| G7 | PASS — Local-only append/send, default deny READ/EXECUTE/REPLAY, tenant/site/installation/key negatives, actual restricted Cloud grants |
| G8 | PASS — WAN/timeout/lost ACK/SENDING resume retain Local; separate unchanged mobile sync/Mobile mandatory checks |
| G9 | PASS — immutable Local/Cloud content/journal, source provenance/corrections/tombstones, audited reasoned replay/rebuild |
| G10 | PASS — deterministic full protocol/fault/rebuild scenario above |
| G11 | PASS — limits/rate/bounded retry/security negatives and unchanged performance/offline checks |
| G12 | PASS — exact approved 19 paths/report, clear findings, required exact-head success, ordinary merge, exact merge-SHA push success, CR #58 completed |

Executable gate names follow DOC50 QUALITY_GATES.yaml; older DOC49 labels do not
omit any substantive requirement. Review checks runtime wiring, transaction/clock/
ACK ordering, history/hash/authority isolation, every schema assertion and full diff.
Protection requires strict CI quality gates and conversation resolution; no required
reviewer approval observed. No independent/self approval claimed, no admin/force/
auto-merge or check waiver. Final GitHub findings/protection are rechecked on exact
head. Full staged diff/path set must exactly equal CR #58 before commit.

## 6. Exact approved changed paths (19)

| Path | Function/scope basis in CR #58 |
|---|---|
| apps/api/src/modules/replication/replication.types.ts | Internal versioned projection/message/ACK/port/binding/errors |
| apps/api/src/modules/replication/replication.validation.ts | Strict bounded validation/hash/authentication |
| apps/api/src/modules/replication/replication.registry.ts | Trusted immutable identity/config/secret/HTTPS port |
| apps/api/src/modules/replication/replication.service.ts | Local append/clock/send/ACK/checkpoint/retry/DLQ/status/replay/rebuild |
| apps/api/src/modules/replication/replication.receiver.ts | Isolated holding dedup/history/derived read-model/cursor |
| apps/api/src/modules/replication/replication.consumer.ts | Allowlisted catalog org metadata capture on WP016 transaction |
| apps/api/src/modules/replication/replication.module.ts | Compiled bounded Local pool/worker composition |
| apps/api/src/modules/replication/README.md | Protocol/SoT/config/secrets/storage/recovery/limits |
| apps/api/src/modules/events/events.module.ts | Register capture alongside unchanged notification consumer |
| apps/api/src/app.module.ts | Actual compiled API registration |
| database/migrations/0010_cloud_replication.sql | Additive owned durable Local/Holding schema/immutability |
| apps/api/src/schema-version.service.ts | Expected schema v10 |
| apps/api/test/schema-version.test.mjs | Expected/current/ahead assertions |
| apps/api/test/identity.integration.test.mjs | Full-chain current version assertion only |
| database/test/migrate.test.mjs | Contiguous v10/storage/immutability/no foreign write assertions |
| database/test/database.integration.test.mjs | Clean/repeated/version/count/readiness/table presence assertions |
| apps/api/test/replication.unit.test.mjs | Contracts/auth/binding/Nest/default deny/owner types/authority |
| apps/api/test/replication.integration.test.mjs | Real PostgreSQL protocol/fault/rebuild/provenance/authority scenario |
| tests/evidence/WP49-024_COMPLETION_REPORT.md | Canonical authority/scope/G0–G12 and closeout evidence |

## 7. Unlock

DONE: all activation conditions at the top are observed and CR #58 is closed
completed. This report-only update implements no next WP. Physical WAN/TLS/cloud deployment, future
owner snapshots/analytics, independent object-byte transport/retention profiles
remain their specified deployment/owner contracts, not invented implementations.
