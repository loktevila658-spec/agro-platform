# Codex Implementation Starter Pack — AgroPlatform

**Status:** prepared from the uploaded folder `Документы на разработку`; source documents are copied unmodified.

## What is inside
- 50 canonical project documents (`/spec`).
- Original `MASTER_FUNCTIONAL.xlsx`.
- Market review as non-authoritative research.
- Frozen machine-readable scope: 315 MASTER + 133 market-delta items.
- 94 WP49 manifests and 12 build waves.
- Authority, REV47 decisions, conflict register, architecture invariants, source-of-truth, release baseline, quality gates and change-control schema.
- 430 final governance/build requirements (RT48 + BGR49 + TZ50).
- 300 acceptance tests (AT48 + AT49 + AT50).
- Bootstrap API/event/permission/workflow/rule catalogs.
- First executable prompt: `/codex/prompts/WP49-001.md`.

## Start here
1. Read `AGENTS.md`.
2. Read `CODEX_INSTRUCTIONS.md`.
3. Load `/codex/SPEC_AUTHORITY.yaml`, `/codex/RELEASE_BASELINE.yaml`, `/codex/build-graph.yaml`.
4. Inspect `/codex/PRE_IMPLEMENTATION_STATUS.yaml`.
5. Create/open the Git repository.
6. Execute only `/codex/work-packages/WP49-001.yaml` using `/codex/prompts/WP49-001.md`.
7. Require the Completion Report before unlocking the next WP.

## What is intentionally excluded
QA page renders, intermediate PDFs/PNGs, duplicate nested archives, `.DS_Store`, and old competitor/reference blueprints are not included because they are not canonical implementation inputs. They remain in the original uploaded archive.

## Important
This pack is an **implementation input**, not a claim that the repository already satisfies H50 pre-implementation gates. `PRE_IMPLEMENTATION_STATUS.yaml` explicitly distinguishes READY items from work that must be created by early WP49 packages.
