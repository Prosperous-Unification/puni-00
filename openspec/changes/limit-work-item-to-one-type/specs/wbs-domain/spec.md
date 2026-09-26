## ADDED Requirements

### Requirement: A work item carries at most one type

A work item SHALL carry zero or one work item type. Every authored write that sets a work item's types SHALL replace them with at most one, checked in the same transaction as the write. Undo/redo restoration and copying SHALL reproduce the exact stored set and SHALL NOT be reachable from an authored command. A work item that already carries several types SHALL read as a type conflict showing all of them, SHALL keep them until a write replaces them with zero or one, and SHALL accept edits to its other fields unchanged. No read, migration or background process SHALL choose one of a conflict's types. Types SHALL NOT inherit, and filtering by a type SHALL match a conflicted work item carrying it.

#### Scenario: Choosing a second type replaces the first

- **GIVEN** a work item typed `Story`
- **WHEN** `Spike` is chosen in its Type cell
- **THEN** it carries `Spike` only and one undo restores `Story`

#### Scenario: A legacy multi-type row is a visible conflict

- **GIVEN** a work item stored with `Story` and `Spike`
- **WHEN** the plan is read
- **THEN** its Type cell shows both, flagged as a type conflict, with a way to keep one
- **AND** neither type is removed until somebody picks

#### Scenario: Resolving a conflict is undoable

- **GIVEN** a type conflict of `Story` and `Spike`
- **WHEN** `Story` is kept
- **THEN** the work item carries `Story` only and one undo restores both types

### Requirement: The Type cell selects one type

The Type cell SHALL offer single selection: choosing a type SHALL replace the current type in one undoable write, clearing SHALL leave the work item untyped, and naming a type the directory does not hold SHALL create it and select it. The cell SHALL keep its one-line height.

#### Scenario: Clearing the type

- **GIVEN** a work item typed `Epic`
- **WHEN** its type is cleared
- **THEN** its Type cell is blank and it does not show a parent's type
