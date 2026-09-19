## Why

Dany, 2026-09-19: "when add a lot of items to the wbs, the scrolling gets
jittery; I think this is a legitimate UI issue." Static reading of the plan
renderer at `origin/main` 1eeacb0b finds four costs that grow with row count, any
of which can drop frames or move rows under the reader:

1. `usePlanViewport.recordHeight` runs `indexOf`, a `slice().reduce()` over every
   earlier row, and a full `Map` copy plus `setState` **per newly measured row**.
   A fast scroll mounts many unmeasured rows per frame, so each frame costs
   O(rows × newly mounted rows) and as many React commits.
2. Every scroll frame runs `placeRows` over all rows twice (`viewportRows` and
   `rowLayout`), plus a new `Set` for pinned ids.
3. The anchor correction writes `frame.scrollTop` in a layout effect whenever a
   row above the viewport gets its real height. That write fires a scroll event
   that `plan-scroll-link.ts` mirrors onto the Gantt panel, which forces layout
   reads on both faces; the estimate (26.1875 px) is wrong for every wrapped
   row, so this happens continuously while scrolling up through unmeasured rows.
4. The Gantt panel is not windowed: it draws every row's bar, so its paint and
   layout grow with the plan while it is scroll-linked to the renderer.

Which of these is the visible jitter is not yet measured.

## What Changes

First a Chromium measurement that reproduces the jitter and names its cause,
then targeted fixes, each gated on that measurement: batched height readings
with a prefix-sum layout, one layout pass per frame, anchor corrections that
move both faces together, and a windowed Gantt panel.

## Non-Goals

No new virtualization library, no change to row content, editing, drag or cell
navigation, no mobile layout work.

## Constraints

Keep the existing proofs in `use-plan-viewport.ts` (render budget; anchored row)
and `plan-scroll-link.ts` (row pairing by id). Measurements run in the `pixels`
e2e job on h2puni or CI, never on h1claw.

## Capabilities

### New Capabilities

- `wbs-plan-scrolling`: scroll stability and frame budget for large plans.

## Domain Terms

Uses **Plan renderer** and **Gantt panel** from `CONTEXT.md`. No new terms.

## Decisions Recorded

Assumption A1: "a lot of items" means 500–2,000 rows; the targets use both.
Falsified if Dany's plan is larger, in which case the probe is re-run at his size.

## Impact

fe-01 `use-plan-viewport.ts`, `plan-viewport.ts`, `plan-scroll-link.ts`,
`gantt-panel.tsx`, and a new e2e scroll probe. No backend change.
