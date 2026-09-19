## Why

Dany, 2026-09-19: "when add a lot of items to the wbs, the scrolling gets
jittery; I think this is a legitimate UI issue." Static reading of the plan
renderer at `origin/main` 1eeacb0b names four candidate causes that grow with
row count:

1. `usePlanViewport.recordHeight` runs `indexOf`, a `slice().reduce()` over every
   earlier row, and a full `Map` copy plus `setHeights` per newly measured row.
2. Every scroll frame runs `placeRows` over all rows twice.
3. The anchor correction writes the renderer's `scrollTop` when a row above the
   viewport gets its real height (the 26.1875 px estimate is wrong for every
   wrapped row); `plan-scroll-link.ts` then realigns the Gantt panel with
   layout reads on both faces.
4. The Gantt panel mounts every row's label, hit surface and bar.

None is measured yet, and a fix aimed at the wrong one would not remove the
jitter.

## What Changes

1. A reproduction and attribution probe, landed first and reviewed on its own
   numbers.
2. A Gantt-scoped commit trace before deciding whether its subtree is part of
   the measured cause, then fixes only for attributed causes: publish changed
   viewport windows instead of raw scroll offsets, and give both faces enough
   terminal scroll range to align the same row and within-row fraction.
3. The stability outcomes below as the acceptance bar.

Height batching and a prefix-sum row index are out of this change because both
measured below the 5% cutoff. Gantt isolation or windowing remains conditional
on its component-scoped trace.

## Non-Goals

No new virtualization library, no change to row content, editing, drag or cell
navigation, no mobile work, no Gantt windowing.

## Constraints

Keep the proofs in `use-plan-viewport.ts` and `plan-scroll-link.ts`. Timing
numbers are evidence in `verify.md`, not CI assertions; CI asserts only
deterministic properties. Probes run on h2puni or CI, never on h1claw.

## Capabilities

### New Capabilities

- `wbs-plan-scrolling`: scroll stability for large plans.

## Domain Terms

Uses **Plan renderer** and **Gantt panel**. New: First visible row. Add to
`CONTEXT.md` before implementation.

## Decisions Recorded

A1: "a lot of items" means 500–2,000 rows; falsified if Dany's plan is larger,
in which case the probe re-runs at his size.

## Impact

fe-01 `use-plan-viewport.ts`, `plan-viewport.ts`, `plan-scroll-link.ts`, a new
e2e probe. No backend change.
