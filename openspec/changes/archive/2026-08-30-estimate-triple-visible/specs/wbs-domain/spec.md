## MODIFIED Requirements

### Requirement: A folded role's cell reads the trio shorthand it was given

The system SHALL show a stored estimate in a folded role's cell as its trio
shorthand — `2/3/8` — and SHALL collapse a trio whose three points are equal to
the single number that stores it, `5`. Where no estimate is held the cell SHALL
be empty and SHALL show its placeholder.

What the cell shows at rest SHALL be a trio shorthand the system accepts: typing
the shown value back into the cell SHALL store the estimate that is already
stored.

While an unsent draft is held for that work item and role, the cell SHALL show
the draft rather than the stored shorthand, as it does today.

#### Scenario: the trio survives the estimate landing

- **GIVEN** a folded role's cell with no estimate
- **WHEN** `2/3/10` is typed into it and the estimate lands
- **THEN** the cell SHALL read `2/3/10`

#### Scenario: three equal points read as one number

- **GIVEN** a folded role's cell with no estimate
- **WHEN** `5` is typed into it and the estimate lands
- **THEN** the cell SHALL read `5`

#### Scenario: what the cell shows is what typing it back would store

- **GIVEN** a work item estimated `2/3/10` for a role
- **WHEN** the cell's own value is typed back into it
- **THEN** the estimate stored SHALL still be `2/3/10`

### Requirement: The derived figure is shown beside the trio, and only where it adds something

The system SHALL show a folded role's derived figure — its final days, computed
by the project's estimate method and rolled up over children — beside the cell's
shorthand, muted. It SHALL NOT show it where that figure reads the same as the
shorthand already does.

The figure SHALL be read from the work item's stored estimate rather than from
an unsent draft, so that a half-typed cell is never stood beside a figure its
own characters did not produce.

The derived figure SHALL keep counting towards the work item's total days
exactly as it does now.

#### Scenario: the PERT figure stands beside the trio it came from

- **GIVEN** a work item estimated `2/2/3` for a role under the PERT method
- **WHEN** its folded cell is read
- **THEN** the cell SHALL read `2/2/3`
- **AND** the figure `2.2` SHALL be shown beside it

#### Scenario: a flat trio is not said twice

- **GIVEN** a work item estimated `5/5/5` for a role
- **WHEN** its folded cell is read
- **THEN** the cell SHALL read `5`
- **AND** no derived figure SHALL be shown beside it

#### Scenario: the figure beside a half-typed cell is the stored one

- **GIVEN** a work item estimated `2/2/3` for a role under the PERT method
- **WHEN** `9/9/` is typed into its folded cell and not yet sent
- **THEN** the figure beside the cell SHALL still read `2.2`

#### Scenario: total days is unchanged

- **GIVEN** a work item estimated `2/2/3` for its only role under the PERT method
- **WHEN** its total days is read
- **THEN** it SHALL be `2.2`

### Requirement: The folded role's cell keeps the geometry it had

The system SHALL keep a folded role column at the width its layout declares and
SHALL keep a table row at its at-rest height, whatever a cell's shorthand and
derived figure come to.

#### Scenario: showing the trio does not grow the row

- **GIVEN** two work items, one estimated `2/2/3` and one not estimated at all
- **WHEN** their rows are measured
- **THEN** both rows SHALL be the same height

#### Scenario: the cell's contents stay inside the cell

- **GIVEN** a work item estimated `2/2/3` for a role with somebody assigned to it
- **WHEN** the folded cell is measured
- **THEN** nothing drawn in it SHALL run past the cell it belongs to
