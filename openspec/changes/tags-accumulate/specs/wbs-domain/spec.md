## MODIFIED Requirements

### Requirement: Tags are inherited by accumulation, per dimension, independently

A work item's effective tags SHALL be the tags it states **together with** the
tags stated by every work item above it in the tree, unioned — accumulation,
never override. A work item stating tags of its own SHALL still read as carrying
every tag in force above it.

Each tag in force SHALL carry the work item that states it. A tag stated by both a
work item and one of its ancestors SHALL be in force once, and SHALL be carried by
the **nearer** of the two. A work item with no tag anywhere in its ancestry SHALL
have no effective tags at all, and that SHALL have one spelling.

There SHALL be no "deliberately untagged" state: a work item cannot un-state a tag
an ancestor states, and a tag SHALL be removable only from its own stating row.

The dimensions SHALL inherit **independently and by their own rules**: teams and
services SHALL continue to override — a work item stating either reads as exactly
that set — and a change to the tag rule SHALL move neither. A parent chain that
runs in a circle SHALL be refused with the tag dimension's own error rather than
walked.

Inheritance SHALL remain a reading computed over the tree, never a write: nothing
SHALL be stored denormalised, and every surface that shows a tag SHALL show the
effective reading rather than the work item's own stored labels. No tag SHALL move
any date.

#### Scenario: a stated tag does not displace the inherited ones

- **GIVEN** a parent tagged `Risk` and `Review`, and a child that states `Ready`
- **THEN** the child reads as `Ready`, `Risk` and `Review`
- **AND** `Ready` is carried by the child, `Risk` and `Review` by the parent

#### Scenario: every ancestor contributes, not only the nearest

- **GIVEN** a grandparent tagged `tech-debt`, a parent tagged `q3` and a leaf
  tagged `urgent`
- **THEN** the leaf reads as all three, each carried by the work item that states
  it

#### Scenario: a tag two rows state is in force once, from the nearer

- **GIVEN** a parent tagged `Risk` and a child that also states `Risk`
- **THEN** the child reads as `Risk` once, carried by the child

#### Scenario: the dimensions inherit by their own rules

- **GIVEN** a parent on team `Platform`, service `Payments` and tag `regulatory`
- **WHEN** a child states team `Design` and tag `tech-debt` and no service
- **THEN** the child reads as team `Design` alone, service `Payments` inherited,
  and tags `tech-debt` **and** `regulatory`

#### Scenario: a circular parent chain

- **WHEN** the effective tags are read over rows whose parent chain runs in a
  circle
- **THEN** the read throws rather than running forever

### Requirement: Every surface that shows a tag shows every tag in force

The table, the phone card, the CSV export and the chart's hover text SHALL each
show a work item's effective tags — the stated ones and the inherited ones
together — and SHALL name the source of each inherited one **per tag**, because
two inherited tags may come from two different work items.

The filter's tag facet SHALL match on the effective reading, so a work item is
found by any tag in force on it, including one it inherits while stating tags of
its own.

The table's Tags cell SHALL draw an inherited tag as visibly distinct from a
stated one and SHALL offer no control to remove it. The cell SHALL rest on one
line and SHALL NOT change the height of its row, whatever it carries.

The chart SHALL derive **no position** from a tag: no bar, bracket, arrow, link,
flag or horizon SHALL move when a plan is tagged.

#### Scenario: a stated and an inherited tag are both shown, and told apart

- **GIVEN** a child stating `Ready` under a parent tagged `Risk`
- **WHEN** its Tags cell is read
- **THEN** both `Ready` and `Risk` are shown
- **AND** `Risk` is marked as inherited, names the parent, and has no remove
  control
- **AND** `Ready` has one

#### Scenario: the row keeps its height

- **GIVEN** a work item that states one tag and inherits two
- **WHEN** its row is measured against a row that carries no tags
- **THEN** the two rows are the same height

#### Scenario: the filter finds a row by a tag it inherits while stating its own

- **GIVEN** a parent tagged `regulatory` and a child that states `Ready`
- **WHEN** the plan is filtered by `regulatory`
- **THEN** both the parent and the child are found

#### Scenario: the export names the source of each inherited tag

- **GIVEN** a child stating `Ready` under `010 Compliance` tagged `Risk`
- **WHEN** the plan is exported
- **THEN** the child's Tags cell reads `Ready; Risk (inherited from 010
Compliance)`
