# Scope CR — WP49-020 Sync protocol & conflict model

Baseline verified live: main@77656151eceb1e54536acdc3b6dabd1ff0b2389f. G0 PASS: WP49-015/016/019 merged reports and closed CRs #31/#35/#47; exact CI runs 38654141205 / 38664024824 / 40089547315 SUCCESS. Implementation order + build graph identify WP49-020 next. No manifest status used.

Frozen, preserved verbatim:
```yaml
depends_on:
- WP49-015
- WP49-016
- WP49-019
allowed_paths_raw: /apps/api/modules/sync /apps/mobile
exit_criteria: push/pull, cursor, conflicts, retries, 14-day offline tests.
```

## Complete pre-code impact and path authorization

Literal `/apps/api/modules/sync` is NOT reinterpreted: compiler rootDir=src/include=src/**/*.ts requires explicit additional paths. No implementation has begun. Existing mobile queues retain IDs/provenance/fenced leases; DB v1 lacks cursor/cache. Server schema v6, identity session auth, files application service (default deny), command-boundary version guard and outbox/inbox are reused. No registered offline domain command currently exists; no new business flow is enabled here. Owning application adapters must authorize/validate and use the supplied transaction, audit and outbox; test-only adapters prove observable guarantees. No direct foreign repository access, event catalog field, broker, cloud authority or UX redesign.

Complete intended inventory (directories allow only WP49-020 code named below):

Frozen apps/mobile:
- lib/sync/{protocol.dart,sync_engine.dart,pull_store.dart,attachment_worker.dart,grant_verifier.dart,http_transport.dart}, lib/sync.dart: generated-client transport, push/pull/ack/bootstrap, retry/backoff, separate resumable media worker, Ed25519 grant verification, transactionally persisted cursors/projections/purge and reset preserving intent.
- lib/persistence/database.dart: forward v1->v2 migration for sync cache/cursor; preserves queue/attachments/grants.
- lib/persistence/command_queue.dart: retain stable intent with evidence references in wire envelope; persist conflict outcome; reset connectivity retry and projection state.
- lib/persistence/workspace.dart: workspace installation binding/bootstrap composition if required.
- test/{sync_engine_test.dart,sync_offline_test.dart,sync_migration_test.dart,sync_attachment_test.dart,sync_grant_test.dart}, integration_test/persistence_test.dart: disconnect/reconnect/partial batches/replay/conflict/auth/cursor reset/crash/delayed media, migration snapshots, native end-to-end smoke and 14-day deterministic offline/capacity fixtures.
- README.md, SYNC_IMPACT_SCOPE.md: protocol/permission mapping, adapter constraints, NFR fixtures/measurement profile, scope inventory and runbook. Existing persistence tests may require only version-2 expectations: test/persistence_test.dart, test/workspace_test.dart.

Additional paths requested as ONE minimum complete authorization:
- apps/api/src/modules/sync/**: sync.types.ts, sync.registry.ts, sync.service.ts, sync.controller.ts, sync.module.ts, sync.tokens.ts, sync.crypto.ts, sync.files.ts; compiled runtime, owner application ports, server auth/current permissions/rules, durable receipts/device/cursor/conflict, bounded transaction feed, opaque signed cursor and bootstrap grants, upload HTTP adapter.
- apps/api/src/app.module.ts: register SyncModule.
- apps/api/src/modules/identity/identity.module.ts: export existing IdentityService for session auth; no auth semantics changes.
- apps/api/src/modules/files/files.module.ts: expose existing FilesService with configurable authorization port for owner-validated sync upload. Keep default deny and existing tests/consumers compatible; no files table writes from sync.
- apps/api/src/schema-version.service.ts: expected schema 7.
- apps/api/src/main.ts: sync push body parser limit 1 MiB and attachment part limit 5 MiB with bounded stream handling if needed.
- database/migrations/0007_sync_protocol.sql: additive sync-owned durable device/scope/receipt/change/cursor ack/conflict/attachment-reference state; per-tenant locked feed counter avoids committed-sequence gaps. No foreign authoritative table write.
- apps/api/test/sync*.test.mjs: protocol/HTTP/unit and real PostgreSQL transaction/retry/restart/tenant isolation/permission/version/cursor/media integration; deterministic handlers only in tests.
- apps/api/test/schema-version.test.mjs, apps/api/test/identity.integration.test.mjs: existing exact version fixtures 6->7 (including ahead fixture 7->8).
- database/test/migrate.test.mjs, database/test/database.integration.test.mjs: contiguous v7/schema ownership, clean/repeat migrations and API schema assertions.
- openapi/openapi.yaml: additive versioned sync register/bootstrap/push/pull/ack/health and attachment init/part/complete/reference operations, explicit auth/permission mapping, constraints/errors; no business endpoint.
- packages/contracts/scripts/lib/contracts.mjs: support JSON object properties in canonical sync envelopes, recursive typed client serialization where required by those DTOs; preserve existing contract generation.
- packages/contracts/src/generated/contracts.ts, packages/contracts/generated/dart/contracts.dart, packages/contracts/generated/manifest.json: regenerate only from canonical OpenAPI, consumed by mobile transport.
- packages/contracts/test/contracts.test.mjs: sync DTO/client round-trip and runtime shape/backward-compatibility regression.
- scripts/ci-gates.mjs, .github/workflows/ci-quality-gates.yml, tests/ci-quality-gates.test.mjs: existing API wildcard/mobile suite already cover new tests; only add/change invocation if needed for mandatory sync offline/native integration coverage. Required aggregate must remain mandatory and assertions strengthen.
- tests/evidence/WP49-020_COMPLETION_REPORT.md: full G0–G12 evidence, exact head/merge CI and final activation via CR closeout.

Read-only assessed: existing org/identity/events/audit/files implementations and tests, event catalog, permission catalog, generated clients, API compiler/runtime, mobile queues/schema/security/native test, CI gates. Existing events/files/audit tests assert migration 6 exists (still true), so no edits needed; database and identity tests assert current version and must change. No dependency/lockfile change needed. No module policy rewrite: platform sync uses existing public services and transaction ports; no cross-app import. CI already invokes test/*.test.mjs and all Flutter tests plus Android integration.

Authority: DOC12 OFF-01..10, sections 8–18/28–34/36; DOC20 NFR-MOB-006/007/008/012/013 and NFR-SYNC-001..012; DOC21 offline/replay/permission/migration acceptance; DOC47 REV47-015 and unified command conventions; DOC48 freeze; DOC49 exact WP; DOC50 G0–G12. DOC12 50/500 batch maxima remain conservative limits; DOC20 100-command/1000-change NFR benchmark runs consecutive bounded pages. Fourteen days without WAN is not permission to extend O1's 7-day grant: test LAN renewal plus device-only provisioned TTL cases with expired-grant negatives. No acceptance weakening, forced merge, auto-merge or bypass. Forced schema upgrade/reset is explicit. Required tests precede implementation.

Owner explicitly authorized confident necessary actions and recording approval by established process in the control chat on 2026-10-24. Approval is a delegated owner scope decision, not an independent reviewer approval, and does not waive gates. Keep CR open until implementation/report merge and exact post-merge CI success.

## Consolidated inventory correction before editing root contract assertion

The pre-code scan missed `tests/contracts.test.mjs`: like the already-approved package contract test, it asserts the COMPLETE canonical operation list and is necessarily affected by the additive Sync API. Add this one exact path solely to expand the expected operation list and assert the new sync inputs; retain every existing operation/input assertion. No acceptance weakening. A second repository-wide scan of all API/schema/generated/endpoint assertions confirms no other missing path. This is a recorded preflight defect, not a claim that the initial inventory was complete. The same single Scope CR is amended before that file is edited; no second WP or unrelated scope is introduced.

The generated Dart client must also be emitted into `apps/mobile/lib/generated/contracts.dart` (inside frozen apps/mobile): Dart package imports cannot escape lib. This is a canonical deterministic codegen artifact, with drift checked by existing contract gate, not a manually copied client. Canonical external TS/Dart outputs remain generated and compatible. No new package dependency/lockfile is introduced.

Approval: #50 comments 6383718454 and 6383870588.

Final frozen-path wiring: lib/main.dart starts/cancels existing sync/media workers with authentication and app lifecycle; no UX redesign, new flow or extra-scope path.
