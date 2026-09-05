---
status: proposed
---

# Ports live in a framework-free core lib; adapters live outside it

be-01's store ports, services, use cases and HTTP endpoints move into `libs/core`, which may
import `@wbs/domain`, `@wbs/contracts`, `@wbs/validation`, `@wbs/auth` and nothing else — no
`elysia`, no `drizzle-orm`, no `bun:sqlite`, and no `Bun`/`process`/`fetch`/timer **globals**
— enforced by ESLint `no-restricted-imports`, `no-restricted-globals` and Nx `depConstraints`
on a `type:core` tag. Core is **`runtime:bun`, Node-compatible, not isomorphic**: it keeps
`node:crypto`, `node:async_hooks` and `jose`, which its services already use, and puts only
`Bun.password` behind a port. Browser reuse of core is a non-goal. The SQLite adapters
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

`services.ts` becomes `composeServices(ports)` in core — one graph, saved plans and the
command runner included — with use-case entrypoints (`runCommandBatch`, `savePlan`, `replay`,
`retentionSweep`) that carry the authorization and announcements the controllers hold today,
so a worker cannot bypass them. be-01's `boot.ts` is one caller; a test over the memory source
is another. gw-01 is **out**: Nx forbids app→app imports, so a be-01 adapter cannot serve it,
and its WebSocket upgrade is not an endpoint; a shared `libs/http-elysia` is a later decision. The migration SQL folder and the
`migrate-*-cli.ts` entrypoints do **not** move: the blue/green swap invokes them by path.
