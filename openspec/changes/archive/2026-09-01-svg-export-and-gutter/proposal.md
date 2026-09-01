<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Two faults in the standalone Gantt `.svg`, both found by Dany opening a
downloaded file on 2026-08-31.

**The download is where nobody looks for it.** `gantt-svg-download` put it on
the chart's own control strip as a `⇩` glyph, beside `Full`. Every other way a
plan leaves this app — Markdown, Mermaid, CSV, the rows on screen — is in the
toolbar's Export menu, and a reader looking for "how do I get a picture of
this" opens that menu and finds four text exports and no chart.

**The names run under the chart.** The label column in the file is
`LABEL_COLUMN_PX`, a constant, and the labels are `<text>` with nothing
clipping them. A name longer than 176px is drawn straight across the divider
into the plot, where the bars — appended after it — paint over it. The live
panel does not have this fault: its labels are HTML in a box that truncates.

## What Changes

- The Export menu gains `Download chart as SVG`, downloading the same file the
  panel's glyph does. With no chart on screen it refuses out loud, as the two
  Mermaid exports already refuse a plan no gantt can be drawn of.
- The panel's own glyph stays: it is where the chart is.
- The downloaded file's label gutter is measured from the widest label it
  actually draws, so every name ends before the first day column.

## Non-goals

- The live panel's label column keeps its constant width and its truncation.
  A column that resized itself to the longest name would take the chart's room
  on the screen the chart is the point of.
- No new export format, and no change to what the file draws.

## Constraints

- jsdom computes no layout and implements no `getComputedTextLength`; the
  oracle for a measured width is Chromium.
- The builder nests a clone of the **live** `<svg>`, so a chart that is not on
  screen cannot be serialized at all — the refusal is a modeled state, not a
  degradation.
