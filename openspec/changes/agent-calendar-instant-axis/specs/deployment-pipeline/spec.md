## ADDED Requirements

### Requirement: The calendar migration is additive and rollback refuses agent steps

The migration SHALL add `project.working_window_start_minute` and `_end_minute` (defaults 540
and 1020, checked) and, unless `step.executor_kind` already exists on `origin/main` with the
definition `TEXT NOT NULL DEFAULT 'either' CHECK (executor_kind IN ('human','agent','either'))`
from 010.4.13.3 (`configure-project-step-workflows`), that column too; the packet SHALL record
which in `design.md` and `verify.md`. An outgoing colour's inserts that omit the columns SHALL
succeed. Its `down.sql` SHALL refuse while any window is not the default and, when this
migration added the kind column, while any step is not `either`, naming
`calendar-rollback-cli.ts save|remove|restore`, and SHALL then drop exactly the columns this
migration added. The swap SHALL compare stored executor kinds against the kinds the incoming
image prints (`executor-kinds-cli.ts`); an image without the CLI SHALL read as supporting
`either` alone.

#### Scenario: rollback over an agent step is refused

- **GIVEN** a database where this migration added `executor_kind` and one step is `agent`
- **WHEN** `down.sql` runs
- **THEN** it fails naming the rollback CLI and the columns remain

#### Scenario: rollback leaves a column another migration added

- **GIVEN** a database where 010.4.13.3's migration created `executor_kind` before this one
- **WHEN** this migration's `down.sql` runs over default windows
- **THEN** the window columns are dropped and `executor_kind` remains

#### Scenario: an older image meets an agent step

- **GIVEN** a database with one `agent` step and an image without the kinds CLI
- **WHEN** the swap runs
- **THEN** it aborts naming `agent (1)` and blue keeps serving

#### Scenario: an old colour inserts a step and a project

- **GIVEN** the migrated database and inserts naming neither kind nor window
- **WHEN** they run
- **THEN** the step reads `either` and the project `540–1020`
