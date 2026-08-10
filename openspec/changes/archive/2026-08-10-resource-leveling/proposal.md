# A person does one thing at a time

## Why

The plan already knows who is doing which slice and ignores it: two work items
assigned to the same person are scheduled on the same days, and the dates the
table prints are ones nobody can work. `doesEveryPhase` makes it worse — one
named assignee means that person is doing every role of that work item, so a
plan can put one person on four slices at once and call it a schedule.

## What Changes

**The schedule levels people**

- From: a critical-path pass in which nobody's calendar constrains anything.
- To: one **deterministic serial list scheduling** pass over the augmented
  graph — dependency edges, the intra-item role chain, and the resource edges
  the pass itself chooses. The highest-priority eligible slice is placed at the
  latest of its floors, one of which is the assignee's last finish. Non-overlap
  holds by construction; there is no re-run and no iteration.
- Impact: a plan with no assignee is **byte-identical** to today's, which is
  what makes this safe to have always on. A plan with one is later, and true.

**A slice says what is holding it**

- From: start and finish, and nothing about why.
- To: the floor that bound it, the person it waits on, and the id of the slice
  that person was busy with. Float and critical are recomputed by a backward
  pass over the augmented graph, so "critical" means what ends the project —
  through people as well as through edges.

**The tree says how much of the plan is queueing**

- `waitingForPerson`: how many work items hold a slice whose start was set by
  the person assigned to it rather than by the plan. The header note reads
  from it.

## Non-Goals

- **No optimality.** List scheduling is a heuristic; the makespan it finds is
  not the shortest one. Said out loud in `design.md` and in the spec.
- No slices on the wire, no Gantt, no header UI — `G` and `H` draw them.
- No control over who gets a queue first; the priority rule is fixed.
- No calendars, capacities, part-time people or overtime.

## Constraints

- Identity for unassigned plans is the acceptance test, to the last bit: the
  differential and the captured live plan from `schedule-on-item-role` both go
  through the leveled engine unchanged.
- The dependency-cycle refusal stays at the write path, unchanged. Resource
  edges are chosen during placement and cannot deadlock it.
- be-01 only. fe-01 has no diff.
- 200 work items over 2–3 roles must schedule in under 10ms, asserted in CI.

## Capabilities

### Modified Capabilities

- `wbs-domain`: a person does one thing at a time, and the schedule says so.

## Domain Terms

`Resource leveling`, `Eligible slice`, `Binding floor`, `Resource predecessor`
— in `CONTEXT.md`.

## Decisions Recorded

None new. The algorithm was chosen by the reviewed roadmap after v1's was
proven unsound (`docs/plans/2026-08-08-phases-gantt-mobile-roadmap.md`, S2);
`design.md` carries the termination argument, the complexity and the
counterexample the old one failed.

## Impact

be-01 only: the planner, the slice adapter in `work-item.service`, and the
tree's new count. No migration, no schema change, no client change.
