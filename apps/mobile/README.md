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
