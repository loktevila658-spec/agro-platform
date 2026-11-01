-- Expand-only. Local and Holding use distinct DB/credentials; no foreign writes.
CREATE SCHEMA replication;
CREATE TABLE replication.local_clock (
 tenant_id text PRIMARY KEY, sequence bigint NOT NULL DEFAULT 0 CHECK(sequence>=0),
 ack_sequence bigint NOT NULL DEFAULT 0 CHECK(ack_sequence>=0 AND ack_sequence<=sequence),
 binding jsonb, next_send_at timestamptz NOT NULL DEFAULT clock_timestamp(), last_ack_at timestamptz
);
CREATE TABLE replication.local_outbox (
 tenant_id text NOT NULL REFERENCES replication.local_clock(tenant_id), sequence bigint NOT NULL CHECK(sequence>0),
 event_id text NOT NULL, change jsonb NOT NULL, hash text NOT NULL,
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','SENDING','ACKED','RETRY_WAIT','DEAD_LETTER')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), cycle_attempts integer NOT NULL DEFAULT 0 CHECK(cycle_attempts>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(), last_error text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), acked_at timestamptz,
 PRIMARY KEY(tenant_id,sequence), UNIQUE(tenant_id,event_id)
);
CREATE TABLE replication.journal (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tenant_id text NOT NULL, sequence bigint NOT NULL,
 action text NOT NULL, detail jsonb NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,sequence) REFERENCES replication.local_outbox(tenant_id,sequence)
);
CREATE TABLE replication.cloud_stream (
 tenant_id text NOT NULL, site_id text NOT NULL, installation_id text NOT NULL,
 sequence bigint NOT NULL DEFAULT 0 CHECK(sequence>=0), last_received_at timestamptz,
 PRIMARY KEY(tenant_id,site_id,installation_id)
);
CREATE TABLE replication.cloud_history (
 tenant_id text NOT NULL, site_id text NOT NULL, installation_id text NOT NULL, sequence bigint NOT NULL CHECK(sequence>0),
 event_id text NOT NULL, hash text NOT NULL, change jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,site_id,installation_id,sequence), UNIQUE(tenant_id,site_id,installation_id,event_id),
 FOREIGN KEY(tenant_id,site_id,installation_id) REFERENCES replication.cloud_stream(tenant_id,site_id,installation_id)
);
CREATE TABLE replication.cloud_read_model (
 tenant_id text NOT NULL, site_id text NOT NULL, installation_id text NOT NULL,
 aggregate_type text NOT NULL, aggregate_id text NOT NULL, revision bigint NOT NULL CHECK(revision>0),
 event_id text NOT NULL, tombstone boolean NOT NULL, change jsonb NOT NULL,
 PRIMARY KEY(tenant_id,site_id,installation_id,aggregate_type,aggregate_id),
 FOREIGN KEY(tenant_id,site_id,installation_id,event_id) REFERENCES replication.cloud_history(tenant_id,site_id,installation_id,event_id)
);
CREATE FUNCTION replication.immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'replication history is immutable'; END $$;
CREATE TRIGGER immutable_cloud_history BEFORE UPDATE OR DELETE OR TRUNCATE ON replication.cloud_history FOR EACH STATEMENT EXECUTE FUNCTION replication.immutable_record();
CREATE TRIGGER immutable_replication_journal BEFORE UPDATE OR DELETE OR TRUNCATE ON replication.journal FOR EACH STATEMENT EXECUTE FUNCTION replication.immutable_record();
CREATE FUNCTION replication.guard_local_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'local replication history is retained'; END IF;
 IF (NEW.tenant_id,NEW.sequence,NEW.event_id,NEW.change,NEW.hash,NEW.created_at) IS DISTINCT FROM (OLD.tenant_id,OLD.sequence,OLD.event_id,OLD.change,OLD.hash,OLD.created_at) THEN
  RAISE EXCEPTION 'local replication content is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_local_content BEFORE UPDATE OR DELETE ON replication.local_outbox FOR EACH ROW EXECUTE FUNCTION replication.guard_local_history();
CREATE TRIGGER no_local_truncate BEFORE TRUNCATE ON replication.local_outbox FOR EACH STATEMENT EXECUTE FUNCTION replication.immutable_record();
