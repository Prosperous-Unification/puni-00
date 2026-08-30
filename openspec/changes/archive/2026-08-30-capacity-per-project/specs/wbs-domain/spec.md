## ADDED Requirements

### Requirement: A team's capacity is a fact about one project, and there is no global number behind it

The system SHALL store how many of a team may be at work at once **per project**,
keyed on the (project, team) pair.

A pair with no stored size SHALL be _unstated_ and SHALL constrain that team's
work on that plan not at all. _Unstated_ SHALL have exactly one spelling — the
absence of a row — and a stored size SHALL NOT be nullable.

No read path SHALL consult a team's global size. In particular a pair with no
stored size SHALL NOT fall back to one: a project that has stated nothing is
unconstrained, not bounded by a number somebody typed for a different plan.

Two projects labelling work with the same team SHALL be bounded independently,
and a write to one SHALL move no date in the other.

#### Scenario: two projects labelled with one team are bounded apart

- **GIVEN** a team labelling contended work in two projects
- **AND** the first project states two of them at once and the second states one
- **WHEN** each plan is read
- **THEN** the first plan SHALL run two of that team's slices at once
- **AND** the second plan SHALL run one
- **AND** raising the first project's number SHALL move no date in the second

#### Scenario: a pair nobody has stated constrains nothing

- **GIVEN** a team whose work fills a plan
- **AND** no capacity stated for that team on that plan
- **WHEN** the plan is read
- **THEN** the plan SHALL be constrained by no pool for that team
- **AND** the plan SHALL NOT be bounded by any number stated for another project

#### Scenario: clearing a project's capacity leaves it unstated rather than at one

- **GIVEN** a project stating four of a team at once
- **WHEN** a client clears that project's capacity for the team
- **THEN** the pair SHALL read as unstated
- **AND** that team's work on that plan SHALL be constrained by no pool

### Requirement: The migration seeds every existing project from the global number it is retiring

Applying this change SHALL write one capacity row for every pair of a project
that already exists and a team that already carries a global size, each row
carrying that team's global number.

A team with no global size SHALL be seeded nowhere: unstated before the migration
SHALL be unstated after it.

Every plan SHALL schedule identically across the migration — every field of every
work item and every slice — and the identity SHALL be asserted against an answer
captured from the release being replaced, rather than against one recomputed by
the release replacing it.

The global column SHALL be kept in the table and read by nothing, because the
outgoing release still selects it while both releases share one database file.

#### Scenario: an existing plan's dates do not move

- **GIVEN** a plan whose work is labelled with a team sized globally at two
- **WHEN** the change is applied
- **THEN** the plan SHALL schedule exactly as it did before
- **AND** the project SHALL state two of that team at once

#### Scenario: an unsized team seeds nothing

- **GIVEN** a team nobody has sized
- **WHEN** the change is applied
- **THEN** no project SHALL hold a capacity for that team

#### Scenario: a label added after the migration is bounded as it would have been

- **GIVEN** a project that existed at the migration, and a team sized globally at four
- **AND** the project labelled no work with that team at the time
- **WHEN** somebody labels work in it with that team afterwards
- **THEN** the plan SHALL be bounded at four of them at once

### Requirement: A project's capacity for a team may be written, and only that project is told

The API SHALL accept a capacity for a (project, team) pair as a whole number from
1 to 1000, and SHALL clear it on `null`.

A value that is not a whole number of at least 1 — `0`, a negative, a fraction, a
string, a boolean, or a non-finite number — SHALL be refused with 400 and SHALL
write nothing. A value above 1000 SHALL be refused with 400 and SHALL write
nothing. The ceiling SHALL be stated in the refusal from one shared constant
rather than from a copy per route.

A write SHALL be refused with 404 for a project or a team that does not exist,
and SHALL write nothing.

A write SHALL announce to **the project it names and no other**, so that a plan
open on another screen redraws and a plan sharing the team does not.

#### Scenario: a capacity of zero is refused, and nothing is stored

- **GIVEN** a project stating three of a team at once
- **WHEN** a client asks for a capacity of `0`
- **THEN** the request SHALL be refused with 400
- **AND** the project SHALL still state three

#### Scenario: only the project named is told

- **GIVEN** two projects labelling work with one team, both open on a screen
- **WHEN** one project's capacity for that team is written
- **THEN** the project written SHALL be told to read again
- **AND** the other project SHALL NOT be told

#### Scenario: a team that does not exist is refused

- **GIVEN** a project
- **WHEN** a client writes a capacity naming a team id nothing holds
- **THEN** the request SHALL be refused with 404
- **AND** the project SHALL hold no capacity for that id

### Requirement: The plan states its own capacities, and the directory states none

The plan's own surface SHALL let a reader state how many of each team on that plan
may be at work at once, and SHALL list the teams **this plan's work is labelled
with**, an inherited label included.

The directory SHALL NOT offer a team size. A global size is read by nothing, and a
box that writes a number no schedule reads SHALL NOT be shown.

An empty box SHALL mean _unstated_ rather than zero, because zero is a refusal and
a pool of no slots is a plan of infinite dates. A non-finite draft SHALL be
refused locally rather than sent, because JSON writes it as `null` and `null` is
the clear.

#### Scenario: a team only an ancestor labels is still listed

- **GIVEN** a plan whose parent row carries a team and whose leaves carry none
- **WHEN** the plan's teams are listed
- **THEN** that team SHALL be listed
- **AND** stating a capacity for it SHALL move the leaves' dates

#### Scenario: the directory offers no size

- **GIVEN** the directory page
- **WHEN** a team is shown
- **THEN** no control SHALL offer to set how many of them are at work at once

#### Scenario: emptying the box unstates the capacity

- **GIVEN** a plan stating two of a team at once
- **WHEN** the box is emptied
- **THEN** the pair SHALL be cleared to unstated
- **AND** the request SHALL NOT carry a zero

## MODIFIED Requirements

### Requirement: Removing a sized team says what capacity it releases

Removing a team SHALL name, on every work item whose **effective** team it is,
that the removal takes a capacity constraint away — and the number it names SHALL
be **that work item's own project's** capacity for the team.

A project that states no capacity for the team SHALL have no capacity effect
named on its rows, even where another project in the same confirmation does.

#### Scenario: two projects, one sized, one not

- **GIVEN** a team labelling work in two projects
- **AND** only the first project stating a capacity for it
- **WHEN** the removal is confirmed against
- **THEN** the first project's rows SHALL name the capacity released and its number
- **AND** the second project's rows SHALL name only the label going
