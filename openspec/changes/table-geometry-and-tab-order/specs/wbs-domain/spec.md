## ADDED Requirements

### Requirement: One declared width per column, and the table laid out by it

Every column the table can show SHALL have exactly one declared width, and the
rendered table SHALL be laid out by those widths: a `<colgroup>` declaring the
width of each visible leaf column, `table-layout: fixed`, and a table width
equal to the sum of the columns on screen. The offsets the pinned columns are
held at SHALL be prefix sums of the same widths. Asking for the width of a
column id nothing declares SHALL be an error, never a fallback width.

#### Scenario: the colgroup describes the columns on screen

- **WHEN** the table is rendered
- **THEN** it declares one width per visible leaf column, in the order those
  columns are rendered, and the table's own width is their total

#### Scenario: a column nobody sized

- **WHEN** a width is asked for by an id the width table has never heard of
- **THEN** it throws `UnknownColumnError` rather than returning a plausible
  number

#### Scenario: the pinned offsets and the layout agree

- **WHEN** the pinned columns' offsets are computed
- **THEN** each is the sum of the declared widths of the columns in front of
  it, from the same table the `<colgroup>` is rendered from

### Requirement: Nothing paints outside the cell it belongs to

No control in a cell SHALL assert a width of its own: each SHALL be the width
of the cell it sits in. Every cell SHALL clip what overruns it. Content that
must leave a cell — the dependency listbox, the notes preview — SHALL be
absolutely positioned inside a wrapper that does not clip, and SHALL still open
over the rows.

#### Scenario: a long name in a narrow column

- **WHEN** a work item's name is longer than the Name column is wide
- **THEN** the name wraps inside the cell and no part of it is laid out over
  the column beside it

#### Scenario: a picker on a scrolled table

- **WHEN** the dependency picker is opened
- **THEN** its list is readable over the rows below and over a pinned column

### Requirement: The identity columns stay where they are declared to sit

While the table is scrolled sideways, the drag handle, Number and Name SHALL
remain at their declared offsets from the frame's left edge, and the pixel
immediately to the right of the pinned block SHALL belong to a column that is
not pinned.

#### Scenario: scrolled out to the schedule

- **WHEN** the frame is scrolled 400px to the right
- **THEN** the three identity columns are still at 0, 28 and 196 from the
  frame's edge, and the row scrolling behind them is not visible through them

### Requirement: Tab moves between fields from every cell

Tab SHALL move the focus to the next editable cell and Shift+Tab to the
previous one, from any cell of the table — estimates, notes, the dependency
box, the team and assignee pickers, and the earliest-start date included — with
the target's text selected the way a browser's own Tab leaves a field. Cells
that cannot be typed into, being read-only or disabled, SHALL be stepped over.
At the edge of the grid the key SHALL be left to the browser. In the Name cell,
with the caret at position zero and nothing selected, Tab SHALL still indent
and Shift+Tab outdent.

#### Scenario: walking a row

- **WHEN** Tab is pressed repeatedly from a name whose caret is not at the
  start
- **THEN** the focus visits every editable cell of that row in the order the
  DOM has them, and then the first cell of the row below

#### Scenario: a parent's rolled-up figures

- **WHEN** Tab reaches a row whose estimates are sums of the rows beneath it
- **THEN** those figures are stepped over, because nothing can be typed into
  them

#### Scenario: leaving the dependency box

- **WHEN** Tab is pressed in the dependency box with a search half typed
- **THEN** the focus moves on and the typed search is discarded, adding no
  dependency

#### Scenario: the outliner reflex is kept

- **WHEN** the caret sits at position zero of a name and Tab is pressed
- **THEN** the row indents, exactly as before

### Requirement: A browser measures the table on every push

CI SHALL run one chromium against the real be-01, gw-01 and fe-01 stack, seed a
plan through the UI, and assert the table's geometry from measured bounding
boxes: no two cells of a row on top of each other while unscrolled, every
control inside its own cell, the pinned columns at their declared offsets both
before and after a horizontal scroll, and the ownership of the pixels either
side of the pinned block's right edge. The run SHALL upload a screenshot of the
table whether it passed or failed.

#### Scenario: a control that overruns its column

- **WHEN** a control in a cell is laid out wider than the column it is in
- **THEN** the layout gate fails, naming the control and the column

#### Scenario: offsets computed from widths the browser did not use

- **WHEN** a pinned column's offset is computed from a width the `<colgroup>`
  does not declare
- **THEN** the layout gate fails on two cells of a row being on top of each
  other, unscrolled

#### Scenario: the picture of the run

- **WHEN** the layout gate finishes, having passed or failed
- **THEN** a screenshot of the table is uploaded with the run
