<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dragging the Gantt panel's top edge is broken, reported and reproduced in
Chrome on 2026-08-29.

`clampedGanttHeight` caps a dragged height at `0.8 × window.innerHeight`. The
panel does not live in the window — it lives in the plan's flex column, beside a
toolbar, the table and a footer. Measured at a 963px viewport: the column is
906px, its other children take 418px, so **488px is available and the clamp
allows 770px**.

Two symptoms, one cause. The panel is `shrink-0` with an explicit height, so it
first spends the column's leftover slack growing **downward** — the top edge
does not follow the pointer at all (measured: panel 159.71 → 337.71px,
`handleTop` unchanged at 569). Past that it overflows the column: dragged to
757px, the panel's bottom landed at 1200 against a column bottom of 955, with
every ancestor `overflow: visible` and `document.scrollHeight` still 963.
**245px of chart drawn off-screen, with no scrollbar and no way to reach it.**

Ruled out by measurement: hit-testing is sound (all nine sampled points across
the 6px strip returned the handle; `isolate` and `zIndex: 1` intact), and the
gesture commits correctly every time.

## What Changes

**The clamp measures the column, not the window.** A dragged height is capped at
the space the plan's column actually has for the panel — its own height less the
toolbar, the table's floor, the handle and the footer — and never at a share of
the viewport. The floor still wins over the cap, as it does today.

**The panel may give space back.** It stops being `shrink-0` in the non-full-screen
case, so an over-constrained column shrinks the chart rather than pushing it
through the bottom.

**The panel's `maxHeight` follows the same number**, instead of `80vh`.

## Non-Goals

- Full screen, which ignores the dragged height by design and is untouched.
- The floor, the ceiling, the remembered-height storage, or the handle's
  gesture, pointer capture and abandon rules — all measured working.

## Capabilities

### Modified Capabilities

- `wbs-domain`: how tall a reader may drag the Gantt panel.

## Domain Terms

Gantt panel.

## Impact

`clampedGanttHeight` and its callers in `gantt-panel.tsx`; the handle in
`wbs-table.tsx`; the panel's `maxHeight`; `e2e/gantt.spec.ts`.
