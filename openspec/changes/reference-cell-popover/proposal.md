<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany opened a Tags cell on 2026-08-29 at 22:40 and got a list card hanging over
the row below, cut to a sliver, with the cell's own `+` and search box gone from
the row entirely. Adding a tag then stood the row two lines tall and pushed
every row under it down. Three screenshots, one cause.

`POPOVER_COLUMNS` in `wbs-table.tsx` lists `team` and not `tag` or `service`,
although all three render a `CreatablePicker`. So those two `<td>`s keep
`CELL`'s `overflow: hidden`. The picker's list is an absolutely positioned child
**inside** the cell, so the cell's `scrollHeight` becomes 94px against a 26px
row — and Chromium scrolls the cell to reveal what opened in it. Measured in the
running dev server: `td.scrollTop === 22`, the strip drawn 21px above the cell
it belongs to. The missing `+` is that scroll, not a missing button.

The second fault is that editing wraps in flow. The wrap is right — a chip
clipped out of sight is a member nobody can remove — but it is real layout, so
the row grows while a cell is open and every row below it moves.

## What Changes

**Every column holding a picker is exempt from the cell clip.** `tag` and
`service` join `POPOVER_COLUMNS`. The set is the thing that decides, so a
column that grows a popover and does not join it is the whole of this bug.

**A clipped cell can no longer be scrolled.** `CELL` clips with `overflow:
clip` rather than `hidden`. A `hidden` box is a scroll container the browser may
scroll to reveal a focused or opened descendant; a `clip` box is not one. This
makes the displacement above structurally impossible in every cell, including
the ones nobody has opened yet.

**An edited reference cell opens as a panel, not as a taller row.** The strip
leaves the flow while it is being edited: an opaque bordered panel anchored to
the cell's top-left, wrapping its chips, over the rows below. The row's height
is the same at rest and open. The `+` is always the first thing in it.

## Non-Goals

Not the Depends-on cell, which already opens correctly. Not the phone sheet.
No change to what a cell stores, to inheritance, or to the directory.
