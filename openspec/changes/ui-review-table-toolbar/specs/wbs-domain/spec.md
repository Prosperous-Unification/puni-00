## ADDED Requirements

### Requirement: An estimate and its placeholder share one ink

An Estimate cell's resting trio, a parent's rolled-up trio and the `o/r/p` placeholder SHALL be
drawn in `--quiet-ink` at one size. Every grid placeholder SHALL be italic and no value SHALL be.
Each SHALL clear 4.5:1 on a plain, banded or lit row, in both palettes.

#### Scenario: a filled and an empty Estimate cell side by side

- **WHEN** the plan shows a banded row with a trio `2/3/4` and a banded row with an empty QA box, at 1440 in either palette
- **THEN** the trio and `o/r/p` have one colour and one size, `o/r/p` is italic and the trio upright, and both measure 4.5:1 or more at rest and with the row lit

### Requirement: Names in the header and toolbar do not collide

The desktop plan toolbar SHALL be a `toolbar` named `Plan actions`. The page nav's link to `/`
SHALL be named `Project`, so that the nav's current page never names a view the Plan · Board
toggle shows unpressed.

#### Scenario: the Board is showing

- **WHEN** the reader presses Board
- **THEN** the nav marks `Project` current and no unpressed button in the header bears that name

### Requirement: Escape reaches an error toast over a modal surface

While a modal surface is open and the toast stack shows an error, Escape SHALL dismiss the newest
error and SHALL NOT reach the surface. With no error left, Escape SHALL close the surface as
before. With no modal surface open, Escape SHALL NOT dismiss a toast.

#### Scenario: two errors over a sheet

- **WHEN** two errors and a note show over an open sheet and the reader presses Escape three times
- **THEN** the first press removes the newer error, the second the older, and the third closes the sheet, leaving the note

### Requirement: A reconnect is reported as a possible change

Saved plans SHALL report a stream resettle after a drop separately from a frame. A comparison
whose live side moved only through resettles SHALL say `The connection dropped while this
comparison was on screen; the plan may have changed.`. Once any frame moves it, the panel SHALL say
`This plan has changed since the comparison below was made.`. Either way it SHALL offer
Compare again.

#### Scenario: a drop with nothing published

- **WHEN** the panel's stream drops and comes back while a comparison with the current plan is on screen
- **THEN** the panel says the connection dropped and the plan may have changed, and offers Compare again

### Requirement: The Views Save hint names the overwrite

The Views Save button's hint SHALL end with `A name a view already has replaces that view.`.

#### Scenario: hovering Save with a filter set

- **WHEN** a filter is ticked and the reader rests on Save
- **THEN** the hint says that a name a view already has replaces that view

### Requirement: A lane stack's label leads with the missing estimate

A lane stack SHALL write `number · no estimate ×N` when none of its N steps is estimated, and
`number · no estimate on M of N` otherwise.

#### Scenario: two unestimated steps at Days

- **WHEN** a leaf's two unestimated steps share one instant and the chart is at Days
- **THEN** its stack label reads `020 · no estimate ×2`, and its visible start after the number is `no e`

### Requirement: The drop line starts where the number will start

An above or below drop line SHALL start at the landing depth's Number-cell indent, capped at
`DEEPEST_INDENT`.

#### Scenario: below a depth-3 row

- **WHEN** a row is dragged below `010.1.1.1`
- **THEN** the line starts within 1 px of that row's number gutter

### Requirement: A pressed toggle is not painted as an action

A pressed toggle SHALL be filled with `--pressed`. That fill SHALL stand at least 3:1 off the
unpressed face and at least 1.5:1 off the primary action's face, in both palettes.

#### Scenario: Plan pressed beside Create new project

- **WHEN** the plan is open at 1440
- **THEN** the pressed Plan and Create new project differ by at least 1.5:1, and Plan and Board by at least 3:1

### Requirement: The phone home card names every project whole

Below 768 px each project in the home card SHALL wrap its whole name, with its last-opened words
under it.

#### Scenario: two imports with one long prefix

- **WHEN** two projects named `Review fixture (imported …) first copy` and `… second copy` are listed at 375×812
- **THEN** each name is drawn whole, unclipped, inside the window

### Requirement: A focus the page returns opens no hint card

After an Export / Import choice the focus SHALL return to the summary without opening its hint
card. A keyboard arrival on the summary SHALL still open it.

#### Scenario: Download JSON

- **WHEN** the reader chooses Download JSON
- **THEN** the summary holds the focus and no hint card is shown half a second later

### Requirement: The grid's Customize editor is whole and reachable

On a desktop viewport the Customize dependency editor SHALL be drawn inside the window, over the
table frame, with every control hit-testable. Its controls SHALL have 6 px corners, and its selects
and outline buttons SHALL have a 3:1 edge.

#### Scenario: a three-row plan at 1440

- **WHEN** the reader opens Customize from the Depends on cell of `030`, in either palette
- **THEN** the editor lies inside the window, a click at Cancel's and Add's centres lands on them, and Cancel returns the focus to the cell's box
