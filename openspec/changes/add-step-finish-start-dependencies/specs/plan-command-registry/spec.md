## ADDED Requirements

### Requirement: Typed dependencies have distinct undoable commands

The command registry SHALL accept `addTypedDependency`, `updateTypedDependency` and `removeTypedDependency` with explicit endpoints, FS type and stable relationship identity for updates/removals. Existing `addDependency` and `removeDependency` shapes and legacy project-reach semantics SHALL remain callable through HTTP and MCP. A successful typed edit SHALL be one journaled command; undo/redo SHALL restore its exact identity, endpoints and type or refuse stale/conflicting state. Batch validation SHALL include preceding commands in the same batch and return modeled 4xx refusals for invalid references, duplicates or cycles.

#### Scenario: Old client adds a dependency

- **GIVEN** an old client sends `addDependency` with work-item references only
- **WHEN** the command executes
- **THEN** it creates a legacy `depReach` link with its existing behavior

#### Scenario: Typed edit and undo

- **GIVEN** an FS typed relationship between selected steps
- **WHEN** it is edited to another valid endpoint and then undone
- **THEN** one undo restores the prior endpoints, type and ID
- **AND** a concurrent conflicting change causes a visible stale-undo refusal

#### Scenario: Batch closes a slice cycle

- **GIVEN** one typed dependency was added earlier in a command batch
- **WHEN** a later command would close an expanded slice cycle
- **THEN** the batch is refused atomically with the offending command identified
