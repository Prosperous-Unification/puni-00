## ADDED Requirements

### Requirement: The points and template migration is additive and its rollback names the loss

The migration SHALL create `step_points`, `size_template` and `size_template_step` and
SHALL alter no existing table. Its `down.sql` SHALL drop the three tables without a guard,
with a comment naming that points and templates are lost, because an older image never reads
them. The stamp SHALL sort after every migration on main and in the integration queue, and
after `estimate-units`' stamp when both are queued.

#### Scenario: an old colour keeps writing measures

- **GIVEN** the migrated database and an outgoing colour writing a `token_actual` row
- **WHEN** the write runs
- **THEN** it succeeds into `step_measure` exactly as before

#### Scenario: rollback drops the tables and the walk re-applies

- **GIVEN** a database holding two points rows and one template
- **WHEN** the migration is rolled back and applied again
- **THEN** both tables exist empty and no other table changed
