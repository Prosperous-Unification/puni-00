## ADDED Requirements

### Requirement: A saved plan is a copy of the whole plan, joined to nothing

A saved plan SHALL be a record of one project's plan as it stood at one instant,
written by value. No column of it SHALL reference a live row, and reading one
SHALL NOT read any live table other than the saved plan's own.

It SHALL carry two bodies. The **plan input** body SHALL hold the project's
date-producing settings (`estimate_method`, `dep_reach`, `estimate_rounding`,
`start_date`, `pert_weight_optimistic`, `pert_weight_likely`,
`pert_weight_pessimistic`), the project's own metadata, the work-item tree with
each item's id, name, parent, sibling order, type, tags, external references,
notes, `priority`, `max_parallel` and `start_no_earlier_than` with its reason,
the steps and per (work item, step) the three-point estimate, the derived number,
the actual and the progress, the token and hour measures, ownership
(assignments, people, teams, services, `work_item_team`, `work_item_service`),
the dependencies, the priority bands and the team capacity. The **schedule** body
SHALL hold the complete `Scheduled` and `ScheduledSlice` field set that
`schedule()` returned, in working-day offsets, **and** the ISO dates those
offsets were rendered as.

Each body SHALL carry its own schema version, its byte length and its SHA-256.
The schedule body SHALL additionally carry the SHA-256 of the plan input it was
computed from and the identity of the scheduling algorithm that produced it.

Access and navigation metadata SHALL NOT be captured — `project_access` and
anything recording who last opened what is not part of the plan.

#### Scenario: a plan is saved and read back

- **WHEN** a user with write access to a project saves the plan
- **THEN** a record is written holding the plan input body and, when a schedule
  was available, the schedule body, and reading it back returns exactly the bytes
  that were written

#### Scenario: the live plan moves afterwards

- **WHEN** a work item is renamed, another is deleted, a step is deleted and
  `estimate_method` and `start_date` are changed after a save
- **THEN** the saved plan's stored bytes and both SHA-256 values are unchanged

#### Scenario: the command log is gone

- **WHEN** every row of `plan_event` is deleted
- **THEN** every saved plan still reads back in full

#### Scenario: a person leaves the live plan

- **WHEN** a person is deleted from the directory
- **THEN** saved plans written before that deletion still name that person as the
  owner of the work they owned, and no stored body has been rewritten

### Requirement: A saved plan describes a plan that actually existed

Every repository read that builds a saved plan's bodies SHALL observe one SQLite
read snapshot. A saved plan SHALL NOT contain a mix of state from before and
after a concurrent write.

The header write and both body writes SHALL be one transaction: on any failure
no header and no body SHALL survive, and the live plan SHALL be unchanged.

A second save of the same project while one is in flight SHALL be refused with a
typed outcome, not serialised behind it.

`schedule()` SHALL run over values already read out of that snapshot, never
inside it, so scheduling work holds no database read.

#### Scenario: an edit lands between two of the capture's reads

- **WHEN** a work-item edit commits between any two reads of a save in progress
- **THEN** the saved plan input describes the project entirely before that edit or
  entirely after it, and never a mixture

#### Scenario: the write fails halfway

- **WHEN** the schedule body write fails after the header and plan input body
  were written
- **THEN** no header, no plan input body and no schedule body exist for that save,
  and the live plan is untouched

#### Scenario: two saves at once

- **WHEN** two saves of the same project are requested concurrently
- **THEN** exactly one writes a record and the other returns a typed refusal

### Requirement: Saving never blocks editing, and saved plans are bounded

A save that cannot take the database write lock within 5 seconds SHALL return a
typed `snapshot_busy` refusal. Live edits SHALL NOT queue behind a save.

A body over **8 MiB**, a project already holding **100** saved plans, or a
project whose saved plans already total **64 MiB** SHALL cause the save to be
refused before any header or body is written, with a typed outcome naming which
limit was reached. Those three numbers SHALL be configuration, changeable
without a migration.

There SHALL be no age-based retention and no automatic pruning. Only an explicit
delete SHALL remove a saved plan.

#### Scenario: the write lock is held

- **WHEN** a save cannot acquire the write lock within 5 seconds
- **THEN** it returns `snapshot_busy`, writes nothing, and a live edit issued
  during that window still completes

#### Scenario: a project at its quota

- **WHEN** a project holding 100 saved plans is asked for another
- **THEN** the save is refused naming the count limit, and no partial record is
  written

#### Scenario: an oversized body

- **WHEN** a project's plan input body would exceed 8 MiB
- **THEN** the save is refused naming the byte limit, before any row is written

### Requirement: Stored dates are reported, never recomputed

Reading a saved plan's schedule SHALL return the stored values and SHALL NOT call
`schedule()`. The saved plan SHALL be labelled with the scheduling algorithm
identity stored in its header.

A schedule body whose stored plan-input SHA-256 does not equal the plan input
body's SHA-256 SHALL be refused rather than rendered.

A saved plan MAY have no schedule body, and SHALL then record why —
`pending`, `infeasible` or `unavailable`. A comparison SHALL report that no
schedule was saved for that side, and SHALL NOT substitute the live schedule.

#### Scenario: an older algorithm's numbers

- **WHEN** a saved plan recorded under an earlier scheduling algorithm is read
- **THEN** the stored dates and offsets are returned unchanged, labelled with that
  algorithm's identity, with no call into `schedule()`

#### Scenario: a schedule that does not match its input

- **WHEN** a schedule body's stored plan-input SHA-256 does not equal the plan
  input body's SHA-256
- **THEN** the read refuses to render that schedule and says so

#### Scenario: saved while optimization was pending

- **WHEN** a plan is saved while no schedule is available
- **THEN** the record has no schedule body, carries the reason, and a comparison
  against it reports that no schedule was saved rather than showing live dates

### Requirement: A comparison is one diff over two sides, either of which may be the live plan

The comparison API SHALL take two sides. Each side SHALL be either a saved plan
id or the literal `current`. There SHALL NOT be a separate compare-to-live
endpoint.

`current` SHALL be produced by projecting the live plan through the same
canonical function the save uses, in memory. It SHALL NOT write a record and
SHALL NOT count against any quota.

A comparison SHALL report added, removed, renamed, reparented and reordered work
items, and changed estimates, uncertainty, actuals, progress, measures,
ownership, dependencies, settings and dates.

A body written at schema version *n* SHALL still be readable after the reader
moves to *n+1*, by normalising forward in memory. Stored bytes SHALL NOT be
rewritten. An unrecognised body version SHALL fail loudly rather than be parsed.

#### Scenario: two saved plans

- **WHEN** two saved plans of one project are compared
- **THEN** the differences between them are reported by the same diff that serves
  a comparison against `current`

#### Scenario: a saved plan against the live plan

- **WHEN** a saved plan is compared against `current`
- **THEN** no record is written, no quota is consumed, and the live side has been
  projected through the same canonical function as the stored side

#### Scenario: an older body version

- **WHEN** a body stored at schema version *n* is diffed after the reader moved to
  *n+1*
- **THEN** it is normalised forward in memory for the diff and its stored bytes are
  unchanged

#### Scenario: a body from the future

- **WHEN** a body carries a schema version the reader does not recognise
- **THEN** the read fails with a typed error naming the version, and nothing is
  parsed optimistically

### Requirement: A comparison on screen does not change under the reader

The list of a project's saved plans SHALL refresh on the existing broadcast.

An open comparison SHALL NOT be replaced when the live plan changes. It SHALL
offer a refresh affordance, and the rendered comparison SHALL remain as it was
until that affordance is used.

#### Scenario: the plan changes while a comparison is open

- **WHEN** a broadcast arrives while a saved-plan-against-`current` comparison is
  on screen
- **THEN** a refresh affordance appears and the rendered comparison does not change
  until it is used

### Requirement: Who may save, read and delete a saved plan

Reading and listing saved plans SHALL follow the project's existing read rule.
Saving SHALL require write access to the project. Deleting SHALL require the
account that created the saved plan or the project's owner.

The creating account's identity SHALL be copied by value into the header, so
deleting that account SHALL NOT orphan or remove any saved plan.

Deleting a project SHALL delete its saved plans by `ON DELETE CASCADE`, and
deleting a header SHALL cascade to its bodies, so a release that knows nothing of
these tables is never blocked by a hidden reference.

#### Scenario: a third party tries to delete

- **WHEN** an authenticated account that neither created a saved plan nor owns its
  project asks to delete it
- **THEN** the request is refused and the record remains

#### Scenario: the creating account is deleted

- **WHEN** the account that created a saved plan is deleted
- **THEN** the saved plan still exists and still names its creator

#### Scenario: the project is deleted

- **WHEN** a project holding saved plans is deleted
- **THEN** its headers and bodies are removed by cascade and the delete is not
  blocked

### Requirement: A node that predates these routes serves a clean disabled state

While blue and green run side by side, a node without the saved-plan routes SHALL
answer requests for them with a typed unavailable outcome, and the client SHALL
show that the feature is not yet available on this node rather than an error.

#### Scenario: a request lands on the old node mid-swap

- **WHEN** a saved-plan request reaches a node deployed before this change
- **THEN** it returns a typed unavailable outcome and the client says the feature is
  not available yet
