-- Expand-only v11 -> v12. GIS owns geometry; future land/farm owners retain version refs.
CREATE SCHEMA gis;
CREATE TABLE gis.geometry_head (
 tenant_id uuid NOT NULL REFERENCES org.tenant(id),id uuid NOT NULL CHECK(substring(id::text,15,1)='7'),
 row_version bigint NOT NULL CHECK(row_version>0),PRIMARY KEY(tenant_id,id)
);
CREATE TABLE gis.import_batch (
 tenant_id uuid NOT NULL REFERENCES org.tenant(id),id uuid NOT NULL,object_key text NOT NULL,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),size_bytes integer NOT NULL CHECK(size_bytes>0),
 filename text NOT NULL,format text NOT NULL,options jsonb NOT NULL,parser_version text NOT NULL,layers jsonb NOT NULL,
 actor_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,id)
);
CREATE TABLE gis.feature_staging (
 tenant_id uuid NOT NULL,batch_id uuid NOT NULL,feature_index integer NOT NULL CHECK(feature_index>=0),
 source_feature_id text NOT NULL,layer text NOT NULL,source_crs text NOT NULL,original_geometry jsonb,
 geometry geometry(MultiPolygon,4326),properties jsonb NOT NULL,mapped_properties jsonb NOT NULL,issues jsonb NOT NULL,
 PRIMARY KEY(tenant_id,batch_id,feature_index),FOREIGN KEY(tenant_id,batch_id) REFERENCES gis.import_batch(tenant_id,id)
);
CREATE TABLE gis.geometry_version (
 tenant_id uuid NOT NULL,geometry_id uuid NOT NULL,id uuid NOT NULL CHECK(substring(id::text,15,1)='7'),revision bigint NOT NULL CHECK(revision>0),
 geometry geometry(MultiPolygon,4326) NOT NULL,area_ha double precision NOT NULL CHECK(area_ha>0),measurement_method text NOT NULL,
 source jsonb NOT NULL,reason text NOT NULL CHECK(length(btrim(reason))>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 import_batch_id uuid,feature_index integer,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,geometry_id,id),UNIQUE(tenant_id,geometry_id,revision),
 FOREIGN KEY(tenant_id,geometry_id) REFERENCES gis.geometry_head(tenant_id,id),
 FOREIGN KEY(tenant_id,import_batch_id,feature_index) REFERENCES gis.feature_staging(tenant_id,batch_id,feature_index),
 CHECK(ST_IsValid(geometry) AND NOT ST_IsEmpty(geometry) AND ST_NDims(geometry)=2),
 CHECK(ST_XMin(Box3D(geometry))>=-180 AND ST_XMax(Box3D(geometry))<=180 AND ST_YMin(Box3D(geometry))>=-90 AND ST_YMax(Box3D(geometry))<=90),
 CHECK((import_batch_id IS NULL)=(feature_index IS NULL))
);
CREATE INDEX geometry_version_gist ON gis.geometry_version USING gist(geometry);
CREATE INDEX geometry_version_tenant ON gis.geometry_version(tenant_id,geometry_id);
CREATE TABLE gis.geometry_decision (
 tenant_id uuid NOT NULL,geometry_id uuid NOT NULL,version_id uuid NOT NULL,status text NOT NULL CHECK(status IN ('APPROVED','REJECTED')),
 effective_at timestamptz,reason text NOT NULL CHECK(length(btrim(reason))>0),
 PRIMARY KEY(tenant_id,version_id),FOREIGN KEY(tenant_id,geometry_id,version_id) REFERENCES gis.geometry_version(tenant_id,geometry_id,id),
 CHECK((status='APPROVED')=(effective_at IS NOT NULL))
);
CREATE INDEX geometry_decision_effective ON gis.geometry_decision(tenant_id,geometry_id,effective_at DESC);
CREATE TABLE gis.audit (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,entity_id uuid NOT NULL,action text NOT NULL,actor_id uuid NOT NULL,
 before_value jsonb,after_value jsonb NOT NULL,reason text NOT NULL,correlation_id text NOT NULL,causation_id text NOT NULL,
 idempotency_key text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE gis.command_idempotency (
 tenant_id uuid NOT NULL REFERENCES org.tenant(id),idempotency_key text NOT NULL,action text NOT NULL,fingerprint text NOT NULL,response jsonb NOT NULL,
 PRIMARY KEY(tenant_id,idempotency_key)
);
CREATE TABLE gis.outbox_event (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,event_name text NOT NULL CHECK(event_name='gis.geometry.changed'),
 event_version text NOT NULL CHECK(event_version='1.0.0'),producer text NOT NULL CHECK(producer='gis'),entity_id uuid NOT NULL,
 actor_id uuid NOT NULL,correlation_id text NOT NULL,causation_id text NOT NULL,occurred_at timestamptz NOT NULL,payload jsonb NOT NULL
);
CREATE FUNCTION gis.immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'GIS_IMMUTABLE_HISTORY'; END $$;
CREATE TRIGGER immutable_version BEFORE UPDATE OR DELETE OR TRUNCATE ON gis.geometry_version FOR EACH STATEMENT EXECUTE FUNCTION gis.immutable();
CREATE TRIGGER immutable_decision BEFORE UPDATE OR DELETE OR TRUNCATE ON gis.geometry_decision FOR EACH STATEMENT EXECUTE FUNCTION gis.immutable();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE OR TRUNCATE ON gis.audit FOR EACH STATEMENT EXECUTE FUNCTION gis.immutable();
CREATE TRIGGER immutable_outbox BEFORE UPDATE OR DELETE OR TRUNCATE ON gis.outbox_event FOR EACH STATEMENT EXECUTE FUNCTION gis.immutable();
CREATE TRIGGER immutable_batch BEFORE UPDATE OR DELETE OR TRUNCATE ON gis.import_batch FOR EACH STATEMENT EXECUTE FUNCTION gis.immutable();
CREATE TRIGGER immutable_staging BEFORE UPDATE OR DELETE OR TRUNCATE ON gis.feature_staging FOR EACH STATEMENT EXECUTE FUNCTION gis.immutable();
CREATE TRIGGER no_delete_head BEFORE DELETE OR TRUNCATE ON gis.geometry_head FOR EACH STATEMENT EXECUTE FUNCTION gis.immutable();
CREATE FUNCTION gis.guard_head() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.row_version<>OLD.row_version+1 THEN RAISE EXCEPTION 'GIS_IMMUTABLE_IDENTITY_OR_VERSION';END IF;RETURN NEW;
END $$;
CREATE TRIGGER guard_head BEFORE UPDATE ON gis.geometry_head FOR EACH ROW EXECUTE FUNCTION gis.guard_head();
ALTER TABLE platform_events.outbox_delivery DROP CONSTRAINT outbox_delivery_source_check;
ALTER TABLE platform_events.outbox_delivery ADD CONSTRAINT outbox_delivery_source_check CHECK(source IN ('org','identity','master-data','gis'));
