## MODIFIED Requirements

### Requirement: One pointed row, and each face lights the other's answer

The plan SHALL have at most one **pointed row** at a time. The pointer over any
**bar**, **row label** or any point on a Gantt row's own line SHALL point that
row's work item; the pointer over a plan renderer row SHALL point that row's
work item. Pointing SHALL be immediate — no delay on either face — and the
pointer leaving SHALL clear it.

A pointed row SHALL be lit in the Gantt panel, on its **row label** and as a band
across its row, whichever face pointed it.

A pointed row SHALL be lit in the plan renderer, whichever face pointed it. A row
the pointer is resting on there SHALL carry the row light like any other, and
that light SHALL NOT differ by whether the alternating band tints that row.

Every light SHALL be painted in the **row light**, the same tint a hovered Depends
on cell paints the rows it waits for. There SHALL be no second tint.

A pointed row SHALL move nothing: no face scrolls, and no row is brought into
view.

Pointing a Gantt row SHALL NOT open the surface a bar opens. A bar's own hover
SHALL be unchanged: it points its row as it always did, and still opens its
surface after its wait.

Pointing SHALL be render-isolated: a change of the pointed row SHALL NOT
re-render plan renderer rows whose light did not change, and SHALL NOT
re-render the Gantt chart's marks — bars, gridlines, dependency links, carets,
bands or axis. Only the rows gaining or losing the row light, the Gantt light
layer (the pointed band and the label rail) and the shells that route the state
may render.

#### Scenario: hovering a bar lights its row label, its band and its table row

- **WHEN** the pointer rests on a bar on a plan whose rows are all shown
- **THEN** the row label for that bar's work item carries the row light, a band
  is drawn across that work item's Gantt row, and that work item's row in the
  plan renderer carries the row light

#### Scenario: hovering a table row lights its Gantt label and band, and itself

- **WHEN** the pointer rests on a row of the plan renderer
- **THEN** that work item's row label and Gantt row band carry the row light, and
  that row of the plan renderer carries it too

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
