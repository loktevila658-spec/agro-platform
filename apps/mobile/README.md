# Mobile local persistence — WP49-019

Flutter/Dart application; Android 10+ is the initial native build target. Use
Flutter **3.47.8** / Dart **3.13.7**. Run from `apps/mobile`:

```sh
flutter pub get --enforce-lockfile
dart format --output=none --set-exit-if-changed lib test integration_test
flutter analyze --fatal-infos
flutter test --reporter expanded
flutter build apk --debug
flutter test integration_test -d emulator-5554 --reporter expanded
```

From the repository root, `node scripts/ci-gates.mjs mobile` runs dependency,
format, analyzer, complete mobile unit/widget suite and native Android build.
CI additionally runs the integration test on Android API 35 with real OS secure
storage, native encrypted SQLite, attachment encryption, reopen and shared wipe.
The CI aggregate requires the mobile job. No server test substitutes for it.
Set `--dart-define=API_BASE_URL=https://<local-authority>` for a deployed authority;
Android permits TLS traffic and disables plaintext HTTP. The localhost default
is a development placeholder.
Android release signing/distribution and the physical reference-device matrix
belong to release packaging/hardening, not this storage package.

## Authority and contracts

The database contains **provisional intent**, permission evidence, provisional
projections, server receipts and attachment upload state. It cannot confirm a
business fact or write to server databases. `LOCAL_PRIMARY` is the only supported
workspace authority; no cloud write failover exists.

`CommandDraft` is a local schema-v1 model, not a public HTTP DTO. `commandId`
(UUIDv7) is created once, is also its idempotency key, and survives every retry.
It is different from WP49-015's server-issued response `commandId`. Persisted
`expected_version` corresponds to DOC12 base_version; `observed_at` is UTC device
event time, distinct from the server's receipt time. `device_seq` is monotonic
within the workspace's persisted installation; device registration and any
cross-workspace server identity binding belong to WP49-020.

The existing generated Dart API has no sync or attachment routes. It remains
unchanged. WP49-020 owns push/pull serialization, server registration, opaque
cursors, delivery workers, signature/bootstrap wiring and conflict resolution.
WP49-017's server file adapter is unchanged: 1-based 5 MiB parts, SHA-256,
MIME/size/owner metadata, remote quarantine/AVAILABLE boundary. A remote ID is
stored separately from the stable local attachment ID.

No production offline grant verifier or domain command handler is invented.
Callers must supply `OfflineGrantVerifier` to authenticate the server signature
AND bind every grant field to its signed envelope. They must also supply an
`OfflineCommandValidator` for cached domain preconditions, resource/quantity
limits and offline risk policy. The default validator denies all commands.
The shell opens its encrypted workspace only after successful authority login,
and exposes counts without enabling any business command. Server acceptance
must still recheck permission, idempotency, state, audit and outbox.

## Durability and encryption

Drift Native runs SQLite3MultipleCiphers in a background isolate. The build hook
bundles the cipher library. The executor checks `PRAGMA cipher` even in release,
sets the random key before reading schema, then configures WAL, foreign keys,
busy timeout and FULL synchronous commits. Missing/wrong keys, corruption or
unsupported versions fail without deleting or resetting queued intent.

A distinct OS keystore/keychain key protects each tenant/user/workspace file.
Keys are never stored in the database, preferences, filenames, diagnostics or
logs. AES-256-GCM through `cryptography` encrypts each staged attachment part with
a fresh nonce and authenticated attachment/part/owner identity. HKDF derives the
file key with workspace separation. Staging copies are private and encrypted;
the source evidence remains caller-owned. Android backup/data extraction is
disabled. No refresh/session secret is added to local persistence.

Command, snapshot reference, device sequence, projection, attachment links and
provenance commit together. UI success is returned only after commit. Immutable
intent replay is deduplicated; different intent under the same ID fails. Claims
use persisted fenced leases and recover expired sends under the same ID. The
server result, state and audit append commit atomically. Conflict, rejection and
action-required intent are retained; there is no destructive command purge or
local conflict resolver. Four view states map to pending/synced/conflict/failed.

Attachment bytes are flushed before their metadata transaction. Process death
may leave encrypted **unreferenced** staging directories; these are not queue
entries and never generate uploads. No automatic orphan deletion is provided.
Part ACKs and upload session identity survive restart independently of commands.
Only exact hashes and remote `AVAILABLE` confirmation permit attachment ACK;
quarantined/rejected evidence cannot release a required-evidence command. Required
evidence conservatively blocks local delivery until confirmed. Network policy
supports Wi-Fi-only with explicit user-directed mobile-data override. Raw server
errors/secrets must not be passed to normalized error-code fields.

File deletion requires remote confirmation and a retention cutoff. Metadata and
command ownership references remain. Shared-device logout defaults to key
removal and workspace deletion; failure blocks the next sign-in. Personal logout
closes the encrypted workspace and requires a new online login to reopen it.
Cached offline re-authentication/bootstrap and complete conflict UX are not
introduced in WP49-019.

## Schema and evidence

`local_schema_version = 1` is the first persisted mobile schema (the baseline
Flutter shell had no database). `sync_schema_version = 1` is stored per intent;
command payload versions are explicit. Initial schema DDL and its version marker commit in one transaction; a forced
DDL failure rolls back every newly created table. Creating v1 and reopening the only
supported v1 snapshot are tested for data integrity. Newer schemas are rejected
without a downgrade or destructive recreation. Any future schema change must
supply a forward migration plus every supported snapshot-to-latest preservation
test, including unsynced commands, results, attachment parts and device sequence.

Tests cover no-key/wrong-key/unkeyed database reads, ciphertext/WAL checks,
AEAD tampering, tenant isolation, permission deny/expiry/scope, local validator
deny, transaction rollback, SQLite FULL, immutable identity, concurrent enqueue,
fenced retry, terminal receipts, restart, independent attachment resume and
retention. A 50,000-command fixture also stores 50,000 audit rows and 20,000
provisional projections (DOC12 capacity and DOC20 NFR-MOB-006). The Android
integration test records 100-enqueue P95 against NFR-MOB-003 (250 ms) and checks
shared wipe within 30 s. Emulator measurements are engineering evidence; physical
mid-range Android latency/battery/ANR certification remains a release gate.

Scope and pre-code impact evidence: [IMPACT_SCOPE.md](IMPACT_SCOPE.md).
G0–G12 and exact CI/merge evidence: `tests/evidence/WP49-019_COMPLETION_REPORT.md`.


## WP49-020 synchronization

`lib/sync.dart` exports `SyncEngine`, `PullStore`, `AttachmentWorker`, pinned
`AuthorityGrantVerifier` and `AuthorityHttpTransport`. Provision the workspace
with the authenticated identity device ID and its fixed LOCAL_PRIMARY URI.
The transport uses generated DTOs and canonical clients, refuses redirects and
never retries against an alternate/cloud host. Inject a token provider backed by
secure session storage; a revoked/expired session requires authentication, without
replacing queued command IDs. TLS is required by the existing Android profile.

The existing authentication shell now starts the data and media workers after workspace open, refreshes on foreground/resume, cancels them before logout/wipe, and uses 5-second pending / 30-second idle foreground scheduling. Provision the pinned public key using `SYNC_AUTHORITY_ED25519_PUBLIC_KEY` (base64 raw Ed25519 public key). Unknown network type is conservatively treated as mobile data: Wi-Fi-only files remain queued until a platform/owner network policy permits them.

Compose `SyncEngine(workspace, queue, transport, grantVerifier: verifier)` with
owning domain offline validators. Run on foreground/resume, connectivity restore
(`connectivityRestored: true`) and policy/debounce triggers. OS background timing
is best effort. Run `AttachmentWorker` separately so slow media cannot hold data
sync, except a command's explicitly required evidence. There are no enabled
business commands in this foundation: owner modules register application handlers,
current permission policies and projections in their own WPs. The shell does not
invent a workflow, authority fallback or conflict resolution UX.

Server `SyncRegistry` is deny-by-default. Handlers must validate current permission,
state and rules and write their own facts + audit + outbox through the supplied
transaction; versioned handlers provide an atomic lock/version guard and canonical
current snapshot. Sync writes only sync-owned protocol tables. Projection policies
recheck current read access; denied cached projections become PURGE. File policies
are separately registered by owner type and run inside the existing FilesService.
No foreign repository SQL is used by production sync code.

Bootstrap verifies Ed25519 grants with a public key pinned during trusted authority
provisioning; every field and device binding is signed. It never trusts a key from
an unsigned bootstrap response. Server requires `AGRO_DEPLOYMENT_MODE=LOCAL_PRIMARY`,
`SYNC_CURSOR_KEY` (stable secret >=32 bytes), and `SYNC_GRANT_PRIVATE_KEY` (Ed25519
PKCS8 PEM) when issuing offline grants. No signing key or valid policy means no
new offline authorization. O1 TTL is capped at 7 days; O2 TTL/resource limits belong
to tenant/owner policy and the local validator. Fourteen days without external WAN
includes Local Server LAN operation/renewal, not a fabricated extension of O1 TTL.

Push is <=50 commands / 1 MiB, in device order. Every immutable command retains ID,
idempotency key, base version, observed time, provenance and stable local attachment
references. Individual command transactions permit partial batches; lost responses
retry original IDs. Receipts/conflict evidence are retained (no pruning job).
Critical conflict is explicit, never last-write-wins; user action creates a new
command/correction under the owning domain. Request-level auth/schema/scope errors
never fabricate a terminal domain receipt. Backoff is 5/15/45/120/300/900/1800 seconds
with bounded jitter and Retry-After; reconnect clears retry waits.

Pull is <=500 changes / 2 MiB, signed opaque tenant/user/device/scope/schema cursor.
Feed counters are locked until commit so racing transactions cannot skip changes.
Each page and cursor commit in one encrypted SQLite transaction; ACK follows commit
and can replay after restart. Scope/expired/corrupt cursor resets clear canonical
cache only, retaining outbox, snapshots, provisional intent, evidence and upload ACKs.
The v1 -> v2 migration is additive and preserves all v1 intent. Current/unknown
future schemas use explicit upgrade rejection, never destructive downgrade.
The feed is not compacted by this WP: 90-day-old cursors reset and replay retained
history. Compaction requires an owner snapshot/bootstrap adapter before advancing
`retained_from`; without one, bootstrap fails closed rather than skipping history.

Attachments retain their local UUID regardless of remote UUID. Init/part/complete
use the existing file authority, hash/MIME/owner/evidence checks, quarantine and
AVAILABLE result. Network interruption retains session/5 MiB part ACKs; reopen
resumes unacknowledged parts. Required evidence holds the earlier device sequence;
optional delayed evidence remains associated after command confirmation. Local
bytes are removed only under the existing remote-ACK/retention policy.

Canonical OpenAPI produces TS, shared Dart and the identical in-package Dart copy
(`lib/generated/contracts.dart`). `contracts:check` detects drift in every copy;
no DTO is hand-maintained. Generated style ignores affect generator syntax only;
all application code uses Flutter lint/analyzer with fatal infos.

Validation: `flutter test` includes disconnect/restart/partial/replay/conflict/auth,
pull transaction crash/purge/reset, v1 snapshot upgrade, pinned grant verification,
delayed/resumed parts and deterministic 14-day fixtures. The long fixture provisions
50k UUIDv7 intents, 100k operational rows and 20k cached entities, reopens on day 14
and delivers every ID under the 30-minute lightweight convergence budget. It is a
protocol engineering profile, not a claim to implement future Task/Stock/etc. flows
or certify physical Android battery/ANR performance. The existing required Mobile
CI job runs all tests, debug APK and Android OS-keystore/cipher/pull recovery fixture.
No new CI path/job is needed: API `test/*.test.mjs` and all Flutter tests are already
mandatory in the required aggregate.
