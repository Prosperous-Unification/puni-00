# plan-import Specification

## Purpose

TBD - created by archiving change add-step-finish-start-dependencies. Update Purpose after archive.

## Requirements

### Requirement: Plan document v6 carries readiness and hold

Plan document version 6 introduced the nullable `readiness` and `hold` fields on authored
work items. The current ordinary writer SHALL emit version 11 and the connected writer version 12.
Both SHALL preserve each authored status fact, with `null` for an unsaid fact. Ordinary import
SHALL retain support for versions 1 through 10 alongside current version 11; versions 1 through 5
SHALL import both fields as `null`. On an admitted version carrying these fields, import SHALL
refuse a missing field, value outside its vocabulary, or readiness or hold on a parent with
`invalid_body` before any project is written. Import SHALL accept an otherwise valid hold on a
done leaf, since setting step progress can retain that hold and the row status reads `done`.
Spreadsheet export SHALL carry each row’s status word.

#### Scenario: a round trip keeps a hold

- **GIVEN** a plan with one leaf `ready` and `on_hold`
- **WHEN** it is exported and imported into a new project
- **THEN** the imported leaf holds readiness `ready` and hold `on_hold`

#### Scenario: an older document imports with nothing said

- **GIVEN** a version 5 plan document
- **WHEN** it is imported
- **THEN** every work item has readiness and hold `null`

#### Scenario: an unknown hold is refused

- **GIVEN** a version 6 document with `hold: 'paused'`
- **WHEN** it is imported
- **THEN** it is refused `invalid_body` and no project is created

#### Scenario: a leaf held and then marked done round-trips

- **GIVEN** a leaf holding `on_hold` whose every step is then marked done
- **WHEN** the plan is exported and the file imported again
- **THEN** the import is accepted and the leaf reads `done`

### Requirement: Plan transfer preserves typed and legacy dependencies

New-version export SHALL distinguish typed endpoint/type relationships from legacy `depReach` links and preserve both on import. Legacy-format import SHALL retain project-reach semantics; malformed new-format endpoint, scope, step, type or duplicate relationship SHALL be refused, including a node endpoint on a parent or a descendant-step endpoint on a leaf. Whole-project copy and subtree duplication SHALL remap internal relationship endpoints, step node IDs and stable IDs according to the copy, preserving external links only under the existing duplication policy and never creating dangling or cross-project endpoints.

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
