## MODIFIED Requirements

### Requirement: Viewers read, members write

Every space route SHALL carry the organization refusals. Listing spaces and reading a
space, its roll-ups and its in-progress read SHALL require `organization.navigate` (any
grant in the organization) and SHALL show only packages the caller may read. Creating,
renaming and deleting a space, and adding, removing and moving a member, SHALL require
`organization.manage_spaces`; any other principal SHALL be answered `403 forbidden` naming
that permission. A space administrator MAY add a restricted package they can read.

#### Scenario: a contributor adds a project

- **GIVEN** an account holding `(organization A, project-contributor)` and nothing else
- **WHEN** they add a package to a space of A
- **THEN** the answer is `403 forbidden` naming `organization.manage_spaces` and nothing
  is written

#### Scenario: a plain member lists spaces

- **GIVEN** a current member of A with no grant
- **WHEN** they list spaces
- **THEN** the answer is `403 forbidden` naming `organization.navigate`
