<!--
INTENT. Hard cap: 400 words excluding these comments. Change name is proposal.md (OpenSpec CLI hardcodes it).
-->

## Why

The scheduler is one deterministic millisecond pass (Fast) with no notion of optimality. Its dates are usable but never ordered against the two objectives Dany cares about — priority-first and finish-first. He wants an optional advanced mode that computes better schedules with a real constraint solver and lets collaborators pick an objective, without disturbing Fast, which stays the default and the sole fallback.

## What Changes

**Optimization toggle**

- From: one Fast schedule, always computed.
- To: a project-wide hidden toggle, OFF by default. OFF keeps Fast only and cancels solver work; ON publishes Fast, consults the cache, then starts the missing CP-SAT solves — PRI (priority-first) and Time (finish-first).

**Selection**

- From: no choice of schedule.
- To: Engine (Fast / Optimized) and Objective (Priority-first / Finish-first), both project-scoped, selecting which cached result is shown. Selecting an already-computed variant re-solves nothing.

**Results**

- From: recomputed in memory on each read.
- To: validated results in a durable SQLite cache keyed by project, Input hash, objective and solver version, plus a `status='failed'` marker row per failed variant. `schedule_optimized` broadcasts once per newly stored result, never on a hit.

**Feedback**

- To: one compact indicator — Earlier/Later by N days, Same deadline + reordered, Same deadline + same order, or `Optimization unavailable · Retry`.

**Packaging**

- To: a versioned Python package `wbs-solver` (OR-Tools CP-SAT), a short-lived stdin/stdout CLI.

## Non-Goals

- No daemon, port, sidecar, outbox, or background service.
- No proven-optimality claim — best-found only.
- No timer auto-retry, toast, or modal.
- No per-user objective; the known capacity/floor finding stays open.

## Constraints

- Backward-compatible migrations (blue/green share one SQLite file).
- `solverBudgetMs` default 60000; caps of 4 solver processes per project, 16 global.
- The Input hash excludes Engine, Objective, the toggle, the display variant and the budget.
- The cache migration lands under `apps/be-01/drizzle/`, a prod-mode path: reviewed PR, no self-merge.
- Builds and autotests run on h2puni or CI, never locally.

## Capabilities

### New Capabilities

- `scheduler-optimization`: dual-objective optimization, selection, caching, events, and the comparison indicator.

### Modified Capabilities

- (none)

## Domain Terms

- `Engine`, `Objective`, `Input hash`, `Baseline schedule` — added to CONTEXT.md by this change.

## Decisions Recorded

- none (settled by Dany 2026-09-02/03; recorded in `design.md`)

## Impact

- be-01 (coordinator, cache, event), fe-01 (toggle, selectors, indicator), new `wbs-solver` package. Adds OR-Tools to the deploy image.
