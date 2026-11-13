# WP49-030 Completion Report — QR identity foundation

Date: 2026-11-13 Europe/Moscow. Status: **DONE**; all applicable G0–G12 PASS.

- Initial verified live main: `4608c7ed500656528bd04852694f510bedeba927`.
- Implementation [PR #85](https://github.com/loktevila658-spec/agro-platform/pull/85), tested head `a5fdc76d1498f1b30dc48240d0aa83779871670a`.
- Exact-head [CI run 43326959622](https://github.com/loktevila658-spec/agro-platform/actions/runs/43326959622): all eight jobs SUCCESS.
- Ordinary two-parent implementation merge: `7ebbd39b4b91cf877c733cc9ff65c3ebf8ee4246`; merge tree equals tested-head tree.
- Exact merge-SHA event=push [CI run 43329158307](https://github.com/loktevila658-spec/agro-platform/actions/runs/43329158307): all eight jobs SUCCESS.
- [Scope CR-0030 / #84](https://github.com/loktevila658-spec/agro-platform/issues/84): exact49-path scope, initial Material registry boundary and PUBLIC reduced proposal classification approved by owner before code; completed governance closure activates DONE. Owner decision recorded under delegation, not independent review.
- This report reconciliation changes only the already approved evidence path. Its PR/head/merge/checks are recorded in CR84 after completion; implementation evidence above remains the runtime baseline.

## 1. G0 and frozen authority

Authority: DOC50 execution > DOC48 frozen scope > DOC47 reconciliation/canonical owner > DOC49 graph; DOC33/MASTER and detailed domain contracts apply in their areas, historical DOC01–32 only where not superseded. No latest-document-wins. Applicable details: DOC18§11 wire standard, DOC12§20 local-first/unresolved identity, DOC14 qrResolve/qrCodeCreate, DOC10 unique QR code/common UUID/tenant fields, DOC11 label loss is not entity loss, DOC15 issuance event, DOC19 current permissions/privacy and DOC46 preview/manual UX.

Manifest byte-identical to baseline:
```yaml
id: WP49-030
title: QR identity foundation
wave: W3
release: MVP
depends_on:
  - WP49-017
  - WP49-025
allowed_paths_raw: /apps/api/modules/identity-tags /apps/mobile
exit_criteria: QR payload/version/resolution for entities.
```

Dependencies independently verified, not inferred from static manifest statuses:
- WP017: implementation PR41 merge99041cf69721040a9749b9d7cfca726ff7fea8c3, exact push38669122765 all7 then-required jobs SUCCESS; report PR42 merged dfa7bb060eafaae579a1b0f90a1ada43e889fae1, push38669533575 all7 SUCCESS; CR40 CLOSED/completed and canonical report present.
- WP025: implementation PR63 merge73591bc241a4a64d76cbf62cd32dd87259ec2216, exact push41355973494 all8 SUCCESS; report PR64 merge0ba90c70cb2b88556c3c01165fb2ec14ba44b476, push41492980286 all8 SUCCESS; CR62 CLOSED/completed and canonical report present.
- Run events, exact SHAs/jobs, governance and dependency merge ancestry verified. Connector commit-run lookup returned no historical runs; precise historical Actions metadata/jobs were checked through authenticated GitHub API instead.

Separate clean worktree/branch was based on exact live main. Original dirty checkout untouched except authorized common Git fetch/worktree metadata. Initial outside-path hold was resolved by the owner's explicit approval and CR84 before implementation. WP031 already existed in baseline; no new WP031 work performed.

## 2. Scope and delivered behavior

CR84's pre-code table covers49 files:28 additional runtime/contract/test/evidence paths and21 files under frozen mobile. Exact diff matches that set; no compiler-root, API dependency/Docker, generator, workflow/test-glob, Compose/deployment or adjacent-domain change. Literal frozen paths are retained, not normalized. API's src-only compiler and actual Nest registration use approved compiled identity-tags path. Existing API test wildcard and Flutter/native discovery run the tests without new CI wiring.

DOC18 version1 URI and compact JSON v/t/id/c share the same canonical opaque identity: `agro://v1/Material/<lowercase-uuidv7>?c=<lowercase-sha256>`. Checksum input is UTF-8 `v1/Material/<uuidv7>` without newline, reused from accepted SHA-256 primitives. It detects corruption; it is not a signature or authorization. Parser bounds512 UTF-8 bytes, validates UUIDv7, rejects duplicate/extra fields, malformed input and unknown version/type. No tenant hint, credential, right, price, business detail, expiry or new signing/rotation policy.

Material is the only registered type, explicitly supported by DOC18 and the accepted MasterDataService.read contract. FINISHED products share Material UUID. LandPlot/Field/FieldSeason identities do not imply QR aliases; future lot/batch/equipment/location/document/sample domains are not fabricated. Resolve uses current ordinary identity session, independent tag policy, tenant-filtered owner query and minimal preview. Missing/foreign/inactive references are unavailable without existence disclosure. Rename retains UUID; no silent retarget or lineage auto-follow.

Issuance is LOCAL_PRIMARY, permission/state validated on replay and before commit, and idempotent. Schema17 keeps one unique code/tag per tenant/entity; distinct request keys reuse that identity through immutable command-idempotency bindings. Entity-level transaction locking prevents concurrent duplicates. Initial issuance appends tag, audit/provenance and catalogued qr_code.created outbox atomically. Existing dispatcher/inbox handles delivery. It never modifies Material or another owner's authoritative table. Preview scans generate no audit spam; business-significant scan events belong to their domain actions.

Mobile provides real bundled scanner, QR rendering, manual fallback and entity preview. Local schema4 transactionally upgrades1/2/3 without losing commands/evidence/cursors. Isolated encrypted workspace stores unresolved identity, scoped historical preview and durable issuance request keys. Offline/local known lookup avoids WAN; unknown/unavailable identities survive restart and retry through the normal authenticated API. Known scope reset, update/PURGE and auth denial invalidate previews; cursor-stamped commit rejects delayed responses after feed/reset changes. Known denied/unavailable results cannot fall back to stale sync projection. Local UUIDv7 encoding creates only an identity label, never a canonical entity or offline permission.

## 3. Checks and gate evidence

Final exact-head and implementation-merge runs each independently passed all eight jobs: Lint capability, Typecheck, Unit, Contract, Migration, Runtime, Mobile, aggregate CI quality gates. Lint capability is PASS/N/A where no script exists; no configured check is bypassed. Current server schema17 clean/repeat migration and compiled production runtime passed. Contract definitions, both exact regression inventories, four generated outputs and drift check remain synchronized.

Final full Unit evidence: API193/193 with no skips, contracts20/20, config17/17, connectors2/2, root15/15 and migration units9/9 PASS. QR real PostgreSQL plus real Nest/HTTP/identity session scenario covers tenant isolation, current tag/owner denials, revoked session, preview no-audit, idempotent replay, distinct-key concurrency/unique code, conflict, in-flight permission rollback, database failure rollback, immutable tag/command/audit/outbox, event delivery dedup, correction and deactivation. No test-only behavior was added to production.

Mobile evidence: analyze/format and all58 unit/widget tests PASS, native APK build PASS; Android native5/5 PASS, including real MLKit QR raster decode and encrypted unresolved restart/retry. QR scenario rasterizes an actual code and decodes it through Android MLKit, then reopens the OS-key/encrypted workspace and resolves retained identity. Widget test uses native channel permission denial with manual continuation and real repository I/O under the existing runAsync scheduling pattern. Local schema1/2/3 upgrades, unsafe payload, exact cross-runtime vector, restart/retry, isolated user/tenant, scope race, stale-cache denial/unavailability and durable request keys are covered. Native image decoding is not physical optics certification.

| Gate | Final verdict and evidence |
|---|---|
| G0 Prerequisites | PASS — dependency merges/reports/governance/exact CI, compatible baseline and owner-approved scope |
| G1 Static | PASS — workspace typecheck, architecture, Flutter analyze/format, exact scope/frozen diff |
| G2 Migration | PASS — real server17 clean/repeat chain and encrypted mobile1/2/3→4 preservation |
| G3 Unit | PASS — full API193, Flutter58, contract/config/root/migration regressions |
| G4 Integration | PASS — real PostgreSQL/HTTP/session, production runtime and Android native/plugin/storage |
| G5 API Contract | PASS — two DOC14 operations, strict codec, OpenAPI/codegen/backward-compatible additions |
| G6 Event Contract | PASS — qr_code.created schema, atomic outbox, dispatcher/inbox replay/dedup and idempotency |
| G7 Permissions | PASS — default deny, current session/tag/owner checks, negative tenant and in-flight denial tests |
| G8 Offline | PASS — known/unresolved lookup, durable restart/retry, scope/PURGE/denial/race and existing capacity regressions |
| G9 Audit/Provenance | PASS — immutable unique tag/request/audit/event transaction and rollback; no preview audit spam |
| G10 Demo/E2E | PASS — deterministic real API/PG lifecycle and Android actual image-decode/reopen scenario |
| G11 NFR/Security | PASS — relevant payload bounds, corruption/forged-checksum negatives, no authorization bypass, encrypted isolation and existing regression thresholds |
| G12 Evidence/Merge | PASS — exact49 approved paths, produced report, cleared findings/checks, ordinary head-bound merge, exact push SUCCESS and completed CR84 |

## 4. Failed/superseded attempts and local limits

Pre-code codec test was RED on missing compiled implementation, then passed. Initial baseline contract test could not load TypeScript; frozen dependency installation resolved it and baseline39/39 passed. Local targeted45/45, typecheck/architecture/contracts/drift/secret scan PASS. Additional final targeted suites passed. Local Node24.15/pnpm11.25 differ from hosted Node22/pnpm11.19; local results do not substitute hosted gates. Standalone Dart3.14 formatted the mobile files; authoritative hosted Flutter3.47.8 validation passed.

Local Docker daemon unavailable: targeted real-PG attempt failed before scenario execution. Local Flutter absent and SDK clone attempt hit disk capacity. No local full-PG/native PASS claim; hosted exact-head and post-merge checks resolve those verification limits. No user data or original dirty source was removed.

First run43320879278 on cf13ec1664647a15bc82114a01a1b1096af540a8 failed one QR fixture assertion (192/193 API passed) because the fixture denied the second tenant before the intended tenant-filter check, and Mobile failed11 analyzer brace findings. Corrected fixture explicitly authorizes its two test tenants while preserving denial cases; braces fixed without changing analyzer rules. Run43325871159 on fcf115afcb4b6e4c64a77146032322eee2a0f74f passed all server gates and was superseded during Mobile. Run43326491677 on e1052568d7c82cf52b8e70273c250f03d9953fec passed58 mobile tests and was superseded during Android build. Cancelled or failed runs are not reported as final PASS. Final uniqueness review follows DOC10/DOC18 and adds stronger distinct-key duplicate prevention within the same approved paths.

## 5. Operational limits and unlock

Production must install trusted current IdentityTags and MasterData owner policies; baseline defaults deny and no permissive role grants/seed data are installed. Historical cache is not current authorization. Core identification works manually without camera/hardware; offline encoding requires an already assigned UUIDv7 and does not create an entity.

Only Material support is claimed. Full print/reprint jobs, regulated Data Matrix, future entity domains, tag revocation/rotation and business-significant scan workflows remain outside this foundation. Accepted native profile is Android under the existing WP019 foundation and explicit CR84 approval. No iOS host/support profile is introduced; iOS, physical-device battery/optics and production provisioning certification are not claimed or substituted for required Android tests.

WP49-030 DONE follows all applicable gates and completed CR84 closure. No WP49-031 work started. No auto-merge/admin/check bypass or independent review claim.

## 6. Exact implementation changed paths (49)

- `apps/api/src/app.module.ts`
- `apps/api/src/modules/events/events.types.ts`
- `apps/api/src/modules/events/outbox-dispatcher.service.ts`
- `apps/api/src/modules/identity-tags/README.md`
- `apps/api/src/modules/identity-tags/identity-tags.controller.ts`
- `apps/api/src/modules/identity-tags/identity-tags.module.ts`
- `apps/api/src/modules/identity-tags/identity-tags.payload.ts`
- `apps/api/src/modules/identity-tags/identity-tags.registry.ts`
- `apps/api/src/modules/identity-tags/identity-tags.service.ts`
- `apps/api/src/modules/identity-tags/identity-tags.types.ts`
- `apps/api/src/schema-version.service.ts`
- `apps/api/test/identity-tags.integration.test.mjs`
- `apps/api/test/identity-tags.unit.test.mjs`
- `apps/api/test/identity.integration.test.mjs`
- `apps/api/test/permissions.test.mjs`
- `apps/api/test/schema-version.test.mjs`
- `apps/mobile/README.md`
- `apps/mobile/android/app/src/main/AndroidManifest.xml`
- `apps/mobile/integration_test/qr_test.dart`
- `apps/mobile/lib/features/qr/qr_camera.dart`
- `apps/mobile/lib/features/qr/qr_page.dart`
- `apps/mobile/lib/features/qr/qr_payload.dart`
- `apps/mobile/lib/features/qr/qr_repository.dart`
- `apps/mobile/lib/generated/contracts.dart`
- `apps/mobile/lib/main.dart`
- `apps/mobile/lib/persistence/database.dart`
- `apps/mobile/lib/persistence/workspace.dart`
- `apps/mobile/lib/sync/pull_store.dart`
- `apps/mobile/pubspec.lock`
- `apps/mobile/pubspec.yaml`
- `apps/mobile/test/offline_package_migration_test.dart`
- `apps/mobile/test/qr_migration_test.dart`
- `apps/mobile/test/qr_page_test.dart`
- `apps/mobile/test/qr_payload_test.dart`
- `apps/mobile/test/qr_repository_test.dart`
- `apps/mobile/test/sync_migration_test.dart`
- `apps/mobile/test/workspace_test.dart`
- `database/migrations/0017_identity_tags.sql`
- `database/test/database.integration.test.mjs`
- `database/test/migrate.test.mjs`
- `events/catalog/index.yaml`
- `openapi/openapi.yaml`
- `packages/contracts/generated/dart/contracts.dart`
- `packages/contracts/generated/manifest.json`
- `packages/contracts/src/generated/contracts.ts`
- `packages/contracts/test/contracts.test.mjs`
- `permissions/catalog.yaml`
- `tests/contracts.test.mjs`
- `tests/evidence/WP49-030_COMPLETION_REPORT.md`
