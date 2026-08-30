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

A **dragged** name column SHALL outrank the cap, up to the shared ceiling every
column drag is clamped to. The cap is what an unasked table settles at.

An id the width table does not declare SHALL remain an error rather than a
plausible default, and a flexible column SHALL be told apart by membership
rather than by a sentinel width.

#### Scenario: a laptop-width window with the roles folded

- **WHEN** a plan with two roles, both folded, is shown in a 1280px window
- **THEN** every column is on screen and nothing scrolls sideways

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

## ADDED Requirements

### Requirement: The grid body is typed for a grid

The table's body SHALL be set at 13px over a 1.4 line — the cells and the boxes
typed into them. The buttons inside them SHALL NOT be typed with it: the app's
reset stops at the grid deliberately, so a control it does not reach keeps the
platform's own 13.33px face, and that third of a pixel between a button and its
cell is the only thing any test can read to tell an intact reset guard from a
lost one. A rule one layer up which types the buttons too leaves the guard
standing and blinds its oracle, which is why a control inside the grid SHALL
keep the platform's own size. A row holding one line of text SHALL be no taller
than 28px.

The boxes SHALL NOT sit on their line's baseline: an `inline-block` box reserves
descender room no glyph in it uses, which is 5px of every row.

This SHALL NOT reach the phone's cards, which carry the same `data-grid`
attribute so the keyboard grid can find them and are not cells in a fixed
column.

Every fixed column keeps the width it was measured at. Nothing SHALL clip, and
the declared width of each column SHALL remain at least what the browser needs
to draw its envelope.

#### Scenario: a cell and the box in it

- **WHEN** the plan table is drawn
- **THEN** a body cell and the box inside it are both 13px, and both are
  smaller than the page's own type

#### Scenario: a button in a cell

- **WHEN** a control inside a body cell is drawn
- **THEN** its type is the platform's own and not its cell's, so a reader of the
  two sizes can still tell the reset guard is there

#### Scenario: a row holding one line

- **WHEN** a work item's name fits one line of its column
- **THEN** its row is no taller than 28px

#### Scenario: a phone's card

- **WHEN** the plan is drawn as cards at a phone's width
- **THEN** the card's type is the page's, not the grid's

### Requirement: A heading may be a mark, and still says its word

A column whose heading is a mark rather than a word SHALL carry the word as the
heading cell's accessible name, declared on the column definition beside the
mark it stands for. The numbering column SHALL head as `#`, and the three
estimate points as `o`, `r` and `p` — the shorthand their own cells already take
(`2/3/8`) and print as a placeholder.

A point column SHALL be 44px, which the word it used to print never fitted in:
`optimistic` needs 84px and drew as `optimi` in 52.

#### Scenario: the numbering column's heading

- **WHEN** the plan table is drawn
- **THEN** the heading over the numbers reads `#` and is named "Number"

#### Scenario: an unfolded role's three points

- **WHEN** a role's estimates are unfolded
- **THEN** the three headings read `o`, `r` and `p`, each named for its point
  and carrying the word as its `title`
