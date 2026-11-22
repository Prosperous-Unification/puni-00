## MODIFIED Requirements

### Requirement: Typed dependencies have distinct undoable commands

The command registry SHALL accept `addTypedDependency`, `updateTypedDependency` and `removeTypedDependency` with explicit endpoints (whole, step node ID, batch-local node or descendant-step), FS, SS or FF type, and stable relationship identity for updates and removals. Existing `addDependency` and `removeDependency` shapes and legacy project-reach semantics SHALL remain callable through HTTP and MCP. Uniqueness SHALL include both endpoints and type.

A batch-local node endpoint `{ scope: node, workItemRef, stepId }` SHALL name a step of a work item created earlier in the same batch and resolve inside the batch transaction. The command SHALL refuse the endpoint if the work item is not a leaf at execution. Fields `workItemRef` and `predecessorRef` SHALL retain batch-alias semantics, including when an alias resembles a qualified human address.

Every dependency command batch SHALL stay within one successor-owning project and SHALL NOT write relationships owned by another successor project. A successful typed edit SHALL be one journaled command. Undo and redo SHALL restore its exact identity, endpoints and type or refuse stale or conflicting state. Batch validation SHALL include preceding commands from the same batch and return modeled 4xx refusals for invalid references, unsupported types, duplicates or cycles. Refusal SHALL leave the whole batch and its journal unchanged.

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

#### Scenario: A batch creates a work item and depends on its step

- **GIVEN** a batch whose first command creates leaf C with ref `c`
- **WHEN** a later command adds FS from `{ scope: node, workItemRef: c, stepId: Dev }` to node `B.dev`
- **THEN** the relationship names C's Dev step node after commit
- **AND** if any later command is refused, neither C nor the relationship is stored

#### Scenario: Two types share endpoints

- **GIVEN** an FS typed relationship between nodes `A.dev` and `B.dev`
- **WHEN** an SS relationship with the same endpoints is added
- **THEN** both identities are retained; a duplicate SS is refused

#### Scenario: Undo restores FF

- **GIVEN** an FF relationship is edited to SS
- **WHEN** one undo succeeds
- **THEN** the same relationship ID and FF type return

#### Scenario: Conflicting undo is refused

- **GIVEN** a typed edit followed by a concurrent conflicting change
- **WHEN** the first editor requests undo
- **THEN** it refuses visibly without overwriting the concurrent state

#### Scenario: A later batch command closes a cycle

- **GIVEN** an SS or FF dependency added earlier in a command batch
- **WHEN** a later legacy or typed command would close a step-node cycle
- **THEN** the entire batch is refused atomically with the offending command identified

#### Scenario: A qualified-looking batch alias remains an alias

- **GIVEN** a prior command created a work item with ref `PUNI.080.39`
- **WHEN** a later command uses that value as `predecessorRef`
- **THEN** it names the earlier batch-created work item and does not trigger external address lookup
