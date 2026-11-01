-- Expand-only v7->v8. All connector state belongs to integrations.
CREATE SCHEMA integrations;
CREATE TABLE integrations.profile (
 tenant_id uuid NOT NULL, id text NOT NULL, version integer NOT NULL CHECK(version>0),
 config jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id,version)
);
CREATE TABLE integrations.job (
 tenant_id uuid NOT NULL, id uuid NOT NULL, profile_id text NOT NULL, profile_version integer NOT NULL,
 direction text NOT NULL CHECK(direction IN ('INBOUND','OUTBOUND')), idempotency_key text NOT NULL,
 envelope jsonb NOT NULL, fingerprint text NOT NULL, actor jsonb NOT NULL,
 state text NOT NULL DEFAULT 'QUEUED' CHECK(state IN ('QUEUED','SENDING','RETRYING','SENT','ACCEPTED','ACTION_REQUIRED','DEAD_LETTER')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), cycle_attempts integer NOT NULL DEFAULT 0 CHECK(cycle_attempts>=0), unknown_outcome boolean NOT NULL DEFAULT false,
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(), last_error text, result jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,profile_id,direction,idempotency_key),
 FOREIGN KEY(tenant_id,profile_id,profile_version) REFERENCES integrations.profile(tenant_id,id,version)
);
CREATE INDEX integration_due ON integrations.job(next_attempt_at) WHERE state IN ('QUEUED','RETRYING','SENDING','SENT');
CREATE TABLE integrations.attempt (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, number integer NOT NULL,
 phase text NOT NULL, outcome text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,job_id,number,phase), FOREIGN KEY(tenant_id,job_id) REFERENCES integrations.job(tenant_id,id)
);
CREATE TABLE integrations.external_link (
 tenant_id uuid NOT NULL, profile_id text NOT NULL, entity_type text NOT NULL, external_id text NOT NULL, local_id text NOT NULL,
 PRIMARY KEY(tenant_id,profile_id,entity_type,external_id), UNIQUE(tenant_id,profile_id,entity_type,local_id)
);
CREATE TABLE integrations.link_revision (
 tenant_id uuid NOT NULL, profile_id text NOT NULL, entity_type text NOT NULL, external_id text NOT NULL,
 revision integer NOT NULL, job_id uuid NOT NULL, provenance jsonb NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,profile_id,entity_type,external_id,revision), UNIQUE(tenant_id,job_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES integrations.job(tenant_id,id),
 FOREIGN KEY(tenant_id,profile_id,entity_type,external_id) REFERENCES integrations.external_link(tenant_id,profile_id,entity_type,external_id)
);
CREATE TABLE integrations.audit_entry (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tenant_id uuid NOT NULL, job_id uuid,
 actor jsonb NOT NULL, action text NOT NULL, detail jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Internal transactional lifecycle journal, not a new public domain event catalog.
CREATE TABLE integrations.outbox (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tenant_id uuid NOT NULL, job_id uuid NOT NULL,
 state text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION integrations.immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable integration history'; END $$;
CREATE TRIGGER immutable_profile BEFORE UPDATE OR DELETE OR TRUNCATE ON integrations.profile FOR EACH STATEMENT EXECUTE FUNCTION integrations.immutable_record();
CREATE TRIGGER immutable_attempt BEFORE UPDATE OR DELETE OR TRUNCATE ON integrations.attempt FOR EACH STATEMENT EXECUTE FUNCTION integrations.immutable_record();
CREATE TRIGGER immutable_link BEFORE UPDATE OR DELETE OR TRUNCATE ON integrations.external_link FOR EACH STATEMENT EXECUTE FUNCTION integrations.immutable_record();
CREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE OR TRUNCATE ON integrations.link_revision FOR EACH STATEMENT EXECUTE FUNCTION integrations.immutable_record();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE OR TRUNCATE ON integrations.audit_entry FOR EACH STATEMENT EXECUTE FUNCTION integrations.immutable_record();
CREATE TRIGGER immutable_outbox BEFORE UPDATE OR DELETE OR TRUNCATE ON integrations.outbox FOR EACH STATEMENT EXECUTE FUNCTION integrations.immutable_record();
CREATE FUNCTION integrations.protect_envelope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.tenant_id<>OLD.tenant_id OR NEW.id<>OLD.id OR NEW.profile_id<>OLD.profile_id OR NEW.profile_version<>OLD.profile_version OR NEW.direction<>OLD.direction OR NEW.idempotency_key<>OLD.idempotency_key OR NEW.envelope<>OLD.envelope OR NEW.fingerprint<>OLD.fingerprint OR NEW.actor<>OLD.actor OR NEW.created_at<>OLD.created_at THEN
 RAISE EXCEPTION 'immutable integration envelope'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_envelope BEFORE UPDATE ON integrations.job FOR EACH ROW EXECUTE FUNCTION integrations.protect_envelope();
CREATE TRIGGER retained_envelope BEFORE DELETE OR TRUNCATE ON integrations.job FOR EACH STATEMENT EXECUTE FUNCTION integrations.immutable_record();
