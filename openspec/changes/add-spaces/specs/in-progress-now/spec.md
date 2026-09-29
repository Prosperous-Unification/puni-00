## ADDED Requirements

### Requirement: In progress now is the status fold across a space

`GET /api/spaces/:id/in-progress?limit=` SHALL answer `{ items, truncated }`: the leaves of the
readable member projects whose folded status is `in_progress`, each with `projectId`,
`projectName`, `workItemId`, `number`, `name`, `dates`, `lateBy` (the maximum over its slices),
`assignees` and the step in progress. Items SHALL be ordered by end date ascending with undated
last, then space position, then number. `limit` SHALL default to 200 and refuse above 1000;
`truncated` SHALL say whether items were cut. A project with no `step_progress` row MAY skip
the tree read; the answer SHALL never come from `step_progress` alone.

#### Scenario: a held leaf with an in-progress step

- **GIVEN** a leaf on hold whose first step is in progress
- **WHEN** in progress now is read
- **THEN** the leaf is not listed

#### Scenario: more than the limit

- **GIVEN** 1,001 in-progress leaves across the space
- **WHEN** it is read with `limit=1000`
- **THEN** 1,000 items are answered and `truncated` is true

#### Scenario: a limit above the maximum

- **WHEN** it is read with `limit=1001`
- **THEN** the answer is `400`
