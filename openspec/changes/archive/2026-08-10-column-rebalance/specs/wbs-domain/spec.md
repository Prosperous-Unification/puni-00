## ADDED Requirements

### Requirement: The Start and End columns fit a printed day on one line

The Start and End columns SHALL be laid out at a width that holds the day they
print on one line. A short date that wraps is the failure this requirement
exists for: at 52px `29 Sep` wrapped onto two lines and `29 Sep 2027` onto
three, and a wrapped date makes its row taller than every other row on the
plan.

The width SHALL be what a browser measures the **widest day either column can
print**, plus the cell's own padding — never a figure read off the markup. The
widest day is the formatter's own output, not a hand-picked string: two digits
of day, the widest of the twelve month names, and a year, because the year is
printed whenever it is not the reader's current one. End prints one thing more
— the marker that says its figure is a guess on an unestimated row — and that
marker is inside the envelope, because a marker that wraps is the same failure
as a date that wraps.

Both columns SHALL be laid out at that one width. The two ends of one span are
read against each other, and the wider of the two decides the pair.

The `title` SHALL be untouched: the full `YYYY-MM-DD` on Start, and on End the
same day with the no-estimate sentence beside it. Nothing that was readable
becomes unreadable, and nothing that was readable becomes redundant.

A width stored by a drag SHALL still outrank this default, exactly as "An
override outranks the width the table resolves" says: a reader who narrowed
Start last week keeps the column they chose, and the reset of "Resetting
forgets the widths rather than freezing them" is the route to the new default.
That is the contract, not a bug to be fixed by clearing anybody's storage.

#### Scenario: a dated plan on a laptop

- **WHEN** a plan whose days fall in a year that is not the current one is drawn
- **THEN** each Start cell and each End cell draws its day as a single line

#### Scenario: the widest day the formatter can print

- **GIVEN** every day the table can print, as the formatter prints it
- **WHEN** the widest of them is measured in a Start cell, with End's
  no-estimate marker after it
- **THEN** the width both columns declare is at least that measurement plus the
  cell's padding

#### Scenario: too narrow is seen

- **WHEN** either column is declared narrower than that measurement
- **THEN** the browser test fails, because the cell draws its day on more than
  one line

#### Scenario: an unestimated row's End

- **WHEN** a row with no estimate is drawn on a computed schedule in a plan
  dated off the current year
- **THEN** its End cell reads the day and the marker on one line

#### Scenario: the full day is still there

- **WHEN** a Start or End cell is inspected
- **THEN** its `title` carries the full `YYYY-MM-DD`

#### Scenario: a column somebody has already dragged

- **GIVEN** a stored width for Start from before this change
- **WHEN** the project is opened
- **THEN** Start is laid out at the stored width, and resetting the widths lays
  it out at the new default

## MODIFIED Requirements

### Requirement: The Number column fits a stated envelope, not every number

There is no longest work item number, so the column SHALL NOT be sized to one.
be-01 widens a sibling label with the size of its group, adds a dotted segment
for every level of depth, and appends a digit each time a work item is inserted
against a frozen anchor that leaves no natural label free — the last of these
has no bound at all.

The column SHALL instead declare a **display envelope** and be sized to that:
**two levels of number — a root label's agreed three characters plus one dotted
single-character segment — drawn at the indent a row of that depth is drawn
at**, beside the row's expander and its frozen-number lock. The width SHALL be
what a browser measures that envelope to need, and SHALL NOT be a figure chosen
by reading the markup.

The envelope is an undertaking about what the column shows whole, not a
description of the deepest row: a row further down the tree is drawn at a
deeper indent and its number is longer, so **more of it is clipped the deeper
it sits** — at the deepest indent the column allows, the indent, the expander
and the lock take nearly the whole cell. The `title` is what carries the number
there, and it always has.

A number past the envelope SHALL be truncated rather than widen the column: a
column whose width followed its longest number would move every row in the
table when one deep row is inserted. The full number SHALL be carried in the
cell's `title`, so a number the envelope cannot hold is still readable — the
same bargain the short dates make.

#### Scenario: the envelope is measured

- **GIVEN** a row whose number is two levels deep, drawn at that depth's
  indent, whose number is frozen and which has children
- **WHEN** that row is drawn in a browser
- **THEN** the Number column's declared width is at least what the cell's
  content needs, and its number, expander and lock are all fully visible

#### Scenario: too narrow is seen

- **WHEN** the Number column is declared narrower than that envelope needs
- **THEN** the browser test fails

#### Scenario: a number past the envelope

- **GIVEN** a work item deeper than the envelope's two levels — or a group past
  nine siblings, or an anchor inserted against enough times
- **WHEN** its row is drawn
- **THEN** the column is still its declared width, the number is clipped rather
  than wrapped, and the cell's `title` carries the number whole
