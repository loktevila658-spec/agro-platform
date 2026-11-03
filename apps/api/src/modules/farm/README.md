# Field & FieldSeason application module

Farm owns operational Field identity, explicit AgriculturalSeason context, FieldSeason,
effective revisions, parcel allocations and split/merge lineage. Land owns parcels,
cadastral snapshots and rights. GIS owns geometries, approvals, source/CRS and area
measurement. Farm binds approved effective version IDs using public transaction-bound
owner queries. There is no foreign-table SQL in Farm and no geometry copy or automatic
approval, union, parcel creation or legal title inference.

Entry points are injected application services, following the existing API module
composition. This WP adds no HTTP route, OpenAPI operation or user interface. A trusted
server composition must install a current tenant permission policy once; default deny
remains effective otherwise. Nine explicit actions are in the central catalog, without
default grants. Read permission covers all Farm entity/history/lineage queries.

All commands clone input/actor/context before awaiting, require LOCAL_PRIMARY, validate
inputs, recheck current permissions in a transaction and reserve an actor-bound
idempotency receipt. Farm writers serialize by tenant advisory lock; the shared atomic
version guard still rejects stale corrections and lineage sources. Revision, allocation,
identity, audit, outbox and receipt commit or roll back together. Event delivery uses
the existing dispatcher/inbox. Advisory-lock serialization is an implementation choice,
not a new business authority. Connection and statement timeouts bound pool operations.

Field code is unique within organization; UUIDv7 is identity. Code/org are identity
attributes in this slice; correction revises name, status, nominal area, optional site,
approved boundary reference and explicit allocations. Nominal and GIS geometric area
remain separate. Allocation inputs supply parcel, validity, source and reason, with
optional area/approved geometry; no automatic overlap calculation or exclusivity rule.
An absent geometry means no boundary has been bound, not a fabricated shape.

AgriculturalSeason registration requires supplied name, business year and actual dates;
dates may span calendar years. FieldSeason references a real registered season and field
in one organization. Field/season and primary Field/business-year are unique. Year is
part of seasonal identity in this slice and cannot be silently reassigned by correction.
Correction revises seasonal metadata with expected version and reason. Cataloged statuses
are accepted as correction metadata; this module does not invent agronomic transition,
operation or approval workflows. No crop/variety on Field; FieldCrop/crop catalogs,
plans and operations are outside this WP.

Corrections append immutable revisions and retain old geometry/allocation provenance.
History reads order revisions; read without asOf returns the latest recorded revision,
while an explicit asOf selects by effective instant then revision, including archive
history. A later GIS approval does not silently rebind any Field or FieldSeason.

Split accepts one source and at least two explicitly supplied new Fields. Merge accepts
at least two distinct sources and one explicitly supplied new Field. Inputs provide the
same effective instant for all targets and the lineage decision; it cannot precede the
latest source revision. Source fields become ARCHIVED with their existing geometry and
allocation provenance retained. Sources cannot be silently reactivated/reused by these
commands. New targets and a serialized database DAG check prevent cycles. Existing
FieldSeason records/facts do not move to targets. Lineage retains actor/reason/context;
errors roll back every source and target. No inferred geometry or legal consequences.

Migration14 is expand-only. Deploy it before the API image expecting schema14 (including
the dispatcher source). Existing parcels/GIS records and HTTP/sync contracts remain
compatible. Rollback uses project restore/compensation procedures; no destructive DOWN.
Immutable histories have no invented purge/retention policy. Command bounds: at most1000
allocations or lineage inputs/outputs per command, solely a deployment resource limit.
No new mobile sync command is registered; existing offline/mobile/security regressions
remain required. No production/WAN/physical-device certification is asserted.
