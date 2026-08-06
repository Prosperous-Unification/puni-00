## ADDED Requirements

### Requirement: The table scrolls inside its own frame

The work breakdown table SHALL scroll horizontally within a container of its
own rather than scrolling the page, and that container SHALL bound its own
height so it is the scrollport its sticky cells stick to. The toolbar, the
error alerts and the connection banner SHALL stay in place while the table is
scrolled.

#### Scenario: scrolling sideways

- **WHEN** the table is wider than the space it is given
- **THEN** the table's own container scrolls, and the controls above it do not
  move

### Requirement: The column headings survive a long plan

Every column heading SHALL stay against the top of the table's frame while the
rows scroll under it, on an opaque background.

#### Scenario: scrolling down a long plan

- **WHEN** the rows are scrolled
- **THEN** the heading row is still on screen, and no row is visible through it

### Requirement: A row's identity stays on screen while it is read

The drag handle, the Number column and the Name column SHALL stay against the
left edge of the frame while the table is scrolled sideways, on opaque
backgrounds, and SHALL be the first three columns so that they are contiguous
from that edge. "Depends on" SHALL follow Name.

#### Scenario: scrolling out to the dates

- **WHEN** the table is scrolled right until the schedule columns are visible
- **THEN** the handle, the number and the name of every row are still visible,
  and the columns behind them are not showing through

#### Scenario: the order of the first four columns

- **WHEN** the table is rendered
- **THEN** its first four columns are the drag handle, Number, Name and
  "Depends on", in that order
