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

`setDirectoryCapacity { resourceId, units | null, confirm?: true }` SHALL be accepted on
`POST /api/directory/commands` and on `POST /api/projects/:id/commands`, in all-or-none
batches, and only from an organization admin or super-admin acting as themselves. Any other
role and any agent SHALL be refused `forbidden`. A resource with no organization SHALL be
refused `organization_required`.

#### Scenario: A member or an agent may not

- **WHEN** a member, or a machine credential of an admin's agent, sends the command
- **THEN** it is refused `forbidden` and the directory capacity is unchanged

#### Scenario: An admin's agent over MCP may not

- **WHEN** an MCP client acting under a consent delegation as an agent person bound to an
  admin's account sends the command on either route
- **THEN** it is refused `forbidden` and the directory capacity is unchanged

#### Scenario: An admin's own MCP session may

- **WHEN** an MCP client acting under an admin's delegation consented as the admin sends the
  command
- **THEN** it is applied, as the admin's browser session's would be

#### Scenario: A legacy resource

- **WHEN** an admin states a directory capacity for a resource with no organization row
- **THEN** it is refused `organization_required`

### Requirement: A directory capacity write is audited, not journalled

`setDirectoryCapacity` SHALL NOT enter the plan journal, the plan export or the plan document,
and SHALL write one `organization_audit` row, action `directory_capacity_changed` on subject
kind `resource`, with the units before and after.

#### Scenario: The write is audited, not journalled

- **WHEN** an admin states 16 where nothing was stated
- **THEN** one audit row records `directory_capacity_changed` from `null` to 16 and no
  project's journal moves

### Requirement: A directory capacity write announces to the projects that use the resource

Every applied `setDirectoryCapacity` SHALL publish `directory_changed` to each project of the
organization that demands the resource on some leaf, states a capacity for it or holds units
of it through a claim, after the write commits, so their event sequences move and cached
roll-ups, startable reads and open plans recompute.

#### Scenario: A space roll-up follows the clamp

- **WHEN** project A states 32 GB of `host ram`, its space roll-up has been read, and an admin
  states a directory capacity of 16
- **THEN** A receives `directory_changed` and the next roll-up read serves the dates scheduled
  against 16

#### Scenario: A project holding the resource only through a claim is told

- **WHEN** project C holds 6 GB of `host ram` through a claim's `resources`, with no demand
  and no capacity stated for it, and an admin lowers the directory capacity from 16 to 8
- **THEN** C receives `directory_changed`, so its cached startable read recomputes

### Requirement: Lowering or clearing a directory capacity is previewed

`POST /api/organization/resources/:resourceId/directory-capacity/preview` with body
`{ units: number | null }` SHALL, for an organization admin or super-admin in their own
session only, write nothing and answer `{ resourceId, before, after, projects, hiddenProjects,
free, refusal }`: each project the caller may read that uses the resource with the units it
holds, the others as `{ count, units }`, the free units after the change, and the refusal the
write would meet or null.

#### Scenario: Preview of a lowering

- **WHEN** A holds 8 and B holds 6 of a directory capacity of 16 and an admin previews 10
- **THEN** the answer lists A with 8 and B with 6, `free: -4` and `refusal: null`, and
  nothing is written

### Requirement: Lowering a directory capacity strands nothing

Lowering a directory capacity below the units held SHALL release nothing: held units stay held
and new claims are refused until they drain.

#### Scenario: Lowering strands nothing

- **WHEN** the admin then lowers it to 10
- **THEN** A and B keep their 14 units and a new claim asking 1 is refused
  `resources_exhausted`

### Requirement: An admin sees who holds a shared resource and who may release it

`GET /api/organization/resources/:resourceId/occupancy` SHALL answer an organization admin or
super-admin in their own session, per project of the organization, the units held of the
resource and each holding claim (claim, person, run, work item, claimed at, lease expiry or
null) with `releasableBy`: `claimant_or_admin` in an unrestricted project, `claimant` in a
restricted one. Any other caller SHALL be refused `forbidden`.

#### Scenario: A human claim with no lease blocks a swarm

- **WHEN** a person's claim in unrestricted project A holds 16 GB with no lease and an admin
  reads the resource's occupancy
- **THEN** the read names A, the person, the work item, `leaseExpiresAt: null` and
  `releasableBy: claimant_or_admin`, and the admin's release frees 16 for every project

#### Scenario: A restricted project's claim

- **WHEN** the same claim sits in a restricted project the admin did not create
- **THEN** the read says `releasableBy: claimant`, and the admin's release is refused

### Requirement: Removal and rollback account for a directory capacity

`deleteResource`'s `in_use` counts SHALL include a stated directory capacity and its cascade
SHALL drop it. The migration adding the table SHALL be additive, with the CHECK
`typeof(units) = 'integer' AND units >= 0`, and a `down.sql` refusing while any directory
capacity is stated; the migration widening `organization_audit` SHALL
carry its whole vocabulary and refuse rollback while a row uses the new values.

#### Scenario: Rollback refuses over a stated capacity

- **WHEN** `down.sql` runs while one directory capacity is stated
- **THEN** it refuses and the table remains

#### Scenario: Removal names the directory capacity

- **WHEN** an admin deletes a resource with a stated directory capacity and no cascade
- **THEN** the command is refused `in_use` with the directory capacity counted
