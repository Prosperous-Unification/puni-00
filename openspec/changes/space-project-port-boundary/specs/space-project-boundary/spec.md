## ADDED Requirements

### Requirement: Neutral space project reader

SpaceResource SHALL accept a neutral ProjectRead port extending ProjectList with `readWithin(id: string, access: ResourceAccess): Promise<ZonedProjectWithSteps | null>`. ProjectWithSteps, ZonedProject and ZonedProjectWithSteps SHALL retain their exact shapes in the neutral port and remain exported by the project resource. The port MUST NOT depend on the concrete project resource directly or transitively.

#### Scenario: Composition preserves project authority

- **WHEN** spaces list, read, add, move or remove projects
- **THEN** the existing project resource supplies listWithin and readWithin through composition
- **AND** inaccessible projects and anchors retain their existing refusals
- **AND** mounted controller and SQLite ordering, authorization and rollback behavior remain unchanged

#### Scenario: Committed boundary is neutral

- **WHEN** the production K6 CLI evaluates the candidate with the retained external policy
- **THEN** the space resource has no edge to the project resource
- **AND** unrelated findings remain unchanged, unevaluated is empty and certifies remains false

#### Scenario: Concrete dependencies are detected

- **WHEN** a committed candidate restores the concrete Pick directly or through a neutral-looking re-export
- **THEN** the production K6 CLI reports the space-to-project resource edge
- **AND** the boundary oracle refuses the candidate
