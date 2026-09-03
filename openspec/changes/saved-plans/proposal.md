<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany, 2026-09-03: **Save the plan, so a plan from two weeks ago can be looked at
again and compared with today's.** Early planning is uncertain; the question
afterwards is "what did we think then, and what moved".

Nothing in the product can answer it. Measured on `main`: `plan_event`
(`schema.ts:1767`) is a log of **commands**, not of state, and is pruned at 365
days (`repository/index.ts:1893`). Dates are never stored at all — `schedule()`
(`libs/domain/src/schedule.ts:1771`) is a pure function recomputed from live rows
on every read. And `project.revision` (`schema.ts:215`) deliberately does not
move for work items (`schema.ts:207-211`), so "the plan as of revision N" is not
expressible.

Dates cannot be recovered later: re-deriving a September plan with November
scheduler code restates history.

## What Changes

- A **saved plan**: a named, project-scoped record written by value, joined to no
  live row.
- Two independently versioned, hashed bodies — the **canonical plan input**
  (settings, tree, steps, estimates, actuals, measures, ownership, dependencies,
  capacity, priority bands) and the **frozen schedule** (nullable; ISO dates
  *and* offsets, the whole `Scheduled`/`ScheduledSlice` field set, plus the
  algorithm identity).
- The capture runs inside **one SQLite read snapshot**: the live projection reads
  in thirteen awaited calls (`work-item.service.ts:1285-1312`, `:1364-1385`),
  the capture more, and no counter brackets them.
- **Comparison in both directions.** One diff over two sides — input, schedule,
  identity; each side is a saved-plan id or the literal `current`, projected
  through the same function and never stored.
- Save, list, read, rename, delete. The name is the only editable field, and
  every read checks the stored bytes against their hash.

## Non-goals

- **No restore, no branching, no merge, no partial apply.** Inspection and
  comparison only.
- No retention or pruning: only an explicit delete removes one.
- No rewriting of a stored body, ever — including when a person leaves the live
  plan (Dany chose `keep`: old records stay truthful about who owned what).
- Not the August `plan_snapshot_figure` scope — estimate/actual numbers only,
  blind to an added item, a reparent, an ownership change and every date.

## Constraints

- Blue and green share one SQLite file: additive forward migration, non-empty
  `down.sql`, `ON DELETE CASCADE` to project so an old node's
  `DELETE FROM project` is never blocked, and a clean disabled state on nodes
  that predate the routes.
- A save must never starve live editing, and permanent records must never grow
  the shared file without bound.
