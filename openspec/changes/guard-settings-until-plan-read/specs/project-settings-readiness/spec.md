## ADDED Requirements

### Requirement: Settings wait for the initial plan read

The Project settings control SHALL remain disabled until the initial plan read supplies the project's priority ladder. Opening settings SHALL seed editors from those authoritative settings and SHALL preserve uncommitted drafts when switching sections.

#### Scenario: Initial read is delayed

- **WHEN** the initial work-items GET has not completed
- **THEN** Project settings is disabled and no settings dialog opens

#### Scenario: Initial read completes

- **WHEN** the initial work-items GET supplies the project's settings
- **THEN** Project settings becomes enabled and the Priorities section displays the supplied bands

#### Scenario: An editor has an uncommitted draft

- **WHEN** the user changes a priority band name and switches sections before saving
- **THEN** returning to Priorities preserves the edited name
