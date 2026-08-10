## MODIFIED Requirements

### Requirement: The notes marker is legible and forwards its press

The notes marker SHALL be legible at a glance beside the name it annotates —
sized and coloured as ink rather than as furniture — while staying what it is:
not a control, no focus of its own, no place in the keyboard grid, pointer
events on its own area alone. A press on the marker SHALL land the caret in
the Name cell's own box rather than dying on the glyph.

#### Scenario: the marker can be seen

- **WHEN** a row with notes is shown
- **THEN** its marker renders at a size and colour distinguishable from the
  resize furniture beside it

#### Scenario: a press reaches the name

- **WHEN** the marker is pressed
- **THEN** the Name cell's box holds the focus
