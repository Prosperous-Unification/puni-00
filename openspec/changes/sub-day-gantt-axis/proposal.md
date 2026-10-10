## Why

With `estimate-units` a slice can last forty minutes, and the Gantt ladder stops at one day:
at its widest rung a 40-minute bar is 2 px. The 020.07 experiment
(`origin/experiment/r6b-timeline`; figures in `design.md`) measured a dense sub-day timeline and
found no winner between a ladder and a slider, so the ladder's testability argument stands.

## What Changes

- The calendar-scale ladder gains three **sub-day rungs** — 4 h, 1 h, 15 min per cell — as
  discrete, judgeable steps; no slider. They divide the 480-minute workday into 2, 8 and 32
  cells. Day rungs are unchanged.
- A bar narrower than 4 px is painted as a 4 px tick carrying `data-tick`; every mark's
  pointer surface is at least 18 CSS px; overlapping pointer surfaces open an explicit
  selection list rather than a guess. The exact span is in the hover card.
- A sub-day rung is offered only while the marks it would draw (visible leaves × project
  steps, plus attempts once `gantt-attempt-marks` lands) are at most 2,500. Above that the
  rung is a rendered `not offered at N marks` state, never a silent fallback.
- At a sub-day rung a calendar day is its 480 working minutes; weekends stay greyed as at day
  rungs. Non-working hours appear only when the instant axis exists.

## Non-Goals

Continuous zoom; a 5-minute rung; sub-pixel true-duration paint; attempt marks
(`gantt-attempt-marks`); greying non-working hours (`agent-calendar-instant-axis`); windowing
to raise the 2,500-mark bracket; any change to day-rung pixels or to the engines.

## Constraints

Every existing day-rung pixel and text assertion stays byte-identical. The 2,500 bracket is
the experiment's measured safe side and moves only with a new measurement recorded in
`verify.md`. Rendering cost is recorded as a benchmark, not pinned as a CI wall-clock gate
(`working-plan-performance` has already failed under load). Requires `estimate-units` for a
sub-day slice to exist; the rungs render without one.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: sub-day rungs, ticks, pointer surfaces, the collision list, the offer rule.

## Domain Terms

Sub-day rung — applied to `CONTEXT.md` by task 0.2 from the glossary delta.

## Decisions Recorded

none: a reversible presentation decision (`020.09-answers.md` Q4).

## Impact

fe-01 only: `gantt-panel.tsx` (ladder, control), `gantt-geometry.ts` (widths, ticks, hit
surfaces), `gantt-detail.ts` (card, collision list), `plan-chart-input.ts` (mark count),
`remembered-layout.ts` (the remembered rung's new ids), the Gantt e2e shards.
