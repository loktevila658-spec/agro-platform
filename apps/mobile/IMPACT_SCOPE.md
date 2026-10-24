WP49-019 — approved Scope CR #47 (full pre-code impact pass, 2026-10-24)

Issue: https://github.com/loktevila658-spec/agro-platform/issues/47
Owner approval recorded before implementation: https://github.com/loktevila658-spec/agro-platform/issues/47#issuecomment-6382939058

Baseline: live main c2766541568e06da572573601b3cacf5ccec02a6. WP49-018 report is merged; exact post-merge run 39984252259 SUCCESS. Next package per IMPLEMENTATION_ORDER is WP49-019. G0: WP49-004 PR #5 merged f8001bfd3d1122e5752d6c6e0b63e69694aaa4df (completed implementation/validation evidence in PR and owner closeout comment); WP49-012 PR #21 merged 073cbc43efd5bd176c9f87ad75a969c8ff21e2df, CR #20 closeout and exact post-merge run 38506340208 SUCCESS; WP49-015 Completion Report merged, implementation #32 merge 92a98de5aa0078941e2842a3bcf3ba41f0f07f34, exact post-merge run 38654141205 SUCCESS. Manifest status is not evidence.

Frozen, unchanged:
- allowed_paths_raw: /apps/mobile
- exit_criteria: local DB adapter, command queue, attachment queue.

Authority: DOC50 > DOC48 > DOC47, DOC49 execution graph; DOC12 sections 4–7, 11, 16, 18, 25–28, 31–33; DOC05 local-first status; DOC20 NFR-MOB-003/006/008/013/014. REV47-015/019/025/031. No new requirement, release, dependency or business workflow.

Full impact/file plan within frozen path:
- apps/mobile/pubspec.yaml and pubspec.lock: Drift Native + SQLite3MultipleCiphers hook, cryptography AES-256-GCM, SHA-256, secure storage, app-private directory, UUIDv7; reproducible Flutter toolchain.
- apps/mobile/lib/persistence/{database,models,workspace,command_queue,attachment_queue}.dart: encrypted per-workspace DB, fail-closed key/cipher handling, WAL/FK/busy timeout; schema version 1 with forward-only migration policy; device identity/sequence, validated offline permission snapshot seam; durable immutable provisional command identity/idempotency/expected_version/observed time/provenance; transactional enqueue + provisional projection/evidence; lease/recovery/retry state and persisted results, pending/synced/conflict/failed view; independent encrypted attachment bytes and metadata, owner/command references, hashes, MIME/size, 5 MiB resumable parts/session, remote ACK retention gate.
- apps/mobile/lib/main.dart: integrate persistence lifetime/status with Flutter shell without invented domain commands or conflict UX; no refresh secret persisted outside secure storage.
- apps/mobile/lib/persistence.dart (exports), apps/mobile/lib/widgets/queue_status.dart (if separated): reviewable integration API and simple status.
- apps/mobile/test/{persistence,attachment_queue,workspace,queue_status}_test.dart and apps/mobile/integration_test/persistence_test.dart: real encrypted SQLite reopen, no-key/wrong-key/plaintext denial, rollback/full storage errors, exact immutable replay and ID mismatch, concurrent enqueue/claims, lease recovery, states/results persistence, migration/data integrity, isolation and shared wipe, snapshot deny/expiry/scope, reference/attachment hash tamper + resume, deterministic offline demo, capacity/latency evidence.
- apps/mobile/android/**, apps/mobile/.metadata, apps/mobile/.gitignore: missing Android host scaffolding required for actual mobile build; Android 10+ and backups disabled, native-library packaging.
- apps/mobile/README.md and apps/mobile/tool/** if required: schema/crypto lifecycle, contract ownership, exact commands and NFR evidence.

Generated/API impact: inspected openapi, packages/contracts/generated/dart/contracts.dart, generator/drift tests and WP49-015/017 reports. Existing org client uses Idempotency-Key and server-issued commandId responses; client local_command_id remains distinct. No generated DTO currently describes sync push/pull or attachments. Keep local persisted model versioned, expose no invented HTTP serializer; WP49-020 owns mapping/endpoints/cursor/conflict resolution. WP49-017 uses 1-based 5 MiB parts, hashes, MIME/size/owner refs; server paths remain unchanged.

Required exact ADDITIONAL allowlist:
1. .github/workflows/ci-quality-gates.yml — install pinned Flutter/Java tooling, execute real mobile analyze/test/build on PR and main, include mobile in fail-closed aggregate. Current CI runs only pnpm/server checks.
2. scripts/ci-gates.mjs — add mobile command gate invoking Flutter format/analyze/test and Android build (not server substitute).
3. tests/ci-quality-gates.test.mjs — update exact gate-set/aggregate assertions and add mobile command/aggregation assertions. These hardcode the six pre-mobile jobs; update together, do not weaken tests.
4. tests/evidence/WP49-019_COMPLETION_REPORT.md — required G0–G12, changed-path, review/head, implementation and post-merge closeout evidence.

Other checked assertions need no changes: tests/bootstrap.test.mjs only requires main.dart; tests/validate-bootstrap.mjs Flutter declaration is preserved; architecture guard accepts application-local Dart imports; runtime smoke covers API/web only; contract tests/checksum manifest remain untouched. No offline/sync-contract.yaml, canonical OpenAPI, event, permission registry, server file/sync paths, root manifests or other WP edits authorized.

Approval: project owner explicitly authorized confident necessary actions in the control chat on 2026-10-24 and directed recording approval via established CR process. Record an owner-attributed approval comment for this exact scope before code. This is permission to implement this allowlist, not a waiver of gates. CR remains open until ordinary merge, exact successful post-merge CI and final evidence; then close as completed.
