## MODIFIED Requirements

### Requirement: Saved plans retain typed dependency history

A saved plan SHALL capture each typed relationship's stable relationship ID, FS, SS or FF type, endpoint scopes, owning project IDs, work-item IDs, applicable step node IDs and step IDs, step codes and work-item numbers with the tree and project-step identities needed to interpret it. Historical reads SHALL display that captured meaning after live edits to steps, parentage or relationships. Saved plans remain immutable inspection records and SHALL NOT be restored into the live project by this change.

#### Scenario: Later step reorder does not reinterpret history

- **GIVEN** a saved plan with a dependency on a named step
- **WHEN** live project steps are reordered and the saved plan is read
- **THEN** the saved dependency still points to the captured step identity

#### Scenario: Later relationship edit does not rewrite history

- **GIVEN** a saved FS relationship
- **WHEN** its live counterpart is changed or removed
- **THEN** the saved plan still displays its captured FS endpoints

#### Scenario: Later step reorder preserves a saved SS relationship

- **GIVEN** a saved plan with an SS dependency on a named step
- **WHEN** live project steps are reordered and the saved plan is read
- **THEN** the saved dependency still points to the captured step identity

#### Scenario: Later relationship edits preserve a saved FF relationship

- **GIVEN** a saved FF relationship
- **WHEN** its live counterpart is changed to FS or removed
- **THEN** the saved plan still displays FF and its captured endpoints
