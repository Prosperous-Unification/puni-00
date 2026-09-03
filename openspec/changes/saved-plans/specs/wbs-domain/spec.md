## ADDED Requirements

### Requirement: A saved plan is a copy of the whole plan, joined to nothing

A saved plan SHALL be a record of one project's plan as it stood at one instant,
written by value. No column of it SHALL reference a live row, and reading one
SHALL NOT read any live table other than the saved plan's own.

It SHALL carry two bodies.

The **plan input** body SHALL hold:

- the project's date-producing settings — `estimate_method`, `dep_reach`,
  `estimate_rounding`, `start_date`, `pert_weight_optimistic`,
  `pert_weight_realistic`, `pert_weight_pessimistic`;
- the project's own metadata — `name`, `restricted`, `owner_id`,
  `solution_slug`, `solution_url`;
- the work-item tree, and per item its id, name, parent, sibling order, type,
  tags, external references, notes, `priority`, `max_parallel`,
  `frozen_number`, `service_team_id`, `service_id`, and
  `start_no_earlier_than` with its reason;
- the steps, and per (work item, step) the three-point estimate, the derived
  number, the actual and the progress;
- the token and hour measures;
- ownership — assignments, teams, services, `work_item_team`,
  `work_item_service`, `person_team` and `team_service`, and **people: every
  assigned person plus every person a captured `person_team` row names**, since
  the live projection reads only assigned people and an unassigned member of a
  captured team would otherwise be a stored id with no name;
- the dependencies, the priority bands and the team capacity;
- **the referenced registry rows, by value** — for every tag id, work-item-type
  id and external-system id the captured items use, that row's id **and name**
  (`tag`, `schema.ts:968-972`; `work_item_type`, `:1063-1067`;
  `external_system`, `:1085-1089`).

The registries are captured because the items store only ids and the registries
are live, renameable and deletable. Without their names a saved plan cannot be
rendered at all without reading a live table — which the first paragraph of this
requirement forbids — and resolving them against the live registry instead
restates history on a rename and loses the label outright on a delete. That is
the same failure the `keep` decision closed for people, and it is closed here for
labels on the same terms.

`frozen_number` is captured because it is the whole freeze mechanism
(`schema.ts:262`, `:282`) and gates live edits; a freeze that a saved plan cannot
see compares as no change. `service_team_id` and `service_id` are captured
because they are live, patchable columns (`schema.ts:376`, `:419`) rather than
derivations of the junction tables. `created_at`, `updated_at` and `created_by`
on the plan's own rows are NOT captured: they are audit metadata about editing,
not the plan. Neither is `work_item.revision` nor `project.revision`
(`schema.ts:215`): they count writes, so two content-identical plans carrying
different counters would diff as changed.

The **schedule** body SHALL hold the complete `Scheduled` and `ScheduledSlice`
field set that `schedule()` returned, in working-day offsets, **and** the ISO
dates those offsets were rendered as, **and** the top-level `Schedule` counts
`waitingForPerson` and `waitingForCapacity` (`schedule.ts:246-263`). It SHALL
NOT hold `eventsVisited` (`schedule.ts:264-277`), which counts levelling search
work and is instrumentation about the run, not a fact about the plan.

The stored schedule body SHALL be deep-equal to what `schedule()` returned, field
for field, so that a field added to `Scheduled`, `ScheduledSlice` or `Schedule`
later cannot be silently dropped by the writer.

Each body SHALL carry its own schema version, its byte length and its SHA-256.
The schedule body SHALL additionally carry the SHA-256 of the plan input it was
computed from and the identity of the scheduling algorithm that produced it.

Access and navigation metadata SHALL NOT be captured — `project_access` and
anything recording who last opened what is not part of the plan.

`created_at` SHALL be the instant the read snapshot was taken, not the instant
the transaction committed: a comparison is labelled with when the plan was
looked at.

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

### Requirement: Stored bytes are checked against their hash on every read

Every read of a body SHALL recompute its SHA-256 over the stored bytes and
compare it with the hash recorded in the header. A mismatch SHALL be a typed
refusal naming the saved plan and the body; it SHALL NOT be repaired, defaulted
away, or rendered.

No `UPDATE` SHALL ever target `saved_plan_body`. No `UPDATE` SHALL target any
column of `saved_plan` other than `name`. The header's `input_sha256`,
`schedule_sha256`, `schedule_input_sha256` and `scheduler_algorithm_id` are
written once, at insert, and are therefore not restatable by any write path —
without that, comparing two header columns with each other proves nothing,
because one `UPDATE` satisfies the comparison.

#### Scenario: a body byte is corrupted

- **WHEN** a stored body differs by one byte from what its header's SHA-256
  records
- **THEN** the read refuses with a typed error naming the saved plan and the body,
  and returns no plan data

#### Scenario: a header hash is rewritten

- **WHEN** a write path attempts to `UPDATE` `input_sha256`, `schedule_sha256`,
  `schedule_input_sha256` or `scheduler_algorithm_id`
- **THEN** the guard names that write site and the change does not ship

### Requirement: A saved plan may be renamed, and nothing else about it may change

The `name` of a saved plan SHALL be editable after creation, by the account that
created it or the project's owner — the same rule as delete. Renaming SHALL be
the only mutation other than delete.

No other column, and no byte of either body, SHALL be changeable by any route.

#### Scenario: the creator renames a saved plan

- **WHEN** the account that created a saved plan gives it a new name
- **THEN** the name changes and both bodies' SHA-256 values are unchanged

#### Scenario: a third party tries to rename

- **WHEN** an authenticated account that neither created the saved plan nor owns
  its project asks to rename it
- **THEN** the request is refused and the name is unchanged

### Requirement: A saved plan describes a plan that actually existed

Every repository read that builds a saved plan's bodies SHALL observe one SQLite
read snapshot. A saved plan SHALL NOT contain a mix of state from before and
after a concurrent write.

The header write and both body writes SHALL be one transaction: on any failure
no header and no body SHALL survive, and the live plan SHALL be unchanged.

A second save of the same project attempted **while the first save's write
transaction is still open** SHALL be refused with a typed outcome, not serialised
behind it. The refusal SHALL be visible across processes, because blue and green
run against one file: an in-process marker is not a mechanism.

The bound is the open transaction, not the caller's whole attempt. A caller
retry that acquires the lock **after** the rival save has committed is a fresh
save of the now-current plan and SHALL be allowed to succeed: it captures a new
read snapshot and writes a record of a plan that did exist at that instant. What
is forbidden is a second save *waiting on* the first — that is the serialisation
that holds live edits behind two body writes.

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

- **WHEN** two saves of the same project are requested concurrently and the
  second attempts to acquire while the first's write transaction is still open
- **THEN** the second returns a typed refusal at that attempt rather than waiting
  for the first, and the first writes its record

#### Scenario: a retry after the rival committed

- **WHEN** a refused save's bounded caller retry acquires the write lock after
  the rival save has already committed
- **THEN** it succeeds as a fresh save over a new read snapshot, and the project
  holds two records, each describing the plan at its own instant

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

**Any change to `schedule()`'s semantics SHALL change that identity in the same
commit.** An identity that does not move is a constant, and stored plans then
read "same algorithm" straight across a semantics change — the silent
restatement the column exists to prevent. This rule lives here rather than only
in the implementation plan because `tasks.md` is archived when the change lands
and this requirement is what survives into the main spec; TASK-219's dual
objective and TASK-240's deadline each carry the bump.

A schedule body whose stored plan-input SHA-256 does not equal the plan input
body's SHA-256 SHALL be refused rather than rendered.

A saved plan MAY have no schedule body, and SHALL then record why —
`pending`, `infeasible` or `unavailable`. A plan whose dependencies form a cycle
SHALL be saved with the reason `infeasible`: `scheduleError` is derived at read
time from a `ScheduleCycleError` thrown by `schedule()`
(`apps/be-01/src/service/work-item.service.ts:1413`, `:1474`) and is not a stored
column, so it is a property of the scheduling attempt, captured as the absent
reason, and never a field of the plan input. A comparison SHALL report that no
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

**Any field of the canonical plan input that differs between the two sides SHALL
appear in the comparison.** The coverage bound is `CanonicalPlanInput`'s field
list, not a list written here: a field the capture stores and the diff cannot
report is data the product writes and never shows, which is the same silent-loss
failure the capture list exists to prevent.

The category names below are **presentation, not coverage** — how differences are
grouped for a reader, in the same way requirement "the stored schedule is
deep-equal to `schedule()`'s return" makes the writer's bound the value rather
than an enumeration. A comparison groups differences as added, removed, renamed,
reparented and reordered work items, and changed estimates, uncertainty, actuals,
progress, measures, ownership, dependencies, settings, dates, freeze — an item
whose `frozen_number` was set, cleared or changed between the two sides — type,
tags, external references, notes, `priority`, `max_parallel`, service assignment
(`service_team_id`, `service_id`), `start_no_earlier_than` and its reason,
priority bands, team capacity, and the registry rows a label resolves through. A
differing field with no listed category SHALL still be reported, under a
catch-all group naming the field.

**The schedule side is covered on the same terms and is normative, not
presentational.** The schedule body is not a field of the canonical plan input,
so the rule above does not reach it. A comparison SHALL report any difference
between the two sides' stored schedules — the ISO dates, the working-day
offsets, the whole `Scheduled`/`ScheduledSlice` field set, the top-level counts,
the presence or absence of a schedule with its reason, and the
`scheduler_algorithm_id` — bounded by the stored schedule field set rather than
by a list written here. Without this a change to `schedule()`'s semantics, which
is exactly what `scheduler_algorithm_id` exists to record, moves every date
between two saves whose inputs are byte-identical while the comparison reports
no change: the feature's motivating question answered wrongly.

#### Scenario: the dates moved but the input did not

- **WHEN** two saved plans of one project hold byte-identical plan input bodies
  and schedule bodies that differ, because the scheduling algorithm changed
  between them and their `scheduler_algorithm_id` values differ with it
- **THEN** the comparison reports the changed dates and offsets and the changed
  algorithm identity, and does not report the plan as unchanged

#### Scenario: a captured field the category list does not name

- **WHEN** two sides differ in exactly one field of the canonical plan input
- **THEN** the comparison is non-empty and names that field, whichever field it is

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
