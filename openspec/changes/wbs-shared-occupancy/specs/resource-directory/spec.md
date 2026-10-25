## ADDED Requirements

### Requirement: A resource may state a directory capacity

A resource of an organization SHALL carry an optional directory capacity: the whole number of
units (0 or more) that exist for every project of its organization. `setDirectoryCapacity
{ resourceId, units | null }` on the directory command route SHALL state it or, with `null`,
make it unstated. The resource read and the project resources read SHALL carry
`directoryCapacity` (a number or null).

#### Scenario: An admin states the host's RAM

- **WHEN** an admin sends `setDirectoryCapacity { resourceId: <host ram>, units: 16 }`
- **THEN** both projects' resources reads carry `directoryCapacity: 16`, and `units: null`
  makes it unstated again

#### Scenario: No directory capacity, no change

- **WHEN** no resource states a directory capacity
- **THEN** every claim decision, startable read and schedule hash equals the one before this
  change

### Requirement: Only an organization admin sets a directory capacity

Only an organization admin or super-admin SHALL send `setDirectoryCapacity`; any other caller,
a machine credential and an MCP consent delegation SHALL be refused `forbidden`. A resource
with no organization SHALL be refused `legacy_resource`. The command SHALL NOT enter the plan
journal, the plan export or the plan document, and SHALL write one `organization_audit` row
with the units before and after.

#### Scenario: A member or an agent may not

- **WHEN** a member, or a machine credential of an admin's agent, sends the command
- **THEN** it is refused `forbidden` and the directory capacity is unchanged

#### Scenario: The write is audited, not journalled

- **WHEN** an admin states 16 where nothing was stated
- **THEN** one audit row records `null → 16` and no project's journal moves

### Requirement: Removal and rollback account for a directory capacity

`deleteResource`'s `in_use` counts SHALL include a stated directory capacity and its cascade
SHALL drop it. The migration SHALL be additive with a `down.sql` refusing while any directory
capacity is stated.

#### Scenario: Rollback refuses over a stated capacity

- **WHEN** `down.sql` runs while one directory capacity is stated
- **THEN** it refuses and the table remains

#### Scenario: Removal names the directory capacity

- **WHEN** an admin deletes a resource with a stated directory capacity and no cascade
- **THEN** the command is refused `in_use` with the directory capacity counted
