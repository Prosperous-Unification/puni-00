## ADDED Requirements

### Requirement: Plan document v6 carries readiness and hold

Export SHALL write plan document version 6, whose authored work items carry `readiness` and
`hold`, each `null` when unsaid. Import SHALL read versions 1 to 5 with both fields `null`, and
from version 6 SHALL refuse `invalid_body` a missing `readiness` or `hold`, a value outside
each vocabulary, and a readiness or hold on a parent. Import SHALL accept a hold on a row
whose work is done, because marking progress keeps the hold and the status read folds done
over it. The spreadsheet export SHALL carry each row's status word.

#### Scenario: a round trip keeps a hold

- **GIVEN** a plan with one leaf `ready` and `on_hold`
- **WHEN** it is exported and imported into a new project
- **THEN** the imported leaf holds readiness `ready` and hold `on_hold`

#### Scenario: an older document imports with nothing said

- **GIVEN** a version 5 plan document
- **WHEN** it is imported
- **THEN** every work item has readiness and hold `null`

#### Scenario: an unknown hold is refused

- **GIVEN** a version 6 document with `hold: 'paused'`
- **WHEN** it is imported
- **THEN** it is refused `invalid_body` and no project is created

#### Scenario: a leaf held and then marked done round-trips

- **GIVEN** a leaf holding `on_hold` whose every step is then marked done
- **WHEN** the plan is exported and the file imported again
- **THEN** the import is accepted and the leaf reads `done`
