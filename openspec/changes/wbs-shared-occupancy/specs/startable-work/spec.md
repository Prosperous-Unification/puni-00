## MODIFIED Requirements

### Requirement: The startable read answers resource fit

The startable read SHALL carry, for the project, each stated resource capacity, and each
resource with a directory capacity that the project demands on some leaf or states a capacity
for, with its units occupied and free, and for each startable leaf whether its demand fits the free units now (fit is per leaf, since demand is per work item; a leaf that already holds a claim always fits, carrying its held units); leaves whose demand does not fit SHALL be listed apart, with their startable step ids, the first exhausting resource in resource-id order, the shortfall and the binding `scope`. Unstated capacities without a directory capacity are not listed; a stated 0 is listed and excludes any demand on it. Each entry SHALL carry `occupancyScope`, the widest scope it is counted in (`'organization'` when its resource states a directory capacity, else `'project'`), and `directory`, null under project scope and otherwise `{ capacity, occupied, free }` with `occupied` held by every leaf of the organization. Under organization scope an entry's `capacity` SHALL be the project's stated capacity, or the directory capacity when the project states none; `occupied` SHALL be this project's leaves; `free` SHALL be the smaller of the project's free units (when stated) and `directory.free`. The read's top-level `occupancyScope` SHALL stay `'project'`: every resource is counted within the project.

#### Scenario: One step fits, one does not

- **WHEN** 4 GB of `h2puni ram` are free, leaf A demands 4 GB and leaf B demands 8 GB, both
  otherwise startable
- **THEN** A's steps are listed as startable and B's steps are listed apart with `h2puni ram`
  and shortfall 4

#### Scenario: B sees what A holds

- **WHEN** `host ram` states 16 for the organization, A's leaves hold 16 and B reads startable
- **THEN** B's entry reads `occupancyScope: 'organization'`, `capacity: 16`, `occupied: 0`,
  `directory: { capacity: 16, occupied: 16, free: 0 }` and `free: 0`, and B's 16 GB leaf is listed under `doesNotFit` with `scope: 'organization'`

#### Scenario: Free in the project, held elsewhere

- **WHEN** B states 16 and holds nothing, A holds 12 of a directory capacity of 16, and a leaf
  of B demands 8
- **THEN** the leaf is listed under `doesNotFit` with shortfall 4 and `scope: 'organization'`

#### Scenario: The project states no capacity of a shared resource

- **WHEN** `host ram` states 16 for the organization, project C states none but demands it,
  C holds 4 and A holds 8
- **THEN** C's entry reads `capacity: 16`, `occupied: 4`,
  `directory: { capacity: 16, occupied: 12, free: 4 }` and `free: 4`

#### Scenario: A shared resource the project never uses

- **WHEN** `gpu` states a directory capacity and project B neither demands it nor states it
- **THEN** B's startable read does not list `gpu`

## ADDED Requirements

### Requirement: Older readers keep parsing the startable read

A startable body carrying organization-scoped entries SHALL parse under the startable response
shape that existed before this change.

#### Scenario: An old client reads a shared resource

- **WHEN** an mcp-01 or fe-01 build from before this change validates a startable body whose
  `host ram` entry is organization-scoped
- **THEN** validation passes, and the top-level `occupancyScope` reads `'project'`
