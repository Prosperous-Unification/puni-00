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
