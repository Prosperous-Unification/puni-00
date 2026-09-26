## MODIFIED Requirements

### Requirement: Live documents and saved snapshots carry typed relationships

Live documents, saved plans and snapshots SHALL carry SS and FF relationship types with their endpoint scopes and stable identities. Restoring a snapshot SHALL preserve the captured type and SHALL validate its expanded graph before publication.

#### Scenario: Snapshot retains finish coordination

- **GIVEN** a saved plan with A Whole → B QA FF
- **WHEN** the live relationship is changed to FS
- **THEN** the saved plan still records FF and restores FF when selected
