## ADDED Requirements

### Requirement: An unestimated slice takes an assumed duration in the schedule

The system SHALL schedule a slice nobody has estimated across two workdays,
called its **assumed duration**, rather than across no time at all.

The assumed duration SHALL be one constant shared by the schedule and the
drawing, so that a bar's width and the dates beside it cannot disagree.

The assumption SHALL apply to every constraint the schedule holds: dependencies,
not-before floors, resource leveling and team capacity. An unestimated slice
with an assignee SHALL occupy that assignee, and one on a team SHALL spend that
team's pool, for its assumed duration.

#### Scenario: an entirely unestimated predecessor delays its successor

- **GIVEN** a predecessor with two steps and no estimates, and a successor
  depending on it
- **WHEN** the plan is scheduled
- **THEN** the predecessor SHALL finish four workdays after it starts
- **AND** the successor SHALL start no earlier than that

#### Scenario: two unestimated slices for one person do not overlap

- **GIVEN** two unestimated slices assigned to the same person
- **WHEN** the plan is scheduled
- **THEN** they SHALL NOT be placed on the same workdays

#### Scenario: the drawing and the dates agree

- **GIVEN** an unestimated slice
- **WHEN** its bar is drawn and its dates are read
- **THEN** the bar's span SHALL be the same number of workdays as the schedule
  placed it across

## MODIFIED Requirements

### Requirement: An assumed duration is not an estimate

The system SHALL NOT write an estimate for a slice it has assumed a duration
for. Everything that reports whether work has been estimated SHALL continue to
report that it has not: the days column, the roll-up, the readiness badge and
its walk to the next gap, the export, the filter's estimated-steps facet, and
the anchor-slice reach's choice of first **estimated** slice.

An unestimated slice's bar SHALL continue to be painted as a guess — its dotted
outline, its translucent fill and its `?` unchanged.

#### Scenario: an unestimated item still reports no estimate

- **GIVEN** a work item with no estimates, scheduled after this change
- **THEN** its days column SHALL be blank
- **AND** it SHALL be counted as an estimate gap
- **AND** the export SHALL report it as unestimated

#### Scenario: the anchor reach still means first _estimated_

- **GIVEN** a project on the `anchor-slice` reach, and a predecessor whose first
  step is unestimated and whose second step is estimated
- **WHEN** the plan is scheduled
- **THEN** the successor SHALL wait for the **second** step's finish
- **AND** it SHALL NOT wait for the first step's assumed finish

#### Scenario: the bar still says it is a guess

- **GIVEN** an unestimated slice with detail shown
- **WHEN** its bar is drawn
- **THEN** it SHALL carry the assumed marking it carried before this change
