-- Derived delivery only. Field/GIS/Task business authority remains with owners.
CREATE SCHEMA offline_gis;
CREATE TABLE offline_gis.package (
 tenant_id uuid NOT NULL REFERENCES org.tenant(id),id uuid NOT NULL,user_id uuid NOT NULL,device_id uuid NOT NULL,session_id uuid NOT NULL,
 version bigint NOT NULL CHECK(version>0 AND version<=9007199254740991),selection jsonb NOT NULL,manifest jsonb NOT NULL,content_hash text NOT NULL,
 PRIMARY KEY(tenant_id,id),CHECK(id=device_id),FOREIGN KEY(tenant_id,device_id) REFERENCES sync.device(tenant_id,device_id)
);
CREATE TABLE offline_gis.field_projection (
 tenant_id uuid NOT NULL,package_id uuid NOT NULL,id uuid NOT NULL,target_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('FIELD','FIELD_SEASON')),
 version bigint NOT NULL,projection jsonb NOT NULL,PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,package_id,target_id),FOREIGN KEY(tenant_id,package_id) REFERENCES offline_gis.package(tenant_id,id)
);
CREATE TABLE offline_gis.audit (
 tenant_id uuid NOT NULL,package_id uuid NOT NULL,version bigint NOT NULL,actor_id uuid,action text NOT NULL,command_id uuid,source_event_id uuid,
 observed_at timestamptz NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),before_value jsonb,after_value jsonb NOT NULL,provenance jsonb NOT NULL,
 PRIMARY KEY(tenant_id,package_id,version),FOREIGN KEY(tenant_id,package_id) REFERENCES offline_gis.package(tenant_id,id)
);
CREATE FUNCTION offline_gis.immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'OFFLINE_GIS_IMMUTABLE_AUDIT';END $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE OR TRUNCATE ON offline_gis.audit FOR EACH STATEMENT EXECUTE FUNCTION offline_gis.immutable();
CREATE FUNCTION offline_gis.guard_package() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.device_id IS DISTINCT FROM OLD.device_id OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'OFFLINE_GIS_IDENTITY_OR_VERSION';END IF;RETURN NEW;END $$;
CREATE TRIGGER guard_package BEFORE UPDATE ON offline_gis.package FOR EACH ROW EXECUTE FUNCTION offline_gis.guard_package();
