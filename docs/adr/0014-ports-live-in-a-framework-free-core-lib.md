---
status: proposed
---

# Ports live in a framework-free core lib; adapters live outside it

be-01's store ports, services, use cases and HTTP endpoints move into `libs/core`, which may
import `@wbs/domain`, `@wbs/contracts`, `@wbs/validation` and the `StandardSchemaV1` type, and
**nothing with a runtime**: no `elysia`, `drizzle-orm`, `bun:sqlite`, `jose` or `node:*`, and
no `Bun`/`process`/`fetch`/timer/`Buffer` globals. Every runtime concern — password hashing,
token signing, digests, ambient batch context, timers, push transport, the schedule engine —
arrives through `composeServices(ports)`, so core is **`runtime:isomorphic`**. Dependency
direction is stated as **rings** on Nx projects — `ring:domain` (`libs/domain`, `libs/contracts`,
`libs/validation`), `ring:application` (`libs/core`), `ring:adapter` (`store-*`, `be-01`,
`fe-01`, `gw-01`) — and enforced by the `@nx/enforce-module-boundaries` rule already in the
gate, plus `no-restricted-imports` / `no-restricted-globals` for what Nx cannot see. The SQLite
adapters live in `libs/store-sqlite`, the in-memory source in `libs/store-memory`, and
`apps/be-01` keeps only the Elysia adapter, the composition root with the runtime adapters,
and the migrate CLIs. We chose packages over folder conventions because the folder convention
had already held for a year and still let seven values leak from repositories into services
with nothing to say so: a rule enforced by a linter across a package boundary fails on the
import, a rule stated in a comment fails in review or not at all.
Plan: `docs/2026-09-05-ports-and-adapters-plan.md`.

`libs/domain` and `libs/contracts` are conceptually core's innermost ring and stay **separate
Nx projects**: fe-01 imports one from 11 files and gw-01 the other from 4, and a boundary the
linter can see is per project — `@wbs/core/domain` as a subpath would be a convention it
cannot check. Their directories are grouped **by ring** — `libs/wbs/{domain,application,adapters}/` — with
short project names and unchanged aliases; the ring never enters a name, because a ring is an
attribute and a name is an identity, and a test binds directory to tag (plan D18, D19).

"Ring" is Clean Architecture's word (Martin 2012, the Dependency Rule) and Onion Architecture's
(Palermo 2008); "port" and "adapter" are Hexagonal Architecture's (Cockburn 2005). Not "layer",
which already means a folder inside one project in this repo.

## Considered options

**Folders inside `apps/be-01/src` with ESLint path rules.** Least churn. Rejected because
nothing outside be-01 can then compose the services — a CLI, a worker, gw-01 — which is
half of what the split is for, and because folder-scoped lint rules are the kind of check
that is scoped to where the fault is not (`svg-export-and-gutter`, 2026-08-31).

**Two packages, core + be-01, drizzle staying beside Elysia.** Rejected: the SQLite source
would not be swappable as a unit, and the in-memory source would stay a test fixture rather
than a peer implementation the conformance kit holds to the same contract.

**Core as `runtime:bun`, keeping `node:crypto`, `node:async_hooks` and `jose` as imports.**
The first review's recommendation and this ADR's own second draft. Rejected by Dany the same
day: every one of those is a wrapper-sized port except `AsyncLocalStorage`, and that one has a
correct browser adapter under the source's write coordinator (plan §3.4). The cost was one
extra day in Wave 2; the alternative left "runs in any runtime" as a claim.

**One `@wbs/core` project holding domain and contracts as subpaths.** Rejected because Nx
boundaries are per project: fe-01 depending on core for `@wbs/core/domain` would be free to
import `WorkItemService`, and nothing would fail.

## Consequences

`services.ts` becomes `composeServices(ports)` in core — one graph, saved plans and the
command runner included — with use-case entrypoints (`runCommandBatch`, `savePlan`, `replay`,
`retentionSweep`) that carry the authorization and announcements the controllers hold today,
so a worker cannot bypass them. be-01's `boot.ts` is one caller; a test over the memory source
is another. gw-01 is **out**: Nx forbids app→app imports, so a be-01 adapter cannot serve it,
and its WebSocket upgrade is not an endpoint; a shared `libs/http-elysia` is a later decision. The migration SQL folder and the
`migrate-*-cli.ts` entrypoints do **not** move: the blue/green swap invokes them by path.
