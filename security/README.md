# Security baseline

## Repository secret scan

Run `node security/secret-scan.mjs` from any directory in the repository.
The scanner examines UTF-8 repository files in deterministic path and line
order, skipping Git metadata, installed `node_modules` dependencies, and the
local pnpm content-addressed package cache (`.pnpm-store`).
It detects PEM private keys, recognized provider-token formats, and
high-entropy values assigned to secret-like fields or embedded in database
connection URLs. Findings contain only the file, line, and rule; secret values
are never printed. The scanner has no network dependency and exits nonzero when
it finds prohibited material.

Synthetic test placeholders remain ordinary reviewable source text: there are
no path-based or broad test-directory exclusions. Low-entropy values such as
`test-only-placeholder` do not match the high-confidence rules. A token in a
test file still triggers a finding if it matches a recognized provider format.
The repository scan is also run by the required `@agroplatform/config` package
test, which is part of the recursive CI unit gate.

## Secret and key references

`@agroplatform/config` exposes a typed `SecretReference` boundary matching the
DOC19 providers. It accepts a provider, locator, purpose, and optional version;
it accepts no secret value or private-key material. Missing or malformed
references fail with the configuration field name and a value-free message.
Recognized private-key markers, provider tokens, credential assignments,
credential-bearing database URLs, and bearer-token values are rejected in all
reference fields. Opaque random-looking locators remain valid.
Retrieval, storage, key generation, signing, and rotation remain with external
providers and later authorized work.

## HTTP security headers

The API installs the baseline middleware in its Nest bootstrap. API responses
always receive a restrictive CSP, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, and
`Referrer-Policy: strict-origin-when-cross-origin`. HSTS is added only when
`AGRO_ENV=production`; it is not sent in development or test. DOC19 requires
HSTS after production HTTPS readiness. The deployment must use production mode
only after HTTPS is ready; this baseline adds no separate readiness setting.
The CSP denies all resource loading, inline execution, and framing; it uses no
wildcard sources.
