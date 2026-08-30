## MODIFIED Requirements

### Requirement: One switch draws every mark the chart holds back

The panel SHALL show one labelled switch, `Detail`, that draws **every** mark
the chart holds back and takes them all away again: the dependency arrows —
elbows and heads both — a parent row's summary bracket, and an unestimated
slice's assumed bar with the marks that follow it. There SHALL be no second
control and no per-family answer: one press is the whole of the reader's say
over what the chart draws.

The switch SHALL open **off**, and a chart nobody has asked detail of SHALL hold
no `data-gantt-arrow`, no `data-gantt-arrow-head`, no `data-gantt-bracket` and
no `data-assumed` mark.

Pressed on, the chart SHALL draw each of the three families as it drew them
before `gantt-declutter`, and the marks that follow from them SHALL follow: a
hand-off line whose far end is an assumed bar, and a not-before caret on every
row holding a start date, parents and uncosted leaves among them.

The answer SHALL be remembered by the browser under `wbs.ganttDetail` and SHALL
survive a reload, a project switch and a remount of the panel. It is one
preference for this browser, not one per project, and be-01 SHALL never be told
about it. A stored answer that is not a boolean SHALL be dropped — the key
removed and the switch left off — rather than read as anything.

`wbs.ganttArrows`, the key the arrows-only switch wrote, SHALL be removed from
storage when the panel is opened and SHALL NOT be read as an answer. It answered
a narrower question, and a stored `true` carried across would draw two families
of mark nobody asked for.

Person links between two drawn bars, ticks on costed zero-day slices, the bars
of costed work, the row labels and the axis SHALL be untouched by the switch.

This supersedes, **by name**, `gantt-declutter`'s requirement "The arrows are
off until they are asked for" — replaced in full above — and the clauses of its
"Leaves draw bars for the work somebody costed, and nothing else does" that made
the two removals unconditional. Confirmed by Dany, 2026-08-12: "what i wanted is
for arrows toggle to also affect Unestimated QA ghost bars and Parent
transparent bars. i want to encompass all decluttering into one button."

#### Scenario: The chart opens with none of the three

- **WHEN** the chart is opened on a plan with stored dependencies, a parent row
  and an unestimated slice, and nobody has touched the switch
- **THEN** no `data-gantt-arrow`, `data-gantt-arrow-head`, `data-gantt-bracket`
  or `data-assumed` mark is in the document, and every costed bar, every on-bar
  label, every person link between two costed bars and every row label is drawn

#### Scenario: Asking for the detail

- **WHEN** the switch is pressed
- **THEN** every stored dependency's elbow and head, every parent's bracket and
  every unestimated slice's assumed bar is drawn, and pressing it again takes
  all three away

#### Scenario: The answer outlives the page

- **WHEN** the switch is pressed on and the page is reloaded
- **THEN** the chart opens with the arrows, the brackets and the assumed bars
  drawn, and `aria-pressed` reads `true`

#### Scenario: A stored answer that is not one

- **GIVEN** `wbs.ganttDetail` holding text that is not a boolean
- **WHEN** the chart is opened
- **THEN** the detail is off and the key is gone

#### Scenario: The key the old switch wrote

- **GIVEN** `wbs.ganttArrows` holding `true` and no `wbs.ganttDetail` at all
- **WHEN** the chart is opened
- **THEN** the switch is off, no arrow is drawn, and `wbs.ganttArrows` is gone
  from storage

### Requirement: Leaves draw bars for the work somebody costed, and the rest is behind the switch

A leaf's row SHALL hold one bar per **estimated** slice, in role order, whatever
the switch says. A bar on the critical path SHALL be tinted so, and a bar off it
SHALL not.

With the switch off, a parent's row SHALL draw no mark of its own — no bar, no
bracket, no tick, and no hover surface — and a slice nobody has estimated SHALL
draw no mark of its own: no bar, no tick, no on-bar label and no hover surface.
A leaf with some roles estimated draws those roles' bars alone; a leaf with none
draws an empty track.

With the switch on, a parent's row SHALL draw the translucent ghost of a bar
across its projection, or a tick where that projection has no days; and an
unestimated slice SHALL draw a bar two workdays wide,
translucent and dashed, carrying the `?` that says its width is nobody's
estimate, findable as `data-assumed`.

In **both** states the row SHALL stay on the chart at its own index and the row
height every other row has, so the chart's row `N` stands beside the plan's row
`N`, and the label rail SHALL go on naming it. The engine's numbers, the date
columns, the axis and the canvas SHALL be identical in the two states — the
switch decides what is painted and nothing about where anything is.

A not-before caret SHALL be drawn only on a row that draws at least one mark of
its own: with the switch off, only where a costed bar stands; with it on, on
every row holding a start date, because every such row now draws something for
the caret to stand over.

#### Scenario: a two-role leaf

- **WHEN** a leaf holds Dev 0→3 and QA 3→5, both estimated
- **THEN** its row holds two bars, Dev's before QA's, at those coordinates,
  whichever way the switch is set

#### Scenario: a leaf half estimated, at rest and asked for

- **WHEN** a leaf holds an estimated Dev slice and an unestimated QA slice
- **THEN** its row holds the Dev bar alone and no mark carries `data-assumed`;
  and once the switch is pressed the QA slice's assumed bar is drawn beside it,
  carrying `data-assumed`, with the Dev bar unmoved

#### Scenario: a parent over staggered children

- **WHEN** a parent's children run 0→3 and 2→6
- **THEN** the parent's row holds no `data-gantt-bracket` mark, its children's
  bars are drawn where they were, and every row keeps its index; and once the
  switch is pressed the bracket is drawn across the projection, with every row
  still at its own index

#### Scenario: a parent whose projection has no days

- **WHEN** every child of a parent is unestimated
- **THEN** the parent's row holds no mark at all, and the rows below it are not
  shifted; and once the switch is pressed the row holds the zero-span tick

#### Scenario: a start date held on a row that draws nothing

- **WHEN** a parent and an unestimated leaf each carry a start-no-earlier-than
  date, beside a leaf that carries one and draws a bar
- **THEN** only the drawn leaf's row holds a not-before caret, and both empty
  rows stay on the chart at their own index; and once the switch is pressed all
  three rows hold a caret

#### Scenario: the critical path is visible

- **WHEN** one leaf has float 0 and another float 2
- **THEN** the first row's bar carries the critical tint and the second's does
  not

## RENAMED Requirements

- FROM: `### Requirement: The arrows are off until they are asked for`
- TO: `### Requirement: One switch draws every mark the chart holds back`

- FROM: `### Requirement: Leaves draw bars for the work somebody costed, and nothing else does`
- TO: `### Requirement: Leaves draw bars for the work somebody costed, and the rest is behind the switch`

## ADDED Requirements

### Requirement: A parent draws as a virtual bar, behind the switch

With the switch on, a summary row's span SHALL be drawn as the ghost of a bar —
the same rounded shape a leaf gets, in the page's own ink at low opacity and
unstroked — across the projection `placeGantt` computed, carrying
`data-gantt-bracket`. A projection with no days SHALL be drawn as a tick at the
branch's own day rather than as a rect of no width, which paints nothing.

The mark SHALL NOT be drawn while the switch is off, which is the state every
reader starts in. `gantt-declutter` removed this requirement outright; it is
restored here as one of the three families the `Detail` switch draws.

#### Scenario: the ghost of a bar, and only when asked

- **WHEN** the switch is pressed on a plan whose parent spans workdays 0 → 7
- **THEN** the parent's row holds one `data-gantt-bracket` rect across that
  projection, painted at low opacity rather than in solid ink; and with the
  switch off the same plan holds none
