## ADDED Requirements

### Requirement: Project rank is a total order within one organization

The project rank SHALL be stored as `project_rank(project_id, organization_id, position)`, and
`(project_id, organization_id)` SHALL reference `project_organization(resource_id,
organization_id)`, so a project cannot be ranked in an organization that does not own it.
Ranked projects SHALL order by position, with ties broken by project id. Every unranked project
SHALL follow every ranked one, ordered by creation time and then id. Deleting a project SHALL
remove its rank.

#### Scenario: a foreign project

- **GIVEN** project Q owned by organization B
- **WHEN** a rank row for Q in organization A is inserted
- **THEN** SQLite refuses it

#### Scenario: equal positions

- **GIVEN** two ranked projects holding the same position
- **WHEN** the order is read twice
- **THEN** both reads order them by project id

### Requirement: Admins move a project in the rank

`POST /api/organization/projects/:id/rank {afterProjectId}` SHALL place the project directly
after `afterProjectId`, or first when that is absent or null, and answer `200` with the new order.
Every project of the organization SHALL be ranked afterwards, in that order. Only an admin or
super-admin SHALL be allowed; a member or viewer SHALL be answered `403 forbidden`. A foreign or
absent project, on either side of the move, SHALL answer `404 not_found`. A rank move SHALL NOT
be journalled and SHALL have no undo. Under legacy access, the route SHALL answer `409
organization_required`. Rolling back the migration SHALL refuse while any rank exists, naming
`project-rank-rollback-cli.ts save|remove|restore`.

#### Scenario: a member ranks

- **WHEN** a member moves a project in the rank
- **THEN** the answer is `403 forbidden` and the order is unchanged

### Requirement: The rank is readable

`GET /api/organization/project-rank` SHALL answer any current member with every project of the
organization in rank order, each with its name, its 1-based `rank` and whether it is `ranked`;
under legacy access it SHALL answer `409 organization_required`. The per-person load read SHALL
list its projects in rank order and report each one's `rank`; under legacy access it SHALL use
creation order then id.

#### Scenario: an unranked project

- **GIVEN** A ranked first, and B and C unranked, with B created before C
- **WHEN** the rank is read
- **THEN** A is 1, B is 2 and C is 3
