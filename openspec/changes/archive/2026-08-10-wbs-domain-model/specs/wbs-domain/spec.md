## ADDED Requirements

### Requirement: Projects are readable by all, editable by owner when restricted

Every authenticated account SHALL be able to read every project and list all projects. A
project carries a `restricted` flag; while it is set, be-01 MUST reject any mutation from
an account other than the project's owner. The owner is the account that created the
project and does not change.

#### Scenario: an unrestricted project accepts an edit from any account

- **WHEN** an authenticated account that does not own an unrestricted project renames one
  of its work items
- **THEN** the edit is committed and broadcast

#### Scenario: a restricted project refuses a non-owner

- **WHEN** an authenticated account that does not own a restricted project attempts any
  mutation
- **THEN** be-01 responds 403, nothing is written, and no event is recorded

#### Scenario: a restricted project is still readable

- **WHEN** a non-owner requests a restricted project
- **THEN** the full tree and its estimates are returned

### Requirement: Work items form a tree ordered by position

A work item SHALL hold an immutable identifier, a project, an optional parent, an integer
position, a name and notes. Siblings are ordered by ascending position. Positions MUST be
assigned in gaps of ten; when an insertion has no gap available, be-01 MUST renumber that
sibling group to `10, 20, 30…` within the same transaction. The identifier MUST NOT change
for any reason, because dependencies added later will address work items by it.

#### Scenario: a work item is inserted between two siblings

- **WHEN** a work item is created between siblings at positions `10` and `20`
- **THEN** it is stored at position `15` and neither sibling is written

#### Scenario: an exhausted gap renumbers one sibling group

- **WHEN** a work item is created between siblings at positions `10` and `11`
- **THEN** that parent's children are renumbered to `10, 20, 30…` in one transaction, the
  new work item takes its place in that sequence, and no other parent's children are
  written

#### Scenario: a name may be empty

- **WHEN** a work item is created without a name
- **THEN** it is stored and returned with an empty name

### Requirement: Work item numbers are derived from position

be-01 SHALL compute every work item number on read from the work item's position among its
siblings, and MUST NOT accept a number from a client. Root work items number `010`, `020`,
`030…`. A child appends a dot and its own index within its parent: `010.1`, `010.1.1`.
Numbers MUST sort into tree order under a byte-wise lexicographic sort.

#### Scenario: roots number in tens

- **WHEN** a project holds three root work items
- **THEN** their numbers are `010`, `020` and `030`

#### Scenario: children nest

- **WHEN** the work item numbered `010` holds two children, the second of which holds one
  child
- **THEN** their numbers are `010.1`, `010.2` and `010.2.1`

#### Scenario: a client-supplied number is refused

- **WHEN** a create or update request carries a number field
- **THEN** be-01 responds 400 and nothing is written

### Requirement: A parent's tenth child repads its siblings

When a parent holds ten or more children, every one of that parent's child numbers SHALL be
zero-padded to a common width wide enough for the highest index — `010.01` through `010.10`
at ten children, three digits at a hundred. Padding width is decided per parent and MUST NOT
affect any other parent. Children whose numbers are frozen keep the width they were frozen
at.

#### Scenario: nine children stay narrow

- **WHEN** a parent numbered `010` holds nine children
- **THEN** their numbers are `010.1` through `010.9`

#### Scenario: the tenth child widens the whole group

- **WHEN** a tenth child is added under `010`
- **THEN** the group's numbers become `010.01` through `010.10`, and a lexicographic sort
  places `010.10` last

#### Scenario: repadding is scoped to one parent

- **WHEN** `010` repads to two digits and `020` holds three children
- **THEN** `020`'s children remain `020.1`, `020.2` and `020.3`

#### Scenario: root work items repad by the same rule

- **WHEN** a project holds ten root work items
- **THEN** they number `010` through `100`, and a hundredth root repads every root to
  `0010` through `1000` so that the lexicographic order still matches the tree

### Requirement: Freezing writes the current numbers into storage

A freeze SHALL store the currently derived number of every work item in the project that
has none stored, and leave already-stored numbers untouched. A work item with a stored
number MUST be reported by that number regardless of its position. Work items created after
a freeze MUST continue to derive their numbers until the next freeze.

#### Scenario: a freeze pins what exists

- **WHEN** a project holding `010` and `020` is frozen
- **THEN** both numbers are stored, and a later insertion between them does not change
  either

#### Scenario: new work items keep deriving after a freeze

- **WHEN** a work item is created between frozen `010` and frozen `020`
- **THEN** its number is derived as `011`, and it has no stored number

#### Scenario: a second freeze pins the newcomers

- **WHEN** the project is frozen again
- **THEN** the derived `011` is stored, and `010` and `020` are not rewritten

### Requirement: A frozen work item cannot move until it is unfrozen

be-01 SHALL reject any move of a work item that has a stored number. Unfreezing SHALL be
available for a single work item and for a whole project; it clears the stored number, after
which the work item derives its number again and may move.

#### Scenario: moving a frozen work item is refused

- **WHEN** a move is requested for a work item with a stored number
- **THEN** be-01 responds 409 naming the work item, and no position is written

#### Scenario: unfreezing one work item releases it

- **WHEN** a single work item is unfrozen and then moved
- **THEN** the move is committed and its number is derived from its new position

#### Scenario: unfreezing a project clears every stored number

- **WHEN** a project is unfrozen
- **THEN** no work item in it has a stored number, and every number is derived

### Requirement: Deletion closes gaps only where numbers are not frozen

Deleting a work item that holds children SHALL require an explicit strategy of `cascade` or
`promote`; a request without one MUST be refused. After any deletion, work items without
stored numbers MUST re-derive, closing the gap. Work items with stored numbers MUST keep
them, leaving the deleted number absent from the sequence.

#### Scenario: a strategy is mandatory for a parent

- **WHEN** a delete is requested for a work item with children and no strategy
- **THEN** be-01 responds 400 and nothing is written

#### Scenario: cascade removes the subtree

- **WHEN** a parent is deleted with `cascade`
- **THEN** it and all its descendants are removed

#### Scenario: promote lifts the children

- **WHEN** a parent is deleted with `promote`
- **THEN** its children take its place among its former siblings, in their existing order

#### Scenario: an unfrozen sequence closes up

- **WHEN** `020` is deleted from an unfrozen project holding `010`, `020` and `030`
- **THEN** the remaining numbers are `010` and `020`

#### Scenario: a frozen sequence keeps the hole

- **WHEN** `020` is deleted from a frozen project holding `010`, `020` and `030`
- **THEN** the remaining numbers are `010` and `030`

### Requirement: Estimates are held per work item and per role

A project SHALL own a list of roles, seeded with `Dev` and `QA` at creation. An estimate
SHALL hold optimistic, realistic and pessimistic durations in days for exactly one work item
and one role. Durations MAY be fractional and MUST NOT be negative. be-01 MUST reject an
estimate unless `optimistic ≤ realistic ≤ pessimistic`, using the arktype schema in
`shared-lib-01` that fe-01 validates with.

#### Scenario: a project is born with two roles

- **WHEN** a project is created
- **THEN** it holds roles `Dev` and `QA`

#### Scenario: an out-of-order estimate is refused

- **WHEN** an estimate is written with a realistic value above its pessimistic value
- **THEN** be-01 responds 400 and nothing is written

#### Scenario: fractional days are accepted

- **WHEN** an estimate is written with `0.5` optimistic days
- **THEN** it is stored

### Requirement: A parent's estimates are its descendants' sums

An estimate SHALL be readable on a work item that has no children. For a work item with
children, be-01 MUST compute each role's three values as the sum of that role's values
across its descendants, on read, storing nothing. A role that no descendant has estimated
MUST be reported as absent rather than as zero. be-01 MUST reject any attempt to write an
estimate onto a work item that has children.

#### Scenario: a parent totals its children

- **WHEN** two children hold `Dev` estimates of 1/2/3 and 2/3/4 days
- **THEN** their parent reports `Dev` as 3/5/7

#### Scenario: an unestimated role is absent, not zero

- **WHEN** no descendant of a parent holds a `QA` estimate
- **THEN** the parent reports no `QA` estimate, and does not report `QA` as 0/0/0

#### Scenario: writing to a parent is refused

- **WHEN** an estimate is written to a work item that has children
- **THEN** be-01 responds 409 and nothing is written

### Requirement: Estimates follow the first and last child

When a work item that holds estimates gains its first child, be-01 SHALL move those
estimates to that child within the same transaction, leaving the parent with none of its
own. When a work item's last child is deleted, the estimates rolled up from that child
SHALL be written onto the parent as its own.

#### Scenario: the first child inherits

- **WHEN** a child is added to a work item holding a `Dev` estimate of 1/2/3
- **THEN** the child holds 1/2/3, and the parent stores no estimate of its own while
  reporting 1/2/3 as its roll-up

#### Scenario: the last child returns them

- **WHEN** the only child of a work item is deleted with `cascade`
- **THEN** the parent stores that child's estimates as its own

### Requirement: Project edits broadcast over the existing push path

be-01 SHALL record each committed mutation on the subscription `project:<id>` through the
event sequencer, and push it to gw-01. A mutation of a work item's name, notes or estimate
MUST broadcast that work item and its recalculated ancestors. A creation, move, deletion,
freeze or unfreeze MUST broadcast the project's whole tree, because one such change can
renumber many work items. gw-01 MUST refuse a subscribe request whose subscription is
neither `presence` nor `project:<uuid>`.

#### Scenario: a cell edit broadcasts a narrow patch

- **WHEN** a `Dev` estimate is written on a nested work item
- **THEN** subscribers to that project receive that work item and each of its ancestors
  with recalculated roll-ups, and no other work item

#### Scenario: a move broadcasts the tree

- **WHEN** a work item is moved
- **THEN** subscribers receive the project's full tree with every number derived afresh

#### Scenario: a malformed subscription is refused

- **WHEN** a socket sends a subscribe request for a subscription that is neither `presence`
  nor `project:<uuid>`
- **THEN** gw-01 does not register the socket and replies with an error

#### Scenario: a reconnecting client replays what it missed

- **WHEN** a client resumes with a resume point behind the newest event on its project
  subscription
- **THEN** the events after that point are replayed to it in sequence
