## Why

A planner can say only unknown or done about a work item; in progress is reachable only through
one step's statement. WBS 010.4.14 asks for the rest of its life: drafted or ready, parked,
blocked, and a successor of parked or blocked work showing that without being told twice.

## What Changes

- A leaf gains two stored facts, **readiness** (draft, ready) and **hold** (on hold, blocked).
  **Status** widens to unknown, draft, ready, in progress, blocked by proxy, on hold, blocked
  and done, folded on read; a parent folds its children with one partition-consistent rule.
- **Blocked by proxy** is derived from the full dependency graph and never stored.
- `setStatus` accepts every status but blocked by proxy; on a parent it acts on every leaf
  beneath; in progress marks the first open step and fills an empty fact start.
- On hold removes the held subtree from the schedule input before either engine runs. Blocked,
  readiness and blocked by proxy change no schedule.
- The table, row menu, status cell, cards and Gantt say every status.
- Plan document v6, saved-plan input schema 4, one additive migration with a guarded
  `down.sql`, and a swap guard refusing code that cannot read stored holds.

## Non-Goals

- Holds on one step node (010.4.13.3), a hold reason or end date, cascading holds.
- Any scheduler contract, solver wire or Python change; a new plan command kind.

## Constraints

- Blue/green shares SQLite: both columns are nullable with no default, and the swap refuses an
  image that cannot read a stored hold before writes open.
- Plan document v5 belongs to typed dependency stage B; this change takes v6 and reads v1–v5
  with no readiness or hold. The saved-plan input schema moves 3 → 4.
- The migration stamp sorts after every migration on main and in the integration queue.
- Rollback loses readiness, as it loses fact dates, and is refused over stored holds.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: status vocabulary, folds, blocked by proxy, hold's schedule reduction, UI.
- `plan-command-registry`: `setStatus` accepts seven statuses.
- `plan-import`: plan document v6.
- `saved-plans`: input schema 4.
- `deployment-pipeline`: rollback and swap guards for holds.

## Domain Terms

Status (widened), Readiness, Hold, Held, Blocked by proxy.

## Decisions Recorded

[ADR 0033: A hold leaves the plan; blocked is a reading](../../../docs/adr/0033-a-hold-leaves-the-plan-blocked-is-a-reading.md).

## Impact

`@wbs/domain`, `@wbs/core`, contracts and MCP tools, be-01 (migration, CLIs),
`tools/tool-remote-scripts` (swap), fe-01 (table, menu, cards, Gantt).
