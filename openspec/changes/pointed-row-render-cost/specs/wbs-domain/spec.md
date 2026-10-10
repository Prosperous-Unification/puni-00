## MODIFIED Requirements

### Requirement: Pointing a row never remounts a cell

Pointing a row MAY re-render only the plan renderer rows whose light changes,
and SHALL NOT remount any of its cells. A pointed row SHALL NOT take the focus
from, or discard the half-typed value in, a cell being edited. Pointing SHALL
NOT re-render the Gantt chart's marks — bars, gridlines, dependency links,
carets, alternating bands or axis. Only the rows gaining or losing the row light, the Gantt
light layer (the pointed band and label rail), and state-routing shells MAY
re-render.

#### Scenario: an open editor survives the pointer crossing the chart

- **WHEN** a cell is being edited with a value typed into it but not committed,
  and the pointer then crosses several bars on the Gantt panel
- **THEN** the cell still holds the focus and still holds the typed value

#### Scenario: pointing a row re-renders no unrelated row

- **WHEN** the chart points a row of a plan whose rows are all shown, and then
  points a different row
- **THEN** between the two pointings, plan renderer cells render only for the
  rows whose light changed — the row lit and the row unlit — and for no other
  row

#### Scenario: pointing a row re-renders no Gantt mark

- **WHEN** a plan renderer row is pointed, and then a different row is pointed
- **THEN** between the two pointings no bar, gridline, dependency link, caret,
  zebra band or axis cell of the Gantt chart renders again — only the pointed
  band and the label rail answer the change

#### Scenario: the light still lands after the isolation

- **WHEN** the pointer crosses from a plan renderer row onto the Gantt chart's
  line for a different row
- **THEN** the table's light moves off the left row, the chart's band and label
  light the row under the pointer, and the table row of that same work item
  carries the row light
