# Task/work order core

WP49-031 owns WorkOrder lifecycle, assignment and manual execution, not a universal
state machine for scouting/WMS/maintenance. WF02 transitions are explicit. Immutable
completion fact, transition before/after audit and metadata outbox commit in the
existing SyncService command transaction alongside receipt/feed. HTTP is only an
authenticated wrapper of this same command path; no row PATCH or cloud failover.

Deployments must install TasksRegistry policy through trusted composition. Default
is deny. Current authorization receives tenant, actor and task organization, and is
rechecked on every execution/replay/pull. Employee references resolve to authenticated
users through that policy, never by assuming employee UUID equals login UUID.
Operation type and supplied definition/unit validation are also an owner policy. Optional asset references require their trusted validation port; absent resolution
rejects them. Assets cannot cause any foreign writes. No assignment seed, default grants or production fixtures.

TaskDefinition and TaskProjection are generated canonical HTTP contracts, command
version1 uses existing SyncCommand with Task.<Action>, aggregate Task/id, baseVersion,
UUIDv7 command ID/idempotency, original observed time/provenance/attachment intents.
Create has baseVersion0. Read/list and commands require current authority identity;
command transport requires registered device/scope. List uses ID keyset (up to500
candidates, existing sync page bound); read policies filter candidates. A restricted
list can be empty before exhaustion; nextAfter advances by the last scanned candidate,
so permission filtering cannot hide subsequent authorized pages.

Field/FieldSeason target references resolve through the Farm owner transaction-bound
query; initial reference provenance is pinned without copying foreign field/geometry payloads. No geometry or parcel ownership is transferred.
Other target families reject until an accepted owner port exists. Operation quantities
use decimal strings, numeric(18,6), never floating-point money/quantity authority.
Complete records manual quantity/unit when required by the explicit operation policy,
or null quantity/unit for non-quantitative work, with retained evidence. Material-consumption requests
reject explicitly: there is no warehouse/material ledger implementation here.
Verification/close preserve the execution fact; Return records explicit RETURNED
without silently editing that fact or fabricating an agronomy correction workflow.

Offline execution uses existing encrypted workspace/provisional queue and pinned
signed grants. A deployment-configured O1 TTL is required (max7 days); no TTL is
invented. Grant coverage permits a valid local Accept/Start/Pause/Resume/Complete
chain while current server rules remain final. Rejected/conflict intent is retained;
no automatic state rebase or last-write-wins. Native Android tests verify storage,
reopen and wipe; real PostGIS verifies canonical execution and receipt/feed effects.
iOS is N/A in the current Android support profile, not certified.

The task projection boundary is reusable by WP49-029 after this package's acceptance.
No offline GIS package is implemented here. No retention pruning, production provider,
external HR/asset registry, accounting/payroll or later agronomy workflow is added.

Task delivery retains command participants and resolved assignees as read-model
recipients, so a creator receives subsequent executor updates. Every pull still
checks current read policy; retained audience membership never grants access.
Permission/scope changes must advance device scope through the existing platform
sync contract; the task owner does not write foreign identity/sync policy tables.
