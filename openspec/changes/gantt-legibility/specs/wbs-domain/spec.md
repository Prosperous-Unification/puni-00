## MODIFIED Requirements

### Requirement: Leaves draw bars for the work somebody costed, and the rest is behind the switch

A leaf's row SHALL hold one bar per slice, in step order, whatever
the detail switch says. Unestimated slices SHALL draw assumed two-workday bars,
translucent and dashed, labelled `<number> · no estimate` when space permits and
findable as `data-assumed`. A bar on the critical path SHALL be tinted so, and a bar off it
SHALL not.

With the switch off, a parent's row SHALL draw no mark of its own — no bar, no
bracket, no tick, and no hover surface. Every leaf SHALL retain its estimated
and assumed bars, their labels and hover surfaces.

With the switch on, a parent's row SHALL draw the translucent ghost of a bar
across its projection, or a tick where that projection has no days. The detail
switch SHALL control dependency arrows and parent summary marks; assumed leaf
bars SHALL remain visible in both states.

In **both** states the row SHALL stay on the chart at its own index and the row
height every other row has, so the chart's row `N` stands beside the plan's row
`N`, and the label rail SHALL go on naming it. The engine's numbers, the date
columns, the axis and the canvas SHALL be identical in the two states — the
switch decides what is painted and nothing about where anything is.

A not-before caret SHALL be drawn only on a row that draws at least one mark of
its own: with the switch off, where an estimated or assumed leaf bar stands; with it on, on
every row holding a start date, because every such row now draws something for
the caret to stand over.

#### Scenario: a two-role leaf

- **WHEN** a leaf holds Dev 0→3 and QA 3→5, both estimated
- **THEN** its row holds two bars, Dev's before QA's, at those coordinates,
  whichever way the switch is set

#### Scenario: a leaf half estimated, at rest and asked for

- **WHEN** a leaf holds an estimated Dev slice and an unestimated QA slice
- **THEN** its row holds the Dev bar and the QA assumed bar carrying `data-assumed`
  in both detail states, with both bars unmoved when the switch is pressed

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
- **THEN** both leaf rows hold a not-before caret, and the parent row stays on
  the chart at its own index without a caret; and once the switch is pressed all
  three rows hold a caret

#### Scenario: the critical path is visible

- **WHEN** one leaf has float 0 and another float 2
- **THEN** the first row's bar carries the critical tint and the second's does
  not

## ADDED Requirements

### Requirement: The Gantt chart stays legible at every rung and in both themes

No two on-bar labels SHALL overlap. Where bars share a row in lanes, a lane
SHALL carry no label of its own: the lane stack writes one label across the
whole band, and an estimated bar that runs past the stack's placeholders
writes its own words past them (`ui-review-gantt-directory`).

An unestimated slice's individually drawn bar SHALL keep its dotted outline and translucent
fill. Outside a lane stack its on-bar label SHALL open with the row's number and write the
number at most once. It SHALL show `<number> · no estimate` with the phrase cropped by its box
where the number and crop mark fit, the whole number alone when only it fits, and no label
when the whole number cannot fit. It SHALL NOT lead with `?`. In a lane stack the single
stack label, width fallback, estimated-bar spill and exported SVG SHALL follow “A lane stack
writes one label.” A done leaf SHALL keep its single opaque done bar in place of all its
slices, with no `data-assumed`, under “A done work item draws one done bar over its fact
span.” An explicitly estimated zero-day slice drawn separately on a non-done leaf SHALL
remain an estimated tick.

Every on-bar label SHALL clear 4.5:1 WCAG contrast against the bar it sits on,
measured from the computed label colour and the bar's computed fill composited
at its `fill-opacity` over the chart's ground, in light and dark. Each person
colour SHALL have an ink at 5:1 or better at full opacity, the label SHALL use
the stronger of its two inks, and a done bar SHALL be drawn opaque.

At the Weeks and Months rungs, where the axis prints only Mondays, the first
day of each month SHALL carry the month's name (`Oct 2026`) above the day
numbers, with a boundary down the axis, the chart and the exported SVG. A
month that begins closer to the axis's end than its name is wide SHALL keep its
boundary and carry no name, so no name runs past the chart. The Days axis SHALL
print what it printed before.

When the schedule is narrower than the chart's panel, the calendar SHALL run
on to the panel's edge without passing it. The same holds in full screen, where
the panel is the whole window, at every rung, and again on returning from it. Every bar with a positive span
SHALL be painted at least 4px wide at every rung; its scheduled span is
unchanged. A done bar narrower than 8px SHALL wear the done green as a 1px
edge instead of the 2px outline, and no tick; its accessible name still says
done.

A label on a bar hatched as blocked by proxy SHALL sit on a patch of the bar's
own ground, so the hatch does not run under its glyphs.

On the chart's control strip, a toggle that is off SHALL be drawn plain, never
struck through or dashed, and a pressed toggle SHALL be drawn filled.

#### Scenario: two placeholders at one instant

- **GIVEN** a leaf whose two steps are both unestimated
- **WHEN** the chart draws its two placeholders in two lanes
- **THEN** neither lane carries a label of its own, and the row's number is
  written once, by the lane stack (`020 · 2 steps · no estimate`)

#### Scenario: every bar colour, light and dark

- **GIVEN** bars in each of the ten person colours, the unassigned grey, a done
  bar, a placeholder and a bar hatched as blocked by proxy
- **THEN** every label measures at least 4.5:1 on its bar in both themes

#### Scenario: a quarter at Months

- **GIVEN** a plan starting 21 September 2026 drawn at Months
- **THEN** the axis names `Oct 2026`, `Nov 2026` and `Dec 2026` where each
  begins, and the chart reaches the panel's right edge without a horizontal
  scrollbar

#### Scenario: full screen at every rung

- **GIVEN** a plan shorter than the window, drawn in full screen at 1440px or
  1024px
- **WHEN** the rung is Days, Weeks or Months
- **THEN** the axis's last column ends less than one column plus the chart's
  pad short of the window's edge, and the chart does not scroll sideways
- **AND** after Escape the panel under the plan fills its own width again
