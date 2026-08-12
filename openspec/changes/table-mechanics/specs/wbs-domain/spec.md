## ADDED Requirements

### Requirement: The motion chords and the row moves reach every cell of the table

Ctrl+H, Ctrl+J, Ctrl+K and Ctrl+L SHALL move the focus left, down, up and right
between cells from **every** editable cell of the grid, and Alt+←, Alt+↑, Alt+↓
and Alt+→ SHALL outdent, move up, move down and indent the focused row from
every one of them. This SHALL hold for the Depends on cell, the Service/team
cell, an assignee cell and the earliest-start cell. The three picker cells
answered none of the eight until this change; the earliest-start cell answered
the four motion chords and none of the four row moves, in the cell at rest and
in its open editor alike.

These eight SHALL be answered whether or not the cell's picker list is open. The
Depends on box and both `CreatablePicker` columns open their list on focus, so a
rule conditioned on the list being shut is a rule that never holds.

The chords that create or destroy a work item — Ctrl+N, Alt+N, Ctrl+D and
Ctrl/⌘+Enter — SHALL still be swallowed by an open picker list, and Escape SHALL
still be how the keyboard is given back to the cell.

A picker's own bare ArrowUp and ArrowDown SHALL still move its list's highlight
and SHALL NOT move the row.

#### Scenario: leaving a Depends on cell whose list is open

- **GIVEN** a plan of three rows and the focus in the second row's Depends on box, its list open
- **WHEN** Ctrl+H is pressed
- **THEN** the focus is in that row's Name cell and the row has not moved

#### Scenario: walking a picker column with the list open

- **GIVEN** the focus in the second row's Service/team box, its list open
- **WHEN** Ctrl+J is pressed
- **THEN** the focus is in the third row's Service/team box

#### Scenario: moving a row from a picker cell

- **GIVEN** the focus in the first row's Depends on box, its list open
- **WHEN** Alt+↓ is pressed
- **THEN** that row and its next sibling have swapped places

#### Scenario: restructuring a row from an assignee cell

- **GIVEN** the focus in the second row's Dev assignee box
- **WHEN** Alt+→ is pressed
- **THEN** that row is indented under the row above it

#### Scenario: moving a row from the earliest-start cell

- **GIVEN** a plan on a calendar and the focus in the second row's earliest-start cell
- **WHEN** Alt+→ is pressed
- **THEN** that row is indented under the row above it

#### Scenario: a chord that makes a row is still held back

- **GIVEN** the focus in a Depends on box with its list open
- **WHEN** Ctrl+N is pressed
- **THEN** no work item is created

#### Scenario: a picker keeps its own bare arrows

- **GIVEN** the focus in a Depends on box with its list open
- **WHEN** ArrowDown is pressed with no modifier
- **THEN** the row has not moved

### Requirement: The Name cell offers no handle to resize it

The Name cell's box SHALL NOT offer a native resize grip. Its height SHALL be
decided by the text in it and by nothing a pointer can drag, so that a row's
height and the height of the chart row beside it cannot be put out of line by a
gesture with no undo.

The box SHALL still grow with the text it is given, up to the resting cap it
already has.

#### Scenario: dragging the bottom-right corner of a Name box

- **GIVEN** a work item with a one-line name
- **WHEN** the bottom-right corner of its Name box is dragged 96 pixels downward
- **THEN** the Name box and its row are the height they were before the drag

#### Scenario: a name that wraps

- **GIVEN** a work item whose name wraps onto more than one line
- **WHEN** its Name box is measured
- **THEN** the box is taller than it is for a one-line name and no line is hidden

### Requirement: The pointer moves a row by the same amount of ink on both phases of the stripe

A hovered row SHALL be visibly distinct from the same row at rest on both
phases of the table's banding, and the change the pointer makes to a banded row
SHALL be the same size as the change it makes to a plain one.

A hovered banded row SHALL be distinct from the resting shade of both a banded
and a plain row, so that the pointer says something no neighbouring row already
says.

#### Scenario: hovering a banded row

- **GIVEN** a plan whose second row is banded
- **WHEN** the pointer is moved onto it
- **THEN** its shade changes by the same amount as a plain row's does, and by a visible amount

#### Scenario: a hovered banded row against its neighbours

- **GIVEN** the row of the previous scenario, hovered
- **THEN** its shade is neither the resting shade of a banded row nor that of a plain one

### Requirement: The shortcuts sheet holds the keyboard like the modal it declares itself to be

While the shortcuts sheet is open, Tab and Shift+Tab SHALL keep the focus
inside it at both ends of its focusable sequence, and SHALL bring the focus
back into it if it is anywhere else on the page.

Escape SHALL close the sheet wherever the focus has got to, not only from
inside it.

A click on the backdrop SHALL close the sheet; a click on the sheet itself
SHALL NOT.

#### Scenario: tabbing round the open sheet

- **GIVEN** the shortcuts sheet open
- **WHEN** Tab is pressed more times than the sheet has focusable stops
- **THEN** the focus is on or inside the sheet after every press

#### Scenario: Escape after the focus has been elsewhere

- **GIVEN** the shortcuts sheet open and the focus outside it
- **WHEN** Escape is pressed
- **THEN** the sheet closes

#### Scenario: clicking away and clicking on it

- **GIVEN** the shortcuts sheet open
- **WHEN** the sheet itself is clicked
- **THEN** it stays open
- **WHEN** the backdrop beside it is clicked
- **THEN** it closes

### Requirement: A deep row's number reads as its own number

A row whose number has four dotted segments SHALL show that number **whole** in
the Number column, and its child — five segments — SHALL show strictly more of
its own number than the whole of its parent's. Whatever the column clips, what
it still draws SHALL tell the two rows apart without a hover, and it SHALL tell
them apart by the segments the deeper row adds rather than by where two clips
happened to land.

The five-segment number itself is NOT undertaken to be whole: it loses its last
glyph to the clip and carries it in the `title`, which is the bargain the
column's declared width makes at every depth past its envelope.

The whole number SHALL still be carried for a hover on both rows, and the
Number column SHALL keep the declared width it has: the reclaimed indent steps
SHALL be carried by the Name cell instead, so that the outline a reader adds up
across the two cells is what it was at every depth.

#### Scenario: a row and its child at depth 4

- **GIVEN** a plan with rows numbered `030.1.1.1` and `030.1.1.1.1`
- **WHEN** their Number cells are read
- **THEN** the first shows `030.1.1.1` whole, the second shows more than that of its own number, and each carries its whole number for a hover

#### Scenario: the outline across the two cells

- **GIVEN** a row deeper than the Number column's indent cap
- **WHEN** its Number indent and its Name indent are added
- **THEN** the sum is one step greater than the same sum for its parent
