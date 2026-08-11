## ADDED Requirements

### Requirement: A row that cannot slip is reported as critical, drift included

A work item's slack SHALL be read through the same drift window the calendar
uses: a `latestStart - earliestStart` within 1e-9 of a whole day IS that whole
day, and `critical` SHALL be decided from that snapped number rather than from
the raw subtraction. The snapped value SHALL be what is reported, so the Slack
column and the critical marking can never disagree about the same row.

Slack further from a whole day than the window is real and MUST be reported
untouched — the window sits orders of magnitude below the smallest fraction a
PERT estimate can carry. `latestStart` and `latestFinish` themselves SHALL stay
verbatim, and the leveller's own float-based priority SHALL keep ranking
unsnapped critical-path floats: it separates rows the plan can genuinely tell
apart.

#### Scenario: every row that ends a drifted project is critical

- **WHEN** a chain of PERT estimates summing to exactly fifteen days
  accumulates to 15.000000000000002 and a flat fifteen-day row runs beside it,
  so all four rows end the project
- **THEN** every one of them reports a float of 0 and is marked critical

#### Scenario: a floor that stands a row at the project finish leaves it no float

- **WHEN** a manual `startNoEarlierThan` floor puts a fractional row past
  everything else in the plan, so that row is the project's finish
- **THEN** its float is 0 and it is marked critical, where the raw subtraction
  gave about -1.8e-15 and no marking

#### Scenario: a sixth of a day of slack survives the snap

- **WHEN** a row rides beside a longer branch with exactly a sixth of a day of
  room — the smallest fraction a PERT final can carry
- **THEN** it keeps that float and is not marked critical
