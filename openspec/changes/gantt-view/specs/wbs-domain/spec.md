## ADDED Requirements

### Requirement: Slices cross the wire

The tree payload SHALL carry every scheduled slice: its engine id, work item,
role, person, duration, `estimated`, earliest/latest start and finish, float,
`critical`, its binding floor, and its resource predecessor's id or null. The
numbers SHALL be the engine's verbatim — never rounded, never recomputed. A
slice's `resourcePredecessorId` SHALL reference a slice present in the same
payload. The change SHALL be additive: every field the payload carried before
is unchanged.

#### Scenario: two work items, one person

- **WHEN** `Strip` (3 days, Kat) and `Sand` (2 days, Kat) have no dependency
  and the tree is read
- **THEN** the payload holds both slices, `Sand`'s starts at 3 with binding
  floor `person` and `resourcePredecessorId` equal to `Strip`'s slice id

#### Scenario: nothing else moved

- **WHEN** the tree is read by a client that ignores `slices`
- **THEN** every other field is byte-identical to what it was before this
  change

### Requirement: The Gantt panel mirrors the shown rows

A toolbar control SHALL show and hide the Gantt panel under the plan. The
panel SHALL draw exactly the rows the plan renderer is showing, in the same
order — collapsed branches and rows narrowed away by a search SHALL be absent
— and SHALL do so under either renderer.

#### Scenario: a collapsed branch

- **WHEN** a branch with two children is collapsed and the panel is open
- **THEN** the panel draws the parent's row and neither child's

#### Scenario: a search narrows the plan

- **WHEN** a search leaves three rows on screen
- **THEN** the panel draws exactly those three, in the plan's order

### Requirement: The workday is the SVG unit

The chart SHALL be one SVG whose user-space x unit is one workday: viewBox
width SHALL equal the horizon, a bar's `x` SHALL equal its slice's earliest
start and its `width` the slice's duration, and each bar SHALL carry
`data-start` and `data-finish` holding the engine numbers verbatim.

#### Scenario: user space equals engine numbers

- **WHEN** a slice runs 3.5 → 6 and the panel renders
- **THEN** its bar has `x` 3.5, `width` 2.5, `data-start` "3.5",
  `data-finish` "6", and the SVG viewBox is as wide as the horizon

### Requirement: Leaves draw bars, parents draw summary brackets

A leaf's row SHALL hold one bar per slice, in role order. A bar whose slice is
unestimated SHALL be visibly distinct from an estimated one. A parent's row
SHALL hold a summary bracket spanning its projection — a span, never a sum. A
bar on the critical path SHALL be tinted so, and a bar off it SHALL not.

#### Scenario: a two-role leaf

- **WHEN** a leaf holds Dev 0→3 and QA 3→5
- **THEN** its row holds two bars, Dev's before QA's, at those coordinates

#### Scenario: a parent over staggered children

- **WHEN** a parent's children run 0→3 and 2→6
- **THEN** the parent's row holds one bracket from 0 to 6

#### Scenario: the critical path is visible

- **WHEN** one leaf has float 0 and another float 2
- **THEN** the first row's bar carries the critical tint and the second's does
  not

### Requirement: Calendar labels agree with the date columns

The axis SHALL print calendar labels from the project start date through the
same workday mapping the date columns use, the finish label following the
ceil−1 rule, so a bar's labelled dates and its row's Start/End cells SHALL
never disagree. Without a project start date the axis SHALL print workday
offsets. Weekends SHALL NOT appear on the axis.

#### Scenario: the panel and the columns agree

- **WHEN** the project starts Monday 2026-08-10 and a slice runs 3 → 5
- **THEN** the axis places that bar under Thursday 2026-08-13 through Friday
  2026-08-14, exactly the row's Start and End cells

#### Scenario: no start date

- **WHEN** the project has no start date
- **THEN** the axis prints workday numbers and no calendar dates

### Requirement: Dependency arrows and person links are drawn from data

A dependency arrow SHALL join a predecessor's finish to its successor's start,
one per stored dependency between shown rows. A person link SHALL be drawn
from a slice's resource predecessor to it, only where the binding floor is the
person, visually distinct from a dependency arrow, and derived from
`resourcePredecessorId` alone — never parsed from text. A
`resourcePredecessorId` that names no slice in the payload SHALL throw, into
the error boundary, not draw nothing.

#### Scenario: a hand-off is not a dependency

- **WHEN** `Sand` waits for Kat to finish `Strip` with no dependency between
  them
- **THEN** the panel holds a person link from `Strip`'s bar to `Sand`'s and no
  dependency arrow

#### Scenario: a dangling resource predecessor

- **WHEN** the payload carries a slice whose `resourcePredecessorId` names no
  slice in it
- **THEN** the panel throws rather than drawing a chart with a silently
  missing link

### Requirement: A bar explains itself and finds its row

Hovering a bar SHALL name its slice's binding floor in words — for a person
floor, naming the person and the slice they were finishing. Clicking a bar or
its row label SHALL take the plan to that row: the row's name cell is scrolled
into view and focused, under either renderer. Rows with a manual start SHALL
carry a not-before flag at that date's workday offset.

#### Scenario: the reason is on the bar

- **WHEN** `Sand`'s slice is floored by Kat finishing `Strip`
- **THEN** its bar's hover text names Kat and `Strip`

#### Scenario: click lands on the row

- **WHEN** a bar of row `Sand` is clicked
- **THEN** `Sand`'s name cell is focused and scrolled into view

#### Scenario: a manual date is marked

- **WHEN** a row holds start-no-earlier-than at workday 4
- **THEN** its row carries a not-before flag at x = 4

### Requirement: Row labels hold the left edge

The panel's row labels SHALL stay visible at the left edge while the chart
scrolls horizontally, at phone width too. The panel SHALL NOT widen the page:
the chart scrolls inside the panel.

#### Scenario: scrolled to the horizon on a phone

- **WHEN** the viewport is 390px wide and the chart is scrolled fully right
- **THEN** every row label is still visible and the page itself has not
  scrolled sideways

### Requirement: A plan that cannot be scheduled draws no chart

When the schedule is refused — a dependency cycle — the panel SHALL show the
same unscheduled state the table's date columns show, and SHALL NOT crash or
draw stale bars.

#### Scenario: a cycle

- **WHEN** the tree read reports a dependency cycle
- **THEN** the panel shows the plan cannot be scheduled and draws no bars
