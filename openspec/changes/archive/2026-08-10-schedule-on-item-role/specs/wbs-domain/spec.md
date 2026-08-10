## ADDED Requirements

### Requirement: A project's roles are held in an order

A project SHALL hold its roles in an explicit order, and every read of them —
the project response, the schedule, the estimate columns — SHALL return them in
that order. A role added to a project SHALL take the last place in it. The
order SHALL NOT depend on a role's name, its id, or the order the database
happens to return rows in.

#### Scenario: a role added later, whose name sorts first

- **GIVEN** a project holding `Dev` and `QA`
- **WHEN** a role called `Analysis` is added
- **THEN** the project's roles read `Dev`, `QA`, `Analysis`

#### Scenario: the seeded order survives

- **WHEN** a new project is created
- **THEN** its roles read `Dev`, `QA`, in that order, on every read

### Requirement: A work item's work is scheduled per role, in role order

The schedule SHALL be computed in **slices** — one work item and one role. A
leaf work item SHALL hold one slice per role the project holds, and those
slices SHALL run one after another in the project's role order. A parent work
item SHALL hold no slices, exactly as it holds no duration.

A slice's length SHALL be that work item's final figure for that role. A slice
nobody has estimated SHALL be zero days long and SHALL be reported as
unestimated rather than as instant.

A leaf work item in a project holding **no** roles SHALL still be scheduled, as
a single slice belonging to no role.

#### Scenario: two roles run one after the other

- **GIVEN** a leaf estimated at 3 days of `Dev` and 2 days of `QA`, starting on
  day 0
- **THEN** its `Dev` slice runs 0→3 and its `QA` slice runs 3→5

#### Scenario: an unestimated slice takes no time

- **GIVEN** a leaf estimated at 4 days of `QA` and not at all for `Dev`
- **THEN** its `Dev` slice is zero days and unestimated, and its `QA` slice runs
  from the day the work item may start

#### Scenario: a project whose roles have all been removed

- **GIVEN** a project whose last role has been removed
- **THEN** every work item still has a schedule, and every one of them is
  unestimated

### Requirement: A dependency waits for the whole of one work item and holds up the whole of another

A dependency SHALL mean that the predecessor's **last** slice finishes before
the successor's **first** slice starts, both in role order, with parent ends
expanded to their leaves exactly as they are today.

Every later slice of the successor SHALL therefore wait too, through the order
its own slices run in — including a first slice nobody has estimated, which
SHALL NOT be free to start before the work item it waits for.

A manual "start no earlier than" SHALL apply to the work item's first slice,
and thereby to all of them.

#### Scenario: an unestimated first role does not escape the wait

- **GIVEN** `A` estimated at 3 days, and `B` depending on `A` with no `Dev`
  estimate and 2 days of `QA`
- **THEN** `B`'s `Dev` slice sits at day 3, its `QA` slice runs 3→5, and the
  row for `B` starts on day 3 — not on day 0

#### Scenario: the wait is for the last role, not the first

- **GIVEN** `A` estimated at 3 days of `Dev` and 2 days of `QA`, and `B`
  depending on `A`
- **THEN** `B` starts on day 5

### Requirement: A work item's schedule is the projection of its slices

A work item's own schedule SHALL be read off its slices: its start is the
earliest of theirs, its finish the latest, its late start the earliest of
theirs, its late finish the latest, its duration their total, and it SHALL be
reported as estimated when any one of them is. Its slack SHALL be the least
slack any of its slices has, and it SHALL be critical when any of them is.

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

#### Scenario: no plan that exists today changes

- **GIVEN** any project a released database can hold — no resource constraint,
  and at most the two roles a project could be given before this release
- **THEN** every work item's start, finish, late start, late finish, slack,
  duration, estimated flag and critical flag are exactly what the previous
  engine computed, to the last bit, whatever order that engine's estimates were
  read in

### Requirement: A work item's estimates are read in role order

A project's estimates SHALL be read in role order within each work item, and
that order SHALL NOT depend on the ids of the rows or on how the database
chooses to answer the query.

The order is part of the contract because a work item's duration is those
figures added together, and addition in binary floating point is not
associative: three roles summed in one order and in another can differ in the
last place, and a finish is turned into a calendar day by rounding up. A work
item SHALL NOT be able to end on a different day because the database picked a
different index.

#### Scenario: the ids sort the other way

- **GIVEN** a work item estimated for `Dev` and for `QA`, where `QA`'s role id
  sorts before `Dev`'s
- **THEN** the estimates are read `Dev` first, because `Dev` runs first

#### Scenario: a third role is summed in one order only

- **GIVEN** a work item estimated for three roles
- **THEN** its duration is those three figures added in role order, and adding
  them in that order is the only order the plan is ever computed from
