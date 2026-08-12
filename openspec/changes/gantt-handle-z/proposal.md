# gantt-handle-z

## Why

Cloud case C4, on dev at `94ed488`: the Gantt panel's height handle cannot be
pressed. A 54-point hit-test sweep across the strip never returned it, and the
chart's own header answered every point instead. The gesture behind the handle
is not broken — the clamp, the persistence and the reset all pass — so a reader
sees a `row-resize` cursor on an edge that refuses every drag.

The handle is 6px tall and carries `margin-bottom: -6px`, deliberately: the grab
strip and the panel's drawn top border are meant to be one line rather than a
gap above it. So the panel is pulled up over the strip and the two boxes share
those pixels, and paint order alone decides who takes the press. The handle is
`position: relative; z-index: 1`. The panel is a `<section>` with `overflow:
auto`, which makes **no stacking context**, so the sticky boxes inside it — the
label column and the calendar axis at `z-10`, the corner at `z-20` — stack
against the page rather than against the chart, and every one of them outranks
the handle.

Reproduced in Chromium at `7a26663`: on the seeded plan, the strip is the
handle's only where the chart has nothing drawn under it. Where the chart
reaches, it is the chart's. On a plan as wide as the window that is the whole
strip — the cloud sweep's answer.

## What Changes

**The chart isolates its own layering.** The panel's `<section>` gains
`isolate`, so the three sticky `z-index`es inside it are resolved among
themselves and the section as a whole takes its place under the handle above
it. Nothing inside the chart changes rank relative to anything else inside the
chart, and the handle's own `z-index: 1` is left where it is.

**The strip is proved in a browser.** `e2e/gantt.spec.ts` sweeps the handle's
6px across the chart's own top row — label column and calendar axis, both
measured first so an empty strip cannot make the sweep vacuous — and asserts
the browser hands every point to the handle, then drags from the corner the
label column's header used to take.

## Non-Goals

- No change to the handle's geometry: the negative margin stays, and the strip
  stays 6px.
- No `z-index` bump on the handle. A number raced against the chart's numbers
  is the same defect waiting for the next sticky box.
- No change to `wbs-table.tsx`, which renders the handle, or to any chart mark.
