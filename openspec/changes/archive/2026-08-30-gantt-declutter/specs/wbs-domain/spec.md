## MODIFIED Requirements

### Requirement: The workday is the SVG unit

The chart SHALL be one SVG whose user-space x unit is one workday: a bar's `x`
SHALL equal its slice's earliest start and its `width` the span it is drawn
across, which is the slice's duration. Each bar SHALL carry `data-start` and
`data-finish` holding the engine numbers verbatim. The viewBox SHALL cover the
whole schedule, 0 through the horizon, and the band outside it the marks of
"The canvas holds every mark" are drawn in.

#### Scenario: user space equals engine numbers

- **WHEN** a slice runs 3.5 → 6 and the panel renders
- **THEN** its bar has `x` 3.5, `width` 2.5, `data-start` "3.5",
  `data-finish` "6", and the SVG viewBox holds 0 through the horizon

#### Scenario: a slice estimated at no days still says where it is

- **WHEN** an estimated slice sits at workday 3 with a duration of 0
- **THEN** a tick stands at workday 3 and `data-start` and `data-finish` both
  read "3"

### Requirement: Leaves draw bars for the work somebody costed, and nothing else does

A leaf's row SHALL hold one bar per **estimated** slice, in role order. A bar on
the critical path SHALL be tinted so, and a bar off it SHALL not.

A parent's row SHALL draw no mark of its own — no bar, no bracket, no tick, and
no hover surface. The row itself SHALL stay on the chart at its own index and
the row height every other row has, so the chart's row `N` stands beside the
plan's row `N`, and the label rail SHALL go on naming it.

A slice nobody has estimated SHALL draw no mark of its own: no bar, no tick, no
on-bar label and no hover surface. A leaf with some roles estimated SHALL draw
those roles' bars and nothing for the rest; a leaf with none SHALL draw an empty
track. The engine's numbers, the date columns and the arrows between rows SHALL
be unchanged by the absence — nothing about the schedule is decided here.

A not-before caret SHALL be drawn only on a row that draws at least one bar. The
caret stands in the band above the bar its row starts with, so on a row that
draws nothing it is a mark over an empty track pointing at a bar that is not
there — the same rule that keeps a hand-off line off an undrawn slice.

#### Scenario: a two-role leaf

- **WHEN** a leaf holds Dev 0→3 and QA 3→5, both estimated
- **THEN** its row holds two bars, Dev's before QA's, at those coordinates

#### Scenario: a leaf half estimated

- **WHEN** a leaf holds an estimated Dev slice and an unestimated QA slice
- **THEN** its row holds the Dev bar alone, and no mark carries `data-assumed`

#### Scenario: a parent over staggered children

- **WHEN** a parent's children run 0→3 and 2→6
- **THEN** the parent's row holds no `data-gantt-bracket` mark, its children's
  bars are drawn where they were, and every row keeps its index

#### Scenario: a parent whose projection has no days

- **WHEN** every child of a parent is unestimated
- **THEN** the parent's row holds no mark at all, and the rows below it are not
  shifted

#### Scenario: a start date held on a row that draws nothing

- **WHEN** a parent and an unestimated leaf each carry a start-no-earlier-than
  date, beside a leaf that carries one and draws a bar
- **THEN** only the drawn leaf's row holds a not-before caret, and both empty
  rows stay on the chart at their own index

#### Scenario: the critical path is visible

- **WHEN** one leaf has float 0 and another float 2
- **THEN** the first row's bar carries the critical tint and the second's does
  not

### Requirement: A bar names its work, not only its worker

A bar's on-bar label SHALL carry the assignee reading it carries today — full
name, initials, or nothing, decided by the bar's drawn width — followed by the
row's own words, `<number> - <name>`, separated by `·`. The row words SHALL be
cropped to the bar's drawn width by the label box itself (ellipsis), never by
dropping them from the string: a bar wide enough for three characters of its row
words shows three characters and `…`, not the assignee alone.

A bar with nobody on it SHALL still write its row words: the label used to be
the assignee alone, so an unassigned bar wrote nothing, and sixty grey bars with
no words is the fault this label removes.

The label font SHALL be one size smaller than the row labels beside the chart
(9px against their 10px), so the words sit inside the bar rather than on it.

#### Scenario: A wide assigned bar

- **WHEN** a 10-workday bar assigned to `Anna Adams` on row `010 - Strip` is drawn
- **THEN** its label reads `Anna Adams · 010 - Strip`, in 9px, cropped by its own box

#### Scenario: A narrow unassigned bar

- **WHEN** a 2-workday bar nobody is on is drawn for row `020 - Sand`
- **THEN** its label reads `020 - Sand` cropped to the bar, and not nothing

### Requirement: The arrows are off until they are asked for

The panel SHALL show a labelled switch that draws every dependency arrow —
elbows and heads both — and takes them away again. The switch SHALL open
**off**: a chart nobody has asked arrows of SHALL hold no `data-gantt-arrow` and
no `data-gantt-arrow-head` mark.

The answer SHALL be remembered by the browser and SHALL survive a reload, a
project switch and a remount of the panel. It is one preference for this
browser, not one per project, and be-01 SHALL never be told about it. A stored
answer that is not a boolean SHALL be dropped — the key removed and the switch
left off — rather than read as anything.

Person links and not-before carets SHALL be untouched by the switch: it draws
and removes the stored-dependency marks alone.

#### Scenario: The chart opens without arrows

- **WHEN** the chart is opened on a plan with stored dependencies and nobody has
  touched the switch
- **THEN** no `data-gantt-arrow` or `data-gantt-arrow-head` mark is in the
  document, and every bar, person link and caret is

#### Scenario: Asking for the arrows

- **WHEN** the switch is pressed
- **THEN** every stored dependency's elbow and head is drawn, and pressing it
  again takes both away

#### Scenario: The answer outlives the page

- **WHEN** the switch is pressed on and the page is reloaded
- **THEN** the chart opens with the arrows drawn

#### Scenario: A stored answer that is not one

- **GIVEN** `wbs.ganttArrows` holding text that is not a boolean
- **WHEN** the chart is opened
- **THEN** the arrows are off and the key is gone

## REMOVED Requirements

### Requirement: A parent draws as a virtual bar

**Reason**: The ghost bar restates a span its children's own bars already draw,
and Dany named it as clutter in the same breath as the arrows. The row stays;
its mark goes.

**Migration**: None for callers — `PlacedBracket` is still computed and still
feeds the horizon, so no geometry moves. `data-gantt-bracket` no longer exists
in the document; the three tests that measured it are rewritten to assert its
absence and the row alignment it used to stand in.

## RENAMED Requirements

- FROM: `### Requirement: Leaves draw bars, parents draw summary brackets`
- TO: `### Requirement: Leaves draw bars for the work somebody costed, and nothing else does`

- FROM: `### Requirement: The arrows can be switched off`
- TO: `### Requirement: The arrows are off until they are asked for`
