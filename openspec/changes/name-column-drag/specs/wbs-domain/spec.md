## ADDED Requirements

### Requirement: The Name column takes a dragged width, and the viewport keeps the slack

The flexible column SHALL carry a resize handle and be draggable like any sized
column. Dragging it SHALL set a **column width override** stored under the
column's own id, in the same store and under the same claim-reading rules as
every other column's — one key, one sanitizer, one reset.

This supersedes, **by name**, `column-widths-drag`'s decision "Name stays the
flexible column" (its proposal entry, and the clause "The flexible column SHALL
NOT be draggable and SHALL NOT carry a handle" of its requirement "A column
with a declared width can be dragged to another width" — replaced in full
below). Confirmed by Dany, 2026-08-10 (plan
`docs/plans/2026-08-10-ux-batch-and-roadmap.md`, U1 and Answers).

The flexible column's bounds are its own: floor `FLEXIBLE_FLOOR` (200px) — the
same constant the cell's `min-width` and the table minimum already budget, so
the two width systems cannot disagree — and the shared ceiling `WIDEST_COLUMN`
(600px). The drag clamp and the stored-width check SHALL read the same
constants.

`floorFor` SHALL answer the flexible column with an explicit flexible arm
returning `FLEXIBLE_FLOOR` — not the `min(default, NARROWEST_COLUMN)` path,
which would yield 36 and put it in disagreement with the cell's declared floor.
This deliberately **retires the shipped negative** "refuses the flexible column
a width and a floor alike, override or not" (`column-widths-drag/verify.md`,
failure-proof row 4): its injected fault — exactly this arm — is adopted as the
behaviour, and the test SHALL flip from proving refusal to proving the resolved
floor.

A flexible column with **no** override SHALL still resolve no width: asking
`widthFor` about it SHALL keep throwing, because a sentinel would let the
pinned-offset arithmetic add a number the browser never uses. With an override,
the frame layout SHALL resolve it before consulting the flexible set, and the
table minimum SHALL count the override in place of `FLEXIBLE_FLOOR` — the
folded table minimum the Phases dialog quotes moving with it. A column pinned
behind the flexible one SHALL stay refused, override or not: the flexible
column keeps absorbing viewport excess, so its laid-out width is not a number
an offset may be summed from.

While the override is in force the `<col>` for the flexible column SHALL stay
unsized; the dragged width SHALL be declared as `width` and `min-width` on the
Name cells themselves. Viewport excess above the table minimum SHALL keep
landing on Name alone: the other columns' envelopes — Number's 93px, the
dates' 114 — MUST NOT move with the viewport. Below the table minimum the
frame scrolls and Name is laid out at the override itself.

A drag SHALL NOT rebuild the table's column definitions, exactly as for every
other column.

#### Scenario: dragging the Name column below the table minimum

- **GIVEN** a viewport narrower than the table's minimum, where Name stands at
  its 200px floor
- **WHEN** Name's header handle is dragged 60px to the right
- **THEN** Name is laid out 60px wider, the table's minimum width has grown by
  60, and the pinned offsets in front of it are unchanged — Name is the last
  pinned column, so no offset ever sums it

#### Scenario: the slack still lands on Name and nothing else

- **GIVEN** Name overridden to a width, at a viewport wider than the table's
  minimum
- **WHEN** the columns are measured
- **THEN** Number is on its 93px envelope, both date columns are at 114, the
  `<col>` for Name declares no width, and Name is laid out at the frame's
  width minus the sized columns — at least the override, never less

#### Scenario: Name's floor and ceiling

- **WHEN** Name's handle is dragged far to the left, and then far to the right
- **THEN** it stops at 200px one way and 600px the other — the flexible floor
  and the one shared ceiling

#### Scenario: a stored Name entry is a claim with Name's own bounds

- **GIVEN** stored widths naming `name` at 300, a second store naming it at
  150, and a third at 1e9
- **WHEN** the project is opened against each
- **THEN** 300 applies to the Name cells, and 150 and 1e9 are each dropped on
  their own — outside `[FLEXIBLE_FLOOR, WIDEST_COLUMN]` — with the entries
  beside them still applying

#### Scenario: an undragged Name is still the flexible column

- **GIVEN** a project where Name has never been dragged
- **WHEN** the table is laid out
- **THEN** Name declares no width anywhere, takes what the other columns
  leave, and asking the width table for its width is still an error

#### Scenario: one reset returns the whole layout, Name included

- **GIVEN** Name and Number both dragged
- **WHEN** the layout reset is pressed
- **THEN** the stored key is forgotten — never snapshotted — and Name returns
  to the flexible remainder while Number returns to its resolved default

## MODIFIED Requirements

<!--
The header below is `column-widths-drag`'s. That change is complete but not yet
archived (its 7.2 "Dany looks" sign-off is Lane B's to drive), so this delta
modifies a requirement that still lives in `openspec/changes/column-widths-drag/
specs/wbs-domain/spec.md` — the same posture `gantt-bar-hover` took toward
`gantt-calendar-axis`. A MODIFIED block is applied by full-text replacement:
everything below survives, and in particular the paragraph "The flexible column
SHALL NOT be draggable and SHALL NOT carry a handle" and the scenario "the Name
column offers no handle" do not.
-->

### Requirement: A column with a declared width can be dragged to another width

Every column the table renders SHALL carry a resize handle on its header's
trailing edge, and dragging that handle SHALL set a **column width override**
for it. The overrides in force SHALL be carried in the frame layout state — the
one object the frame layout already takes every plan-dependent fact in — and
resolved inside the frame layout, so the `<colgroup>`, the table minimum width,
the folded table minimum width and the pinned offsets all move together: a
resized column MUST NOT be laid out at one width while an offset is summed from
another.

An override SHALL be stored and looked up under the column's **own** id — the
id the table renders that column by, `<roleId>-final` for a folded role — and
every consumer of the frame layout SHALL therefore ask about real column ids.
A figure quoted for stand-in ids invented from a count, as the folded table
minimum once was, would answer about columns no override can ever be stored
for.

The **flexible column**'s handle SHALL start its gesture from the width the
browser really laid the column out at — captured once, at the start of the
gesture, from the header cell itself — because with no override in force there
is no resolved width to count from. Every other column's gesture SHALL keep
counting from the resolved width, measured never.

A drag SHALL clamp the width to a floor of 36px, or to the column's own
resolved default where that default is already narrower — and for the flexible
column to its own `FLEXIBLE_FLOOR` — and to a ceiling of **600px**. That
ceiling SHALL be one named constant declared beside the widths themselves and
read by both the drag and the stored-width check, so no drag can produce a
width a reload would reject. 600 is three times the flexible column's own floor
and most of a 900px window: a column dragged past it is a gesture that got
away, not a preference. A column MUST NOT be draggable to a width no stored
value would be accepted at.

Dragging SHALL NOT rebuild the table's column definitions. A width MUST NOT
enter a column definition, because rebuilding them remounts every cell and
takes the focus and any half-typed value with it.

#### Scenario: dragging a fixed column wider

- **GIVEN** the Number column at its resolved default
- **WHEN** its header handle is dragged 40px to the right
- **THEN** the column is laid out 40px wider, the table's minimum width has
  grown by 40, and every pinned column after it sits 40px further from the
  left edge

#### Scenario: every column offers a handle, the Name column included

- **WHEN** the header row is read
- **THEN** every rendered column has a resize handle — the Name column's the
  one whose gesture starts from a measured width rather than a resolved one

#### Scenario: the floor is the narrower of 36 and the default

- **GIVEN** the drag-handle column, whose default is 24px
- **WHEN** its handle is dragged far to the left
- **THEN** it stops at 24px rather than being pushed out to 36

#### Scenario: a resized folded role moves the figure the Phases dialog quotes

- **GIVEN** a project whose folded column for one role has been dragged wider
- **WHEN** the Phases dialog says how wide that project's phases make the table
- **THEN** the figure carries the dragged width, because the folded minimum is
  resolved from that role's own column id, and it equals the `min-width` the
  table is really laid out with

#### Scenario: the ceiling is the same number in both directions

- **WHEN** a column is dragged as far right as it will go and the browser is
  then reloaded
- **THEN** the width it stopped at is read back and applied, because the drag
  clamps to the ceiling the stored-width check accepts up to

#### Scenario: a drag does not disturb what is being typed

- **GIVEN** a half-typed name in a cell, with the caret in it
- **WHEN** another column's width changes
- **THEN** the caret and the half-typed value are still there
