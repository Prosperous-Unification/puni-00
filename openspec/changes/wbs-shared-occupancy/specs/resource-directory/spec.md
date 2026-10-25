## ADDED Requirements

### Requirement: A resource may state a directory capacity

A resource of an organization SHALL carry an optional directory capacity: the whole number of
units (0 or more) that exist for every project of its organization, stated or unstated, with
no remembered state. `setDirectoryCapacity { resourceId, units | null }` on the directory
command route SHALL state it or, with `null`, make it unstated. The resource read and the
project resources read SHALL carry `directoryCapacity` (a number or null).

#### Scenario: An admin states the host's RAM

- **WHEN** an admin sends `setDirectoryCapacity { resourceId: <host ram>, units: 16 }`
- **THEN** both projects' resources reads carry `directoryCapacity: 16`, and `units: null`
  makes it unstated again

#### Scenario: No directory capacity, same decisions

- **WHEN** no resource states a directory capacity
- **THEN** every claim decision, refusal reason, occupied and free number and schedule hash
  equals the one before this change, and the resource reads carry `directoryCapacity: null`

### Requirement: Only an organization admin sets a directory capacity

Only an organization admin or super-admin SHALL send `setDirectoryCapacity`; any other caller,
a machine credential and an MCP consent delegation SHALL be refused `forbidden`. A resource
with no organization SHALL be refused `legacy_resource`. The command SHALL NOT enter the plan
journal, the plan export or the plan document, and SHALL write one `organization_audit` row,
action `directory_capacity_changed` on subject kind `resource`, with the units before and
after.

#### Scenario: A member or an agent may not

- **WHEN** a member, or a machine credential of an admin's agent, sends the command
- **THEN** it is refused `forbidden` and the directory capacity is unchanged

#### Scenario: The write is audited, not journalled

- **WHEN** an admin states 16 where nothing was stated
- **THEN** one audit row records `directory_capacity_changed` from `null` to 16 and no
  project's journal moves

#### Scenario: A legacy resource

- **WHEN** an admin states a directory capacity for a resource with no organization row
- **THEN** it is refused `legacy_resource`

### Requirement: Lowering or clearing a directory capacity is previewed

`setDirectoryCapacity` with `dryRun: true` SHALL write nothing and answer the projects that use
the resource (each readable project named, the others as one count), the units each holds, the
free units the change would leave and any refusal the change would meet. Lowering below the
units held SHALL release nothing: held units stay held and new claims are refused until they
drain.

#### Scenario: Preview of a lowering

- **WHEN** A holds 8 and B holds 6 of a directory capacity of 16 and an admin previews 10
- **THEN** the answer lists A with 8 and B with 6 and free `-4`, and nothing is written

#### Scenario: Lowering strands nothing

- **WHEN** the admin then lowers it to 10
- **THEN** A and B keep their 14 units and a new claim asking 1 is refused
  `resources_exhausted`

### Requirement: An admin sees who holds a shared resource and who may release it

The directory resource read SHALL give an organization admin, per project of the
organization, the units held of a resource with a directory capacity and each holding claim
(person, run, work item, claimed at, lease expiry or none), and SHALL say that the claimant's
bound account or an organization admin may release it. A member SHALL be refused `forbidden`.

#### Scenario: A human claim with no lease blocks a swarm

- **WHEN** a person's claim in A holds 16 GB with no lease and an admin reads the resource
- **THEN** the read names A, the person, the work item and `leaseExpiresAt: null`, with the
  admin allowed to release it, and the admin's release frees 16 for every project

### Requirement: Removal and rollback account for a directory capacity

`deleteResource`'s `in_use` counts SHALL include a stated directory capacity and its cascade
SHALL drop it. The migration adding the table SHALL be additive with a `down.sql` refusing
while any directory capacity is stated; the migration widening `organization_audit` SHALL
carry its whole vocabulary and refuse rollback while a row uses the new values.

#### Scenario: Rollback refuses over a stated capacity

- **WHEN** `down.sql` runs while one directory capacity is stated
- **THEN** it refuses and the table remains

#### Scenario: Removal names the directory capacity

- **WHEN** an admin deletes a resource with a stated directory capacity and no cascade
- **THEN** the command is refused `in_use` with the directory capacity counted
