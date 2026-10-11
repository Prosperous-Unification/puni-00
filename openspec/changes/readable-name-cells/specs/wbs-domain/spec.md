## ADDED Requirements

### Requirement: A Name cell keeps its notes marker clear of its text

A work item with notes SHALL reserve space for the notes marker at the right edge of its Name
cell. Both the rendered markdown name at rest and the editable source text SHALL wrap before
the marker rather than paint underneath it.

#### Scenario: a long rendered name ends beside the marker

- **GIVEN** a work item with notes and a title long enough to reach the right side of its Name cell
- **WHEN** the title is read at rest
- **THEN** its visible text stays clear of the notes marker and remains inside the Name cell

#### Scenario: the source text uses the same available width

- **GIVEN** a work item with notes and a title long enough to reach the right side of its Name cell
- **WHEN** its Name cell is focused for editing
- **THEN** the source text stays clear of the notes marker and uses the same horizontal inset as
  the rendered title

## MODIFIED Requirements

### Requirement: The table shows Status, Fact start and Fact end, and marks a done row

The table SHALL offer three columns — `Status`, `Fact start`, `Fact end` — hidden by default
and offered in the Columns control in table order after `Deadline`. The Status cell SHALL show
the row's status in words and offer `Unknown` and `Done` to choose, on a parent as on a leaf;
`In progress` SHALL be shown but not offered. The two fact cells SHALL be date cells with the
deadline cell's rest and edit states. A row whose status is `done` SHALL carry `data-row-done`,
and its number SHALL read struck through. DONE status SHALL add no strike or muted ink to its
name, which retains its own Markdown formatting, on every stripe and under every row light.

#### Scenario: the Columns control offers the three in order

- **GIVEN** the Columns control open on a two-step plan
- **WHEN** its entries are read
- **THEN** `Status`, `Fact start`, `Fact end` follow `Deadline` in that order, and none of the
  three is on screen until chosen

#### Scenario: choosing Done marks the row and fills the fact end

- **GIVEN** a leaf reading `Unknown` with the three columns shown
- **WHEN** `Done` is chosen in its Status cell
- **THEN** the row reads `Done`, its number is struck through, DONE status adds no strike to its
  name, and its Fact end cell reads today

#### Scenario: a partly done row reads In progress and can still be finished

- **GIVEN** a leaf whose `Dev` says `done` and whose `QA` says nothing
- **WHEN** its Status cell is read and then opened
- **THEN** it reads `In progress`, and the list offers `Unknown` and `Done` only
