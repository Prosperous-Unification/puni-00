## ADDED Requirements

### Requirement: Plan document v6 carries readiness and hold

Export SHALL write plan document version 6, whose authored work items carry `readiness` and
`hold`, each `null` when unsaid. Import SHALL read versions 1 to 5 with both fields `null`, and
SHALL refuse `invalid_body` a value outside each vocabulary, a readiness or hold on a parent,
and a hold on a row the document marks done. The spreadsheet export SHALL carry each row's
status word.

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
