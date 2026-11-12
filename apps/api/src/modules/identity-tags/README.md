# QR identity foundation (WP49-030 / CR #84)

DOC50 execution > DOC48 frozen scope > DOC47 reconciliation > DOC49 graph;
DOC18 §11 / DOC12 §20 define the internal QR standard. Initial registered type
`Material` is backed by MasterDataService.read. FINISHED product is the same
Material UUID. LandPlot/Field/FieldSeason are independent identities and are not
inferred QR types. Lot/batch/asset/location/document/sample owner domains are
not implemented here; unknown types fail explicitly.

## Wire version 1

`agro://v1/Material/<lowercase-uuidv7>?c=<lowercase-sha256-hex>`

SHA-256 input is UTF-8 `v1/Material/<lowercase-uuidv7>` with no newline. Compact
JSON `{ "v":1, "t":"Material", "id":"uuidv7", "c":"hex" }` carries the same
identity; duplicate/extra fields are rejected. Input is bounded to512 UTF-8 bytes.
No tenant hint, secret, price, access right, expiry or signature is carried.
Checksum detects corruption only: anyone can recompute it. Normal current
session, tenant and owner permissions are always required. No scanned URL is
opened and no scan directly mutates a business entity.

`POST /v1/qr/resolve` accepts `{payload}` and returns minimal identity/preview or
UNAVAILABLE. Missing and foreign IDs are indistinguishable. Inactive Material
is unavailable; corrections resolve to the current same UUID. No alias/retarget,
rotation/revocation policy or split/merge auto-follow is invented. A tag is not
the canonical business key; label loss does not lose the entity.

`POST /v1/qr-codes` accepts `{entityType,entityId}` and requires Idempotency-Key.
Issuance checks current tag policy plus owner permission/state on replays and
before commit. It appends an immutable tag, minimal provenance and catalogued
qr_code.created outbox atomically in schema17. It never writes master-data.
No event/audit is generated for preview scans. Business-significant scan events
remain with the owning domain action; no generic QR business command is added.

## Deployment and offline boundary

IdentityTagsRegistry.installPolicy is trusted server composition, immutable
once installed, fail-closed by default. MasterDataRegistry's current owner
policy is independently required. No client or QR can install either. The
baseline does not install permissive production policies. Unconfigured servers
return403, never a fabricated projection. No new role grants or seed data.

Mobile local schema4 retains unresolved references separately from business
outbox, keeps encrypted workspace isolation, and retries pending identities
through normal authenticated API. A cached preview is explicitly historical;
it cannot authorize an action. Known scope bootstrap/PURGE/update and auth
denial clear cached previews, while pending identity references survive reset.
No new offline grant or unlimited business-write authorization is introduced.
Offline-created UUIDv7 can be encoded locally before first sync; issuing a
server provenance record still needs accepted owner identity and current access.

No migration rollback that drops retained provenance is supplied; additive
compatibility requires server schema17 and mobile local4. Existing older mobile
schemas1/2/3 upgrade transactionally; future schemas fail closed. Android is the
accepted current native foundation profile; this WP does not add an iOS host,
print engine, regulated marking integration or physical-device certification.
