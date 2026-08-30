## RENAMED Requirements

- FROM: `### Requirement: A team may be sized, and its size bounds how much of its work runs at once`
- TO: `### Requirement: A team's capacity bounds how much of its work runs at once on one plan`

## MODIFIED Requirements

### Requirement: A team's capacity bounds how much of its work runs at once on one plan

A **capacity** SHALL be how many of one service team's people may be at work at
once, across the whole of **one project's plan**. It SHALL be optional, and
absent SHALL mean _nobody has said_ — not one. A team a plan states no capacity
for SHALL constrain that plan's schedule not at all, which is the state every
plan written before the field existed was scheduled under.

A capacity of N SHALL bound the slices of that team's work on that plan to N
slots at any instant, **including slices somebody is named on**. The slot SHALL
be keyed on the **work item's** team, never on the assignee's memberships, so
naming a person on one team's work never spends another team's slots and a team
of four never shows five people at work.

Stating a capacity SHALL NOT constrain who may be assigned to the team's work. A
team labels the work; a person does it; the two need not match.

The capacity SHALL be a fact about the **pair** of one project and one team.
Two projects labelled with the same team SHALL each state their own, and neither
SHALL read the other's or any number held on the team itself.

#### Scenario: a team no capacity is stated for schedules exactly as no team does

- **GIVEN** a plan whose every work item is labelled with a team
- **AND** nobody has stated a capacity for that team on that plan
- **WHEN** the plan is scheduled
- **THEN** every date, every float and every critical row SHALL be what the
  same plan answers with no team on it at all

#### Scenario: a capacity of two runs two of its items at a time

- **GIVEN** three independent work items labelled with a team the plan states a
  capacity of 2 for, each two days of work
- **WHEN** the plan is scheduled
- **THEN** the first two SHALL start on day 0
- **AND** the third SHALL start on day 2, bound by capacity

#### Scenario: a named person still spends their team's slot

- **GIVEN** a work item labelled with a team the plan states a capacity of 1
  for, assigned to kat
- **AND** a second item labelled with the same team assigned to nobody
- **WHEN** the plan is scheduled
- **THEN** the two SHALL NOT run at the same time

#### Scenario: two plans sharing a team do not share its number

- **GIVEN** two projects whose work is labelled with one team
- **AND** only the first stating a capacity for it
- **WHEN** both are scheduled
- **THEN** the first SHALL be bound by its number
- **AND** the second SHALL be bound by no pool at all

### Requirement: A work item carries a priority, and the leveller places by it

A work item's **priority** SHALL be an integer of 1 or more, where a smaller
number is more important and no number is too large. A work item MAY carry
none, which is a state of its own and not a large number.

Priority SHALL decide the order the resource leveller places slices in: where
two slices are both eligible, the one whose work item has the smaller priority
is placed first. A slice whose work item has no priority SHALL be placed after
every slice that has one, whatever its number. Slices that tie on priority —
including two that both have none — SHALL be ordered by the rule that ordered
every slice before priority existed: the critical path's start, then the least
float, then the work item's number, then the role order.

Priority SHALL decide **placement** and SHALL NOT promise a start. Under a
team's capacity the two come apart: a block that needs more slots than are free
waits for a whole window, while a narrower block placed after it may take a hole
the wide one cannot use and therefore start earlier. The schedule SHALL NOT
reserve a future window for a higher-priority block, because idling slots that
work is available for finishes the plan later for the sake of a display promise.

#### Scenario: two work items on one person start in priority order

- **WHEN** two work items are assigned to the same person, can both start on day
  zero, and the one the plan reads second is given priority 1 while the other is
  given priority 2
- **THEN** the priority-1 work item starts on day zero and the priority-2 work
  item waits for the person to finish it

#### Scenario: a set priority outranks an unset one

- **WHEN** two work items compete for one person and only the one the plan reads
  second carries a priority
- **THEN** the one carrying it goes first, and the one without waits

#### Scenario: priority decides a tie the float rule would have decided

- **WHEN** two slices competing for one person differ in float, and the slacker
  of the two is given the smaller priority
- **THEN** the slacker slice is placed first: priority is asked before float

#### Scenario: float still breaks a tie between equal priorities

- **WHEN** two slices competing for one person carry the same priority and
  differ in float
- **THEN** the one with less float is placed first

#### Scenario: a narrow block overtakes a wider one of higher priority

- **GIVEN** a plan stating a capacity of 2 for a team
- **AND** a priority-1 work item needing 3 people at once and a priority-2 work
  item needing 1, both labelled with that team and both eligible on day zero
- **WHEN** the plan is scheduled
- **THEN** the priority-1 item SHALL be placed first
- **AND** the priority-2 item SHALL start first, because one free slot is a hole
  a block needing three cannot use

## REMOVED Requirements

### Requirement: A team's size and a work item's parallelism may be written, and neither may be written wrong

**Reason**: Half of it describes a route that no longer exists.
`capacity-per-project` deleted `PATCH /api/teams/:id/size` along with
`DirectoryService.resizeTeam` and `DirectoryRepository.resizeTeam`, so there is
no team size to write. The parallelism half is unchanged and is restated whole
in this change's ADDED section as `A work item's parallelism may be written, and
it may not be written wrong`, because a removal that took the surviving half
with it would leave the `0`/`1001` refusals specified nowhere.

**Migration**: A client that wrote a team size writes a project's capacity for a
team instead: `PUT /api/projects/:id/teams/:teamId/capacity`. The validation is
the same — a whole number from 1 to 1000, `null` to clear, 400 on anything else
— and it is specified by `capacity-per-project`'s `A project's capacity for a
team may be written, and only that project is told`, which additionally refuses
404 for a project or team that does not exist.

### Requirement: Sizing a team tells every project whose dates it moves

**Reason**: The write it announces for is gone, and the announcement it
specifies is the wrong one. A capacity is a fact about one project, so a write
moves one project's dates and no other's — announcing to every project holding
the team's work would tell plans that did not move to redraw.

**Migration**: `capacity-per-project`'s `A project's capacity for a team may be
written, and only that project is told` carries the rule that replaced it: the
announcement reaches the project named and no other. The `directory_changed`
announcement itself survives, unchanged, for the four directory writes that
still send it: renaming a team, renaming a person, removing a team and removing
a person.

### Requirement: A team's size can be stated in the directory, and cleared back to unstated

**Reason**: The directory page has no project, so a box on it could only ever
have meant "the plan you last had open", which reads as global and is not. It
was the right surface while the number was global; `capacity-per-project` made
the number a project's and removed the box.

**Migration**: The plan's own toolbar states it — the `Teams` dialog, specified
by `capacity-per-project`'s `The plan states its own capacities, and the
directory states none`, which carries forward every rule this requirement held
that still applies: an empty box means _unstated_ rather than zero, a non-finite
draft is refused locally, and a refusal is shown as a sentence rather than a
wire code. The directory keeps names, members and removal.

## ADDED Requirements

### Requirement: A work item's parallelism may be written, and it may not be written wrong

The API SHALL accept a **work item parallelism** as a whole number from 1 to 1000.

A value that is not a whole number of at least 1 — `0`, a negative, a fraction,
a string, a boolean, or a non-finite number — SHALL be refused with 400 and
SHALL write nothing. A value above 1000 SHALL be refused with 400 and SHALL
write nothing.

The floor of 1 SHALL be treated as a correctness bound rather than a
preference: a plan's duration is its effort divided by the number of people on
it, so a stored 0 is a schedule of infinite dates with nothing on screen to
explain it. The ceiling SHALL be a stated product limit and SHALL NOT be
justified by floating-point behaviour.

`null` SHALL reset a parallelism to 1 — one at a time and _unset_ are one fact
and SHALL have one spelling.

A field the request does not name SHALL be left as it stands.

#### Scenario: a parallelism of zero is refused, and nothing is stored

- **GIVEN** a work item running three people at once
- **WHEN** a client asks for a parallelism of `0`
- **THEN** the request SHALL be refused with 400
- **AND** the work item SHALL still run three at once

#### Scenario: a parallelism above the limit is refused where a non-finite one cannot see it

- **GIVEN** a work item
- **WHEN** a client asks for a parallelism of `1001`
- **THEN** the request SHALL be refused with 400
- **AND** a parallelism of `1000` SHALL be accepted

### Requirement: The tool explains what a capacity is, where it is typed, and what the chart's words mean

The repository SHALL carry, outside the change folders, prose that answers why a
plan's dates moved: what a capacity is a fact about, where the number is typed,
how width and effort become a duration, and each part of the sentence a
capacity-floored bar shows.

That prose SHALL name the states a (project, team) pair can be in, including the
one with no control on screen — a capacity stated for a team the plan's work is
no longer labelled with, which the plan keeps and silently re-applies.

`CONTEXT.md` SHALL carry the program's terms, because it is the glossary every
artifact is required to draw its words from, and a term used in four changes and
defined in none is a word each reader resolves privately.

#### Scenario: a reader asks why the dates moved

- **GIVEN** a reader who has not opened `openspec/changes/`
- **WHEN** they follow `LLM_README.md`'s doc index
- **THEN** they SHALL reach a page naming where the number is typed and what it
  does to a plan's dates

#### Scenario: an artifact needs a word for the slots a team's work competes for

- **WHEN** a change is written about capacity
- **THEN** `CONTEXT.md` SHALL already define pool, slot, block, width, blocking
  set and capacity itself

### Requirement: A pool wait counts the other blockers in the reader's own grammar

The sentence a capacity-floored bar shows SHALL count the blocking set minus the
one it names, and SHALL agree in number with that count: one other reads
`and 1 other`, more than one reads `and N others`, and none is written at all.

#### Scenario: a blocking set of exactly two

- **GIVEN** a bar held back by two other bars holding its pool
- **WHEN** the bar's floor sentence is read
- **THEN** it SHALL end `and 1 other`

#### Scenario: a blocking set of three

- **GIVEN** a bar held back by three other bars holding its pool
- **WHEN** the bar's floor sentence is read
- **THEN** it SHALL end `and 2 others`
