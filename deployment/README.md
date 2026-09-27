# Deployment configuration

The checked-in `.env.example` contains only non-secret local-development values.
It documents the shared startup contract implemented by
`@agroplatform/config`; it is not a production environment file.

Production deployments must inject configuration at runtime. Passwords, tokens,
private keys, certificates, and connection credentials belong in an external
secret provider and must never be added to this directory. The current model is
strictly `LOCAL_PRIMARY`: local writes remain authoritative and cloud writes are
disabled.
