## ADDED Requirements

### Requirement: A plan held back by a team's capacity is drawn, and says so

A client SHALL draw a chart for a plan whose slices report a **capacity** floor,
and SHALL NOT refuse the plan. A schedule floor the engine emits and the client
cannot name is a chart replaced by an error, for a plan the engine supports.

A bar whose start was decided by its team having no free slot SHALL say which
team, how many of its people the bar needed, and which finish freed them. Where
more than one placed slice had to end, the sentence SHALL name one of them —
the referent the engine chose — and SHALL **count** the rest rather than listing
them.

The team named SHALL be the **effective** team: the row's own label, or the
nearest ancestor's. A bar is pooled on the team whose people the engine
scheduled it against, which may be a team the row it sits on never mentions.

A capacity floor carrying no referent, an empty blocking set, or a row naming no
team SHALL be refused rather than drawn. Each is data the engine cannot produce,
and a sentence built from a default in its place would be a confident account of
a wait that did not happen.

#### Scenario: a bar held by a pool names the pool and what freed it

- **GIVEN** a plan whose team of one is contended
- **WHEN** the chart is drawn
- **THEN** the held bar SHALL name the team, the slots it needed and the slice
  whose finish let it start

#### Scenario: an inherited label is the pool

- **GIVEN** a leaf with no team of its own, beneath a labelled parent
- **AND** the leaf's slice is floored by capacity
- **WHEN** the chart is drawn
- **THEN** the sentence SHALL name the parent's team

#### Scenario: a capacity floor with nothing behind it is refused

- **GIVEN** a slice reporting a capacity floor and an empty blocking set
- **WHEN** the chart is laid out
- **THEN** it SHALL throw rather than draw a sentence with a hole in it

### Requirement: A work item's parallelism can be stated where its other numbers are

The plan's table SHALL carry a column for how many people may work on one item
at once. It SHALL be blank where the item runs one at a time, because 1 is what
every row of every plan stores and a column of ones states nothing.

The column SHALL be **read-only** on a work item that has children: such a row
holds no work of its own, the number decides nothing, and offering an edit the
API refuses is worse than offering none. A number a leaf carried before it
gained a child SHALL still be shown, and SHALL be shown as inert.

Where one person is named on the work, the number SHALL be shown and SHALL be
marked as not applied: the work runs one at a time whatever the number says, and
the number applies again the moment the assignment goes.

An **emptied** cell SHALL be sent as a reset to one at a time, never as a zero.
A zero is a width of zero, which is a schedule of infinite dates.

A draft that cannot survive being written to JSON — a non-finite number — SHALL
be refused by the client, because it arrives as the value that means _reset_ and
would silently undo the reader's own number.

Every other value SHALL be sent as typed and answered on by the API. The rule
about what a parallelism may be belongs to one place, and a second copy beside
the box is a rule free to disagree with it.

#### Scenario: an emptied cell puts the row back to one at a time

- **GIVEN** a work item running four people at once
- **WHEN** the cell is emptied
- **THEN** the client SHALL ask for a reset to one at a time
- **AND** SHALL NOT ask for a parallelism of zero

#### Scenario: a parent's cell cannot be typed into

- **GIVEN** a work item with children, carrying an inert parallelism of three
- **WHEN** the plan is drawn
- **THEN** the cell SHALL print three and offer no edit
- **AND** SHALL say the row holds no work of its own

#### Scenario: a typed non-finite number is refused rather than sent

- **GIVEN** a work item running three people at once
- **WHEN** `1e999` is typed into its cell
- **THEN** the client SHALL refuse it and send nothing
- **AND** the work item SHALL still run three at once

### Requirement: A row shows the team whose people its work is drawn from

A client SHALL show the **effective** team on every surface that names one —
the table, the chart, the cards and the export — and SHALL mark a label the row
does not carry itself as inherited, naming the row it was written on.

The four SHALL read one implementation of that rule. Four readings of
"most-specific wins" is four chances for two surfaces to disagree about the same
row while each holds a defensible answer.

The inheritance SHALL be resolved against **every** row of the plan, not the
rows on screen and not the labelled rows alone: a collapsed branch, a running
search and an unlabelled intermediate row each hide part of the chain.

An inherited label SHALL be shown in a way that cannot be mistaken for a stored
one, and SHALL disappear the moment the row is given a label of its own. No
write SHALL copy a label down the tree.

#### Scenario: an unlabelled leaf shows the team it inherits

- **GIVEN** a leaf with no team of its own, beneath a labelled parent
- **WHEN** the plan is drawn
- **THEN** the leaf SHALL show the parent's team, marked as inherited
- **AND** SHALL name the parent as where the label was written

#### Scenario: a row with no label anywhere above it shows none

- **GIVEN** a leaf with no labelled ancestor
- **WHEN** the plan is drawn
- **THEN** it SHALL show no team at all

### Requirement: An exported plan carries what was asked for and what was placed

An export SHALL carry, for every work item, the parallelism that was **stated**
and the widths the schedule actually **ran** it at, as two separate columns.

Neither answers the other's question. The gap between them is the only account
an exported table can give of a work item whose span is shorter than its
estimate, and of one that asked for people it did not get.

The widths column SHALL carry every distinct width the row's slices ran at,
because width is decided per slice: a row one phase of which is assigned to a
named person runs that phase alone. A single number would be a claim about the
whole row that is false of part of it.

The widths column SHALL be empty where the plan carries no placement at all,
which is the same absence the dates report. A value invented there is the
document's own.

The export SHALL state, in its header, that its figures are effort and that a
row's span is that effort divided by the people on it.

#### Scenario: a compressed row shows both numbers

- **GIVEN** a work item asking for four people, run at two
- **WHEN** the plan is exported
- **THEN** the export SHALL carry four as what was asked for
- **AND** two as what it ran at

#### Scenario: a row whose phases ran at different widths carries both

- **GIVEN** a work item of three-at-once with one phase assigned to one person
- **WHEN** the plan is exported
- **THEN** the widths column SHALL carry both one and three

#### Scenario: an unscheduled plan invents no widths

- **GIVEN** a plan with no placement at all
- **WHEN** it is exported
- **THEN** the widths column SHALL be empty on every row

### Requirement: A team's size can be stated in the directory, and cleared back to unstated

The directory SHALL offer, for each team, how many of its people may be at work
at once, beside — and distinct from — how many people are in it.

The two SHALL NOT be conflated. A team of five nobody has counted bounds no
schedule; a team sized two with nobody in it bounds its work to two at a time.

An **empty** box SHALL mean _unstated_ and SHALL be sent as a clear, never as a
zero or a one. Unstated is the state every team created before capacity existed
is in, and it constrains nothing.

A draft that cannot survive being written to JSON SHALL be refused by the
client, for the reason a parallelism's is: it arrives as the value that means
_clear_.

A refusal from the API SHALL be shown as a sentence about a team, not as a wire
code. Where the refusal names a limit, the sentence SHALL read that limit out of
the refusal rather than holding its own copy of it.

A size draft SHALL survive an edit abandoned in the box beside it. Two boxes on
one row commit to two routes, and abandoning one is not a statement about the
other.

#### Scenario: an emptied box clears the size rather than sending a zero

- **GIVEN** a team sized four
- **WHEN** the box is emptied
- **THEN** the client SHALL ask for the size to be cleared
- **AND** the team SHALL read as unstated

#### Scenario: an untouched empty box sends nothing

- **GIVEN** an unstated team
- **WHEN** its box is entered and left with nothing typed
- **THEN** nothing SHALL be sent

### Requirement: Removing a team says which rows lose a bound, inherited rows included

The confirmation refusing an unconfirmed team removal SHALL print, for every
work item the API reports a released capacity for, that the bound is going and
that dates may move earlier.

Where the bound was inherited, the sentence SHALL name the row the label was
written on. A row that carries no label of its own loses no label, and a
sentence saying its label is cleared would describe a write that never happens
there.

A row the confirmation does not list SHALL be named by a fallback rather than
left blank or thrown on: the payload names the rows a removal touches, and a
labelled ancestor whose own effects are empty need not be among them.

#### Scenario: the inheriting leaf gets its own sentence

- **GIVEN** a sized team labelling a parent, with an unlabelled leaf beneath it
- **WHEN** the removal is refused for confirmation
- **THEN** the parent SHALL be told its label and its bound are going
- **AND** the leaf SHALL be told its bound is going, naming the parent
