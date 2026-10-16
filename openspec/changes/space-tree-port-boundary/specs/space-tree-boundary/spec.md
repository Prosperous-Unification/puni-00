## ADDED Requirements

### Requirement: Spaces read trees through a neutral application port

SpaceResource SHALL depend on TreeRead without a direct or transitive concrete work-item resource import. TreeRead SHALL preserve the existing treeWithin and sharedTreesWithin signatures and complete payload shapes, including null, AccessRefused and EngineUnavailable outcomes. The shared entry type SHALL remain derived from the port method. Existing work-item resource type exports SHALL remain available.

#### Scenario: Committed space dependency is removed

- **WHEN** the committed K6 production path evaluates the extraction against its immutable base with unchanged external policy
- **THEN** exactly the space-to-work-item finding is removed
- **AND** the plan-import-to-directory finding remains identical

#### Scenario: Concrete imports are reintroduced

- **WHEN** a direct concrete Pick or a transitive neutral-looking port re-export is injected into committed candidate material
- **THEN** the production K6 path restores the space-to-work-item finding
- **AND** the exact boundary comparison fails

### Requirement: Space tree reads preserve their existing behavior

Composition SHALL supply the existing work-item resource instance to TreeRead without adapters or unbound methods. Access filtering, shared scheduling projections and cache admission SHALL preserve their existing semantics.

#### Scenario: Existing space reads retain filtering and cache behavior

- **WHEN** space roll-ups or in-progress leaves read isolated or shared trees
- **THEN** inaccessible members remain excluded, unavailable engines remain explicit, scoped assignee names remain scoped, and cached reads retain their sequence, revision, access and shared basis keys
