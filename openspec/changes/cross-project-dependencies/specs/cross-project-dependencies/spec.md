## ADDED Requirements

### Requirement: Cross-project relationships retain endpoint identity and successor ownership

A cross-project dependency SHALL retain stable predecessor and successor project/work-item/step identities and its existing FS, SS or FF type and whole, node or descendant-step scopes. Its successor project SHALL own its edits and history. Creation or editing SHALL require successor edit permission and readable endpoints within the same organization; foreign and absent targets SHALL be indistinguishable.

#### Scenario: Readable restricted predecessor

- **GIVEN** a caller can edit the successor project and read but not edit the predecessor project
- **WHEN** the caller adds an otherwise valid external dependency
- **THEN** the relationship is accepted without modifying the predecessor's authored fields

#### Scenario: Foreign endpoint is concealed

- **WHEN** the caller supplies an endpoint from another organization
- **THEN** the operation refuses indistinguishably from an absent endpoint and stores no relationship, revision, history or event

### Requirement: Cycles are judged in the resolved task and step graph

Validation SHALL include every affected project's authored, legacy and workflow edges in one coherent resolved step-node graph. It SHALL reject actual directed cycles and self-node pairs, including cycles introduced by selector expansion. It SHALL NOT reject a graph merely because traversal returns to a project or work item through different nodes.

#### Scenario: Valid project interleaving

- **GIVEN** project A contains Design then Test and project B contains Build
- **WHEN** A.Design → B.Build and B.Build → A.Test are added
- **THEN** both relationships are accepted and their order is respected

#### Scenario: Genuine external cycle

- **GIVEN** A.Design → B.Build already exists
- **WHEN** B.Build → A.Design is added
- **THEN** the write refuses atomically as a cycle

#### Scenario: Different task names still form a cycle

- **GIVEN** A.Design → B.Build and B.Build → A.Test
- **WHEN** A.Test → A.Design is proposed
- **THEN** the cycle is refused even though it spans different tasks and projects

### Requirement: Dependencies remain hard constraints before priority

After the existing hold reduction, the scheduler SHALL honor dependency eligibility and each remaining FS, SS or FF inequality before project or work-item priority. A lower-ranked project or lower-priority work item SHALL remain a valid predecessor. Both engines and every displayed projection SHALL satisfy the same reduced connected constraints; authored graph validation SHALL remain unreduced.

#### Scenario: Higher-priority task waits locally

- **GIVEN** a low-priority work item precedes a high-priority work item in one project
- **WHEN** their FS schedule is calculated
- **THEN** the low-priority predecessor finishes before the successor starts

#### Scenario: Higher-ranked project waits remotely

- **GIVEN** a high-ranked project's task has a low-ranked project's task as its FS predecessor
- **WHEN** dates are calculated with shared people enabled or disabled
- **THEN** the predecessor finishes before the successor starts without requiring a project-rank edit

### Requirement: Held external work retains existing scheduling semantics

Scheduling SHALL remove held leaves, fully held ancestors and incident edges,
including external edges, using the existing hold reduction. Partly held
selectors SHALL expand over surviving leaves. The authored relationships and
captured hold evidence SHALL remain visible, and readiness SHALL retain the
same semantics as equivalent local relationships. Hold SHALL NOT disable
authored cycle or structural validation.

#### Scenario: Held external predecessor does not delay placement

- **GIVEN** A's five-day leaf is the only FS predecessor of B's unheld leaf and both project anchors are known
- **WHEN** A's leaf is put on hold and the connected schedule is read
- **THEN** neither engine places A's held leaf or delays B solely for that relationship
- **AND** the external relationship, A's hold evidence and existing local-equivalent readiness remain inspectable

#### Scenario: Held relationships still participate in authored cycle checks

- **GIVEN** held A precedes B through an external relationship
- **WHEN** B is proposed as A's predecessor on the same resolved nodes
- **THEN** authored graph validation refuses the actual cycle despite A being absent from scheduling input

### Requirement: Connected derivation uses one coherent captured state

Graph validation, scheduling and readiness SHALL consume a coherent snapshot of the involved project settings, steps, work items, relationships, capacities and progress. The snapshot SHALL include all incident dependencies and shared-capacity influences needed for the result. Missing or unreadable required endpoint state SHALL produce an explicit failure, never an omitted edge or an apparently ready successor.

#### Scenario: Predecessor changes during capture

- **WHEN** a predecessor edit commits concurrently with a connected-plan read
- **THEN** the read uses one consistent pre-edit or post-edit state, not mixed endpoint facts

#### Scenario: Required endpoint evidence is unavailable

- **WHEN** a connected dependency cannot supply its required endpoint evidence
- **THEN** the read fails explicitly without publishing an unconstrained successor schedule

### Requirement: Calendar placement preserves each project's start

Connected placement SHALL translate each project's workday coordinates through its own start date while preserving its estimate, step-order, floor and deadline semantics. It SHALL preserve existing shared versus isolated people-capacity rules and project-local capacity limits. An undated external prerequisite SHALL still be linkable and affect readiness; calendar placement requiring its unknown anchor SHALL report an explicit unavailable-date state.

#### Scenario: Different start dates

- **GIVEN** a predecessor and successor project begin on different dates
- **WHEN** their FS dependency is scheduled
- **THEN** its bound is compared on the same calendar axis and each displayed date respects its project start

#### Scenario: Undated prerequisite

- **GIVEN** a dated project depends on an undated project's work
- **WHEN** calendar placement requires that external boundary
- **THEN** the UI reports the missing project start date and does not substitute day zero
- **AND** the relationship and its readiness effect remain visible

### Requirement: Structural writes and history preserve external graph integrity

Dependency-affecting edits, tree and step mutations, dynamic anchor changes, undo/redo and batches SHALL validate the complete resulting connected graph in their transaction. Refusal SHALL preserve authored state, revisions, journal and events. First-child hand-down SHALL carry incident endpoint mappings atomically without changing their scope.

#### Scenario: Undo would now create a cycle

- **GIVEN** another project has added a relationship since an edge was removed
- **WHEN** undo would restore that edge and close a connected cycle
- **THEN** undo refuses atomically with the conflict visible

#### Scenario: Hand-down keeps external endpoint identity

- **GIVEN** a leaf step has an external dependency
- **WHEN** its first child inherits that step through hand-down
- **THEN** the relationship follows the same hand-down mapping and affected projects are invalidated together

#### Scenario: Exact structural mapping can retain a restricted remote successor

- **GIVEN** the actor can edit the structural project and currently read every required endpoint, including a restricted remote successor they cannot edit
- **WHEN** a leaf gains its first child, or that exact structural change is undone or redone
- **THEN** only incident node endpoints on that structural row follow the exact child mapping
- **AND** relationship ID, successor ownership, type, scope, step and creation audit remain unchanged
- **AND** one compound history entry belongs to the structural project; no remote entry is created or silently rebased
- **AND** ordinary edits of the remote-owned relationship remain forbidden

#### Scenario: Replay cannot overwrite changed incident evidence

- **GIVEN** the structural command recorded exact original and mapped incident receipts and all remote endpoint revisions
- **WHEN** an endpoint revision, relationship snapshot, required readable endpoint or exact incident set has changed
- **THEN** replay refuses atomically, including a relationship type edit that did not bump endpoint revisions
- **AND** missing or malformed trusted receipts are corruption rather than permission to capture a new mapping

#### Scenario: Other authored scopes retain their attachment

- **GIVEN** whole endpoints or ancestor descendant-step endpoints surround the leaf gaining a first child
- **WHEN** its node endpoints are handed down
- **THEN** those other scopes retain their authored work-item and step identities
- **AND** adding a second child does not remap the first child's node endpoints again

### Requirement: Deleting an external prerequisite requires explicit relationship removal

Deleting a project, work item or step that would remove an externally referenced predecessor SHALL refuse until affected relationships are removed or explicitly reassigned by authorized editors. Deleting a successor SHALL remove its owned incoming relationships in its existing undoable transaction. Internal-only deletion behavior SHALL remain unchanged.

#### Scenario: External blocker is not silently removed

- **GIVEN** project B's task waits on project A's task
- **WHEN** A's editor deletes the referenced task or project
- **THEN** deletion refuses and B's prerequisite remains intact

### Requirement: External progress drives existing readiness and live reads

External progress, holds, relevant dates and structural edits SHALL invalidate and notify every affected dependent projection. Readiness and startable admission SHALL use the same relationship and node-status semantics as equivalent local edges. Derived external readiness SHALL NOT be separately authored or silently retained after its evidence changes.

#### Scenario: External predecessor completes

- **GIVEN** B is waiting only on an unfinished FS predecessor in A
- **WHEN** that predecessor completes
- **THEN** B's live readiness and startable read reflect the new state without a manual dependency edit

### Requirement: Execution eligibility honors local and remote prerequisites

Advertised startability and governed step-start admission SHALL apply the same
resolved rules locally and remotely: FS needs predecessor completion, SS needs
actual start or completion, and FF exposes a finish condition without blocking
start. Rank, priority, forecasts and zero duration SHALL NOT replace progress.
Existing hold, blockage, claim and resource conditions still apply.

#### Scenario: Unfinished local or remote FS excludes a new start

- **GIVEN** an otherwise startable step has an unfinished FS predecessor in its own or another project
- **WHEN** startability is read or a governed new step start is requested
- **THEN** the dependent step is excluded or refused regardless of rank or priority
- **AND** completing the predecessor releases that prerequisite condition

#### Scenario: SS and FF retain their boundary meanings

- **GIVEN** a step has an SS or FF predecessor
- **WHEN** execution eligibility is derived
- **THEN** SS permits start after observed predecessor start, while FF permits start and reports an unmet finish condition until predecessor completion

### Requirement: Execution evidence remains coherent and manual corrections remain explicit

Execution eligibility SHALL use required progress and attempts from the same
observation. Manual progress and actual-date corrections SHALL retain their
existing override policy and SHALL NOT be mislabeled as dependency-approved
execution.

#### Scenario: Missing required execution evidence

- **WHEN** a required connected project's attempt or progress evidence cannot be read
- **THEN** eligibility fails explicitly rather than substituting empty evidence

#### Scenario: Manual corrections remain observations

- **GIVEN** a planner corrects a manual progress statement or actual date under its existing permission policy
- **WHEN** prerequisite evidence disagrees with that correction
- **THEN** the correction remains permitted and visible as an authored observation rather than being represented as dependency-approved execution

#### Scenario: All unfinished steps preserve all-or-none claim meaning

- **GIVEN** a leaf has both permitted and prerequisite-blocked unfinished steps
- **WHEN** a claim omits `steps`, or explicitly requests both kinds
- **THEN** the whole claim is refused with `prerequisites_unmet`, blocked target step IDs and resolved predecessor identities, relationship types and provenance
- **AND** no claim, progress, assignment, occupancy, journal, revision or event is written
- **AND** explicitly selecting only a permitted step remains possible under the other claim rules

#### Scenario: Continuing work and ownership remain distinct

- **GIVEN** an upstream edit makes a prerequisite false after a target step actually started
- **WHEN** that step is advertised or acquired by a new holder
- **THEN** its own actual-start evidence preserves continuation while its prerequisite reading still reports the current unmet condition
- **AND** an identical already-held claim remains idempotent
- **AND** subtree ownership does not inspect descendant execution prerequisites

#### Scenario: Claim redo recreates a governed start while historical restoration does not

- **GIVEN** a claim recorded a new in-progress statement and was undone
- **WHEN** redo observes its prerequisite unsatisfied
- **THEN** redo refuses before restoring the claim or its progress
- **AND** release undo with no recorded new statement preserves historical restoration semantics

The bounded governed consumer is `claimWorkItem` and its new-statement replay.
Historical `startAttempt`/`endAttempt`, manual progress/status and actual-date
corrections remain authored observations under their existing policies. Claim
`runId` remains ownership metadata. FF finish readings do not assert universal
completion enforcement or introduce a new execution runner.

### Requirement: Alphabetic tokens enable bounded project autocomplete

An empty current token or a token beginning with a digit SHALL offer only current-project candidates and SHALL NOT initiate external-project discovery. A token beginning with a letter SHALL enable bounded case-insensitive project autocomplete while retaining local title matches. Choosing a project SHALL establish an explicit search scope rather than create a relationship. Selecting an endpoint SHALL retain existing one-click and Customize semantics.

#### Scenario: Local default has no external projects

- **WHEN** Depends on is opened with an empty query or the token `080`
- **THEN** only local candidates are offered and no external discovery request is sent

#### Scenario: Project abbreviation with punctuation

- **WHEN** the current token is `puni-c`
- **THEN** matching readable projects such as `PUNI-CORE` are offered separately from local title matches
- **AND** selecting that project scopes the next endpoint search without writing a dependency

#### Scenario: Local step token stays local

- **WHEN** the current token is `010.s1-dev`
- **THEN** its letters do not trigger project autocomplete because the token begins with a digit

### Requirement: Autocomplete races and failures remain visible and bounded

Remote discovery SHALL debounce input, bound response size and expose loading, no-match and failure states separately. Superseded query or project responses SHALL be cancelled or ignored. Returning to empty or numeric input SHALL remove external suggestions and invalidate pending external answers.

#### Scenario: Late alphabetic response cannot pollute numeric query

- **GIVEN** a request for `PUNI` is pending
- **WHEN** the user replaces the token with `080` before the response arrives
- **THEN** the late project response does not populate the numeric dropdown

#### Scenario: Failed lookup is not empty results

- **WHEN** authorized remote discovery fails
- **THEN** a retryable error is rendered rather than a successful empty list

### Requirement: Qualified input preserves batches and remote editing

The table SHALL accept mixed local and qualified references separated by commas or whitespace, preserve successful resolutions and report unresolved or ambiguous tokens explicitly. Selection SHALL replace only the current token. Table, card and folded-step editors SHALL use each endpoint's own project steps; no cross-project same-step assumption SHALL silently substitute a different step.

#### Scenario: Mixed references retain the earlier tokens

- **WHEN** the user enters `010, PUNI-CORE.080.39 PUNI_CORE.020.s1-dev`
- **THEN** each token resolves in its proper project and earlier tokens survive autocomplete selection
- **AND** duplicate resolved endpoints are not added twice

#### Scenario: External step has different identity

- **GIVEN** two projects each have a step labeled Dev with different IDs
- **WHEN** the external step endpoint is customized
- **THEN** its own project's step identity is selected explicitly rather than copying the successor's step ID

### Requirement: External relationships have complete readable labels and stable navigation

External dependency chips, accessible labels and details SHALL include their project abbreviation and full qualified address. Navigation SHALL use stable project and endpoint identities. Local chips SHALL remain compact, and external endpoints SHALL not be treated as rows in the local table for highlighting or misleading chart arrows.

#### Scenario: Abbreviation and numbering change

- **GIVEN** an existing external relationship
- **WHEN** its predecessor abbreviation or number changes
- **THEN** the live label updates while navigation and dependency identity still select the same endpoint

### Requirement: Incompatible readers cannot silently ignore external dependencies

Release activation SHALL prevent cross-project relationships from being authored while an incompatible reader, writer, background worker, gateway, MCP process or retained client can serve the store. Each migration SHALL ship a matching down migration and preserve old local relationships.

#### Scenario: Old application is still serving

- **WHEN** external relationship creation is attempted before compatible application activation is established
- **THEN** creation refuses rather than storing an edge an old reader would ignore

### Requirement: Dependency activation survives an empty live edge set

Activation authority SHALL remain durable after the last live external relationship is removed. Live edge count alone never authorizes downgrade; an incapable runtime or rollback SHALL refuse after activation unless a verified compatible recovery accounts for retained journal, saved-plan and replay evidence.

#### Scenario: Last live external relationship is removed

- **GIVEN** cross-project dependency semantics were activated for the store
- **WHEN** the last live external relationship is removed
- **THEN** activation authority remains and an incapable runtime still refuses to start or downgrade
- **AND** retained journal, saved-plan and replay obligations are not inferred absent from the live edge count

### Requirement: Recovery preserves facts after possible semantic exposure

When activation may have committed or later writes cannot be excluded, recovery SHALL retain current store bytes and activation and exposure evidence. Ordinary retry, automatic schema reversal and incompatible downgrade SHALL refuse until an explicitly reviewed compatible recovery is admitted. An eligible dormant rollback with independently verified no-write exposure retains its existing contract.

#### Scenario: Failure after possible activation or application exposure

- **GIVEN** activation may have committed or application writes after exposure cannot be excluded
- **WHEN** deployment, health verification or activation readback fails
- **THEN** the system retains current store bytes and activation and exposure evidence
- **AND** ordinary retry, automatic schema reversal and incompatible downgrade refuse pending an explicitly reviewed compatible recovery
- **AND** a pre-migration capture or snapshot alone does not authorize discarding later writes

### Requirement: Read-only dependency observations are explicit

The backend SHALL advertise immutable binary dependency support through a DB-free, argument-free executable. Empty semantics SHALL explicitly mean incapable; configuration SHALL NOT grant support. A runtime-capability boundary parser SHALL reject unknown protocols, versions, roles, semantics, duplicates and extra or missing fields. A separate inspection executable SHALL accept exactly `inspect`, require explicit nonempty `DB_PATH`, open only an existing database read-only and return its validated durable activation state and exact receipt. Missing, unreadable or malformed authority SHALL refuse rather than imply DISABLED. Inspection SHALL NOT migrate, create a database, activate authoring or start services.

#### Scenario: Dormant binary observation without database configuration

- **WHEN** the backend capability executable runs without database configuration or migrations
- **THEN** it reports backend protocol version 1 with empty semantics independent of activation environment values

#### Scenario: Enabled empty authority inspection

- **GIVEN** an existing database has ENABLED authority and an exact activation receipt with no live external relationships
- **WHEN** the inspection executable runs
- **THEN** it reports ENABLED with that receipt without writing database content

#### Scenario: Inspection cannot invent or repair authority

- **WHEN** the inspection executable encounters an absent database, read denial, missing authority ledger or corrupt authority
- **THEN** it refuses without creating or repairing database content
