---
status: proposed
---

# Ports live in a framework-free core lib; adapters live outside it

be-01's store ports, services and HTTP endpoints move into `libs/core`, which may import
`@wbs/domain`, `@wbs/contracts`, `@wbs/validation` and nothing else — no `elysia`, no
`drizzle-orm`, no `bun:sqlite`, no `Bun`/`process`/`fetch`/timer globals, enforced by ESLint
`no-restricted-imports` and Nx `depConstraints` on a `type:core` tag. The SQLite adapters
live in `libs/store-sqlite`, the in-memory source in `libs/store-memory`, and `apps/be-01`
keeps only the Elysia adapter, the composition root and the migrate CLIs. We chose packages
over folder conventions because the folder convention had already held for a year and still
let six values leak from repositories into services with nothing to say so: a rule enforced
by a linter across a package boundary fails on the import, a rule stated in a comment fails
in review or not at all. Plan: `docs/2026-09-05-ports-and-adapters-plan.md`.

## Considered options

**Folders inside `apps/be-01/src` with ESLint path rules.** Least churn. Rejected because
nothing outside be-01 can then compose the services — a CLI, a worker, gw-01 — which is
half of what the split is for, and because folder-scoped lint rules are the kind of check
that is scoped to where the fault is not (`svg-export-and-gutter`, 2026-08-31).

**Two packages, core + be-01, drizzle staying beside Elysia.** Rejected: the SQLite source
would not be swappable as a unit, and the in-memory source would stay a test fixture rather
than a peer implementation the conformance kit holds to the same contract.

## Consequences

`services.ts` becomes `composeServices(ports)` in core; be-01's `boot.ts` is one caller of
it and a test over the memory source is another. The migration SQL folder and the
`migrate-*-cli.ts` entrypoints do **not** move: the blue/green swap invokes them by path.
