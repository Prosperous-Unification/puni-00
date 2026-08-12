## ADDED Requirements

### Requirement: A team may be sized, and its size bounds how much of its work runs at once

A service team SHALL carry a **size**: how many of its people may be at work
at once, across the whole of one project's plan. The size SHALL be optional,
and absent SHALL mean _nobody has said_ — not one. An unsized team SHALL
constrain no schedule at all, which is the state every plan written before the
field existed was scheduled under.

A sized team of N SHALL bound the slices of its work that run at the same
instant to N slots, **including slices somebody is named on**. The slot SHALL
be keyed on the **work item's** team, never on the assignee's memberships, so
naming a person on one team's work never spends another team's slots and a
team of four never shows five people at work.

Sizing a team SHALL NOT constrain who may be assigned to its work. A team
labels the work; a person does it; the two need not match.

The size SHALL be a fact about the team rather than about one project: two
projects labelled with the same team SHALL each be allowed its full size.

#### Scenario: an unsized team schedules exactly as no team does

- **GIVEN** a plan whose every work item is labelled with a team
- **AND** nobody has said how many people that team has
- **WHEN** the plan is scheduled
- **THEN** every date, every float and every critical row SHALL be what the
  same plan answers with no team on it at all

#### Scenario: a team of two runs two of its items at a time

- **GIVEN** three independent work items labelled with a team of size 2, each
  two days of work
- **WHEN** the plan is scheduled
- **THEN** the first two SHALL start on day 0
- **AND** the third SHALL start on day 2, bound by capacity

#### Scenario: a named person still spends their team's slot

- **GIVEN** a work item labelled with a team of size 1 and assigned to kat
- **AND** a second item labelled with the same team assigned to nobody
- **WHEN** the plan is scheduled
- **THEN** the two SHALL NOT run at the same time

### Requirement: A work item may state how many people work on it at once, and its effort compresses across them

A work item SHALL carry **max parallel**: how many people may be on it at
once. It SHALL be an integer of 1 or more and SHALL never be absent — 1 and
_unset_ are the same fact, one at a time, and the field SHALL have exactly one
spelling for it.

A slice's stored estimate SHALL be read as **effort**, and its **duration**
SHALL be that effort divided by the number of people on it. Where that number
is 1 the duration SHALL be the effort unchanged, to the bit.

The number of people actually on a slice — its **width** — SHALL be the
narrowest of three statements the plan makes: 1 where a person is named on the
work item, the team's own size where the item asks for more people than the
team has, and the stored max parallel otherwise. Width SHALL be decided from
stored data alone, before any placement, and SHALL NOT depend on what happened
to be free.

A block SHALL be **indivisible**: it takes its full width for its whole
duration or it waits. It SHALL NOT run narrow and widen later.

A slice SHALL keep its identity when its width changes: one node, one bar, one
row, and the same key.

#### Scenario: six days of effort across three people is two days of work

- **GIVEN** a work item of 6 days' effort with max parallel 3, on a team of at
  least 3
- **WHEN** the plan is scheduled
- **THEN** the slice SHALL run for 2 days
- **AND** SHALL report an effort of 6, a width of 3, and the same key it had

#### Scenario: an item cannot claim more people than its team has

- **GIVEN** a work item of 6 days' effort with max parallel 4
- **AND** its team is sized 2
- **WHEN** the plan is scheduled
- **THEN** the slice SHALL run at width 2 for 3 days

#### Scenario: naming one person collapses the item to one at a time

- **GIVEN** a work item with max parallel 3 and kat assigned to it
- **WHEN** the plan is scheduled
- **THEN** the slice SHALL run at width 1 for its whole effort

### Requirement: A team label on a parent reaches the leaves beneath it, most-specific wins

A team label written on a work item SHALL apply to every leaf beneath it that
carries none of its own. A leaf's own label SHALL beat every ancestor's, and a
nearer ancestor's SHALL beat a further one.

The inherited label SHALL name the row it came from, so every reader that
shows it can say where it was written.

No write SHALL copy a label down the tree. Inheritance SHALL be a reading,
computed in one place and shared by every consumer, so that no two readers can
disagree about the same row.

A parent chain that runs in a circle SHALL be refused rather than defaulted:
it has no nearest ancestor, and a fallback would put a row on a pool nobody
assigned it to.

#### Scenario: a parent's label reaches an unlabelled leaf

- **GIVEN** a parent labelled `Platform` with an unlabelled leaf beneath it
- **WHEN** the effective team is read
- **THEN** the leaf's effective team SHALL be `Platform`, from the parent

#### Scenario: the nearer ancestor wins

- **GIVEN** a root labelled `Platform`, a child of it labelled `Backend`, and
  an unlabelled leaf beneath that child
- **WHEN** the effective team is read
- **THEN** the leaf's effective team SHALL be `Backend`

#### Scenario: a circular parent chain is refused

- **GIVEN** rows whose parent chain runs in a circle
- **WHEN** the effective team is read
- **THEN** it SHALL throw rather than answer

### Requirement: A block waits for a whole window of free slots, and the schedule says so

A block SHALL start at the earliest instant at or after its other floors where
its team has enough free slots for **every instant of its duration**. A gap
too short to hold it SHALL be stepped over rather than taken.

Where a block's start is decided by its team having no free window earlier,
the slice SHALL report a floor of **capacity**. Where the team's window and
the assignee's queue clear on the same day the slice SHALL report **person**:
each floor kind SHALL mean it was strictly the latest of them, and a tie SHALL
keep the reason listed first.

A slice of no length, and a slice no sized team labels, SHALL reserve nothing
and wait for nothing.

Two reservations SHALL be allowed to abut: a block MAY start at the exact
instant another releases its slot, and the schedule SHALL NOT report a
transient over-capacity that never existed.

The schedule SHALL answer the same for the same plan however its rows and its
reservations arrived, and SHALL report how many work items are waiting for a
slot, beside — never folded into — how many are waiting for a person.

#### Scenario: a block skips a gap it cannot fit inside

- **GIVEN** a team of one with a one-day gap between two reservations
- **AND** a two-day block that could start in the gap
- **WHEN** the plan is scheduled
- **THEN** the block SHALL wait for the whole window rather than take the gap

#### Scenario: a block starts as another hands its slot over

- **GIVEN** a team of one with a reservation ending on day 4
- **AND** a block whose other floors clear on day 4
- **WHEN** the plan is scheduled
- **THEN** the block SHALL start on day 4

#### Scenario: a tie between the person and the pool names the person

- **GIVEN** a slice whose assignee comes free on day 6
- **AND** whose team's window also opens on day 6
- **WHEN** the plan is scheduled
- **THEN** the slice SHALL report a floor of `person`

### Requirement: Float carries every block that had to move, so no row is reported movable when it is not

Where a team's capacity decides a block's start, the schedule SHALL record
**every** reservation that had to end for that block to fit, not only the one
whose finish opened the window. Each of them SHALL constrain the block in the
float calculation.

The reported float MAY therefore be smaller than the true float, and SHALL
NOT ever be larger: "at least one of these must move" is a disjunction a
dependency graph cannot express, so the graph SHALL be at least as tight as
reality. No row SHALL be shown as having slack it does not have.

A reservation that never contended SHALL NOT be recorded, and a plan whose
sized teams never contend SHALL produce no capacity constraint at all.

A slice held up by capacity SHALL also name one of the blocking set as the
referent a chart draws its arrow to — the latest finisher, ties broken by
placement order. A slice reporting a capacity floor with nothing blocking it
SHALL be refused rather than drawn.

#### Scenario: a block whose slack another block's finish is holding reports it

- **GIVEN** a team of two, held by width-1 blocks A and B ending on days 5
  and 7
- **AND** a width-2 block X that therefore starts on day 7 and ends the project
- **WHEN** the plan is scheduled
- **THEN** A's float SHALL be 2, not unbounded

#### Scenario: a sized team that never contends changes nothing

- **GIVEN** a plan whose every row is labelled with a team sized far beyond
  anything the plan asks of it
- **WHEN** the plan is scheduled
- **THEN** every date, float and critical row SHALL be what the same plan
  answers unpooled
- **AND** no slice SHALL carry a blocking set
