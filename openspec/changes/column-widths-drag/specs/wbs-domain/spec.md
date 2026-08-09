## ADDED Requirements

### Requirement: A column with a declared width can be dragged to another width

Every column the table declares a width for SHALL carry a resize handle on its
header's trailing edge, and dragging that handle SHALL set a **column width
override** for it. The overrides in force SHALL be carried in the frame layout
state — the one object the frame layout already takes every plan-dependent fact
in — and resolved inside the frame layout, so the `<colgroup>`, the table
minimum width, the folded table minimum width and the pinned offsets all move
together: a resized column MUST NOT be laid out at one width while an offset is
summed from another.

An override SHALL be stored and looked up under the column's **own** id — the
id the table renders that column by, `<roleId>-final` for a folded role — and
every consumer of the frame layout SHALL therefore ask about real column ids.
A figure quoted for stand-in ids invented from a count, as the folded table
minimum once was, would answer about columns no override can ever be stored
for.

The **flexible column** SHALL NOT be draggable and SHALL NOT carry a handle: it
is the remainder-absorber above its floor, and asking for its declared width is
already an error.

A drag SHALL clamp the width to a floor of 36px, or to the column's own
resolved default where that default is already narrower, and to a ceiling of
**600px**. That ceiling SHALL be one named constant declared beside the widths
themselves and read by both the drag and the stored-width check below, so no
drag can produce a width a reload would reject. 600 is three times the flexible
column's own floor and most of a 900px window: a column dragged past it is a
gesture that got away, not a preference. A column MUST NOT be draggable to a
width no stored value would be accepted at.

Dragging SHALL NOT rebuild the table's column definitions. A width MUST NOT
enter a column definition, because rebuilding them remounts every cell and
takes the focus and any half-typed value with it.

#### Scenario: dragging a fixed column wider

- **GIVEN** the Number column at its resolved default
- **WHEN** its header handle is dragged 40px to the right
- **THEN** the column is laid out 40px wider, the table's minimum width has
  grown by 40, and every pinned column after it sits 40px further from the
  left edge

#### Scenario: the Name column offers no handle

- **WHEN** the header row is read
- **THEN** every column with a declared width has a resize handle and the Name
  column has none

#### Scenario: the floor is the narrower of 36 and the default

- **GIVEN** the drag-handle column, whose default is 24px
- **WHEN** its handle is dragged far to the left
- **THEN** it stops at 24px rather than being pushed out to 36

#### Scenario: a resized folded role moves the figure the Phases dialog quotes

- **GIVEN** a project whose folded column for one role has been dragged wider
- **WHEN** the Phases dialog says how wide that project's phases make the table
- **THEN** the figure carries the dragged width, because the folded minimum is
  resolved from that role's own column id, and it equals the `min-width` the
  table is really laid out with

#### Scenario: the ceiling is the same number in both directions

- **WHEN** a column is dragged as far right as it will go and the browser is
  then reloaded
- **THEN** the width it stopped at is read back and applied, because the drag
  clamps to the ceiling the stored-width check accepts up to

#### Scenario: a drag does not disturb what is being typed

- **GIVEN** a half-typed name in a cell, with the caret in it
- **WHEN** another column's width changes
- **THEN** the caret and the half-typed value are still there

### Requirement: Remembered widths are a claim, not a fact

The overrides in force SHALL be remembered per project and per browser, under
`wbs.columnWidths.<projectId>`, as the expansion beside them is. Nothing SHALL
be sent to be-01: widths are one reader's, never the project's.

What is read back SHALL be validated at that boundary. Storage that does not
parse, or that parses to something that is not a map of column ids to widths,
SHALL have the key dropped and the table SHALL open at its resolved defaults.
An entry naming a column the frame layout cannot size SHALL be dropped on its
own, as SHALL an entry whose width is not a finite number inside the same range
a drag clamps to — that column's floor up to the 600px ceiling, read from the
same constant the drag reads. Surviving entries SHALL still apply.

An entry naming a role this project no longer holds SHALL be harmless: it is
never looked at, exactly as a remembered expansion's deleted row ids are.

Validation MUST NOT be inferred from reading the code. Each dropped-entry rule
SHALL have a negative test watched failing with that rule's line removed.

#### Scenario: unparseable storage

- **GIVEN** `wbs.columnWidths.<projectId>` holding text that is not JSON
- **WHEN** the project is opened
- **THEN** every column is at its resolved default and the key is gone

#### Scenario: one bad entry does not take the good ones

- **GIVEN** stored widths naming Number at 140 and a column id nothing can size
- **WHEN** the project is opened
- **THEN** Number is 140 and the unsizable id is not laid out at all

#### Scenario: a width outside the drag's range

- **GIVEN** a stored width that is not finite, and one far above the ceiling
- **WHEN** the project is opened
- **THEN** both are dropped and those columns are at their resolved defaults

#### Scenario: widths survive a reload

- **GIVEN** Number dragged to 140
- **WHEN** the browser is reloaded onto the same project
- **THEN** Number is laid out at 140

### Requirement: An override outranks the width the table resolves

A stored or dragged override SHALL take precedence over the default the frame
layout resolves for that column, including a default that is not constant. The
not-before column resolves to one of two widths depending on whether any row in
the project sets a date; an override on it SHALL freeze it at the overridden
width, and the resolved default flipping between its two states SHALL NOT move
it.

An override on one column SHALL NOT change any other column's resolved default.

#### Scenario: an override freezes a two-state width

- **GIVEN** not-before overridden to 110px while no row in the project sets a
  date
- **WHEN** a row is given a not-before date, which would otherwise widen the
  column
- **THEN** the column is still 110px

#### Scenario: an override applies over the default it replaces

- **GIVEN** a stored width for Depends on that differs from its default
- **WHEN** the project is opened
- **THEN** Depends on is laid out at the stored width

### Requirement: Resetting forgets the widths rather than freezing them

The table SHALL offer a reset that removes the stored key for the project and
drops every override in force. Each column SHALL then be laid out at the width
the frame layout resolves for it **now** — the reset MUST NOT write a snapshot
of any width, including the defaults as they stood when it was pressed.

The reset SHALL be offered only while at least one override is in force: a
control that provably does nothing reads as a broken one.

#### Scenario: reset returns a column to today's default, not yesterday's

- **GIVEN** not-before overridden while no row in the project sets a date, and
  a row has since been given one — so its resolved default has changed
- **WHEN** the widths are reset
- **THEN** not-before is laid out at the default that holds now, and the
  stored key is gone

#### Scenario: reset is absent with nothing to reset

- **GIVEN** a project no column has been dragged in
- **WHEN** the table is rendered
- **THEN** no reset control is offered

### Requirement: Width controls belong to the table and to nothing else

Resize handles and the reset SHALL be rendered by the table renderer alone. The
outline cards SHALL offer neither, and the Plan actions sheet — the only route
to the toolbar's controls on a phone — SHALL offer no width control at all,
because a card has no columns to widen.

The reset MUST NOT be added to the shared toolbar controls: that one array is
rendered both in the desktop toolbar row and in the sheet, so a control put
there reaches the phone by construction.

#### Scenario: the Plan actions sheet offers no width control

- **GIVEN** a viewport narrow enough that the outline cards are the plan
  renderer
- **WHEN** the Plan actions sheet is opened
- **THEN** it offers no reset of column widths and no resize control

#### Scenario: the cards carry no handles

- **WHEN** the plan is rendered as outline cards
- **THEN** no resize handle exists anywhere on the page
