# plan-command-registry Specification

## Purpose

TBD - created by archiving change add-step-finish-start-dependencies. Update Purpose after archive.

## Requirements

### Requirement: Typed dependencies have distinct undoable commands

The command registry SHALL accept `addTypedDependency`, `updateTypedDependency` and `removeTypedDependency` with explicit endpoints (whole, step node ID, batch-local node or descendant-step), FS type and stable relationship identity for updates/removals. Existing `addDependency` and `removeDependency` shapes and legacy project-reach semantics SHALL remain callable through HTTP and MCP. A batch-local node endpoint `{ scope: node, workItemRef, stepId }` SHALL name a step of a work item created earlier in the same batch and SHALL resolve inside the batch transaction; it SHALL be refused if that work item is not a leaf when the command runs. A successful typed edit SHALL be one journaled command; undo/redo SHALL restore its exact identity, endpoints and type or refuse stale/conflicting state. Batch validation SHALL include preceding commands in the same batch and return modeled 4xx refusals for invalid references, duplicates or cycles.

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

### Requirement: setStatus accepts the seven settable statuses and no new kind

The `setStatus` plan command SHALL accept `status` of `unknown`, `draft`, `ready`,
`in_progress`, `on_hold`, `blocked` or `done`, with an optional `on` date, through HTTP and MCP
alike. It SHALL refuse `blocked_by_proxy` and every other value `400 invalid_status` before any
service runs. The registry SHALL keep its current count of command kinds. Its history entry
SHALL use the existing `status` kind and say what was set, such as "put X on hold" or "mark X
ready".

#### Scenario: a derived status cannot be set

- **GIVEN** a `setStatus` command whose `status` is `blocked_by_proxy`
- **WHEN** it reaches the commands route
- **THEN** it is refused `400 invalid_status` and nothing is written

#### Scenario: the kind count does not move

- **GIVEN** the plan command registry after this change
- **WHEN** its kinds are counted
- **THEN** the count equals the count before it

#### Scenario: holding done work is refused

- **GIVEN** a leaf reading `done`
- **WHEN** `setStatus` sets it `on_hold`
- **THEN** it is refused `409 cannot_hold_done` and nothing is written
