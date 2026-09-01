<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany, 2026-08-31: **priority cells want a Jira-style chevron beside the numeric
value, corresponding to the assigned level.**

The Prio cell prints a number in its band's ink and nothing else. Colour is the
only channel it spends, and it is the wrong one to spend alone:

- **It says nothing to a reader who cannot separate the hues.** The ramp
  diverges around rank 2 by _chroma_ at one lightness band, on purpose
  (`priority-band-style.ts`), so the three cool rungs differ in saturation and
  in almost nothing else. That is the shape colour-blindness reads worst.
- **A number is not a rung.** `30` is High only if you know this project's
  ladder. Two projects can cut the ladder differently, and the same `30` then
  names two different rungs — a fact today's cell shows only in its `title`.
- Every tool this audience uses draws the rung as an arrow. Jira's ladder is
  the reference Dany named, and its glyphs are read without being learned.

## What Changes

- The Prio cell draws a small glyph beside its number, chosen by the band's
  **rank** and painted in that band's own ink: a double chevron up at rank 0, a
  single up at rank 1, a bar at rank 2, a single down at rank 3, a double down
  at rank 4.
- Nothing is drawn for a work item nobody has prioritised, which is the column's
  existing "blank at rest" bargain.
- The glyph is decoration for a screen reader: the cell's `title` already names
  the band and the number, and a second reading of it is noise.

## Non-goals

- No change to the ink, the ladder, the numbers, or what typing does.
- The 48px column does not get wider. If the glyph and the digits cannot share
  it, the glyph goes rather than the column growing — the compaction Dany asked
  for on 2026-08-08 stands.
- The cards, the chart and the export keep the ink alone for now. This is the
  cell Dany pointed at, and one face is where a glyph earns the room.

## Constraints

- A ladder is exactly five rungs (`PRIORITY_BAND_COUNT`), so five glyphs is the
  whole set and no shape has to be interpolated.
- The glyph must not take the pointer: the cell's click opens the band list.
