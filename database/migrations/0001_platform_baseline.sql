-- WP49-003: PostgreSQL/PostGIS platform baseline only.
-- Business-domain schemas and tables belong to later work packages.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE OR REPLACE VIEW platform_meta.schema_version AS
SELECT
  COALESCE(MAX(version), 0)::integer AS current_version,
  COUNT(*)::integer AS applied_migrations,
  MAX(applied_at) AS last_applied_at
FROM platform_meta.schema_migrations;

COMMENT ON VIEW platform_meta.schema_version IS
  'Current forward-only AgroPlatform database migration version.';
