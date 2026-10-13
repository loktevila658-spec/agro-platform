# Demo fixture loader

This package currently supports only the versioned `MINIMAL` profile. It is a
small bootstrap profile with one synthetic enterprise, site, field, machine,
warehouse, and production line. The full `DEMO`, `QA`, performance, and scenario
profiles remain separate future work.

`profiles/minimal.json` is the data definition; `src/loader.mjs` validates it
and builds a deterministic ordered upsert plan. Stable IDs are SHA-256-derived
from the profile name, dataset version, resource type, and canonical key, then
formatted as stable UUIDv8 identifiers. The loader has no clock, random-number,
network, or secret dependency.

The current database baseline contains no business-domain tables and there is
no approved persistence adapter in this work package. Consequently, the CLI
validates and reports the plan but exits with code 3 and explicitly says that
no data was seeded. It does not treat an in-memory target as application
persistence. The test-only in-memory adapter verifies that the adapter contract
uses stable-key upserts and does not duplicate resources on repeated runs; it
does not prove PostgreSQL domain persistence.

Run the loader directly with:

```sh
node demo/src/loader.mjs --profile MINIMAL
```

`agroctl seed` delegates to this loader. Unknown profiles and malformed
profiles fail deterministically with a nonzero exit code.
