## ADDED Requirements

### Requirement: A space is an organization's named, ordered set of its projects

A space SHALL belong to exactly one organization and carry a non-empty name unique within that
organization. Its membership SHALL be the pairs `(space, project)`, each with a position; a
project MAY sit in many spaces and at most once in each. Membership rows SHALL be ordered by
`position`, ties resolved by project id. Positions SHALL leave gaps of `POSITION_STEP` and carry
no uniqueness.

#### Scenario: one project in two spaces

- **GIVEN** spaces `Q3` and `Launch` of organization A and its project `p1`
- **WHEN** `p1` is added to both
- **THEN** both spaces list `p1`

#### Scenario: a name twice in one organization

- **GIVEN** organization A holds space `Q3`
- **WHEN** A creates or renames another space to `Q3`
- **THEN** the write is refused `name_taken` and nothing changes, while organization B may
  create its own `Q3`

#### Scenario: a tie in position

- **GIVEN** two members of one space with the same position
- **WHEN** the space is read twice
- **THEN** both reads list them in project id order

### Requirement: Cross-tenant membership is impossible in the database

`space_project` SHALL carry the space's organization and reference both `space(id,
organization_id)` and `project_organization(resource_id, organization_id)`, so a row joining a
space and a project owned by different organizations has no parent and is refused by SQLite
itself, whatever the service does.

#### Scenario: a direct insert across organizations

- **GIVEN** space `s` of organization A and project `b1` owned by organization B
- **WHEN** a row `(s, b1)` is inserted directly, naming either organization
- **THEN** the insert fails and no row is stored

#### Scenario: the store is asked for a foreign project

- **GIVEN** space `s` of organization A and project `b1` owned by organization B
- **WHEN** the store adds `b1` to `s` in organization A
- **THEN** it answers `not_found` and stores nothing

### Requirement: A space owns nothing

Removing a project from a space, moving it, or deleting the space SHALL change no project,
work item or other space. Deleting a project SHALL remove it from every space, including when
the outgoing colour deletes it during a swap.

#### Scenario: a space is deleted

- **GIVEN** space `s` holding `p1` and `p2`
- **WHEN** `s` is deleted
- **THEN** its membership rows are gone and `p1`, `p2` and every other space read unchanged

#### Scenario: a project is deleted

- **GIVEN** `p1` in spaces `s` and `t`
- **WHEN** `DELETE FROM project` removes `p1`
- **THEN** neither space lists `p1`

### Requirement: Membership is placed after a named member

Adding or moving a member SHALL name the member it goes after, or none for first. Naming a
project that is not a member of the space SHALL be refused `not_found` and write nothing. A move
SHALL answer the member's new position. Adding a project already in the space SHALL be refused
`already_in_space`.

#### Scenario: add after a member

- **GIVEN** a space holding `p1` then `p2`
- **WHEN** `p3` is added after `p1`
- **THEN** the space lists `p1`, `p3`, `p2`

#### Scenario: move to the front

- **GIVEN** a space holding `p1`, `p2`, `p3`
- **WHEN** `p3` is moved after none
- **THEN** the space lists `p3`, `p1`, `p2`

### Requirement: The spaces migration is additive and its rollback refuses stored spaces

The migration SHALL only create `space` and `space_project` and their indexes; the outgoing
colour SHALL neither read nor write them. Its `down.sql` SHALL refuse while any `space` row
exists, naming `space-rollback-cli.ts save|remove|restore`, and only then drop both tables.
`save` SHALL write every space and member to a versioned file; `remove` SHALL delete exactly the
saved spaces in one transaction, refusing if the stored spaces or members differ from the file;
`restore` SHALL write them back all or none, refusing when a saved project or organization is
gone or a saved project has changed owner.

#### Scenario: rollback over a stored space

- **GIVEN** a migrated database holding one space
- **WHEN** the rollback past the spaces migration runs
- **THEN** it fails, both tables and the ledger row remain

#### Scenario: save, remove, roll back, migrate, restore

- **GIVEN** two spaces with members
- **WHEN** `save`, `remove`, the rollback, the forward migration and `restore` run in turn
- **THEN** both spaces read as before, members in the same order

#### Scenario: a space written after the save

- **GIVEN** a save file and a space created after it
- **WHEN** `remove` runs with that file
- **THEN** it refuses and deletes nothing
