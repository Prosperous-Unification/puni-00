## ADDED Requirements

### Requirement: The startable read states each resource's occupancy scope

Each entry of the startable read's `resources` SHALL carry `occupancyScope`
(`'organization'` when its resource states a directory capacity, else `'project'`),
`directoryCapacity` (a number or null), `occupiedElsewhere` (units held by other projects of
the organization, 0 under project scope) and `free` as the smaller of the project's and the
organization's free units. A resource with a directory capacity and no project capacity SHALL
be listed.

#### Scenario: B sees what A holds

- **WHEN** `host ram` states 16 for the organization, A's leaves hold 16 and B reads startable
- **THEN** B's entry reads `occupancyScope: 'organization'`, `occupiedElsewhere: 16`, `free: 0`,
  and B's 16 GB leaf is listed under `doesNotFit` with `scope: 'organization'`

### Requirement: Fit uses the smaller free units

A leaf's fit SHALL use the entry's `free`, and `doesNotFit`'s `exhausted` SHALL carry the
binding `scope`.

#### Scenario: Free in the project, held elsewhere

- **WHEN** B states 16 and holds nothing, A holds 12 of a directory capacity of 16, and a leaf
  of B demands 8
- **THEN** the leaf is listed under `doesNotFit` with shortfall 4 and `scope: 'organization'`

### Requirement: The read's top-level scope summarises its resources

The read's top-level `occupancyScope` SHALL be `'project'` when every listed resource is
project-scoped, `'organization'` when every one is organization-scoped, and `'mixed'`
otherwise. Holders SHALL follow the reader-access rule of `resource-occupancy`.

#### Scenario: Project-only resources read as before

- **WHEN** no listed resource states a directory capacity
- **THEN** every entry reads `occupancyScope: 'project'` and the top-level `occupancyScope` is
  `'project'`

#### Scenario: Mixed resources

- **WHEN** `host ram` states a directory capacity and `worktrees` does not
- **THEN** the top-level `occupancyScope` is `'mixed'`
