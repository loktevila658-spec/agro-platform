-- WP49-011: local-primary tenant and organization hierarchy facts.
CREATE SCHEMA IF NOT EXISTS org;

CREATE TABLE org.tenant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 64),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  timezone text NOT NULL CHECK (length(btrim(timezone)) BETWEEN 1 AND 64),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid NOT NULL,
  UNIQUE (code),
  UNIQUE (id)
);

CREATE TABLE org.organization (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES org.tenant(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 64),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  organization_type text NOT NULL CHECK (organization_type IN ('LEGAL_ENTITY', 'SOLE_PROPRIETOR', 'FARM', 'OPERATING_UNIT')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid NOT NULL,
  UNIQUE (tenant_id, code),
  UNIQUE (id, tenant_id)
);

CREATE TABLE org.organization_unit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  parent_id uuid,
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 64),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  unit_type text NOT NULL CHECK (length(btrim(unit_type)) BETWEEN 1 AND 64),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid NOT NULL,
  UNIQUE (organization_id, code),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id, tenant_id)
    REFERENCES org.organization(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (parent_id, organization_id)
    REFERENCES org.organization_unit(id, organization_id) ON DELETE RESTRICT,
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE FUNCTION org.reject_organization_unit_cycle() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    WITH RECURSIVE ancestors(id, parent_id) AS (
      SELECT id, parent_id
      FROM org.organization_unit
      WHERE id = NEW.parent_id AND organization_id = NEW.organization_id
      UNION
      SELECT parent.id, parent.parent_id
      FROM org.organization_unit parent
      JOIN ancestors child ON parent.id = child.parent_id
      WHERE parent.organization_id = NEW.organization_id
    )
    SELECT 1 FROM ancestors WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'organization unit hierarchy cycle' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_unit_cycle_guard
BEFORE INSERT OR UPDATE OF parent_id, organization_id ON org.organization_unit
FOR EACH ROW EXECUTE FUNCTION org.reject_organization_unit_cycle();

CREATE TABLE org.site (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  organization_unit_id uuid,
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 64),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  site_type text NOT NULL CHECK (site_type IN ('BASE', 'FARM', 'WAREHOUSE_SITE', 'WEIGH_SITE', 'PRODUCTION_SITE', 'REPAIR_BASE', 'FUEL_SITE')),
  address text,
  timezone text NOT NULL CHECK (length(btrim(timezone)) BETWEEN 1 AND 64),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid NOT NULL,
  UNIQUE (organization_id, code),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id, tenant_id)
    REFERENCES org.organization(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_unit_id, organization_id)
    REFERENCES org.organization_unit(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX organization_unit_parent_idx ON org.organization_unit(organization_id, parent_id);
CREATE INDEX site_tenant_organization_idx ON org.site(tenant_id, organization_id);

CREATE TABLE org.command_idempotency (
  scope_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  command_name text NOT NULL,
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (scope_id, idempotency_key)
);

CREATE TABLE org.audit_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES org.tenant(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  correlation_id text NOT NULL,
  causation_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  change jsonb NOT NULL CHECK (jsonb_typeof(change) = 'object')
);

CREATE TABLE org.outbox_event (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES org.tenant(id) ON DELETE RESTRICT,
  event_name text NOT NULL,
  event_version text NOT NULL CHECK (event_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  producer text NOT NULL CHECK (producer = 'org'),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  correlation_id text NOT NULL,
  causation_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX org_outbox_pending_idx ON org.outbox_event(created_at, id);
CREATE INDEX org_audit_entity_idx ON org.audit_entry(tenant_id, entity_type, entity_id, occurred_at);
