<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany, 2026-09-09, minutes after the notes preview was pulled clear of its marker lane:
**"also can you please make sure that same scheme works for all cells hover ons — i want to
be able to move cursor up and down and see other hover-ons"**.

A plan is read **down a column**: point one row's Start cell, then the next row's, then the
next. Seven columns open a card that hangs over the rows below, so every one of them is a
place that gesture can die. Measured in Chromium, three rows deep, with the four reference
columns on screen:

- **Start, Types, Tags, the folded step columns** — the card is pointer-transparent, the hit
  test goes through it to the trigger below, and the walk already worked.
- **Links** — beside its cell since this morning, column clear, worked.
- **The notes preview** — the `left: -24px` pull shipped this morning is capped at `100%` of
  its cell, and a minimum width of 260px beats that cap the moment the cell is narrower. With
  the reference columns on screen the Name cell is **192px**: the card stood 44px over the
  lane again and `elementFromPoint` at the next row's marker answered the card's own `H1`.
- **Depends on** — every line of that card takes the pointer (that is how the light narrows to
  one row), the card stood under its cell, and the pointer walking down landed on a line. Worse,
  the bridge that holds an open card while the pointer crosses it was **holding the enter that
  crosses a row boundary**, because two rows share the pixel row where they meet.

## What Changes

- `clearsMarkerLane` anchors the card by its **right** edge (`right: 24px`) instead of pulling
  `left` negative. Anchoring the edge that has to stay clear holds at any column width; the
  width cap it replaces is deleted.
- The dependency card opens **beside** its cell, the links card's scheme.
- `dependencyPointerRegion`'s corridor is the **card's own rectangle**, not the bounding box of
  the owner and its lines — that box filled the whole area below the cell, which is the next
  row's own cell.
- `entersThroughDependsCard` holds an enter only on the card or one of its lines. Neither
  `outside` nor `owner`: an enter crossing a row boundary lands inside the row above's own
  rectangle, and holding it left the next row unable to answer.

## Non-goals

- No change to the transparent cards. A card nothing is clicked in may stand where it likes.
- No hover-intent, no grace period. Nothing here delays a card.

## Constraints

- Every column is measured, not argued: the property is a conjunction of placement, pointer
  events and trigger shape, and each column combines those differently.
