## ADDED Requirements

### Requirement: Attempts draw as marks over the planned slice at sub-day rungs

At a sub-day rung, a step node holding attempts SHALL draw one attempt mark per attempt over
its planned slice on the same row, the planned slice remaining underneath: `succeeded` solid
with `data-attempt="succeeded"`, `failed` hatched, `cancelled` dotted, and a running attempt
open-ended to the panel's `now` with `data-attempt="running"`. A mark narrower than 4 px SHALL
be a tick with a pointer surface of at least 18 px and SHALL join the collision list; its card
SHALL carry the attempt number, outcome, instants in the project zone, executor and
reference. Attempt marks SHALL count toward the 2,500-mark offer rule. At the day rungs
nothing SHALL change and a done leaf SHALL draw its done bar. An instant SHALL be placed by
its project-zone day and minute of day; the part of a mark outside 09:00–17:00 SHALL be
clamped to the day's edge with `data-clamped`, the card carrying the true instants. `now`
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
