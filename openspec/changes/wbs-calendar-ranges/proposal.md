## Why

A calendar marker names one day and the scheduler ignores it. Dany (2026-10-25) wants
ranges of one or more days, some with logic: an organization holiday, a department's
off-days or a project freeze should move human work, not just label the chart. The WBS has
no holiday concept; weekends are its only non-working days.

## What Changes

- From: `calendar_marker(date, name, color)`, one day, invisible to the scheduler.
- To: `calendar_range(scope, start, end, name, color, kind)` at organization, space, project
  or work package; a marker becomes a one-day `note`.
- From: weekends decided alone in `workday.ts`.
- To: a work calendar of weekends plus the effective `non_working` dates; human-kind slices
  skip them, agent-kind slices do not (ADR 0043); saved plans record the dates.
- From: marker routes per project; chips on the Gantt.
- To: `…/calendar-ranges` at each scope; bands drawn by dragging across axis cells, with
  provenance on hover.

## Non-Goals

Per-person absences (CR8); `freeze` and `deadline` kinds (Q1); a lower scope working through
a higher scope's range (Q2); recurring ranges; imported holiday feeds.

## Constraints

- Scopes add, never hide (`wbs-work-packages` E19).
- Rounding (ADR 0011, 0042) and the undated-plan refusal (ADR 0017) unchanged.
- Additive forward migration with a guarded `down.sql`; breaking routes allowed (E8).
- Lands after `wbs-work-packages` slice 3a (scopes, chain); the agent-kind exemption needs
  `agent-calendar-instant-axis`'s executor kind.

## Capabilities

### New Capabilities

- `calendar-ranges`: ranges per scope, kinds, the scheduling effect, routes, migration.

### Modified Capabilities

- `work-packages` (unsynced change): E19's point markers become one-day `note` ranges; the
  E19 line points here. No delta file: the capability is not yet synced.

## Domain Terms

Calendar range (replaces Calendar marker), Range kind, Non-working range, Work calendar,
Calendar overflow (the old `calendar_range` refusal, renamed).

## Decisions Recorded

No ADR. CR1–CR9 in `design.md` are assumed, overrulable by id; Q1–Q3 await Dany.

## Impact

`@wbs/domain` (`workday.ts`, schedule input), core, store-sqlite and store-memory, be-01
routes and migration, mcp-01 tools, fe-01 Gantt, saved-plan input and plan document
versions.
