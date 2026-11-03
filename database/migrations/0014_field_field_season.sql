-- Expand-only 13 -> 14. Geometry and parcel owners retain authority.
CREATE SCHEMA farm;
CREATE TABLE farm.entity (
 tenant_id uuid NOT NULL REFERENCES org.tenant(id),id uuid NOT NULL CHECK(substring(id::text,15,1)='7'),
 kind text NOT NULL CHECK(kind IN ('FIELD','SEASON','FIELD_SEASON')),organization_id uuid NOT NULL,
 row_version bigint NOT NULL CHECK(row_version>0),current_revision_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,id,organization_id),UNIQUE(tenant_id,id,kind),
 FOREIGN KEY(tenant_id,organization_id) REFERENCES org.organization(tenant_id,id)
);
CREATE TABLE farm.field (
 tenant_id uuid NOT NULL,id uuid NOT NULL,organization_id uuid NOT NULL,code varchar(64) NOT NULL CHECK(length(btrim(code))>0),
 kind text NOT NULL DEFAULT 'FIELD' CHECK(kind='FIELD'),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,organization_id,code),UNIQUE(tenant_id,id,organization_id),
 FOREIGN KEY(tenant_id,id,kind) REFERENCES farm.entity(tenant_id,id,kind),
 FOREIGN KEY(tenant_id,id,organization_id) REFERENCES farm.entity(tenant_id,id,organization_id)
);
CREATE TABLE farm.agricultural_season (
 tenant_id uuid NOT NULL,id uuid NOT NULL,organization_id uuid NOT NULL,business_year smallint NOT NULL,
 kind text NOT NULL DEFAULT 'SEASON' CHECK(kind='SEASON'),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,id,organization_id,business_year),
 FOREIGN KEY(tenant_id,id,kind) REFERENCES farm.entity(tenant_id,id,kind),
 FOREIGN KEY(tenant_id,id,organization_id) REFERENCES farm.entity(tenant_id,id,organization_id)
);
CREATE TABLE farm.field_season (
 tenant_id uuid NOT NULL,id uuid NOT NULL,organization_id uuid NOT NULL,field_id uuid NOT NULL,season_id uuid NOT NULL,field_revision_id uuid NOT NULL,season_revision_id uuid NOT NULL,business_year smallint NOT NULL,
 kind text NOT NULL DEFAULT 'FIELD_SEASON' CHECK(kind='FIELD_SEASON'),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,field_id,season_id),UNIQUE(tenant_id,field_id,business_year),
 FOREIGN KEY(tenant_id,id,kind) REFERENCES farm.entity(tenant_id,id,kind),
 FOREIGN KEY(tenant_id,id,organization_id) REFERENCES farm.entity(tenant_id,id,organization_id),
 FOREIGN KEY(tenant_id,field_id,organization_id) REFERENCES farm.field(tenant_id,id,organization_id),
 FOREIGN KEY(tenant_id,season_id,organization_id,business_year) REFERENCES farm.agricultural_season(tenant_id,id,organization_id,business_year)
);
CREATE TABLE farm.revision (
 tenant_id uuid NOT NULL,entity_id uuid NOT NULL,id uuid NOT NULL CHECK(substring(id::text,15,1)='7'),revision bigint NOT NULL CHECK(revision>0),previous_revision_id uuid,
 effective_at timestamptz NOT NULL,metadata jsonb NOT NULL CHECK(jsonb_typeof(metadata)='object'),geometry_provenance jsonb,
 actor_id uuid NOT NULL,reason text NOT NULL CHECK(length(btrim(reason))>0),correlation_id text NOT NULL,causation_id text NOT NULL,idempotency_key text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,entity_id,id),UNIQUE(tenant_id,entity_id,revision,id),UNIQUE(tenant_id,entity_id,revision),
 FOREIGN KEY(tenant_id,entity_id) REFERENCES farm.entity(tenant_id,id),
 FOREIGN KEY(tenant_id,entity_id,previous_revision_id) REFERENCES farm.revision(tenant_id,entity_id,id),
 CHECK((revision=1)=(previous_revision_id IS NULL)),
 CHECK((metadata->>'geometryVersionId' IS NULL)=(geometry_provenance IS NULL)),
 CHECK((metadata->>'geometryVersionId') IS NOT DISTINCT FROM (geometry_provenance->>'id'))
);
ALTER TABLE farm.field_season ADD CONSTRAINT seasonal_field_revision FOREIGN KEY(tenant_id,field_id,field_revision_id) REFERENCES farm.revision(tenant_id,entity_id,id);
ALTER TABLE farm.field_season ADD CONSTRAINT seasonal_season_revision FOREIGN KEY(tenant_id,season_id,season_revision_id) REFERENCES farm.revision(tenant_id,entity_id,id);
CREATE INDEX farm_revision_effective ON farm.revision(tenant_id,entity_id,effective_at DESC,revision DESC);
ALTER TABLE farm.entity ADD CONSTRAINT farm_current_revision FOREIGN KEY(tenant_id,id,row_version,current_revision_id) REFERENCES farm.revision(tenant_id,entity_id,revision,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE farm.field_site (
 tenant_id uuid NOT NULL,revision_id uuid NOT NULL,organization_id uuid NOT NULL,site_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,revision_id),FOREIGN KEY(tenant_id,revision_id) REFERENCES farm.revision(tenant_id,id),
 FOREIGN KEY(tenant_id,organization_id) REFERENCES org.organization(tenant_id,id),
 FOREIGN KEY(site_id,organization_id) REFERENCES org.site(id,organization_id)
);
CREATE TABLE farm.allocation (
 tenant_id uuid NOT NULL,field_id uuid NOT NULL,revision_id uuid NOT NULL,land_plot_id uuid NOT NULL,valid_from timestamptz NOT NULL,valid_to timestamptz,
 source text NOT NULL,reason text NOT NULL,area_ha numeric(14,4) CHECK(area_ha>=0),geometry_version_id uuid,geometry_provenance jsonb,land_provenance jsonb NOT NULL,
 PRIMARY KEY(tenant_id,revision_id,land_plot_id,valid_from),CHECK(valid_to IS NULL OR valid_to>=valid_from),
 FOREIGN KEY(tenant_id,field_id) REFERENCES farm.field(tenant_id,id) DEFERRABLE INITIALLY DEFERRED,FOREIGN KEY(tenant_id,field_id,revision_id) REFERENCES farm.revision(tenant_id,entity_id,id),
 FOREIGN KEY(tenant_id,land_plot_id) REFERENCES land.land_plot(tenant_id,id),
 CHECK((geometry_version_id IS NULL)=(geometry_provenance IS NULL)),CHECK(geometry_version_id::text IS NOT DISTINCT FROM (geometry_provenance->>'id'))
);
CREATE TABLE farm.lineage (
 tenant_id uuid NOT NULL,from_field_id uuid NOT NULL,to_field_id uuid NOT NULL,operation text NOT NULL CHECK(operation IN ('SPLIT','MERGE')),effective_at timestamptz NOT NULL,
 actor_id uuid NOT NULL,reason text NOT NULL,correlation_id text NOT NULL,causation_id text NOT NULL,idempotency_key text NOT NULL,
 PRIMARY KEY(tenant_id,from_field_id,to_field_id),CHECK(from_field_id<>to_field_id),
 FOREIGN KEY(tenant_id,from_field_id) REFERENCES farm.field(tenant_id,id),FOREIGN KEY(tenant_id,to_field_id) REFERENCES farm.field(tenant_id,id)
);
CREATE TABLE farm.audit (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,entity_id uuid NOT NULL,action text NOT NULL,actor_id uuid NOT NULL,before_value jsonb,after_value jsonb NOT NULL,
 reason text NOT NULL,correlation_id text NOT NULL,causation_id text NOT NULL,idempotency_key text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,entity_id) REFERENCES farm.entity(tenant_id,id)
);
CREATE TABLE farm.command_idempotency (
 tenant_id uuid NOT NULL REFERENCES org.tenant(id),idempotency_key text NOT NULL,action text NOT NULL,fingerprint text NOT NULL,response jsonb NOT NULL,PRIMARY KEY(tenant_id,idempotency_key)
);
CREATE TABLE farm.outbox_event (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,event_name text NOT NULL CHECK(event_name='farm.entity.changed'),event_version text NOT NULL CHECK(event_version='1.0.0'),producer text NOT NULL CHECK(producer='farm'),
 entity_id uuid NOT NULL,actor_id uuid NOT NULL,correlation_id text NOT NULL,causation_id text NOT NULL,occurred_at timestamptz NOT NULL,payload jsonb NOT NULL,
 FOREIGN KEY(tenant_id,entity_id) REFERENCES farm.entity(tenant_id,id)
);
CREATE FUNCTION farm.immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FARM_IMMUTABLE_HISTORY'; END $$;
CREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE OR TRUNCATE ON farm.revision FOR EACH STATEMENT EXECUTE FUNCTION farm.immutable();
CREATE TRIGGER immutable_allocation BEFORE UPDATE OR DELETE OR TRUNCATE ON farm.allocation FOR EACH STATEMENT EXECUTE FUNCTION farm.immutable();
CREATE TRIGGER immutable_lineage BEFORE UPDATE OR DELETE OR TRUNCATE ON farm.lineage FOR EACH STATEMENT EXECUTE FUNCTION farm.immutable();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE OR TRUNCATE ON farm.audit FOR EACH STATEMENT EXECUTE FUNCTION farm.immutable();
CREATE TRIGGER immutable_outbox BEFORE UPDATE OR DELETE OR TRUNCATE ON farm.outbox_event FOR EACH STATEMENT EXECUTE FUNCTION farm.immutable();
CREATE TRIGGER immutable_field BEFORE UPDATE OR DELETE OR TRUNCATE ON farm.field FOR EACH STATEMENT EXECUTE FUNCTION farm.immutable();
CREATE TRIGGER immutable_season BEFORE UPDATE OR DELETE OR TRUNCATE ON farm.agricultural_season FOR EACH STATEMENT EXECUTE FUNCTION farm.immutable();
CREATE TRIGGER immutable_field_season BEFORE UPDATE OR DELETE OR TRUNCATE ON farm.field_season FOR EACH STATEMENT EXECUTE FUNCTION farm.immutable();
CREATE TRIGGER immutable_site BEFORE UPDATE OR DELETE OR TRUNCATE ON farm.field_site FOR EACH STATEMENT EXECUTE FUNCTION farm.immutable();
CREATE TRIGGER no_delete_entity BEFORE DELETE OR TRUNCATE ON farm.entity FOR EACH STATEMENT EXECUTE FUNCTION farm.immutable();
CREATE FUNCTION farm.guard_entity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.row_version<>OLD.row_version+1 OR NEW.current_revision_id=OLD.current_revision_id THEN RAISE EXCEPTION 'FARM_IMMUTABLE_IDENTITY_OR_VERSION';END IF;RETURN NEW;
END $$;
CREATE TRIGGER guard_entity BEFORE UPDATE ON farm.entity FOR EACH ROW EXECUTE FUNCTION farm.guard_entity();
CREATE FUNCTION farm.guard_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.previous_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM farm.revision WHERE tenant_id=NEW.tenant_id AND entity_id=NEW.entity_id AND id=NEW.previous_revision_id AND revision=NEW.revision-1) THEN RAISE EXCEPTION 'FARM_INVALID_CORRECTION_CHAIN';END IF;RETURN NEW;
END $$;
CREATE TRIGGER guard_revision BEFORE INSERT ON farm.revision FOR EACH ROW EXECUTE FUNCTION farm.guard_revision();
CREATE FUNCTION farm.guard_lineage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 -- Serialize tenant lineage changes, including direct concurrent insert attempts.
 PERFORM pg_advisory_xact_lock(hashtextextended('farm-lineage/'||NEW.tenant_id::text,0));
 IF EXISTS(WITH RECURSIVE descendants(id) AS (
  SELECT to_field_id FROM farm.lineage WHERE tenant_id=NEW.tenant_id AND from_field_id=NEW.to_field_id
  UNION SELECT l.to_field_id FROM farm.lineage l JOIN descendants d ON l.from_field_id=d.id WHERE l.tenant_id=NEW.tenant_id
 ) SELECT 1 FROM descendants WHERE id=NEW.from_field_id) THEN RAISE EXCEPTION 'FARM_LINEAGE_CYCLE';END IF;
 IF (SELECT organization_id FROM farm.field WHERE tenant_id=NEW.tenant_id AND id=NEW.from_field_id) IS DISTINCT FROM (SELECT organization_id FROM farm.field WHERE tenant_id=NEW.tenant_id AND id=NEW.to_field_id) THEN RAISE EXCEPTION 'FARM_LINEAGE_ORGANIZATION';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_lineage BEFORE INSERT ON farm.lineage FOR EACH ROW EXECUTE FUNCTION farm.guard_lineage();
ALTER TABLE platform_events.outbox_delivery DROP CONSTRAINT outbox_delivery_source_check;
ALTER TABLE platform_events.outbox_delivery ADD CONSTRAINT outbox_delivery_source_check CHECK(source IN ('org','identity','master-data','gis','land','farm'));
