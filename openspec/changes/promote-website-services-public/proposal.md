# Promote website app and API into the public monorepo

## Problem

The private companion currently owns both the licensed Astro marketing site and the independently authored PUNI application, API, and local libraries. Maintaining two editable copies of the services would make their Nx targets, dependency closure, and release revisions ambiguous. The services have no dependency on Novaform source, licensed fonts, or private site assets.

## Outcome

`puni-00` becomes the canonical source for `apps/website/fe-01`, `apps/website/be-01`, `libs/website/domain/contracts`, and `libs/website/adapters/store-sqlite`. The public projects carry explicit portability metadata, product tags, aliases, and working Bun/Nx test, lint, typecheck, and build targets. The public API uses a password-specific verifier for the operator secret and admits only a bounded plain-text concept subject. The private companion may keep a pinned service snapshot for its local three-host demo; its independently authored Astro site remains private.

## Non-goals and constraints

This change does not publish Novaform source, enable paid inference, or deploy any host. The operator verifier and generated concept subject are tightened for the public source without changing route shapes or local ports. Preserve existing APIs and local ports. Copy reviewed source files only; exclude environment values, databases, generated output, and licensed assets. Keep the same relative paths and a declared local dependency closure so the repository transfer contract can validate future snapshots. A successful public PR and a private snapshot receipt identify the same canonical source revision.
