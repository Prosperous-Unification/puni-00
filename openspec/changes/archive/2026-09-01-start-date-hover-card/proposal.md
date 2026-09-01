<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany, 2026-08-31: **hovering the Start date must give an instant tooltip, and
not the native one.**

The sentence that explains a row's start day — the whole day, then what is
holding it there — is a `title` on the Start `<td>`. `title` is the browser's,
not this app's: Chromium waits about a second before drawing one, draws it in
the platform's chrome rather than the page's, and puts it where the pointer is
rather than under the cell. Nothing in a stylesheet reaches any of that.

This app already answered the same question everywhere else. The folded step
cell says it in its own comment — _"no native `title` here: the card is this
cell's one hint, and a browser tooltip raced it over the same pixels"_ — and
the Name, Depends-on, Links and four reference cells all open a `HoverCard` on
`mouseenter` with no timer at all. The Start cell is the one that was left
behind, and it is the third time this ask has come back: it was item 3 of the
2026-08-31 cell batch and item 2 of the batch after it.

## What Changes

- The Start cell opens the same sentence as a `HoverCard`, on `mouseenter` and
  on focus, and its `<td>` loses its `title` entirely.
- `start` joins `POPOVER_COLUMNS`, without which the card is cut off at a 52px
  column.
- The `<td>` keeps `tabIndex`, gains `aria-describedby` pointing at the open
  card, and keeps `cursor: help` and the span's dotted underline.
- The sentence stays in the DOM at rest as `data-start-said`, because two test
  oracles and one e2e fixture read the whole day back out of this cell and
  none of them can hover.

## Non-goals

- The End cell keeps its `title`. It says a different kind of thing (a day and
  a marker's meaning), Dany did not name it, and one cell at a time is how the
  four reference cells were done.
- No change to the sentence itself, to `startFloorByRow`, or to which rows have
  one.
- The card is not made interactive: it is read, so it keeps `HoverCard`'s
  default of taking no pointer.

## Constraints

- A native tooltip is not in the DOM, so "instant" can only be measured as the
  card being open in the frame the pointer arrived — one read, never a retry.
