# Shared runtime configuration

`@agroplatform/config` is the fail-fast, dependency-free environment boundary for
platform services. Call `parseRuntimeConfig(process.env)` once during service
startup and pass the returned `RuntimeConfig` to application code.

## Variables

| Variable | Type and rule | Source |
| --- | --- | --- |
| `AGRO_ENV` | `development`, `test`, `staging`, or `production` | DOC22 environment separation |
| `AGRO_DEPLOYMENT_MODE` | `LOCAL_PRIMARY` only | DOC47/DOC50 authority invariant |
| `AGRO_SITE_TIME_ZONE` | Required IANA time-zone identifier | DOC50 local business-date rule |
| `AGRO_LOCAL_WRITE_ENABLED` | Strict boolean; must be `true` | DOC22 local authority profile |
| `AGRO_CLOUD_WRITE_ENABLED` | Strict boolean; must be `false` | DOC47/DOC50 cloud non-authority rule |
| `PORT` | Base-10 integer from 1 through 65535 | Current WP49-001 service bootstrap |

No value is silently defaulted or loosely coerced. Validation reports all found
issues in a stable order, does not echo values, and returns an immutable object
only when every required value is valid.

## Secrets

This package intentionally defines no secret-bearing field. Future credentials,
tokens, certificates, and private keys must be supplied by the deployment
environment or an external secret provider and must not be committed to the
repository. Secret-management and repository-wide secret scanning are outside
WP49-002.
