## ADDED Requirements

### Requirement: The table says how far the plan is from being estimated

The table SHALL show how many work items are still missing an estimate, judged
per role. Only work items with no children SHALL be counted: a work item whose
figures are rolled up from below holds no estimates of its own and there is
nothing on it to fill in. A work item SHALL be counted once however many roles
it is missing, so the figure is the number of rows somebody has to visit. The
roles SHALL be counted separately as well, and reported on the badge itself, so
a plan estimated for one role and not another cannot read as finished. When
every leaf holds an estimate for every role the readiness figure SHALL NOT be
shown at all.

#### Scenario: a leaf nobody has estimated

- **GIVEN** a project with a Dev role and a QA role
- **WHEN** a leaf work item holds no estimate for either
- **THEN** the table reports one work item missing an estimate

#### Scenario: one role estimated and the other not

- **GIVEN** a leaf work item with a Dev estimate and no QA estimate
- **THEN** it is still counted as missing an estimate, and the per-role
  breakdown names QA

#### Scenario: rows are counted, not roles

- **GIVEN** one leaf missing both roles and one leaf missing only QA
- **THEN** the figure shown is `2 unestimated` and the breakdown reads
  `1 missing Dev, 2 missing QA`

#### Scenario: a parent is never counted

- **GIVEN** a work item whose only child holds no estimate
- **THEN** exactly one work item is reported as missing an estimate — the
  child, not the parent

#### Scenario: a complete plan says nothing

- **WHEN** every leaf holds an estimate for every role
- **THEN** no readiness figure is shown

#### Scenario: an empty project

- **GIVEN** a project with no work items
- **THEN** no readiness figure is shown

#### Scenario: a stored estimate of zero days

- **GIVEN** a leaf whose stored trio is `0 / 0 / 0` for every role
- **THEN** it is not reported as missing an estimate — nought days is an answer

### Requirement: The readiness figure walks the work items it is counting

The readiness figure SHALL be a control that moves the focus, and SHALL move it
to the cell where the missing estimate is typed: the next counted work item's
cell for the **first role that work item is missing**. Activating it again SHALL
move to the one after that, and SHALL return to the first once the last has been
reached. When the work item it names is inside a collapsed branch, that branch
and every branch above it SHALL be opened before the focus lands, so the focus
never goes to a cell that is not on screen. When the work item the walk last
visited is no longer counted, the walk SHALL begin again at the first. The
control SHALL be reachable and activatable from the keyboard, and SHALL NOT
write anything.

#### Scenario: the focus lands where the estimate is typed

- **GIVEN** a leaf with a Dev estimate and no QA estimate
- **WHEN** the readiness figure is activated
- **THEN** the focus is in that work item's QA estimate cell

#### Scenario: the next one, and the one after that

- **GIVEN** two work items missing an estimate
- **WHEN** the readiness figure is activated three times
- **THEN** the focus visits the first, then the second, then the first again

#### Scenario: a work item inside a collapsed branch

- **GIVEN** a collapsed parent whose child is missing an estimate
- **WHEN** the readiness figure is activated
- **THEN** the branch is opened and the focus is in the child's estimate cell

#### Scenario: the work item that was last visited has been estimated

- **GIVEN** the walk has reached the second of three work items
- **WHEN** that work item is estimated for every role
- **AND** the readiness figure is activated
- **THEN** the focus is in the first work item still missing an estimate

#### Scenario: the role's columns are unfolded

- **GIVEN** a role whose three estimate boxes are on screen
- **WHEN** the readiness figure is activated for a work item missing that role
- **THEN** the focus is in that work item's optimistic box, which is where the
  estimate is typed while the role is unfolded
