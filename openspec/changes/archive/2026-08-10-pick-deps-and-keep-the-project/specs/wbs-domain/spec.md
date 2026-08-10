## ADDED Requirements

### Requirement: Dependencies are picked from a searchable list

The Depends on cell SHALL offer the project's work items as a list while the
cell is focused, each entry reading `<number> - <name>` — the derived number the
Number column shows, then the name. Typing in the cell SHALL narrow the list to
items whose number or name contains what was typed, case-insensitively. Choosing an entry — by click or by Enter on the
highlighted one — SHALL add that dependency at once and keep the cell focused
with the list open, so several dependencies can be added in one visit. The row
itself and its existing predecessors SHALL NOT be offered.

#### Scenario: searching by name

- **WHEN** `des` is typed into the Depends on cell of row `020` and a row
  `010` named `Design API` exists
- **THEN** the list shows the entry `010 - Design API`, and choosing it makes
  `020` depend on `010`

#### Scenario: searching by number

- **WHEN** `010` is typed into the Depends on cell of row `020`
- **THEN** the list narrows to the entries whose number contains `010`, still
  reading `<number> - <name>`

#### Scenario: picking several in one visit

- **WHEN** an entry is chosen from the list
- **THEN** the input clears, the list remains available, and choosing a second
  entry adds a second dependency

#### Scenario: what cannot be depended on is not offered

- **WHEN** row `020` already depends on `010`
- **THEN** the list for `020` offers neither `010` nor `020` itself

#### Scenario: typed numbers still work

- **WHEN** `010, 030` is typed into the cell and Enter pressed
- **THEN** both dependencies are added, exactly as the typed flow always did

#### Scenario: leaving the cell closes the list

- **WHEN** the Depends on cell loses focus
- **THEN** no entries are offered until it is focused again

#### Scenario: a mouse press on the list does not close it

- **WHEN** the mouse is pressed anywhere on the open list — an entry or the
  scrollbar of a list taller than its box
- **THEN** the cell keeps the focus and the list stays open

#### Scenario: the highlight follows its row

- **WHEN** an entry is highlighted and another client's edit adds, removes or
  reorders entries in the open list
- **THEN** the highlight stays on the same work item — or on nothing, if that
  work item left the list — and Enter adds only the highlighted work item

### Requirement: The chosen project survives a refresh

fe-01 SHALL remember the selected project in this browser and select it again
on the next load, provided the project list still contains it. A remembered id
the list no longer has SHALL be ignored without an error.

#### Scenario: refresh with a remembered project

- **WHEN** a project was selected and the page is loaded again
- **THEN** that project is selected and its table shown, with no click

#### Scenario: the remembered project is gone

- **WHEN** the remembered id is absent from the fetched list
- **THEN** the picker behaves as if nothing was remembered

### Requirement: A project can be renamed from the UI

fe-01 SHALL let the user rename a project through be-01's existing
`PATCH /api/projects/:id`. The rename SHALL be bound to the project it was
opened for, never to whatever is selected when it commits. Enter or leaving
the input commits; Escape cancels; a draft that trims to nothing or to the
unchanged name cancels without a request. The new name SHALL show in the
picker without a manual reload. A refusal from be-01 — `forbidden` on a
restricted project — SHALL be shown with the typed draft kept.

#### Scenario: renaming the selected project

- **WHEN** Rename is pressed, a new name typed, and Enter pressed or the input
  left
- **THEN** the picker shows the new name and the project stays selected

#### Scenario: cancelling a rename

- **WHEN** Rename is pressed and Escape pressed, or the input is left with the
  name unchanged
- **THEN** no request is made and the name is unchanged

#### Scenario: an emptied draft is a cancel

- **WHEN** the draft is emptied — or reduced to whitespace — and committed
- **THEN** no request is made; the project keeps its name

#### Scenario: the selection moves while a rename is armed

- **WHEN** a rename is open and a new project is created
- **THEN** the draft is cancelled and no project receives it

#### Scenario: be-01 refuses

- **WHEN** the rename request returns `forbidden`
- **THEN** that reason is shown, the old name remains, and the draft is still
  in the input

### Requirement: The selection is honoured only while it exists

fe-01 SHALL drop a selected project from the selection when a list reload no
longer contains it, exactly as it treats the remembered id.

#### Scenario: the selected project is deleted elsewhere

- **WHEN** the selected project is absent from a reloaded project list
- **THEN** it is no longer selected and no request is made for its tree
