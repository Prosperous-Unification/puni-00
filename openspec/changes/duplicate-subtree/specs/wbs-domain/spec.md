## ADDED Requirements

### Requirement: A work item and its descendants are copied in one operation

A work item SHALL be duplicatable together with every work item beneath it, in
one server-side operation that is either wholly applied or not applied at all.
The copy SHALL carry each row's name, notes, estimates, service-team label,
assignees and "start no earlier than" date. The copy SHALL be placed as the
next sibling of the original, and the copied root's name SHALL gain the suffix
` (copy)` while every copied descendant keeps its name unchanged. The operation
SHALL announce the project's tree once, after the whole copy is written.

#### Scenario: a branch is copied with its numbers derived afresh

- **GIVEN** `010 Strip` with children `010.1 Sockets` and `010.2 Switches`
- **WHEN** `010` is duplicated
- **THEN** the project reads `010 Strip`, `010.1 Sockets`, `010.2 Switches`,
  `020 Strip (copy)`, `020.1 Sockets`, `020.2 Switches`

#### Scenario: what the copy carries

- **GIVEN** a work item with notes, a Dev estimate, a service-team label, a Dev
  assignee and a start-no-earlier-than date
- **WHEN** it is duplicated
- **THEN** the copy holds the same notes, estimate, label, assignee and date

#### Scenario: a leaf is copied on its own

- **GIVEN** a work item with no children
- **WHEN** it is duplicated
- **THEN** one new work item exists, next to the original

### Requirement: A copied branch keeps its own dependencies and none of its wiring

A dependency SHALL be copied when both of its ends are inside the duplicated
subtree, remapped so that the copy of the predecessor precedes the copy of the
successor. A dependency with either end outside the subtree SHALL NOT be
copied: the copy is a template, and inheriting the original's external wiring
would schedule it against work it has nothing to do with.

#### Scenario: an edge inside the subtree follows the copy

- **GIVEN** `A` and `B` are both inside the duplicated subtree and `B` waits
  for `A`
- **WHEN** the subtree is duplicated
- **THEN** the copy of `B` waits for the copy of `A`, and not for `A` itself

#### Scenario: an edge leaving the subtree is left behind

- **GIVEN** a work item inside the subtree waits for a work item outside it
- **WHEN** the subtree is duplicated
- **THEN** its copy waits for nothing

### Requirement: A frozen number is never copied

Every work item produced by a duplication SHALL have no frozen number,
whatever the original held. The original SHALL keep its own frozen number and
SHALL be otherwise unchanged, so a frozen work item MAY be duplicated — the
refusal that protects a frozen number applies to moving it, not to copying it.

#### Scenario: duplicating a frozen branch

- **GIVEN** a frozen work item with frozen children
- **WHEN** it is duplicated
- **THEN** the request succeeds, no copied work item has a frozen number, and
  every original still has the one it had

### Requirement: A duplication larger than 500 work items is refused

A duplication whose subtree holds more than 500 work items SHALL be refused
with `too_large`, changing nothing. Each duplication can double the size of
what the next one copies, and no other limit in the tool bounds it.

#### Scenario: a subtree past the limit

- **GIVEN** a subtree of 501 work items
- **WHEN** it is duplicated
- **THEN** the request is refused as `too_large` and the project still holds
  501 work items

### Requirement: Duplication is guarded exactly as the other mutations are

`POST /api/work-items/:id/duplicate` SHALL answer 401 without a valid token,
404 for a work item that does not exist, and 403 when the account may not edit
the project. On success it SHALL answer the id of the copied root, and that id
SHALL be present in the next read of the project's tree.

#### Scenario: an account that may not edit a restricted project

- **GIVEN** a project restricted to its owner
- **WHEN** another account duplicates a work item in it
- **THEN** the answer is 403 and the project is unchanged

### Requirement: The table offers Duplicate on every row

The row actions column SHALL offer a Duplicate control on every work item,
including a frozen one. On success the caret SHALL land on the copied root's
Name cell. A refused duplication SHALL be reported as a toast.

#### Scenario: duplicating from the table

- **WHEN** a row's Duplicate is activated
- **THEN** be-01 is asked to duplicate that work item, and once the refreshed
  tree is on screen the focus is in the copy's Name cell

#### Scenario: a refused duplication

- **GIVEN** be-01 refuses the duplication
- **THEN** the refusal is on screen as a toast
