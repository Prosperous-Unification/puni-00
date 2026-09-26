## MODIFIED Requirements

### Requirement: Plan transfer preserves typed and legacy dependencies

New-version export SHALL distinguish typed FS, SS and FF endpoint/type relationships from legacy `depReach` links and preserve both on import. Legacy-format import SHALL retain project-reach semantics without invented explicit scopes. Malformed new-format endpoint, step, missing or unsupported type, or duplicate relationship SHALL be refused before any partial plan write. Whole-project copy and subtree duplication SHALL remap internal relationship endpoints and stable IDs according to the copy, preserving external links only under the existing duplication policy and never creating dangling or cross-project endpoints.

#### Scenario: FF round-trip

- **GIVEN** a plan with FF and SS typed relationships
- **WHEN** it is exported and imported
- **THEN** both types and endpoint scopes are unchanged

#### Scenario: Unknown type is refused

- **GIVEN** a new-format import declares type `SF`
- **WHEN** import validation runs
- **THEN** it is refused before any plan write

#### Scenario: Copy remaps an internal FF relationship

- **GIVEN** a copied subtree containing both endpoints of an FF relationship
- **WHEN** the subtree is duplicated
- **THEN** the copied relationship addresses copied work items with a new ID and unchanged scopes/type

#### Scenario: Dangling or duplicate reference is refused

- **GIVEN** a new-format import with a missing step or duplicate typed relationship
- **WHEN** import validation runs
- **THEN** the plan write is refused atomically

#### Scenario: Legacy reach remains legacy

- **GIVEN** a legacy export with `anchor-slice` reach
- **WHEN** it is imported
- **THEN** its dependency retains dynamic project-reach semantics
