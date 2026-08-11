<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany, 2026-08-11: "add a priority column. It must be numeric. From 1 to
infinity. Smaller number eq more important. The most important part is that it
must affect the gantt chart logic — more priority means need to start earlier."

A plan holds no statement of what matters. When two work items want the same
person on the same day, the leveller picks by the critical path and then by row
number, and a planner who knows which of the two is the release-blocker has
nowhere to say so.

## What Changes

**A numeric priority per work item.** Integer, 1 upward, no ceiling; smaller is
more important; blank means none.

**It reorders the resource-leveling queue.** `goesFirst` compares priority
first — ascending, unset as `+Infinity` — then the rule it has today
(critical-path start, least float, row number, role order). Where two slices
compete for one person, the smaller number is placed first and starts earlier.

**It never defies a constraint.** Priority decides who goes first when the
schedule has a choice, not who defies their dependencies. A priority-1 work item
still waits for its predecessors, its floor and the calendar. A plan with nobody
assigned has no contention, and so does not move at all.

**Unset is unset.** A plan with no priorities schedules byte-identically to
today: every priority is `+Infinity`, the new comparison is never decisive, and the
existing rule decides alone.

**A priority on a parent reaches its leaves**, as a floor does — but the **most
specific** statement wins where a floor takes `Math.max`. A leaf's own beats any
ancestor's, and the nearer ancestor beats the further. A floor is a hard
constraint, so the strictest must hold; a priority is an intention.

**The write path refuses what is not one.** Integer ≥ 1; `0`, negatives and
fractions are refused as a malformed date is. `null` clears it.

## Non-Goals

- No change to the critical-path pass, and so none to `float` or `critical`.
- No new Gantt rendering. The bars move because the engine moved them.
- No upper bound, no reserved band, no word for 1.

## Constraints

- Blue/green shares one SQLite file across a swap: the column is nullable and
  additive, and the outgoing release must keep inserting work items.

## Capabilities

### Modified Capabilities

- `wbs-domain`: priority orders the leveling queue.

## Domain Terms

`Priority` — added to CONTEXT.md.

## Decisions Recorded

none

## Impact

be-01 (`schema.ts`, one migration, `work-item.ts`, `work-item.service.ts`,
`work-item.controller.ts`, `schedule.ts`), fe-01 (`wbs-table.tsx`,
`table-frame.ts`, `wbs-api.ts`, `gantt-panel.tsx`, `gantt-geometry.ts`,
`plan-export.ts`), tests beside them.
