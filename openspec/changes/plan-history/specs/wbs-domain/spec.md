## ADDED Requirements

### Requirement: A plan keeps a record of every command run on it

Every journalled command SHALL be written to the plan's history in the same
transaction that writes it to the account's undo stack. A command that is
undoable SHALL therefore also be recorded, and a command whose history row cannot
be written SHALL NOT be journalled either.

The history SHALL be held **per project**, not per (project, account): two people
editing one plan produce two undo stacks and one history.

The history SHALL NOT be pruned by count, and SHALL NOT be affected by anybody's
undo. An entry evicted from the fifty-deep undo stack, and a command whose redo
branch a later write deleted, SHALL both still be in the history.

Each recorded event SHALL carry the kind, the sentence describing it, the work
item and role it was aimed at where it has one, and both the forward command and
the compensating command that carries the before-state.

Applying this change SHALL record no history for anything that happened before
it. A plan's history SHALL begin empty, which reads as "nothing has been recorded
yet" and not as "nothing has changed".

#### Scenario: an estimate change is recorded with the trio it replaced

- **GIVEN** a work item with an estimate of 1/2/3 for a role
- **WHEN** that estimate is set to 2/4/8
- **THEN** the plan's history SHALL hold an event of kind `estimate`
- **AND** its before SHALL carry the trio 1/2/3
- **AND** its after SHALL carry the trio 2/4/8
- **AND** the event SHALL name that work item and that role

#### Scenario: the undo stack forgets a command and the history does not

- **GIVEN** an account that has run more commands on one plan than the undo stack
  holds
- **WHEN** the plan's history is read
- **THEN** every command SHALL still be in it, including those the stack evicted

#### Scenario: a command that cannot be recorded is not journalled either

- **GIVEN** a command whose history row the database refuses
- **WHEN** it is recorded
- **THEN** the write SHALL fail
- **AND** the account's undo stack SHALL NOT hold that command

#### Scenario: an event outlives the work item it describes

- **GIVEN** a recorded event naming a work item
- **WHEN** that work item is deleted
- **THEN** the event SHALL still be in the plan's history
- **AND** it SHALL still name that work item and still read as a sentence

#### Scenario: a deleted project takes its history with it

- **GIVEN** a plan with a recorded history
- **WHEN** the project is deleted by a release that knows nothing of the history
- **THEN** the delete SHALL succeed
- **AND** the plan's events SHALL go with it

### Requirement: An undo is not recorded, and the history says so

Undoing or redoing a command SHALL NOT add an event to the plan's history: the
undo stack's entry is flipped in place and nothing is appended.

Every recorded event SHALL therefore be true about the moment it records, and the
sequence SHALL NOT be read as the plan's current state.

#### Scenario: an estimate set and then undone leaves one event

- **GIVEN** an estimate that was set and then undone
- **WHEN** the plan's history is read
- **THEN** it SHALL hold the event that set the estimate
- **AND** it SHALL hold no event for the undo
- **AND** the plan SHALL hold no estimate

### Requirement: A plan's history can be read, newest first, and narrowed

An authenticated account SHALL be able to read any plan's history, newest first,
with two events recorded in the same millisecond coming back in one stable order.

The read SHALL be narrowable to one work item's own events, and to a
comma-separated list of kinds, so that the history of estimate changes is one
request.

A kind under which nothing was recorded SHALL answer nothing rather than be
refused. A kind filter that names nothing at all SHALL be read as no filter.

A project that does not exist SHALL answer `not_found`, which SHALL be
distinguishable from a plan whose history is empty.

#### Scenario: the estimate history of a plan, in one request

- **GIVEN** a plan whose history holds estimate changes, a rename and a freeze
- **WHEN** its history is read filtered to the estimate kinds
- **THEN** only the estimate changes SHALL come back, newest first

#### Scenario: one row's history excludes the plan-wide events

- **GIVEN** a plan whose history holds one work item's events and a freeze
- **WHEN** its history is read filtered to that work item
- **THEN** the freeze SHALL NOT be in the answer

#### Scenario: an empty filter is not an empty history

- **GIVEN** a plan with a recorded history
- **WHEN** its history is read with a kind filter naming nothing
- **THEN** the whole history SHALL come back

#### Scenario: a plan that is not there is not a plan with no history

- **GIVEN** a project id nothing holds
- **WHEN** its history is read
- **THEN** the answer SHALL be `not_found`

### Requirement: The history is kept by age and never by count

Recorded events SHALL be removed once they are older than the retention window,
and by no other rule. The sweep SHALL run for as long as the process runs, SHALL
report how many events it removed, and SHALL leave the schedule in place when one
sweep fails.

An event exactly at the boundary SHALL be kept.

#### Scenario: a year-old event goes and a younger one stays

- **GIVEN** a history holding an event older than the window and one inside it
- **WHEN** a retention sweep runs
- **THEN** the older event SHALL be removed
- **AND** the younger event SHALL remain
- **AND** the sweep SHALL report one event removed from the history

#### Scenario: a failed history sweep does not stop the schedule

- **GIVEN** a sweep that fails
- **WHEN** the next tick arrives
- **THEN** a sweep SHALL run again
- **AND** the failure SHALL have been reported

### Requirement: No two migrations share one stamp

Reading the migrations on disk SHALL refuse a set in which two folders carry the
same stamp, and SHALL refuse a folder whose stamp is not a number. A rollback
SHALL refuse the same set rather than reversing nothing and reporting success.

#### Scenario: two folders stamped alike are refused

- **GIVEN** two migration folders carrying the same stamp
- **WHEN** the migrations on disk are read
- **THEN** the read SHALL fail and name the shared stamp
- **AND** a rollback against that set SHALL fail rather than report an empty
  reversal
