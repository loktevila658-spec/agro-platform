-- Expand-only v10->11: DOC47 canonical Material belongs to master-data, not inventory.
CREATE SCHEMA master_data;
CREATE TABLE master_data.source_policy (
 tenant_id uuid NOT NULL REFERENCES org.tenant(id), version integer NOT NULL CHECK(version>0),
 config jsonb NOT NULL, fingerprint text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,version)
);
CREATE TABLE master_data.unit_of_measure (
 tenant_id uuid NOT NULL REFERENCES org.tenant(id), id uuid NOT NULL CHECK(substring(id::text,15,1)='7'),
 code varchar(16) NOT NULL CHECK(length(btrim(code))>0), name varchar(128) NOT NULL CHECK(length(btrim(name))>0),
 dimension text NOT NULL CHECK(dimension IN ('MASS','VOLUME','AREA','COUNT')), precision smallint NOT NULL CHECK(precision BETWEEN 0 AND 6),
 row_version bigint NOT NULL CHECK(row_version>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_by uuid NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(id), UNIQUE(tenant_id,code)
);
CREATE TABLE master_data.material (
 tenant_id uuid NOT NULL REFERENCES org.tenant(id), id uuid NOT NULL CHECK(substring(id::text,15,1)='7'), organization_id uuid,
 code varchar(64) NOT NULL CHECK(length(btrim(code))>0),name varchar(255) NOT NULL CHECK(length(btrim(name))>0),
 item_type text NOT NULL CHECK(item_type IN ('SEED','FERTILIZER','PPP','FUEL','SPARE','RAW','PACKAGING','FINISHED')),
 base_uom varchar(16) NOT NULL,active boolean NOT NULL DEFAULT true,accounting_code varchar(128),gtin varchar(32),
 row_version bigint NOT NULL CHECK(row_version>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_by uuid NOT NULL,
 PRIMARY KEY(tenant_id,id),UNIQUE(id),
 FOREIGN KEY(organization_id,tenant_id) REFERENCES org.organization(id,tenant_id),
 FOREIGN KEY(tenant_id,base_uom) REFERENCES master_data.unit_of_measure(tenant_id,code)
);
CREATE UNIQUE INDEX material_tenant_code ON master_data.material(tenant_id,code) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX material_organization_code ON master_data.material(tenant_id,organization_id,code) WHERE organization_id IS NOT NULL;
CREATE TABLE master_data.revision (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,entity_type text NOT NULL CHECK(entity_type IN ('Material','UnitOfMeasure')),entity_id uuid NOT NULL,
 version bigint NOT NULL CHECK(version>0),previous_revision uuid REFERENCES master_data.revision(id),
 snapshot jsonb NOT NULL,reason text NOT NULL CHECK(length(btrim(reason))>0),actor_id uuid NOT NULL,command_id uuid NOT NULL,
 correlation_id text NOT NULL,causation_id text NOT NULL,provenance jsonb NOT NULL,policy_version integer NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(tenant_id,entity_type,entity_id,version),
 FOREIGN KEY(tenant_id,policy_version) REFERENCES master_data.source_policy(tenant_id,version),
 CHECK((version=1 AND previous_revision IS NULL) OR (version>1 AND previous_revision IS NOT NULL))
);
CREATE TABLE master_data.command_idempotency (
 tenant_id uuid NOT NULL REFERENCES org.tenant(id),idempotency_key text NOT NULL,action text NOT NULL,fingerprint text NOT NULL,response jsonb NOT NULL,
 PRIMARY KEY(tenant_id,idempotency_key)
);
CREATE TABLE master_data.outbox_event (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,event_name text NOT NULL CHECK(event_name IN ('master_data.unit.changed','master_data.material.changed')),
 event_version text NOT NULL CHECK(event_version='1.0.0'),producer text NOT NULL CHECK(producer='master-data'),
 entity_id uuid NOT NULL,actor_id uuid NOT NULL,correlation_id text NOT NULL,causation_id text NOT NULL,occurred_at timestamptz NOT NULL,payload jsonb NOT NULL
);
CREATE FUNCTION master_data.immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'MASTER_DATA_IMMUTABLE_HISTORY'; END $$;
CREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE OR TRUNCATE ON master_data.revision FOR EACH STATEMENT EXECUTE FUNCTION master_data.immutable();
CREATE TRIGGER immutable_policy BEFORE UPDATE OR DELETE OR TRUNCATE ON master_data.source_policy FOR EACH STATEMENT EXECUTE FUNCTION master_data.immutable();
CREATE TRIGGER immutable_outbox BEFORE UPDATE OR DELETE OR TRUNCATE ON master_data.outbox_event FOR EACH STATEMENT EXECUTE FUNCTION master_data.immutable();
CREATE TRIGGER no_delete_material BEFORE DELETE OR TRUNCATE ON master_data.material FOR EACH STATEMENT EXECUTE FUNCTION master_data.immutable();
CREATE TRIGGER no_delete_unit BEFORE DELETE OR TRUNCATE ON master_data.unit_of_measure FOR EACH STATEMENT EXECUTE FUNCTION master_data.immutable();
CREATE FUNCTION master_data.guard_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.row_version<>OLD.row_version+1 THEN RAISE EXCEPTION 'MASTER_DATA_IDENTITY_OR_VERSION_IMMUTABLE'; END IF;
 IF TG_TABLE_NAME='material' THEN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'MASTER_DATA_SCOPE_IMMUTABLE'; END IF;
 ELSE
  IF NEW.code IS DISTINCT FROM OLD.code THEN RAISE EXCEPTION 'MASTER_DATA_UNIT_CODE_IMMUTABLE'; END IF;
  IF (NEW.dimension IS DISTINCT FROM OLD.dimension OR NEW.precision IS DISTINCT FROM OLD.precision) AND EXISTS(SELECT 1 FROM master_data.material WHERE tenant_id=OLD.tenant_id AND base_uom=OLD.code) THEN RAISE EXCEPTION 'MASTER_DATA_UNIT_IN_USE'; END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER guard_material BEFORE UPDATE ON master_data.material FOR EACH ROW EXECUTE FUNCTION master_data.guard_identity();
CREATE TRIGGER guard_unit BEFORE UPDATE ON master_data.unit_of_measure FOR EACH ROW EXECUTE FUNCTION master_data.guard_identity();
-- Framework owners' narrow metadata expansions: no foreign authoritative facts written.
ALTER TABLE platform_events.outbox_delivery DROP CONSTRAINT outbox_delivery_source_check;
ALTER TABLE platform_events.outbox_delivery ADD CONSTRAINT outbox_delivery_source_check CHECK(source IN ('org','identity','master-data'));
-- Multiple external aliases may resolve to one canonical UUID; external key remains unique.
ALTER TABLE integrations.external_link DROP CONSTRAINT external_link_tenant_id_profile_id_entity_type_local_id_key;
