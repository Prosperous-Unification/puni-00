## Why

A calendar marker names one day and the scheduler ignores it. Dany (2026-10-25) wants
ranges of one or more days, some with logic: an organization holiday, a department's
off-days or a project closure should move work, not just label the chart. The WBS has no
holiday concept; weekends are its only non-working days. The domain term is **Calendar
period** (CR10); the folder keeps its name.

## What Changes

- From: `calendar_marker(date, name, color)`, one day, invisible to the scheduler.
- To: `calendar_period(scope, start, end, name, color, kind)` at organization, an optional
  space, project or work package; a marker becomes a one-day `note`.
- From: weekends decided alone in `workday.ts`.
- To: a work calendar of weekends plus the effective `non_working` dates; in release 1 every
  slice skips them (CR15); shared bookings cross calendars by date (CR12).
- From: marker routes per project; chips on the Gantt.
- To: `…/calendar-periods` at each scope, a fan-out to every package beneath (CR13); bands
  drawn by dragging across axis cells, with provenance on hover.

## Non-Goals

Per-person absences (CR8); `freeze` and `deadline` kinds (Q1); working through an inherited
period (Q2); the agent-kind exemption, which is release 2 (CR15); recurring periods; imported
holiday feeds.

## Constraints

- Scopes add, never hide (`wbs-work-packages` E19).
- Rounding (ADR 0011, 0042) and ADR 0017's axis refusal unchanged.
- The migration runs inside slice 3a's stop-the-world window; rollback is its snapshot
  restore (CR11); breaking routes allowed (E8).
- Lands after `wbs-work-packages` slice 3a and #723; release 2 needs
  `agent-calendar-instant-axis`.

## Capabilities

### New Capabilities

- `calendar-periods`: periods per scope, kinds, the scheduling effect, shared bookings,
  events, routes, migration.

### Modified Capabilities

- `work-packages` (unsynced change): E19's point markers become one-day `note` periods. No
  delta file: the capability is not yet synced.

## Domain Terms

Calendar period (replaces Calendar marker), Period kind, Non-working period, Work calendar.
Space and Default project are left to #723, which amends them.

## Decisions Recorded

No ADR. CR1–CR19 in `design.md` are assumed, overrulable by id (CR9 withdrawn); Q1–Q6 await
Dany.

## Impact

`@wbs/domain` (`workday.ts`, schedule input), core (shared people, person load, fan-out),
store-sqlite and store-memory, be-01 routes and migration, mcp-01 tools, fe-01 Gantt and
project stream, saved-plan input and plan document versions.
