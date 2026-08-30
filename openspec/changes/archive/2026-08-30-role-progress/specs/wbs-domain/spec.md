## ADDED Requirements

### Requirement: A plan records where each role's work on a work item has got to

The plan SHALL hold, for each work item and role, where that role's work has got
to, as one of exactly two stored states: **in progress** or **done**.

The state SHALL be held **per role**, at the same grain as the estimate and the
recorded days, because the recorded days are per role and two grains for one
subject produce a plan that can say a work item is finished while a role on it
has recorded nothing.

A state SHALL be storable only against a work item with no children. A work item
with children SHALL be refused with `rolled_up`, and a role the project does not
hold SHALL be refused with `unknown_role` — the two refusals the estimate and the
actual writes already make, for the same reasons.

A statement SHALL carry the moment it was made, and a change of state SHALL carry
the moment of the change rather than the moment of the statement it replaces.

#### Scenario: a role stated on a leaf is reported beside its figures

- **GIVEN** a leaf work item with an estimate and recorded days for a role
- **WHEN** that role is stated as done on that work item
- **THEN** the plan SHALL report that role as done for that work item
- **AND** the estimate and the recorded days SHALL be unchanged

#### Scenario: a state cannot be stored on a work item with children

- **GIVEN** a work item that has children
- **WHEN** a state is stored against it
- **THEN** the write SHALL be refused as `rolled_up`
- **AND** nothing SHALL be stored

#### Scenario: only the two storable states are accepted

- **GIVEN** a leaf work item and a role of its project
- **WHEN** a state other than in progress or done is submitted for it
- **THEN** the write SHALL be refused as `invalid_progress`
- **AND** nothing SHALL be stored

### Requirement: Not started is the absence of a statement, never a stored value

A role nobody has spoken about SHALL be **absent** from what the plan reports for
that work item, and SHALL NOT be reported as a stored state. A work item nobody
has said anything about SHALL report no states at all.

Clearing SHALL remove the statement rather than store one, and clearing what was
never stated SHALL succeed, because the state asked for is the state left.

Not started SHALL NOT be submittable as a state: the way to express it is to
clear the statement.

#### Scenario: a role nobody has spoken about is absent

- **GIVEN** a work item with one of a project's two roles stated as done
- **WHEN** the plan is read
- **THEN** the plan SHALL report that role as done
- **AND** the other role SHALL be absent from what it reports for that work item

#### Scenario: clearing returns a role to nobody having said

- **GIVEN** a work item with a role stated as done
- **WHEN** that statement is cleared
- **THEN** the plan SHALL report no state for that role on that work item
- **AND** clearing it again SHALL succeed and change nothing

### Requirement: A work item's own state is derived from its roles and never stored

A work item's state SHALL be computed on read from the roles that have work on
it — the roles with an estimate, with recorded days, or with a statement — and
SHALL NOT be stored anywhere.

A work item SHALL be **done** only when every role with work on it is done. It
SHALL be **not started** only when no role with work on it has been spoken about.
Every other combination SHALL be **in progress**.

A work item with children SHALL take its state from its children, and SHALL be
done only when all of them are. A child that nobody has spoken about SHALL keep
its parent off done.

#### Scenario: one role done and another silent is an unfinished work item

- **GIVEN** a leaf work item with an estimate for two roles
- **AND** one of those roles stated as done
- **WHEN** the plan is read
- **THEN** the work item SHALL be reported as in progress

#### Scenario: a work item is done when every role with work on it is done

- **GIVEN** a leaf work item with an estimate for two roles
- **AND** both roles stated as done
- **WHEN** the plan is read
- **THEN** the work item SHALL be reported as done

#### Scenario: a branch is not done while one of its rows has never been spoken about

- **GIVEN** a work item with two children, one of them fully done and the other
  with no estimate, no recorded days and no statement
- **WHEN** the plan is read
- **THEN** the branch SHALL be reported as in progress

### Requirement: A role stated as done means its recorded days are final

Days recorded against a role stated as **done** SHALL be read as the whole of
what that role spent on that work item, rather than as a running count. Recording
further days against a role stated as done SHALL restate that total rather than
add to it.

A role stated as done with no recorded days SHALL mean that the work is finished
and the days it took were never recorded.

#### Scenario: a variance against a done role is a completed variance

- **GIVEN** a work item with an estimate of 5 days and 8 days recorded for a role
- **AND** that role stated as done
- **WHEN** the plan is read
- **THEN** the recorded days SHALL be readable as the total that role spent

### Requirement: Stating progress moves no date

Stating that a role's work is in progress or done SHALL NOT change any work
item's start date, finish date, duration, slack or critical-path membership, and
SHALL NOT change the order in which any work is scheduled.

The schedule SHALL be computed from the estimates, the dependencies, the capacity
and the calendar alone.

#### Scenario: a plan schedules identically with and without a state

- **GIVEN** a scheduled plan with a dependency between two work items
- **WHEN** the predecessor's role is stated as done and days are recorded against
  it
- **THEN** every work item's schedule SHALL be exactly what it was before

### Requirement: Statements follow the work items they are about

A statement SHALL move with the work item it is about through every structural
change to the plan.

When a leaf gains its first child, its statements SHALL move down to that child.
When a work item loses its last child, the branch's **derived** state per role
SHALL be stored on the surviving parent, and roles nobody spoke about SHALL be
left unstated rather than stored as not started. When a deleted branch is
restored, every statement made anywhere in it SHALL be restored with it.

A duplicated branch SHALL carry **no** statements: a copy is work nobody has done
and nobody has spoken about.

A role removal SHALL count the statements it would take before taking them, and
an unconfirmed removal of a role holding only statements SHALL be refused.

#### Scenario: a duplicate carries the estimate and not the statement

- **GIVEN** a work item with an estimate and a role stated as done
- **WHEN** it is duplicated
- **THEN** the copy SHALL carry the estimate
- **AND** the copy SHALL carry no statement and SHALL be reported as not started

#### Scenario: a restored branch comes back with what was said about it

- **GIVEN** a branch whose rows carry statements
- **WHEN** the branch is deleted and the deletion is undone
- **THEN** every statement SHALL be back on the row it was made about

#### Scenario: a role holding only a statement is in use

- **GIVEN** a role with no estimate, no recorded days and no assignment
- **AND** one work item stating that role as done
- **WHEN** the role's removal is requested without confirmation
- **THEN** the removal SHALL be refused as in use
- **AND** the statement SHALL still be there
