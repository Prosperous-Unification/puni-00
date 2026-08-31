## ADDED Requirements

### Requirement: A project weighs the three points of a PERT estimate its own way

A project SHALL hold three PERT weights — one for each of optimistic, realistic
and pessimistic — and the PERT figure SHALL be their weighted sum divided by
**the sum of the three weights**, never by a fixed 6.

A project that has said nothing SHALL weigh them 1, 4 and 1, which is the
arithmetic every project had before this change.

The weights SHALL be read only under the `pert` method; the other three methods
name one of the three points and take it as it stands.

#### Scenario: the default weights are the arithmetic that was there before

- **GIVEN** a project that has never set its weights
- **WHEN** a `2/3/10` step is combined
- **THEN** its figure before rounding SHALL be `(2 + 4×3 + 10) / 6`, which is 4

#### Scenario: equal weights are a plain average

- **GIVEN** a project whose weights are 1, 1 and 1
- **WHEN** a `2/3/10` step is combined
- **THEN** its figure before rounding SHALL be 5, the mean of the three

#### Scenario: a zero weight drops a point out of the divisor too

- **GIVEN** a project whose weights are 0, 1 and 1
- **WHEN** a `2/3/10` step is combined
- **THEN** its figure before rounding SHALL be 6.5, the mean of the realistic
  and pessimistic figures alone

### Requirement: A project rounds one step's figure before anything is summed

A project SHALL hold an estimate rounding — `floor`, `round` or `ceil` — and it
SHALL be applied to **one step's** combined figure, after the estimate method
has combined that step's three points and before any sum is taken.

A project that has said nothing SHALL round with `ceil`.

A work item's total days SHALL be the sum of its steps' rounded figures, and a
work item with children SHALL carry the sum of its descendants' rounded figures
rather than its rolled-up three points put through the method once.

The number the schedule gives a slice SHALL be the same rounded number the table
shows for that step, as it was before this change.

#### Scenario: rounding lands on the step, not on the total

- **GIVEN** a project rounding with `ceil` and a leaf holding `0.5/0.5/0.5` on
  Dev and the same on QA, each combining to 0.5 days
- **WHEN** the plan is read
- **THEN** each step SHALL show 1 day and the work item SHALL total 2 days,
  never the 1 day that rounding the sum would give

#### Scenario: floor and round are the same shape of answer

- **GIVEN** the same two half-day steps
- **WHEN** the project rounds with `floor`
- **THEN** each step SHALL show 0 days and the total SHALL be 0
- **WHEN** the project rounds with `round`
- **THEN** each step SHALL show 1 day and the total SHALL be 2

#### Scenario: a parent totals what its children were charged

- **GIVEN** a project rounding with `ceil` and a parent with two children, each
  holding one half-day step
- **WHEN** the plan is read
- **THEN** the parent's total SHALL be 2 days — the sum of what its children
  show — and not the 1 day its summed three points would combine to

#### Scenario: the rounding applies whichever method combined the step

- **GIVEN** a project planning with `realistic` and rounding with `ceil`
- **WHEN** a step estimated `0.5/2.5/9` is read
- **THEN** its figure SHALL be 3

### Requirement: Float drift never mints or eats a whole day at the rounding

A combined figure within the drift window of a whole number of days SHALL be
read as that whole number before the rounding is applied, so that a figure
that is exactly whole in arithmetic is not rounded up by the bits its division
left behind.

A genuine fraction SHALL survive the snap and be rounded as the fraction it is.

#### Scenario: a drifted whole day is not rounded up

- **GIVEN** a project with the default weights, rounding with `ceil`
- **WHEN** a step estimated `0.4/1.1/1.2` is read, whose figure is exactly 1 in
  arithmetic and `1.0000000000000002` in doubles
- **THEN** its figure SHALL be 1 day

#### Scenario: half a day is still half a day

- **GIVEN** the same project
- **WHEN** a step estimated `0.5/0.5/0.5` is read
- **THEN** its figure SHALL be 1 day under `ceil` and 0 under `floor`

### Requirement: Weights that cannot average a triple are refused

A request SHALL be refused with 422 when it sets weights that are negative, not
finite, or that sum to zero, and the project SHALL keep the weights it had.

Stored weights that cannot average a triple, and a stored rounding that names
none of the three, SHALL throw when the project is read rather than being
replaced by a default: a plan computed by an arithmetic nobody chose is a wrong
answer delivered confidently.

#### Scenario: three zeroes are refused

- **WHEN** a project is patched with weights 0, 0 and 0
- **THEN** the response SHALL be 422 and the project SHALL still hold 1, 4, 1

#### Scenario: an infinite weight is refused

- **WHEN** a project is patched with an optimistic weight of `1e999`, which JSON
  parses as `Infinity`
- **THEN** the response SHALL be 422

#### Scenario: a negative weight is refused

- **WHEN** a project is patched with a realistic weight of `-1`
- **THEN** the response SHALL be 422

#### Scenario: an unreadable stored rounding throws

- **GIVEN** a `project` row whose `estimate_rounding` column holds `nearest`
- **WHEN** the project is read
- **THEN** the read SHALL throw naming the column and the value

### Requirement: A project's estimate arithmetic is on the wire it is read from

A plan read SHALL carry the project's PERT weights and its rounding beside the
estimate method it already carries, so a client can say what arithmetic the
figures in front of it came from without asking a second question.

A patch SHALL be able to set either, alone or together, and both SHALL move the
project's revision as every other stored project field does.

#### Scenario: the tree says what it was computed with

- **WHEN** a plan is read
- **THEN** the payload SHALL carry `pertWeights` and `estimateRounding` beside
  `estimateMethod`

#### Scenario: setting the rounding moves the revision

- **GIVEN** a project at revision 3
- **WHEN** its rounding is set to `floor`
- **THEN** the project SHALL be at revision 4
