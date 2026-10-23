## MODIFIED Requirements

### Requirement: Viewers read, members write

Every space route SHALL carry the organization refusals. Listing spaces SHALL answer
`200` to any current member with the spaces visible to them: every space of the
organization when they hold `organization.navigate` (any grant in it), none otherwise.
Reading a space, its roll-ups and its in-progress read SHALL answer `404 not_found` to a
member without `organization.navigate` and SHALL show only projects and work packages the
caller may read. Creating, renaming and deleting a space, and adding, removing and moving
its projects, persons and teams, SHALL require `organization.manage_spaces`; any other
member SHALL be answered `403 forbidden` naming that permission. A space administrator MAY
add a project only when they can read it.

#### Scenario: a contributor adds a project

- **GIVEN** an account holding `(organization A, project-contributor)` and nothing else
- **WHEN** they add a project to a space of A
- **THEN** the answer is `403 forbidden` naming `organization.manage_spaces` and nothing
  is written

#### Scenario: a plain member lists spaces

- **GIVEN** a current member of A with no grant, and A holding two spaces
- **WHEN** they list spaces and then read one by id
- **THEN** the list answers `200` with `[]` and the read `404 not_found`
