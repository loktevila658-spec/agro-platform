# WP49-010 architecture guard

Run the guard with:

```sh
node --test tests/architecture/module-dependencies.test.mjs
```

The test scans JavaScript, TypeScript, Python, and Dart source under `apps/**` and `packages/**`. It resolves relative imports and known workspace imports (`@agroplatform/*`, project-qualified Python imports, and Dart `package:` imports), and emits a JSON G1 evidence record. `ARCH-APP-BOUNDARY-001` rejects an import from one runnable application root (`apps/<app>`) into another application's implementation. The current repository's roots are the workspace applications in `apps/`; shared code belongs under `packages/` and may be imported by applications.

## Authority basis

- DOC50 §8 and its repository layout identify the API, web, mobile, workers, and AI applications separately from shared packages.
- DOC50 TZ50-019 requires backend modular bounded-context ownership; TZ50-020 prohibits direct cross-module writes to foreign authoritative tables.
- DOC49 BG-003/BG-004 require cross-module reads and writes to pass public query/application contracts or the owning domain's command/API/event contract.
- DOC49 BGR49-021 requires an explicitly verifiable repository-boundary gate with machine-readable evidence. The guard records checked source dependencies and violations as JSON, and G1 runs it through `scripts/ci-gates.mjs typecheck`.

This rule checks source-level application dependency boundaries. The current bootstrap has no domain module source trees yet, so the guard does not invent module-to-module dependency directions from the future module catalog. It also does not claim to prove database repository/table ownership, LOCAL_PRIMARY enforcement, cloud replication behavior, domain-command validation, evidence/AI write restrictions, 1C accounting boundaries, or PLC/E-stop/safety behavior. Those properties require executable contracts or runtime architecture beyond WP49-010's static source-import signal.
