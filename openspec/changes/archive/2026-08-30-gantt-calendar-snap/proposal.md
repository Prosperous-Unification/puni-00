<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

PR #36 snapped floating-point drift at be-01's two calendar boundaries
(`snapWorkdays`, applied in `datesOf`'s ceil and `addWorkdays`' floor). The
codex review of that PR found fe-01's Gantt still interprets the same drifted
offsets with bare `Math.ceil`/`Math.floor`, so the chart can disagree with the
dates be-01 prints beside it:

- `gantt-panel.tsx` `lastWorkdayOf`: bare `Math.ceil(finish)` — a drifted
  15.000000000000002 becomes last day 15 where be-01 says 14.
- `gantt-panel.tsx` `spanWords`: floors `start` **before** `addWorkdays`,
  defeating the snap inside it — a drifted 8.999999999999998 prints day 8's
  date where be-01 prints day 9's.
- `gantt-geometry.ts` `calendarScale`: `startOf` floors before snapping, and
  `endOf` reads a drifted whole offset as fractional, moving a bar's edge.
- both axis builders: bare `Math.ceil(horizon)` can mint an extra axis cell
  from one drifted bit.

The same review left one engine test gap: nothing asserts float when a
`notBefore` floor pushes a fractionally-estimated row past the rest of the
plan, where `lateTimes`' subtraction reconstruction answers a drifted negative
float.

## What Changes

**The discrete rules move into `@wbs/domain` and are shared.** Three helpers
in `workday.ts`, each snapping before its discrete step: `firstWorkdayOf`
(snap, then floor — the workday a span starts on), `lastWorkdayOf` (snap,
then `ceil − 1`, clamped to the start's workday), `wholeDaysCovering` (snap,
then ceil — how many whole-day cells cover a span). be-01's `datesOf` is
refactored onto them, and every fe-01 site calls them, so front and back
cannot disagree by construction — no inline copy of the rule survives.

**The engine's drifted negative float is pinned, not fixed.** A new
`schedule-shapes.test.ts` case holds a `notBefore` floor past the project's
other work on a PERT-fraction row and asserts the drifted negative float and
un-critical last row the engine currently answers, named as pinned rather
than endorsed.

## Non-Goals

- No change to engine arithmetic or wire numbers; the drifted float stays.
- No snapping of `data-start`/`data-finish` — bars carry engine numbers
  verbatim; only discrete calendar readings snap.
- No holiday calendars, no timezone work.

## Constraints

- The snap window stays `snapWorkdays`' 1e-9; a genuine fraction (14.9) must
  keep rounding as real work through every new helper.

## Capabilities

### Modified Capabilities

- `wbs-domain`: the Gantt reads workdays through the same snap the dates do.

## Domain Terms

none new

## Decisions Recorded

none

## Impact

`libs/domain` (`workday.ts`), be-01 (`work-item.service.ts`, tests), fe-01
(`gantt-panel.tsx`, `gantt-geometry.ts`, tests). No migration, no API shape
change.
