## ADDED Requirements

### Requirement: Neutral project-list dependency

Project rank SHALL obtain the caller's project names through a neutral application port whose `listWithin(actorId, access)` accepts `ResourceAccess` and returns `Promise<ProjectWithAccess[]>`. That port and the rank resource MUST NOT import or re-export the concrete project resource, directly or transitively.

#### Scenario: Concrete resource remains wired by composition

- **WHEN** the mounted application reads or moves the organization's project rank
- **THEN** the existing project resource supplies the project-list port
- **AND** names, access refusals, rank order, committed fan-out and rollback retain their existing behavior

#### Scenario: Production architecture oracle sees a concrete dependency

- **WHEN** a committed candidate restores the concrete project resource dependency directly or through a neutral-looking barrel
- **THEN** the production K6 CLI reports the rank resource's edge to the project resource
- **AND** the boundary oracle refuses that candidate

#### Scenario: Neutral port removes only the rank edge

- **WHEN** the committed candidate uses the neutral project-list port
- **THEN** the production K6 CLI evaluates the selected graph and reports no rank-to-project resource edge
- **AND** unrelated K6 findings remain visible
