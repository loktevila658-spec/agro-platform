-- Expand-only task ownership. Read owner references through application queries.
CREATE SCHEMA tasks;
CREATE TABLE tasks.work_order (
 tenant_id uuid NOT NULL REFERENCES org.tenant(id),id uuid NOT NULL CHECK(substring(id::text,15,1)='7'),organization_id uuid NOT NULL,
 version bigint NOT NULL CHECK(version>0 AND version<=9007199254740991),status text NOT NULL CHECK(status IN ('DRAFT','PLANNED','ASSIGNED','ACCEPTED','IN_PROGRESS','PAUSED','COMPLETED','VERIFIED','CLOSED','RETURNED','CANCELLED','ABORTED')),
 definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object'),assignment jsonb NOT NULL DEFAULT '{}',executor_user_ids uuid[] NOT NULL DEFAULT '{}',target_provenance jsonb NOT NULL,
 started_at timestamptz,last_observed_at timestamptz,PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,organization_id) REFERENCES org.organization(tenant_id,id)
);
CREATE INDEX tasks_executor_scope ON tasks.work_order USING gin(executor_user_ids);
CREATE TABLE tasks.transition (
 tenant_id uuid NOT NULL,task_id uuid NOT NULL,version bigint NOT NULL,command_id uuid NOT NULL,action text NOT NULL,actor_id uuid NOT NULL,observed_at timestamptz NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 before_value jsonb,after_value jsonb NOT NULL,provenance jsonb NOT NULL,correlation_id text NOT NULL,causation_id text NOT NULL,
 PRIMARY KEY(tenant_id,task_id,version),UNIQUE(tenant_id,command_id),FOREIGN KEY(tenant_id,task_id) REFERENCES tasks.work_order(tenant_id,id)
);
CREATE TABLE tasks.operation_fact (
 tenant_id uuid NOT NULL,task_id uuid NOT NULL,id uuid NOT NULL,actual_qty numeric(18,6) NOT NULL CHECK(actual_qty>=0),uom varchar(16) NOT NULL,
 started_at timestamptz NOT NULL,completed_at timestamptz NOT NULL,actor_id uuid NOT NULL,evidence jsonb NOT NULL,provenance jsonb NOT NULL,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,task_id),FOREIGN KEY(tenant_id,task_id) REFERENCES tasks.work_order(tenant_id,id),CHECK(completed_at>=started_at)
);
CREATE TABLE tasks.outbox_event (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,event_name text NOT NULL,event_version text NOT NULL,producer text NOT NULL,entity_id uuid NOT NULL,actor_id uuid NOT NULL,
 correlation_id text NOT NULL,causation_id text NOT NULL,occurred_at timestamptz NOT NULL,payload jsonb NOT NULL,FOREIGN KEY(tenant_id,entity_id) REFERENCES tasks.work_order(tenant_id,id)
);
CREATE FUNCTION tasks.immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TASK_IMMUTABLE_HISTORY'; END $$;
CREATE TRIGGER immutable_transition BEFORE UPDATE OR DELETE OR TRUNCATE ON tasks.transition FOR EACH STATEMENT EXECUTE FUNCTION tasks.immutable();
CREATE TRIGGER immutable_fact BEFORE UPDATE OR DELETE OR TRUNCATE ON tasks.operation_fact FOR EACH STATEMENT EXECUTE FUNCTION tasks.immutable();
CREATE TRIGGER immutable_outbox BEFORE UPDATE OR DELETE OR TRUNCATE ON tasks.outbox_event FOR EACH STATEMENT EXECUTE FUNCTION tasks.immutable();
CREATE TRIGGER no_delete_order BEFORE DELETE OR TRUNCATE ON tasks.work_order FOR EACH STATEMENT EXECUTE FUNCTION tasks.immutable();
CREATE FUNCTION tasks.guard_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.definition IS DISTINCT FROM OLD.definition OR NEW.target_provenance IS DISTINCT FROM OLD.target_provenance OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'TASK_IMMUTABLE_IDENTITY_OR_VERSION';END IF;RETURN NEW;END $$;
CREATE TRIGGER guard_order BEFORE UPDATE ON tasks.work_order FOR EACH ROW EXECUTE FUNCTION tasks.guard_order();
ALTER TABLE platform_events.outbox_delivery DROP CONSTRAINT outbox_delivery_source_check;
ALTER TABLE platform_events.outbox_delivery ADD CONSTRAINT outbox_delivery_source_check CHECK(source IN ('org','identity','master-data','gis','land','farm','tasks'));
