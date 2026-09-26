## ADDED Requirements

### Requirement: Plan transfer preserves typed and legacy dependencies

New-version export SHALL distinguish typed endpoint/type relationships from legacy `depReach` links and preserve both on import. Legacy-format import SHALL retain project-reach semantics; malformed new-format endpoint, step, type or duplicate relationship SHALL be refused. Whole-project copy and subtree duplication SHALL remap internal relationship endpoints and stable IDs according to the copy, preserving external links only under the existing duplication policy and never creating dangling or cross-project endpoints.

#### Scenario: Round-trip multiple step links

- **GIVEN** two distinct FS step relationships between the same work-item pair plus one legacy link
- **WHEN** a plan is exported and imported
- **THEN** all three retain their distinct endpoint and reach meanings

#### Scenario: A step reference is absent

- **GIVEN** a new-format import references a step not in its project step list
- **WHEN** the import is validated
- **THEN** it is refused without a partial plan write

#### Scenario: Duplicate an internal relationship

- **GIVEN** a subtree contains both endpoints of a typed dependency
- **WHEN** the subtree is duplicated
- **THEN** the copied relationship addresses copied work items with a new ID and unchanged scopes/type
