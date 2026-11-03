-- Expand-only schema12 -> 13. Land owns metadata; GIS retains all geometry authority.
CREATE SCHEMA land;
CREATE TABLE land.land_plot (
 tenant_id uuid NOT NULL REFERENCES org.tenant(id),
 id uuid NOT NULL CHECK(substring(id::text,15,1)='7'),organization_id uuid,
 status text NOT NULL CHECK(status='ACTIVE'),row_version bigint NOT NULL CHECK(row_version>0),current_snapshot_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,organization_id) REFERENCES org.organization(tenant_id,id)
);
CREATE TABLE land.snapshot (
 tenant_id uuid NOT NULL,land_plot_id uuid NOT NULL,id uuid NOT NULL CHECK(substring(id::text,15,1)='7'),revision bigint NOT NULL CHECK(revision>0),previous_snapshot_id uuid,
 metadata jsonb NOT NULL CHECK(jsonb_typeof(metadata)='object'),geometry_version_id uuid,geometry_provenance jsonb,
 actor_id uuid NOT NULL,reason text NOT NULL CHECK(length(btrim(reason))>0),correlation_id text NOT NULL,causation_id text NOT NULL,idempotency_key text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,id),
 UNIQUE(tenant_id,land_plot_id,id),UNIQUE(tenant_id,land_plot_id,revision),UNIQUE(tenant_id,land_plot_id,revision,id),
 FOREIGN KEY(tenant_id,land_plot_id) REFERENCES land.land_plot(tenant_id,id),
 FOREIGN KEY(tenant_id,land_plot_id,previous_snapshot_id) REFERENCES land.snapshot(tenant_id,land_plot_id,id),
 CHECK((revision=1)=(previous_snapshot_id IS NULL)),
 CHECK((geometry_version_id IS NULL)=(geometry_provenance IS NULL)),
 CHECK((metadata->>'geometryVersionId') IS NOT DISTINCT FROM geometry_version_id::text)
);
ALTER TABLE land.land_plot ADD CONSTRAINT land_current_snapshot FOREIGN KEY(tenant_id,id,row_version,current_snapshot_id) REFERENCES land.snapshot(tenant_id,land_plot_id,revision,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE land.cadastral_reference (
 tenant_id uuid NOT NULL,registry_source text NOT NULL,profile text NOT NULL,profile_version text NOT NULL,
 cadastral_number varchar(32) NOT NULL,captured_at timestamptz NOT NULL,land_plot_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,registry_source,profile,profile_version,cadastral_number,captured_at),
 FOREIGN KEY(tenant_id,land_plot_id) REFERENCES land.land_plot(tenant_id,id)
);
CREATE TABLE land.audit (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,land_plot_id uuid NOT NULL,actor_id uuid NOT NULL,
 before_value jsonb,after_value jsonb NOT NULL,reason text NOT NULL,correlation_id text NOT NULL,causation_id text NOT NULL,idempotency_key text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(tenant_id,land_plot_id) REFERENCES land.land_plot(tenant_id,id)
);
CREATE TABLE land.command_idempotency (
 tenant_id uuid NOT NULL REFERENCES org.tenant(id),idempotency_key text NOT NULL,action text NOT NULL,fingerprint text NOT NULL,response jsonb NOT NULL,
 PRIMARY KEY(tenant_id,idempotency_key)
);
CREATE TABLE land.outbox_event (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,event_name text NOT NULL CHECK(event_name='land.plot.changed'),event_version text NOT NULL CHECK(event_version='1.0.0'),
 producer text NOT NULL CHECK(producer='land'),entity_id uuid NOT NULL,actor_id uuid NOT NULL,correlation_id text NOT NULL,causation_id text NOT NULL,occurred_at timestamptz NOT NULL,payload jsonb NOT NULL,
 FOREIGN KEY(tenant_id,entity_id) REFERENCES land.land_plot(tenant_id,id)
);
CREATE FUNCTION land.immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'LAND_IMMUTABLE_HISTORY'; END $$;
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE OR TRUNCATE ON land.snapshot FOR EACH STATEMENT EXECUTE FUNCTION land.immutable();
CREATE TRIGGER immutable_reference BEFORE UPDATE OR DELETE OR TRUNCATE ON land.cadastral_reference FOR EACH STATEMENT EXECUTE FUNCTION land.immutable();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE OR TRUNCATE ON land.audit FOR EACH STATEMENT EXECUTE FUNCTION land.immutable();
CREATE TRIGGER immutable_outbox BEFORE UPDATE OR DELETE OR TRUNCATE ON land.outbox_event FOR EACH STATEMENT EXECUTE FUNCTION land.immutable();
CREATE TRIGGER no_delete_plot BEFORE DELETE OR TRUNCATE ON land.land_plot FOR EACH STATEMENT EXECUTE FUNCTION land.immutable();
CREATE FUNCTION land.guard_plot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.status IS DISTINCT FROM OLD.status OR NEW.row_version<>OLD.row_version+1 OR NEW.current_snapshot_id=OLD.current_snapshot_id THEN RAISE EXCEPTION 'LAND_IMMUTABLE_IDENTITY_OR_VERSION';END IF;RETURN NEW;
END $$;
CREATE TRIGGER guard_plot BEFORE UPDATE ON land.land_plot FOR EACH ROW EXECUTE FUNCTION land.guard_plot();
CREATE FUNCTION land.guard_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.previous_snapshot_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM land.snapshot WHERE tenant_id=NEW.tenant_id AND land_plot_id=NEW.land_plot_id AND id=NEW.previous_snapshot_id AND revision=NEW.revision-1) THEN RAISE EXCEPTION 'LAND_INVALID_CORRECTION_CHAIN';END IF;RETURN NEW;
END $$;
CREATE TRIGGER guard_snapshot BEFORE INSERT ON land.snapshot FOR EACH ROW EXECUTE FUNCTION land.guard_snapshot();
ALTER TABLE platform_events.outbox_delivery DROP CONSTRAINT outbox_delivery_source_check;
ALTER TABLE platform_events.outbox_delivery ADD CONSTRAINT outbox_delivery_source_check CHECK(source IN ('org','identity','master-data','gis','land'));
