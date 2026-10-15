# WP49 Completion Report

- WP ID: WP49-016
- Title: Transactional outbox/inbox
- Branch / commit: `codex/wp49-016-transactional-outbox-inbox`; implementation commit and PR head are recorded by the PR containing this report.
- Date: 2026-10-15
- Implementation baseline: live `main@526d8a90ac076eec54ace955c7b61f5dc3617bf2`.
- Governance: CR #35 is APPROVED and OPEN. The base path amendment is recorded in owner decision comments #6181418626 and #6181592433; the two migration assertion test paths are approved by owner comment #6181611998.
- Frozen manifest preserved verbatim: `allowed_paths_raw: /apps/api/modules/events /events`; `exit_criteria: domain events atomic with writes; replay safe.`

## 1. Prerequisites verified

- G0: PASS. WP49-003 and WP49-015 are merged and their Completion Reports are present at the implementation baseline. WP49-016's event/schema dependencies are compatible. WP49-015's organization command already commits its domain row, audit row, idempotency response and catalog-shaped outbox event in one PostgreSQL transaction. Identity session events are also written in their authoritative transaction. No producer payload or catalog change is required.
- Exact current baseline at implementation start: `526d8a90ac076eec54ace955c7b61f5dc3617bf2` (PR #36 report closeout). Dependency evidence and CI history are summarized in CR #35; this WP did not re-audit or alter those dependencies.

## 2. Scope implemented

- Added an API events runtime that discovers committed rows in the existing `org.outbox_event` and `identity.outbox_event` owner tables, claims durable deliveries with expiring leases and `SKIP LOCKED`, dispatches to registered in-process handlers, and retries failures with bounded exponential backoff.
- Added a durable inbox service. The consumer's business effect runs on the same PostgreSQL transaction/client as the `(consumer_name, event_id)` deduplication insert. A failed effect rolls back both; a repeated delivery is suppressed.
- Added additive `platform_events` delivery and inbox tables. Existing producer-owned outbox rows and schemas are not rewritten.
- Existing org and identity producer transactions remain unchanged. The org integration suite continues to verify rollback of the domain write when outbox insertion fails; the event integration test verifies handler rollback, retry, and replay suppression against real PostgreSQL.
- No broker, endpoint, event name, event payload field, event catalog entry, OpenAPI change, generated contract, or adjacent-WP behavior was added. The current catalog declares no consumers; the runtime exports a handler registration token but registers no new product consumer.

## 3. Changed files

Each path is in the exact additional allowlist approved by CR #35, alongside frozen `/events`:

- `apps/api/src/modules/events/events.module.ts`, `events.tokens.ts`, `events.types.ts`, `inbox.service.ts`, `outbox-dispatcher.service.ts` — compiled event runtime, module registration providers, durable dispatch/retry and transactional inbox deduplication; permitted by `apps/api/src/modules/events/**`.
- `apps/api/src/app.module.ts` — register the event runtime in the API; permitted by the corresponding CR path.
- `database/migrations/0005_transactional_outbox_inbox.sql` — add event-owned durable delivery leases/retry state and inbox deduplication storage; permitted by the migration path.
- `apps/api/src/schema-version.service.ts` — set the expected schema version to 5; permitted by the corresponding CR path.
- `apps/api/test/events.runtime.test.mjs`, `apps/api/test/events.integration.test.mjs` — test inbox commit/rollback, retry, and replay suppression with unit doubles and real PostgreSQL; permitted by `apps/api/test/events*.test.mjs`.
- `apps/api/test/schema-version.test.mjs` — align expected schema version and parser status fixtures with migration 0005; permitted by the separately approved path/comment #6181592433.
- `apps/api/test/audit.integration.test.mjs` — expect migration 5 from the full chain; permitted by owner decision #6181611998.
- `apps/api/test/identity.integration.test.mjs` — expect current schema version 5; permitted by owner decision #6181611998.
- `database/test/migrate.test.mjs` — assert contiguous migration 5 and the new event-owned tables/keys; permitted by the corresponding CR path.
- `database/test/database.integration.test.mjs` — verify clean/repeated migration 5, version 5, event tables and live schema-version response; permitted by the corresponding CR path.
- `tests/evidence/WP49-016_COMPLETION_REPORT.md` — this per-WP G0–G12 evidence; permitted by the corresponding CR path.

No manifest or exit criterion was changed. A full changed-path comparison against CR #35 found no unapproved file.

## 4. Database / contracts

- Migration: additive `0005_transactional_outbox_inbox.sql`; creates only `platform_events.outbox_delivery` and `platform_events.inbox_event`. Existing `org` and `identity` producer tables are read by the dispatcher and are not modified.
- Schema version: 5. Clean migration, repeated migration, metadata version, and API schema-version response are checked by the database integration gate and the two approved API regression tests.
- OpenAPI, generated contracts, event schema/catalog, permission catalog and workflow contracts: unchanged. Existing event envelope/payload fields are preserved, including no `commandId` addition.

## 5. Tests and quality gates

Local gate set ran against this implementation before PR creation:

- Targeted: API build PASS; event runtime and schema-version tests PASS (7/7); migration unit tests PASS (5/5); real PostgreSQL event retry/inbox/replay integration PASS (1/1).
- `node scripts/ci-gates.mjs lint`: PASS / N/A — repository has no configured lint tool.
- `node scripts/ci-gates.mjs typecheck`: PASS — workspace typecheck and architecture dependency guard (11/11).
- `node scripts/ci-gates.mjs unit`: PASS — workspace build, package tests (API 35/35), bootstrap regressions (14/14), migration unit tests (5/5), and bootstrap validation.
- `node scripts/ci-gates.mjs contract`: PASS — canonical OpenAPI/event validation and generated-contract drift check.
- `node scripts/ci-gates.mjs migration`: PASS — clean/repeated PostgreSQL/PostGIS migrations, schema version 5, new table presence and live schema-version endpoint (1/1).
- `node scripts/ci-gates.mjs runtime`: PASS — Compose configuration and runtime smoke.
- `git diff --check`: PASS.

Gate decisions:

- G0: PASS — direct dependencies are merged and compatible at the verified baseline.
- G1: PASS — workspace typecheck/build and architecture guard pass; lint is N/A because no lint tool is configured.
- G2: PASS — additive migration is contiguous, forward-only, clean/repeatable, and exposes schema version 5.
- G3: PASS — API unit suite and focused event retry/inbox tests pass.
- G4: PASS — event retry/replay and database migration/API tests pass against real PostgreSQL/PostGIS.
- G5: PASS — no public API or contract changed; canonical validation and generated drift gates pass.
- G6: PASS — existing event envelopes are preserved; durable outbox retry, transactional inbox deduplication, rollback and replay are tested.
- G7: N/A for new behavior — no endpoint or permission-bearing command was added; existing deny-by-default and API authorization tests pass in the full suite.
- G8: N/A — this WP adds no offline command queue or synchronization behavior; retry/replay safety is covered under G3/G4/G6.
- G9: PASS — authoritative producers and their existing audit/outbox transaction boundaries are unchanged; existing PostgreSQL producer tests and the new consumer transaction test pass.
- G10: PASS — deterministic PostgreSQL event failure/retry/replay scenario passes with one committed consumer effect.
- G11: PASS for applicable checks — no new network surface or external broker was added; workspace architecture/security regression checks pass. No separate performance or chaos scenario is defined for this WP.
- G12: PENDING — report and implementation PR are prepared; PR review/merge and successful post-merge CI remain outstanding. This report does not mark the WP DONE.

## 6. Deterministic demo / evidence

- Scenario: insert one catalog-shaped org outbox fixture, fail its consumer after a tentative effect, retry, then replay the same event.
- Seed / clock: isolated ephemeral PostgreSQL/PostGIS database; event UUIDs are generated per test; retry time is advanced explicitly in the fixture.
- Result: first handler effect and inbox insert roll back together; retry commits one effect; replay is deduplicated and leaves the effect count at one.
- Artifact paths: `apps/api/test/events.integration.test.mjs`, `apps/api/test/events.runtime.test.mjs`, `database/test/database.integration.test.mjs`.

## 7. Limitations / follow-ups

- No event consumers are defined in the current frozen catalog. The runtime therefore registers no product handler and does not invent downstream behavior; consumers can register through the exported event-handler token when their owning WP defines them.
- No GitHub PR CI or post-merge evidence exists yet at report creation. Exact PR/head CI evidence must be added to the final review record. Merge requires a separate owner decision; WP49-016 remains not DONE until merge and successful post-merge CI.

## 8. Unlock decision

- **PENDING / NOT DONE** — implementation is prepared for review. No downstream WP is declared newly unlocked before merge and successful post-merge CI.
