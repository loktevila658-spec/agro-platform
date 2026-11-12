# WP49-030 Completion Report — QR identity foundation

Date: 2026-11-13 Europe/Moscow. Status: IN PROGRESS, NOT DONE.
Baseline main: `4608c7ed500656528bd04852694f510bedeba927`.
Scope approval: [CR-0030 / #84](https://github.com/loktevila658-spec/agro-platform/issues/84), exact49 paths approved by owner before code, initial Material registry boundary and PUBLIC reduced proposal classification. No independent review claim. Frozen manifest/dependencies/release/literal paths/exit criterion unchanged.

## G0 and boundaries

Authority: DOC50 execution > DOC48 scope > DOC47 reconciliation > DOC49 build graph; DOC18§11/DOC12§20 QR, DOC14 operations, DOC10 identity, DOC11 stable canonical key, DOC15 issuance event, DOC19 current permission/tenant/privacy and DOC46 preview/manual UX.

WP017 implementation PR41 merge99041cf69721040a9749b9d7cfca726ff7fea8c3 exact push38669122765 all7 SUCCESS; report PR42 merged dfa7bb060eafaae579a1b0f90a1ada43e889fae1 exact push38669533575 all7 SUCCESS; CR40 CLOSED/completed. WP025 implementation PR63 merge73591bc241a4a64d76cbf62cd32dd87259ec2216 exact push41355973494 all8 SUCCESS; report PR64 merge0ba90c70cb2b88556c3c01165fb2ec14ba44b476 exact push41492980286 all8 SUCCESS; CR62 CLOSED/completed. Actual run event/SHA/jobs, reports/governance and ancestry verified. Static manifest statuses unused.

Clean isolated worktree/branch from exact live baseline; original dirty checkout untouched. No WP031 work. Initial outside-path hold was resolved by explicit owner approval and recorded in CR84 before implementation.

## Delivered behavior

Opaque DOC18 QR v1 URI and compact JSON v/t/id/c, same UTF-8 SHA-256 corruption checksum across API/Dart, strict bounded parser, explicit unknown-version/type/malformed errors. No token, right, business data, expiry/signature or new rotation policy. Forged checksum cannot bypass current ordinary session/tag/owner/tenant checks.

Initial concrete type Material (FINISHED product same UUID) resolves through MasterDataService.read; no foreign SQL writes or invented land/farm/later-domain aliases. Current rename preserves identity, inactive/missing/foreign references are unavailable without cross-tenant existence disclosure. Tag issuance never changes Material. Schema17 appends immutable issuance/audit/outbox with idempotency, current permissions rechecked on replay and before commit, existing dispatcher and qr_code.created contract. Preview creates no audit spam.

Mobile camera/QR image rendering/manual entry and preview; encrypted local schema4 transactional upgrades from1/2/3; durable unresolved identities/retry; isolated historical cached preview with known scope/PURGE/update/auth-denial invalidation; logout lifecycle cleanup. Offline local encode is identity-only and creates no canonical fact. No new domain command or offline grant.

## Scope evidence

Literal frozen `/apps/api/modules/identity-tags /apps/mobile` unchanged. CR84 approves compiled `apps/api/src/modules/identity-tags` and exact runtime registration, events/schema/version regressions, two public API contracts, permission catalog/regressions, codegen and evidence files. All mobile files remain under frozen `/apps/mobile`. No compiler/Docker/API dependency/CI/generator/Compose/deployment/adjacent-domain change. Exact changed-path comparison is required before merge and will be recorded below.

## Checks and gates

Pre-code RED codec test failed on missing compiled implementation, then API codec/policy cases passed. Initial baseline contracts lacked installed TypeScript; frozen install resolved it and baseline39/39 passed. Current targeted API/permission/schema/migration/contracts tests45/45 PASS; workspace typecheck/architecture and contracts/codegen PASS. Dart3.14 standalone formatter used locally; hosted Flutter3.47.8 remains authoritative. Local Flutter SDK unavailable; install attempt hit local disk capacity. Local targeted real-PG test fails at Docker daemon connection, before scenario execution. No local real-PG/native PASS claim. Hosted required checks must resolve those limits.

| Gate | Current status |
|---|---|
| G0 Prerequisites | PASS: verified dependencies, compatible baseline, exact owner-approved scope |
| G1 Static | Local PASS; final head CI pending |
| G2 Migration | Unit discovery PASS; real server17/mobile4 pending |
| G3 Unit | Targeted API45/45 PASS; full/mobile pending |
| G4 Integration | Pending hosted real PG/runtime/native; local Docker unavailable |
| G5 API Contract | Local PASS: validation, exact contract regression and generated drift |
| G6 Event Contract | Contract PASS; actual atomic dispatch scenario pending |
| G7 Permissions | Targeted default-deny PASS; real session/tenant/owner negatives pending |
| G8 Offline | Pending unit/widget/native upgrade/restart/retry/scope tests |
| G9 Audit/Provenance | Pending real transactional immutable issuance evidence |
| G10 Demo/E2E | Pending deterministic real API and Android decode scenario |
| G11 NFR/Security | Parser/default-deny local PASS; final relevant negative/native checks pending |
| G12 Evidence/Merge | Pending exact head/review, ordinary merge, exact push CI and CR closeout |

## Limitations

Production composition must install current trusted tag and MasterData owner policies; baseline denies until configured. No role grants/permissive production test behavior added. Historical cached preview is not current authorization. Other entity domains/types, full label printing, regulated Data Matrix, tag revocation/rotation and business-significant scan workflows remain outside this foundation. Native accepted profile is existing Android foundation; no iOS host/support or physical-device/production provisioning certification is claimed. Emulator image-decode evidence must not be represented as physical camera certification.

Implementation PR/head, exact checks, merge SHA, exact post-merge runs, review/diff evidence and governance closure: PENDING. This report does not activate DONE until all applicable gates and closeout are fulfilled.
