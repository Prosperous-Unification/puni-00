## ADDED Requirements

### Requirement: A project list ordered by what the caller opened last

`GET /api/projects` SHALL answer in the calling account's own order: projects
that account has opened first, most recently opened before less recently, then
projects it has never opened, newest created first. Each project SHALL carry
that account's `lastOpenedAt` as a moment, or null when the account has never
opened it. The order is per account: two accounts reading the same list may
receive it in two different orders.

#### Scenario: recency wins over creation order

- **GIVEN** projects `A`, `B` and `C` created in that order, and an account
  that opened `A` and then `B`
- **WHEN** that account lists projects
- **THEN** the order is `B`, `A`, `C`, and `C` carries a null `lastOpenedAt`

#### Scenario: another account has its own order

- **GIVEN** the same projects, and a second account that has opened `C` only
- **WHEN** the second account lists projects
- **THEN** `C` is first, and `A` and `B` follow newest-created first

### Requirement: Opening a project is recorded against the account

`POST /api/projects/:id/opened` SHALL record the calling account as having
opened that project at the moment of the request, replacing any moment already
recorded for that pair. It SHALL answer 401 without a valid token and 404 for
a project that does not exist. It SHALL NOT require write access: every
authenticated account may read every project, so every one of them may record
having opened it.

#### Scenario: opening again replaces the moment

- **WHEN** an account records opening the same project twice
- **THEN** one record exists for that pair, holding the later moment

#### Scenario: a reader of a restricted project may record it

- **GIVEN** a project restricted to another account
- **WHEN** an account that does not own it records opening it
- **THEN** the record is written and the project sorts first for that account

#### Scenario: a project that is not there

- **WHEN** an account records opening an id no project has
- **THEN** the answer is 404 and nothing is recorded

### Requirement: The project picker filters as you type

The project picker SHALL be a combobox: typing narrows the list to projects
whose name contains what was typed, case-insensitively, keeping the order
be-01 sent. ArrowDown and ArrowUp SHALL move the highlight, Enter SHALL choose
the highlighted project, Escape SHALL close the list, and clicking an entry
SHALL choose it. Choosing a project SHALL record it as opened, and so SHALL
restoring one remembered from a previous visit.

#### Scenario: typing narrows the list

- **GIVEN** projects named `Rewire the shed` and `Repaint the hall`
- **WHEN** `hall` is typed into the picker
- **THEN** only `Repaint the hall` is offered

#### Scenario: the keyboard chooses without the mouse

- **WHEN** ArrowDown then Enter is pressed in the picker
- **THEN** the first offered project is selected and its work items are shown

#### Scenario: the client keeps be-01's order

- **GIVEN** be-01 answers with projects in an order the names do not sort into
- **WHEN** the picker is opened with nothing typed
- **THEN** the entries read in the order be-01 sent
