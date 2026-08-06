## ADDED Requirements

### Requirement: A whole trio can be typed into the folded role's cell

The single column a folded role shows SHALL, for a work item that holds its
own estimates, accept a whole three-point estimate typed as one value and send
it as one write. The value SHALL be read as optimistic, realistic and
pessimistic separated by `/`, with spaces around the numbers ignored and
decimal figures accepted. A single number SHALL be read as the estimator
saying all three are that number — one keystroke sequence meaning one trio,
not the tool supplying two figures nobody typed. The cell SHALL show the
project's computed final figure whenever nothing is pending in it, so a folded
plan still reads by the number it is planned with. A work item whose figures
are rolled up from below SHALL keep showing them and SHALL NOT be typed into.
While the role is unfolded the three boxes SHALL be the editor and this cell
SHALL be the read-only figure again.

#### Scenario: a trio typed into the folded column

- **GIVEN** a leaf row and a folded Dev column
- **WHEN** `2/3/8` is typed into its Dev cell and the cell is left
- **THEN** one estimate of `2 / 3 / 8` is written for that row and role, and
  no other write is made

#### Scenario: spaces and decimals

- **WHEN** `0.5 / 1 / 2` is typed into the cell
- **THEN** the estimate written is `0.5 / 1 / 2`

#### Scenario: one number means all three

- **WHEN** `5` is typed into the cell
- **THEN** the estimate written is `5 / 5 / 5`

#### Scenario: the figure comes back

- **WHEN** a trio the project turns into a final figure of `4` has been
  accepted
- **THEN** the cell reads `4`

#### Scenario: a rolled-up row

- **GIVEN** a work item with children
- **WHEN** its folded role column is looked at
- **THEN** its rolled-up figure is shown and there is nothing to type into

#### Scenario: the same estimate typed either way

- **WHEN** a trio is typed as shorthand in one cell, and the same trio is
  typed into the three boxes
- **THEN** the two produce the same estimate

### Requirement: A shorthand entry that cannot stand is refused, never repaired

An entry that is not a trio SHALL send nothing, SHALL leave the work item's
stored estimate alone, and SHALL be reported on the cell — marked invalid,
carrying the reason — with what was typed kept so it can be corrected. A trio
that runs backwards SHALL be reported rather than sorted. A count that is
neither one number nor three, a part that is not a number of days, a negative
figure, and a figure missing between two separators SHALL each be refused.
What was typed and refused SHALL survive the refetches that other people's
edits cause.

#### Scenario: a trio that runs backwards

- **WHEN** `8/3/2` is typed into the cell
- **THEN** nothing is sent, the cell is marked invalid with the ordering
  reason, and it still reads `8/3/2`

#### Scenario: two numbers where three are needed

- **WHEN** `2/3` is typed into the cell
- **THEN** nothing is sent and the cell is marked invalid

#### Scenario: a figure missing between the separators

- **WHEN** `1//3` is typed into the cell
- **THEN** nothing is sent — the empty part is not read as a zero

#### Scenario: a refused entry outlives a refetch

- **GIVEN** a refused entry left in the cell
- **WHEN** the tree is refetched because something else changed
- **THEN** the cell still holds what was typed, still marked invalid

### Requirement: Emptying the folded cell clears the estimate

The cell SHALL clear a stored trio when it is emptied and the server holds one
for that work item and role, through the same removal three emptied boxes use,
and SHALL drop what was typed once the removal is accepted. Emptying a cell
for a work item and role the server holds no estimate for SHALL send nothing.

#### Scenario: emptied against a stored trio

- **GIVEN** a row whose Dev trio is stored
- **WHEN** its folded Dev cell is emptied
- **THEN** the estimate is cleared and the cell reads empty and is not marked
  invalid

#### Scenario: emptied against nothing

- **GIVEN** a row with no stored Dev estimate
- **WHEN** its folded Dev cell is emptied
- **THEN** nothing is sent

### Requirement: One pending estimate per work item and role, last edit wins

A work item and role SHALL have at most one estimate typed and not yet
accepted, whichever way it was typed. Typing into the folded cell SHALL
discard what the three boxes were holding unsent for that same estimate, and
typing into a box SHALL discard what the folded cell was holding. Neither
SHALL be translated into the other. The folded cell SHALL report whichever of
the two is pending, and SHALL keep reporting an unsaveable trio typed into the
boxes while the role is folded, so folding cannot hide a complaint.

#### Scenario: the folded cell is typed last

- **GIVEN** `7` typed into the Dev optimistic box and not sent
- **WHEN** the role is folded and a refused entry is typed into its cell
- **THEN** unfolding shows the optimistic box empty and unmarked, and nothing
  has been sent

#### Scenario: a box is typed last

- **GIVEN** a refused entry left in the folded Dev cell
- **WHEN** the role is unfolded and `1` is typed into the optimistic box
- **THEN** folding again shows the cell empty, marked with the boxes' own
  complaint that the estimate is not saved

#### Scenario: a half-typed trio behind a folded role

- **GIVEN** one box of a trio filled and the role folded
- **THEN** the folded cell is marked invalid, carrying the reason
