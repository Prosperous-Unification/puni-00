## ADDED Requirements

### Requirement: One resolved frame layout answers every width question

Every width the table declares SHALL come from one object resolved once per
render from the columns on screen and the plan being drawn — the `<colgroup>`'s
declared widths, the table's own minimum, the folded minimum the Phases dialog
quotes, and the offset each pinned column is held at. No consumer SHALL keep a
width of its own, and the pinned offsets SHALL be derived from the same
resolution rather than computed once when the module loads.

The resolution SHALL take two things and no more: the ids of the leaf columns
being laid out, in order, and one **frame layout state** — every fact about the
plan a width is allowed to depend on, in one object, so that a later fact is
added to that object rather than as a third argument some consumer forgets to
pass. Today the state holds one fact: whether any row in the project sets an
earliest start.

The folded minimum SHALL be resolved from the project's **real** role columns —
the ids the table would render for those roles — and not from stand-in ids
invented for the count. A width that can be resolved per column id is a width
that can differ per role, and a figure summed from invented ids would answer
about columns that do not exist while the table lays out the ones that do.

A width MAY therefore depend on the plan on screen. The two guards that exist
today SHALL survive that: an id nothing declares SHALL remain an error rather
than a plausible default, and a pinned column sitting behind a flexible one
SHALL remain an error, because a sticky offset is a sum of the widths in front
of it and a flexible column has none.

Column definitions SHALL NOT carry widths. The table's cells are rebuilt when
their definitions are, and a rebuild takes the focus and the half-typed value
with it — so a width that changes SHALL change the resolved layout and nothing
else.

#### Scenario: the colgroup and the minimum agree

- **WHEN** a plan is drawn in any state of folding
- **THEN** the width each `<col>` declares and the table's `min-width` are the
  numbers the resolved layout holds for exactly those columns

#### Scenario: the Phases dialog quotes the same arithmetic

- **WHEN** the Phases dialog says how wide a plan with four phases would be
- **THEN** the figure is the resolved layout's folded minimum for those four
  roles' own folded columns, resolved by the roles' real ids, and not a second
  sum

#### Scenario: a width that depends on the plan reaches the pinned offsets

- **WHEN** a column in front of a pinned one is resolved to a different width
  for this plan than for another
- **THEN** that pinned column is held at an offset carrying the new width

#### Scenario: a column nobody sized

- **WHEN** a column id that is neither declared nor flexible is resolved
- **THEN** the layout refuses it rather than giving it a width

#### Scenario: a pinned column behind a flexible one

- **WHEN** a column is pinned after the flexible name column
- **THEN** resolving the layout refuses, rather than summing a width that does
  not exist

### Requirement: A day is printed as somebody reads one

A calendar day the table shows SHALL be printed as the day and the abbreviated
month — `1 Jun` — and SHALL carry the year when that year is not the current
one: `1 Jun 2027`. The full `YYYY-MM-DD` SHALL stay available in the cell's
`title`, so nothing that was readable becomes unreadable.

Two formatters SHALL do this, and they SHALL NOT be one: a project's dates are
calendar days with no time and no zone, and an instant is an epoch millisecond.
The calendar-day formatter SHALL read the year, month and day out of the
`YYYY-MM-DD` string itself and MUST NOT parse it into a moment, because parsing
shifts the day for a reader west of UTC. The instant formatter SHALL print in
the browser's own zone — the product has no display-timezone concept, and that
is the stated cost.

The plan's existing fallbacks SHALL be untouched: a project with no start date
still prints workday offsets rather than dates, a schedule that could not be
computed still prints an em-dash, and the marker on an unestimated finish still
follows the figure.

#### Scenario: a day in the current year

- **GIVEN** today is in 2026
- **WHEN** `2026-06-01` is printed
- **THEN** it reads `1 Jun`

#### Scenario: a day in another year

- **GIVEN** today is in 2026
- **WHEN** `2027-06-01` is printed
- **THEN** it reads `1 Jun 2027`

#### Scenario: 31 December and 1 January

- **GIVEN** today is in 2026
- **WHEN** `2026-12-31` and `2027-01-01` are printed
- **THEN** they read `31 Dec` and `1 Jan 2027`

#### Scenario: a reader west of UTC

- **GIVEN** a browser whose zone is behind UTC
- **WHEN** `2026-06-01` is printed as a calendar day
- **THEN** it reads `1 Jun`, not the day before

#### Scenario: the full date is still there

- **WHEN** a date cell is inspected
- **THEN** its `title` carries the full `YYYY-MM-DD`

#### Scenario: an instant

- **GIVEN** today is in 2026
- **WHEN** the moment a project was created, held as epoch milliseconds, is
  printed
- **THEN** it reads as that day in the browser's zone, with the year only when
  it is not 2026

#### Scenario: no project start date

- **WHEN** a plan with no start date is drawn
- **THEN** Start and End still print workday offsets, unchanged

#### Scenario: an unestimated finish

- **WHEN** a work item with no estimate is drawn on a computed schedule
- **THEN** its End still carries the marker that says the figure is a guess

### Requirement: The earliest-start column is text until somebody edits it

A row's earliest-start day SHALL be shown as text at rest — the short date, or
an em-dash where the row sets no day — and the date editor SHALL be mounted only
for the cell being edited. At most one editor SHALL exist on the page at a time.

A plan with no project start date SHALL keep the column as a rendered disabled
state that says why in its `title`: without a start date there is no day zero
and be-01 ignores the constraint. It SHALL NOT be an editor that opens onto
nothing.

The cell SHALL remain a cell of the keyboard grid on the terms it already has:
it carries its `data-cell`, the table's own Tab handling still takes Tab from
it, and a disabled column is still left out of the grid.

#### Scenario: a row with a day

- **WHEN** a plan is drawn with a row whose earliest start is `2026-06-01`
- **THEN** that cell reads `1 Jun` and holds no date input

#### Scenario: a row with no day

- **WHEN** a row sets no earliest start
- **THEN** its cell reads as an em-dash

#### Scenario: one editor at a time

- **WHEN** one row's earliest-start cell is opened for editing and then another
  is
- **THEN** exactly one date input is on the page, in the second row

#### Scenario: no project start date

- **WHEN** a plan with no start date is drawn
- **THEN** the column offers no editor and says in its `title` that the project
  start date has to be set first

### Requirement: A date edit is committed on the way out, or abandoned on purpose

The date editor SHALL declare how an edit ends, and every way out SHALL be one
of two answers: the day in the box is committed, or the edit is abandoned.
Enter SHALL commit and close. Leaving the field SHALL commit and close. Escape
SHALL close without committing, and the blur that follows it MUST NOT commit
the abandoned value.

Closing SHALL return the focus to the cell that was being edited, so a keyboard
is where it was rather than at the top of the page.

A refetch arriving while a cell is being edited SHALL follow the rule the grid
already keeps for a draft: what is in the box is not overwritten by what the
server says, and the reader's own edit still decides.

Everything the editor already guarantees SHALL still hold: nothing is committed
while the field has the focus, a value equal to the last one agreed with the
server is not sent again, and a half-typed date left behind does not clear the
day the row had.

#### Scenario: Enter commits

- **WHEN** a day is typed into an open earliest-start editor and Enter is
  pressed
- **THEN** the row's earliest start is set to that day and the editor closes

#### Scenario: leaving commits

- **WHEN** a day is typed and the field is left without Enter
- **THEN** the row's earliest start is set to that day and the editor closes

#### Scenario: Escape abandons

- **GIVEN** a row whose earliest start is `2026-06-01`
- **WHEN** `2026-07-01` is typed into its editor and Escape is pressed
- **THEN** the editor closes, the row still holds `2026-06-01`, and nothing is
  sent — including by the blur that Escape causes

#### Scenario: the focus comes back

- **WHEN** an editor is closed by Enter, by Escape, or by leaving
- **THEN** the focus is on the cell that was being edited

#### Scenario: a peer edit lands mid-edit

- **WHEN** a refetch arrives while a day is half-typed
- **THEN** the half-typed day stands, exactly as a half-typed name does

### Requirement: The earliest-start column is as narrow as the plan lets it be

The earliest-start column SHALL be laid out at 84px while any row in the project
sets a day, and at 56px when no row in it does — the question being asked of the
whole plan, not of the rows currently shown, so scrolling and searching cannot
change a column's width underneath a reader. Its heading SHALL abbreviate and
SHALL carry the full sentence in its `title`.

When an editor is open in that column, the native date input SHALL still be laid
out at no less than the width this browser gives an unconstrained one — the
platform's number, measured, not this repository's to choose. The editor SHALL
escape the cell through the table's popover clip-exemption (the documented
route for content wider than its cell) rather than widening the column: a
column that grows mid-edit moves every cell under the typist. (Dany's open
point, resolved 2026-08-09.)

#### Scenario: a plan where somebody set a day

- **WHEN** a plan with at least one earliest-start day is drawn
- **THEN** the column is 84px wide

#### Scenario: a plan where nobody did

- **WHEN** a plan where no row sets an earliest start is drawn
- **THEN** the column is 56px wide

#### Scenario: the row that sets a day is scrolled out of sight

- **GIVEN** a plan whose only earliest-start day is on a collapsed or filtered-out row
- **WHEN** the plan is drawn
- **THEN** the column is still 84px wide

#### Scenario: the editor still fits the browser's own field

- **WHEN** an earliest-start cell is opened for editing
- **THEN** the date input is at least as wide as this browser lays an
  unconstrained one out, so no part of the day is cut off

### Requirement: The Number column fits a stated envelope, not every number

There is no longest work item number, so the column SHALL NOT be sized to one.
be-01 widens a sibling label with the size of its group, adds a dotted segment
for every level of depth, and appends a digit each time a work item is inserted
against a frozen anchor that leaves no natural label free — the last of these
has no bound at all.

The column SHALL instead declare a **display envelope** and be sized to that:
eleven characters — a root label's agreed three, plus one dotted
single-character segment for each level down to the deepest indent the column
allows — drawn at that deepest indent, beside the row's expander and its
frozen-number lock. The width SHALL be what a browser measures that envelope to
need, and SHALL NOT be a figure chosen by reading the markup.

A number past the envelope SHALL be truncated rather than widen the column: a
column whose width followed its longest number would move every row in the
table when one deep row is inserted. The full number SHALL be carried in the
cell's `title`, so a number the envelope cannot hold is still readable — the
same bargain the short dates make.

#### Scenario: the envelope is measured

- **GIVEN** a row at the deepest indent the column allows, whose number is
  frozen and fills the envelope
- **WHEN** that row is drawn in a browser
- **THEN** the Number column's declared width is at least what the cell's
  content needs, and its number, expander and lock are all fully visible

#### Scenario: too narrow is seen

- **WHEN** the Number column is declared narrower than that envelope needs
- **THEN** the browser test fails

#### Scenario: a number past the envelope

- **GIVEN** a work item whose number is longer than the envelope — a group past
  nine siblings, or an anchor inserted against enough times
- **WHEN** its row is drawn
- **THEN** the column is still its declared width, the number is clipped rather
  than wrapped, and the cell's `title` carries the number whole

### Requirement: Cards print the dates the columns print

The outline cards SHALL show a work item's dates in the same form the table's
columns do. One plan read on a phone and on a laptop SHALL NOT disagree about
how a day is written.

#### Scenario: the same day on both renderers

- **WHEN** a work item starting `2026-06-01` is drawn as a card
- **THEN** its span reads `1 Jun`, the same as the table's Start column

#### Scenario: no project start date, on a card

- **WHEN** a plan with no start date is drawn as cards
- **THEN** the cards print workday offsets, the same as the columns
