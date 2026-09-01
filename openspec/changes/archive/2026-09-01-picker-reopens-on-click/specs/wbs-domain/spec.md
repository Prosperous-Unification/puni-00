## MODIFIED Requirements

### Requirement: A reference cell offers the rest of the directory on a click

Where a reference picker's list is closed, clicking its box SHALL open the list,
whether or not the box already holds the keyboard focus.

Its `+` control SHALL open the same list from either state.

Where the list is already open, a click in the box SHALL change nothing: any
text already typed SHALL remain, and the lines offered SHALL remain the ones
that text ranked.

This SHALL hold for every surface the shared picker is rendered on — Teams,
Tags, Services and Types.

#### Scenario: adding a second value without leaving the cell

- **GIVEN** a row whose Tags cell has just taken one value, with the box still
  holding the focus and no list open
- **WHEN** the box is clicked
- **THEN** the list SHALL open offering every tag in the directory that is not
  already on the row

#### Scenario: the + on a focused box

- **GIVEN** the same state
- **WHEN** the `+` beside the box is pressed
- **THEN** the list SHALL open

#### Scenario: a click inside an open picker

- **GIVEN** a picker whose box holds a partly typed search
- **WHEN** the box is clicked
- **THEN** the typed text SHALL remain and the lines offered SHALL be unchanged
