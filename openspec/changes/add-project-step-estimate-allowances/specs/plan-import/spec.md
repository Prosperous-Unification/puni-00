## ADDED Requirements

### Requirement: Plan transfer preserves project-step allowances

Current export and whole-project copy SHALL include each step's allowance. Current-format import SHALL require a valid allowance on every step and refuse malformed or missing values. An explicitly recognized legacy format SHALL convert its absent allowance to zero. First-child hand-down and subtree duplication SHALL copy base estimates, and the destination project's step policy SHALL charge them exactly once.

#### Scenario: A new-format plan round trips

- **GIVEN** an exported project whose QA step has a 30% allowance
- **WHEN** it is imported as a new project
- **THEN** QA retains 30% and its charged estimates match the source

#### Scenario: Legacy and malformed current files differ

- **GIVEN** a legacy file without allowance and a current-format file missing allowance
- **WHEN** each is imported
- **THEN** the legacy converter supplies zero and the current-format file is refused
