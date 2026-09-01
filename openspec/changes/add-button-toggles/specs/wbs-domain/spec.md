## ADDED Requirements

### Requirement: A reference cell's add button closes what it opened

Every reference cell's `+` — Tags, Teams, Services, Types and Depends on — SHALL
open its picker when the picker's list is not open, and SHALL close that list and
leave the cell at rest when it is.

The question the button asks SHALL be whether the **list** is open, not whether
the box holds the focus. A box holding the focus with no list under it is the
state a reader is in immediately after taking a value, and the `+` SHALL open the
list again from there.

Pressing the `+` SHALL NOT move the keyboard focus onto the button on any press,
opening or closing.

Closing from the `+` SHALL discard exactly what closing from Escape or from a
click outside the cell discards, and SHALL commit nothing the reader has not
taken.

#### Scenario: a second press closes the list

- **GIVEN** a Tags cell whose `+` has been pressed once, so its picker's list is
  open
- **WHEN** the `+` is pressed again
- **THEN** the list SHALL be closed and the cell SHALL be at rest

#### Scenario: a third press opens it again

- **GIVEN** a Tags cell closed by a second press of its `+`
- **WHEN** the `+` is pressed again
- **THEN** the picker's list SHALL be open

#### Scenario: the press after a value is taken still opens

- **GIVEN** a Tags cell whose picker has just taken a value, leaving the box with
  the focus and no list open
- **WHEN** the `+` is pressed
- **THEN** the picker's list SHALL open

#### Scenario: the Depends on cell answers the same way

- **GIVEN** a Depends on cell whose `+` has been pressed once
- **WHEN** the `+` is pressed again
- **THEN** its picker SHALL be closed and the cell SHALL be at rest

#### Scenario: the button never takes the keyboard

- **WHEN** the `+` is pressed to open and then pressed to close
- **THEN** the focus SHALL be on neither press left on the button
