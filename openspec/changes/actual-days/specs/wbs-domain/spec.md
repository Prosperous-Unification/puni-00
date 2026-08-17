## ADDED Requirements

### Requirement: A plan records the days a role actually spent on a work item

The plan SHALL hold, for each work item and role, the days actually spent on it,
as one number rather than a three-point range: an estimate is a guess about a
range and an actual is a fact about what happened.

Recorded days SHALL be held **per role**, at the same grain as the estimate, and
a work item's own figure SHALL be the sum of its descendants' when it has
children — computed on read and never stored.

Days SHALL be recordable only against a work item with no children. A work item
with children SHALL be refused with `rolled_up`, and a role the project does not
hold SHALL be refused with `unknown_role` — the two refusals the estimate write
already makes, for the same reasons.

A recording SHALL carry the moment it was typed, and a correction SHALL carry the
moment the correction was typed rather than the moment the figure it replaced
was.

#### Scenario: days recorded against a leaf are reported beside its estimate

- **GIVEN** a leaf work item with an estimate of 1/2/3 for a role
- **WHEN** 8 days are recorded against that role on that work item
- **THEN** the plan SHALL report 8 recorded days for that role
- **AND** the estimate SHALL still be 1/2/3

#### Scenario: a parent reports the days recorded below it

- **GIVEN** a work item with two children, one holding 2 recorded days for a role
  and the other 3
- **WHEN** the plan is read
- **THEN** the parent SHALL report 5 recorded days for that role

#### Scenario: days cannot be recorded on a work item with children

- **GIVEN** a work item that has children
- **WHEN** days are recorded against it
- **THEN** the write SHALL be refused as `rolled_up`
- **AND** nothing SHALL be stored

### Requirement: Nobody having recorded days is the absence of a figure, never a zero

A role nobody has recorded days for SHALL be **absent** from what the plan
reports, and SHALL NOT be reported as zero. A work item nobody has recorded
anything against SHALL report no figures at all rather than a figure of zero for
every role.

Clearing SHALL remove the record rather than write a zero, and clearing what was
never recorded SHALL succeed, because the state asked for is the state left.

A recorded **zero** SHALL be kept and reported, because a person recording zero is
stating that the work took no days — which is a different statement from nobody
having said anything.

#### Scenario: a role nobody recorded is absent rather than zero

- **GIVEN** a work item with days recorded for one of a project's two roles
- **WHEN** the plan is read
- **THEN** the other role SHALL be absent from that work item's recorded days

#### Scenario: clearing takes the figure away rather than zeroing it

- **GIVEN** a work item with 8 days recorded for a role
- **WHEN** those days are cleared, and then cleared again
- **THEN** both requests SHALL succeed
- **AND** that role SHALL be absent from the work item's recorded days

#### Scenario: a recorded zero is kept

- **GIVEN** a leaf work item
- **WHEN** 0 days are recorded against a role
- **THEN** the plan SHALL report 0 recorded days for that role, and not an absence

### Requirement: Recorded days do not change the plan's dates

Recording, correcting or clearing days SHALL NOT change any work item's schedule,
any slice the engine placed, or any date the plan reports. The scheduler SHALL
NOT read recorded days.

This holds however far the recorded days differ from the estimate, and it holds
for the predecessors of other work: the plan reports the drift, and a person
decides whether to re-estimate.

#### Scenario: recording days far over the estimate moves nothing

- **GIVEN** a scheduled plan where one work item is estimated at 2 days and
  another depends on it
- **WHEN** 40 days are recorded against the predecessor
- **THEN** every work item's schedule and dates SHALL be exactly what they were
- **AND** the slices the engine placed SHALL be exactly what they were

### Requirement: Recording days is a journalled command

Recording days and clearing them SHALL each be written to the account's undo
stack and to the plan's history through the seam every other journalled command
uses, naming the work item and the role they were aimed at.

Undoing the **first** recording against a work item and role SHALL leave no
figure at all, rather than a figure of zero. Undoing a correction SHALL restore
the figure it replaced, and undoing a clear SHALL restore the figure that was
cleared.

Clearing days that were never recorded SHALL record nothing, because a command
that changed nothing is not one to reverse.

#### Scenario: an undo of the first recording leaves an absence

- **GIVEN** a work item with no recorded days
- **WHEN** 8 days are recorded and the command is undone
- **THEN** that role SHALL be absent from the work item's recorded days
- **AND** the plan SHALL NOT report zero days for it

#### Scenario: the plan's history holds the recording

- **GIVEN** a work item with days recorded and then cleared
- **WHEN** the plan's history is read
- **THEN** it SHALL hold one event for the recording and one for the clear
- **AND** each SHALL name that work item and that role

### Requirement: Recorded days follow the work they were recorded against

Recorded days SHALL move with the figures they sit beside when the tree changes.

When a work item that holds recorded days gains its first child, those days SHALL
move to the child, so that no figure is left on a work item whose figures are
sums. When a work item's last child is deleted, the days recorded anywhere in
that branch SHALL be handed up to it, so that the record survives the deletion.
When a deleted branch is restored, every day recorded in it SHALL be restored
with it.

A **duplicated** work item SHALL carry the original's estimates and SHALL NOT
carry its recorded days: a copy is work that has not been done.

#### Scenario: the record survives a branch being deleted and restored

- **GIVEN** a branch whose children hold recorded days
- **WHEN** the branch is deleted and the deletion is undone
- **THEN** every day recorded in the branch SHALL be reported again

#### Scenario: a duplicate carries the estimate and not the record

- **GIVEN** a work item with an estimate and recorded days
- **WHEN** it is duplicated
- **THEN** the copy SHALL carry the estimate
- **AND** the copy SHALL report no recorded days

### Requirement: Removing a role counts the days recorded against it

A role's usage SHALL include how many recorded figures it holds, and an
unconfirmed removal of a role that holds any SHALL be refused — including a role
that holds recorded days and nothing else.

A confirmed removal SHALL delete those figures in the same transaction as the
role, and SHALL report how many it took.

#### Scenario: a role holding only recorded days is still in use

- **GIVEN** a role with no estimates and no assignments, holding one recorded
  figure
- **WHEN** its removal is requested without confirmation
- **THEN** the removal SHALL be refused as `in_use`
- **AND** the refusal SHALL say that one recorded figure stands in the way
- **AND** the role and the figure SHALL both still be there
