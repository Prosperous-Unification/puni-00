## RENAMED Requirements

- FROM: `### Requirement: A dependency waits for the whole of one work item and holds up the whole of another`
- TO: `### Requirement: A dependency waits for the predecessor's anchor slice and holds up the whole of the successor`

## MODIFIED Requirements

### Requirement: A dependency waits for the predecessor's anchor slice and holds up the whole of the successor

A dependency SHALL mean that the predecessor's **anchor slice** finishes
before the successor's **first** slice starts. The predecessor's slices behind
its anchor SHALL be free to run in parallel with the successor. Parent ends
SHALL expand to their leaves exactly as they do today: every leaf beneath the
predecessor has its anchor finish before any leaf beneath the successor
starts.

The anchor SHALL be the predecessor's first slice in role order **that
somebody has estimated**. A role the project lists in front of it that nobody
has estimated on this work item SHALL be stepped over rather than taken as the
anchor.

Where **no** slice of the predecessor has been estimated, the anchor SHALL be
the predecessor's finish — which, for a work item nobody has estimated at all,
is its own start, so the edge imposes exactly what the predecessor's own
predecessors imposed and nothing more.

An estimate of **zero days** SHALL count as an estimate: somebody stating that
a role takes no time is a statement, and the anchor lands on it. Nobody having
stated anything is the different fact, and it is the one the walk steps over.

Every later slice of the successor SHALL wait too, through the order its own
slices run in — including a first slice nobody has estimated, which SHALL NOT
be free to start before the anchor it waits for. The successor side SHALL NOT
walk to its first estimated slice: an unestimated `Dev` left without a
predecessor would start the row before the thing it waits for.

A manual "start no earlier than" SHALL apply to the work item's first slice,
and thereby to all of them.

#### Scenario: the wait is for the first role, not the last

- **GIVEN** `A` estimated at 3 days of `Dev` and 2 days of `QA`, and `B`
  depending on `A`
- **THEN** `B` starts on day 3, while `A`'s `QA` slice runs 3→5 alongside it

#### Scenario: an unestimated first role does not escape the wait

- **GIVEN** `A` estimated at 3 days of `Dev`, and `B` depending on `A` with no
  `Dev` estimate and 2 days of `QA`
- **THEN** `B`'s `Dev` slice sits at day 3, its `QA` slice runs 3→5, and the
  row for `B` starts on day 3 — not on day 0

#### Scenario: the anchor walks past a role nobody estimated

- **GIVEN** `A` waiting on nothing, with no `Dev` estimate and 4 days of `QA`,
  and `B` depending on `A`
- **THEN** `A`'s `QA` is the anchor and `B` starts on day 4

#### Scenario: a chain does not collapse because a project lists a role nobody estimated

- **GIVEN** a project listing `Design`, `Dev` and `QA`, and `c1 → c2 → c3`
  each estimated at 4 days of `Dev` and nothing else
- **THEN** the chain runs 0→4, 4→8, 8→12 — every edge still holding, though
  every `Design` slice is empty

#### Scenario: a predecessor nobody estimated anchors on its finish

- **GIVEN** `A` with no estimate on any role, and `B` depending on `A`
- **THEN** `B` starts where `A` does, and any wait `A`'s own predecessors
  imposed is carried through to `B`

#### Scenario: a branch releases at its anchors

- **GIVEN** a parent `P` holding leaves `P1` (2 days `Dev`, 3 days `QA`) and
  `P2` (4 days `Dev`, 1 day `QA`), and `Q` depending on `P`
- **THEN** `Q` starts on day 4 — the latest anchor finish among `P`'s leaves —
  while `P`'s projection runs to day 5

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

The projection SHALL leave be-01 beside the slices it is read from — one
payload, one engine pass. The table reads the projection; the chart reads the
slices themselves (the `Slices cross the wire` requirement), and the arrow
anchors below are selected from them, never recomputed.

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

#### Scenario: a plan the anchor rule cannot touch is unchanged to the last bit

- **GIVEN** any project with no assignee, holding no dependency or at most one
  role
- **THEN** every work item's start, finish, late start, late finish, slack,
  duration, estimated flag and critical flag are exactly what the engine
  before slices computed

#### Scenario: leveling stays invisible in a plan with nobody assigned

- **GIVEN** any project with no assignee
- **THEN** every number is what the same engine computes with no queues in it

### Requirement: Dependency arrows and person links are drawn from data

A dependency arrow SHALL join the predecessor's **anchor** to its successor's
start — the anchor slice's finish for a leaf predecessor, and for a parent the
latest-finishing anchor among its leaves — one per stored dependency between
shown rows. The anchor SHALL be selected from the slices the payload already
carries, never recomputed from estimates: the first in role order the payload
marks estimated, and the last where it marks none of them.

A bar held by a dependency SHALL say so in words that name the anchor rather
than the predecessor's finish, since the predecessor's later roles run
alongside the bar those words are on. A person link SHALL be drawn
from a slice's resource predecessor to it, only where the binding floor is the
person, visually distinct from a dependency arrow, and derived from
`resourcePredecessorId` alone — never parsed from text. A
`resourcePredecessorId` that names no slice in the payload SHALL throw, into
the error boundary, not draw nothing. A binding floor the panel has no words
for SHALL throw the same way, rather than drawing a bar that says nothing about
what holds it.

#### Scenario: a hand-off is not a dependency

- **WHEN** `Sand` waits for Kat to finish `Strip` with no dependency between
  them
- **THEN** the panel holds a person link from `Strip`'s bar to `Sand`'s and no
  dependency arrow

#### Scenario: a dangling resource predecessor

- **WHEN** the payload carries a slice whose `resourcePredecessorId` names no
  slice in it
- **THEN** the panel throws rather than drawing a chart with a silently
  missing link

#### Scenario: a binding floor from a later be-01

- **WHEN** a slice's `boundBy` is a value this build does not know
- **THEN** the panel throws rather than drawing a bar whose hover text ends
  where the reason should be

#### Scenario: the arrow does not overshoot a parallel successor

- **WHEN** `A` holds 3 days of `Dev` and 2 of `QA`, and `B` depends on `A`
- **THEN** the arrow leaves day 3 — never `A`'s projection finish on day 5,
  which would point backwards past `B`'s start

#### Scenario: an arrow from a branch leaves its latest anchor

- **WHEN** `Q` depends on a parent whose leaves' first-role work ends on days
  2 and 4
- **THEN** the arrow leaves day 4, from the parent's bracket row

#### Scenario: the arrow leaves the first estimated role

- **WHEN** a predecessor's `Dev` is unestimated and its `QA` runs 5→9
- **THEN** the arrow leaves day 9, the anchor's finish, not day 5

#### Scenario: a zero-length anchor draws from its own day

- **WHEN** no role of a predecessor is estimated and its anchor stands at
  day 6
- **THEN** the arrow leaves where day 6 begins, not at the end of the workday
  before it

#### Scenario: the words on a dependency-held bar name the anchor

- **WHEN** a bar's start is held by a dependency
- **THEN** its hover card says it waits for the dependency's first estimated
  role, not for the dependency to finish
