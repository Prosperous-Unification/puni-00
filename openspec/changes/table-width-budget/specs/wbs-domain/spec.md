## MODIFIED Requirements

### Requirement: The table is laid out to the window, not the window to the table

The work breakdown table SHALL take the width of the frame it sits in. Every
column except the name SHALL be laid out at a declared width; the name column
SHALL have none and SHALL absorb whatever the others leave, down to a floor
below which it does not shrink and **up to a cap above which it does not grow**.
The table SHALL declare a minimum width equal to its declared columns plus that
floor, and a maximum equal to the same declared columns plus that cap, both
computed from the columns it is currently showing and from the same resolution.
Above the minimum there SHALL be no horizontal scrolling; below it the frame
SHALL scroll and the handle, number and name SHALL stay held at the left edge,
where they have always been. Above the maximum the table SHALL stop growing and
the frame SHALL keep the difference.

The cap SHALL reach the browser as the table's own width — `min(100%, maximum)`
— and SHALL NOT be expressed as a width or a `max-width` on the name cells: a
cell has no vote on its column's width under a fixed table layout, and a second
declaration of the same number is the two-width-systems fault the resolved frame
layout exists to prevent.

**The two declarations SHALL remain two different numbers, and only the minimum
SHALL decide whether anything scrolls.** The `width` a reader finds on the
`<table>` is the maximum — where growth stops — and reading it as the table's
floor overstates that floor by the whole of the name column's range. The
boundary the folded table is judged at SHALL therefore be measured as the
frame's own `scrollWidth` against its `clientWidth`, at the viewport in
question, with the phases that are really on screen.

A **dragged** name column SHALL outrank the cap, up to the shared ceiling every
column drag is clamped to. The cap is what an unasked table settles at.

An id the width table does not declare SHALL remain an error rather than a
plausible default, and a flexible column SHALL be told apart by membership
rather than by a sentinel width.

#### Scenario: a laptop-width window with the roles folded

- **WHEN** a plan with two roles, both folded, is shown in a 1280px window
- **THEN** every column is on screen and nothing scrolls sideways

#### Scenario: one folded phase at a laptop width

- **WHEN** a plan with a single phase, folded, is shown in a 1280px window
- **THEN** the frame does not scroll sideways
- **AND** the table declares a minimum narrower than the frame, and a `width`
  wider than that minimum by the name column's own range

#### Scenario: the folded boundary between two phases and three

- **GIVEN** a 1280px window
- **WHEN** a third phase is added to a plan whose two folded phases fit
- **THEN** the frame scrolls sideways where it did not before, and the pinned
  handle, number and name hold the left edge

#### Scenario: the name takes what is left

- **WHEN** the window is wider than the table's minimum and the remainder is
  no more than the cap
- **THEN** the name column is wider than its floor by exactly what the other
  columns did not take

#### Scenario: a window wide enough to pass the cap

- **WHEN** the remainder the other columns leave is wider than the cap
- **THEN** the name column is exactly the cap, the table is narrower than the
  frame by the difference, and nothing scrolls sideways

#### Scenario: a dragged name column past the cap

- **WHEN** the name column has been dragged wider than the cap
- **THEN** it is laid out at the width it was dragged to

#### Scenario: a window narrower than the table can be

- **WHEN** the window is narrower than the table's minimum for what it is
  showing
- **THEN** the frame scrolls sideways and the handle, number and name stay at
  its left edge

#### Scenario: a column nobody sized

- **WHEN** a column id that is neither declared nor flexible is laid out
- **THEN** the table refuses it rather than giving it a width

### Requirement: Hovering a dependency lights the rows it names

The table SHALL light the row of every work item a Depends on cell depends on
while the pointer rests on that cell; while the pointer rests on one of the
cell's pills, the table SHALL light that one dependency's row alone, and moving
off the pill while staying in the cell SHALL widen the light back to every
dependency. Leaving the cell SHALL put the rows back. The hovered row itself is
never lit: the light answers "what does this wait for", and the hovered row is
the question.

**The cell SHALL be the whole cell.** The gesture is "the pointer is in this
cell", so the enter and the leave SHALL be taken on the `<td>` and not on a
wrapper inside it: a wrapper stands inside the cell's padding, and the strip it
holds is filled edge to edge by pills at the column's default width — so a cell
whose own padding answers nothing leaves a reader with no place to put the
pointer that says "this cell", and the only thing left to hover is a pill, which
answers a narrower question. Entering the cell over a pill SHALL still settle on
that pill: the cell's own reading arrives first, as the pointer crosses the
cell's boundary, and the pill's own reading arrives after it.

Widening the column SHALL change nothing about which gesture is answered. What
it changes is how much of the cell the pills cover, and that is a fact about the
plan rather than about the affordance.

The pill's id SHALL be checked against the hovered cell's current dependencies
rather than trusted. Deleting a pill under the pointer SHALL widen the light
back to the remaining dependencies — the pointer is still in the cell — and a
`pillId` the cell no longer names SHALL light nothing.

The hover state SHALL be table-level — `{ rowId, pillId | null } | null`,
`pillId: null` meaning the cell rather than one of its pills.

The light SHALL land as `data-dep-lit` on the `<tr>`.

#### Scenario: the pointer rests on the cell

- **GIVEN** a row waiting for two others
- **WHEN** the pointer rests anywhere in that row's Depends on cell that is not
  one of its pills — its padding included
- **THEN** both waited-for rows are lit

#### Scenario: the cell is full of pills at its default width

- **GIVEN** a row waiting for two others, with the Depends on column at the
  width the table resolves for it and its pills covering the strip
- **WHEN** the pointer enters that cell
- **THEN** both waited-for rows are lit, without the pointer having found the
  add button

#### Scenario: the pointer rests on one pill

- **GIVEN** the pointer in a Depends on cell naming two dependencies
- **WHEN** it moves onto one of the pills
- **THEN** that pill's row alone is lit

#### Scenario: the pointer leaves the cell

- **WHEN** the pointer leaves a lit Depends on cell
- **THEN** no row is lit

## ADDED Requirements

### Requirement: The width a plan's phases need is said in a sentence that counts

The Phases surface SHALL say how much width the plan's folded phases need, in
the same figure the table lays itself out by. That sentence SHALL agree in
number with the count it opens with: one phase **needs** a width, several phases
**need** one. A sentence that counts to one and then reads as a plural is the
same defect the chart's blocking-set sentence carried until it was corrected —
copy the reader trips over in the one place the product is quoting arithmetic at
them.

#### Scenario: a plan with one phase

- **WHEN** the Phases surface says how wide a single-phase plan's table has to be
- **THEN** the sentence reads `1 phase needs ≥…`

#### Scenario: a plan with more than one phase

- **WHEN** the Phases surface says how wide a two-phase plan's table has to be
- **THEN** the sentence reads `2 phases need ≥…`
