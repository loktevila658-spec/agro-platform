-- Additive sync-owned state. No foreign domain table is modified.
CREATE SCHEMA sync;
CREATE TABLE sync.tenant_clock (
 tenant_id uuid PRIMARY KEY, seq bigint NOT NULL DEFAULT 0 CHECK(seq>=0), retained_from bigint NOT NULL DEFAULT 0
);
CREATE TABLE sync.device (
 tenant_id uuid NOT NULL, device_id uuid NOT NULL, user_id uuid NOT NULL, installation_id uuid NOT NULL,
 scope_version integer NOT NULL DEFAULT 1 CHECK(scope_version>0), schema_version integer NOT NULL DEFAULT 1,
 last_seq bigint NOT NULL DEFAULT 0, revoked_at timestamptz, registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,device_id), UNIQUE(tenant_id,user_id,installation_id)
);
CREATE TABLE sync.command_receipt (
 tenant_id uuid NOT NULL, command_id uuid NOT NULL, idempotency_key text NOT NULL,
 device_id uuid NOT NULL, user_id uuid NOT NULL, payload_hash text NOT NULL, result jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,command_id), UNIQUE(tenant_id,idempotency_key)
);
CREATE TABLE sync.change (
 tenant_id uuid NOT NULL, seq bigint NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL,
 entity_version bigint, op text NOT NULL CHECK(op IN ('UPSERT','PURGE')), projection jsonb NOT NULL,
 visible_user_ids uuid[] NOT NULL, changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,seq)
);
CREATE INDEX sync_visible_change ON sync.change USING gin(visible_user_ids);
CREATE TABLE sync.ack (
 tenant_id uuid NOT NULL, device_id uuid NOT NULL, user_id uuid NOT NULL, seq bigint NOT NULL,
 cursor text NOT NULL, acknowledged_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,device_id)
);
CREATE TABLE sync.conflict_record (
 tenant_id uuid NOT NULL, command_id uuid NOT NULL, conflict_type text NOT NULL,
 local_intent jsonb NOT NULL, server_state jsonb NOT NULL, resolution_status text NOT NULL DEFAULT 'UNRESOLVED',
 PRIMARY KEY(tenant_id,command_id), FOREIGN KEY(tenant_id,command_id) REFERENCES sync.command_receipt(tenant_id,command_id)
);
CREATE TABLE sync.attachment_reference (
 tenant_id uuid NOT NULL, local_id uuid NOT NULL, user_id uuid NOT NULL, device_id uuid NOT NULL,
 intent jsonb NOT NULL, remote_id uuid, PRIMARY KEY(tenant_id,local_id)
);
-- Receipts and unresolved conflicts are deliberately not deleted here. Retention
-- must be >=180 days; compacting feed requires retained_from + explicit reset.
