## ADDED Requirements

### Requirement: Points estimate is a reporting-only integer metric

The metric set SHALL be `token_estimate`, `token_actual`, `hours_actual` and
`points_estimate`. A points estimate SHALL be one non-negative integer per step node, written
and cleared through the measure commands, summed on roll-up like every other metric, absent
where nobody recorded it, and read by no engine. It SHALL be stored in its own additive
`step_points` table; the `step_measure` table and its `CHECK` SHALL be untouched. A non-integer
or negative value SHALL be refused `422 points_not_integer`.

#### Scenario: points roll up by sum

- **GIVEN** a parent with leaves holding `points_estimate` `3` and `5` on `Dev`
- **WHEN** the plan is read
- **THEN** the parent reports `points_estimate` `8` on `Dev` and no schedule value moves

#### Scenario: a fraction is refused

- **WHEN** `setMeasure` writes `points_estimate: 2.5`
- **THEN** it is refused `422 points_not_integer` and nothing is written

#### Scenario: the schedule does not read points

- **GIVEN** every golden corpus case with a `points_estimate` added to one leaf
- **WHEN** schedules and canonical inputs are computed
- **THEN** both are byte-identical to the case without it

### Requirement: A token figure is the total tokens processed

`token_estimate` and `token_actual` SHALL mean total tokens processed — input including
cached, plus output including reasoning — and the vocabulary's JSDoc SHALL say so. The
batch-1 `token_actual` rows written on 2026-09-20 SHALL be re-recorded from the session files
(`puni-plan/wbs-agentic/batch-1-token-actuals.json`) through the ordinary measure command as
one batch, so one undo restores the prior values.

#### Scenario: the re-record is one undoable batch

- **GIVEN** the eight batch-1 step nodes holding "tokens used" figures
- **WHEN** the re-record batch runs and is then undone once
- **THEN** every node reads its total-tokens figure after the batch and its prior figure after
  the undo

### Requirement: A project holds size templates applied as ordinary writes

A project SHALL hold named size templates — `S`, `M`, `L`, `XL` seeded with no figures when a
project is created, editable, addable and removable — each giving per step a trio in that
step's estimate unit and an optional token estimate. Applying a template to a step node SHALL
write the trio as the node's estimate and, when present, the token estimate as its measure,
in one journal entry whose single undo restores both prior rows verbatim. The template name
SHALL NOT be stored on the node, rolled up or exported as a metric. Applying SHALL be refused
`404 unknown_template`, `409 template_step_unset` when the template has no row for the step,
and `409 template_unit_mismatch` when the row's unit is not the step's. Editing a template
SHALL change nothing already written.

#### Scenario: applying a size writes numbers only

- **GIVEN** template `M` giving `Dev` `2 / 3 / 5` workdays and `40000` tokens
- **WHEN** `applySizeTemplate` is applied to `010.dev`
- **THEN** `010.dev` reads estimate `2 / 3 / 5` and `token_estimate` `40000`, the read carries
  no size, and one undo removes both

#### Scenario: a unit mismatch is refused

- **GIVEN** template `S` written for `Dev` in `workdays` and `Dev` since changed to `minutes`
- **WHEN** `S` is applied to a `Dev` node
- **THEN** it is refused `409 template_unit_mismatch` and nothing is written

#### Scenario: a template edit leaves the plan alone

- **GIVEN** `M` applied to `010.dev` yesterday
- **WHEN** `M`'s `Dev` trio is edited to `3 / 4 / 6`
- **THEN** `010.dev` still reads `2 / 3 / 5`

### Requirement: A parent shows each metric with its coverage

A parent's hover card SHALL list every metric at least one leaf beneath it recorded, each
with its partial total and, when not every leaf recorded it, a coverage count of the form
`tokens 3 of 5 leaves`. Metrics SHALL never be summed across one another. The table's Days
column SHALL show the days total only.

#### Scenario: partial coverage is counted

- **GIVEN** a parent with five leaves, three holding `token_actual`
- **WHEN** its hover card opens
- **THEN** it lists `tokens <sum> · 3 of 5 leaves` and no points line

#### Scenario: full coverage carries no count

- **GIVEN** a parent whose every leaf holds `points_estimate`
- **WHEN** its hover card opens
- **THEN** it lists the points total with no `of` clause

### Requirement: The step cell card takes points and offers sizes

A leaf's step cell card SHALL offer a `Points` box writing `points_estimate` through
`setMeasure` and a `Size` picker listing the project's templates, applying one through
`applySizeTemplate`; a template without a row for that step SHALL be listed disabled with
`not set for <step>`. The project settings SHALL gain a Sizes section editing the templates.

#### Scenario: a size is picked from the cell

- **GIVEN** a leaf's `Dev` card and templates `S`, `M` (`M` without a `Dev` row)
- **WHEN** the picker opens
- **THEN** `S` is offered and `M` reads `not set for Dev`; choosing `S` writes its figures
