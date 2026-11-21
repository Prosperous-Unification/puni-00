## ADDED Requirements

### Requirement: External dependency commands bind and revalidate successor-owned mutations

An external dependency command SHALL bind explicit stable endpoints and require edit access to the successor and read access to the predecessor within the same organization. A project-bound external endpoint SHALL NOT borrow a local batch alias.

Direct human-address input SHALL use an explicitly declared address field and an observed address revision. The command SHALL resolve the address before binding and refuse stale or ambiguous values. Legacy read authority SHALL NOT grant external authoring. Service callers SHALL consume current external authoring authority.

The write transaction SHALL revalidate current ownership, authorization and endpoint existence with preceding batch commands. It SHALL refuse invalid references, authorization, duplicates and actual resolved work-item or step cycles with modeled 4xx outcomes. Cyclic project connectivity alone SHALL NOT reject an acyclic resolved graph. Refusal SHALL leave the whole batch and its journal unchanged. Undo and redo SHALL preserve exact relationship identity, endpoints and type when still valid, and refuse stale, deleted or conflicting endpoints.

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

### Requirement: Prepared MCP document preserves generated command admission

MCP startup SHALL read a required same-checkout OpenAPI artifact produced during
image/build or uncached source preparation. Startup SHALL NOT construct HTTP
validators or import contracts/core runtime barrels. Tools SHALL match current
shared declarations and exclusions. Dev source deploy SHALL restart its
supervisor on generation source/config changes, rerunning preparation before
MCP serves.

#### Scenario: Prepared runtime starts without shared schema construction

- **GIVEN** preparation emitted the current shared declarations beside the MCP runtime
- **WHEN** the runtime derives its tool table while contracts/core runtime barrels are unavailable
- **THEN** the generated commands, including external typed endpoints, retain their inputs and exclusions
- **AND** startup succeeds without loading those barrels

#### Scenario: Required startup artifact is unusable

- **WHEN** the required sibling artifact is missing, unreadable, malformed JSON or cannot derive an unambiguous tool table
- **THEN** MCP startup refuses before serving tools
- **AND** it does not generate or substitute a document at runtime

#### Scenario: A generator input changes during source deployment

- **GIVEN** dev MCP serves a document prepared from the previous checkout
- **WHEN** source deployment changes contracts, emitter or WBS/shared validation sources or their alias configuration
- **THEN** the deployment restarts the supervisor and reruns uncached MCP preparation
- **AND** command definitions outside the HTTP directory appear in the new generated tool contract
