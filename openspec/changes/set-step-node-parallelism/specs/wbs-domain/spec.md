## ADDED Requirements

### Requirement: Step maximum parallelism is a sparse authored fact

The system SHALL store at most one maximum parallelism fact for each concrete
`(workItemId, stepId)` pair. Values SHALL be integers from 1 through 1000. The owner SHALL
exist, be a leaf, and belong to the same project as the referenced existing step. Absence
SHALL remain distinct from a stored value equal to the work item's default. Set SHALL
replace only its pair; remove SHALL restore absence. Invalid trusted state SHALL throw
on read, including missing owners or steps, parent ownership, cross-project steps, invalid
values and duplicate pairs. Project reads SHALL NOT hide an ownerless fact through a join.

#### Scenario: Explicit equal-default survives a default change

- **GIVEN** a row default of 1 and a stored Dev override of 1
- **WHEN** the row default becomes 4
- **THEN** Dev retains its explicit 1 and an unstated QA continues inheriting 4

#### Scenario: Replacing and removing one pair preserves others

- **GIVEN** Dev and QA overrides on a leaf
- **WHEN** Dev is set twice and then removed
- **THEN** Dev has no fact and QA retains its original value

#### Scenario: Invalid facts are refused independently

- **WHEN** a write names a parent, foreign-project step, missing owner, missing step,
  fractional value, value below 1 or value above 1000
- **THEN** the write fails without changing stored facts

#### Scenario: Corruption remains visible

- **GIVEN** a retained override whose referenced step or owner was removed outside the adapter
- **WHEN** the affected project is read
- **THEN** the read throws rather than silently omitting the fact or inheriting a default

### Requirement: Override writes share the source transaction

The memory and SQLite sources SHALL expose the same internal sparse store semantics.
Committed writes SHALL be visible to readers outside the unit of work. A refused or throwing
batch SHALL preserve all previous facts, including replacements and removals. SQLite SHALL
preserve creation audit on replace, update modification audit and bump the owner's revision
in the same transaction. Source inventories SHALL include this store explicitly.

#### Scenario: Late failure rolls back a mixed override batch

- **GIVEN** an existing Dev override
- **WHEN** a batch replaces Dev, adds QA, removes Dev and fails or refuses commit
- **THEN** outside readers see exactly the original Dev fact and no QA fact

### Requirement: Persistence rollout preserves meaning

The forward migration SHALL be additive with a paired down migration. Downgrade SHALL
refuse while any override remains and SHALL retain both table and migration ledger. Public
writers SHALL stay disabled until compatible readers, lifecycle and transfer guards are
released and incompatible writers are drained. An empty table SHALL permit rollback.

#### Scenario: Retained facts block rollback

- **GIVEN** one stored override
- **WHEN** schema rollback would remove its table
- **THEN** rollback fails with an explicit preservation/removal instruction and retains the fact

### Requirement: Public editing eventually authors or clears one node policy

The complete feature SHALL offer authorized structured-node set and clear operations through
the common command path used by HTTP, MCP, batches and UI. It SHALL reject non-leaf and
cross-project targets transactionally, journal exact before/after sparse facts, publish revision
changes and preserve absence through undo/redo. A step-cell editor SHALL display whether its
value is inherited or explicit, including explicit equality with the row default.

#### Scenario: Undo restores an explicit equal-default override

- **GIVEN** an explicit Dev value equal to the row default
- **WHEN** the user clears the override and undoes that clear
- **THEN** the explicit fact returns rather than an indistinguishable inherited value

### Requirement: Node policy eventually resolves before resource clamps

The complete feature SHALL resolve explicit node maximum parallelism before the row default,
then apply the existing named-person width of 1 and narrowest configured pool clamp. Fast,
optimized request construction, independent publication validation and live node resource
reads SHALL agree. Unknown and zero-duration nodes SHALL retain current zero-resource rules.
This foundation SHALL leave all existing scheduling and Stage 7a reads unchanged.

#### Scenario: One node differs from its sibling

- **GIVEN** row default 4, explicit QA maximum 2 and a pool of 3
- **WHEN** the complete feature resolves resources without a named assignee
- **THEN** Dev has width 3 and QA has width 2

### Requirement: Lifecycle and transfers eventually preserve authored overrides

The complete feature SHALL account for overrides on first-child hand-down, leaf restoration,
work-item and step deletion, project deletion, duplication, imports/exports, saved-plan capture,
rollback and history replay. Identity-preserving edits SHALL preserve facts. Transfers SHALL
remap structured IDs and preserve absence versus explicit equality. An edit without an
unambiguous preservation mapping SHALL refuse before losing authored meaning. Document and
snapshot versions SHALL be allocated after inspecting current schemas; unsupported versions
SHALL fail visibly.

#### Scenario: First-child hand-down retains a policy

- **GIVEN** a leaf with an explicit Dev override
- **WHEN** its first child is added through the complete feature
- **THEN** the override is remapped with the other concrete node facts in the same transaction,
  or the operation refuses atomically with the affected reference
