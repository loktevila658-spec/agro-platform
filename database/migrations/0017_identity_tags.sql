-- QR issuance owns references, never target facts. Additive schema17.
CREATE SCHEMA identity_tags;
CREATE TABLE identity_tags.tag (
 tenant_id uuid NOT NULL REFERENCES org.tenant(id),id uuid NOT NULL CHECK(substring(id::text,15,1)='7'),
 entity_type text NOT NULL CHECK(entity_type='Material'),entity_id uuid NOT NULL CHECK(substring(entity_id::text,15,1)='7'),
 payload varchar(512) NOT NULL,version integer NOT NULL DEFAULT 1 CHECK(version=1),status text NOT NULL DEFAULT 'ACTIVE' CHECK(status='ACTIVE'),
 actor_id uuid NOT NULL,idempotency_key varchar(128) NOT NULL,correlation_id varchar(128) NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,idempotency_key)
);
CREATE INDEX tag_entity ON identity_tags.tag(tenant_id,entity_type,entity_id);
CREATE TABLE identity_tags.audit (
 tenant_id uuid NOT NULL,tag_id uuid NOT NULL,actor_id uuid NOT NULL,correlation_id varchar(128) NOT NULL,
 action text NOT NULL DEFAULT 'ISSUE' CHECK(action='ISSUE'),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,tag_id),FOREIGN KEY(tenant_id,tag_id) REFERENCES identity_tags.tag(tenant_id,id)
);
CREATE TABLE identity_tags.outbox_event (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES org.tenant(id),event_name text NOT NULL CHECK(event_name='qr_code.created'),event_version text NOT NULL,producer text NOT NULL,
 entity_id uuid NOT NULL,actor_id uuid NOT NULL,correlation_id text NOT NULL,causation_id text NOT NULL,occurred_at timestamptz NOT NULL,payload jsonb NOT NULL
);
CREATE FUNCTION identity_tags.immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QR_IMMUTABLE_PROVENANCE'; END $$;
CREATE TRIGGER immutable_tag BEFORE UPDATE OR DELETE OR TRUNCATE ON identity_tags.tag FOR EACH STATEMENT EXECUTE FUNCTION identity_tags.immutable();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE OR TRUNCATE ON identity_tags.audit FOR EACH STATEMENT EXECUTE FUNCTION identity_tags.immutable();
CREATE TRIGGER immutable_outbox BEFORE UPDATE OR DELETE OR TRUNCATE ON identity_tags.outbox_event FOR EACH STATEMENT EXECUTE FUNCTION identity_tags.immutable();
ALTER TABLE platform_events.outbox_delivery DROP CONSTRAINT outbox_delivery_source_check;
ALTER TABLE platform_events.outbox_delivery ADD CONSTRAINT outbox_delivery_source_check CHECK(source IN ('org','identity','master-data','gis','land','farm','tasks','identity-tags'));
