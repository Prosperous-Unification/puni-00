## MODIFIED Requirements

### Requirement: Typed dependencies have distinct undoable commands

The command registry SHALL accept `addTypedDependency`, `updateTypedDependency` and `removeTypedDependency` with explicit endpoints (whole, step node ID, batch-local node or descendant-step), FS/SS/FF type and stable relationship identity for updates/removals. Existing `addDependency` and `removeDependency` shapes and legacy project-reach semantics SHALL remain callable through HTTP and MCP. A batch-local node endpoint `{ scope: node, workItemRef, stepId }` SHALL name a step of a work item created earlier in the same batch and SHALL resolve inside the batch transaction; it SHALL be refused if that work item is not a leaf when the command runs. `workItemRef` and `predecessorRef` SHALL retain batch-alias semantics and SHALL NOT be interpreted as qualified human addresses. Authorized external endpoints SHALL be accepted by stable identity after requiring successor edit access and predecessor read access in the same organization. Every dependency command batch SHALL retain one successor-owning project scope and SHALL NOT write relationships owned by another successor project. Any direct human-address input SHALL use an explicitly declared address field and observed address revision, resolve before binding, and refuse stale or ambiguous input. A successful typed edit SHALL be one journaled command; undo/redo SHALL restore its exact identity, endpoints and type or refuse stale/conflicting state. Batch validation SHALL include preceding commands in the same batch, revalidate external ownership and endpoint existence inside the write transaction, and return modeled 4xx refusals for invalid references, authorization, duplicates or actual resolved task/step cycles. A cycle in project-to-project references alone SHALL NOT refuse an otherwise acyclic resolved graph. Refusal SHALL leave the entire batch and its journal unchanged.

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

#### Scenario: A qualified-looking batch alias remains an alias

- **GIVEN** a prior command created a work item with ref `PUNI.080.39`
- **WHEN** a later command uses that value as `predecessorRef`
- **THEN** it names the earlier batch-created work item and does not trigger external address lookup

#### Scenario: Authorized projects interleave their steps

- **WHEN** an authorized batch owned by project B authors `A.design → B.build` and a separate authorized batch owned by project A authors `B.build → A.test`
- **THEN** each relationship commits if the resolved task/step graph remains acyclic at its transaction admission
- **AND** each batch writes only relationships owned by its successor project
- **AND** HTTP and MCP use the same command admission and refusal contract

#### Scenario: External access changes before commit

- **WHEN** an external predecessor is missing, belongs to another organization, or no longer readable at transaction admission
- **THEN** its command receives a modeled refusal and no part of the batch or journal is committed

#### Scenario: An external edit is undone after endpoint deletion

- **WHEN** undo would restore a dependency whose external endpoint no longer exists
- **THEN** undo visibly refuses without restoring a dangling relationship or partially replaying its batch

#### Scenario: Explicit endpoint project preserves stable identity

- **GIVEN** a typed command contains an endpoint with explicit `projectId` and stable work-item/step IDs or a supported node ID
- **WHEN** the command binds inside its successor-owned batch
- **THEN** it preserves the explicit project and validates each endpoint against that project's current facts
- **AND** an omitted endpoint project retains the existing batch-local interpretation

#### Scenario: Explicit project cannot borrow a local alias

- **WHEN** a typed endpoint supplies both `projectId` and `workItemRef`, including when the project equals the batch owner
- **THEN** shared HTTP/MCP semantic admission rejects the conflicting form without writes

#### Scenario: Legacy read authority does not grant external authoring

- **GIVEN** a caller has deployment-wide legacy access rather than admitted organization authority
- **WHEN** it attempts to author an external typed relationship
- **THEN** the write is forbidden without inferring a grant from endpoint ownership records
- **AND** its existing authorized local dependency behavior is unchanged

#### Scenario: A service consumes current external authoring authority

- **GIVEN** a WorkItemService was constructed with a valid explicit external-authoring capability
- **WHEN** an external add, update in either direction, remove, retained incoming copy or typed-history undo/redo reaches its authoring admission point
- **THEN** it reads the current capability after existing principal, owner and endpoint concealment checks
- **AND** an inactive capability refuses atomically, including earlier commands in the batch, while an unreadable capability throws and rolls back
- **AND** a capability that became active after construction permits otherwise valid semantic operations without reconstructing the service
- **AND** constructor validation, local-command independence and exact derived incident-history replay without general authoring remain required
- **AND** production composition remains explicitly inactive; this consumption hardening neither activates authoring nor advertises supported semantics

## ADDED Requirements

### Requirement: Prepared MCP document preserves generated command admission

MCP startup SHALL read a required OpenAPI artifact generated from the same
checkout during image/build or uncached source preparation. Startup SHALL NOT
construct shared HTTP validators or import contracts/core runtime barrels.
Command inputs, names and exclusion refusals SHALL match current declarations.

#### Scenario: Prepared runtime starts without shared schema construction

- **GIVEN** preparation emitted the current shared declarations beside the MCP runtime
- **WHEN** the runtime derives its tool table while contracts/core runtime barrels are unavailable
- **THEN** the generated commands, including external typed endpoints, retain their inputs and exclusions
- **AND** startup succeeds without loading those barrels

#### Scenario: Required startup artifact is unusable

- **WHEN** the required sibling artifact is missing, unreadable, malformed JSON or cannot derive an unambiguous tool table
- **THEN** MCP startup refuses before serving tools
- **AND** it does not generate or substitute a document at runtime
