<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany, 2026-09-01, having watched the shipped chart:

1. **"highlighted row is colored independently of which odd or even row this
   is"**
2. **"when i hover over gantt chart rows they must also be highlighted, not only
   when i hover over the item on gantt chart"**

`linked-row-hover` settled the first one the other way on purpose: the plan
renderer's own hovered row was left carrying the _hover_ tint rather than the
row light, so the alternating band would keep showing through. The two tints
differ — `--grid-hover` on an odd stripe, `--grid-band-hover` on an even one —
and a reader sweeping the table sees the highlight change colour every row. Read
on screen rather than in a rule, that is the defect the rule was written to
avoid.

The second is a gap rather than a reversal. The chart lights a row from a
**bar** or a **row label** and from nothing else, so the plot area — most of a
row's width — points nothing. Measured: the pointer on a row's own line, past
the end of its bar, leaves every face dark.

## What Changes

- The **pointed row** is one concept with one ink on both faces. A row the
  pointer rests on in the plan renderer carries the row light like any other,
  so the alternating band no longer decides its colour.
- A chart row's **whole line** points that row, not just the marks on it. The
  bar keeps its own hover — the surface it opens is a bar's, not a row's — and
  the row beneath it stays pointed while the pointer is anywhere on that line.
- Nothing else about the light moves: still at most one row, still immediate on
  both faces, still cleared by the pointer leaving, still scrolling nothing.

## Non-goals

- No change to the ink itself. `--grid-dep-lit` is what a hovered Depends on
  cell already paints, and one tint for "the row you are asking about" is the
  rule this keeps.
- No hover card for a chart row. Pointing a row is a tint; the card belongs to
  the bar that has something to say.
- No change to the keyboard. A focused bar still points its row.

## Constraints

- The hit surface must sit **under** the bars, or a bar's own hover and the
  surface it opens stop working.
