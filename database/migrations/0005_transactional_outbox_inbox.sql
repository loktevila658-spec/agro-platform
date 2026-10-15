CREATE SCHEMA platform_events;

CREATE TABLE platform_events.outbox_delivery (
  source text NOT NULL CHECK (source IN ('org', 'identity')),
  event_id uuid NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_until timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (source, event_id)
);

CREATE INDEX outbox_delivery_pending_idx
  ON platform_events.outbox_delivery (next_attempt_at, source, event_id)
  WHERE delivered_at IS NULL;

CREATE TABLE platform_events.inbox_event (
  consumer_name text NOT NULL CHECK (length(trim(consumer_name)) > 0),
  event_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (consumer_name, event_id)
);
