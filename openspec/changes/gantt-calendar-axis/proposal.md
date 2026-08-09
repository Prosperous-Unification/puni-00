<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

The Gantt's SVG unit is one workday, so weekends have zero width: a bar across
one reads as unbroken work, and no column says a Saturday passed. Dany chose
greyed weekend columns over seam markers. Making the calendar day the unit moves
**every** horizontal coordinate the panel draws — one change, or the chart
splits. Plan: `docs/plans/2026-08-09-directory-table-header-gantt.md`, G1.

## What Changes

**The calendar day is the unit.** x becomes a calendar-day offset from the
plan's first working day, through one scale read two ways: a start takes
`startOf(w) = calendarDaysBetween(origin, addWorkdays(origin, ⌊w⌋)) + (w − ⌊w⌋)`
and a finish its left limit `endOf(w)` = `startOf(w − 1) + 1` for whole `w`.
Fractions ride inside the workday they belong to. fe-01 only; the wire, the
engine and `data-start`/`data-finish` are untouched.

**Weekends are columns.** `workdayAxis` becomes `calendarAxis`: one cell per
calendar day, weekends greyed, heavy gridlines on Mondays, one cell per viewBox
day.

**Every mark moves together.** Every mark with a horizontal coordinate, the
axis header included, reads one resolved calendar geometry rather than the
workday number. A mark left on raw workdays
misaligns after the first weekend. **Words are not marks**: the dates a bar and
a caret say stay `addWorkdays`/`lastWorkdayOf` on workday numbers, never a
coordinate — `endOf(5)` is a Saturday.

**A bar is as wide as it is drawn.** `endOf(start + drawnSpan) −
startOf(start)`, never engine `finish`: an unestimated slice has
`finish === start`, and a width from it collapses to no area — the sixteenth
check.

## Non-Goals

- No holidays, per-person calendars, zoom or drag-to-reschedule.
- No engine or wire change: no new field, nothing recomputed.
- Bar hover content is `gantt-bar-hover`.
- No charting dependency; the scale is hand-rolled.

## Constraints

- `addWorkdays` refuses negative offsets and normalises a weekend start to
  Monday; the scale inherits both, tested.
- jsdom asserts positions through the scale; a browser judges pixels.
- The existing Gantt tests go legitimately red; they are rewritten, not appended
  to.

## Capabilities

### Modified Capabilities

- `wbs-domain`: the Gantt's unit, axis and every mark's coordinate.

## Domain Terms

calendar axis, calendar scale — **proposed, not written** here.

## Decisions Recorded

none — the alternatives are in the plan's disposition table (codex 13/14/15,
agy 3/5/6).

## Impact

fe-01 only: the scale and resolved geometry in `gantt-geometry.ts`, every mark
in `gantt-panel.tsx`, `calendarDaysBetween` in `libs/domain/src/workday.ts`;
`gantt-panel.test.tsx` and `e2e/gantt.spec.ts` rewritten. No migration or
dependency.
