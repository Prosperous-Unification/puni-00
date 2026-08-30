## ADDED Requirements

### Requirement: Every discrete calendar reading goes through one shared snap

Every discrete calendar reading SHALL be computed by a shared `@wbs/domain`
helper that applies `snapWorkdays` before its discrete step — every place a
fractional workday offset becomes a whole calendar day, which is the first
workday a span starts on (`firstWorkdayOf`: snap, then floor), the last
workday it is still on (`lastWorkdayOf`: snap, then `ceil − 1`, never before
the span's own first workday), and the number of whole-day cells an axis
needs (`wholeDaysCovering`: snap, then ceil).

be-01's printed dates and fe-01's Gantt MUST read through these helpers
rather than repeat the rule inline — the bar span sentences, the
`data-last-day` join to the axis, `calendarScale`'s two readings, and both
axis builders — so the chart and the printed dates cannot disagree on a
drifted offset. A genuine fraction outside the snap window MUST still round
as real work.

#### Scenario: a drifted finish is the same last day be-01 prints

- **WHEN** a slice's finish arrives as 15.000000000000002 off a chain that
  sums to exactly 15
- **THEN** its last workday is 14 — the same day be-01's `endsOn` names — on
  the bar's `data-last-day`, in its hover sentence, and in `datesOf`

#### Scenario: a drifted start is the same first day be-01 prints

- **WHEN** a slice's start arrives as 8.999999999999998 off a chain that sums
  to exactly 9
- **THEN** its first workday is 9, and the hover sentence names the same date
  be-01's `startsOn` prints

#### Scenario: a drifted horizon does not mint an axis cell

- **WHEN** the chart's horizon arrives as 6.000000000000001
- **THEN** both the workday axis and the calendar axis draw exactly the cells
  a horizon of 6 draws

#### Scenario: the calendar scale reads a drifted whole offset as whole

- **WHEN** `calendarScale` is asked where a span starting at 8.999999999999998
  stands, or where one finishing at 15.000000000000002 stops
- **THEN** it answers exactly what it answers for 9 and for 15

#### Scenario: a genuine fraction is still real work

- **WHEN** a span starts at 3.5, finishes at 14.9, or a horizon reaches 14.9
- **THEN** `firstWorkdayOf` answers 3, `lastWorkdayOf` answers 14,
  `wholeDaysCovering` answers 15 — the fraction rounds, never snaps

### Requirement: The drifted float past a notBefore floor is pinned

The engine's current answer SHALL be held by a test for a
fractionally-estimated row whose `notBefore` floor stands past the rest of
the plan's finish: a float that is negative by an IEEE-subtraction bit, and a
last row reported not critical. The test MUST name the behaviour as pinned
rather than endorsed, so the day it changes is a deliberate one.

#### Scenario: a floored fractional row ends the project with drifted float

- **WHEN** nobody is assigned, a row estimated at 23/6 days holds a
  `notBefore` floor of 13, and the rest of the plan finishes by day 3
- **THEN** that row ends the project, its float is negative and smaller in
  magnitude than the snap window, and it is reported not critical
