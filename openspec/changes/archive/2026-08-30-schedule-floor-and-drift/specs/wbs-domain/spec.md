## ADDED Requirements

### Requirement: A floor on a parent constrains every leaf beneath it

A `startNoEarlierThan` written on a work item with children SHALL constrain
every leaf beneath it, exactly as a dependency declared on a parent does: none
of the branch's work may start before the floor. Each leaf SHALL take the
latest of its own floor and every ancestor's — a parent's earlier floor MUST
NOT override a child's stricter own. The floor stays a floor, never a pin: a
dependency that releases later than every applicable floor decides the start
and is the named bound.

#### Scenario: a parent's floor reaches its leaf

- **WHEN** a parent is told not to start before a day and its leaf child has
  no floor of its own
- **THEN** the leaf's reported start date is the parent's floor

#### Scenario: a grandparent's floor carries two levels down

- **WHEN** a grandparent, its child and its leaf grandchild each carry a
  floor, the grandparent's the latest
- **THEN** the leaf starts at the grandparent's floor, bound by `notBefore`

#### Scenario: ancestor floors compose with a later dependency

- **WHEN** every level of a grandparent→parent→leaf tree carries a different
  floor and a predecessor of the parent finishes later than one leaf's floors
  but earlier than a sibling leaf's own
- **THEN** the first leaf starts when the predecessor finishes, bound by
  `predecessor`, and the sibling keeps its own later floor, bound by
  `notBefore`

### Requirement: Calendar dates are immune to accumulated floating-point drift

A workday offset within 1e-9 of a whole day SHALL be read as that whole day
wherever a fractional offset becomes a whole calendar day — the finish ceiling
in `datesOf` and the floor in `addWorkdays`. A genuine fraction further from a
whole day than the window MUST still round as real work: the window sits
orders of magnitude below the smallest fraction an estimate can carry. The
engine's own numbers stay verbatim on the wire; only the discrete calendar
boundary snaps.

#### Scenario: an upward-drifted finish does not mint a day

- **WHEN** a dependency chain's PERT estimates sum to exactly 15 working days
  and the accumulated finish arrives as 15.000000000000002
- **THEN** the chain ends on the fifteenth working day, and a one-day
  successor starts and ends on the sixteenth

#### Scenario: a downward-drifted start does not steal a day

- **WHEN** a chain's estimates sum to exactly 9 working days and the
  accumulated finish arrives as 8.999999999999998
- **THEN** a successor starts on the tenth working day, not a day early on top
  of its predecessor

#### Scenario: a genuine fraction near a boundary is still work

- **WHEN** a row is estimated at 14.9 days — a tenth of a day short of a
  whole number, far outside the snap window
- **THEN** it finishes within its fifteenth working day and its successor
  starts on that same shared day
