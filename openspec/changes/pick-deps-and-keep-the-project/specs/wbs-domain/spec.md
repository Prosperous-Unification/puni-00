## ADDED Requirements

### Requirement: Dependencies are picked from a searchable list

The Depends on cell SHALL offer the project's work items as a list while the
cell is focused, each entry showing the work item's number and its name. Typing
in the cell SHALL narrow the list to items whose number or name contains what
was typed, case-insensitively. Choosing an entry — by click or by Enter on the
highlighted one — SHALL add that dependency at once and keep the cell focused
with the list open, so several dependencies can be added in one visit. The row
itself and its existing predecessors SHALL NOT be offered.

#### Scenario: searching by name

- **WHEN** `des` is typed into the Depends on cell of row `020` and a row
  `010 Design API` exists
- **THEN** the list shows an entry carrying both `010` and `Design API`, and
  choosing it makes `020` depend on `010`

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

fe-01 SHALL let the user rename the selected project through be-01's existing
`PATCH /api/projects/:id`. The new name SHALL show in the picker without a
manual reload. A refusal from be-01 — `forbidden` on a restricted project —
SHALL be shown to the user.

#### Scenario: renaming the selected project

- **WHEN** Rename is pressed, a new name typed, and Enter pressed
- **THEN** the picker shows the new name and the project stays selected

#### Scenario: cancelling a rename

- **WHEN** Rename is pressed and Escape pressed
- **THEN** no request is made and the name is unchanged

#### Scenario: be-01 refuses

- **WHEN** the rename request returns `forbidden`
- **THEN** that reason is shown and the old name remains
