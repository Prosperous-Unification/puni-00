<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dragging the Gantt panel's divider **down** leaves the chart cut through a row
with nothing on screen to say the rest is a scroll away. Dany's report,
2026-08-29, with screenshots. Reproduced in Chromium against the dev server: the
section at `height: 124` over a `scrollHeight` of 196, `overflow: auto`.

So it scrolls, and the panel is not broken — it only reads that way, twice over.
macOS draws its scrollbars as overlays: nothing at all until something moves
them, which means the one affordance the platform would have given is invisible
at exactly the moment a reader needs it. And a row sliced by a hard edge reads
as a drawing error rather than as a fold.

`gantt-height-column-clamp` fixed the other half of this report — a panel drawn
past the bottom of its own column, with nothing able to scroll to it. This is
the half that was left: a panel that is inside its column, correct, and mute.

## What Changes

**A panel with chart below its bottom edge says so.** The last 20px of the
scrollport fade to the panel's own background while, and only while, there is
chart under the fold — the repo's edge-fade idiom (`REFERENCE_SET_EDGE_FADE`,
`DEP_EDGE_FADE`) turned on its side. It lifts when the reader reaches the last
row and returns on the way back up. It is a drawn element, not a scrollbar, so
it does not depend on a platform's scrollbar policy.

**The two things a scrolled panel must not lose are pinned by tests**, not by
new code: the calendar axis stays at the top of the scrollport, and every bar
stays level with its own row label. Both already hold; neither had a check that
could see them break.

## Non-Goals

- The blank band between the table and the chart. That is
  `unified-scroll-docking`'s bottom-docking, deliberate, and out of scope.
- Snapping a dragged height to whole rows.
- Styling the scrollbars themselves. Playwright launches Chromium with
  `--hide-scrollbars`, so no check in this repository's browser gate could
  observe one.
- Any change to the drag, the clamp, the stored height or the reset.

## Capabilities

### Modified Capabilities

- `wbs-domain`: how a Gantt panel too short for its chart reads.

## Domain Terms

Gantt panel; row label; calendar axis.

## Impact

`gantt-panel.tsx` alone, plus its tests and `e2e/gantt.spec.ts`. No wire,
schema, storage or command change.
