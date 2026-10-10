## Why

Attempts are stored (`step-node-attempts`) and the Gantt can zoom below a day
(`sub-day-gantt-axis`), but the chart still draws only the forecast and the done bar. The
field evidence (WBS 020.10) wanted to see what actually ran — two dead runs and a retry —
where the timing is legible: on the chart.

## What Changes

- At the sub-day rungs a step node with attempts draws one **attempt mark** per attempt over
  its planned slice, on the same row: `succeeded` solid, `failed` hatched, `cancelled`
  dotted, running open-ended to now. The planned slice stays underneath as the forecast.
- Marks follow the sub-day rules: under 4 px a tick, a pointer surface of at least 18 px, a
  collision list, exact instants in the card. They count toward the 2,500-mark offer rule.
- At the day rungs nothing changes: a done leaf draws its done bar.
- Before the instant axis, instants map to the axis by their project-zone day and minute of day
  from the anchor `STAGE_ONE_DAY_START_MINUTE` (09:00); the part of a mark outside 09:00–17:00 is
  clamped to the day's edge with `data-clamped`, and the card carries the true instants.

## Non-Goals

A separate "what happened" track per node; attempt timing in the table; the instant axis and
non-working hours (`agent-calendar-instant-axis`, which replaces the clamp); any engine
change.

## Constraints

Day-rung pixels and the done bar stay byte-identical. `now` for a running mark is one clock
read per render passed in as a prop, never `Date.now()` inside geometry. Depends on
`sub-day-gantt-axis` and `step-node-attempts`.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: attempt marks on the Gantt panel.

## Domain Terms

Attempt mark — applied to `CONTEXT.md` by task 0.2 from the glossary delta.

## Decisions Recorded

none: presentation (`020.10-answers.md` Q11).

## Impact

fe-01 only: `gantt-geometry.ts` (marks, clamp), `gantt-panel.tsx` (paint styles),
`gantt-detail.ts` (card), `plan-chart-input.ts` (mark count), the Gantt e2e shards.
