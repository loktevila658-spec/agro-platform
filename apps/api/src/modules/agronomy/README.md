# SeasonPlan and TechMap

WP49-032 implements versioned SeasonPlan, reusable TechMap templates (including
pinned parent inheritance), applied TechMap revisions, and published planned
operations/resources. SeasonPlan does not replace Farm's FieldSeason. A planned
operation is not a Task, work execution, material consumption or accounting fact.

Authority: DOC50 execution, DOC48 frozen scope, DOC47 ownership/reconciliation,
DOC49 WP032, DOC34 §§4–8/26/28–30, DOC10 tech-card/operation contracts, DOC11
BR-AGR-001–003, and DOC14/15 command/event principles. DOC34's older MASTER
release labels do not override DOC48/DOC49's accepted V1 planning enhancement.
No later-document-wins rule. CR87 approves the actual compiled source and all
migration/contract/test/evidence paths while the literal frozen manifest is intact.

All writes run only on LOCAL_PRIMARY. Trusted deployment composition installs
AgronomyRegistry's current tenant/organization permission callback and explicit
owner reference and formula/unit policies. Installation is immutable; absence,
unknown identities/operations/resources or missing policies deny. No production
catalog, crop, operation, unit, norm, dose, machine, employee or role is seeded.
Material/Product (FINISHED material) and units resolve in Master Data; active
FieldSeason/season and field/site context resolve in Farm, under transaction locks.
Only minimal canonical IDs/revisions/context enter planning provenance. New narrow
owner queries access only their own tables. Agronomy never queries foreign tables.

Create/Revise produce DRAFT. Approve requires exact expectedVersion and a separate
approval permission; Publish requires APPROVED and the same exact version guard.
State transitions append immutable revisions even when content stays unchanged.
Revise from any state appends a new DRAFT; published/approved content remains in
history with author/approver, effective/recorded times, source references, reason,
previous revision and before/after diff. Changing an owner revision between draft
and approval/publication requires an explicit revision; silently refreshing pinned
provenance is rejected. Template inheritance stores pinned parent and ancestry;
self/ancestral cycles reject. Supplied operations override the matching stable ID;
other inherited operations and crop context remain, with unique sequence numbers.

A template is reusable; an applied map binds an active FieldSeason. Its published
revision materializes immutable planned_operation/resource_demand rows. SeasonPlan
pins published applied maps from its same season/organization and optional site.
Dates or an explicit unscheduled flag and exact quantity/unit are required for an
operation. The generic typed agronomy API exposes these three distinct kinds;
commands are Create, Revise, Approve and Publish. No new offline write handler is
registered; retry is idempotent and stale approval conflicts at the server. Existing
Task/mobile offline execution remains under its original owner and protocol.

Resources accept either an explicit total quantity or explicit source-formula inputs,
never both. DOC34 §8 formulas are encoded as DOC34-8-MATERIAL-1 (norm × area ×
(1 + explicitly supplied reserve)), DOC34-8-MACHINE-1 and DOC34-8-LABOR-1 (norm ×
area). IDs identify these exact source expressions, not new agronomic formulae.
A trusted formula/unit policy must confirm compatibility; there are no conversions,
default reserve, rounding or guessed units. BigInt fixed-point evaluation rejects
results beyond numeric(18,6) or registered precision. Machine/labor/crop/operation
catalogs remain trusted owner ports, fail-closed until provisioned; no future owner
or availability/capacity service is fabricated. Material totals use the owner's
base unit; incompatible units reject. No pesticide/application advice is inferred.

Every effect, owned audit, immutable command receipt and outbox event commits in
one transaction. Actor-bound fingerprints and tenant serialization prevent duplicate
creation and key collisions; current policy is checked again under lock on replay.
The shared command version guard protects revisions. A generic metadata-only
agronomy.plan.changed@1 event covers every transition; source-defined SeasonPlan
created/published, tech_map.published and resource_demand.calculated events are
emitted only on those real effects. No fictitious consumer is installed. Existing
platform delivery/inbox/retry/dedup handles the explicit agronomy source.

An accepted published SeasonPlan can return a version-pinned TaskDefinition draft
using the existing Task contract. It retains plan/map/operation references outside
the unchanged task definition. Submission remains an explicit client/domain action
through Task's existing command path; no Task row, assignment or execution fact is
created by this read. Task retains its independent current validation/permissions.

Deploy migration18 before schema18 readiness. Expansion preserves existing APIs,
events, tasks, mobile schema and earlier migrations. Four generated contracts come
from canonical OpenAPI/events with the unchanged generator. Existing API/database/
contract/root globs and CI cover all tests; no compiler/glob/workflow changes.
Historical data is retained; no pruning/retention expiry or destructive DOWN is added.
No WP033+, resource conflict solver, procurement/budget/stock ledger, provider,
scouting, lab/remote sensing, UI/mobile planning, WAN or physical-device certification
is included. Reference/policy provisioning is required before production use.
