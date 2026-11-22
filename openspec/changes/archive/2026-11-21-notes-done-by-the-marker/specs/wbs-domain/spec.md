## MODIFIED Requirements

### Requirement: The notes editor closes on Escape and on Done, and both save

While a work item's Name box is being written in, Escape SHALL commit what is in the box through
the same blur path as leaving it does. A Done button SHALL stand in the Name cell's top-right, beside
the notes marker, and SHALL do the same on a pointer press. Both exits SHALL collapse the box to
its at-rest height and close the rendered-notes panel. Neither SHALL discard anything. Done SHALL
stay out of the tab order, and Escape SHALL remain the keyboard exit. The rendered editing and
hover previews SHALL match.

#### Scenario: Escape saves and closes

- **GIVEN** the Name box open with notes typed into it
- **WHEN** Escape is pressed
- **THEN** the notes SHALL be saved as typed
- **AND** the box SHALL be at its rested height and no longer focused
- **AND** the rendered-notes panel SHALL be gone

#### Scenario: Done saves and closes

- **GIVEN** the Name box open with notes typed into it
- **WHEN** the Done button beside the notes marker is pressed
- **THEN** the notes SHALL be saved as typed
- **AND** the box SHALL be at its rested height and the panel gone

#### Scenario: Done is what the pointer lands on

- **GIVEN** the Name box open with the rendered-notes panel visible
- **THEN** a hit test at the centre of the Done button in the Name cell SHALL answer the button
  rather than the underlying row

#### Scenario: Done stands by the notes marker and saves

- **GIVEN** the Name box open with notes typed into it
- **THEN** the Done button SHALL be beside the notes marker in the cell's top-right
- **AND** a hit test at its centre SHALL answer the button
- **WHEN** it is pressed
- **THEN** the notes SHALL be saved as typed and the editor closed
