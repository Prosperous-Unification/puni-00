## ADDED Requirements

### Requirement: A step has an estimate unit and its trios are read in it

Every project step SHALL carry an estimate unit of `workdays` or `minutes`, stored as
`step.estimate_unit`, `workdays` for every step that exists before this change and for a
step created without one. A trio stored on a minute-unit step SHALL be three non-negative
whole minutes, none above `MAX_ESTIMATE_MINUTES` (`MAX_ESTIMATE_DAYS × 480`), in the same
three columns a workday trio uses; a workday-unit trio SHALL keep today's shape. The estimate
row SHALL carry no unit. Changing a step's unit while the step holds any estimate SHALL be
refused `409 estimates_present` naming the count, and no estimate SHALL ever be converted
between units.

#### Scenario: existing steps read as workdays

- **GIVEN** a project whose steps were created before this change
- **WHEN** its steps are read
- **THEN** every step reports `estimateUnit: 'workdays'` and every plan figure is unchanged

#### Scenario: a minute trio is stored whole

- **GIVEN** a step whose unit is `minutes`
- **WHEN** `setEstimate` writes `30 / 40 / 90` on one of its nodes
- **THEN** the node reads `30 / 40 / 90` and the three columns hold exactly those integers

#### Scenario: a fractional minute is refused

- **GIVEN** a step whose unit is `minutes`
- **WHEN** `setEstimate` writes `30 / 40.5 / 90`
- **THEN** it is refused `422 minutes_not_integer` at its command index and nothing is written

#### Scenario: the unit cannot change over estimates

- **GIVEN** a `workdays` step holding estimates on three nodes
- **WHEN** its unit is patched to `minutes`
- **THEN** it is refused `409 estimates_present` with `count: 3`, and after the three
  estimates are cleared the same patch succeeds

### Requirement: A minute-unit step is charged to the minute and a workday-unit step by the project rounding

The charged estimate of a workday-unit step SHALL be exactly ADR 0011's: combined by the
project's method, uplifted by the step's allowance, rounded by the project's estimate
rounding, per step before any sum. The charged estimate of a minute-unit step SHALL be the
combined figure uplifted by the step's allowance and rounded up to the whole minute, and the
project's estimate rounding SHALL NOT be consulted. Quantisation to the solver quantum (a 48th of a
workday, 10 minutes at 480) SHALL happen only where it does today, at the CP-SAT boundary; Fast SHALL stay exact.

#### Scenario: a minute step is ceiled to the minute after its allowance

- **GIVEN** a `minutes` step with allowance `+10 %` on a PERT 1/4/1 project rounding `floor`
- **WHEN** a node estimated `30 / 40 / 90` is charged
- **THEN** it is charged `52 min` (`46.67 × 1.1 = 51.33`, rounded up), and the same under
  `exact` and `ceil`

#### Scenario: a workday step is unchanged

- **GIVEN** every Fast and solver golden corpus case
- **WHEN** the schedules and canonical inputs are computed after this change
- **THEN** both are byte-identical to the stored golden values

### Requirement: A minute-unit slice is placed on the workday axis through WORKDAY_MINUTES

Until the instant axis exists, a minute-unit slice SHALL enter the schedule input with a
duration of `charged minutes / 480` workdays, exact, with `480` the domain constant
`WORKDAY_MINUTES` and not a project setting. It SHALL take part in dependencies, person
queues, pools, floors and deadlines exactly as a workday slice of that fraction does, and
SHALL NOT run through a night or a weekend. The scheduler contract version and the solver
wire SHALL NOT change for this placement. The Gantt bar card of a minute slice SHALL say
"placed on the working calendar".

#### Scenario: four hours is half a day

- **GIVEN** leaves `A → B`, A's only step a `minutes` node charged `240 min`
- **WHEN** the plan is scheduled
- **THEN** A's slice lasts `0.5` workdays and B starts at `0.5`

#### Scenario: eight hours is one day on both engines

- **GIVEN** one `minutes` node charged `480 min` and the same plan with a `workdays` node
  charged `1`
- **WHEN** both are scheduled by Fast and sent to the solver
- **THEN** the two schedule inputs differ only in the step's unit, both slices last one
  workday, and the solver request's `durationUnits` are equal

### Requirement: One showDuration formats every duration

A single `showDuration` SHALL print every charged figure the table, the cards, the chart and
the spreadsheet export show, choosing by the step's estimate unit: workday figures SHALL print
exactly as today; minute figures SHALL print `N min` under 60, `H h` or `H h M min` under
480, and `D d` with one decimal and a trailing `.0` dropped from 480. The wire SHALL carry a minute-unit node's charged
minutes as an integer beside the workday figure, so no face reconstructs minutes from a
fraction. The two faces SHALL be unable to disagree on the unit because they call the same
function.

#### Scenario: minutes read as minutes, hours and days

- **GIVEN** charged figures of `40`, `135` and `720` minutes
- **WHEN** they are shown
- **THEN** they read `40 min`, `2 h 15 min` and `1.5 d`

#### Scenario: the cell, the card and the chart agree

- **GIVEN** a `minutes` node charged `135 min`
- **WHEN** its step cell, its folded step card and its Gantt bar card render
- **THEN** all three print `2 h 15 min`

#### Scenario: a workday figure does not move

- **GIVEN** a `workdays` node charged `2.5`
- **WHEN** it is shown after this change
- **THEN** it prints exactly what it printed before

### Requirement: The steps settings edit the unit and say why it cannot change

The project settings' steps section SHALL show each step's estimate unit as a control offering
`workdays` and `minutes`. On a step holding estimates the control SHALL be disabled and its
tool hint SHALL name the count the server would refuse with; the server's `409
estimates_present` SHALL still be worded in a toast if it arrives. The step-create form SHALL
send an explicit unit, suggesting `minutes` when the step's executor kind is `agent` once that
column exists and `workdays` otherwise.

#### Scenario: the control is disabled over estimates

- **GIVEN** a step holding estimates on two nodes
- **WHEN** the steps section renders
- **THEN** its unit control is disabled and its tool hint says `2 estimates`

#### Scenario: an empty step changes unit

- **GIVEN** a step holding no estimate
- **WHEN** its unit is changed to `minutes` and saved
- **THEN** the step reads `minutes` and its cells take whole minutes
