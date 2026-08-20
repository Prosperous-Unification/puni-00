## MODIFIED Requirements

### Requirement: A work item's parallelism can be stated where its other numbers are

The plan's table SHALL carry a column for how many people may work on one item
at once. It SHALL be blank where the item runs one at a time, because 1 is what
every row of every plan stores and a column of ones states nothing.

The column SHALL be **read-only** on a work item that has children: such a row
holds no work of its own, the number decides nothing, and offering an edit the
API refuses is worse than offering none. A number a leaf carried before it
gained a child SHALL still be shown, and SHALL be shown as inert.

be-01 collapses a named slice's width to 1 **per role**, not per row: a leaf
running two roles each with its own named assignee has both slices pinned to 1
independently of each other. The number SHALL be shown and SHALL be marked as
not applied wherever **every one of the leaf's estimated roles** has its own
effective assignee — that role's own name, or the row's single assumed one
where exactly one role on the whole row is named. A leaf with an unnamed
estimated role SHALL NOT be marked not-applied on that account alone: that
role's slice still runs at the stated width. The number applies again the
moment enough of those names come off.

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

#### Scenario: one assumed assignee still marks the cell not-applied

- **GIVEN** a work item running three people at once, with exactly one role
  named on the whole row
- **WHEN** the plan is drawn
- **THEN** the cell SHALL be marked not-applied

#### Scenario: two roles on two different people each mark the cell not-applied

- **GIVEN** a work item running three people at once, estimated on two roles,
  each with its own named assignee
- **WHEN** the plan is drawn
- **THEN** the cell SHALL be marked not-applied
- **AND** the number SHALL still be shown

#### Scenario: an unnamed role among two named ones keeps the cell applied

- **GIVEN** a work item running three people at once, estimated on three
  roles, two of them each named on a different person and the third named on
  nobody
- **WHEN** the plan is drawn
- **THEN** the cell SHALL NOT be marked not-applied: the third role's slice
  still runs at the stated width

Two roles named is not "exactly one," so the row's single-assumed-assignee
fallback does not reach the third role the way it would with only one name on
the row — that case is the scenario above, and there every role's slice really
does collapse.
