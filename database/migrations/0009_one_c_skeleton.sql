-- Expand-only v8->v9. Owned integration metadata, never accounting/business authority.
CREATE TABLE integrations.one_c_binding (
 tenant_id uuid NOT NULL, profile_id text NOT NULL, profile_version integer NOT NULL,
 config jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,profile_id,profile_version),
 FOREIGN KEY(tenant_id,profile_id,profile_version) REFERENCES integrations.profile(tenant_id,id,version)
);
-- Durable simulated external system: fixtures only, explicitly not a real 1C receipt.
CREATE TABLE integrations.one_c_mock_receipt (
 tenant_id uuid NOT NULL, profile_id text NOT NULL, idempotency_key text NOT NULL,
 intent_hash text NOT NULL, result jsonb NOT NULL, provenance jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,profile_id,idempotency_key)
);
CREATE TABLE integrations.one_c_reconciliation (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL, profile_id text NOT NULL, profile_version integer NOT NULL,
 observation_key text NOT NULL, intent_hash text NOT NULL,
 observation jsonb NOT NULL, differences jsonb NOT NULL CHECK(jsonb_typeof(differences)='array'),
 state text GENERATED ALWAYS AS (CASE WHEN differences='[]'::jsonb THEN 'MATCHED' ELSE 'OPEN' END) STORED,
 actor jsonb NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,profile_id,profile_version,observation_key),
 FOREIGN KEY(tenant_id,profile_id,profile_version) REFERENCES integrations.one_c_binding(tenant_id,profile_id,profile_version)
);
-- Internal journal only. No new public event/catalog or domain process.
CREATE TABLE integrations.one_c_reconciliation_outbox (
 reconciliation_id bigint PRIMARY KEY REFERENCES integrations.one_c_reconciliation(id),
 tenant_id uuid NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_one_c_binding BEFORE UPDATE OR DELETE OR TRUNCATE ON integrations.one_c_binding FOR EACH STATEMENT EXECUTE FUNCTION integrations.immutable_record();
CREATE TRIGGER immutable_one_c_receipt BEFORE UPDATE OR DELETE OR TRUNCATE ON integrations.one_c_mock_receipt FOR EACH STATEMENT EXECUTE FUNCTION integrations.immutable_record();
CREATE TRIGGER immutable_one_c_reconciliation BEFORE UPDATE OR DELETE OR TRUNCATE ON integrations.one_c_reconciliation FOR EACH STATEMENT EXECUTE FUNCTION integrations.immutable_record();
CREATE TRIGGER immutable_one_c_reconciliation_outbox BEFORE UPDATE OR DELETE OR TRUNCATE ON integrations.one_c_reconciliation_outbox FOR EACH STATEMENT EXECUTE FUNCTION integrations.immutable_record();
