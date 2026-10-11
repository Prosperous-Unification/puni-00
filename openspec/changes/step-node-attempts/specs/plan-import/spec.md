## ADDED Requirements

### Requirement: The plan document carries attempts and the project timezone

Export SHALL write the plan document version allocated at packet time, whose settings carry
`timezone` and whose leaves carry `attempts` per step code: number, start and end instants,
outcome, executor by directory name, reference and note. Import SHALL read earlier versions
with `UTC` and no attempts. From the new version it SHALL refuse `invalid_body` an unknown
zone, an unknown outcome, an end before its start, two running attempts on one node, or a
running attempt that is not the node's highest number. The spreadsheet export SHALL carry
each leaf's attempt count per step.

#### Scenario: a round trip keeps the history

- **GIVEN** a `Europe/Kyiv` project whose `010.dev` holds attempts 1 (`failed`) and 2 (running)
- **WHEN** it is exported and imported into a new project
- **THEN** the project reads `Europe/Kyiv` and `010.dev` holds both attempts with their
  instants and outcomes

#### Scenario: two running attempts are refused

- **GIVEN** a new-version document with two running attempts on one node
- **WHEN** it is imported
- **THEN** it is refused `invalid_body` and no project is created
