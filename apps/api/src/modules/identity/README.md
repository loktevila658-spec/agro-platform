# WP49-012 local identity profile

This module implements local password authentication, TOTP challenge verification, and self-service session lifecycle. It does not provision accounts; provisioning remains an operational/database responsibility. `mfa_required` is only an authentication-strength policy.

## Runtime configuration

- `DATABASE_URL`: PostgreSQL connection used for identity state.
- `AUTH_JWT_SIGNING_KEY`: externally managed base64 encoding of exactly 32 random bytes. Missing or malformed configuration fails authentication closed. The key is not stored in PostgreSQL.
- `AUTH_MFA_ENCRYPTION_KEY`: externally managed base64 encoding of exactly 32 random bytes for AES-256-GCM TOTP-secret decryption.
- `AUTH_MFA_KEY_REFERENCE`: the external key identifier recorded with the encrypted TOTP secret; it must match at verification time.
- `AUTH_AUDIT_HMAC_KEY`: externally managed base64 encoding of exactly 32 random bytes used to HMAC-chain the identity-owned append-only security history.

TOTP secrets are encrypted at rest with a fresh 96-bit nonce and 128-bit authentication tag. Provisioning must supply ciphertext, nonce, tag, and key reference. This work package defines no enrollment or recovery endpoint.

## Token and password profile

Access JWTs use HS256 and last 10 minutes. They carry only subject, tenant, device, session, authentication strength, issued-at, and expiry claims. Every protected request validates the signature and expiry, then confirms the session is active in PostgreSQL.

Refresh credentials are opaque 256-bit random values. Only SHA-256 digests are stored. They rotate on each refresh, and reuse of a consumed value revokes the session. The selected local refresh lifetime is 14 days, a deterministic choice within DOC19's allowed 7–30 day profile.

Passwords use Argon2id with 19 MiB memory, two iterations, and one lane. PHC-encoded hashes include the algorithm version and salt. A successful login rehashes outdated parameters. Passwords do not expire on a calendar schedule.

Login failures update a persisted per-login throttle and apply exponential retry windows capped at five minutes. Errors are generic and no permanent account lockout is applied.
