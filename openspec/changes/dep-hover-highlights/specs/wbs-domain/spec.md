## ADDED Requirements

### Requirement: Hovering a dependency lights the rows it names

The table SHALL light the row of every work item a Depends on cell
depends on while the pointer rests on that cell; while the pointer rests
on one of the cell's pills, the table SHALL light that one dependency's
row alone, and moving off the pill while staying in the cell SHALL widen
the light back to every dependency. Leaving the cell SHALL put the rows
back. The hovered row itself is never lit: the light answers "what does
this wait for", and the hovered row is the question.

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
one" looks like.

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
- **THEN** the card's `010 - …` line is painted the lit row's exact
  colour, at the card's ordinary weight, and no other line is

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
