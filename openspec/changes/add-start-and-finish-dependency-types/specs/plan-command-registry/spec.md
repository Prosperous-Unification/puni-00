## MODIFIED Requirements

### Requirement: Typed dependencies have distinct undoable commands

The command registry SHALL accept `addTypedDependency`, `updateTypedDependency` and `removeTypedDependency` with explicit endpoints, FS, SS or FF type, and stable relationship identity for updates/removals. Existing `addDependency` and `removeDependency` shapes and legacy project-reach semantics SHALL remain callable through HTTP and MCP. A successful typed edit SHALL be one journaled command; undo/redo SHALL restore its exact identity, endpoints and type or refuse stale/conflicting state. Batch validation SHALL include preceding commands in the same batch and return modeled 4xx refusals for invalid references, unsupported types, duplicates or cycles; refusal SHALL leave the batch atomic. Uniqueness SHALL include both endpoints and type.

#### Scenario: Two types share endpoints

- **GIVEN** an FS typed relationship between A.Dev and B.Dev
- **WHEN** an SS relationship with the same endpoints is added
- **THEN** both identities are retained; a duplicate SS is refused

#### Scenario: Undo restores FF

- **GIVEN** an FF relationship is edited to SS
- **WHEN** one undo succeeds
- **THEN** the same relationship ID and FF type return

#### Scenario: Old client adds a dependency

- **GIVEN** an old client sends `addDependency` with work-item references only
- **WHEN** the command executes
- **THEN** it creates a legacy `depReach` link with its existing behavior

#### Scenario: Conflicting undo is refused

- **GIVEN** a typed edit followed by a concurrent conflicting change
- **WHEN** the first editor requests undo
- **THEN** it refuses visibly without overwriting the concurrent state

#### Scenario: A later batch command closes a cycle

- **GIVEN** an SS or FF dependency added earlier in a command batch
- **WHEN** a later legacy or typed command would close a slice cycle
- **THEN** the entire batch is refused atomically with the offending command identified
