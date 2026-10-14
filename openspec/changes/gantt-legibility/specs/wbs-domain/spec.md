## MODIFIED Requirements

### Requirement: An assumed duration is not an estimate

The system SHALL NOT write an estimate for a slice it has assumed a duration
for. Everything that reports whether work has been estimated SHALL continue to
report that it has not: the days column, the roll-up, the readiness badge and
its walk to the next gap, the export, the filter's estimated-steps facet, and
the anchor-slice reach's choice of first **estimated** slice.

An unestimated slice's bar SHALL continue to be painted as a guess — its dotted
outline and its translucent fill unchanged — and SHALL say so in words: its
on-bar label SHALL open with the row's number, as every bar label does, and
the phrase SHALL yield to the number as a name does on an estimated bar:
`<number> · no estimate` (the phrase cropped by the box) where the number and
the crop mark fit, the number alone where only it fits, and nothing where the
number does not fit whole. It SHALL NOT lead with `?`, and SHALL write the
number at most once.

#### Scenario: an unestimated item still reports no estimate

- **GIVEN** a work item with no estimates, scheduled after this change
- **THEN** its days column SHALL be blank
- **AND** it SHALL be counted as an estimate gap
- **AND** the export SHALL report it as unestimated

#### Scenario: the anchor reach still means first _estimated_

- **GIVEN** a project on the `anchor-slice` reach, and a predecessor whose first
  step is unestimated and whose second step is estimated
- **WHEN** the plan is scheduled
- **THEN** the successor SHALL wait for the **second** step's finish
- **AND** it SHALL NOT wait for the first step's assumed finish

#### Scenario: the bar still says it is a guess

- **GIVEN** an unestimated slice with detail shown
- **WHEN** its bar is drawn
- **THEN** it SHALL carry the assumed marking it carried before this change

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
translucent and dashed, labelled `<number> · no estimate` to say its width is nobody's
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

## ADDED Requirements

### Requirement: The Gantt chart stays legible at every rung and in both themes

Every on-bar label SHALL be drawn inside its own bar's lane: where bars share a
row in lanes, each label SHALL take its lane's height, no two labels SHALL
overlap, and a lane too short for the label's line SHALL carry no label.

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
- **THEN** each reads its number (and `no estimate` after it where that fits)
  inside its own lane and the two labels do not overlap

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
