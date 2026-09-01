## Why

Pointing a row re-renders the whole plan renderer and the whole Gantt chart.
Measured in Chromium against dev (28-row plan): 75–120ms of JS per row the
pointer crosses with the chart open, ~40–60ms with it closed, and the
table→chart seam pays twice (a leave and an enter). A sweep across ten rows
saturates the main thread for over a second, so the row light visibly trails
the pointer — Dany reported it 2026-09-01: "the hover over the rows … is slow,
and still not synced good enough when hover switches from table to gantt."
The pointed-row spec already says pointing SHALL be immediate; the
implementation no longer delivers that as the table has grown.

## What Changes

**Cost of pointing a row**

- From: every pointed-row change re-renders all ~28×17 plan-renderer cells and
  every Gantt mark (bars, gridlines, links, carets, axis).
- To: a pointed-row change re-renders only the rows whose light changed and the
  chart's light layer (band + row labels). Marks and unrelated rows keep their
  React subtrees.
- Impact: non-breaking. No DOM handle, attribute, tint, or paint order changes;
  every existing jsdom and browser assertion stays valid.

## Non-Goals

- No virtualization, and no imperative DOM writes outside React for the light.
- No change to what lights, when it clears, hover-card timing, or touch guards.
- No perf work beyond the pointed-row path (typing, drag, and refetch renders
  stay as they are).

## Constraints

- Landmine #1: the `columns` memo keeps depending on `steps` and
  `unfoldedSteps` only — nothing per-pointer may enter it.
- Browser and jsdom suites select on `data-row-lit`, `data-gantt-row-lit`,
  `data-gantt-label-lit`, `data-gantt-band`; those handles and the SVG paint
  order are fixed points.
- StrictMode double-renders in dev: render-count proofs must count relative
  growth, not absolute totals.
- R5: every memo boundary is a check that can silently stop working (a prop
  with unstable identity makes it vacuous); each needs a negative watched
  failing with the boundary removed, and a probe that the boundary actually
  holds.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: the pointed-row requirement gains a render-isolation clause —
  pointing a row must not re-render unrelated rows or chart marks.

## Domain Terms

none — **Pointed row** and **Row light** already name everything this touches.

## Decisions Recorded

none — memo boundaries are reversible, unsurprising, and the alternatives
(imperative writes, virtualization) are named above as non-goals.

## Impact

`apps/fe-01` only: `wbs-table.tsx`, `gantt-panel.tsx`, their tests, and
`e2e`. No API, schema, or deploy-path change.
