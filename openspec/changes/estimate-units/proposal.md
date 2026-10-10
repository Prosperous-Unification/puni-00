## Why

Agent steps run in minutes and human steps in days, and the estimate table knows only
fractional days. R6 and the 2026-09 field data (WBS 020.09) show whole-day rounding and an
invented hours-per-day convention padding agent work: a 40-minute step has no honest
spelling today.

## What Changes

- Every project step gains an **estimate unit**, `workdays` or `minutes`, `workdays` unless
  set. A trio on a minute-unit step is three whole minutes in the existing columns; a
  fraction is refused.
- The **charged estimate** rounds by unit: workday-unit steps keep ADR 0011's project
  rounding; minute-unit steps are charged to the whole minute after the allowance, and the
  project's rounding is not consulted.
- A minute-unit slice is placed on today's workday axis as `minutes / 480` workdays, exact,
  through the domain constant `WORKDAY_MINUTES`. No night or weekend work yet.
- Changing a step's unit while it holds estimates is refused naming the count; nothing is
  converted.
- One `showDuration` formats both units on the table, cards, chart and exports.
- The plan document, saved-plan input, MCP schemas and spreadsheet export carry the unit; one
  additive migration pair; rollback and the swap refuse code that cannot read `minutes`.

## Non-Goals

Executor kind, working window, agent calendar, instant axis (`agent-calendar-instant-axis`);
points, tokens, sizes (`measures-vocabulary-and-size-templates`); sub-day rungs
(`sub-day-gantt-axis`); any scheduler contract, solver wire or Python change; a project-level
unit or minutes-per-day setting; a unit on the estimate row.

## Constraints

The column is additive with a default that is a fact (`workdays` is the only unit that ever
existed); blue and green share SQLite mid-swap. `MAX_ESTIMATE_MINUTES = MAX_ESTIMATE_DAYS ×
480` keeps the solver's 32-bit axis; the solver quantum (a 48th of a workday, 10 minutes)
applies only at the CP-SAT boundary. Versions and the migration stamp are allocated at packet time (`design.md`). Golden
corpora, request hashes and identity oracles stay byte-identical for workday-only plans.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: estimate unit, per-unit charge, placement, unit-change refusal, `showDuration`.
- `plan-command-registry`: `setEstimate` takes whole minutes on a minute-unit step; step
  create and patch take `estimateUnit`.
- `plan-import`: the plan document carries each step's unit.
- `saved-plans`: the canonical input carries each step's unit.
- `deployment-pipeline`: additive migration, guarded `down.sql`, swap vocabulary.

## Domain Terms

Estimate, Charged estimate, Estimate rounding (rewritten); Estimate unit, Workday minutes —
applied to `CONTEXT.md` by task 0.2 from `puni-plan/batch-10/interviews/glossary-delta.md`.

## Decisions Recorded

[ADR 0042](../../../docs/adr/0042-an-estimate-unit-belongs-to-the-step-and-rounding-follows-it.md);
ADR 0011 stays accepted, narrowed to workday-unit steps.

## Impact

`@wbs/domain`, `@wbs/core`, contracts and MCP schemas, be-01 (migration, CLIs, step route),
`tools/tool-remote-scripts` (swap), fe-01 (steps settings, cells, cards, Gantt card, export).
