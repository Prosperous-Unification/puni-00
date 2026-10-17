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

### Requirement: Pure node policy resolution preserves provenance

The domain resolver SHALL accept one concrete step-node pair, a row maximum and an optional
stored override. It SHALL validate the row maximum even when an override is supplied, validate
any supplied override maximum, and reject an override naming either a different work item or
a different step. Absence SHALL return inherited provenance and the row maximum. Presence
SHALL return explicit provenance and the override maximum, including equality with the row
maximum. The resolver SHALL read the supplied maximum once and validate and return that same
captured number. The returned maximum SHALL be detached from the supplied mutable fact. This resolver
slice SHALL leave resource projections, scheduler consumers, writers and stepless boundaries unchanged.

#### Scenario: Equal explicit value remains authored

- **GIVEN** row maximum 1 and an explicit Dev override of 1
- **WHEN** the pure resolver is called before and after the row maximum changes to 4
- **THEN** both calls return explicit provenance and maximum 1

#### Scenario: Resolved policy composes with existing resource clamps

- **GIVEN** row maximum 4, explicit QA maximum 2 and pools of 8 and 3
- **WHEN** the pure resolver output is passed to the existing resource resolver
- **THEN** unnamed Dev has width 3 and unnamed QA has width 2
- **AND** a named QA has width 1 while an unsized-only Dev retains width 4

#### Scenario: Supplied accessor changes between reads

- **GIVEN** an override maximum getter that returns 2 first and 1001 subsequently
- **WHEN** the pure resolver reads the override
- **THEN** it reads the getter exactly once and returns explicit maximum 2

### Requirement: Saved plans preserve sparse authored parallelism

Saved-plan input schema 8 SHALL require a `stepParallels` collection of exact leaf/step pairs
and authored integer maxima from 1 through 1000. Capture and current stored reads SHALL refuse
missing or malformed collections, invalid maxima, duplicate pairs, unknown owners or steps,
and parent owners. Captures SHALL read this collection from the same source snapshot as the
project and remain detached from subsequent writes. Canonical ordering SHALL use owner and
step identity, and comparisons SHALL report additions, removals and maximum changes as capacity
changes at the structured pair. Presence SHALL remain explicit even when equal to the row default.
Schema 7 SHALL upgrade to an empty collection in memory without changing historical bytes.

#### Scenario: Capture preserves equality and absence

- **GIVEN** row maximum 1, an explicit Dev maximum 1 and no QA override
- **WHEN** a saved plan is captured and live overrides are cleared
- **THEN** the captured Dev fact remains 1 and no QA fact is invented

#### Scenario: Legacy history has no authored overrides

- **GIVEN** a stored schema 7 input body
- **WHEN** the current reader normalizes it
- **THEN** its in-memory schema 8 input has an empty override collection and stored bytes remain unchanged

### Requirement: Step removal refuses retained sparse parallelism

Authoritative step removal SHALL refuse either cascade value while the exact target step
has a retained sparse parallelism fact, including explicit equality with the row default.
The typed refusal SHALL be `referenced_by_step_parallel` with detached `nodes` ordered by
work-item and step identity components. HTTP SHALL expose this refusal as 409. Authorization
SHALL precede reference disclosure; absent steps and steps outside the requested project
SHALL remain not-found. The guard SHALL read current facts inside the source write transaction,
including facts inserted after service preflight. Refusal SHALL leave facts, revisions, journal
and events unchanged. Corrupt target facts SHALL throw before mutation, including missing or
foreign owners, parent ownership, invalid maxima and duplicate retained memory pairs.
Clearing the last target fact SHALL permit the existing no-fact removal behavior, preserving
sibling and foreign facts. Mixed units of work SHALL roll back removal and earlier writes together.

#### Scenario: Cascade cannot erase authored parallelism

- **GIVEN** a leaf's explicit Dev maximum equals its row default and QA has a separate override
- **WHEN** Dev is removed with either cascade value
- **THEN** removal refuses with only the Dev node reference and changes no stored state
- **AND** after Dev's fact is explicitly cleared, Dev can be removed while QA remains unchanged

#### Scenario: Late authored fact wins over preflight

- **GIVEN** service preflight observes no generic usage
- **WHEN** another write retains a Dev parallelism fact before authoritative removal
- **THEN** the transaction refuses removal with the current exact Dev references

### Requirement: Version 9 JSON exports refuse unsupported authored parallelism

The current version 9 JSON writer SHALL refuse a valid nonempty sparse parallelism collection
with HTTP 409 and exactly `{ "error": "unsupported_step_parallelism" }`. Explicit equality
with the row default SHALL count as authored policy. The private captured export evidence SHALL
require sparse facts read from the same SQLite observation as the shared project and tree;
isolated exports SHALL read their required project sparse store. Missing, unreadable or corrupt
trusted evidence SHALL throw before document construction. Validation SHALL reject malformed
collections and rows, invalid maxima, duplicate structured pairs, unknown or foreign owners or
steps and parent ownership. Empty sparse evidence SHALL preserve version 9 canonical bytes.
Uncoded-step refusal SHALL precede the modeled unsupported-policy refusal for valid sparse
evidence. Shared trusted-state failures SHALL throw during capture even when steps are uncoded.
Markdown projection, imports and the document version SHALL retain their existing contracts. Export refusal SHALL change no authored fact, revision, journal
or event. No public sparse writer is enabled by this fence.

#### Scenario: Retained equality cannot be silently dropped

- **GIVEN** one leaf step has an explicit maximum equal to its row default
- **WHEN** its project is exported as JSON in isolated or shared mode
- **THEN** export refuses with the bare unsupported_step_parallelism 409 and no writes
- **AND** clearing the final fact restores ordinary version 9 export

#### Scenario: Shared evidence survives later writes

- **GIVEN** a shared export observation captures an authored sparse fact
- **WHEN** another connection clears that fact before the export response is serialized
- **THEN** the export still refuses from its detached captured evidence

### Requirement: Create preserves retained sparse facts before a leaf becomes a parent

Create SHALL consult a required sparse reader from its admitted command scope after
project, actor and parent validation, before allocating a stamp or ID or mutating
any state. A nonnull valid parent with valid retained facts SHALL refuse with
`referenced_by_step_parallel` and detached structured nodes in store order.
Malformed trusted facts and read failures SHALL throw before mutation.

#### Scenario: Explicit equality blocks first-child create atomically

- **GIVEN** a leaf retains one or more explicit step maxima, including its row default
- **WHEN** a command batch patches a row then creates that leaf's first child
- **THEN** the batch refuses with the create command index/kind and exact node pairs
- **AND** earlier writes, journal entries and events roll back
- **AND** parent statements and all step facts remain unchanged

#### Scenario: Empty selected policy permits existing create behavior

- **GIVEN** unrelated siblings or foreign projects retain sparse facts
- **WHEN** creating a root or a child under a parent with no selected facts
- **THEN** create and its existing undo/redo semantics continue unchanged

#### Scenario: Invalid parent and forbidden actor do not consult sparse evidence

- **WHEN** a project or parent is absent or foreign, or an actor lacks admission
- **THEN** existing not-found or forbidden refusal precedes sparse access

#### Scenario: Corrupt existing-parent facts cannot bypass create validation

- **GIVEN** a selected parent already has children and corrupt sparse facts
- **WHEN** another child is requested
- **THEN** the trusted-state failure throws before any writes

### Requirement: Move preserves sparse destination policy before mutation

Forward move SHALL read the required admitted sparse store for each valid nonnull
destination after actor, membership and structural refusals, before stamps, destination
statement clearing or writes. Valid retained facts SHALL refuse with
`referenced_by_step_parallel` and detached exact destination nodes in store order through
shared HTTP 409. Selected corrupt or unreadable trusted evidence SHALL throw, including
existing-parent and same-parent destinations. Root moves SHALL skip sparse reads. Empty
selected policy SHALL preserve movement and unrelated or incoming-subtree sparse facts.

#### Scenario: Mixed command batch cannot make an authored sparse owner a parent

- **GIVEN** destination Dev and QA facts and an unrelated sibling fact
- **WHEN** a batch patches a row and moves another row under that destination
- **THEN** the move command index/kind and only destination Dev/QA nodes reach HTTP 409
- **AND** all earlier writes, destination statements, revisions, journal and events roll back

#### Scenario: Invalid destination and unauthorized actor precede sparse disclosure

- **WHEN** a move names an absent or foreign destination, creates a cycle or lacks admission
- **THEN** the existing structural or access refusal occurs before sparse access

#### Scenario: Undo and redo refuse newly retained destination policy

- **GIVEN** a journalled move whose replay destination later gains valid sparse policy
- **WHEN** undo or redo would move a row beneath that destination
- **THEN** replay refuses as stale_undo even when destination revision is unchanged
- **AND** replay writes roll back and the stale history entry is discarded by existing policy
- **AND** replay with no destination policy succeeds while unrelated sparse facts survive

### Requirement: Work-item deletion refuses retained sparse owners

Before sparse deletion snapshots and history ownership exist, work-item removal SHALL
refuse retained sparse parallelism on the exact removed owners, including explicit equality
with a row default. Leaf and cascade removal SHALL select the removed subtree; promote
SHALL select only its removed root. Valid facts SHALL yield `referenced_by_step_parallel`
with detached exact node references in authoritative store order through HTTP 409, including
command index/kind. Authorization, missing context and required strategy refusals SHALL
precede evidence lookup. Evidence SHALL come from the admitted source scope before stamping,
ID allocation or mutation. Forward refusal SHALL leave statements, sparse facts, revisions,
events and journal unchanged; a mixed command refusal SHALL roll back earlier writes.
Missing, unreadable or corrupt trusted sparse evidence SHALL throw without deletion.

Compensating deletion SHALL independently read its exact `remove` owners before mutation,
after trusted root, subtree and metadata checks, for redo-delete, undo-create and
undo-duplicate. Retained valid policy SHALL produce `stale_undo`, roll back preceding replay
writes and discard the stale entry under existing history policy. Trusted-state read failure
SHALL propagate as HTTP 500 and preserve the exact journal. Empty policy and unrelated or
surviving promoted-child policy SHALL retain existing deletion and replay behavior.

#### Scenario: Cascade retains descendant equality

- **GIVEN** two descendant leaves hold Dev and QA overrides, including explicit equality
- **WHEN** their ancestor is removed with cascade
- **THEN** removal refuses with exactly those descendant references before any writes
- **AND** promoting the ancestor preserves the surviving descendants and every sparse fact

#### Scenario: Newly authored policy blocks compensating deletion without revision drift

- **GIVEN** a completed delete followed by undo, create, or duplicate with one history entry
- **AND** a removed owner gains a sparse fact without changing its revision
- **WHEN** redo-delete, undo-create, or undo-duplicate applies a preceding replay patch
- **THEN** deletion refuses as stale_undo and that patch is rolled back
- **AND** the existing stale-history policy discards the entry while retaining every fact

#### Scenario: Trusted read failure preserves replay history

- **GIVEN** compensating deletion follows a replay patch
- **WHEN** its required sparse reader throws or returns corrupt trusted facts
- **THEN** HTTP returns 500 and rolls back the patch and all deletion state
- **AND** the exact original journal entry remains available

### Requirement: Forward duplication refuses retained source sparse policy

Forward duplication SHALL read the exact original subtree's sparse facts, including
root and parent rows, through the required admitted reader after authorization,
source validation and the existing size refusal. Valid nonempty evidence SHALL
return `referenced_by_step_parallel` with detached nodes in reader order before
allocating IDs, placement, stamps or writes. Absent, unreadable or malformed
selected trusted evidence SHALL throw. Unrelated and foreign policy SHALL retain
its owners and SHALL NOT refuse a selected empty duplication.

#### Scenario: Retained equal-default descendant policy refuses a mixed batch

- **GIVEN** a source subtree leaf with explicit maximum one and unrelated policy
- **WHEN** duplication follows a patch in the same admitted transaction
- **THEN** the shared command returns exact HTTP 409 nodes at the duplicate command
- **AND** the patch, journal, revisions, events and all source facts roll back

#### Scenario: Empty selected policy permits duplication and replay

- **GIVEN** no policy on source subtree rows and retained unrelated policy
- **WHEN** duplication, undo and redo run
- **THEN** each succeeds and unrelated sparse facts retain their exact owners

### Requirement: Restore preserves sparse destination policy before mutation

Compensating subtree restore SHALL read required admitted sparse evidence for
its surviving nonnull root parent after collision, missing-parent, projected
shape, attempts and deletion-state refusals and before blockage replacement or
subtree insertion. Every selected surviving destination SHALL be read, including
already-parented destinations with corrupt policy. A null parent SHALL skip the
sparse read. Valid nonempty policy SHALL return stale_undo, roll back preceding
replay writes and discard the stale entry under existing history policy.
Unreadable, absent or corrupt trusted evidence SHALL throw as HTTP 500, roll
back all replay writes and preserve the exact journal. Redo-duplicate SHALL
replay its historical snapshot without rereading its original source policy.

#### Scenario: Redo-create and undo-delete detect retained policy without revision drift

- **GIVEN** a journalled child create undone for redo or a deleted child awaiting undo
- **AND** the surviving parent gains sparse policy without changing revision
- **WHEN** replay applies a preceding patch and then restores the child
- **THEN** HTTP returns stale_undo and the patch and every restore write roll back
- **AND** the stale journal entry is discarded while every sparse fact survives

#### Scenario: Broken destination evidence preserves history

- **GIVEN** a restore follows a replay patch
- **WHEN** its targeted reader throws or selected policy has corrupt maximum or parent ownership
- **THEN** HTTP returns 500 with all replay writes rolled back and the exact journal preserved

#### Scenario: Earlier refusal and empty destination retain existing behavior

- **WHEN** replay lacks admission or fails revision, typed shape or deletion-state checks
- **THEN** that existing refusal precedes sparse access
- **AND** empty selected policy or unrelated policy permits replay with its exact facts intact
- **AND** root restoration succeeds without consulting a poisoned sparse reader

### Requirement: Terminal project drain validates incident sparse policy

The project arm of terminal optimization drain SHALL validate sparse facts
synchronously inside its existing transaction after absent, open, waiting and
existing dependency refusals and before deletion. Selection SHALL include facts
incident through an owner OR step in the deleting project and SHALL preserve
missing references through left joins. Selected owner and step SHALL exist in
the deleting project, the owner SHALL be a leaf and the maximum SHALL be an
integer from 1 through 1000. Malformed or unavailable trusted evidence SHALL throw
without graph deletion. Valid local policy SHALL cascade with successful terminal
project deletion; bystander policy SHALL remain byte-equal.

#### Scenario: Both incident directions prevent cross-project cascades

- **GIVEN** target-owner/foreign-step or foreign-owner/target-step sparse evidence
- **WHEN** raw finish, last-slot release or expired reclaim reaches terminal project deletion
- **THEN** validation throws and restores all graph, generation, slot and sparse state

#### Scenario: Trusted malformed and unavailable evidence cannot become absence

- **GIVEN** a selected missing owner, missing step, parent owner or invalid maximum
- **OR** absent or unreadable sparse storage
- **WHEN** terminal project deletion is attempted
- **THEN** it throws before cleanup and rolls back preceding slot and generation changes

#### Scenario: Valid policy survives every rollback boundary

- **GIVEN** valid equal-default and unequal target policy plus bystander policy and journal history
- **WHEN** installed deletion or last-slot release fails after capture or during event insertion
- **THEN** graph, sparse facts, journal, slots, events and sequences are restored exactly
- **AND** retry after removing the fault deletes only the target policy and graph

#### Scenario: Existing drain outcomes retain precedence

- **WHEN** a target is absent, open, waiting, contract-only or fails an earlier dependency check
- **THEN** its existing behavior precedes sparse access even if sparse storage is unavailable
