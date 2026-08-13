<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

The plan is drawn twice and reads as two documents. Two findings from the
Browser Use Cloud audit, 2026-08-11 (`notes/wbs-cloud-test-run-2026-08-11.md`,
Group C), and they are one fault seen twice:

- "Table and Gantt scroll independently — can never read row N beside bar N;
  Gantt papers over it with a duplicate truncated 176px label column."
- "508px dead white space on small plans (Gantt docked to viewport bottom)."

The first is why the chart is untrustworthy: scroll the plan to row 40 and the
chart is still on row 1, so the bar next to a row is never that row's bar. The
second is why it looks broken before it is read: the frame takes the whole
window whatever is in it, so a four-row plan puts half a screen of nothing
between its last row and a chart pinned to the bottom.

Dany greenlit the two as one item, and they are one: a surface is one thing when
there is no gap in it and one scroll position across it.

## What Changes

**One scroll position, expressed in rows**

- From: two scroll boxes, each with its own idea of where the plan is
- To: the row the table shows first is the row the chart shows first, whichever
  of the two was scrolled — by wheel, by drag or by a keyboard walk
- Sideways is untouched on both: the table's is its columns, the chart's is its
  calendar, and they are not the same fact

**The frame stops growing past its own rows**

- From: `flex: 1 1 0%` — the whole remainder, empty or not
- To: `flex: 0 1 auto` — as tall as its rows, never taller than it has. The
  chart docks under the last row; what is left over is under the chart
- The frame is still the thing that scrolls, and still ends at the bottom of the
  window on any plan that fills it

## Non-Goals

- The chart's duplicate label column stays. It is how a bar is clicked.
- No side-by-side layout: the table's folded fit needs the whole width.
- No new remembered state. Nothing about the scroll is stored or shared.

## Constraints

- Row-for-row correspondence between the two faces is load-bearing and now
  mechanical: the link pairs rows by id and does nothing when they disagree.
- Keyboard and cell focus: the link writes `scrollTop` and nothing else.

## Capabilities

### Modified Capabilities

- `wbs-domain`: the plan and its chart are one scrolling surface

## Domain Terms

- **Linked scroll** — added to `CONTEXT.md`.

## Decisions Recorded

The alternatives are in `design.md`; none is hard to reverse, so no ADR.

## Impact

`apps/fe-01` only: a new `plan-scroll-link.ts`, one effect in `wbs-table.tsx`,
`TABLE_FRAME`'s flex, and `roomForCard`'s container. No be-01, no gw-01, no
migration, no deploy step.
