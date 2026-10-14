-- WP49-014: isolated append-only evidence and correction/supersession links.
-- Existing org.audit_entry and identity.security_audit remain independently owned.
CREATE SCHEMA platform_audit;

CREATE TABLE platform_audit.evidence (
  evidence_id uuid PRIMARY KEY,
  owner_module text NOT NULL CHECK (length(btrim(owner_module)) BETWEEN 1 AND 200),
  entity_type text NOT NULL CHECK (length(btrim(entity_type)) BETWEEN 1 AND 200),
  entity_id text NOT NULL CHECK (length(btrim(entity_id)) BETWEEN 1 AND 200),
  action text NOT NULL CHECK (length(btrim(action)) BETWEEN 1 AND 200),
  actor_id uuid NOT NULL,
  correlation_id text NOT NULL CHECK (length(btrim(correlation_id)) BETWEEN 1 AND 200),
  provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'array'),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX platform_audit_evidence_owner_entity_idx
  ON platform_audit.evidence(owner_module, entity_type, entity_id, recorded_at);

CREATE TABLE platform_audit.correction_link (
  link_id uuid PRIMARY KEY,
  original_evidence_id uuid NOT NULL REFERENCES platform_audit.evidence(evidence_id) ON DELETE RESTRICT,
  replacement_evidence_id uuid NOT NULL REFERENCES platform_audit.evidence(evidence_id) ON DELETE RESTRICT,
  relation text NOT NULL CHECK (relation IN ('CORRECTION', 'SUPERSESSION')),
  actor_id uuid NOT NULL,
  correlation_id text NOT NULL CHECK (length(btrim(correlation_id)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (original_evidence_id <> replacement_evidence_id),
  UNIQUE (original_evidence_id, replacement_evidence_id, relation)
);

CREATE INDEX platform_audit_correction_original_idx
  ON platform_audit.correction_link(original_evidence_id, created_at);

CREATE FUNCTION platform_audit.reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit evidence and correction links are append-only: %', TG_TABLE_NAME
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER evidence_append_only
BEFORE UPDATE OR DELETE ON platform_audit.evidence
FOR EACH ROW EXECUTE FUNCTION platform_audit.reject_mutation();

CREATE TRIGGER evidence_truncate_append_only
BEFORE TRUNCATE ON platform_audit.evidence
FOR EACH STATEMENT EXECUTE FUNCTION platform_audit.reject_mutation();

CREATE TRIGGER correction_link_append_only
BEFORE UPDATE OR DELETE ON platform_audit.correction_link
FOR EACH ROW EXECUTE FUNCTION platform_audit.reject_mutation();

CREATE TRIGGER correction_link_truncate_append_only
BEFORE TRUNCATE ON platform_audit.correction_link
FOR EACH STATEMENT EXECUTE FUNCTION platform_audit.reject_mutation();
