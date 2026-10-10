## ADDED Requirements

### Requirement: setEstimate validates the trio in the step's unit

The `setEstimate` plan command SHALL keep its shape and SHALL read the target step's estimate
unit inside the write transaction. On a `minutes` step a point that is not a non-negative
integer SHALL be refused `422 minutes_not_integer` and a point above `MAX_ESTIMATE_MINUTES`
SHALL be refused `422 minutes_above_max`, each at its command index, rolling back the batch.
On a `workdays` step the command SHALL behave exactly as before. The registry SHALL keep its
current count of command kinds, and MCP SHALL inherit the refusals through the derived tool.

#### Scenario: a minute trio is refused mid-batch

- **GIVEN** a batch that first renames a work item and then sets `1.5 / 2 / 3` on a `minutes`
  node
- **WHEN** the batch is submitted
- **THEN** it is refused `422 minutes_not_integer` at index 1 and the rename is absent

#### Scenario: the kind count does not move

- **GIVEN** the plan command registry after this change
- **WHEN** its kinds are counted
- **THEN** the count equals the count before it

### Requirement: Step creation and patch take an estimate unit

`POST /api/projects/:id/steps` SHALL accept an optional `estimateUnit` of `workdays` or
`minutes`, storing `workdays` when absent. `PATCH /api/projects/:id/steps/:stepId` SHALL
accept `estimateUnit`; a value outside the vocabulary SHALL be refused `422
invalid_estimate_unit`; a change on a step holding estimate rows SHALL be refused `409
estimates_present` carrying `count`. Step reads SHALL return `estimateUnit`. The derived MCP
tools SHALL carry the same fields.

#### Scenario: a step is created in minutes

- **WHEN** a step `Agent run` is created with `estimateUnit: 'minutes'`
- **THEN** the step reads `estimateUnit: 'minutes'`

#### Scenario: an unknown unit is refused

- **WHEN** a step is patched with `estimateUnit: 'hours'`
- **THEN** it is refused `422 invalid_estimate_unit` and the step is unchanged
