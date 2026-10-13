# agroctl

`agroctl` is a dependency-free developer CLI for repository bootstrap,
migrations, seeding, and read-only verification.

Run it from any working directory with Node.js:

```sh
node /path/to/agro-platform/tools/agroctl/bin/agroctl.mjs --help
```

Commands:

- `bootstrap` starts the existing `apps/compose.yaml` services with Docker
  Compose. It builds missing images and leaves the services running.
- `migrate` delegates to `database/migrate.mjs`; provide `DATABASE_URL`, and
  optionally `PSQL_BIN`, in the environment.
- `seed` currently exits with code 3 and states that no provider is configured.
  The deterministic MINIMAL fixtures are owned by WP49-008; this command never
  claims to have seeded data.
- `verify` runs repository bootstrap validation, migration unit checks,
  OpenAPI/event validation, and generated-contract drift checks. It does not
  connect to or modify a database.

Exit codes: 0 success, 1 operation/verification failure, 2 invalid usage,
3 capability not configured, and 127 required executable unavailable.
