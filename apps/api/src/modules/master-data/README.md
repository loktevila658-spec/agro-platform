# WP49-025 Master Data core

Compiled Nest application services own tenant units and canonical Material. A
FINISHED Material is the product reference; inventory/production never need a
second product identity here. DOC47 Material reconciliation supersedes DOC10's
historical inventory Item ownership. This module creates no inventory ledger,
batches, classifier datasets, crop catalogs, conversions, UI or mobile workflow.

DOC50 > DOC48 > DOC47 > DOC49 governs execution/scope. DOC10 common/UOM/Item fields,
DOC11 BR-CORE-002–011/ORG-003–005, DOC13 and DOC23 field-level SoT govern semantics.

| Fields | Canonical owner / SoT |
|---|---|
| id, tenantId, organizationId | master-data/PLATFORM Local Primary; UUIDv7 independent of external IDs; immutable scope |
| Material code, name, itemType, baseUom, active | master-data operational reference/PLATFORM; an explicit external field policy restricts local edits of that field only |
| Unit code, name, dimension, precision | master-data/Formula Owner references; PLATFORM unless explicitly externally governed; code immutable, in-use dimensional/precision changes rejected |
| accountingCode | external-owned projection, 1C only when explicitly selected; no platform accounting authority |
| gtin | external-owned identifier projection, no canonical-ID role |
| External profile/type/ID/aliases and mapping revisions | existing integrations store through its permission-checked query and staged owner-command contracts |
| rowVersion, current snapshot, immutable revision chain, command/time/actor/source metadata | master-data server; corrections preserve original values/previous revision/reason/source policies |

All data-dependent values are supplied explicitly; no production reference seed is
installed. Known DOC10 item types are accepted, and only its explicitly named MASS,
VOLUME, AREA, COUNT dimensions. No inferred UOM conversion, normative value, float
quantity arithmetic or production import data is introduced. Unknown accounting
codes/GTIN remain null, not zero or fabricated values. Tenant-wide codes and
organization-scoped codes have separate uniqueness indexes; references use the
same tenant and composite organization relationship.

Trusted bootstrap installs one current permission callback on MasterDataRegistry,
reflecting current server-side action/tenant/subject grants. Defaults deny, including
policy exceptions. Actions are catalogued, no roles/grants automatically installed.
There is no public HTTP controller or user-supplied grant flag. The same boundary
runs on queries, command execution and idempotent replays. External import/transport
needs both framework permission and owner command permission; neither substitutes
for the other. Writes require LOCAL_PRIMARY; cloud/cache/AI have no write route.

Bootstrap also explicitly registers immutable per-tenant MasterSourcePolicy with
version, dataOwnerId, stewardId and any field source overrides. No people, profiles
or sources are guessed. Default operational fields are PLATFORM; accountingCode and
gtin are EXTERNAL_SYSTEM with no permitted inbound binding until explicitly supplied.
External bindings require exact profileId/profileVersion/source and MASTER inbound
field behavior; no outbound write-back is installed. A source label on one field
never governs another field. Policy snapshots/fingerprints are persisted with
version immutability; stale policy versions cannot be used after a newer version
has committed. Every revision records its policy version and changed-field sources.
No universal object-level MASTER_1C policy exists.

Authoritative commands validate strict fields, tenant, business relationships,
expected version and reason. One transaction reserves idempotency, validates the
immutable policy/version, locks authoritative state, uses the shared command version
guard, writes the current snapshot, immutable revision/audit with previous link,
versioned catalogued outbox and stored exact response. Failures roll all back.
Permission is rechecked on replay; changed intent conflicts. Material deactivation
retains history; there is no hard-delete, fuzzy merge or automatic deduplication.
The owner revision journal implements audit/correction for these records; it does
not bypass AuditService to write framework tables or claim adoption by old modules.

`externalCommand()` is a provider-neutral owner application port for *existing*
canonical references only. Trusted composition may explicitly register it with
WP021. It requires an existing transaction (SAVEPOINT rejects autocommit), inbound
matching tenant/type/ID/operation, current permission, exact field source binding,
expected local version, reason, envelope/profile/mapping/source version/time and
provenance. Import evidence, if present, requires the complete batch/fileHash/row
triple. It never creates a second Material on a missing GUID, overwrites platform
fields without policy or treats external revision as local optimistic version.
Framework staging/receipt/owner effect/audit/outbox/link revision commit atomically;
conflicts remain ACTION_REQUIRED, with their immutable original staged intent.

Existing integrations external_link is the sole GUID mapping. Migration 0011
removes only the reverse one-to-one constraint, so old/new aliases resolve to the
same canonical UUID. The external tenant/profile/entity/ID key remains unique;
collision with another canonical record rolls back the owner effect. There is no
new mapping store or silent reassignment. Query results expose existing source
link revisions. No connector/provider protocol is implemented; WP022 remains a
mock-backed skeleton. Tests compose its mock with this owner port, without
installing any production profile, endpoint, credentials or provider adapter.

Events master_data.unit.changed and master_data.material.changed @1.0.0 contain
only exact catalog metadata and string revision, not guessed domain snapshots.
WP016 discovers the new explicit source, keeps inbox dedup/lease/retry semantics;
existing org/identity and replication consumers remain unchanged. No new product
consumer or replication projection is registered.

Schema 11 expands schema10. Existing facts/producer contracts/HTTP API stay
compatible; API expected schema becomes11 and all current-version assertions move
with it. Migrations are forward-only; no destructive DOWN or purge. Revisions,
policies and outbox content reject update/delete/truncate. Current references
reject delete/truncate and stable identity/scope changes. Retention is
MASTER_HISTORY: deactivate/preserve; future archiving must honor legal holds.

The module is usable through trusted server application contracts and default-deny
until composition supplies permissions/governance. No user interface, offline
command registration, snapshot distribution, generalized import, golden merge,
governance UI, provider-specific production exchange or future WP is installed.
Existing offline/mobile regressions remain required. Pools bound connection and
statement timeouts to5s and close with the module. Tests use fixture-only values,
real PostgreSQL transactions and mock exchange; no physical/WAN deployment is
certified by these scenarios.
