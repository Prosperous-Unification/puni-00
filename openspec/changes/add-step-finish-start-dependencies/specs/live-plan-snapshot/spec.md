## ADDED Requirements

### Requirement: Live documents and saved snapshots carry typed relationships

Live plan documents SHALL publish legacy and typed dependencies distinctly after committed writes. Saved plans and snapshots SHALL freeze each typed relationship's ID, endpoint scopes, step IDs and FS type together with the tree and project steps needed to interpret it. Later edits to live steps or parentage SHALL not silently change a saved snapshot's meaning; restoring one SHALL validate references and graph integrity atomically.

#### Scenario: Later step reorder does not reinterpret a snapshot

- **GIVEN** a saved plan with a dependency on a named step
- **WHEN** live project steps are reordered
- **THEN** the saved dependency still points to the captured step identity

#### Scenario: Live dependency edit is announced

- **GIVEN** two subscribed clients
- **WHEN** one updates a typed dependency
- **THEN** the other receives the committed relationship state and can render its new endpoint label
