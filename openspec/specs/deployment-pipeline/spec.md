# Deployment pipeline

## Purpose

Defines the migration, rollback and swap compatibility rules for stored work-item readiness and hold.

## Requirements

### Requirement: The hold migration is additive and its rollback refuses stored holds

The migration SHALL add nullable `work_item.readiness` and `work_item.hold` columns with no
default, each checked against its vocabulary, so an outgoing colour's inserts that omit both
succeed. Its `down.sql` SHALL refuse while any `hold` is not null, naming the rollback CLI's
`save`, `remove` and `restore` commands, and then drop both columns; readiness SHALL be dropped
without a guard. On introduction, its migration stamp followed the migrations on main and in the integration queue.

#### Scenario: rollback over a hold is refused

- **GIVEN** a database with one leaf `on_hold`
- **WHEN** `down.sql` runs
- **THEN** it fails naming the rollback CLI and both columns remain

#### Scenario: an old colour inserts during a swap

- **GIVEN** the migrated database and an insert naming neither column
- **WHEN** the insert runs
- **THEN** it succeeds with readiness and hold `null`

### Requirement: The swap refuses code that cannot read stored holds

The swap SHALL compare each stored hold and readiness value with the corresponding kinds
advertised by the incoming image before migration and again after stopping blue, alongside
the relationship types it already compares. An incoming image with an absent vocabulary
CLI or an empty list SHALL support none of that vocabulary. An unsupported stored value
SHALL abort the swap before any write, naming the value and count. The compatibility
guard precedes the first release that can write those facts.

#### Scenario: an older image meets a stored hold

- **GIVEN** a database with two leaves `on_hold` and an incoming image with no hold kinds
- **WHEN** the swap runs
- **THEN** it aborts naming `on_hold (2)` and blue keeps serving

#### Scenario: an image without the new CLI and no holds stored

- **GIVEN** a database with no hold and an image predating the vocabularies CLI
- **WHEN** the swap runs
- **THEN** the hold comparison passes
