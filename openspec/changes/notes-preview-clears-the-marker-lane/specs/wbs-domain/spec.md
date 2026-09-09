## ADDED Requirements

### Requirement: A hover card leaves the lane of its own triggers clear

A hover card SHALL be placed clear of the column its own triggers stand in, where they stand in
one shared by every row — the Name cell's notes marker — so that a pointer running down that
column reaches each row's trigger in turn without the open card in the way.

The card's width ceiling SHALL include the width of its cell, so that a card placed clear of the
lane cannot grow back over it.

#### Scenario: the preview stands clear of the marker column

- **GIVEN** three consecutive work items whose notes are long enough that the preview takes
  every pixel of width its cell allows
- **WHEN** the first row's notes marker is hovered and the open preview is measured
- **THEN** the preview's right edge SHALL be at or before the left edge of the next row's marker
- **AND** the preview SHALL reach vertically past the next row, so that the measurement is taken
  where the marker would otherwise be covered

#### Scenario: the pointer walks down the marker column

- **GIVEN** a notes preview open from the first of three rows carrying notes
- **WHEN** the pointer moves, in steps, onto the second row's marker and then the third's
- **THEN** each row's own notes preview SHALL be on screen after its marker is reached
