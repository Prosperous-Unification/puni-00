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

#### Scenario: hovering a bar lights its row label, its band and its table row

- **WHEN** the pointer rests on a bar on a plan whose rows are all shown
- **THEN** the row label for that bar's work item carries the row light, a band
  is drawn across that work item's Gantt row, and that work item's row in the
  plan renderer carries the row light

#### Scenario: hovering a table row lights its Gantt label and band, and itself

- **WHEN** the pointer rests on a row of the plan renderer
- **THEN** that work item's row label and Gantt row band carry the row light, and
  that row of the plan renderer carries it too

#### Scenario: an alternating row lights the same colour as an unbanded one

- **WHEN** the pointer rests on a row of the plan renderer that the alternating
  band tints, and then on one the band does not
- **THEN** both rows are painted the same colour while pointed

#### Scenario: the empty part of a Gantt row points that row

- **GIVEN** a Gantt row whose bar ends well short of the chart's right edge
- **WHEN** the pointer rests on that row's line past the end of its bar
- **THEN** that work item's row label, Gantt band and plan renderer row all carry
  the row light, and no bar surface is opened

#### Scenario: a row nobody has estimated still points

- **GIVEN** a work item with no estimate, so its Gantt row draws no bar
- **WHEN** the pointer rests on that row's line in the chart
- **THEN** that work item is the pointed row on both faces

#### Scenario: the light moves rather than accumulating

- **WHEN** the pointer moves from one bar to a bar on a different row
- **THEN** exactly one row is lit, and it is the second bar's

#### Scenario: leaving clears the light

- **WHEN** the pointer leaves the chart without arriving on a row of the plan
  renderer
- **THEN** no row on either face is lit

#### Scenario: a bar's other roles are not lit

- **WHEN** a work item is estimated for two roles, so its row draws two bars, and
  the pointer rests on the first of them
- **THEN** the row is lit on both faces and the second bar is drawn exactly as it
  is drawn with nothing pointed
