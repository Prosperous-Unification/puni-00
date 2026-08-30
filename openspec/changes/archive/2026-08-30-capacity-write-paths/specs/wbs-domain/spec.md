## ADDED Requirements

### Requirement: A team's size and a work item's parallelism may be written, and neither may be written wrong

The API SHALL accept a **team size** and a **work item parallelism**, each a
whole number from 1 to 1000.

A value that is not a whole number of at least 1 — `0`, a negative, a fraction,
a string, a boolean, or a non-finite number — SHALL be refused with 400 and
SHALL write nothing. A value above 1000 SHALL be refused with 400 and SHALL
write nothing.

The floor of 1 SHALL be treated as a correctness bound rather than a
preference: a plan's duration is its effort divided by the number of people on
it, so a stored 0 is a schedule of infinite dates with nothing on screen to
explain it. The ceiling SHALL be a stated product limit and SHALL NOT be
justified by floating-point behaviour.

`null` on a work item's parallelism SHALL reset it to 1 — one at a time and
_unset_ are one fact and SHALL have one spelling. `null` on a team's size SHALL
clear it to _unstated_, which constrains no schedule, and SHALL NOT be read as
a team of one.

A field the request does not name SHALL be left as it stands.

#### Scenario: a parallelism of zero is refused, and nothing is stored

- **GIVEN** a work item running three people at once
- **WHEN** a client asks for a parallelism of `0`
- **THEN** the request SHALL be refused with 400
- **AND** the work item SHALL still run three at once

#### Scenario: a size above the limit is refused where a non-finite one cannot see it

- **GIVEN** a team in the directory
- **WHEN** a client asks for a size of `1001`
- **THEN** the request SHALL be refused with 400
- **AND** a size of `1000` SHALL be accepted

#### Scenario: clearing a size leaves the team unstated rather than at one

- **GIVEN** a team sized at four
- **WHEN** a client asks for a size of `null`
- **THEN** the team SHALL read as unstated
- **AND** the plans it labels SHALL be constrained by no pool at all

### Requirement: Parallelism belongs to a leaf, and a row with children refuses it

A work item that has children SHALL refuse a parallelism with 400, naming
`has_children`, and SHALL store nothing. A row with children has no slices of
its own, so a number written there would decide nothing while reading on screen
as though it did.

A leaf that later gains a child SHALL keep the number it was given. The write
was legal when it was made, and no later structural edit SHALL rewrite it.

#### Scenario: a parent refuses the number

- **GIVEN** a work item with one child
- **WHEN** a client asks for a parallelism of three on the parent
- **THEN** the request SHALL be refused with 400 and `has_children`
- **AND** the parent SHALL still read as one at a time

#### Scenario: a leaf that gains a child keeps its inert number

- **GIVEN** a leaf running three people at once
- **WHEN** a child is added beneath it
- **THEN** the row SHALL still carry three
- **AND** nothing in the schedule SHALL read it

### Requirement: A work item's parallelism is undoable like every other field of it

A parallelism write SHALL move the work item's revision and SHALL be journalled
as a compensating patch, so undo and redo reverse it exactly as they reverse a
rename.

An undo SHALL restore only the fields the patch it reverses named. An undo of
the first parallelism a work item was ever given SHALL restore 1, which is the
state before the write rather than an absence.

An undo SHALL be refused when the work item has moved since, with the same
stale refusal every other field's undo answers.

#### Scenario: undo puts the replaced number back

- **GIVEN** a work item taken from three at once to five
- **WHEN** the change is undone
- **THEN** the work item SHALL run three at once again

#### Scenario: undo is refused against a row somebody else has edited

- **GIVEN** a parallelism written, and then a rename by somebody else
- **WHEN** the parallelism is undone
- **THEN** the undo SHALL be refused as stale
- **AND** neither the parallelism nor the rename SHALL be changed

### Requirement: Sizing a team tells every project whose dates it moves

A write to a team's size SHALL announce `directory_changed` to every project
holding a work item that team labels, after the write has committed, one event
per project.

The announcement SHALL reach a project the team reaches **only through
inheritance** — where the label sits on an ancestor and the work is on the
leaves beneath it.

A write to a team nothing labels SHALL announce nothing. A write naming a team
that is not there SHALL be refused with 404, SHALL write nothing and SHALL
announce nothing.

A reconnecting client SHALL be handed the announcement from the project's
recorded event stream.

#### Scenario: two projects hear, a third does not

- **GIVEN** a team labelling work in two projects and none in a third
- **WHEN** the team is sized
- **THEN** the two SHALL each be told the directory changed
- **AND** the third SHALL be told nothing

#### Scenario: the label is on a parent and the work is beneath it

- **GIVEN** a project whose only labelled row is a parent
- **WHEN** the team is sized
- **THEN** that project SHALL be told the directory changed

### Requirement: Removing a sized team names the capacity it takes, not only the label

The confirmation refusing an unconfirmed team removal SHALL name, for every
work item whose **effective** team is the one being removed, that the removal
releases a capacity constraint — including work items that inherit the label
and therefore have none of their own to lose.

Each such effect SHALL carry the size being released and the row whose label
puts the work on that pool.

A team with no size SHALL produce no such effect: it constrains nothing, so its
removal moves no date.

The effects SHALL be recounted on each refusal rather than carried over from an
earlier one.

#### Scenario: an inherited row appears in the confirmation

- **GIVEN** a sized team labelling a parent, with an unlabelled leaf beneath it
- **WHEN** a client asks to remove the team without confirming
- **THEN** the refusal SHALL name the parent losing its label and its capacity
- **AND** SHALL name the leaf losing its capacity, pointing at the parent

#### Scenario: an unsized team's removal claims no dates move

- **GIVEN** an unsized team labelling a parent with a leaf beneath it
- **WHEN** a client asks to remove the team without confirming
- **THEN** the refusal SHALL name the label going and nothing else

### Requirement: The scheduler refuses a slice that claims fewer than one person

The scheduler SHALL refuse, at the boundary slices enter it through, any slice
whose width is not a whole number of at least one, naming the width it was
given.

The refusal SHALL stand whether or not any write path can produce such a slice.
A duration is an effort divided by a width, and a division the engine cannot
name is a plan of infinite or absent dates that no screen can draw and no
sentence can explain.

#### Scenario: a width of zero is refused rather than divided by

- **GIVEN** a slice of six days of effort claiming no people at all
- **WHEN** the plan is scheduled
- **THEN** the scheduler SHALL throw, naming the width
- **AND** SHALL NOT answer a plan whose dates are infinite
