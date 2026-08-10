# The schedule is computed per work item and role

## Why

The schedule holds one duration per work item: every role's estimate summed,
because "Dev finishes, then QA starts" was addition rather than something the
engine knew. Nothing downstream can ask when QA starts, who is free on Tuesday,
or which bar to draw — and leveling, the Gantt and the per-person queues all
need exactly that. Changing the unit later is worse: a bar, a dependency and a
cache all refer to it, and every one would move the day an assignee arrives.

## What Changes

**What the schedule is computed in**

- From: one work item, one duration, one node.
- To: one **slice** per work item and role, run in **role order**; the row's
  numbers are the **projection** of its slices.
- Impact: non-breaking and deliberately invisible. Every plan that exists today
  produces identical start, finish, slack and critical numbers, because its
  slices are contiguous when nothing but the plan constrains them.

**A project's roles gain an order**

- From: none. The rows come back in whichever order SQLite chooses, which is
  the `(project_id, name)` index — **alphabetical**, observed.
- To: `role.position`, spaced in tens, read in that order everywhere.
- Impact: additive migration carrying a default, so an outgoing release can
  still insert a role mid-swap.

## Non-Goals

- **No resource leveling.** Nobody's calendar constrains a slice here; that is
  the next change, and it is what makes slices scatter.
- **No slices on the wire, no UI.** The projection is what leaves be-01.
- **No reorder route for roles.**

## Constraints

- Byte-identity with today's numbers is the acceptance test, not a hope: a
  captured live response must come back out of the new engine unchanged, to the
  last bit.
- Blue and green share one SQLite file, so the migration is additive.
- The dependency write path and its cycle refusal are unchanged.

## Capabilities

### Modified Capabilities

- `wbs-domain`: the schedule's unit becomes the slice, roles gain an order, and
  a work item's schedule becomes a projection of its slices.

## Domain Terms

`Slice`, `Role order`, `Projection` — in `CONTEXT.md`.

## Decisions Recorded

None. The unit was settled by the reviewed roadmap
(`docs/plans/2026-08-08-phases-gantt-mobile-roadmap.md`, S1); the arithmetic
that keeps it invisible is in `design.md`.

## Impact

be-01 only: the schedule, the work item service, the role repository, the seed
and one additive migration.
