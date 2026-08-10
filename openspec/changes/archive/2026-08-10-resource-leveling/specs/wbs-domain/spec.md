## ADDED Requirements

### Requirement: A person does one thing at a time

The schedule SHALL place a slice no earlier than the finish of the previous
slice its assignee is doing, so that no two slices of one person overlap. This
SHALL apply to a slice whose role names that person and to every slice of a work
item whose **assumed assignee** they are.

A slice of zero length SHALL take no place in a person's queue: it neither waits
for its assignee nor makes them busy.

The person doing a slice SHALL be resolved before the schedule is computed and
SHALL NOT be derived a second time inside it.

#### Scenario: two work items, one person

- **GIVEN** `Strip` estimated at 3 days and `Sand` at 2, both assigned to Kat,
  and neither depending on the other
- **THEN** `Strip` runs 0→3 and `Sand` runs 3→5

#### Scenario: two work items, two people

- **GIVEN** the same plan with `Sand` assigned to Bo
- **THEN** both start on day 0

#### Scenario: one named assignee covers every role

- **GIVEN** a work item whose `Dev` is assigned to Kat and whose `QA` is
  assigned to nobody, and another work item's `Dev` assigned to Kat
- **THEN** Kat's three slices run one after another, and the first work item
  finishes after the second's `Dev` rather than beside it

#### Scenario: a role nobody has estimated

- **GIVEN** a work item with 3 days of `Dev` assigned to Kat and no `QA`
  estimate, and another 2-day work item of Kat's
- **THEN** the empty `QA` sits at day 3, the work item finishes on day 3, and
  the other work item runs 3→5

### Requirement: The schedule is levelled in one deterministic pass

The schedule SHALL be computed by placing each slice exactly once, in order of
`(critical-path earliest start, least float, work item number, role order)`,
taking the highest-priority slice whose predecessors are all placed. A slice
SHALL NOT be moved once placed, and the pass SHALL NOT be repeated.

The same plan SHALL always produce the same schedule. The schedule is NOT
required to be the shortest one that respects the constraints, and SHALL NOT be
described as such.

A plan whose dependencies contain a loop SHALL be refused with the same cycle
error as before, leaving the rows readable without dates.

#### Scenario: a dependency push does not re-overlap a person downstream

- **GIVEN** Kat holding a 4-day, a 2-day and a 2-day work item, the last of
  which waits for a 5-day work item
- **WHEN** the 2-day work item is pushed to 4→6 behind the 4-day one
- **THEN** the last runs 6→8 rather than 5→7, and no two of Kat's slices share
  a day

#### Scenario: the queue goes to what the plan needs first

- **GIVEN** two work items of Kat's, one of which cannot start before day 3
- **THEN** the one that can start at once takes the queue first, even though it
  has more slack

### Requirement: A slice says what is holding it

Every slice SHALL report the floor that decided its start — the project start, a
dependency, its work item's earlier role, a manual date, or a person — and,
when a person decided it, that person and the slice they were busy with.

A person SHALL be reported as the binding floor only when they are strictly the
latest of the floors: a person free exactly when the dependency clears is not
holding anything up.

#### Scenario: the person is what pushed it

- **GIVEN** a slice held off until its assignee finished another work item
- **THEN** it reports the person as its binding floor, names them, and names
  that other slice

#### Scenario: the person and the dependency land on the same day

- **GIVEN** a work item waiting for a 3-day predecessor whose assignee also
  comes free on day 3
- **THEN** it reports the dependency as its binding floor and names no person

### Requirement: The plan says how much of it is waiting for people

A project's work items SHALL be read with a count of how many of them hold a
slice a person is the binding floor of. A plan nobody is assigned to SHALL
report zero, and so SHALL a plan that could not be scheduled at all.

#### Scenario: nobody is assigned

- **THEN** the count is zero

#### Scenario: two work items queue on one person

- **GIVEN** a plan in which two work items each hold a slice pushed by their
  assignee
- **THEN** the count is two, whatever number of slices of theirs are waiting

## MODIFIED Requirements

### Requirement: A work item's schedule is the projection of its slices

A work item's own schedule SHALL be read off its slices: its start is the
earliest of theirs, its finish the latest, its late start the earliest of
theirs, its late finish the latest, its duration their total, and it SHALL be
reported as estimated when any one of them is. Its slack SHALL be the least
slack any of its slices has, and it SHALL be critical when any of them is.

Slack and critical SHALL be computed over the **augmented** graph — the plan's
dependencies, the work item's role order, and the queues the leveling produced
— so that a slice which cannot slip without moving the person's next piece of
work is reported as having no slack.

Parents SHALL span their descendants' projections exactly as they span their
leaves' schedules today, and rolled-up estimates SHALL be untouched: effort and
span stay two different numbers.

The projection SHALL be what leaves be-01. Slices SHALL NOT appear on the wire.

#### Scenario: the row spans its slices

- **GIVEN** a leaf whose `Dev` slice runs 2→5 and whose `QA` slice runs 5→6
- **THEN** its row starts on day 2, finishes on day 6, and is 4 days long

#### Scenario: a critical slice makes the row critical

- **GIVEN** a leaf on the critical path
- **THEN** the row is critical and its slack is zero

#### Scenario: a person pulls a work item's slices apart

- **GIVEN** a work item whose `Dev` has slack and whose `QA`, held back until
  its assignee came free, has none
- **THEN** the row reports no slack and is critical

#### Scenario: no plan without people in it changes

- **GIVEN** any project with no assignee — which is every project before this
  change
- **THEN** every work item's start, finish, late start, late finish, slack,
  duration, estimated flag and critical flag are exactly what the previous
  engine computed, to the last bit
