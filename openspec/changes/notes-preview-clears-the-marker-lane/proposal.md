<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany, 2026-09-09, minutes after `links-card-takes-the-pointer` merged: **"pls do the same for
markdown preview on the name - move the preview tooltip window slightly to the left - so that
preview icons can be scrolled down and up by moving the mouse"**.

The Name cell's `≡` notes marker is `right: 1` on every row, so the markers stand in a column
at the cells' right edge — a lane forty rows tall that a reader runs down to skim one plan's
notes. The preview opened at `left: 0` and takes every pixel of its cell, so its right edge
landed **on that lane**. Measured in the running app before the change: 41 markers at x
685–700, the preview at `[145, 240, 555, 370]` with `pointerEvents: "auto"`, and
`elementFromPoint` at the next marker down answering the preview's own `DIV`. One row's notes
were readable, and the pointer could not get to a second without leaving the column.

The links card was fixed by opening **beside** its cell. That does not transfer: the preview is
up to 640px of document and the Name column is the widest column there is, so sideways puts it
off the plan entirely — and the preview flips **above** its cell for a row low in the table,
which would cover the lane upward instead. A horizontal pull is out of the way whichever side
the card opens on.

## What Changes

- `HoverCard` gains **`clearsMarkerLane`**: the card is drawn 24px left of its cell rather than
  at its left edge, and its width ceiling becomes `100%` of the cell as well as the pixel cap.
- `HoverPreview` — the Name cell's rendered-markdown card — passes it. Nothing else does: a
  card whose cell has no marker lane has nothing to clear.
- The width cap is half the fix, not decoration. An absolutely positioned box shrinks to fit
  the room between its `left` and its containing block's right edge, so the pull without the cap
  simply grows the 24px back. Both halves were watched failing on the same figure.

## Non-goals

- No change to which side the preview opens on, or to its size. It is the same card, 24px left.
- No pull on the other anchored cards. They are `left: 0` under cells with no lane over them.

## Constraints

- The proof needs a card wide enough to reach the lane. A preview holding one short sentence
  shrinks to fit inside its cell and cannot cover anything — the first cut of this test was
  watched passing with the whole change reverted.
