## ADDED Requirements

### Requirement: The calendar scale binds the chart to the project's first working day

The panel SHALL hold one scale turning a workday offset into a calendar-day
offset, and every calendar coordinate on the chart SHALL come from it.

Its origin SHALL be `addWorkdays(startDate, 0)` — the plan's first working day —
so a project whose start date falls on a weekend begins on the Monday, the same
normalisation the Start column already makes. The scale SHALL NOT re-implement
that rule; it inherits it.

A **span's start** SHALL read `startOf(w)`:
`calendarDaysBetween(origin, addWorkdays(origin, ⌊w⌋)) + (w − ⌊w⌋)` — the whole
part walks working days, the fraction rides inside the workday it belongs to, so
a slice 3.5 workdays into the schedule is still 3.5 workdays into it.

A **span's end** SHALL read `endOf(w)`, the same scale's left limit: for a
fractional offset it is `startOf(w)`, and for a whole offset `w > 0` it is
`startOf(w − 1) + 1` — the end of the last workday the span is on, which is the
`ceil − 1` nudge `lastWorkdayOf` and be-01's `datesOf` already make.
The two readings differ only where a weekend sits between workday `w − 1` and
`w`: work that finished on the Friday SHALL end at the Saturday, not at the
Monday its successor starts on.

Offsets below zero SHALL return the offset itself, one calendar day per unit,
rather than throwing: they are the canvas band the marks route through and not
schedule time, and `addWorkdays` refuses them.

#### Scenario: fractions ride inside their workday

- **WHEN** the plan starts Monday 2026-08-10 and the scale is asked for 3.5
- **THEN** it answers 3.5, and for 4.75 it answers 4.75 — the Friday, whole and
  fractional, before any weekend has passed

#### Scenario: the weekend is a jump

- **WHEN** the same plan's scale is asked for 5, 5.25 and 10
- **THEN** it answers 7, 7.25 and 14 — Monday 2026-08-17 and Monday 2026-08-24

#### Scenario: a span that finished on the Friday

- **WHEN** a span runs from workday 3 to workday 5 on that plan
- **THEN** its start reads 3 and its end reads 5, not 7

#### Scenario: a span that runs into the Monday

- **WHEN** a span runs from workday 3 to workday 6
- **THEN** its start reads 3 and its end reads 8, so the weekend inside it is
  drawn across

#### Scenario: a project that starts on a Saturday

- **WHEN** the project's start date is Saturday 2026-08-08
- **THEN** the scale's origin is Monday 2026-08-10, `startOf(0)` is 0 and
  `startOf(5)` is 7 — the same answers as a plan that started on the Monday

#### Scenario: the band outside the schedule

- **WHEN** the scale is asked for −0.25
- **THEN** it answers −0.25 rather than throwing, so a mark routing left of the
  first day has a coordinate

### Requirement: One resolved calendar geometry places every mark

Every mark the panel draws with a horizontal coordinate SHALL take that
coordinate from one resolved calendar geometry, and no mark SHALL be positioned
from a raw workday number while the plan has a start date. The marks are: bars,
summary brackets, dependency elbow routes and their heads, person links,
not-before carets, the ticks under zero-day estimates, the row bands, the
gridlines, the HTML bar-label overlay, the horizon, the viewBox and its pad, and
the axis header. A mark left on workday coordinates misaligns from the first
weekend on, and the axis is the mark that makes it visible.

A coordinate read from a **start** SHALL use the scale's start reading and one
read from a **finish** its end reading, so a predecessor's right edge and its
successor's left edge stand apart by exactly the weekend between them.

#### Scenario: every mark for one workday lands on one calendar day

- **WHEN** the plan starts Monday 2026-08-10, a row's slice starts at workday 5
  and the row's not-before date holds it at workday 5
- **THEN** the bar's `x`, the caret's point, the tick under a zero-day estimate,
  the axis cell above them and the label overlay's `left`
  (`7 × DAY_PX + CHART_PAD_PX`) all stand at calendar day 7

#### Scenario: a hand-off across a weekend

- **WHEN** a predecessor finishes at workday 5 and its successor starts at
  workday 5 on that plan
- **THEN** the arrow leaves calendar day 5 and arrives at calendar day 7, and
  the two bars do not touch

#### Scenario: the axis and the canvas are the same width

- **WHEN** the chart is drawn
- **THEN** the axis holds one cell per calendar day of the viewBox's schedule
  band, cell `k` standing at user-space `x = k`, and the two counts agree

### Requirement: Without a project start date the chart stays on the workday axis

A plan with no start date is not on a calendar, and its axis SHALL be exactly
the one drawn today: one cell per workday printing the workday offset, no
weekend cell anywhere, and every fifth gridline the heavy one. The unit those
cells stand over is the workday, as "The calendar day is the SVG unit" states —
this requirement adds no second answer about the unit, and nothing in this state
builds a scale or asks one for a coordinate.

#### Scenario: the axis is the workday axis

- **WHEN** the plan has no start date and a slice starts at workday 5
- **THEN** the axis cell for workday 5 stands above that slice's bar, and the
  axis prints `5` rather than a date

#### Scenario: no weekend is drawn

- **WHEN** the plan has no start date and the horizon is 8
- **THEN** the axis holds 8 cells, none of them marked a weekend, and the heavy
  gridlines fall on 0 and 5

## MODIFIED Requirements

### Requirement: The calendar day is the SVG unit

**When the project has a start date**, the chart SHALL be one SVG whose
user-space x unit is one calendar day, taken from the scale of "The calendar
scale binds the chart to the project's first working day". A bar's `x` SHALL be
the calendar-day offset of its slice's earliest start, and its `width` the
calendar span it is drawn across — `endOf(start + drawnSpan) − startOf(start)`,
the end reading of the drawn finish less the start reading of the start, never a
span taken from the engine's `finish`, which for an unestimated slice equals its
start and would draw a bar of no area at all.

**When the project has no start date**, the unit SHALL stay one workday: every
coordinate is the engine's own workday number verbatim, the scale SHALL NOT be
built at all, and no mark SHALL ask it for anything. This is a rendered state
the panel is in, not a path it falls through, and the axis drawn over it is
"Without a project start date the chart stays on the workday axis". Those two
paragraphs are the whole of what the unit is; no other requirement states it.

Each bar SHALL carry `data-start` and `data-finish` holding the engine's
**workday** numbers verbatim: the test hook stays engine-true, the drawn
geometry is the scale's, and the difference between them is what a test reads to
say the conversion happened. The viewBox SHALL cover the whole schedule in
calendar days, 0 through the calendar horizon, plus the band outside it the
marks of "The canvas holds every mark" are drawn in.

Every bar with a non-zero drawn span SHALL have a non-zero width. A slice
**estimated** at zero days keeps its drawn span of zero and its tick.

#### Scenario: user space is the calendar

- **WHEN** the plan starts Monday 2026-08-10 and a slice runs 3.5 → 6
- **THEN** its bar has `x` 3.5 and `width` 4.5, `data-start` "3.5",
  `data-finish` "6", and the SVG viewBox holds 0 through the calendar horizon

#### Scenario: the data attributes outlive the drawn width

- **WHEN** an unestimated slice sits at workday 3 with a duration of 0 on that
  plan
- **THEN** its bar has `x` 3 and `width` 2 — the two workdays it is drawn
  across, Thursday and Friday, and not zero — while `data-start` and
  `data-finish` both read "3"

#### Scenario: a workday number is not a coordinate

- **WHEN** a slice starts at workday 5 on that plan
- **THEN** its bar has `x` 7 and `data-start` "5"

#### Scenario: the workday is still the unit without a start date

- **WHEN** the plan has no start date and a slice starts at workday 5
- **THEN** its bar's `x` is 5, and no coordinate on the chart came from a scale

### Requirement: Leaves draw bars, parents draw summary brackets

A leaf's row SHALL hold one bar per slice, in role order. A parent's row SHALL
hold a summary bracket spanning its projection — a span, never a sum — from the
start reading of its earliest start to the end reading of its latest finish. A
bar on the critical path SHALL be tinted so, and a bar off it SHALL not.

A bar whose slice is unestimated SHALL be drawn across an assumed span of two
workdays from the slice's earliest start, rather than as a mark of no width, and
SHALL be unmistakably provisional: it keeps its assignee's colour but is drawn
translucent, with a dashed outline, and carries a `?` in its on-bar label. Its
hover text SHALL say in a line of its own that it is not estimated and that the
width is drawn rather than scheduled. The assumed span is a drawing only — the
engine's numbers, the date columns and the arrows drawn between rows are
unchanged by it — and the horizon SHALL reach far enough to contain it in
calendar days.

#### Scenario: a two-role leaf

- **WHEN** the plan starts Monday 2026-08-10 and a leaf holds Dev 0→3 and QA
  3→5
- **THEN** its row holds two bars, Dev's at `x` 0 of width 3 and QA's at `x` 3
  of width 2 — Thursday and Friday, with no weekend tail on the second

#### Scenario: a parent over staggered children

- **WHEN** that plan's parent has children running 0→3 and 2→6
- **THEN** the parent's row holds one bracket from 0 to 8, the weekend inside
  the second child drawn across

#### Scenario: the critical path is visible

- **WHEN** one leaf has float 0 and another float 2
- **THEN** the first row's bar carries the critical tint and the second's does
  not

#### Scenario: an unestimated slice

- **WHEN** a leaf's slice is unestimated and the engine placed it at workday 3
  with a duration of 0
- **THEN** its bar is drawn from calendar day 3 across the two workdays' width,
  translucent and dashed and labelled with a `?`, its `data-start` and
  `data-finish` still read `3`, and its hover text carries the line
  `Not estimated — drawn as 2 days`

#### Scenario: the horizon holds the assumed span

- **WHEN** the last thing on the chart is an unestimated slice at workday 3 on
  that plan
- **THEN** the calendar horizon reaches 5, so the drawn bar is inside the canvas

### Requirement: Calendar labels agree with the date columns

The axis SHALL be a calendar: one cell per calendar day from the scale's origin
through the calendar horizon, weekends among them. Cell `k` SHALL stand for
`origin + k` calendar days and at user-space `x = k`, so the axis and the chart
under it cannot drift. A cell whose date is a Saturday or a Sunday SHALL be
drawn greyed and SHALL say so on the element, and the heavy gridline SHALL fall
on Mondays rather than every fifth cell — on a calendar axis a week is seven
cells and the fifth is a Saturday.

The dates SHALL come from the same workday mapping the date columns use, the
finish label following the `ceil − 1` rule, so a bar's labelled dates and its
row's Start/End cells SHALL never disagree. Without a project start date the
axis SHALL print workday offsets, as "Without a project start date the chart
stays on the workday axis" requires.

#### Scenario: the panel and the columns agree

- **WHEN** the project starts Monday 2026-08-10 and a slice runs 3 → 5
- **THEN** the axis places that bar under Thursday 2026-08-13 through Friday
  2026-08-14, exactly the row's Start and End cells

#### Scenario: the weekend is on the axis

- **WHEN** the project starts Monday 2026-08-10 and the horizon reaches past the
  first week
- **THEN** the cells at 5 and 6 carry Saturday 2026-08-15 and Sunday 2026-08-16,
  both marked as weekend, and the cell at 7 carries Monday 2026-08-17 with the
  heavy gridline

#### Scenario: no start date

- **WHEN** the project has no start date
- **THEN** the axis prints workday numbers and no calendar dates

### Requirement: A bar explains itself and finds its row

Hovering a bar SHALL name its slice's binding floor in words — for a person
floor, naming the person and the slice they were finishing. Clicking a bar or
its row label SHALL take the plan to that row: the row's name cell is scrolled
into view and focused, under either renderer. Rows with a manual start SHALL
carry a not-before flag at that date's **calendar** position — the start reading
of the date's workday offset — so the caret stands on the day the row cannot
begin before and not on some earlier one the weekends have swallowed. The words
the caret shows on hover SHALL stay the stored date itself.

The **dates a bar says in words** SHALL stay date arithmetic on the engine's
workday numbers and SHALL NOT be read off a calendar coordinate: the start is
`addWorkdays(origin, ⌊start⌋)` and the finish `addWorkdays(origin,
lastWorkdayOf(start, finish))` — the same two dates the row's Start and End
cells print. A coordinate is a position on the canvas, not an index into the
working days: for a slice running 3 → 5 the end reading is 5 because that is
where the Friday's bar stops, and the fifth calendar day after a Monday origin
is a Saturday nobody worked, while `addWorkdays(origin, 5)` is the Monday after
it. This change moves where a mark is drawn; it moves no date in any sentence.

#### Scenario: the reason is on the bar

- **WHEN** `Sand`'s slice is floored by Kat finishing `Strip`
- **THEN** its bar's hover text names Kat and `Strip`

#### Scenario: click lands on the row

- **WHEN** a bar of row `Sand` is clicked
- **THEN** `Sand`'s name cell is focused and scrolled into view

#### Scenario: a manual date is marked

- **WHEN** the plan starts Monday 2026-08-10 and a row holds
  start-no-earlier-than at workday 5
- **THEN** its row carries a not-before flag at x = 7, on the same day as the
  bar that starts there, and the flag's words name Monday 2026-08-17

#### Scenario: a coordinate is not a date

- **WHEN** the plan starts Monday 2026-08-10 and a slice runs workday 3 → 5
- **THEN** its words name Thursday 2026-08-13 and Friday 2026-08-14 — exactly
  the row's Start and End cells — and name neither Saturday 2026-08-15, which
  its end coordinate of 5 stands on, nor Monday 2026-08-17, which
  `addWorkdays(origin, 5)` gives

### Requirement: The canvas holds every mark

The drawn canvas SHALL contain every mark the panel draws, including the parts
of a dependency arrow's route that fall outside the schedule and the assumed
span an unestimated bar is drawn across. The canvas SHALL be the calendar
schedule plus one band of `CHART_PAD_PX` at either end, expressed in the same
calendar-day unit, and the marks in that band SHALL keep their coordinates below
zero and past the horizon rather than being clamped into it. A bar's
`data-start`/`data-finish` SHALL remain the engine's workday numbers while its
`x` is the scale's answer: the canvas's edges are not the schedule's, and
neither is the calendar.

#### Scenario: an arrow into workday 0

- **WHEN** a successor starts at workday 0 and an arrow arrives at it
- **THEN** the arrow's head is painted, its route reaches left of calendar day 0
  and is inside the canvas

#### Scenario: an arrow off the last bar

- **WHEN** a predecessor finishes at the horizon
- **THEN** the route out past it is inside the canvas, which reaches past the
  calendar horizon by the same band

## RENAMED Requirements

- FROM: `### Requirement: The workday is the SVG unit`
- TO: `### Requirement: The calendar day is the SVG unit`
