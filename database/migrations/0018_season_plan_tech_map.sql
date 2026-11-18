-- Expand-only planning authority. Foreign references resolve through owner contracts.
CREATE SCHEMA agronomy;
CREATE TABLE agronomy.entity (
 tenant_id uuid NOT NULL,id uuid NOT NULL,organization_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('SEASON_PLAN','TEMPLATE','TECH_MAP')),
 version bigint NOT NULL CHECK(version>0),current_revision_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(organization_id,tenant_id) REFERENCES org.organization(id,tenant_id)
);
CREATE TABLE agronomy.revision (
 tenant_id uuid NOT NULL,entity_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL CHECK(version>0),previous_revision_id uuid,
 state text NOT NULL CHECK(state IN ('DRAFT','APPROVED','PUBLISHED')),data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),source_refs jsonb NOT NULL,
 author_id uuid NOT NULL,approver_id uuid,effective_at timestamptz NOT NULL,reason text NOT NULL CHECK(length(reason)>0),actor_id uuid NOT NULL,
 correlation_id text NOT NULL,causation_id text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,entity_id,id),UNIQUE(tenant_id,entity_id,version,id),UNIQUE(tenant_id,entity_id,version),
 FOREIGN KEY(tenant_id,entity_id) REFERENCES agronomy.entity(tenant_id,id),
 FOREIGN KEY(tenant_id,entity_id,previous_revision_id) REFERENCES agronomy.revision(tenant_id,entity_id,id),
 CHECK((version=1 AND previous_revision_id IS NULL) OR (version>1 AND previous_revision_id IS NOT NULL)),
 CHECK((state='DRAFT' AND approver_id IS NULL) OR (state IN ('APPROVED','PUBLISHED') AND approver_id IS NOT NULL))
);
ALTER TABLE agronomy.entity ADD CONSTRAINT agronomy_current_revision FOREIGN KEY(tenant_id,id,version,current_revision_id) REFERENCES agronomy.revision(tenant_id,entity_id,version,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE agronomy.planned_operation (
 tenant_id uuid NOT NULL,map_id uuid NOT NULL,revision_id uuid NOT NULL,id uuid NOT NULL,field_season_id uuid NOT NULL,definition jsonb NOT NULL,
 PRIMARY KEY(tenant_id,revision_id,id),FOREIGN KEY(tenant_id,map_id,revision_id) REFERENCES agronomy.revision(tenant_id,entity_id,id)
);
CREATE TABLE agronomy.resource_demand (
 tenant_id uuid NOT NULL,revision_id uuid NOT NULL,operation_id uuid NOT NULL,resource_index integer NOT NULL CHECK(resource_index>=0),
 kind text NOT NULL CHECK(kind IN ('MATERIAL','MACHINE','LABOR')),reference_id uuid NOT NULL,quantity numeric(18,6) NOT NULL CHECK(quantity>=0),unit varchar(16) NOT NULL,inputs jsonb NOT NULL,
 PRIMARY KEY(tenant_id,revision_id,operation_id,resource_index),FOREIGN KEY(tenant_id,revision_id,operation_id) REFERENCES agronomy.planned_operation(tenant_id,revision_id,id)
);
CREATE TABLE agronomy.command_idempotency (
 tenant_id uuid NOT NULL,idempotency_key varchar(128) NOT NULL,actor_id uuid NOT NULL,fingerprint text NOT NULL,response jsonb NOT NULL,
 PRIMARY KEY(tenant_id,idempotency_key)
);
CREATE TABLE agronomy.audit (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,entity_id uuid NOT NULL,revision_id uuid NOT NULL,action text NOT NULL,actor_id uuid NOT NULL,
 before_value jsonb,after_value jsonb NOT NULL,diff jsonb NOT NULL,reason text NOT NULL,idempotency_key varchar(128) NOT NULL,correlation_id text NOT NULL,causation_id text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(tenant_id,entity_id,revision_id) REFERENCES agronomy.revision(tenant_id,entity_id,id)
);
CREATE TABLE agronomy.outbox_event (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,event_name text NOT NULL,event_version text NOT NULL CHECK(event_version='1.0.0'),producer text NOT NULL CHECK(producer='agronomy'),
 entity_id uuid NOT NULL,actor_id uuid NOT NULL,correlation_id text NOT NULL,causation_id text NOT NULL,occurred_at timestamptz NOT NULL,payload jsonb NOT NULL,
 FOREIGN KEY(tenant_id,entity_id) REFERENCES agronomy.entity(tenant_id,id)
);
CREATE FUNCTION agronomy.immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'AGRONOMY_IMMUTABLE_HISTORY'; END $$;
CREATE FUNCTION agronomy.guard_head() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.version<>OLD.version+1 OR NEW.current_revision_id=OLD.current_revision_id THEN RAISE EXCEPTION 'AGRONOMY_HEAD_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_head BEFORE UPDATE ON agronomy.entity FOR EACH ROW EXECUTE FUNCTION agronomy.guard_head();
CREATE TRIGGER preserve_head BEFORE DELETE OR TRUNCATE ON agronomy.entity FOR EACH STATEMENT EXECUTE FUNCTION agronomy.immutable();
CREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE OR TRUNCATE ON agronomy.revision FOR EACH STATEMENT EXECUTE FUNCTION agronomy.immutable();
CREATE TRIGGER immutable_operation BEFORE UPDATE OR DELETE OR TRUNCATE ON agronomy.planned_operation FOR EACH STATEMENT EXECUTE FUNCTION agronomy.immutable();
CREATE TRIGGER immutable_demand BEFORE UPDATE OR DELETE OR TRUNCATE ON agronomy.resource_demand FOR EACH STATEMENT EXECUTE FUNCTION agronomy.immutable();
CREATE TRIGGER immutable_receipt BEFORE UPDATE OR DELETE OR TRUNCATE ON agronomy.command_idempotency FOR EACH STATEMENT EXECUTE FUNCTION agronomy.immutable();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE OR TRUNCATE ON agronomy.audit FOR EACH STATEMENT EXECUTE FUNCTION agronomy.immutable();
CREATE TRIGGER immutable_outbox BEFORE UPDATE OR DELETE OR TRUNCATE ON agronomy.outbox_event FOR EACH STATEMENT EXECUTE FUNCTION agronomy.immutable();
ALTER TABLE platform_events.outbox_delivery DROP CONSTRAINT outbox_delivery_source_check;
ALTER TABLE platform_events.outbox_delivery ADD CONSTRAINT outbox_delivery_source_check CHECK(source IN ('org','identity','master-data','gis','land','farm','tasks','identity-tags','agronomy'));
