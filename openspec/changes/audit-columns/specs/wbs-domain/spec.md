## ADDED Requirements

### Requirement: Every record says when it was made, when it last changed, and by whom

Every table the domain stores a record in SHALL carry `created_at`, `updated_at`
and `created_by`.

A table that records an **act** rather than a record SHALL be exempt, already
being an audit row: `event_log`, `command_journal` and `plan_event` each carry
the acting user and the instant, and nothing ever updates them. So SHALL
`event_sequencer`, which holds one counter row and no domain fact, and
`examples`, which is scaffold. There SHALL be no `created_by` beside a `user_id`
that already means it.

A row written after this change SHALL carry all three. `created_at` and
`updated_at` SHALL be the instant of the act that wrote it, and they SHALL be
**equal** on a newly created row: a row nobody has changed since making it was
last changed when it was made. `created_by` SHALL be the id of the acting user.

Every row an act writes SHALL carry the **same** instant, however many tables
that act touches. An act SHALL NOT record two times.

A row written **before** this change SHALL keep a null in each column it did not
have. Nothing SHALL invent a value for it: the instant is guessable and the
author is not, and a default would record an author who did not write the row.

#### Scenario: a work item somebody adds

- **WHEN** an authenticated user adds a work item
- **THEN** its row records that user's id as `created_by`, and one instant as both
  `created_at` and `updated_at`

#### Scenario: a work item somebody renames

- **WHEN** a second user renames that work item
- **THEN** the row's `updated_at` moves to the instant of the rename, and its
  `created_at` and `created_by` are unchanged — the first user is still its author

#### Scenario: one act across two tables

- **WHEN** an act writes rows in more than one table, such as adding a work item
  that also writes a plan event
- **THEN** every row that act wrote carries the same `created_at`

#### Scenario: a row that predates the columns

- **WHEN** a row written before the migration is read
- **THEN** its `created_by` is null, and nothing has been substituted for it

### Requirement: A tag, work item type, service, team or person records who created it

A directory entity SHALL record the acting user as its `created_by` when it is
created, alongside `created_at` — a **tag**, a **work item type**, a **service**,
an **external system**, a **team** and a **person**.

This is the directory's own case of the requirement above, and it is stated
separately because the directory is the one place the plan's event log cannot
answer the question: a directory entity is created outside the command path, so
`command_journal` and `plan_event` hold nothing about it.

#### Scenario: a tag added from a cell

- **WHEN** a user creates a tag by typing a new name into a work item's Tags cell
- **THEN** the tag's row records that user as `created_by`

#### Scenario: a team added in the directory

- **WHEN** a user adds a team
- **THEN** the team's row records that user as `created_by`

### Requirement: A write cannot reach the store without a write stamp

Every store method that writes SHALL take a **write stamp** — the acting user
and the instant — and SHALL fill the audit columns from it. A write that cannot
name its actor SHALL NOT be possible to express.

Building the stamp SHALL be the service layer's job, because that is the only
layer that holds both facts; the repository layer SHALL NOT read a clock of its
own.

#### Scenario: a write site that fills nothing

- **WHEN** a write site in the repository layer omits the audit columns from the
  values it writes
- **THEN** a check over the repository's own source fails, naming the file and the
  table

#### Scenario: a repository asked to invent a time

- **WHEN** the repository layer is read for a call to a clock of its own
- **THEN** there is none: every instant it writes arrived in a stamp
