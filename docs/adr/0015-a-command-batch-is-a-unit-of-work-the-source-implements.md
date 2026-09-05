---
status: proposed
---

# A command batch is a unit of work the source implements

ADR 0007 made a command batch an outer `BEGIN IMMEDIATE` over the stores' own SQLite
transactions, which nest as savepoints. That is a fact about `bun:sqlite`, and a data source
that is a file, an HTTP API or a document store has no savepoints. We keep the behaviour and
move the mechanism: core owns a `UnitOfWork` port whose contract is **terminal atomicity** —
once `run` settles, every write made inside it is observable through every store's reads or
none is — and each source meets it its own way. The SQLite adapter meets it exactly as ADR 0007
describes; the in-memory source meets it by staging and swapping. A conformance case
(`unitOfWorkConformance`) asserts the contract against every source, so a source that cannot
roll back is not a slower source, it is a failing one.
Plan: `docs/2026-09-05-ports-and-adapters-plan.md` §3.2.

Two things the first draft of this ADR got wrong, corrected on review (plan §8):

- **Isolation is not promised.** SQLite's one shared connection shows a batch's in-flight rows
  to a concurrent read, and a probe against the production event log observed it. The
  contract is about the state after `run` settles; the kit says so and tests the in-flight
  window only for what _is_ promised — that an outside write is not undone by the batch.
- **The source owns write coordination.** ADR 0007 says every be-01 write waits behind the
  lock while a batch is open; the code has only publication taking it, so a route write or a
  retention prune can land inside an open batch and be rolled back with it. The lock leaves
  core and becomes the source's re-entrant **write coordinator**, entered by every mutating
  adapter method and held by `run` for the batch.

`run` takes an act that returns a `Decision` — commit or roll back, with the value either way,
and an optional `afterRollback` that runs before the coordinator is released — because a
refusal in this codebase is a returned value, not a throw, and undo discards its stale journal
entry in exactly that window. A thrown error rolls back and rethrows.

## Considered options

**Transactions stay SQL-only; swappability promised only among SQL sources.** Rejected
because "the repository layer must not care about the source" was the requirement, and a
port that only SQL can implement is drizzle's shape with a different name.

**Push atomicity into the stores as aggregate-level methods** (`applyPlanBatch`). Rejected
for the same reason ADR 0007 rejected the unit-of-work rewrite: it replaces the per-command
store API every service is written against, and the batch runner would become a second
service layer.

## Consequences

ADR 0007 is not superseded; it becomes the SQLite adapter's documentation. The saved-plan
repositories, which open their own connection per call and check quota inside their own
transaction, are **independent operations** of the source and are never enlisted in a batch;
the kit holds every source to that. `EventLogRepo` is a port of the source like the stores
(`EventLogStore`), because replay and retention read and prune through it.
