## ADDED Requirements

### Requirement: Measure definitions are organization data with one scheduling measure

be-01 SHALL hold measure definitions per organization with an immutable key, a name, a unit
label, a kind among `duration`, `count` and `money`, a scale among `integer` and `real`, the
flags `threePoint`, `showByDefault` and `schedulesWork`, an order, and a currency for money.
Every organization SHALL be seeded with `time` (duration, schedulesWork, showByDefault),
`tokens` (count, integer), `hours` (duration, real, no three-point), `cost` (money, integer
micro-units) and `agent_minutes` (duration, integer, derived, no three-point). `createMeasure`,
`patchMeasure` and `deleteMeasure` SHALL be directory commands that only an organization admin
or a super-admin may send, refused `403 forbidden` to every other role; a plan import that would
create a definition SHALL be refused the same way. A second `schedulesWork` definition SHALL be
refused `409 second_scheduling_measure`; deleting a definition SHALL be refused
`409 measure_in_use` while any estimate, fact or budget references it, and there SHALL be no
cascade. The key SHALL never change.

#### Scenario: A new measure is a command

- **WHEN** an admin creates measure `gpu_minutes` of kind `duration`, scale `integer`
- **THEN** it is listed after the seeded five, with no estimates, facts or budgets, and
  `setMeasure` accepts facts in it

#### Scenario: Only an admin defines measures

- **WHEN** an organization member who is not an admin sends `createMeasure`, or imports a file
  whose measure the organization does not define
- **THEN** it is refused `403 forbidden` and no definition is written

#### Scenario: A definition in use

- **WHEN** `deleteMeasure` targets a definition one fact references
- **THEN** it is refused `measure_in_use` and the definition and the fact remain

#### Scenario: Two scheduling measures

- **WHEN** a patch sets `schedulesWork` on `tokens` while `time` holds it
- **THEN** the batch is refused `second_scheduling_measure` and nothing changes

### Requirement: Estimates and facts exist per measure in the measure's unit

A step node SHALL hold at most one three-point estimate per measure whose definition allows
three points, ordered optimistic ≤ realistic ≤ pessimistic in the measure's unit and scale,
written by `setMeasureEstimate` and removed by `clearMeasureEstimate`; a trio on a definition
with `threePoint = false` SHALL be refused `409 three_point_forbidden`. A step node SHALL hold
at most one fact per measure, written by `setMeasure` with a measure key; a fact on an unknown
key SHALL be refused `404 unknown_measure`, a fact in the wrong scale `409 scale_mismatch`, and
a fact on a derived measure `409 derived_measure`. The expected value of a measure SHALL be the
project's PERT weights applied to its trio, rounded by its scale, and its variance the fact
minus the expected; both SHALL roll up per subtree with the one-measure fold, absent when no
descendant holds the figure. Legacy `token_estimate` rows SHALL migrate to single-point trios
flagged `singlePoint` until a three-point write clears the flag. `agent_minutes` facts SHALL be
derived from the additive spans of a step node's ended attempts.

#### Scenario: Expected and variance

- **WHEN** a step node holds tokens `{optimistic: 100, realistic: 200, pessimistic: 600}` under
  weights 1, 4, 1 and a tokens fact of 300
- **THEN** the read shows expected 250 and variance 50

#### Scenario: A trio where three points are forbidden

- **WHEN** `setMeasureEstimate` targets `hours`
- **THEN** it is refused `three_point_forbidden`

### Requirement: Measures other than the scheduling measure never move the schedule

Adding, changing or removing an estimate, fact or budget of any measure other than the
scheduling measure SHALL leave every scheduled date, float and slice unchanged. The scheduling
measure SHALL keep its existing estimate and actual storage and commands.

#### Scenario: Schedule digest under random measure writes

- **WHEN** 200 random plans each receive random non-time estimates, facts and budgets
- **THEN** each plan's schedule digest before and after is byte-identical

### Requirement: Budgets are rows per work item and measure that the start refuses on

A work item SHALL hold at most one budget per measure with a cap in the measure's unit, a
policy among `strict` and `advisory`, and a source among `stated` and `derived`; `setBudget`
and `clearBudget` SHALL be plan commands. A derived budget SHALL be computed as the subtree's
pessimistic points times the project's budget factor when the subtree holds a three-point trio
in the measure, shown as derived and never stored as stated; it SHALL exist only where every
leaf step node holding a fact in the measure also holds a three-point trio in it. A
single-point tokens trio (the legacy token estimate) SHALL seed no derived budget. A budget on a parent SHALL bound the summed facts of its subtree.
Facts that cross a strict budget SHALL still be recorded; the read SHALL report `exceeded`
with the remaining amount. A project-scoped read SHALL list remaining budget per measure for
each claimed or startable step, with holds for attempts whose usage is unknown reducing the
remainder until they end.

#### Scenario: A subtree budget

- **WHEN** a parent holds a strict tokens budget of 1,000 and its three leaves record 400, 400
  and 400
- **THEN** the parent reads `exceeded` with remaining −200 and each leaf reads its own share

#### Scenario: The legacy token estimate seeds no budget

- **WHEN** a leaf holds only a single-point tokens trio of 500 and a tokens fact of 900
- **THEN** it reads no tokens budget, neither derived nor exceeded

#### Scenario: A step spends without a trio

- **WHEN** a leaf holds a three-point tokens trio on `dev` and a tokens fact on `qa` only
- **THEN** neither the leaf nor its ancestors read a derived tokens budget

#### Scenario: Unknown spend holds

- **WHEN** an attempt with unknown usage runs under a step with 500 tokens remaining and a
  per-attempt allowance of 300
- **THEN** the budget read shows 200 remaining until the attempt ends

### Requirement: A strict budget admits an attempt's start inside its write

`startAttempt` SHALL be refused `409 budget_exhausted`, writing nothing, when a strict budget of
the work item or an ancestor has nothing remaining, when the attempt's hold would take its
remainder below zero, or when a mix of rate cards keeps it from being read. The refusal SHALL
name the budget's `workItemId`, `measure`, `remaining` (null when blocked), the `hold` the
attempt would add and `blocked`. The decision SHALL be taken inside the start's own write, so
concurrent starts SHALL never together exceed the room the budget holds. Advisory and derived
budgets SHALL never refuse a start, and no budget SHALL refuse a fact or a claim.

#### Scenario: Concurrent starts

- **WHEN** a parent holds a strict tokens budget of 500 holding 300 per attempt and two of its
  leaves start attempts at once
- **THEN** exactly one start is admitted and the other is refused `budget_exhausted` with
  remaining 200 and hold 300

#### Scenario: Advisory never refuses

- **WHEN** the same budget is advisory and both leaves start attempts
- **THEN** both starts are admitted

#### Scenario: A blocked strict budget refuses

- **WHEN** a parent holds a strict cost budget and its leaves record cost facts under two rate
  cards
- **THEN** a start under it is refused `budget_exhausted` with `blocked: true` and remaining null

### Requirement: Money facts carry their pricing basis and mixed bases never add

A `cost` estimate or fact SHALL record the currency and the rate card digest it was priced
with. A roll-up that would add figures priced under different bases (currency and digest)
SHALL be refused `409 mixed_rate_cards` naming both; WBS converts nothing.

#### Scenario: Two cards in one subtree

- **WHEN** two leaves hold cost facts under digests A and B
- **THEN** the parent's cost roll-up is refused naming A and B

### Requirement: Columns and export follow the definitions

The plan table SHALL offer estimate, fact and variance columns for every measure definition,
visible by default only where `showByDefault` is set, with toggles persisted per browser and
project beside the remembered layout and forgotten by its reset; headers SHALL carry the unit and money the currency;
absence SHALL render as absence. A measure panel per work item SHALL list every definition
with expected, fact, variance and budget. Every export SHALL be the version carrying the
budget factor, definitions, estimates, facts and budgets, each list empty when the plan holds
none, and Twilight Navigator, Burokrat and Dash SHALL read it; importing an older version SHALL seed the defaults and map
legacy metrics; saved plan compare SHALL show changes in any measure.

#### Scenario: A fresh user sees time only

- **WHEN** a user with no remembered layout opens a project whose organization defines five
  measures
- **THEN** only the time columns are visible, and enabling tokens persists per browser and
  project, beside the remembered layout, and not in another browser

#### Scenario: Older export imports

- **WHEN** an export without measure definitions is imported
- **THEN** the five defaults are seeded, legacy token and hours facts map onto them, and the
  plan reads as before

#### Scenario: A plan without measures exports version 11

- **WHEN** a plan with no fact in a defined measure, no three-point trio, no stated budget and a
  budget factor of 1 is exported
- **THEN** the document is version 11 with `settings.budgetFactor` 1 and the four measure lists
  empty, and a version-10 file still imports onto the seeded definitions

#### Scenario: Twilight reads version 11

- **WHEN** Twilight Navigator reads a version-11 export
- **THEN** it derives the same tasks as the equivalent version-10 file and records
  `planDocumentVersion: 11`, which Burokrat and Dash accept
