# WP49-024 — Local → Holding replication/1

DOC50 > DOC48 > DOC47 > DOC49, DOC22 §12/DEP-113–122 and DOC23 apply.
This is a server-only asynchronous replication capability, separate from mobile
sync, external providers, domain commands and PostgreSQL HA. Operational authority
remains Local Primary through WAN, Local and Cloud failures. No reverse transport,
cloud command, conflict resolver, LWW or temporary write-authority switch exists.

## Source and allowed data

`ReplicationConsumer` uses WP016's transactional inbox/consumer client to append
only the four existing `org.*.created@1.0.0` catalog metadata events. It validates
exact keys/envelope identity and actual owner entity types. A known org event with
an unsupported version or malformed payload fails its WP016 consumer transaction;
its named capture error/retry remains visible there rather than silently dropping
the event. Identity/security events are excluded. The current
catalog contains identity/provenance metadata, **not full organization snapshots**;
this module does not query foreign business tables or synthesize those snapshots.
Existing Local facts, permission/domain command/audit/outbox transactions are intact.

`append(tx, change)` is the server-only owner projection port: a mandatory active
transaction (SAVEPOINT rejects autocommit) owns atomicity. Future owning WPs may
supply explicitly approved event projections in their owner command/consumer
transactions; no future domain, dataset or provider is registered here. The caller
must check its current domain permission/validation/state/audit/outbox. In-process
trusted composition is the capability boundary; there is no user/cloud append API.
Do not pass arbitrary user input or raw DB rows to this port.

A change pins protocol version 1, tenant/event/aggregate/revision, source owner,
source event ID, actor, correlation/causation, original time/evidence and object
IDs/SHA-256. Strict JSON/type/size/depth/version checks precede staging. Content
hashes are deterministic. Reusing an event ID with different contents fails.
Cloud does not infer time/revision from arrival time. Existing aggregates require
CORRECTION or TOMBSTONE with the exact prior event ID and increasing owner revision;
UPSERT creates the initial derived record only. History is never silently replaced.
Tombstones keep original versions/provenance. Object bytes may arrive separately;
metadata ACK explicitly does not mean that an attachment is uploaded/available.

## Durable flow and recovery

Local transactional tenant clock locks order **commit visibility**, unlike a
nontransactional PostgreSQL sequence. Different tenants have independent streams;
there is no global event order. All retained events live in `local_outbox`; event
content and the append-only journal are protected from UPDATE/DELETE/TRUNCATE.
No compaction or retention scheduler deletes history.

The compiled Local Nest module registers capture and a background sender. Each
cycle sends at most one <=1 MiB event per stream, at most ten streams; a persisted
`next_send_at` enforces the configured minimum interval even if the next event is
appended after an ACK. No registration means no network call: backlog remains
local and status reports DESTINATION_UNCONFIGURED. Existing org events are caught
up by WP016 discovery/inbox, independently from a production destination.

A per-stream session advisory lock serializes concurrent workers across the
network/ACK window. SENDING/attempt/next-attempt state is committed before sending;
process or DB loss releases the lock, and another worker retries the same event
once due. Bounded timeout/AbortSignal, exponential 1s–5min backoff and maximum
cycle attempts end in visible DEAD_LETTER. Unknown exceptions expose UNAVAILABLE,
never raw remote bodies/secrets. One poison event blocks its stream; no skip or
synthetic ACK advances the checkpoint. Late transport completion cannot create a
Local ACK after the timeout. An uncooperative adapter can still finish a Cloud
receive; its replay is idempotent and it cannot write Local facts.

The holding receiver authenticates tenant/site/installation and message content
before opening a transaction. Stream locking, immutable dedup/history, current
derived read model and contiguous receiver cursor commit atomically. A gap is
retryable; conflicting sequence/event/hash/revision fails. Duplicate exact messages
return the original event's ACK, even when the receiver has progressed further.
Local accepts only the exact authenticated version/identity/event/sequence/hash
ACK; its checkpoint/outbox ACK state/journal commit together. Lost ACK/Local storage
failure leaves retryable Local history and exactly one Cloud effect.

`status(actor)` requires current WP021 READ policy on `replication` and returns
backlog count/bytes, oldest unsent/lag, last ACK, head error and dead-letter count.
An entirely unreachable Local database is reported by the existing error/logging
boundary; it cannot durably record its own outage. Poll failures emit a sanitized
logger error. Worker EXECUTE and explicit replay/rebuild use current WP021 policy,
default deny. No separate permission namespace or public endpoint is invented.

`replay(actor, reason)` requires current REPLAY policy, resets only the poison head
and journals actor/reason; it never edits content or moves the checkpoint.
`rebuild(actor, reason)` takes the sender lock, journals the authorized action,
resets Local delivery checkpoint to zero and replays **complete retained history**
with the same tenant/site/installation binding. Use it against a controlled fresh
holding database, or idempotently against a surviving copy. No domain fact is
changed. No history compaction/snapshot adapter is introduced; if history is lost,
a separate approved owner snapshot/rebootstrap contract is required. Never clear
a poison event by deleting it, forcing an ACK, changing a hash or binding to a new
installation. A real semantic source correction must follow the owning domain's
change-control/recovery process.

## Composition, configuration and secrets

`ReplicationRegistry.register(binding, transport?)` is trusted bootstrap only,
immutable and one authoritative site/installation per tenant. Holding can register
many tenants. Config pins tenant/site/installation/service subject, per-installation
external secret (>=32 bytes), timeout 1..60000ms, minimum interval 100..3600000ms,
max attempts 1..100. These are explicit caller choices, not hidden env defaults.
Local persists the non-secret identity on first send and rejects rebinding.
Install current IntegrationsRegistry policy before enabling a worker. Worker
policy failures stop/retry safely; they never authorize an export by default.

The transport port requires HTTPS and detached domain-separated HMAC-SHA256 signed
messages/ACKs. The installation key is supplied from the deployment environment
or external secret store and never persisted/logged. TLS peer verification,
no credential-bearing redirects, bounded response parsing and cancellation are
adapter responsibilities. No vendor endpoint, production adapter or credentials
are installed here; composing a transport does not add a provider integration.
No environment/Compose/cloud vendor layout was guessed. Shared config remains
LOCAL_PRIMARY-only; a holding receiver is not a second running Local business API.

`ReplicationReceiver` is deliberately **not a Local Nest provider/controller**.
Construct it only in the holding service boundary with a separate holding pool,
registry and restricted credentials with bounded connection/statement timeouts.
The Local module bounds these PostgreSQL timeouts to 5s. It needs SELECT/INSERT/UPDATE on
`replication.cloud_stream`/`cloud_read_model`, SELECT/INSERT on `cloud_history`,
USAGE on replication schema; no domain table privileges. Tests exercise those
actual PostgreSQL grants. It receives no Local pool/command/owner service. There
is no receiver endpoint to route accidentally into Local, or cloud result callback
with business-write capability. HMAC is an internal application protocol; TLS and
secret rotation/provisioning remain deployment responsibilities, not new vendor
infrastructure in this package.

## Schema and verification

Expand-only migration 0010 creates replication-owned state and immutability
triggers. API readiness expects schema v10; old domain HTTP/event/mobile schemas
remain compatible. Apply migration before enabling v10 runtime; migration runner
checks names/order/checksums and clean/repeated/ahead-invalid cases remain tested.
Use distinct databases/credentials for Local and Holding, never PostgreSQL
local-cloud multi-master. Cloud replica is not a Local backup/PITR substitute.

`replication.unit.test.mjs`: strict protocol/auth/key/version/bounds, trusted
binding, actual compiled Nest registration/default deny/authority and no foreign
writes/endpoints. `replication.integration.test.mjs`: distinct Local/Holding/fresh
rebuild PostgreSQL DBs; actual restricted holding credentials, success/numeric
ordering, duplicate/concurrency, lost ACK/SENDING restart, transaction failures,
corrections/tombstones/immutability, controlled rebuild, signed ACK negatives,
poison/backoff/DLQ/replay, timeout and actual org consumer capture.

The transport fixture exercises the complete protocol but is not certification
of a production WAN, cloud vendor, deployed TLS chain, physical hardware or a
future full domain analytics projection. No such deployment is claimed.
