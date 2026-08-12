<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

A dependency arrow can be drawn straight down the length of a bar it has nothing
to do with, and a reader cannot tell that arrow from the one that ends there.

Measured on the cloud test A10's own fixture — `010` three days, `020` two and
`030` four both waiting on it, `040` two waiting on both — the `020 → 040` arrow
routed `M 9 1.5 · L 13.643 1.5 · L 13.643 3.5 · L 14 3.5`. Its descent at
x = 13.643 runs inside `030`'s bar, on the row it passes between its two ends.
The router already jogs where it must. But which route to draw was chosen on
**horizontal room alone** — the plain elbow whenever the two ends stood more
than two approaches apart — and nothing ever asked what the descent would land
on.

## What Changes

**Which route a dependency arrow is drawn through**

- From: the plain elbow with horizontal room, the jog otherwise, decided from
  the arrow's two ends and no bar at all
- To: the nearest column to the ideal turn at which the whole route clears every
  bar it does not join, decided against the bars the panel is drawing
- Impact: non-breaking. An arrow with nothing under its turn is drawn exactly
  where it was; only the arrows that were crossing a bar move.

## Non-Goals

- Not a general orthogonal router: arrows still leave right, arrive right, and
  stay between the two rows they join. No A\*, no channel allocation.
- Arrows are not routed around **each other**. Two may still overlap; this
  change is about bars.
- Nothing about when arrows are shown (`gantt-declutter`) or where they start
  (`dep-waits-on-first-role`). No change to person links, flags, or heads.

## Constraints

- The panel owns the two numbers a route is built from — the approach in days
  and the bar inset in rows — so the geometry takes them as an argument rather
  than importing them.
- The fallback column stands left of everything on the rows crossed, so the
  canvas has to hold it: `CHART_PAD_PX` already reaches one approach past either
  end (`The canvas holds every mark`).
- Only the bars the panel paints are obstacles — since `gantt-declutter`, the
  estimated ones.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: a dependency arrow's route clears every bar it does not join

## Domain Terms

`Arrow route`

## Decisions Recorded

none — the search is small, local to one function, and reversible in one file.

## Impact

`apps/fe-01` only: `gantt-geometry.ts` gains `routeArrow`, `gantt-panel.tsx`
calls it instead of building the route itself, and both test files. No be-01, no
gw-01, no migration, no wire change.
