## ADDED Requirements

### Requirement: Legacy schema elements survive forward migration, rollback, and restart

The three elements named for retirement in R2-6 — the `service_team.size`
column, the `work_item.service_id` column, and the physical `service_team`
table name — SHALL all remain present after the full migration chain runs
forward, after a rollback and re-apply, and after a re-run on an already-migrated
file. No migration in the overlap window SHALL drop, rename, or re-key them.

The `service_team` table SHALL keep its name (it SHALL NOT be renamed to
`team`), SHALL keep its retired `size` column, and `work_item` SHALL keep
its `service_team_id` dual-write scalar, so the outgoing release's reads and
writes stay valid across a blue/green swap that shares one SQLite file.

#### Scenario: forward migration leaves all three legacy elements standing

- **GIVEN** an empty SQLite file
- **WHEN** the full migration chain runs forward
- **THEN** the `service_team` table exists and is not named `team`, it has a
  `size` column, and `work_item` has both `service_id` and
  `service_team_id` columns

#### Scenario: rollback and re-apply keep the legacy elements intact

- **GIVEN** a migrated file with seeded rows
- **WHEN** the chain rolls back to the migration before the service split and
  then runs forward again
- **THEN** the `service_team` table, its `size` column, and
  `work_item.service_team_id` survive the down untouched, and
  `work_item.service_id` and the `work_item_service` table return on the up

#### Scenario: re-running migration on a migrated file is idempotent

- **GIVEN** a file already fully migrated
- **WHEN** the migration chain runs again
- **THEN** it does not throw, and the legacy elements remain present

### Requirement: Deleting a service nulls the retired scalar, never cascades

The `work_item.service_id` column SHALL reference `service(id)` with
`ON DELETE SET NULL`. Deleting a service SHALL null the label on any work item
that carried it and SHALL NOT delete the work item itself.

#### Scenario: a service delete nulls the label and keeps the work item

- **GIVEN** a work item carrying `service_id = 's1'`
- **WHEN** the `service` row `s1` is deleted
- **THEN** the work item still exists and its `service_id` is null

### Requirement: The settled team and service set pairs stay intact with cascading deletes

The settled single-team representation — the `work_item_team` join table and
the `work_item.service_team_id` scalar — SHALL remain, and `work_item_service`
SHALL remain as the single-service set. Deleting a work item SHALL cascade to its
`work_item_team` and `work_item_service` rows; deleting a team or service
SHALL cascade to the join rows and SHALL NOT delete work items.

#### Scenario: deleting a work item cascades both its set memberships

- **GIVEN** a work item with one `work_item_team` row and one
  `work_item_service` row
- **WHEN** the work item is deleted
- **THEN** both join rows are gone

#### Scenario: deleting a team or service cascades only the join rows

- **GIVEN** a work item whose team and service sets each hold one member
- **WHEN** the team is deleted, and separately the service is deleted
- **THEN** the matching join row is gone in each case and the work item remains

### Requirement: The dual-write scalar and the team set agree through a round-trip

The `work_item.service_team_id` scalar and the `work_item_team` set SHALL be
written in agreement, holding the single member of the set or null for the empty
set. A team change SHALL move both storage locations so the scalar and the set
member stay consistent.

#### Scenario: a team change moves both the scalar and the set member

- **GIVEN** a work item whose `service_team_id` scalar and `work_item_team`
  member both hold `t1`
- **WHEN** the team is changed to `t2` in both storage locations
- **THEN** the scalar reads `t2` and the set holds `['t2']`
