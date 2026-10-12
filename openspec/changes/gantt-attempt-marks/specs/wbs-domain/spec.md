## ADDED Requirements

### Requirement: Attempts draw as marks over the planned slice at sub-day rungs

At a sub-day rung, a step node holding attempts SHALL draw one attempt mark per attempt over
its planned slice on the same row, the planned slice remaining underneath: `succeeded` solid
with `data-attempt="succeeded"`, `failed` hatched, `cancelled` dotted, and a running attempt
open-ended to the panel's `now` with `data-attempt="running"`. A mark narrower than 4 px SHALL
be a tick with a pointer surface of at least 18 px and SHALL join the collision list; its card
SHALL carry the attempt number, outcome, instants in the project zone, executor and
reference. Eligible attempts on visible scheduled leaves with planned slices SHALL count
toward the 2,500-mark offer rule. Hidden or held rows SHALL contribute no attempt marks.
At sub-day rungs a completed leaf SHALL retain its individual planned slices underneath
its attempts rather than replace them with the day-rung done bar. At the day rungs
nothing SHALL change and a done leaf SHALL draw its done bar. An instant SHALL be placed by
its project-zone day and minute of day from the named anchor `STAGE_ONE_DAY_START_MINUTE`
(540, the 09:00 the default working window starts at); the part of a mark outside 09:00–17:00
SHALL be clamped to the start day's 09:00–17:00 window with `data-clamped`, the card carrying
the true instants. An end on a later local date SHALL stop at the start day's 17:00 edge,
without a continuation mark. A wholly out-of-window attempt SHALL remain a selectable edge
tick. This rule SHALL apply to running attempts too. `now`
SHALL be one clock read per render, passed in.

#### Scenario: three attempts over one slice

- **GIVEN** `010.dev` planned 09:00–13:00 with attempts `failed` 09:10–09:40, `failed`
  10:00–10:20 and `succeeded` 10:30–12:00, at the `15 min` rung
- **WHEN** the panel renders
- **THEN** the row shows the planned slice and three marks above it, two hatched and one
  solid, each with its card

#### Scenario: a running attempt reaches now

- **GIVEN** an attempt started 11:00 and `now` 11:45 at the `1 h` rung
- **WHEN** the panel renders
- **THEN** its mark runs 11:00–11:45 with `data-attempt="running"` and an open right edge

#### Scenario: marks count toward the offer rule

- **GIVEN** 500 leaves × 5 steps (2,500 marks) and one attempt
- **WHEN** the control renders
- **THEN** the sub-day rungs read `not offered at 2501 marks`

#### Scenario: an overnight attempt is clamped and said

- **GIVEN** an attempt 16:30–02:10 in the project zone, at the `4 h` rung
- **WHEN** the panel renders
- **THEN** its mark ends at the first day's 17:00 edge with `data-clamped` and the card reads
  the true `16:30–02:10`

#### Scenario: day rungs do not move

- **GIVEN** every existing day-rung Gantt assertion and a plan with attempts
- **WHEN** the panel renders at `Days`
- **THEN** no attempt mark is drawn and every assertion holds

#### Scenario: completed rows keep their forecast at sub-day rungs

- **GIVEN** a completed leaf with two planned step slices and an attempt on each
- **WHEN** the reader selects `15 min`
- **THEN** both planned slices remain underneath their attempt marks
- **AND** selecting `Days` restores the existing single done bar with no attempt marks

#### Scenario: wholly early and wholly late attempts remain selectable

- **GIVEN** attempts 07:00–08:00 and 18:00–19:00 on the same local date
- **WHEN** the panel renders at `15 min`
- **THEN** they are clamped ticks at 09:00 and 17:00, each with an at-least-18-px pointer surface
- **AND** their cards retain their original instants

#### Scenario: multi-day and running attempts stay on the start date

- **GIVEN** an ended attempt from Monday 16:30 to Wednesday 10:00 and a running attempt
  from Monday 16:30 with `now` on Tuesday
- **WHEN** the panel renders at `4 h`
- **THEN** each draws one clamped mark from Monday 16:30 to Monday 17:00
- **AND** the running mark retains its open right edge and its card says `now`

#### Scenario: paint distinguishes failed and cancelled outcomes

- **GIVEN** failed and cancelled attempts at `15 min`
- **WHEN** the panel paints their marks
- **THEN** the failed mark resolves to hatch strokes and the cancelled mark to dots
- **AND** swapping those actual paints violates this requirement even if their
  `data-attempt` attributes remain correct

### Requirement: Missing calendar inputs visibly disable the attempt overlay

At a sub-day rung an absent project start date or project timezone SHALL render an explicit
unavailable overlay state while retaining the forecast. The message SHALL name each missing
input: `Attempt marks unavailable: set a project start date` or
`Attempt marks unavailable: project timezone is unavailable`. Both reasons SHALL be shown
when both inputs are absent. No attempt marks SHALL be drawn or added to the mark count in
that state. The panel SHALL NOT invent a date or timezone. Malformed supplied calendar inputs
SHALL remain invariant failures rather than be treated as absent. Day rungs SHALL stay unchanged.

#### Scenario: the project has no start date

- **GIVEN** attempts, a project timezone and no project start date
- **WHEN** the panel renders at `1 h`
- **THEN** the forecast remains visible and the panel says
  `Attempt marks unavailable: set a project start date`
- **AND** it draws and counts no attempt marks

#### Scenario: a legacy read has no timezone

- **GIVEN** attempts and a project start date but no timezone in the read
- **WHEN** the panel renders at `1 h`
- **THEN** the forecast remains visible and the panel says
  `Attempt marks unavailable: project timezone is unavailable`
- **AND** it draws and counts no attempt marks regardless of the browser timezone

### Requirement: The sub-day display range contains eligible attempts

With an available overlay, the sub-day display range SHALL contain the existing forecast
range and the whole local start-day cells of eligible attempts, before or after that range.
An earlier attempt SHALL NOT shift the schedule origin or alter forecast dates, durations or
dependency endpoints. Calendar headers, mark positions and hit surfaces SHALL share the same
translated display range, with sufficient edge padding for selectable clamped ticks. An
attempt capped on its start date SHALL NOT extend the range to its later end date. SVG export
SHALL use the same range and mark paint. Day-rung ranges SHALL remain unchanged.

#### Scenario: attempts lie on both sides of the forecast

- **GIVEN** a forecast spanning Monday through Friday, an eligible attempt on the preceding
  Sunday and another on the following Monday
- **WHEN** the panel renders at `15 min`
- **THEN** both attempt dates are displayed, Sunday retains weekend shading, and all forecast
  bars keep their original dates and durations
- **AND** each attempt's pointer surface opens the card for that attempt

#### Scenario: a hidden attempt does not widen the axis or consume the limit

- **GIVEN** an attempt outside the forecast range on a filtered-out or collapsed leaf
- **WHEN** the panel renders at a sub-day rung
- **THEN** that attempt contributes neither to the display range nor the mark count
