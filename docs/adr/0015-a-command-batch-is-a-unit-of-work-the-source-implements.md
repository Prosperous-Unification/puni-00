---
status: proposed
---

# A command batch is a unit of work the source implements

ADR 0007 made a command batch an outer `BEGIN IMMEDIATE` over the stores' own SQLite
transactions, which nest as savepoints. That is a fact about `bun:sqlite`, and a data source
that is a file, an HTTP API or a document store has no savepoints. We keep the behaviour and
move the mechanism: core owns a `UnitOfWork` port whose contract is **behavioural** — a batch
run through it is either observable in full through every store's reads or not observable at
all — and each source meets it its own way. The SQLite adapter meets it exactly as ADR 0007
describes, write lock included; the in-memory source meets it by staging and swapping. A
conformance case (`unitOfWorkConformance`) asserts the contract against every source, so a
source that cannot roll back is not a slower source, it is a failing one.
Plan: `docs/2026-09-05-ports-and-adapters-plan.md` §3.2.

## Considered options

**Transactions stay SQL-only; swappability promised only among SQL sources.** Rejected
because "the repository layer must not care about the source" was the requirement, and a
port that only SQL can implement is drizzle's shape with a different name.

**Push atomicity into the stores as aggregate-level methods** (`applyPlanBatch`). Rejected
for the same reason ADR 0007 rejected the unit-of-work rewrite: it replaces the per-command
store API every service is written against, and the batch runner would become a second
service layer.

## Consequences

ADR 0007 is not superseded; it becomes the SQLite adapter's documentation. The write lock
stays a core port because the runner still awaits between steps, and the SQLite adapter
asserts it is held on `run` entry. The two saved-plan repositories, which open their own
connection per call today, get ports and move that habit inside the adapter.
