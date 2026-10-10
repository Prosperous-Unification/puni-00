## ADDED Requirements

### Requirement: The plan document carries points and size templates

Export SHALL write the plan document version allocated at packet time, whose measures carry
`points_estimate` beside the other metrics and whose settings carry `sizeTemplates` (name,
position, per-step rows keyed by step code with unit, trio and optional token estimate).
Import SHALL read every earlier version with no points and no templates. From the new version
it SHALL refuse `invalid_body` a non-integer point, a template row naming an unknown step
code, and a template row whose unit is not that step's unit. The spreadsheet export SHALL
carry a points column per step.

#### Scenario: a round trip keeps points and templates

- **GIVEN** a plan with `points_estimate` `5` on `010.dev` and template `L` with a `Dev` row
- **WHEN** it is exported and imported into a new project
- **THEN** the imported node reads `5` points and the project holds `L` with the same row

#### Scenario: an earlier document imports without them

- **GIVEN** a version 6 plan document
- **WHEN** it is imported
- **THEN** no node holds points and the project holds no templates

#### Scenario: a template in the wrong unit is refused

- **GIVEN** a new-version document whose `Dev` step is `minutes` and whose `S` row for `Dev`
  is `workdays`
- **WHEN** it is imported
- **THEN** it is refused `invalid_body` and no project is created
