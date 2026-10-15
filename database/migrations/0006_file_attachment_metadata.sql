CREATE SCHEMA files;

CREATE TABLE files.attachment (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  owner_ref text NOT NULL CHECK (length(trim(owner_ref)) BETWEEN 1 AND 300),
  evidence_type text NOT NULL CHECK (length(trim(evidence_type)) BETWEEN 1 AND 100),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 9007199254740991),
  declared_mime text NOT NULL CHECK (declared_mime IN ('image/jpeg', 'image/png', 'application/pdf', 'audio/mpeg', 'audio/mp4')),
  actual_mime text CHECK (actual_mime IN ('image/jpeg', 'image/png', 'application/pdf', 'audio/mpeg', 'audio/mp4')),
  sha256 text CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  object_key text CHECK (object_key IS NULL OR (object_key !~ '(^/|\\|\.\.)' AND object_key !~ '^[A-Za-z][A-Za-z0-9+.-]*:')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  state text NOT NULL CHECK (state IN ('QUARANTINED', 'AVAILABLE', 'REJECTED')),
  scan_status text NOT NULL DEFAULT 'PENDING' CHECK (scan_status IN ('PENDING', 'CLEAN', 'INFECTED')),
  completed_at timestamptz,
  malware_scanned_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, idempotency_key),
  CHECK (state <> 'AVAILABLE' OR (scan_status = 'CLEAN' AND malware_scanned_at IS NOT NULL AND sha256 IS NOT NULL AND actual_mime IS NOT NULL AND object_key IS NOT NULL)),
  CHECK (scan_status <> 'INFECTED' OR state = 'REJECTED')
);

CREATE INDEX attachment_owner_ref_idx ON files.attachment (tenant_id, owner_ref, created_at DESC);

CREATE TABLE files.upload_part (
  attachment_id uuid NOT NULL REFERENCES files.attachment(id),
  part_number integer NOT NULL CHECK (part_number > 0),
  offset_bytes bigint NOT NULL CHECK (offset_bytes >= 0),
  object_key text NOT NULL CHECK (object_key !~ '(^/|\\|\.\.)' AND object_key !~ '^[A-Za-z][A-Za-z0-9+.-]*:'),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  part_status text NOT NULL DEFAULT 'STORED' CHECK (part_status = 'STORED'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (attachment_id, part_number),
  UNIQUE (attachment_id, offset_bytes)
);

CREATE TABLE files.audit_entry (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  attachment_id uuid NOT NULL REFERENCES files.attachment(id),
  actor_id uuid NOT NULL,
  correlation_id text,
  event_type text NOT NULL CHECK (event_type IN ('UPLOAD_INITIALIZED', 'PART_STORED', 'OBJECT_QUARANTINED', 'MALWARE_SCAN_CLEAN', 'MALWARE_DETECTED', 'CONTENT_REJECTED')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX files_audit_attachment_idx ON files.audit_entry (attachment_id, audit_id);

CREATE FUNCTION files.reject_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'file audit entries are immutable';
END;
$$;
CREATE TRIGGER files_audit_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON files.audit_entry
  FOR EACH STATEMENT EXECUTE FUNCTION files.reject_audit_mutation();

CREATE FUNCTION files.guard_attachment_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state <> 'QUARANTINED' AND NEW.state <> OLD.state THEN
    RAISE EXCEPTION 'terminal attachment state cannot be changed';
  END IF;
  IF NEW.state = 'AVAILABLE' AND NEW.scan_status <> 'CLEAN' THEN
    RAISE EXCEPTION 'attachment cannot be available before a clean malware scan';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attachment_transition_guard
  BEFORE UPDATE ON files.attachment
  FOR EACH ROW EXECUTE FUNCTION files.guard_attachment_transition();
