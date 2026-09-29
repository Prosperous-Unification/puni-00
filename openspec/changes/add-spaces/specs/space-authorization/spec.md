## ADDED Requirements

### Requirement: A space's owner is the caller's organization

Under scoped access a space SHALL be created in, and read from, the scope's organization.
Under legacy access it SHALL use the organization marked legacy. When none exists, `GET
/api/spaces`, `POST /api/spaces` and every route naming a space id SHALL answer `409
organization_required`, never an empty list, so fe-01 can render that state rather than an
organization with no spaces; `GET /api/spaces/all` and its roll-ups and in-progress reads
SHALL still answer, and writes to `all` SHALL answer `409 virtual_space` under any access. A
space of another organization SHALL answer `404 not_found`, indistinguishable from an absent
one.

#### Scenario: a foreign space

- **GIVEN** space `s` of organization B
- **WHEN** a member of organization A reads, renames or deletes `s`
- **THEN** each answers `404 not_found`

#### Scenario: legacy access without a legacy organization

- **GIVEN** pre-activation access and no organization marked legacy
- **WHEN** a user lists spaces or creates one
- **THEN** both answer `409 organization_required`, and `GET /api/spaces/all` answers `200`

### Requirement: Viewers read, members write

Every space route SHALL carry the organization refusals. Creating, renaming and deleting a
space, and adding, removing and moving a member, SHALL require member or above; a viewer SHALL
be answered `403 forbidden`. Any member MAY add a restricted project.

#### Scenario: a viewer adds a project

- **GIVEN** a viewer of organization A
- **WHEN** they add a project to a space of A
- **THEN** the answer is `403 forbidden` and nothing is written

### Requirement: A project the caller cannot open is omitted, never hinted

Every space read SHALL filter members through the same predicate the project routes use
(`findProjectWithin`, `listForInOrganization`). A project the caller cannot open SHALL be
omitted entirely: no row, no placeholder, no count, no name, no roll-up and no in-progress
item; space-level folds SHALL cover rendered rows only. Adding such a project SHALL answer the
project route's own `404 not_found`.

#### Scenario: a hidden member

- **GIVEN** a space of three members, one of which the caller's project store does not return
- **WHEN** the caller reads the space, its roll-ups and in progress now
- **THEN** that project appears in none of them and the space counts two

#### Scenario: adding a foreign project

- **GIVEN** project `b1` of organization B
- **WHEN** a member of A adds `b1` to a space of A
- **THEN** the answer is `404 not_found`, not `409`
