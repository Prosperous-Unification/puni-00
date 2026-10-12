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

### Requirement: Journal replay preserves estimate meanings

Every new journal entry SHALL bind the estimate units needed by both its forward and inverse
commands in immutable Preconditions. Bindings SHALL include direct set/clear estimates,
subtree estimate and removal arrays, and recursively nested batches. Replay SHALL compare
all bound steps before applying any command. A missing step or changed unit SHALL refuse
`409 stale_undo`, discard that entry through the existing rollback settlement, and leave
rows, revisions, estimates, history and emitted events unchanged. Flip and rebase SHALL
preserve the original bindings.

A legacy entry without a binding map SHALL bind its estimate steps to `workdays`, the only
unit the old writer understood. A present malformed or incomplete binding map SHALL throw
as damaged trusted state. A same-unit patch, unrelated step edit, allowance/name edit, or
unit changed away and back SHALL preserve replay eligibility when other preconditions hold.

#### Scenario: a cleared estimate cannot return in another unit

- **GIVEN** a workday trio is set and cleared, and the empty step changes to minutes
- **WHEN** the clear is undone
- **THEN** it is refused `409 stale_undo`, no trio returns, and the stale entry is discarded

#### Scenario: a deleted branch cannot return estimates in another unit

- **GIVEN** the last estimated branch is deleted and its empty step changes unit
- **WHEN** the deletion is undone as part of a batch also containing an independent rename
- **THEN** the entire inverse is refused before either restoration or rename, with no emitted event

#### Scenario: absent and damaged binding maps remain distinct

- **GIVEN** an old journal entry has no binding map
- **WHEN** replay is attempted
- **THEN** it can replay against workday steps and refuses against minute steps
- **AND** a present null, invalid-vocabulary or incomplete map throws instead of becoming legacy history
