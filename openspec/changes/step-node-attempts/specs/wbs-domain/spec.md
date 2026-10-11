## ADDED Requirements

### Requirement: An attempt is one run at a step node's work and is never pruned

Every attempt SHALL be one row of `step_node_attempt` keyed by work item, step and attempt
number, carrying a start instant, an end instant that is null while it runs, an outcome of
`succeeded`, `failed` or `cancelled` that is null exactly when the end is, an optional
executor person, one optional reference and an optional note, with audit columns. Attempt
numbers SHALL start at 1 and be assigned as the node's highest plus one inside the write
transaction; a removed number SHALL never be reused. At most one attempt per node SHALL be
running, held by a unique partial index as well as by the command's refusal. Attempts SHALL never be pruned and SHALL move with the node's other facts when a leaf
gains its first child. Attempts SHALL write no progress statement and SHALL be read by no
engine.

#### Scenario: numbers count up and never reuse

- **GIVEN** `010.dev` with attempts 1 and 2 ended
- **WHEN** attempt 2 is removed and a new attempt started
- **THEN** the new attempt is number 3

#### Scenario: an attempt is not a statement

- **GIVEN** `010.dev` with no statement
- **WHEN** an attempt is started and ended `succeeded`
- **THEN** `010.dev`'s progress is still absent and the leaf's status is unchanged by it

#### Scenario: attempts survive hand-down and the prune

- **GIVEN** a leaf with two attempts on `Dev` and a plan history older than 365 days
- **WHEN** the leaf gains its first child and the history prune runs
- **THEN** the child's `Dev` node holds both attempts and the journalled node mapping

### Requirement: Attempts are started, ended and removed as journalled commands

`startAttempt` SHALL refuse `409 node_done` on a node whose statement is `done` and `409
attempt_running` on a node with a running attempt. `endAttempt` SHALL refuse `409
no_running_attempt` when none runs and `422 attempt_ends_before_start` when `at` precedes the
running attempt's start. Both SHALL refuse `422 attempt_in_future` when `at` is after the
write stamp, and SHALL take the write stamp as `at` when it is omitted. `removeAttempt` SHALL
refuse `404 unknown_attempt`. Each SHALL be one journal entry whose inverse restores the row
verbatim. A `setStatus done` SHALL leave a running attempt running.

#### Scenario: a second start is refused

- **GIVEN** `010.dev` with a running attempt
- **WHEN** `startAttempt` is sent again
- **THEN** it is refused `409 attempt_running` and the node still holds one attempt

#### Scenario: a done node needs reopening first

- **GIVEN** `010.dev` stated `done`
- **WHEN** `startAttempt` is sent
- **THEN** it is refused `409 node_done`; after `setProgress in_progress` the same command
  starts attempt 1

#### Scenario: now is the act

- **GIVEN** a clock whose act stamps `2026-10-11T14:02:00Z`
- **WHEN** `startAttempt` is sent with no `at`
- **THEN** the attempt's start is `2026-10-11T14:02:00Z`

#### Scenario: one undo restores an ended attempt

- **GIVEN** a running attempt
- **WHEN** it is ended `failed` with a reference, then the actor undoes once
- **THEN** the attempt is running again with no outcome and no reference

### Requirement: Instants are read as days in the project timezone

A project SHALL carry `timezone`, an IANA zone name, `UTC` unless set, validated at the
boundary against the server runtime's supported zones (`422 invalid_timezone`), which `GET
/api/timezones` SHALL return so that Settings offers only zones the server accepts. Every day derived from an instant — an attempt's day on a card, a fact fill — SHALL
be computed in the project timezone and never in the viewer's browser zone. Under `UTC` every
derived day SHALL equal today's `isoDateOfInstant`.

#### Scenario: a Kyiv finish is the same day for every reader

- **GIVEN** a project in `Europe/Kyiv` and an attempt ended `2026-10-11T23:30:00Z`
- **WHEN** two readers in different browser zones open the card
- **THEN** both read `12 Oct`

#### Scenario: a non-IANA zone is refused

- **WHEN** the project is patched with `timezone: 'Kyiv'`
- **THEN** it is refused `422 invalid_timezone` and the project keeps its zone

### Requirement: Node and leaf spans are derived from attempts

A node's span SHALL be its first attempt's start to its last attempt's end, open while one
runs, and absent with no attempts; a leaf's span SHALL be the same fold over its nodes. Neither
SHALL be stored, and both SHALL be on the work-item read beside the attempts.

#### Scenario: a running attempt leaves the span open

- **GIVEN** `010.dev` with attempt 1 ended and attempt 2 running
- **WHEN** the plan is read
- **THEN** `010.dev`'s span starts at attempt 1's start and has no end, and so does the leaf's

#### Scenario: no attempts, no span

- **GIVEN** a leaf whose nodes hold no attempt
- **WHEN** the plan is read
- **THEN** no span is reported for the leaf or its nodes

### Requirement: The step cell card lists attempts and offers start and end

A leaf's step cell card SHALL list the node's attempts newest first with number, outcome,
start and end in the project zone, executor and reference, and SHALL offer `Start attempt`
and, while one runs, `End attempt` with the three outcomes and a reference box, each sent
through the command batch. A refusal SHALL be worded in a toast.

#### Scenario: ending from the card

- **GIVEN** a node with attempt 2 running
- **WHEN** the reader ends it `succeeded` with reference `PR #12`
- **THEN** the card lists `#2 succeeded · … · PR #12` and offers `Start attempt` again

## MODIFIED Requirements

### Requirement: Marking done fills an empty fact end with the day of the act

Marking a work item `done` SHALL fill the fact end of every work item the act writes — the
leaves and, for a parent, the parent itself — whose `factEnd` is `null` with `on`, and the
fact start of each whose `factStart` is `null` with `factStart` when the command carries one.
With `on` absent, a leaf holding at least one ended attempt SHALL take the project-timezone
day of its last attempt's end, and every other row SHALL take the project-timezone day of the
act's own write stamp. With `factStart` absent, `in_progress` or `done` on a leaf holding at
least one attempt and no fact start SHALL fill it with the project-timezone day of its first
attempt's start. Under the default `UTC` zone and with no attempts every fill SHALL equal
today's. A stored day SHALL NOT be overwritten by the fill. A `factStart` that is not an
`IsoDate` SHALL be refused `400 factStart_must_be_a_date` before any service runs. Setting
`unknown` SHALL set both `factEnd` and `factStart` to `null` on every work item in scope whose
status read `done` before the act, and SHALL leave the facts of every other row untouched. The
fills and the clears SHALL be part of the same journal entry as the statements, so one undo
takes them away or puts them back together.

#### Scenario: a typed fact end survives the mark

- **GIVEN** a leaf whose fact end reads `2026-09-10`
- **WHEN** it is marked `done` with `on: '2026-09-12'`
- **THEN** its fact end still reads `2026-09-10`

#### Scenario: be-01 supplies the day when the client does not

- **GIVEN** a `UTC` project, a clock whose act stamps `2026-09-12T23:30:00Z`, and a leaf with
  no attempts
- **WHEN** the leaf, holding no fact end, is marked `done` with no `on`
- **THEN** its fact end reads `2026-09-12`

#### Scenario: the attempt is the better witness

- **GIVEN** a `UTC` leaf whose `Dev` attempt ran `2026-10-09T08:00Z`–`2026-10-10T02:00Z` and
  no facts
- **WHEN** it is marked `done` on `2026-10-11` with no `on`
- **THEN** its fact start reads `2026-10-09` and its fact end `2026-10-10`

#### Scenario: the project zone decides the day

- **GIVEN** a `Europe/Kyiv` project, a clock stamping `2026-09-12T23:30:00Z`, and a leaf with
  no attempts and no fact end
- **WHEN** it is marked `done` with no `on`
- **THEN** its fact end reads `2026-09-13`

#### Scenario: the reader's day wins over the server's

- **GIVEN** a browser whose local day is `2026-09-13` while UTC is still `2026-09-12`, and a
  leaf with no fact end whose forecast ends on or after `2026-09-13`
- **WHEN** the Status cell marks it done and the completion prompt is confirmed as offered
- **THEN** the command carries `on: '2026-09-13'` and the fact end reads `2026-09-13`

#### Scenario: the start is filled where empty and kept where typed

- **GIVEN** two leaves, one with no fact start and one with `2026-09-02`
- **WHEN** each is marked `done` with `on: '2026-09-12', factStart: '2026-09-08'`
- **THEN** the first's fact start reads `2026-09-08` and the second's still `2026-09-02`

#### Scenario: a non-date start is refused

- **GIVEN** a `setStatus` with `factStart: 'last week'`
- **WHEN** it reaches the commands route
- **THEN** it is refused `400 factStart_must_be_a_date` and no row is written

#### Scenario: unknown takes both days, and one undo brings both back

- **GIVEN** a parent marked `done` on `2026-09-12` from `2026-09-08`
- **WHEN** `setStatus` sets it `unknown`, then the actor undoes once
- **THEN** every fact start and fact end in scope is `null` after the act and back after the
  undo, from one journal entry
