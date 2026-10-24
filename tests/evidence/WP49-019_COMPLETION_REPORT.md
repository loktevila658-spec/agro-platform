# WP49 Completion Report

- WP ID: WP49-019 — Mobile local persistence
- Implementation baseline: live `main@c2766541568e06da572573601b3cacf5ccec02a6`, verified 2026-10-24 with fetch and ls-remote.
- Branch: `codex/wp49-019-mobile-persistence` in clean worktree; original dirty checkout untouched.
- Scope CR: [#47](https://github.com/loktevila658-spec/agro-platform/issues/47), [owner-authorized approval](https://github.com/loktevila658-spec/agro-platform/issues/47#issuecomment-6382939058), recorded before implementation.
- Frozen values, unchanged verbatim:
  - `allowed_paths_raw: /apps/mobile`
  - `exit_criteria: local DB adapter, command queue, attachment queue.`
- Implementation PR: [#48](https://github.com/loktevila658-spec/agro-platform/pull/48), final head `174d144f956301267e97783683b7d06870fbce9d`, ordinary merge `803d7e0e59ea5ae481f6b71b1499a2ad95a8cb0d` (two parents verified).
- Final status: **DONE takes effect only after this evidence closeout is merged, its exact post-merge CI succeeds, and CR #47 is closed**. The final report-merge SHA/run and activation are recorded in the CR closeout comment to avoid a self-referential commit hash. Before those conditions, status remains IN PROGRESS.

## 1. Prerequisites and authority

G0 PASS. IMPLEMENTATION_ORDER moves from completed W1/WP49-018 to W2/WP49-019. Direct dependencies are complete by merged implementation/closeout evidence, not manifest status:

- WP49-004: PR [#5](https://github.com/loktevila658-spec/agro-platform/pull/5), merge `f8001bfd3d1122e5752d6c6e0b63e69694aaa4df`; PR validation records 37 distinct passing tests, deterministic TypeScript/Dart generation and no drift, real PostgreSQL/PostGIS and Compose smoke. Owner issue #5 closeout confirms completion. This preceded WP49-005 CI; no historical Actions run exists for this merge. Current canonical validation/generated drift are separately rechecked for this WP.
- WP49-012: PR [#21](https://github.com/loktevila658-spec/agro-platform/pull/21), merge `073cbc43efd5bd176c9f87ad75a969c8ff21e2df`; closed CR #20 records completion and exact post-merge [run 38506340208](https://github.com/loktevila658-spec/agro-platform/actions/runs/38506340208) SUCCESS, independently verified live.
- WP49-015: merged Completion Report at baseline; implementation #32 merge `92a98de5aa0078941e2842a3bcf3ba41f0f07f34`, exact post-merge [run 38654141205](https://github.com/loktevila658-spec/agro-platform/actions/runs/38654141205) SUCCESS, report closeout #33/#34, closed CR #31.
- Prior WP49-018 report is DONE at baseline; implementation #45 merge `98260f7babcf2e40e506518b291b68cec7524770` and report #46 merge equal to baseline. Exact report post-merge [run 39984252259](https://github.com/loktevila658-spec/agro-platform/actions/runs/39984252259) SUCCESS.

Read/applied DOC50 execution baseline, DOC48 frozen scope, DOC47 REV47-015/019/025/031, DOC49 graph/manifest; DOC12 local storage, snapshots, provisional transactions, idempotency, attachments, security, recovery/migration and tests; DOC05 offline status/local-first UX; DOC20 mobile capacity, latency, offline durability, resumable files and shared wipe. DOC12's CLOUD_PRIMARY option does not override frozen LOCAL_PRIMARY invariants.

## 2. Full pre-code impact and scope

The complete pre-code file/test inventory and contract reconciliation is preserved in `apps/mobile/IMPACT_SCOPE.md` and CR #47. Baseline mobile contained only `main.dart` and `pubspec.yaml`: no DB, migration, native host, test or mobile CI command. Existing generated Dart contracts contain authentication/org contracts but no sync/file HTTP surface; no generated/API/event/permission change is needed or made. WP49-017 server files code is read-only input for hashes, MIME/size, 1-based 5 MiB parts and quarantine/AVAILABLE semantics.

The sole additional allowlist, approved before code, is `.github/workflows/ci-quality-gates.yml`, `scripts/ci-gates.mjs`, `tests/ci-quality-gates.test.mjs`, and this report. Existing CI exact gate/aggregate assertions must be updated with the new mandatory mobile job; they are strengthened, not removed. No frozen manifest, dependency, release or exit criterion is edited.

## 3. Implemented behavior

- Flutter/Dart Drift Native encrypted per-user/tenant/workspace storage, fail-closed cipher/key handling, OS secure keystore, WAL/FK/busy timeout/FULL durability, background DB isolate, first versioned local schema.
- UUIDv7 provisional commands with immutable idempotency key, expected version, observed UTC event time, payload version, monotonic workspace-installation sequence and provenance. Command, permission snapshot reference, projection, evidence references and audit commit atomically before local success.
- Deny-by-default offline authorization/precondition ports; server-signed grant binding, scoped resource/limit policy and cached domain validations must be provided by owning adapters. No business command is enabled in the shell. Server revalidation remains mandatory.
- Fenced persistent leases, same-ID crash retry, immutable replay protection, terminal receipt/state/audit transaction and retained conflict/rejected/action-required intent. UI exposes pending/synced/conflict/failed counts without conflict-resolution UX.
- Independent encrypted attachment queue: UUIDv7 identity, owner/evidence type, SHA-256, allowlisted MIME/size validation, fresh-nonce AES-256-GCM/HKDF, 5 MiB checksum parts, persistent upload session/ACKs, Wi-Fi policy/explicit override. Exact remote AVAILABLE + hash + all parts ACK gates final confirmation and required-evidence dispatch; byte deletion requires ACK + retention cutoff and retains metadata/links.
- Shared logout key removal/deletion blocks subsequent login on cleanup failure. Personal logout closes encrypted state; re-authentication is required. Android backup is disabled.
- No server sync endpoint, cursor/pull engine, public sync DTO, conflict resolver or new domain workflow is introduced. WP49-020 owns protocol/bootstrap/worker wiring. Operational authority remains Local Server.

## 4. Changed paths and schema/compatibility

All mobile implementation, native Android host, lockfile, tests, integration test and documentation are under frozen `apps/mobile/**`. The four additional paths above implement mobile CI and evidence only. Exact changed files (all frozen or CR-approved):

```text
.github/workflows/ci-quality-gates.yml
apps/mobile/.gitignore
apps/mobile/.metadata
apps/mobile/IMPACT_SCOPE.md
apps/mobile/README.md
apps/mobile/analysis_options.yaml
apps/mobile/android/.gitignore
apps/mobile/android/app/build.gradle.kts
apps/mobile/android/app/src/debug/AndroidManifest.xml
apps/mobile/android/app/src/main/AndroidManifest.xml
apps/mobile/android/app/src/main/kotlin/ru/agroplatform/agroplatform_mobile/MainActivity.kt
apps/mobile/android/app/src/main/res/drawable-v21/launch_background.xml
apps/mobile/android/app/src/main/res/drawable/launch_background.xml
apps/mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher.png
apps/mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher.png
apps/mobile/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
apps/mobile/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
apps/mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
apps/mobile/android/app/src/main/res/values-night/styles.xml
apps/mobile/android/app/src/main/res/values/styles.xml
apps/mobile/android/app/src/main/res/xml/data_extraction_rules.xml
apps/mobile/android/app/src/profile/AndroidManifest.xml
apps/mobile/android/build.gradle.kts
apps/mobile/android/gradle.properties
apps/mobile/android/gradle/wrapper/gradle-wrapper.properties
apps/mobile/android/settings.gradle.kts
apps/mobile/integration_test/persistence_test.dart
apps/mobile/lib/main.dart
apps/mobile/lib/persistence.dart
apps/mobile/lib/persistence/attachment_queue.dart
apps/mobile/lib/persistence/command_queue.dart
apps/mobile/lib/persistence/database.dart
apps/mobile/lib/persistence/models.dart
apps/mobile/lib/persistence/workspace.dart
apps/mobile/lib/widgets/queue_status.dart
apps/mobile/pubspec.lock
apps/mobile/pubspec.yaml
apps/mobile/test/attachment_queue_test.dart
apps/mobile/test/capacity_test.dart
apps/mobile/test/command_queue_test.dart
apps/mobile/test/persistence_test.dart
apps/mobile/test/queue_status_test.dart
apps/mobile/test/support.dart
apps/mobile/test/workspace_test.dart
scripts/ci-gates.mjs
tests/ci-quality-gates.test.mjs
tests/evidence/WP49-019_COMPLETION_REPORT.md
```

Local schema v1 is the first persisted mobile schema; there is no prior mobile database to migrate. Schema DDL and the version marker commit atomically. A regression first reproduced partial-table creation after a forced DDL error (RED); wrapping creation/version in one Drift transaction makes it GREEN without deleting pre-existing data. Supported v1 reopen preserves unsynced commands, identity/sequence and all queue state. Unsupported newer schemas fail without destructive downgrade/recreation. Future local schema upgrades require forward migration and snapshot/data-integrity tests. Public OpenAPI, generated Dart/TypeScript, server migrations and event contracts remain unchanged.

## 5. Tests and gates

Local confirmed results (Flutter 3.47.8 / Dart 3.13.7):

- Complete Flutter unit/widget suite: PASS, 21/21, real native encrypted SQLite (including 50,000-command / 100,000-operational-row / 20,000-projection capacity fixture).
- Flutter analyzer with flutter_lints and fatal infos: PASS, no issues. Formatter: PASS. Enforced pub lockfile: PASS.
- Workspace build and typecheck: PASS; architecture guard 11/11. CI-gate regression 6/6; repository bootstrap/contract regressions PASS; generated contracts tests 19/19. Canonical validation/generated drift and bootstrap structural validation: PASS.
- `git diff --check`: PASS.
- Local full server unit gate passed its build prerequisite and non-DB packages, then stalled in DB-backed tests due to the host Docker environment; the task-owned stalled process tree was stopped. This is not a passing integration gate. Initial pnpm dependency downloads timed out; reusing existing dependency artifacts in this clean worktree and disabling pnpm's automatic dependency reinstallation allowed build/typecheck/contract checks to complete.
- No Android SDK is installed on the local Mac. The required hosted mobile job performs the full native APK build and Android emulator integration test; neither is substituted by server tests. Exact PR-head results: native APK build PASS; Android integration 1/1 PASS; enqueue P95 **7 ms** (100 measurements, limit 250 ms); shared wipe completed within the asserted 30 s. This is an emulator engineering measurement, not physical-device certification.
- Drift's debug warning about multiple database instances is expected in tenant-isolation and concurrent-connection tests: they use distinct NativeDatabase executors. Writer serialization/fencing and persisted sequence checks pass.

Final applicable gate decisions (evidence becomes active at the closeout conditions above):

| Gate | Decision and evidence |
|---|---|
| G0 | PASS — dependencies, authority/order, compatibility, baseline and WP49-018 closeout independently verified live. |
| G1 | PASS — Flutter format/analyze with fatal infos, workspace typecheck/build, architecture rules; hosted lint capability and all static jobs SUCCESS. Repository JS lint capability is N/A because none is configured; Flutter lint is enforced. |
| G2 | PASS — atomic schema/v1 marker creation, DDL fault rollback RED->GREEN, v1 reopen/pending sequence integrity and future-version rejection; hosted server migration regression SUCCESS. |
| G3 | PASS — complete mobile suite 21/21 plus contract and repository regressions; hosted Unit job SUCCESS. |
| G4 | PASS — native Android build and OS-keystore/encrypted-SQLite integration 1/1; existing real server integration/migration/runtime jobs SUCCESS. |
| G5 | PASS — canonical/generated contracts validate without drift; no public contract changed. |
| G6 | PASS — immutable command ID/key and idempotent receipt replay; existing server event/outbox regressions SUCCESS. No new event contract. |
| G7 | PASS — default-deny verifier/validator, tenant/scope/expiry/resource/O3 negatives; existing server permission regressions SUCCESS. Sync server revalidation remains WP49-020. |
| G8 | PASS — atomic offline save/reopen, concurrent writers, fenced recovery/retry, retained conflict/rejection/action-required states, independent file resume. Server push/pull/cursor flow remains WP49-020. |
| G9 | PASS — immutable observed time/intent, snapshot and device identity, audit and immutable server receipt; no authoritative operational business write. |
| G10 | PASS — deterministic storage/widget fixtures plus Android reopen/file/wipe fixture. |
| G11 | PASS — actual cipher/key/plaintext/WAL tests, isolation, AEAD tamper, MIME/size/retention, shared wipe, capacity; Android enqueue P95 7 ms and wipe <30 s. Physical-device battery/ANR certification remains a release gate. |
| G12 | PASS at final activation — full allowlist (47 paths) verified, local critical review finding fixed, no open GitHub review threads; no independent reviewer approval is claimed or required by branch protection. Exact implementation PR-head and post-merge CI SUCCESS; final report closeout/CR evidence completes activation. |

Exact checks:

- Pre-merge [run 40087741399](https://github.com/loktevila658-spec/agro-platform/actions/runs/40087741399): SUCCESS on `174d144f956301267e97783683b7d06870fbce9d`; all eight jobs including Mobile and aggregate `CI quality gates` SUCCESS.
- Implementation post-merge [run 40088257705](https://github.com/loktevila658-spec/agro-platform/actions/runs/40088257705): **SUCCESS**, exact head `803d7e0e59ea5ae481f6b71b1499a2ad95a8cb0d`. All eight jobs, including Mobile and aggregate `CI quality gates`, completed SUCCESS.
- Report closeout exact head, merge and CI: final canonical record in [CR #47](https://github.com/loktevila658-spec/agro-platform/issues/47), recorded only after SUCCESS; no auto-merge, force/admin bypass or gate waiver.

## 6. Deterministic demo

Fixture owner `Fixture:entity`, fixed observed UTC time, expected version 7, fixture-only verified grant and local validator. Enqueue -> commit -> close/reopen -> same command lease recovery -> server receipt fixture with distinct received time. Independent file fixture resumes after three 5 MiB part ACKs at part four, validates full SHA and AVAILABLE before retention. These are storage fixtures, not invented product use cases or server protocol acceptance claims.

## 7. Limits and handoff

- WP49-020 supplies real authority-signed bootstrap grants, domain command adapters, server result/upload adapters, registered-device binding, sync endpoints/cursor and conflict-resolution flow. Default local validator denies without an explicit adapter.
- Device sequence is scoped to the persisted workspace installation; the auth device identity can be bound on workspace open. No cross-tenant command stream is invented.
- No automatic encrypted-orphan cleanup is provided; crash before metadata commit may leave unreferenced encrypted staging bytes. They never become queue entries or generate uploads.
- Engineering emulator capacity/latency evidence does not certify physical-device battery/ANR/performance release targets.
- No release signing/distribution or iOS support profile is claimed by this Android foundation package.

## 8. Review, merge and closeout

Implementation PR [#48](https://github.com/loktevila658-spec/agro-platform/pull/48) was merged with the exact-head guard after all required checks succeeded and GitHub reported CLEAN/MERGEABLE. Live main still matched the original baseline before merge. The ordinary merge has parents `c2766541568e06da572573601b3cacf5ccec02a6` and `174d144f956301267e97783683b7d06870fbce9d`.

Local critical review found non-atomic initial schema creation. The failing real DDL regression showed leftover tables; the transaction/version-marker correction made the complete 21-test suite GREEN. GitHub review submissions and threads were checked again at the final code head: empty, with no outstanding finding. Repository protection requires `CI quality gates` and conversation resolution; independent reviewer approval is not required, and no self-approval or bypass was submitted.

Only the completion-report path is changed by the evidence closeout. Once its exact pre-/post-merge checks pass and the approved CR is closed with final SHA/run evidence, the status at the top becomes **DONE**. WP49-020 can consume this persistence foundation; no adjacent WP or server sync/file path was implemented.
