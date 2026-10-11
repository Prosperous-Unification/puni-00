## ADDED Requirements

### Requirement: The plan document carries executor kinds and the working window

Export SHALL write the plan document version allocated at packet time, whose steps carry
`executorKind` and whose settings carry `workingWindow: { startMinute, endMinute }`. Import
SHALL read earlier versions with `either` and `540–1020`. From the new version it SHALL refuse
`invalid_body` an unknown kind or a window outside `0 ≤ start < end ≤ 1440`.

#### Scenario: a round trip keeps the calendar facts

- **GIVEN** a project with an `agent` step and a window `480–1200`
- **WHEN** it is exported and imported into a new project
- **THEN** the step reads `agent` and the project `480–1200`

#### Scenario: an inverted window is refused

- **GIVEN** a new-version document with `workingWindow: { startMinute: 1020, endMinute: 540 }`
- **WHEN** it is imported
- **THEN** it is refused `invalid_body` and no project is created
