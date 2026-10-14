-- WP49-012: local identity, authentication sessions and narrow security history.
CREATE SCHEMA IF NOT EXISTS identity;

CREATE TABLE identity.user_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES org.tenant(id) ON DELETE RESTRICT,
  login text NOT NULL CHECK (length(btrim(login)) BETWEEN 1 AND 200),
  password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
  mfa_required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (login),
  UNIQUE (id, tenant_id)
);

CREATE TABLE identity.registered_device (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, user_id, tenant_id),
  FOREIGN KEY (user_id, tenant_id) REFERENCES identity.user_account(id, tenant_id) ON DELETE RESTRICT
);

CREATE TABLE identity.mfa_authenticator (
  user_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  encrypted_secret bytea NOT NULL,
  nonce bytea NOT NULL CHECK (octet_length(nonce) = 12),
  auth_tag bytea NOT NULL CHECK (octet_length(auth_tag) = 16),
  key_reference text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (user_id, tenant_id) REFERENCES identity.user_account(id, tenant_id) ON DELETE RESTRICT
);

CREATE TABLE identity.mfa_challenge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_sha256 char(64) NOT NULL UNIQUE CHECK (challenge_sha256 ~ '^[a-f0-9]{64}$'),
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  device_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (user_id, tenant_id) REFERENCES identity.user_account(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (device_id, user_id, tenant_id) REFERENCES identity.registered_device(id, user_id, tenant_id) ON DELETE RESTRICT
);

CREATE TABLE identity.auth_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  device_id uuid NOT NULL,
  auth_strength text NOT NULL CHECK (auth_strength IN ('password', 'password+mfa')),
  refresh_family_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason text,
  FOREIGN KEY (user_id, tenant_id) REFERENCES identity.user_account(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (device_id, user_id, tenant_id) REFERENCES identity.registered_device(id, user_id, tenant_id) ON DELETE RESTRICT
);

CREATE TABLE identity.refresh_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES identity.auth_session(id) ON DELETE RESTRICT,
  token_sha256 char(64) NOT NULL UNIQUE CHECK (token_sha256 ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX refresh_token_session_idx ON identity.refresh_token(session_id, created_at);

CREATE TABLE identity.login_throttle (
  login_sha256 char(64) PRIMARY KEY CHECK (login_sha256 ~ '^[a-f0-9]{64}$'),
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  next_allowed_at timestamptz NOT NULL DEFAULT '-infinity',
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE identity.security_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_no bigserial NOT NULL UNIQUE,
  tenant_id uuid REFERENCES org.tenant(id) ON DELETE RESTRICT,
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'anonymous')),
  actor_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure')),
  reason_code text NOT NULL,
  correlation_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  previous_sha256 char(64) NOT NULL CHECK (previous_sha256 ~ '^[a-f0-9]{64}$'),
  event_hmac_sha256 char(64) NOT NULL CHECK (event_hmac_sha256 ~ '^[a-f0-9]{64}$'),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  CHECK ((actor_type = 'anonymous' AND actor_id IS NULL) OR (actor_type = 'user' AND actor_id IS NOT NULL))
);
CREATE INDEX identity_security_audit_tenant_time_idx ON identity.security_audit(tenant_id, occurred_at);

CREATE TABLE identity.security_audit_head (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  last_event_hmac_sha256 char(64) NOT NULL CHECK (last_event_hmac_sha256 ~ '^[a-f0-9]{64}$')
);
INSERT INTO identity.security_audit_head(singleton,last_event_hmac_sha256) VALUES (true, repeat('0',64));

CREATE FUNCTION identity.reject_security_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'identity security audit is append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER security_audit_append_only
BEFORE UPDATE OR DELETE ON identity.security_audit
FOR EACH ROW EXECUTE FUNCTION identity.reject_security_audit_mutation();

CREATE TABLE identity.outbox_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL CHECK (event_name IN ('security.session_created', 'security.session_revoked')),
  event_version text NOT NULL CHECK (event_version = '1.0.0'),
  producer text NOT NULL CHECK (producer = 'identity'),
  entity_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  actor_id uuid,
  correlation_id text NOT NULL,
  causation_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX identity_outbox_pending_idx ON identity.outbox_event(created_at, id);
