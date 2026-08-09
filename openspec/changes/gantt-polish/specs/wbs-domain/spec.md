## ADDED Requirements

### Requirement: A bar names its work, not only its worker

An estimated bar's on-bar label SHALL carry the assignee reading it carries
today — full name, initials, or nothing, decided by the bar's drawn width —
followed by the row's own words, `<number> - <name>`, separated by `·`. The
row words SHALL be cropped to the bar's drawn width by the label box itself
(ellipsis), never by dropping them from the string: a bar wide enough for three
characters of its row words shows three characters and `…`, not the assignee
alone.

An unestimated bar SHALL keep its `?` exactly as specified in `named-rows`: the
`?` is never dropped, and the row words follow it only in whatever room the
assumed span leaves.

A bar with nobody on it SHALL still write its row words: the label used to be
the assignee alone, so an unassigned bar wrote nothing, and sixty grey bars
with no words is the fault this change removes.

The label font SHALL be one size smaller than the row labels beside the chart
(9px against their 10px), so the words sit inside the bar rather than on it.

#### Scenario: A wide assigned bar

- **WHEN** a 10-workday bar assigned to `Anna Adams` on row `010 - Strip` is drawn
- **THEN** its label reads `Anna Adams · 010 - Strip`, in 9px, cropped by its own box

#### Scenario: A narrow unassigned bar

- **WHEN** a 2-workday bar nobody is on is drawn for row `020 - Sand`
- **THEN** its label reads `020 - Sand` cropped to the bar, and not nothing

#### Scenario: An unestimated bar keeps its question mark

- **WHEN** an unestimated slice's bar is drawn for row `030 - Seal` with nobody on it
- **THEN** the label begins with `?` and the row words follow only after it

### Requirement: A parent draws as a virtual bar

A parent row SHALL draw the same rounded bar shape a leaf draws — same inset,
same height, same corner radius — over its projection's span, filled with the
page's foreground at low opacity and unstroked, so it reads as a projection of
the rows beneath it rather than as work of its own. The bracket with dropped
legs SHALL no longer be drawn.

The span SHALL stay the projection be-01 computed, read through the same
calendar placement the bracket used (`from`/`to` of `PlacedBracket`), never a
sum of children.

The mark SHALL stay findable as `data-gantt-bracket` with the row's id, so the
browser gate keeps measuring the same fact.

#### Scenario: A branch over staggered children

- **WHEN** a parent whose projection runs workdays 0 → 7 is drawn on a calendar
- **THEN** one semitransparent rect spans the same calendar days the bracket did,
  and no bracket path exists

### Requirement: The arrows can be switched off

The panel SHALL show a labelled switch that hides every dependency arrow —
elbows and heads both — and shows them again. The default SHALL be shown. The
switch SHALL be view state of the mounted panel only: not persisted, not
shared, and never touching the plan.

Person links and not-before carets SHALL be untouched by the switch: it removes
the stored-dependency marks alone.

#### Scenario: Hiding the arrows

- **WHEN** the switch is toggled off on a plan with stored dependencies
- **THEN** no `data-gantt-arrow` or `data-gantt-arrow-head` mark is in the
  document, and every bar, person link and caret still is

#### Scenario: Showing them again

- **WHEN** the switch is toggled back on
- **THEN** the same arrows are drawn again

### Requirement: The month caption reads as a month

When the plan has a start date, the sticky corner SHALL print the first visible
cell's month as `<Mon> <yyyy>` — `Aug 2026` — using English month
abbreviations, and SHALL keep following the horizontal scroll as it does today.
Without a start date the corner SHALL keep printing `Workday`.

#### Scenario: A dated plan names its month

- **WHEN** the chart opens on a plan starting 2026-08-10
- **THEN** the corner reads `Aug 2026`, and scrolled into September it reads
  `Sep 2026`
