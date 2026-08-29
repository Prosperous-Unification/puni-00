## MODIFIED Requirements

### Requirement: A cell that opens a popover is exempt from the cell clip

Every table column whose cell opens a list, card, menu or editor SHALL be exempt
from the table cell's clip, because such a cell draws over the rows below. The
Tags and Services columns each render a creatable picker and SHALL be exempt.

A table cell that is clipped SHALL NOT be scrollable. Clipping SHALL be
expressed so that a browser cannot scroll a cell to reveal a focused or opened
descendant, because a scrolled cell draws its own contents outside the row it
belongs to.

#### Scenario: the tag picker's list opens whole

- **GIVEN** a work item's Tags cell
- **WHEN** its search box is focused and the directory list opens
- **THEN** the list SHALL be drawn at its full height below the box
- **AND** the cell's own add button and search box SHALL remain in their row

#### Scenario: an opened cell is not displaced

- **GIVEN** a work item's Tags cell with the picker open
- **WHEN** the cell's position is measured
- **THEN** the strip SHALL be drawn inside the row's own vertical band
- **AND** the cell SHALL report no scroll offset

### Requirement: Editing a reference cell does not move the rows around it

A Tags, Teams or Services cell SHALL wrap its chips into reach while it is
being edited, and SHALL do so without changing the height of its row or the
position of any other row.

While it is being edited the strip SHALL be drawn as a panel over the rows
below: opaque, bordered, anchored to the cell's own top-left corner, and above
every other cell in the table. The add button SHALL be the first control in it,
at rest and while editing alike.

#### Scenario: three tags open without growing the row

- **GIVEN** a work item carrying three tags
- **WHEN** its Tags cell is focused
- **THEN** the row's height SHALL be unchanged
- **AND** every chip and its remove button SHALL be reachable

#### Scenario: the add button never leaves the cell

- **GIVEN** a work item carrying tags that overflow the column
- **WHEN** the cell has been opened and left again
- **THEN** the add button SHALL still be drawn at the leading edge of the cell
