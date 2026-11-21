# plan-import Specification

## Purpose

Import and copy WBS plans while preserving typed and legacy dependency meanings.

## Requirements

### Requirement: Plan transfer preserves typed and legacy dependencies

New-version export SHALL distinguish typed endpoint/type relationships from legacy `depReach` links and preserve both on import. Legacy-format import SHALL retain work-package reach semantics; malformed new-format endpoint, scope, step, type or duplicate relationship SHALL be refused, including a node endpoint on a parent or a descendant-step endpoint on a leaf. Copying a work package or duplicating a subtree SHALL remap internal relationship endpoints, step node IDs and stable IDs according to the copy, preserving external prerequisites of copied successors only under the existing duplication policy and never creating dangling endpoints. Internal endpoints SHALL remain within the destination work package; external endpoints SHALL remain explicitly distinguished and SHALL pass current same-organization ownership, endpoint, authorization and graph admission before any write. Inactive external dependency authoring SHALL refuse external declarations atomically.

#### Scenario: Round-trip multiple step links

- **GIVEN** two distinct FS step relationships between the same work-item pair plus one legacy link
- **WHEN** a plan is exported and imported
- **THEN** all three retain their distinct endpoint and reach meanings

#### Scenario: A step reference is absent

- **GIVEN** a new-format import references a step not in its work package step list
- **WHEN** the import is validated
- **THEN** it is refused without a partial plan write

#### Scenario: Duplicate an internal relationship

- **GIVEN** a subtree contains both endpoints of a typed dependency
- **WHEN** the subtree is duplicated
- **THEN** the copied relationship addresses copied work items with a new ID and unchanged scopes/type
