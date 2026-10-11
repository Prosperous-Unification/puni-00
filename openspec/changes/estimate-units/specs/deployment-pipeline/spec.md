## ADDED Requirements

### Requirement: The estimate unit migration is additive and its rollback refuses minute-unit steps

The migration SHALL add `step.estimate_unit TEXT NOT NULL DEFAULT 'workdays'` checked against
`workdays | minutes`, so an outgoing colour's step insert that omits the column succeeds with
`workdays`. Its `down.sql` SHALL refuse while any step holds `minutes`, naming
`estimate-unit-rollback-cli.ts`'s `save`, `remove` and `restore` commands, and then drop the
column. `remove` SHALL delete the saved minute-unit steps' estimate rows and set those steps
to `workdays`; `restore` SHALL put both back after a later forward run. The stamp SHALL sort
after every migration on main and in the integration queue.

#### Scenario: rollback over a minute step is refused

- **GIVEN** a database with one step `minutes`
- **WHEN** `down.sql` runs
- **THEN** it fails naming the rollback CLI and the column remains

#### Scenario: an old colour inserts a step during a swap

- **GIVEN** the migrated database and a step insert naming no unit
- **WHEN** the insert runs
- **THEN** it succeeds with `estimate_unit = 'workdays'`

#### Scenario: save, remove and restore round-trip the minute steps

- **GIVEN** two `minutes` steps holding four estimate rows between them
- **WHEN** the CLI saves, removes, the migration rolls back and forward, and the CLI restores
- **THEN** both steps read `minutes` and the four rows are back verbatim

### Requirement: The swap refuses code that cannot read a stored minutes unit

The swap SHALL compare the stored `estimate_unit` values against the units the incoming image
prints, before migrating and again after stopping blue, in the stored-vocabularies step beside
holds, readiness, capacity modes and relationship types. An image whose `estimate-units-cli.ts`
is absent SHALL read as supporting `workdays` alone. A stored unit the image does not support
SHALL abort the swap before any write, naming the value and its count.

#### Scenario: an older image meets a minute step

- **GIVEN** a database with two `minutes` steps and an incoming image without the units CLI
- **WHEN** the swap runs
- **THEN** it aborts naming `minutes (2)` and blue keeps serving

#### Scenario: an older image over workday steps passes

- **GIVEN** a database whose steps are all `workdays` and an image predating the units CLI
- **WHEN** the swap runs
- **THEN** the unit comparison passes
