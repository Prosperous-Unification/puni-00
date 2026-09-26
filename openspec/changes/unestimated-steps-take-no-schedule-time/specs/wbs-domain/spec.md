## REMOVED Requirements

### Requirement: An unestimated slice takes an assumed duration in the schedule

**Reason:** The archived assumed-duration-schedules rule makes a missing estimate delay and consume resources. The product owner requires the assumption to be drawing-only.

**Migration:** Replace its scheduling semantics with the zero-duration and visual-placeholder requirements below. No stored estimate is rewritten.

## MODIFIED Requirements

### Requirement: An assumed duration is not an estimate

The assumed span SHALL describe only how an unknown slice is drawn. A slice whose days are null SHALL remain unestimated in the days column, roll-up, readiness badge and next-gap walk, export, estimated-steps filter, and anchor-slice reach. Its bar SHALL retain its dotted outline, translucent fill and question mark. An explicitly estimated zero-day slice SHALL remain estimated and SHALL not gain an assumed placeholder.

#### Scenario: An unknown step remains a gap

- **GIVEN** a slice whose days are null
- **WHEN** the plan is scheduled and drawn
- **THEN** it remains an estimate gap in the table, readiness report and export
- **AND** its bar is marked as an uncertain placeholder

#### Scenario: An explicit zero is an estimate

- **GIVEN** a slice explicitly estimated as zero days
- **WHEN** it is scheduled and drawn
- **THEN** it remains estimated and has no assumed-width bar

## ADDED Requirements

### Requirement: An unestimated slice has zero scheduling duration

Fast and optimized schedules SHALL give a slice with days null zero scheduling duration while retaining its dependency node and any explicit not-before or deadline constraints. Its zero-time finish SHALL be its start. It SHALL not reserve an assignee, spend team capacity, delay a successor, extend project finish, or enlarge parent scheduled bounds or date projections by the visual assumption. Multiple unknown slices MAY share one schedule instant. A stated zero-day estimate SHALL follow the same zero-duration arithmetic without losing its estimated status.

#### Scenario: Unknown predecessor does not delay a successor

- **GIVEN** an unestimated predecessor and an estimated successor linked by a finish-to-start dependency
- **WHEN** either scheduler produces a plan
- **THEN** the successor can start at the predecessor's zero-time finish, subject only to other real constraints
- **AND** the placeholder span adds no delay

#### Scenario: Unknown work consumes no people or pool

- **GIVEN** two unestimated slices assigned to one person and one team, beside estimated work
- **WHEN** either scheduler levels the plan
- **THEN** the unknown slices can share an instant and reserve no person or team capacity
- **AND** estimated work is not pushed by their visual spans

#### Scenario: Project and parent dates ignore placeholders

- **GIVEN** a parent containing estimated and unestimated steps
- **WHEN** either schedule is projected
- **THEN** the parent's bounds, project finish, dependency endpoints and date projections use scheduled zero-time positions for unknown steps
- **AND** no assumed visual span extends them

### Requirement: Unknown steps retain an independent Gantt placeholder

The Gantt SHALL draw each unknown slice from its scheduled start across ASSUMED_SLICE_WORKDAYS workdays, currently two, as a distinct dotted or translucent placeholder with a question mark. Its tooltip SHALL say the step is unestimated, identify the displayed N-workday span, and state that it is excluded from the schedule. The chart viewport MAY extend to contain the drawing, but schedule finish, parent bounds, dates and dependency endpoints SHALL use the zero-time position. Multiple unknown slices at one instant SHALL remain individually identifiable without inventing sequential schedule dates.

#### Scenario: A two-day drawing has a zero-time schedule

- **GIVEN** a slice with days null and ASSUMED_SLICE_WORKDAYS equal to two
- **WHEN** its bar and schedule dates are read
- **THEN** the bar is visibly two workdays wide and marked as unestimated
- **AND** its tooltip says it is excluded from the schedule
- **AND** its scheduled start and finish are equal

#### Scenario: Several unknown slices share an instant

- **GIVEN** successive unknown steps at one scheduled instant
- **WHEN** the Gantt is drawn
- **THEN** each placeholder remains individually discoverable
- **AND** their drawing does not create sequential scheduled dates
