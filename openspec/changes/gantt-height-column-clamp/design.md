# design — `gantt-height-column-clamp`

## D0 — the measurements this change is built on

Chrome, 2026-08-29, `localhost:4200`, viewport 963px tall, one project open with
the chart shown. Read out of the live DOM, not inferred:

| Quantity | Value |
| -------- | ----- |
| plan column (`section.flex.min-h-0.flex-1.flex-col`) | top 49, bottom 955 → **906px** |
| toolbar (`shrink-0`) | 68 |
| table region (`min-height: 320px`) | 320 |
| handle | 6 |
| footer | 24 |
| **available for the panel** | **488** |
| `clampedGanttHeight` cap (`0.8 × 963`) | **770** |
| panel after a 353px drag | 757, bottom at **1200** vs column bottom **955** |
| `document.scrollHeight` | 963 — unchanged, no scrollbar |

The 245px overhang is unreachable: every ancestor is `overflow: visible` inside
a non-scrolling `h-full` column, so there is nothing to scroll to it.

## D1 — the cap is a column measurement, taken at the gesture

`clampedGanttHeight(px, viewportPx)` becomes
`clampedGanttHeight(px, availablePx)`, and the caller computes `availablePx`
from the column the panel is in rather than from `window`.

**Measured, not derived from constants.** The obvious alternative is to subtract
known figures — toolbar height, `TABLE_NEEDS_HEIGHT`, the footer — and it is
rejected: the toolbar wraps to two rows at some widths (it is
`flex-wrap` by design), the footer's height depends on how many words it holds,
and a derived number would be wrong at exactly the viewport sizes nobody tests.
The handle already reads the panel's real box at `pointerdown` for the same
reason its JSDoc gives ("the panel as the browser really laid it out"); this is
that argument applied to the other end of the sum.

So at `pointerdown` the handle measures the column and the panel together:
`available = columnRect.height - (columnRect.height - panelRect.height - slack)`
reduces to the honest form — **`available = panelRect.height + slackBelow +
shrinkableAbove`**, where `slackBelow` is the unused space between the panel's
bottom and the column's, and `shrinkableAbove` is what the table region may give
up before hitting its own `min-height`.

`GANTT_CEILING_PX` and `GANTT_MIN_PX` are unchanged, and the floor still wins
over the cap: a column too short for three rows of chart gets three rows and a
clipped panel, not a zero-height one. That precedence is already in
`clampedGanttHeight` and is kept.

## D2 — the panel stops being `shrink-0`

A flex item with an explicit `height` and `shrink-0` cannot give space back, so
an over-constrained column resolves by overflowing. Dropping `shrink-0` in the
non-full-screen case makes the browser the backstop: if the clamp is ever wrong
again — a window resized after a drag, a toolbar that wraps to a second row —
the chart shrinks instead of leaving the screen.

This is deliberately a *second* line of defence rather than the fix. The clamp is
the fix, because a chart silently shrinking below what the reader dragged is its
own confusing behaviour; the shrink only ever engages where the alternative is
an unreachable overhang.

**Full screen keeps `flex-1 min-h-0` and is untouched.** It ignores `heightPx`
by design, for the reason written on it: the height was dragged against a page
that is not on screen.

## D3 — a resize after a drag re-clamps

A height dragged in a tall window and then read in a short one is the same fault
wearing a different hat, and it is already reachable today through
`rememberedGanttHeight`. The panel re-clamps against the current column on
resize, so the stored number is a *claim* and the column is the authority — the
same shape `rememberedHiddenColumns` uses for storage it does not trust.

The stored value is **not** rewritten by a re-clamp: the reader asked for that
height, and a wider window later should give it back rather than having
quietly forgotten it.

## D4 — why the existing browser suite did not catch this

`e2e/gantt.spec.ts`'s `the chart edge the reader drags` asserts the panel's
*height* after a drag, and the height was correct every time — 337.71 then 757,
exactly what was asked for. It never asserted where the panel's **bottom** was.

A test that measures only the thing being set cannot see the thing being broken.
The new assertion is a containment one: after any drag, the panel's bottom is at
or above the column's bottom. Its negative is the viewport clamp restored,
watched failing on `1200 > 955`.
