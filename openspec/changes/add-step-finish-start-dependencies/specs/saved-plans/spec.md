## ADDED Requirements

### Requirement: Saved plans retain typed dependency history

A saved plan SHALL capture each typed relationship's stable ID, endpoint scopes, step IDs and FS type with the tree and project-step identities needed to interpret it. Historical reads SHALL display that captured meaning after live edits to steps, parentage or relationships. Saved plans remain immutable inspection records; this change SHALL NOT introduce restoration of a saved plan into the live project.

#### Scenario: Later step reorder does not reinterpret history

- **GIVEN** a saved plan with a dependency on a named step
- **WHEN** live project steps are reordered and the saved plan is read
- **THEN** the saved dependency still points to the captured step identity

#### Scenario: Later relationship edit does not rewrite history

- **GIVEN** a saved FS relationship
- **WHEN** its live counterpart is changed or removed
- **THEN** the saved plan still displays its captured FS endpoints
