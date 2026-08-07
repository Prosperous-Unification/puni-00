## ADDED Requirements

### Requirement: A work item counts the writes that changed it

A work item SHALL hold a revision: a whole number starting at 0 that never
decreases. Every write that changes what the work item means SHALL increase it
by exactly one, and the increase SHALL be committed with the change it
describes or not at all. The revision SHALL be computed by the database from
the row's current value, never written as a number the server worked out from
an earlier read.

A newly created work item SHALL start at 0.

#### Scenario: a rename counts

- **WHEN** a work item's name, notes, start-no-earlier-than or team is patched
- **THEN** its revision is one higher and no other work item's has moved

#### Scenario: three edits read as three

- **WHEN** three patches land on one work item
- **THEN** its revision is 3

#### Scenario: a move counts

- **WHEN** a work item is moved to a new parent or a new place among its
  siblings
- **THEN** the moved work item's revision is one higher

#### Scenario: freezing and unfreezing count

- **GIVEN** a project frozen once, then a work item added and frozen again
- **WHEN** the second freeze lands
- **THEN** each work item's revision has moved once — the one already frozen
  was not written a second time
- **AND** returning a work item to deriving moves its revision again

#### Scenario: promotion counts, and the respacing around it does not

- **WHEN** a parent is deleted with its children promoted
- **THEN** every promoted child's revision is one higher, and the former
  siblings whose positions the promotion rewrote are unchanged

### Requirement: A satellite write moves the entity that owns it

A write to a satellite SHALL move its owning work item's revision, in the same
transaction as the write. A satellite is a row that belongs to a work item,
holds no identity anyone addresses, and is only ever read through that work
item: an estimate, an assignment, a dependency. A dependency has two owners and
SHALL move both endpoints.

Removing every dependency of a work item that is being deleted SHALL move the
**surviving** endpoints of the removed edges, and not the work item being
deleted.

Moving every estimate from one work item to another SHALL move both.

#### Scenario: an estimate on one work item leaves the other alone

- **WHEN** a three-point estimate is written to one work item
- **THEN** that work item's revision is one higher and a sibling's is unchanged

#### Scenario: clearing an estimate counts too

- **WHEN** a stored trio is cleared
- **THEN** the work item's revision moves again

#### Scenario: an assignee counts, and so does removing them

- **WHEN** a work item's role is assigned to somebody and then cleared
- **THEN** its revision has moved twice, and no other work item's has moved

#### Scenario: an edge moves both ends

- **WHEN** a dependency is added between two work items in a project of three
- **THEN** both endpoints' revisions are one higher and the third is unchanged
- **AND** removing the edge moves both again

#### Scenario: deleting a work item moves what waited for it

- **GIVEN** a work item that another work item depends on
- **WHEN** the first is deleted
- **THEN** the survivor's revision is one higher

#### Scenario: the estimate handoff moves both work items

- **GIVEN** a work item holding estimates
- **WHEN** it gains its first child and hands the estimates down
- **THEN** both work items' revisions have moved, and the new child is at 1
  rather than 0 — the handoff is a second write to it

### Requirement: A revision does not follow the derived number

A work item's revision SHALL NOT move because its derived number changed. A
work item whose stored position was rewritten to make room for another SHALL
keep the revision it had.

#### Scenario: respacing a sibling group

- **WHEN** an insertion or a move respaces a sibling group
- **THEN** only the inserted or moved work item's revision has moved

### Requirement: A copy starts fresh and leaves the original alone

Duplicating a subtree SHALL give every copied work item a revision of 0. The
originals' revisions SHALL be unchanged, including the estimates, assignments
and dependencies read in order to copy them.

#### Scenario: duplicating an estimated branch

- **GIVEN** a work item with a child that holds an estimate
- **WHEN** the branch is duplicated
- **THEN** the copied root is at revision 0, and the original root and its
  child hold exactly the revisions they held before

### Requirement: A project counts the writes that changed it

A project SHALL hold a revision with the same rules as a work item's. Its name,
restriction, estimate method, start date and roles SHALL move it. A newly
created project SHALL start at 0, its starting roles being part of that
beginning rather than a first change to it.

A project's revision SHALL NOT move when a work item beneath it changes, and a
work item's revision SHALL NOT move when the project changes. Recording that an
account opened a project SHALL NOT move it: that is one reader's navigation
history and changes nothing anybody else can see.

#### Scenario: each project field counts once

- **WHEN** a project is renamed, restricted, given a different estimate method
  and given a start date
- **THEN** its revision is 4

#### Scenario: opening a project changes nothing

- **WHEN** an account opens a project
- **THEN** the project's revision is unchanged

#### Scenario: the two levels are independent

- **WHEN** a work item under a project is patched and estimated
- **THEN** the project's revision is unchanged
- **AND** renaming the project leaves that work item's revision unchanged

### Requirement: A reader is told both revisions

Reading a project's tree SHALL report every work item's revision alongside its
row, and the project's own revision alongside the tree. No route SHALL accept a
revision, and no write SHALL be refused for one: this change records the fact
that later changes will check.

#### Scenario: the tree carries them

- **GIVEN** a project renamed once, holding a work item patched once
- **WHEN** the tree is read
- **THEN** the project's revision is 1 and the work item's is 1
