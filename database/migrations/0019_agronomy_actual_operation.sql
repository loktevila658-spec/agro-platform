-- Expand-only actual authority; foreign references resolve via owner ports.
CREATE TABLE agronomy.actual_fact (
 tenant_id uuid NOT NULL,id uuid NOT NULL,organization_id uuid NOT NULL,field_season_id uuid NOT NULL,task_completion_id uuid,
 version bigint NOT NULL CHECK(version>0),current_revision_id uuid NOT NULL,confirmed_revision_id uuid,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,task_completion_id),FOREIGN KEY(organization_id,tenant_id) REFERENCES org.organization(id,tenant_id)
);
CREATE TABLE agronomy.actual_revision (
 tenant_id uuid NOT NULL,fact_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL CHECK(version>0),previous_revision_id uuid,
 state text NOT NULL CHECK(state IN ('CAPTURED','PENDING_CONFIRMATION','CONFIRMED','REJECTED','CORRECTED_VERSION')),
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),source_refs jsonb NOT NULL,provenance jsonb NOT NULL,author_id uuid NOT NULL,actor_id uuid NOT NULL,reason text NOT NULL CHECK(length(reason)>0),command_id uuid NOT NULL,correlation_id text NOT NULL,causation_id text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,fact_id,id),UNIQUE(tenant_id,fact_id,version,id),UNIQUE(tenant_id,fact_id,version),UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,fact_id) REFERENCES agronomy.actual_fact(tenant_id,id),FOREIGN KEY(tenant_id,fact_id,previous_revision_id) REFERENCES agronomy.actual_revision(tenant_id,fact_id,id),
 CHECK((version=1 AND previous_revision_id IS NULL AND state='CAPTURED') OR (version>1 AND previous_revision_id IS NOT NULL))
);
ALTER TABLE agronomy.actual_fact ADD CONSTRAINT actual_current_revision FOREIGN KEY(tenant_id,id,version,current_revision_id) REFERENCES agronomy.actual_revision(tenant_id,fact_id,version,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE agronomy.actual_fact ADD CONSTRAINT actual_confirmed_revision FOREIGN KEY(tenant_id,id,confirmed_revision_id) REFERENCES agronomy.actual_revision(tenant_id,fact_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE agronomy.actual_audit (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,fact_id uuid NOT NULL,revision_id uuid NOT NULL,action text NOT NULL,actor_id uuid NOT NULL,before_value jsonb,after_value jsonb NOT NULL,reason text NOT NULL,command_id uuid NOT NULL,correlation_id text NOT NULL,causation_id text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(tenant_id,fact_id,revision_id) REFERENCES agronomy.actual_revision(tenant_id,fact_id,id)
);
CREATE TABLE agronomy.actual_outbox_event (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,event_name text NOT NULL,event_version text NOT NULL CHECK(event_version='1.0.0'),producer text NOT NULL CHECK(producer='agronomy-actual'),entity_id uuid NOT NULL,actor_id uuid NOT NULL,correlation_id text NOT NULL,causation_id text NOT NULL,occurred_at timestamptz NOT NULL,payload jsonb NOT NULL,FOREIGN KEY(tenant_id,entity_id) REFERENCES agronomy.actual_fact(tenant_id,id)
);
CREATE FUNCTION agronomy.guard_actual_head() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.field_season_id IS DISTINCT FROM OLD.field_season_id OR NEW.task_completion_id IS DISTINCT FROM OLD.task_completion_id OR NEW.version<>OLD.version+1 OR NEW.current_revision_id=OLD.current_revision_id THEN RAISE EXCEPTION 'ACTUAL_HEAD_IMMUTABLE'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER guard_actual_head BEFORE UPDATE ON agronomy.actual_fact FOR EACH ROW EXECUTE FUNCTION agronomy.guard_actual_head();
CREATE TRIGGER preserve_actual_head BEFORE DELETE OR TRUNCATE ON agronomy.actual_fact FOR EACH STATEMENT EXECUTE FUNCTION agronomy.immutable();
CREATE TRIGGER immutable_actual_revision BEFORE UPDATE OR DELETE OR TRUNCATE ON agronomy.actual_revision FOR EACH STATEMENT EXECUTE FUNCTION agronomy.immutable();
CREATE TRIGGER immutable_actual_audit BEFORE UPDATE OR DELETE OR TRUNCATE ON agronomy.actual_audit FOR EACH STATEMENT EXECUTE FUNCTION agronomy.immutable();
CREATE TRIGGER immutable_actual_outbox BEFORE UPDATE OR DELETE OR TRUNCATE ON agronomy.actual_outbox_event FOR EACH STATEMENT EXECUTE FUNCTION agronomy.immutable();
ALTER TABLE platform_events.outbox_delivery DROP CONSTRAINT outbox_delivery_source_check;
ALTER TABLE platform_events.outbox_delivery ADD CONSTRAINT outbox_delivery_source_check CHECK(source IN ('org','identity','master-data','gis','land','farm','tasks','identity-tags','agronomy','agronomy-actual'));
