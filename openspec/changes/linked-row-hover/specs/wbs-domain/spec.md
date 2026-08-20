## ADDED Requirements

### Requirement: One pointed row, and each face lights the other's answer

The plan SHALL have at most one **pointed row** at a time. The pointer over any
**bar** or **row label** SHALL point that mark's work item; the pointer over a
plan renderer row SHALL point that row's work item. Pointing SHALL be immediate —
no delay on either face — and the pointer leaving SHALL clear it.

A pointed row SHALL be lit in the Gantt panel, on its **row label** and as a band
across its row, whichever face pointed it.

A pointed row SHALL be lit in the plan renderer **only when the Gantt panel is
what pointed it**. A row the pointer is resting on in the plan renderer SHALL NOT
carry the pointed row's light: that row is already tinted as the row under the
pointer, a second tint there says nothing further, and it MUST NOT displace the
tint an alternating row shows under the pointer.

Every light SHALL be painted in the **row light**, the same tint a hovered Depends
on cell paints the rows it waits for. There SHALL be no second tint.

A pointed row SHALL move nothing: no face scrolls, and no row is brought into
view.

#### Scenario: hovering a bar lights its row label, its band and its table row

- **WHEN** the pointer rests on a bar on a plan whose rows are all shown
- **THEN** the row label for that bar's work item carries the row light, a band
  is drawn across that work item's Gantt row, and that work item's row in the
  plan renderer carries the row light

#### Scenario: hovering a table row lights its Gantt label and band, and not itself

- **WHEN** the pointer rests on a row of the plan renderer
- **THEN** that work item's row label and Gantt row band carry the row light, and
  no row of the plan renderer carries it

#### Scenario: an alternating row still moves under the pointer

- **WHEN** the pointer rests on a row of the plan renderer that the alternating
  band tints, and then on one the band does not
- **THEN** each row moves away from its resting colour by the same amount

#### Scenario: the light moves rather than accumulating

- **WHEN** the pointer moves from one bar to a bar on a different row
- **THEN** exactly one row is lit, and it is the second bar's

#### Scenario: leaving clears the light

- **WHEN** the pointer leaves the bar it was resting on without arriving on
  another bar or row
- **THEN** no row on either face is lit

#### Scenario: a bar's other roles are not lit

- **WHEN** a work item is estimated for two roles, so its row draws two bars, and
  the pointer rests on the first of them
- **THEN** the row is lit on both faces and the second bar is drawn exactly as it
  is drawn with nothing pointed

#### Scenario: pointing scrolls nothing

- **WHEN** the pointer rests on a bar whose work item's plan renderer row is
  scrolled out of view
- **THEN** neither face has scrolled, and the row label and band are lit

### Requirement: A bar's focus points its row, and the pointer outranks it

A bar holding the keyboard focus SHALL point its work item's row, by the three
lights above and with no delay. Where a bar holds the focus and the pointer rests
on a different row at the same time, the **pointer's** row SHALL be the pointed
one.

#### Scenario: focusing a bar lights its row

- **WHEN** a bar takes the keyboard focus with the pointer resting nowhere on
  either face
- **THEN** that bar's work item is the pointed row

#### Scenario: the pointer wins while both are live

- **WHEN** one bar holds the keyboard focus and the pointer rests on a different
  work item's bar
- **THEN** the pointer's work item is the pointed row and the focused bar's is
  not

#### Scenario: losing the pointer falls back to the focus

- **WHEN** a bar holds the focus, the pointer rests on a different work item's
  bar, and the pointer then leaves that bar
- **THEN** the focused bar's work item is the pointed row

### Requirement: The row light outranks the alternating band

A pointed row SHALL be painted in the row light whether it is an odd or an even
row of the plan renderer. A row's alternating band SHALL NOT paint over the row
light, including where the pointer rests on the very row a focused bar has
pointed.

#### Scenario: an even row keeps the row light under the pointer

- **WHEN** a bar takes the keyboard focus and the pointer then rests on that same
  work item's row in the plan renderer, and that row is one the alternating band
  tints
- **THEN** that row is painted in the row light, and not in the banded hover
  colour

#### Scenario: both stripes are painted one colour

- **WHEN** the same is done to a row the alternating band does not tint
- **THEN** that row is painted the same colour as the banded row above

### Requirement: A row with no bars is still pointable

A work item the Gantt panel draws no bar for SHALL still be a pointable row —
nobody has estimated it, or it has no role, and either way its row label and its
Gantt row band SHALL light from its plan renderer row, and its plan renderer row
SHALL light from its row label.

#### Scenario: an unestimated row lights across both faces

- **WHEN** the pointer rests on the plan renderer row of a work item no role has
  been estimated for
- **THEN** that work item's row label and Gantt row band carry the row light

#### Scenario: a row label points its own row

- **WHEN** the pointer rests on the row label of a work item the panel draws no
  bar for
- **THEN** that work item is the pointed row

### Requirement: Pointing a row never remounts a cell

Pointing a row MAY re-render the plan renderer and SHALL NOT remount any of its
cells. A pointed row SHALL NOT take the focus from, or discard the half-typed
value in, a cell being edited.

#### Scenario: an open editor survives the pointer crossing the chart

- **WHEN** a cell is being edited with a value typed into it but not committed,
  and the pointer then crosses several bars on the Gantt panel
- **THEN** the cell still holds the focus and still holds the typed value
