## MODIFIED Requirements

### Requirement: A project's steps are stored under the domain's own name

The system SHALL store a project's steps in a table named `step` and SHALL name
the column referring to one `step_id` in every table that holds it. The table
recording where one step's work on one work item has got to SHALL be named
`step_progress`.

No table, column or index name SHALL carry the word `role`. The schema SHALL NOT
carry a comment reconciling a physical name with a domain name, because they
SHALL agree.

#### Scenario: the schema names steps

- **WHEN** the database schema is read
- **THEN** a table named `step` SHALL exist and no table named `role` SHALL
- **AND** every column referring to a step SHALL be named `step_id`

### Requirement: The rename moves no data and is exactly reversible

The system SHALL preserve every row and value across the rename. Applying the
migration and rolling it back SHALL restore the schema and the data that were
there before, statement for statement.

#### Scenario: a round trip restores the schema and the rows

- **GIVEN** a database holding steps, estimates, actuals and progress
- **WHEN** the migration is applied and then rolled back
- **THEN** the schema SHALL equal the pre-migration schema
- **AND** every table's row count and contents SHALL be unchanged

### Requirement: The rename refuses to run where a release would be left behind

The system SHALL refuse to apply this migration while any prod release is
recorded as deployed, because the migration is not backward-compatible and blue
and green share one database file during a swap.

A recorded release state that is missing or unreadable SHALL be treated as a
refusal, never as "nothing is deployed".

#### Scenario: a recorded deployed colour refuses the migration

- **GIVEN** a recorded release state naming a deployed colour
- **WHEN** the migration is attempted
- **THEN** it SHALL be refused
- **AND** the refusal SHALL name the expand/contract path required instead

#### Scenario: an unreadable release state refuses the migration

- **GIVEN** a release state file that cannot be read
- **WHEN** the migration is attempted
- **THEN** it SHALL be refused as unreadable
- **AND** it SHALL NOT be treated as never-deployed
