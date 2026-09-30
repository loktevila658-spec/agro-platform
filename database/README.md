# Database migrations

WP49-003 establishes the forward-only PostgreSQL/PostGIS migration baseline.
Numbered files in `migrations/` are executable contracts and use the required
`NNNN_lower_snake_case.sql` naming format. Versions must start at `0001`, remain
contiguous, and are applied in numeric order.

Run migrations with externally supplied credentials:

```sh
DATABASE_URL='postgresql://user@host/database' node database/migrate.mjs
```

The runner serializes execution with a PostgreSQL advisory lock, records SHA-256
checksums in `platform_meta.schema_migrations`, applies each migration in its own
transaction, and rejects unknown, reordered, renamed, or modified applied
migrations. Re-running an already-current database is a safe no-op. Migrations
are forward-only; rollback uses an explicit restore or compensating migration,
not an improvised destructive `DOWN` script.

Migration `0001` enables PostGIS and exposes `platform_meta.schema_version`.
It creates no business-domain tables. The Local Server remains the only
authoritative migration target; this baseline introduces no multi-master or
cloud write authority.

The API endpoint `GET /system/schema-version` reports the applied version,
expected version, PostGIS version, and `current`/`behind`/`ahead` status. The API
requires `DATABASE_URL` at runtime and never stores or returns credentials.
