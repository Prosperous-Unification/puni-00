## ADDED Requirements

### Requirement: The calendar migration is additive and rollback refuses agent steps

The migration SHALL add `step.executor_kind` (default `either`, checked) unless a prior
migration created it, and `project.working_window_start_minute` and `_end_minute` (defaults
540 and 1020, checked), so an outgoing colour's inserts that omit them succeed. Its `down.sql`
SHALL refuse while any step is not `either` or any window is not the default, naming
`calendar-rollback-cli.ts save|remove|restore`, then drop the columns it created. The swap
SHALL compare stored executor kinds against the kinds the incoming image prints
(`executor-kinds-cli.ts`); an image without the CLI SHALL read as supporting `either` alone.

#### Scenario: rollback over an agent step is refused

- **GIVEN** a database with one `agent` step
- **WHEN** `down.sql` runs
- **THEN** it fails naming the rollback CLI and the columns remain

#### Scenario: an older image meets an agent step

- **GIVEN** a database with one `agent` step and an image without the kinds CLI
- **WHEN** the swap runs
- **THEN** it aborts naming `agent (1)` and blue keeps serving

#### Scenario: an old colour inserts a step and a project

- **GIVEN** the migrated database and inserts naming neither kind nor window
- **WHEN** they run
- **THEN** the step reads `either` and the project `540–1020`
