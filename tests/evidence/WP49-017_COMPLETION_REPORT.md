# WP49 Completion Report

- WP ID: WP49-017
- Title: Files/attachments service
- Implementation PR: [#41](https://github.com/loktevila658-spec/agro-platform/pull/41), head `d6f63c7de67794d55b10f78d6bc83e5b6d249ed2`, merged by ordinary merge commit `99041cf69721040a9749b9d7cfca726ff7fea8c3`.
- Date: 2026-10-15
- Implementation baseline: live `main@24cddfc7906e69b87bb22563f8c7fa3abb2002b9`.
- Governance: CR #40 records owner approval of the precise compiled-runtime allowlist, File Security Profile, production ClamAV protocol and runtime packaging amendment. Frozen manifest remains unchanged.
- Frozen manifest preserved verbatim: `allowed_paths_raw: /apps/api/modules/files /packages/storage`; `exit_criteria: MinIO metadata, hashes, offline upload refs.`

## 1. Prerequisites verified

- G0: PASS. WP49-011 and WP49-014 were verified complete at the implementation baseline by their merged implementation/closeout PRs, completion evidence, dependency CI and closed scope CRs, as documented in CR #40. WP49-016 closeout PR #39 and exact post-merge CI run 38664024824 were also confirmed on the implementation baseline. WP49-017 is the next unlocked W1/MVP package after WP49-016 under `codex/IMPLEMENTATION_ORDER.yaml` and `codex/build-graph.yaml`; its direct dependency edges are WP49-011 and WP49-014. Manifest status fields were not used as completion evidence.
- Baseline: `24cddfc7906e69b87bb22563f8c7fa3abb2002b9`; the clean implementation worktree was based on this live `main` commit. The implementation PR merged as `99041cf69721040a9749b9d7cfca726ff7fea8c3`.
- CR #40 was approved for the exact paths and owner security profile before the changes. A necessary API Dockerfile runtime-copy path was recorded in that same CR before editing the Dockerfile. The frozen DOC49 manifest and exit criterion were not changed.

## 2. Scope implemented

- Adds an internal files service backed by files-owned PostgreSQL metadata and MinIO object storage. Upload parts and the final object stream with bounded buffers; the API does not assemble the whole file in memory.
- Enforces a 2 GiB default maximum configurable globally and per tenant/evidence type before accepting upload body streams. Files at least 10 MiB use resumable 5 MiB parts. Each part and the completed object are SHA-256 checked.
- Returns a stable UUIDv7 staged attachment reference and persists owner/evidence metadata, declared and detected MIME, size, checksum, MinIO object key, quarantine/scan state and immutable audit provenance. The database stores an object key, never a local filesystem path.
- Sniffs actual content against the approved JPEG, PNG, PDF, MPEG audio and MP4 audio allowlist. Unknown content, MIME mismatch and recognized PDF active-action/compressed-object syntax are rejected. Objects are served as attachments. No filename or extension is used as type evidence.
- Files remain quarantined until a real ClamAV `clamd` INSTREAM scan returns clean. Infection moves the record to REJECTED; scanner missing/unavailable/error is retryable and leaves it quarantined. Production does not use a scanner fake.
- Adds additive migration 0006 and expected schema version 6. Existing audit/event/identity full-chain regression assertions were advanced only for the new migration version.
- No public HTTP route, event, permission catalog entry, mobile queue, sync protocol, domain linking workflow, OpenAPI/generated contract, or adjacent-WP behavior was added. DOC12 §29 attachment routes remain assigned to WP49-020.

## 3. Changed files and CR comparison

The implementation PR changed exactly these 23 paths, all explicitly present in CR #40's approved allowlist:

- `apps/api/Dockerfile`
- `apps/api/package.json`
- `apps/api/src/app.module.ts`
- `apps/api/src/modules/files/clamav-scanner.ts`
- `apps/api/src/modules/files/content-validation.ts`
- `apps/api/src/modules/files/files.module.ts`
- `apps/api/src/modules/files/files.service.ts`
- `apps/api/src/modules/files/files.tokens.ts`
- `apps/api/src/modules/files/files.types.ts`
- `apps/api/src/schema-version.service.ts`
- `apps/api/test/audit.integration.test.mjs`
- `apps/api/test/events.integration.test.mjs`
- `apps/api/test/files.integration.test.mjs`
- `apps/api/test/files.unit.test.mjs`
- `apps/api/test/identity.integration.test.mjs`
- `apps/api/test/schema-version.test.mjs`
- `apps/pnpm-lock.yaml`
- `database/migrations/0006_file_attachment_metadata.sql`
- `database/test/database.integration.test.mjs`
- `database/test/migrate.test.mjs`
- `packages/storage/README.md`
- `packages/storage/src/index.cjs`
- `packages/storage/src/index.d.cts`

This report is the only path in the report-only closeout PR and is the exact report path approved in CR #40. No unapproved path or manifest change is present.

## 4. Database, object storage and contracts

- Migration 0006 adds files-owned attachment, upload-part and immutable audit tables with tenant ownership, quarantine state and scan status; schema version is 6.
- MinIO object metadata records stable attachment identity, checksum, MIME and quarantine state. The shared Storage adapter streams objects and is copied into the production API image.
- OpenAPI, generated contracts, event catalog, permission catalog and sync schemas are unchanged because this WP adds no public endpoint or event.
- The API module uses a deny-all authorization provider by default. Any approved caller must supply a server-side authorization adapter before enabling access. The production ClamAV endpoint is also provisioned externally and must accept INSTREAM requests up to the configured file-size limit. Until both conditions are met, the service fails closed; no unscanned or unauthorized reference becomes available.

## 5. Tests and quality gates

Local evidence at implementation head `d6f63c7de67794d55b10f78d6bc83e5b6d249ed2`:

- `node scripts/ci-gates.mjs all`: PASS. Lint capability: PASS/N/A because no lint script is configured. Typecheck/architecture, unit/regression, contract/drift, PostgreSQL migration integration and runtime smoke: PASS.
- API/PostGIS unit suite: 45/45; database migration integration: PASS.
- Files unit tests: PASS for deny-by-default and injected authorization, size policy, content sniffing and PDF active-content rejection, invalid checksums, quarantine and scanner failure/infection behavior.
- Files integration: PASS against disposable PostgreSQL/PostGIS, MinIO and ClamAV. Verified streamed 10 MiB upload in two 5 MiB parts, idempotent part retry, SHA-256 and MinIO metadata, scanner-outage quarantine/retry, clean release, real ClamAV EICAR signature detection, and immutable audit entries.
- Production API Docker build and compiled FilesModule/Storage runtime imports: PASS.
- `git diff --check`: PASS; implementation diff matched CR #40's exact approved path set.

Gate decisions:

- G0: PASS — direct dependencies are complete and compatible at the verified baseline; exact scope and owner decisions are recorded in CR #40.
- G1: PASS — build/typecheck/architecture guard pass; lint is N/A because no lint tool is configured.
- G2: PASS — migration 0006 applies in order and full-chain migration/schema-version tests pass.
- G3: PASS — file validation, upload, retry, state and failure unit tests pass.
- G4: PASS — real PostgreSQL, MinIO and ClamAV integration passes.
- G5: PASS — no public API/event contract changed; contract validation and generated drift checks pass.
- G6: PASS — staged offline reference is stable and persisted; 5 MiB chunk retry and completed-object checksum are tested. Mobile queue, sync commands and reconnect/conflict protocol are not in this WP.
- G7: PASS — authorization is checked on upload, part, completion and read service operations; unit and integration tests exercise allowed and denied actors. The production provider defaults to deny until an approved server-side adapter is installed.
- G8: N/A — no cross-module business write or event publication is added; files metadata and immutable audit evidence are committed in files-owned PostgreSQL transactions. Existing application outbox behavior is not changed.
- G9: PASS — migration full-chain, API schema-version, immutable audit and MinIO metadata integration assertions pass.
- G10: PASS — deterministic integration covers retry after scanner outage, part replay, clean scan release and malware signature detection; unit tests cover the malware rejection transition with a test-only scanner fake.
- G11: PASS for the WP's scoped security checks — tenant-scoped lookup, deny-by-default permission provider, content sniff/hash, quarantine, scanner fail-closed behavior, attachment disposition and immutable provenance are covered. Production availability requires configured authorization and ClamAV services; without them access remains denied/quarantined.
- G12: PASS — full PR diff review found no blocking defect or scope deviation. PR #41 head `d6f63c7de67794d55b10f78d6bc83e5b6d249ed2` had no GitHub review submissions or unresolved inline threads; all CI jobs passed. PR #41 merged by ordinary merge commit `99041cf69721040a9749b9d7cfca726ff7fea8c3`. Post-merge run [38669122765](https://github.com/loktevila658-spec/agro-platform/actions/runs/38669122765) must complete successfully on that exact SHA. The report-only closeout PR and its post-merge CI are part of governance closeout and must also pass before DONE.

## 6. Limitations and follow-up boundary

- No public upload/download route or mobile upload queue is introduced; those contracts remain with their owning WP. Consumers must use an approved server-side adapter with explicit authorization.
- Production provisioning must provide private MinIO credentials and a private ClamAV endpoint configured with a stream-size limit at least as large as the active tenant/type policy. Missing/misconfigured scanner or authorization remains fail-closed, so no reference is usable.
- Retention/deletion workflow is not added. Legal Hold and data-class retention remain owned by their governing platform policies and future applicable WP.

## 7. Unlock decision

- **PENDING** — implementation and merge are complete, but WP49-017 is not DONE until the exact implementation merge SHA passes post-merge CI, this Completion Report is merged with successful post-merge CI, and CR #40 is closed with that evidence.
