## MODIFIED Requirements

### Requirement: An admin reads caps with usage beside each

`GET /api/organization/limits` SHALL answer, for a current `admin` or `super_admin` of the
active organization, `source`, `limits` (the three caps) and `usage`: `agentPersons` (the
organization's persons of kind `agent`), `concurrentClaims` (its bound claims: distinct
`(work item, person, run)` triples holding at least one claim row over its projects) and
`capacityUnits`, one entry `{ resourceId, name, unitLabel, units }` per resource of the
organization with a stated directory capacity or at least one stated project capacity, `units`
being the directory capacity where one is stated, else the sum of stated capacities over the
organization's projects, in resource-id order, each entry carrying `countedFrom: 'directory' | 'projects'`. Limits and usage SHALL be
read in one transaction. A `member` or `viewer` SHALL be refused `403 forbidden`; a
delegation or a machine principal `403 insufficient_scope`; before activation
`403 no_active_organization`. Usage SHALL count rows of the active organization only.

#### Scenario: Seven of eight

- **WHEN** A holds 7 agent persons, 12 bound claims across two projects, and states 32 GB
  of `h2puni ram` in one project and 16 GB in another, and an admin of A reads the limits
- **THEN** the answer carries `usage.agentPersons: 7`, `usage.concurrentClaims: 12` and
  `capacityUnits: [{ h2puni ram, 48 }]` beside the caps

#### Scenario: A whole-leaf claim is one bound claim

- **WHEN** `claire` under run `r1` claims a leaf with four steps and nothing else is claimed
- **THEN** `usage.concurrentClaims` is 1, and after `codex` claims one step of another leaf
  it is 2

#### Scenario: A member cannot read

- **WHEN** a caller with role `member` reads the limits
- **THEN** WBS answers `403 forbidden` and reads no usage

#### Scenario: Another organization's rows are not counted

- **WHEN** B holds 30 agent persons and A holds 2, and an admin of A reads
- **THEN** `usage.agentPersons` is 2

#### Scenario: A directory capacity is the usage

- **WHEN** `host ram` states a directory capacity of 16 and two projects state 16 each
- **THEN** `capacityUnits` carries `{ host ram, units: 16, countedFrom: 'directory' }`

### Requirement: Stating more capacity units of a resource than the cap allows is refused

`setResourceCapacity { resource, units }` with non-null `units` SHALL be refused
`capacity_limit` carrying `resourceId`, `cap`, `declared` (the sum of stated units of that
resource over the organization's other projects) and `asked` when `declared + units` exceeds
`maxCapacityUnitsPerResource`, with nothing written. While the resource states a directory
capacity, `declared` SHALL be 0 (project capacities are ceilings that may overlap) and only
`units` SHALL be checked against the cap. Clearing (`null`) or lowering SHALL
never be refused. The plan import SHALL check every capacity it would write the same way,
against every existing project of the organization (the import's own project is new and
states nothing), and refuse the whole import. Team
capacities (`setCapacity`) SHALL NOT be counted or capped.

#### Scenario: Two projects share 64 units

- **WHEN** A's cap is 64, project P states 48 GB of `h2puni ram`, and project Q sets 32 GB
- **THEN** Q's batch is refused `capacity_limit` with
  `{ h2puni ram, cap: 64, declared: 48, asked: 32 }` and Q states nothing; setting 16 GB is
  applied

#### Scenario: Lowering is never refused

- **WHEN** A's cap was lowered to 32 while P states 48 GB
- **THEN** P setting 48 GB again is applied, P setting 40 GB is applied, and P setting 41 GB
  is refused `capacity_limit` with `declared: 0, asked: 41`

#### Scenario: Another resource is another sum

- **WHEN** A's cap is 64, P states 64 GB of `h2puni ram` and Q sets 10 `worktrees`
- **THEN** Q's batch is applied: the cap is per resource

#### Scenario: Overlapping ceilings under a directory capacity

- **WHEN** the cap is 64, the directory capacity is 16, and three projects each state 32
- **THEN** each `setResourceCapacity` is applied, and stating 65 in one project is refused
  `capacity_limit` with `declared: 0, asked: 65`

## ADDED Requirements

### Requirement: The cap bounds a directory capacity and its clearing

`setDirectoryCapacity` SHALL be refused `capacity_limit` with `{ resourceId, cap, declared: 0,
asked: units }` when the asked units exceed the organization's `maxCapacityUnitsPerResource`.
Clearing a directory capacity whose resource's project capacities sum above the cap SHALL be
refused `capacity_limit` with `{ resourceId, cap, declared: <that sum>, asked: 0 }` unless the
command carries `confirm: true`; confirmed,
nothing is reclaimed and later raises are checked against the sum as before.

#### Scenario: Above the cap

- **WHEN** the cap is 64 and an admin states a directory capacity of 65
- **THEN** the command is refused `capacity_limit` with `declared: 0, asked: 65` and cap 64

#### Scenario: Clearing would leave the sum above the cap

- **WHEN** the cap is 64, the directory capacity is 16 and three projects state 32 each
- **THEN** clearing it is refused `capacity_limit` with `declared: 96, asked: 0`, and clearing with
  `confirm: true` is applied
