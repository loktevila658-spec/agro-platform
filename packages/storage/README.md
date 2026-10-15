# Storage boundary

WP49-017 stores only stable object keys and checksums in PostgreSQL. Application
code accesses MinIO through the `ObjectStorage` port in the files module; local
filesystem paths are never persisted or returned as attachment references.
