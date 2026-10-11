## ADDED Requirements

### Requirement: The plan document carries each step's estimate unit

Export SHALL write the plan document version allocated at packet time, whose steps carry
`estimateUnit`. Import SHALL read every earlier version with `workdays` on every step. From
the new version, import SHALL refuse `invalid_body` at the field a missing or unknown unit,
and a trio on a minute-unit step whose points are not whole minutes. The spreadsheet export
SHALL print each step's figures through `showDuration` and name the unit in the step's header.

#### Scenario: a round trip keeps the unit and the minutes

- **GIVEN** a plan with a `minutes` step holding `30 / 40 / 90` on one node
- **WHEN** it is exported and imported into a new project
- **THEN** the imported step reads `minutes` and the node `30 / 40 / 90`

#### Scenario: an older document imports in workdays

- **GIVEN** a version 6 plan document
- **WHEN** it is imported
- **THEN** every step reads `workdays` and every figure is what it was

#### Scenario: a fractional minute is refused

- **GIVEN** a new-version document with a `minutes` step and a `0.5` point on it
- **WHEN** it is imported
- **THEN** it is refused `invalid_body` and no project is created
