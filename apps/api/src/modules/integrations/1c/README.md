# WP49-022 — mock-backed 1C skeleton

Compiled Nest `OneCModule` registers `ONE_C_MOCK` through WP49-021. It exposes only
trusted server application services, no HTTP endpoint. No production 1C instance,
credentials, URL, OData/HTTP/SOAP implementation or provider wire format exists.
`one-c-mock/1` is an internal fixture schema, not a negotiated 1C exchange contract.
Production configuration/transport needs its own authoritative contract and WP.

DOC50 > DOC48 > DOC47 > DOC49 governs scope. DOC13 §7 defines direction per
customer configuration; DOC23 §8–11 and REV47-023/035 define attribute ownership:

| Data | Direction / authority |
|---|---|
| Organization/counterparty requisites, material/unit/warehouse references | Profile-specific reference imports/mapping, never wholesale object overwrite |
| Employee reference | HR/1C reference input; operational roles/assignments remain platform-owned |
| Accounting code, postings, tax/accounting actual, external posting status | 1C authority, platform projection/reconciliation only |
| Stock snapshot | Bootstrap proposal/reconciliation only; platform ledger/balance cannot be overwritten |
| CLOSED consumption, production output, field/season operations | Platform-owned operational facts, export accounting reflection to 1C |
| Maintenance operational facts vs accounting costs | Separate platform facts and external accounting attributes |

Trusted composition installs the existing framework policy and registers explicit
owner application command ports through `OneCService.registerOwner`. No business
handler is registered by default. It configures a framework profile and immutable
`OneCBinding`, specifying direction, operation, entity type and each mapped
attribute's aspect, authority, direction, primitive type and required flag.
Operational attributes cannot be assigned to 1C or imported as canonical facts;
accounting aspects remain 1C-owned. Reference fields need explicit ownership.
Customer-specific bidirectional rules are outside this skeleton; use separate
versioned IN/OUT bindings. A reference import can propose/enrich data only under
its actual owner command's permissions/domain/version/state policy. Merely
labelling a field REFERENCE never grants permission to overwrite a business fact.

Incoming envelopes use common durable staging, immutable mapping versions,
validation and external identity/provenance links. Attribute failures remain
staged/actionable; the guarded owner command executes in the common transaction
with owner validation, canonical effect, owner audit/outbox and connector evidence.
Adapters never receive a database handle for foreign business tables. The mock
adapter accesses only integrations-owned metadata. No foreign domain SQL exists
in production; isolated SQL owner commands in tests represent the future ports.

`configure` first commits the common immutable profile, then the binding and its
audit. A failed second commit can leave an inert unbound profile. Retrying the
same configuration safely completes it; execution without a matching binding is
rejected. Profiles/bindings are never silently edited; use a new version.

Outbound mock acceptance is explicitly `MOCK_ACCEPTED`. It does not claim an
actual 1C posting or change local operational state. Durable simulated receipts
are unique by tenant/profile/idempotency key and preserve intent hash, GUID and
observation provenance. Common framework attempts/retry/DLQ/replay and timeout
contracts apply. Lost response or durable SENDING triggers receipt reconciliation
before resend. NOT_FOUND is conclusive solely for this mock store. Fault hooks
exist for fixture injection, never as endpoint/credential configuration.

`reconcile` compares caller-supplied internal mock observations of external GUID,
normalized total and opaque modified version. It never fetches a real provider
or infers units/rounding/version ordering. Totals compare as normalized decimal
strings; callers must supply the same precision/unit convention. It appends
MATCHED or OPEN observations, differences, actor/correlation/source time, audit
and an internal reconciliation journal in one transaction. Repeated identical
observation keys return the same row; changed intent requires a new key. READ
permission exposes the latest 100 tenant/profile observations. GUID changes,
missing records, total/version differences never create duplicate master data
or resolve/modify canonical facts. Resolution UI, paging, scheduled provider
polling and business correction workflows are outside this shell.

Schema v9 expands v8 with four integration-owned tables. Existing in-flight
profiles/envelopes/receipts remain readable; API expected version advances to 9.
History, mock receipts, bindings and reconciliation are immutable with no purge
or destructive DOWN. Restore/forward correction follows the project strategy;
future archival needs explicit retention/legal-hold policy. Public API/event
catalog/codegen are unchanged. Docker already carries compiled API and common
connector runtime. Existing CI API wildcard tests and migration discovery cover
all additions; no dependencies, lockfile or CI definitions change.
