# Audit framework adoption contract

This module is an internal framework boundary. It is not wired into every domain module by this work package.

## Ownership and inputs

The canonical owner of an authoritative entity remains responsible for its command, validation, permission policy, and business write. The audit framework owns only `platform_audit.evidence` and `platform_audit.correction_link`; it never writes to another module's tables.

The owner supplies its module identifier, entity type and identifier, command/action reference, verified server-side actor context, correlation ID, provenance references, and evidence object. These values must be derived or validated by the owning server command, not trusted from client input. Security-critical and privileged corrections require actor and correlation identifiers.

## Authorization and transaction boundary

The framework requires an injected server-side authorization adapter for append, correction, and supersession operations. The registered default denies every operation. Missing, false, or failed authorization denies the write. An adapter may map its decision to the consuming module's existing permission policy; this contract defines no permission keys or RBAC model.

The owner runs its authoritative write and framework call within the same `runAuditTransaction` callback and transaction context. Failure of either operation rolls back the transaction. Callers must not pass a client-supplied authorization flag or directly modify framework tables.

## Immutable corrections

Framework evidence and correction links are append-only. A correction or supersession creates new evidence and a link to the original evidence; it does not update or delete the original. Links are limited to the same owner module and entity identity. Provenance references to other stores are qualified references, not foreign keys or writes into those stores.

## Reads and events

This module exposes no public audit read API. No read method is exported by this framework surface; any future read capability must use the existing server-side permission policy and fail closed.

The framework-level verification scenario emits no domain event because it creates only internal framework evidence and links, with no product workflow or event consumer. For a future adopted domain command, the canonical owner must map each observable state change to an event or record a no-event rationale. If it emits an authoritative event, the owner writes it through the transactional outbox in the same transaction with applicable provenance and correlation/causation identifiers.

Existing `org.audit_entry` and `identity.security_audit` remain independently owned and unchanged. This work package does not integrate those command paths or claim framework adoption by those modules.
