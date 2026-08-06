# The table scrolls inside a frame, with the number and the name pinned

## Why

Two UX reviewers, independently, ranked this in their top three. The table is
wider than the screen — `role-columns-fold` bought some of that width back and
did not buy enough — and three things go wrong at once today:

- the **page** scrolls sideways, so the toolbar and the alerts slide off with
  the table;
- the column headings scroll away up the page, and a long plan is then a wall
  of numbers under no headings at all;
- scrolled right, every row is anonymous. The dates are on screen and the row
  they belong to is not.

This supersedes the "No sticky columns / horizontal scroll affordance" non-goal
recorded in `role-columns-fold` — that line said "separate change if the fold
alone is not enough". It was not enough.

## What Changes

**The table gets a frame of its own to scroll in**

- The `<table>` is wrapped in a scroll container. Sideways scrolling happens
  there and nowhere else; the toolbar, the alerts and the connection banner
  stay where they were put.
- The frame scrolls vertically too, and is bounded in height. That is not a
  bonus: `overflow-x: auto` forces the other axis to `auto` as well, and a
  sticky heading only sticks to a scrollport that actually scrolls.

**The headings stay against the top of the frame**

- Every `<th>` is `position: sticky; top: 0` on an opaque background, painted
  over the rows sliding under it.

**Three columns stay against the left edge**

- The drag handle, Number and Name are pinned with `position: sticky; left`,
  at declared widths whose running total is each column's offset.
- Pinned cells are opaque, or the row scrolling behind one shows through it.
- The Number column's indent stops at four levels, so its content cannot
  outgrow the width the offsets are computed from.

**"Depends on" moves to the right of Name**

Sticky columns only line up while they are contiguous from the left edge, so
Name could be pinned or Depends on could be, not both. Name wins: what a
planner needs while reading out to the dates is which row they are on.

This **deliberately reverses** part of the column order asked for on
2026-08-06 and recorded in `wbs-table.test.tsx` as "puts what a row waits for
immediately after its number". The reason given then still holds — a row's
dependencies belong beside its identity, and the numbers in the cell refer to
the Number column — and it survives: the identity of a row is now Number _and_
Name, and Depends on is immediately after both, one column further right than
it was. The test and its justifying comment are rewritten to say this rather
than quietly changed.

## Non-Goals

- **No column resizing, reordering or hiding by the user.** Fixed widths for
  the pinned three; everything else sizes to content as it does now.
- **No pinning of the right-hand end.** The Delete button scrolls away like
  the rest.
- **No full-height page layout.** The frame's height is `100vh` minus a
  written-down estimate of the chrome above it, not a measured remainder — the
  exact figure needs a flex layout from `main` down, which is its own change.
- **No portalled dropdowns.** The pickers stay inside their cells; the frame
  carries bottom padding so one on the last row has room to open into.
