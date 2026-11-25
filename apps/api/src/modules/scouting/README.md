# Scouting observations — WP49-034

Authority: DOC50 execution, DOC48 frozen scope, DOC47 ownership, DOC49 manifest;
DOC34 §11, AGR34-052–061/063/064/066 and AT34-018–025; DOC11 correction and
source-linked Task rules; DOC12 O1, GPS/time/source and independent media sync.
This slice implements observations and explicit anomaly-to-Task handoff. The
frozen manifest is unchanged. Compiled src registration and companion paths are
approved in Scope CR93 before implementation (decision7166250756).

`Scouting.Capture` uses the existing SyncService transaction/receipt/version/
current permission boundary, with `ScoutingCapture:FieldSeason` finite signed
O1 grants. The original command UUIDv7 becomes observation identity. Manual
text-only capture is valid; optional GPS retains lat/lon, accuracy, provider and
original device time. Server receipt, actor/session/device and trusted current
employee reference are separate provenance. FieldSeason, Field, season and pinned
geometry references come through Farm's transaction-bound authorized owner port.
Observation type describes human-reported signs, never inferred diagnosis. Optional
configured form answers require trusted form/version approval and retain a snapshot.

`Scouting.Correct` is a reasoned immutable revision with an expected version.
Identity/context never changes; old revisions, audit and outbox cannot be updated,
deleted or truncated. `Scouting.CreateWork` requires an explicit current human
command, a reported anomaly, expected observation version, scouting.create-work
and Task owner's task.create permission. The target FieldSeason is inherited,
not entered again. Task.apply runs in the same transaction and confirms a DRAFT
Task before its identity is stored; source observation/revision trace is retained
in the Task transition's existing command provenance. One handoff per observation;
replay returns the original receipt and a fresh duplicate command conflicts. No
assignment, plan or dispatch is performed. Correction and handoff are online-only
HTTP/Sync owner commands in this slice; the mobile form captures observations.

Photo/voice are optional immutable staged attachment intents (`PHOTO` JPEG/PNG,
`VOICE` MP3/MP4). All intents are non-required, so unavailable/rejected media never
prevents metadata acceptance. Existing encrypted mobile AttachmentQueue stages
streamed chunks and hashes; the existing upload worker/SyncFiles/File Service
handles multipart resume, content sniffing, checksum, private storage, quarantine
and mandatory malware scanning. Scouting never inserts into foreign attachment
or Task tables, handles raw object paths or marks a pending object clean. Usable
remote reference binding remains exclusively File/Sync-owned. Existing immutable
file references/history and legal hold/retention rules are unchanged; there is no
attachment delete endpoint or retention policy here. A corrected revision retains
previous media intent as historical provenance; new media may be attached without
overwriting old revision links.

Android evidence uses explicit optional runtime permissions and private temporary
files; denied/cancelled/unavailable devices preserve the manual workflow. Media
is encrypted before being queued and the plaintext staging source is discarded.
Audio is an attachment, never transcript. Location requests time out without zero
coordinates. Backgrounding stops microphone capture. No hardware/provider/AI is
required. Offline metadata, retry, response-loss, conflict/rejection and shared-device
isolation use the existing encrypted workspace/queues and visible retained intent.

Production composition deliberately installs no grants, fake employee references,
form policy or permissive default. Trusted provisioning must install ScoutingPolicy,
Farm and Task policies, signing keys and existing private storage/scanner endpoints.
Missing policy denies capture/handoff. No source specification, CI assertion,
compiler glob, dependency/lockfile or unrelated WP is changed.
