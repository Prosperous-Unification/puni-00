## ADDED Requirements

### Requirement: The plan and its chart are one scrolling surface

The plan renderer and the Gantt panel SHALL show the same row first. Scrolling
either one vertically SHALL bring the other to the row it is showing, whichever
was scrolled and however it was scrolled — a wheel, a drag of a scrollbar, or a
keyboard walk that carries the focus out of view.

The two faces SHALL be paired row for row: the row the panel draws at a position
is the row the renderer draws at that position. Where they disagree, neither
SHALL be moved.

Neither face SHALL move the other sideways. The renderer's horizontal position
is which columns are on screen and the panel's is which part of the calendar is,
and they are different facts.

The link SHALL NOT move the focus, and SHALL NOT take the focus out of a cell
that has it.

#### Scenario: scrolling the plan

- **GIVEN** a plan taller than its frame with the chart open
- **WHEN** the plan is scrolled down eight rows
- **THEN** the chart is showing the same row under its axis as the plan is
  showing under its heading

#### Scenario: scrolling the chart

- **GIVEN** a plan taller than its frame with the chart open
- **WHEN** the chart is scrolled down five rows
- **THEN** the plan is showing that row first

#### Scenario: walking the keyboard past the fold

- **GIVEN** the focus is in the first row's name cell and the chart is open
- **WHEN** the focus is walked down fifteen rows
- **THEN** the chart is showing the row the plan is, and the focus is still in
  the cell the walk reached

#### Scenario: an unfolded role scrolled sideways

- **GIVEN** a role unfolded and the frame scrolled sideways
- **WHEN** the plan is scrolled down
- **THEN** the chart follows to the row, the frame keeps the columns it was
  scrolled to, and the chart's calendar has not moved sideways

### Requirement: The frame is as tall as its rows and no taller

The frame the plan scrolls in SHALL take no more height than its own content
asks for, and SHALL take no more than what is left of the window. The Gantt
panel SHALL sit directly under it, so a plan shorter than the window leaves its
white space under the chart rather than between the plan and the chart.

A plan taller than the remainder SHALL still be given the whole remainder, SHALL
still scroll inside the frame, and SHALL NOT scroll the page.

A card opened from a cell SHALL be sized to the room its own scroll container
leaves it, not to the room the window leaves it.

#### Scenario: a plan of three rows with the chart open

- **WHEN** a three-row plan is shown with the chart open in a 900px window
- **THEN** what stands between the last row and the chart is the frame's picker
  room and its floor, and the space the chart is not using is below it

#### Scenario: a plan that fills the window

- **WHEN** a twenty-three-row plan is shown with the chart open in a 900px window
- **THEN** the chart ends at the bottom of the window, the frame ends where the
  chart begins, and the page does not scroll

#### Scenario: a long note on a short plan

- **GIVEN** a three-row plan and a note taller than the room under its row
- **WHEN** the note's preview is opened
- **THEN** the preview is inside the frame and scrolls its own content
