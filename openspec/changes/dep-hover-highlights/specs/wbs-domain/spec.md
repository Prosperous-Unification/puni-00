## ADDED Requirements

### Requirement: Hovering a dependency lights the rows it names

The table SHALL light the row of every work item a Depends on cell
depends on while the pointer rests on that cell; while the pointer rests
on one of the cell's pills, the table SHALL light that one dependency's
row alone, and moving off the pill while staying in the cell SHALL widen
the light back to every dependency. Leaving the cell SHALL put the rows
back. The hovered row itself is never lit: the light answers "what does
this wait for", and the hovered row is the question. That guarantee needs
no filter in the derivation and has none — a row cannot be among its own
dependencies, because `be-01`'s dependency service refuses any edge that
closes a cycle (`service/dependency.ts`) and a self-edge is the shortest
cycle there is. The property is enforced upstream, and the front end
relies on it rather than restating it.

The pill's id SHALL be checked against the hovered cell's current
dependencies rather than trusted. It is a remembered id and the edge under
it can be cut while the pointer has not moved: the ✕ _is_ the pill, so
clicking it unmounts the element and no `mouseleave` of its own can
arrive. Deleting a pill under the pointer SHALL widen the light back to the
remaining dependencies — the pointer is still in the cell — and a `pillId`
the cell no longer names SHALL light nothing.

The hover state SHALL be table-level — `{ rowId, pillId | null } | null`,
`pillId: null` meaning the cell's input area — because a single id list
cannot distinguish "the cell" from "the cell's only pill". It SHALL be
read through the `live` ref inside the column definitions: a hover
re-renders the table, and MUST NOT remount its cells — the `columns` memo
keeps `[roles, unfoldedRoles]` as its whole dependency list, so a focus
and a half-typed value survive the pointer crossing the plan.

The light SHALL land as `data-dep-lit` on the `<tr>` (whose identity is
`data-row-id`), with a stylesheet rule re-pointing `--cell-bg` to the
`--grid-dep-lit` tint — the `tr:hover` precedent — so the pinned cells'
opaque inline backgrounds follow their row instead of painting over the
highlight.

A dependency whose row is collapsed or filtered out has no row on screen
to light, and nothing SHALL be lit in its place — not its parent, not its
neighbour. The hover card SHALL still name it: the card is built from the
tree, never from the rows on screen. A chip the strip has clipped
(`deps-single-line`) has no hover target of its own, and needs none: the
cell-level hover SHALL light every dependency's row, the clipped chip's
included.

While a pill is hovered, the `DependsCard` SHALL render that dependency's
line with the same tint the lit rows use — a background swatch, not bold:
emphasis by weight makes one line read as a heading over the others, and a
second colour would make the card and the grid disagree about what "this
one" looks like. The swatch SHALL be inset from the glyphs, and SHALL give
that inset back as negative margin so emphasising a line does not move it.

"The same tint" is a **direction and not a value**, and SHALL be
per-surface: the same dose of the same ink mixed into whichever background
the emphasis lands on — `--background` for the grid, `--popover` for the
card. One absolute colour cannot do it, because the dark palette puts those
two surfaces either side of any single mix: the rows go lighter and the
card's line goes darker, and one emphasis then points two opposite ways on
one screen. The tint SHALL move the same perceptual direction on both
surfaces in both palettes, and the browser check SHALL assert that
direction rather than the equality of two colours — an equality the default
palette satisfies whatever the dark one does, because there the two
surfaces are the same white.

The light SHALL answer the keyboard as well as the pointer: while a Depends
on cell's box holds the focus, the rows that cell names SHALL be lit, and a
focused pill SHALL narrow the light to its own row exactly as a hovered pill
does. Focus and pointer are two readings of one state and MUST NOT
interfere — a blur cannot clear a live hover, nor a `mouseleave` a live
focus — and the pointer's reading wins while both are live, because the
pointer is where the eyes are. A pill's blur clears where its `mouseleave`
widens: a leave means the pointer is still in the cell, and a blur means
nothing of the sort.

**Narrowed, with the reason stated:** sequential Tab reaches the box and
not the chips, because `deps-single-line` holds a clipped chip out of the
tab order rather than let a Tab focus a button hidden off screen. So the
cell-level light is what a Tab through the plan gets, and the keyboard's
per-pill correspondence is reachable only where focus can land on a chip at
all. This change does not re-open the chips' tab order to close that gap:
that is `deps-single-line`'s decision, made against a fault it watched, and
reversing it here would trade a documented gap for an undocumented layout
shift. The gap is this requirement's boundary, not an oversight.

#### Scenario: the cell lights every dependency's row

- **WHEN** the pointer rests on the Depends on cell of a row waiting for
  010 and 020
- **THEN** 010's and 020's rows are lit — and the hovered row is not

#### Scenario: a pill narrows the light, and leaving it widens it again

- **WHEN** the pointer moves onto the 010 pill, and then off it onto the
  cell's input area
- **THEN** only 010's row is lit while the pointer is on the pill, and
  both rows are lit again once it has left — not stuck on one, not cleared

#### Scenario: the pill's line in the card carries the row's tint

- **WHEN** the pointer rests on the 010 pill and the card is open
- **THEN** the card's `010 - …` line is painted a swatch and no other line
  is, at the card's ordinary weight, inset from the glyphs and without
  moving the line it emphasises

#### Scenario: the tint moves the same way on both surfaces

- **WHEN** the same pill is hovered in the light palette and again in the
  dark one
- **THEN** in each, the lit row's colour and the card line's swatch have
  both moved off the surface each sits on, and both in the same direction —
  darker than both surfaces on a light page, lighter than both on a dark one

#### Scenario: a pill deleted under the pointer widens the light

- **WHEN** the pointer is on the 010 pill of a row waiting for 010 and 020
  and the pill's ✕ is clicked, unmounting the element the pointer is on
- **THEN** the cut edge's row goes dark and 020's stays lit — the light
  widens to the cell, because the cell is where the pointer still is

#### Scenario: the keyboard gets the same light

- **WHEN** the box of a Depends on cell takes the focus with no pointer on
  the plan
- **THEN** the rows that cell names are lit and painted, the cell's own row
  is not, and they go back when the focus leaves the cell

#### Scenario: a hidden dependency lights nothing and is still named

- **WHEN** a dependency's row is inside a collapsed branch and its
  successor's cell is hovered
- **THEN** no row is lit for it, no other row is lit in its place, and the
  hover card names it

#### Scenario: a clipped chip's row still lights from the cell

- **WHEN** the chips overrun the strip so a chip is clipped out of sight,
  and the pointer rests on the cell rather than on any pill
- **THEN** the clipped chip answers no hit test — there is nothing to
  hover — and its dependency's row is lit all the same

#### Scenario: a hover never remounts the cells

- **WHEN** somebody is typing in one cell and the pointer crosses a
  Depends on cell
- **THEN** the dependency rows light and the typed cell keeps its focus,
  its node and its half-typed value
