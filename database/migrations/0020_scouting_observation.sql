-- Expand-only; references resolve through owner application services.
CREATE SCHEMA scouting;
CREATE TABLE scouting.observation (
 tenant_id uuid NOT NULL,id uuid NOT NULL,organization_id uuid NOT NULL,field_season_id uuid NOT NULL,
 version bigint NOT NULL CHECK(version>0),current_revision_id uuid NOT NULL,task_id uuid,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,task_id),FOREIGN KEY(organization_id,tenant_id) REFERENCES org.organization(id,tenant_id)
);
CREATE TABLE scouting.revision (
 tenant_id uuid NOT NULL,observation_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL CHECK(version>0),previous_revision_id uuid,
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),source_refs jsonb NOT NULL,provenance jsonb NOT NULL,author_id uuid NOT NULL,actor_id uuid NOT NULL,
 observed_at timestamptz NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),reason text NOT NULL CHECK(length(reason)>0),action text NOT NULL CHECK(action IN ('Capture','Correct','CreateWork')),command_id uuid NOT NULL,task_id uuid,geom geography(Point,4326),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,observation_id,id),UNIQUE(tenant_id,observation_id,version,id),UNIQUE(tenant_id,observation_id,version),UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,observation_id) REFERENCES scouting.observation(tenant_id,id),FOREIGN KEY(tenant_id,observation_id,previous_revision_id) REFERENCES scouting.revision(tenant_id,observation_id,id),
 CHECK((version=1 AND previous_revision_id IS NULL AND action='Capture') OR (version>1 AND previous_revision_id IS NOT NULL AND action<>'Capture'))
);
ALTER TABLE scouting.observation ADD CONSTRAINT scouting_current_revision FOREIGN KEY(tenant_id,id,version,current_revision_id) REFERENCES scouting.revision(tenant_id,observation_id,version,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX scouting_context ON scouting.observation(tenant_id,organization_id,field_season_id,id);
CREATE INDEX scouting_point ON scouting.revision USING gist(geom);
CREATE TABLE scouting.audit (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,observation_id uuid NOT NULL,revision_id uuid NOT NULL,action text NOT NULL,actor_id uuid NOT NULL,before_value jsonb,after_value jsonb NOT NULL,reason text NOT NULL,command_id uuid NOT NULL,correlation_id text NOT NULL,causation_id text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(tenant_id,observation_id,revision_id) REFERENCES scouting.revision(tenant_id,observation_id,id)
);
CREATE TABLE scouting.outbox_event (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,event_name text NOT NULL CHECK(event_name='scouting.observation.changed'),event_version text NOT NULL CHECK(event_version='1.0.0'),producer text NOT NULL CHECK(producer='scouting'),entity_id uuid NOT NULL,actor_id uuid NOT NULL,correlation_id text NOT NULL,causation_id text NOT NULL,occurred_at timestamptz NOT NULL,payload jsonb NOT NULL,FOREIGN KEY(tenant_id,entity_id) REFERENCES scouting.observation(tenant_id,id)
);
CREATE FUNCTION scouting.immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SCOUTING_IMMUTABLE'; END $$;
CREATE FUNCTION scouting.guard_head() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.field_season_id IS DISTINCT FROM OLD.field_season_id OR (OLD.task_id IS NOT NULL AND NEW.task_id IS DISTINCT FROM OLD.task_id) OR NEW.version<>OLD.version+1 OR NEW.current_revision_id=OLD.current_revision_id THEN RAISE EXCEPTION 'SCOUTING_HEAD_IMMUTABLE'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER guard_head BEFORE UPDATE ON scouting.observation FOR EACH ROW EXECUTE FUNCTION scouting.guard_head();
CREATE TRIGGER preserve_head BEFORE DELETE OR TRUNCATE ON scouting.observation FOR EACH STATEMENT EXECUTE FUNCTION scouting.immutable();
CREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE OR TRUNCATE ON scouting.revision FOR EACH STATEMENT EXECUTE FUNCTION scouting.immutable();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE OR TRUNCATE ON scouting.audit FOR EACH STATEMENT EXECUTE FUNCTION scouting.immutable();
CREATE TRIGGER immutable_outbox BEFORE UPDATE OR DELETE OR TRUNCATE ON scouting.outbox_event FOR EACH STATEMENT EXECUTE FUNCTION scouting.immutable();
ALTER TABLE platform_events.outbox_delivery DROP CONSTRAINT outbox_delivery_source_check;
ALTER TABLE platform_events.outbox_delivery ADD CONSTRAINT outbox_delivery_source_check CHECK(source IN ('org','identity','master-data','gis','land','farm','tasks','identity-tags','agronomy','agronomy-actual','scouting'));
