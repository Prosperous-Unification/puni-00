## ADDED Requirements

### Requirement: The table narrows to what is being looked for

The table SHALL offer a Find box that narrows the rows on screen to the work
items whose name contains what was typed, case-insensitively, together with
every ancestor and every descendant of those work items. Any other row SHALL be
hidden. A work item whose own name matched SHALL be marked as such, and the
rows kept around it SHALL NOT be. While the box holds something, the expansion
the table renders SHALL open every kept row, so a match inside a branch the
reader had collapsed is on screen; the reader's own expansion SHALL NOT be
changed by it, and SHALL be back in force the moment the box is emptied. The
box SHALL be cleared by Escape and SHALL NOT be a cell of the table's keyboard
grid. The table SHALL say how many rows are shown out of how many the plan
holds, and SHALL show an empty table and a sentence naming the query when
nothing matches.

#### Scenario: a match deep in a closed branch

- **GIVEN** `010 Strip the walls` holding `010.1 Sockets`, which holds
  `010.1.1 Back boxes`, and `010.1` collapsed
- **WHEN** `back boxes` is typed into the Find box
- **THEN** `010`, `010.1` and `010.1.1` are on screen and every other row is
  gone, and only `010.1.1` is marked

#### Scenario: a matched parent brings its work with it

- **WHEN** `strip` is typed and `010 Strip the walls` has three work items
  beneath it
- **THEN** `010` and all three are on screen, and only `010` is marked

#### Scenario: nothing matches

- **WHEN** `plumbing` is typed and no work item is called that
- **THEN** no rows are shown, and the table says there are no matches for
  `plumbing` rather than showing every row

#### Scenario: the search is left

- **GIVEN** `010.1` collapsed by the reader and a search revealing a match
  inside it
- **WHEN** Escape is pressed in the Find box
- **THEN** the box is empty and `010.1` is collapsed again

#### Scenario: how much of the plan is on screen

- **WHEN** a search keeps three rows of a six-row plan
- **THEN** the table says `3 of 6 rows`

### Requirement: The tree folds and unfolds whole, and is remembered

The table SHALL offer a control that closes every branch and one that opens
every branch. Which branches are open SHALL be remembered per project in the
reader's own browser, restored when the table is opened again, and SHALL NOT be
shared with anybody else. A remembered expansion naming work items that no
longer exist SHALL be honoured for the rest; a work item created since it was
remembered SHALL appear collapsed, since a remembered expansion names the
branches that are open. A stored value that is not an expansion SHALL be
discarded rather than obeyed.

#### Scenario: closing and opening the whole plan

- **WHEN** Collapse all is activated on a plan with children under `010`
- **THEN** only the root work items are shown, and Expand all shows every work
  item again

#### Scenario: the plan opens as it was left

- **GIVEN** `010.1` collapsed
- **WHEN** the table is opened again in the same browser
- **THEN** `010.1` is still collapsed and every other branch is still open

#### Scenario: another project is not affected

- **GIVEN** every branch of one project collapsed
- **WHEN** another project is opened for the first time in that browser
- **THEN** its branches are all open

#### Scenario: a stored expansion that is not one

- **GIVEN** the stored value for a project is not an expansion
- **WHEN** the table is opened
- **THEN** every branch is open and the stored value has been dropped
