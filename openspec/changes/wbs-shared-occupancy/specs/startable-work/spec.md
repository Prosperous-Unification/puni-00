## MODIFIED Requirements

### Requirement: The startable read answers resource fit

The startable read SHALL carry, for the project, each stated resource capacity, and each
resource with a directory capacity that the project demands on some leaf or states a capacity
for, with its units occupied and free (`free` being the smaller of the project's and, under
organization scope, the organization's free units), and for each startable leaf whether its demand fits the free units now (fit is per leaf, since demand is per work item; a leaf that already holds a claim always fits, carrying its held units); leaves whose demand does not fit SHALL be listed apart, with their startable step ids, the first exhausting resource in resource-id order and the shortfall. Unstated capacities are not listed; a stated 0 is listed and excludes any demand on it. Each entry SHALL carry `occupancyScope` (`'organization'` when its resource states a directory
capacity, else `'project'`), `directoryCapacity` (a number or null) and `occupiedElsewhere`
(units held by other projects of the organization, 0 under project scope); `doesNotFit`'s
`exhausted` SHALL carry the binding `scope`.

#### Scenario: One step fits, one does not

- **WHEN** 4 GB of `h2puni ram` are free, leaf A demands 4 GB and leaf B demands 8 GB, both
  otherwise startable
- **THEN** A's steps are listed as startable and B's steps are listed apart with `h2puni ram`
  and shortfall 4

#### Scenario: B sees what A holds

- **WHEN** `host ram` states 16 for the organization, A's leaves hold 16 and B reads startable
- **THEN** B's entry reads `occupancyScope: 'organization'`, `occupiedElsewhere: 16`, `free: 0`,
  and B's 16 GB leaf is listed under `doesNotFit` with `scope: 'organization'`

#### Scenario: Free in the project, held elsewhere

- **WHEN** B states 16 and holds nothing, A holds 12 of a directory capacity of 16, and a leaf
  of B demands 8
- **THEN** the leaf is listed under `doesNotFit` with shortfall 4 and `scope: 'organization'`

#### Scenario: A shared resource the project never uses

- **WHEN** `gpu` states a directory capacity and project B neither demands it nor states it
- **THEN** B's startable read does not list `gpu`

## ADDED Requirements

### Requirement: The read's top-level scope summarises its resources

The read's top-level `occupancyScope` SHALL be `'project'` when every listed resource is
project-scoped, `'organization'` when every one is organization-scoped, and `'mixed'`
otherwise. Holders SHALL follow the reader-access rule of `resource-occupancy`.

#### Scenario: Project-only resources read as before

- **WHEN** no listed resource states a directory capacity
- **THEN** every entry reads `occupancyScope: 'project'`, the top-level `occupancyScope` is
  `'project'`, and the fit, occupied and free numbers equal those before this change

#### Scenario: Mixed resources

- **WHEN** `host ram` states a directory capacity and `worktrees` does not
- **THEN** the top-level `occupancyScope` is `'mixed'`
