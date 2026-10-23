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

Dependency-affecting edits, tree and step mutations, dynamic anchor changes, undo/redo and batches SHALL validate the complete resulting connected graph in their transaction. Refusal SHALL preserve authored state, revisions and events. Journal contents SHALL remain unchanged except that a stale undo/redo refusal prunes exactly its selected stale history entry after rolling back the replay; other entries, including remote project history, SHALL remain unchanged. First-child hand-down SHALL carry incident endpoint mappings atomically without changing their scope.

#### Scenario: Undo would now create a cycle

- **GIVEN** another project has added a relationship since an edge was removed
- **WHEN** undo would restore that edge and close a connected cycle
- **THEN** undo refuses atomically with the conflict visible
- **AND** all replayed writes, including an earlier patch in the same compound entry, roll back without publication
- **AND** only the selected stale history entry is pruned; every other journal entry remains unchanged

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

Deleting a project, work item or step that would remove an externally referenced predecessor SHALL refuse until affected relationships are removed or explicitly reassigned by authorized editors. Deleting a successor work item SHALL remove its owned incoming relationships in its existing undoable transaction. Whole-project deletion through optimization drain SHALL remove successor-owned incoming relationships atomically with project cleanup, preserving surviving predecessor revisions; this maintenance lifecycle does not create an undo journal. Internal-only deletion behavior SHALL remain unchanged.

Whole-project drain initiation SHALL refuse external predecessor references before changing delete-pending markers, audit, generations, queues or slots. Finalization SHALL revalidate external predecessor references before graph cleanup, including slot release, reclaim and restart reconciliation; a project-pending contract retirement SHALL not commit partial drain state before this refusal. Ordinary contract-version retirement SHALL remain permitted for externally referenced projects. For otherwise authorized, enabled relationship writes, forward commands that add or update typed facts, including first-child node remapping and duplicate/copy, SHALL return a modeled HTTP 409 `project_deleting` conflict for either endpoint in a delete-pending project, reading the current marker within the command writer transaction before persistence. Incident restoration SHALL check the same current lifecycle markers before detaching relationships. Undo/redo SHALL retain their existing modeled stale-history refusal policy. The store SHALL independently refuse unsafe writes. Stored relationships remain readable during drain, and no authoring activation is introduced.

#### Scenario: External blocker is not silently removed

- **GIVEN** project B's task waits on project A's task
- **WHEN** A's editor deletes the referenced task or project
- **THEN** deletion refuses and B's prerequisite remains intact

#### Scenario: Referenced project drain refuses before cancellation

- **GIVEN** an external relationship owned by B names a predecessor in A and A has queued or running optimization work
- **WHEN** installed or maintenance lifecycle code begins whole-project drain for A
- **THEN** it refuses naming the relationship and all persistent state remains unchanged
- **AND** retiring only a contract version remains allowed

#### Scenario: Late external reference blocks all project finalizers

- **GIVEN** a project is delete pending and maintenance has introduced a late external predecessor reference
- **WHEN** direct finish, last-slot release or restart/reclaim finalization runs
- **THEN** it refuses before graph cleanup and rolls back its slot and generation changes

#### Scenario: Successor project cleanup is atomic

- **GIVEN** B owns an incoming external relationship from surviving A
- **WHEN** whole-project finalization deletes B
- **THEN** its incoming relationship is removed and A's work-item revision is preserved
- **AND** a later cleanup or event failure rolls back all cleanup and recorded events

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

#### Scenario: Stable destination is excluded by the current Find or facet criteria

- **GIVEN** the destination project's mounted plan has an active Find query, facet selection, or both, excluding a nested linked work item or leaf step
- **WHEN** the plan accepts navigation by stable project/work-item/step identity
- **THEN** it reveals the destination and its ancestors through the current filter and focuses the actual name or step estimate input on desktop and phone
- **AND** the Find query, facet selection and stored expansion remain unchanged
- **AND** the temporary reveal expires when the criteria change
- **AND** the accepted link parameters are consumed while unrelated URL parameters remain
- **AND** another project's table does not consume the link; malformed, missing and non-leaf step targets retain their visible refusal, and hidden or unfolded step columns are made focusable before landing

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

### Requirement: Migration rollback admits the complete selection before reversal

Both legacy-target and captured-set migration rollback SHALL resolve all selected row names, folders and forward hashes before executing any selected down statement. If the selection removes dependency activation authority, the rollback connection SHALL inspect the exact constrained authority tables, ledger, marker, receipt and admission triggers and require DISABLED authority with no retained external relationship. Missing, unreadable, malformed or replaced trusted state SHALL refuse. ENABLED authority or retained edges SHALL require compatible recovery. Unrelated selections and no-ops SHALL retain their existing behavior without inspecting activation.

#### Scenario: Enabled or corrupt authority has newer selected migrations

- **GIVEN** the rollback selects activation and newer migrations with ENABLED authority, retained edges or invalid trusted authority
- **WHEN** either rollback entrypoint executes
- **THEN** it refuses before any selected down statement and preserves the complete schema, ledger and persisted rows

#### Scenario: Older selected metadata differs after application

- **GIVEN** a selected older migration has no recorded name, no folder or a changed forward hash
- **WHEN** a newer valid migration is selected for reversal with it
- **THEN** rollback refuses before reversing the newer migration

#### Scenario: Admitted dormant rollback later encounters a script failure

- **GIVEN** the complete selection is admitted and a later down script fails
- **WHEN** rollback executes each migration
- **THEN** each successful down and ledger deletion remains committed atomically while the failing migration rolls back
- **AND** captured-set retry resumes the remaining additions and foreign-key-off rebuild behavior remains available

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

#### Scenario: Incapable binary observation without database configuration

- **GIVEN** a backend binary without v1 semantic implementation
- **WHEN** the backend capability executable runs without database configuration or migrations
- **THEN** it reports backend protocol version 1 with empty semantics independent of activation environment values

#### Scenario: Implemented gateway and MCP binary observations declare their own support

- **WHEN** either the gateway or MCP dependency capability executable runs without application configuration, database access or migrations
- **THEN** it emits exactly one version 1 `wbs-dependency-runtime` observation with its own `gateway` or `mcp` role and exact `cross-project-dependencies-v1` semantics
- **AND** its declaration and semantics array are frozen and activation environment values cannot grant support
- **AND** it imports neither configuration nor application startup and leaves the working directory unchanged
- **AND** any positional argument refuses with exit 1, a diagnostic and no stdout observation
- **AND** these observations grant no activation, authoring, participant exclusion or backend-role transport admission

#### Scenario: Role-bound exact-image Docker observations remain non-authoritative

- **GIVEN** the coordinator requests the explicit `backend`, `gateway` or `mcp` role
- **WHEN** the Docker binary observation primitive invokes its DB-free executable
- **THEN** it first requires a digest-pinned image naming respectively `wbs-be-01`, `wbs-gw-01` or `wbs-mcp-01` and refuses a wrong tier before Docker
- **AND** it accepts only the closed version 1 capability envelope with that exact role and known unique semantics, attributing the observation to the exact invoked image
- **AND** the invocation has no network access, mounts, database configuration or application startup, shares the caller's finite deadline and refuses missing, unreadable, malformed, failed or stalled executables without substituting empty support
- **AND** the existing backend pair transport retains its backend-only contract and independently invokes candidate and nonnull retained images even when equal, invoking only candidate on first installation
- **AND** this primitive imports no configuration or application startup and grants no activation, authoring, participant exclusion, deployment tier expansion or recovery permission

#### Scenario: Backend capability HTTP observation does not activate dormant storage

- **GIVEN** valid DISABLED storage authority
- **WHEN** an unauthenticated client reads `GET /api/runtime/dependency-capability`
- **THEN** the typed mounted endpoint returns exactly the immutable backend capability reported by the DB-free executable, with backend protocol version 1 and its declared semantics
- **AND** shared endpoint shapes register its `getDependencyCapability` operation for generated clients and OpenAPI
- **AND** migration readiness, stored activation and environment configuration cannot grant semantic support or affect the observation
- **AND** reading capability does not grant authoring: an external batch still refuses and rolls back earlier commands
- **AND** the infrastructure policy admits the read without identity or origin requirements and rejects framed GET bodies with typed `invalid_body` 400

#### Scenario: Enabled empty authority inspection

- **GIVEN** an existing database has ENABLED authority and an exact activation receipt with no live external relationships
- **WHEN** the inspection executable runs
- **THEN** it reports ENABLED with that receipt without writing database content

#### Scenario: Inspection cannot invent or repair authority

- **WHEN** the inspection executable encounters an absent database, read denial, missing authority ledger or corrupt authority
- **THEN** it refuses without creating or repairing database content

### Requirement: Compose observes both exact backend binary capabilities before stopping

Compose SHALL independently invoke the candidate and nonnull retained rollback
backend image's dependency capability executable before durable writer stop intent
and through shared backend recovery admission. Each image SHALL be pinned by digest.
The pair SHALL share a finite deadline and execute without a database mount,
DB_PATH injection, network access or application startup. The coordinator SHALL
require the exact backend protocol/version/role/key set and known unique semantics.
Explicit empty support SHALL be accepted only as a binary observation; this SHALL
NOT prove store admission, participant exclusion or activation permission.

#### Scenario: Either image cannot supply an observation

- **GIVEN** the candidate or retained rollback executable is missing, unreadable, failed, stalled or returns malformed capability transport
- **WHEN** ordinary Compose preflight runs
- **THEN** it refuses before writer stop intent and leaves the outgoing writer serving
- **AND** shared standalone recovery admission refuses the same malformed binary observation without restarting writers or clearing markers

#### Scenario: Independent dormant binary observations

- **GIVEN** both exact image executables return valid backend observations with explicit empty semantics
- **WHEN** ordinary Compose preflight runs
- **THEN** it continues through existing admission boundaries without activating dependency authoring or changing automatic rollback behavior

### Requirement: Compose preserves only provably dormant dependency stores

After proving all known writers stopped, Compose shared backend recovery admission SHALL independently inspect coordinator-owned SQLite authority before backup, migration capture or maintenance startup. It SHALL use a bounded, network-free command with a recursively readonly/private source bind and scratch main/WAL/journal copy, excluding source SHM. It SHALL require actual ledger and relationship tables, unique nonempty ledger names and SHA256 hash identities, both dependency migration identities exactly once, exact constrained marker/receipt schemas and all three exact admission triggers including numeric JSON receipt-version checks. It SHALL require exactly one id=1 DISABLED marker, no receipts and no external relationships. ENABLED SHALL refuse regardless of edge count or advertised binary support. Candidate application inspection SHALL NOT supply authoritative evidence. Source absence, unreadability, malformed SQLite or malformed transport SHALL refuse; a coherent historical store without both dependency authority migrations SHALL also refuse.

#### Scenario: Fresh maintenance observation differs from stopped preflight

- **GIVEN** stopped preflight admitted a migrated dormant store
- **WHEN** maintenance completes and its exact container is stopped
- **THEN** Compose freshly resolves the entire SQLite family, compares its canonical database identity with durable intent, independently verifies the retained rollback image association when present, inventories exactly the outgoing and replacement maintenance writers and proves each stopped
- **AND** it runs a fresh coordinator store inspection before recording exposure or starting an application
- **AND** changed or uncertain authority, image, database family, writer identity or stopped state retains current store and interruption/migration evidence for attended recovery, with no automatic down migration, snapshot restore or old-writer restart

#### Scenario: First installation already has migrated dormant storage

- **GIVEN** candidate capability and stopped preflight prove a first installation with an existing fully migrated dormant store and no managed backend writer
- **WHEN** maintenance replaces the idle identity
- **THEN** fresh post-maintenance admission expects only its exact stopped maintenance identity and does not apply the pre-maintenance no-container invariant again
- **AND** neither observation authorizes semantic activation, participant exclusion, writer restart or marker clearance

### Requirement: Kubernetes dependency observations retain execution attribution

Kubernetes dependency capability and store observation transport SHALL create a fresh nonce-named Job for every invocation, refuse an existing name, pin the backend image digest and coordinator command, and return Job UID, Pod UID, namespace, image and command hash with the observation. It SHALL validate the Job and exactly one owned Pod before and after reading that Pod's task-container logs, reject injected security-relevant workload fields and require successful task termination. Candidate and previous capability executables SHALL run independently even when their image references are equal. Capability Jobs SHALL have no volumes, mounts, injected database configuration or application startup command.

Store observation transport SHALL execute the coordinator-generated inventory against a private scratch copy of the source main/WAL/journal family, excluding source SHM. Its only source PVC access SHALL be read-only with recursive-readonly required in both the requested manifest and runtime-reported container mount status. Unsupported or missing effective mount evidence SHALL refuse. It SHALL omit mount ownership mutation requests and preserve source bytes and directory entries. A stopped-storage interval remains a caller prerequisite; transport observations alone SHALL NOT authorize migration, application exposure, rollback or activation.

#### Scenario: Equal backend images are observed independently

- **WHEN** the candidate and previous backend digests are equal
- **THEN** each capability executable runs in a distinct fresh Job and returns independently attributed support, including explicit empty support
- **AND** missing, unreadable, failed, stalled or malformed output from either invocation refuses

#### Scenario: Completed evidence belongs to another execution

- **WHEN** an observation name already exists, a Job or Pod UID changes, a foreign owner or image is observed, or the effective workload differs from the coordinator manifest
- **THEN** the observation refuses without reusing aggregate Job logs or returning support

#### Scenario: Source readonly enforcement is unavailable

- **WHEN** store inspection lacks runtime confirmation of recursive-readonly source access
- **THEN** the observation refuses before reading task logs
- **AND** a valid dormant stdout alone cannot substitute for the missing mount evidence

### Requirement: Kubernetes status image binds the verified image config

Before creating an observation Job, the transport SHALL derive the pinned image's config digest from digest-verified registry bytes within its deadline; unavailable or malformed evidence SHALL refuse. A completed Pod's `status.image` SHALL equal the pinned reference or verified config digest, while `imageID` SHALL independently attribute the pinned manifest. Requested and effective Job/Pod image specifications remain exact pinned-reference comparisons.

#### Scenario: Runtime reports the verified config digest

- **GIVEN** the pinned manifest chain independently resolves one config digest
- **WHEN** the completed owned Pod reports that config digest as `status.image` and the pinned manifest as `imageID`
- **THEN** the observation may accept the task's image identity if its other guards pass
- **AND** another digest, missing registry evidence or a foreign `imageID` refuses without returning support

#### Scenario: Registry image chain cannot be verified

- **GIVEN** the pinned reference resolves through an image index and a selected platform manifest to config bytes
- **WHEN** the index, selected manifest or config bytes fail their named digest, or a config descriptor is absent
- **THEN** observation refuses before creating a Job

### Requirement: Kubernetes release observes both backend binaries before protected effects

Every release coordinator execution SHALL independently invoke the candidate and retained previous backend images' DB-free dependency capability executable after current F6 image admission and before Flux suspension, write closure, writer stop or controller effects. Resumed forward and rollback executions SHALL refresh F6 admission and obtain fresh observations before their first protected effect, including schema work, tier restoration, writer reopening and Lease cleanup. Any heartbeat loss observed during the prerequisite SHALL remain a refusal even if a later renewal succeeds; the coordinator SHALL check that sticky loss before journal normalization or protected effects. Previously recorded history SHALL NOT substitute for either invocation. Equal digests SHALL still cause two separately attributed invocations through the exact Job/Pod/image/command observation transport.

Missing, unreadable, failed, stalled or malformed capability output from either image SHALL refuse without entering generic rollback, schema work, tier restoration, controller cleanup or Lease release. Refusal SHALL preserve the existing serving state and durable journal position; acquiring or renewing the existing release Lease and refreshing F6 admission remain required coordination effects. Successful explicit empty semantics SHALL count only as an observation, granting no store, semantic compatibility, activation, exclusion or recovery permission. The coordinator SHALL NOT invoke dependency store inspection as part of this binary prerequisite.

#### Scenario: Retained binary fails while current release serves

- **WHEN** the exact candidate executable returns valid explicit empty semantics but the independently invoked retained executable is absent, unreadable, malformed or late
- **THEN** the release refuses before Flux suspension, write closure or writer stop
- **AND** it retains the Lease and images-admitted intent without schema, tier or cleanup effects

#### Scenario: Interrupted forward or rollback execution repeats binary observations

- **WHEN** a coordinator resumes forward completion, an interrupted release requiring rollback, or an existing rollback phase
- **THEN** it refreshes admission and invokes both exact images in fresh separately attributed Jobs before protected effects
- **AND** failed retained observation preserves the exact preexisting journal bytes, controller histories and serving state without generic rollback or cleanup

### Requirement: Kubernetes storage prerequisite readbacks are observational

The Kubernetes adapter SHALL provide a bounded read-only storage inspection that binds `wbs-data` PVC UID, bound volume name, PV UID and the PV claim reference to `/data/wbs.sqlite`; reads back the fenced writer policy, stopped backend Deployment and configured suspended Flux unit; inventories Pod PVC references without writer labels; and classifies standard source-owning controller templates. It SHALL refuse live or terminating source consumers, including readers without runtime mount proof, unsuspended backup CronJobs and unknown source controllers. It SHALL retain controller identities and template hashes for comparison across inspections and re-read storage identities before returning. These readbacks SHALL NOT authorize a scan, migration, rollout, controller restoration or rollback, and SHALL NOT be interpreted as a continuously enforced interval or durable controller ownership.

#### Scenario: Unlabeled backup consumer refuses inspection

- **WHEN** an unlabeled live or terminating backup Pod references the source PVC through a main, init or ephemeral container, or a source volume device
- **THEN** inspection refuses rather than inferring exclusion from the writer label

#### Scenario: Storage or owner replacement refuses repeated inspection

- **WHEN** the PVC/PV, policy, backend, Flux or source-controller identity or template changes between inspections, or storage identity changes during inventory
- **THEN** repeated inspection refuses and returns no fresh observational evidence

### Requirement: Kubernetes prepared ownership preserves original controller history

The Kubernetes ownership preparation primitive SHALL seal only prepared history, binding the transaction and cluster to the exact storage identity, configured Flux topology and UID, required backup CronJob UID and resourceVersion, template hash, fresh ownership token and distinct absent/false/true original suspension. Loaded history SHALL refuse unsupported stages, malformed or extra fields, altered canonical bytes/hash, inconsistent disposition and foreign identities before a cluster call. A configured Flux unit SHALL be suspended; an explicit validated local topology SHALL record null Flux.

Preparation SHALL re-read stable identities and templates, permit resourceVersion progress alone, assert current Lease before observation and before checkpoint, and await the caller's durable enclosing-record checkpoint before returning. Missing, unreadable, malformed, deleting or already-tokened controllers SHALL refuse. Restart validation SHALL compare fresh original controller state under current Lease without resealing or replacing history. These primitives SHALL NOT suspend or drain controllers, establish a stopped-storage interval, persist release state, invoke scans or authorize migration, rollout, restoration or rollback.

#### Scenario: Original suspension survives durable preparation

- **WHEN** the backup suspension field is absent, false or true
- **THEN** durable prepared history preserves that exact distinction and records whether a change would be requested
- **AND** failed or unfinished durable checkpoint cannot return prepared ownership

#### Scenario: Original controller state changes after interruption

- **WHEN** resumed prepared history has corrupt bytes or a foreign target, or fresh cluster, storage, Flux, backup UID, template, suspension or ownership annotation differs
- **THEN** validation refuses without replacing the original snapshot, patching a controller or invoking recovery

### Requirement: Backend startup admits semantic authority before migrations

Backend startup with automatic migrations SHALL inspect existing dependency authority
before source migration. ENABLED authority requires compatible semantics even when
empty. Invalid, absent or unreadable authority SHALL refuse with complete source
schema, ledger and all table rows unchanged, close storage, and start no application
side effects. Inspection errors SHALL never select historical bootstrap.

#### Scenario: Enabled empty authority has a pending additive migration

- **GIVEN** ENABLED authority without relationships and an incompatible backend
- **WHEN** startup selects a pending migration that would add a table and ledger entry
- **THEN** startup refuses with the complete source schema, ledger and all table rows unchanged
- **AND** services, backfill, local identity writes, workers and listeners do not start and acquired storage is closed
- **AND** malformed, partial, unreadable or recorded-but-missing authority receives the same refusal

### Requirement: Backend bootstrap requires positive historical evidence

Only an explicitly empty SQLite schema or a certified historical pre-authority store
MAY defer authority inspection until after migration. Historical certification SHALL
require an exact known pre-authority migration name/hash prefix and complete schema
equality with that prefix reconstructed exclusively in disposable scratch storage.
A nonempty store without a readable ledger SHALL refuse.

#### Scenario: Fresh and certified historical bootstrap

- **WHEN** startup migrates an empty schema or an exact known pre-authority historical schema and ledger
- **THEN** migrations establish dormant authority and strict post-migration inspection admits ordinary startup
- **AND** an altered historical migration hash, missing schema object or missing ledger refuses before source migration

### Requirement: Backend rechecks semantic authority after migration

Backend startup SHALL strictly inspect authority again after migration and before
services, backfill, local identity writes, workers or listening. This startup admission
SHALL NOT authorize external authoring or deployment recovery.

#### Scenario: Migration corrupts previously dormant authority

- **GIVEN** pre-migration inspection admitted valid dormant authority
- **WHEN** a pending migration removes the authority receipt table
- **THEN** strict post-migration inspection refuses before service creation or application writes and closes storage

### Requirement: Kubernetes release owns bounded backup controller intervals

The production release coordinator SHALL retain separate forward and rollback
controller histories in its authoritative versioned file journal. After backend
shutdown and before source replay, capture or migration, it SHALL checkpoint the
exact original backup UID/resourceVersion/template, token and absent/false/true
suspension; conditionally suspend with UID/resourceVersion/spec/annotation guards;
read back and durably acknowledge suspension; and drain only actual CronJob→Job→Pod
UID-owned descendants with UID-preconditioned deletes and bounded convergence. Before any owned Job mutation, the coordinator SHALL validate complete unfiltered Job and Pod inventories and refuse foreign source consumers. Before deleting descendants, the coordinator SHALL suspend each UID-owned Job with atomic UID/resourceVersion/owner-reference/spec tests, read back the exact suspended identity and spec, and revalidate it before deletion. Pod inventory SHALL follow Job suspension. Already terminating Pods SHALL retain ordinary termination grace; deletion SHALL use orphan propagation without force or zero grace. Two fresh consecutive inventories SHALL contain no owned Jobs or Pods before success. Exhausting the bound SHALL report attempt count and bounded surviving owned resource names, UIDs, Pod phases, deletion timestamps and finalizers, and retain the authoritative journal and Lease. Unclassified API failures, including NotFound without a typed status boundary, SHALL refuse rather than imply disappearance.
Repeated unfiltered inventories SHALL refuse unrelated live or deleting source consumers, including
readers, without deleting them. Strictly terminal retained Job/Pod history SHALL
remain readable without granting ownership or deletion authority; active or
terminating workers and missing/false completion conditions SHALL refuse. The exact
recorded backup UID, template, token and suspension SHALL be revalidated after
fence observations and before any source replay or capture. Missing acknowledgment SHALL prevent source work.

The coordinator SHALL conditionally restore the exact original suspension and
acknowledge it durably before backend rollout. An eligible dormant abort SHALL reuse
an active forward interval or, after its completed restoration, retain a new rollback
interval before schema reversal or rollback replay, restoring it before old-tier
rollout. Completed forward history SHALL survive authorized image-template changes;
active history SHALL never weaken its original template guards. Uncertain controller
history SHALL retain the release barrier and print pinned manual inspection facts
instead of invoking generic schema reversal or writer restart.

#### Scenario: Active backup Job reconciles while Pods terminate

- **WHEN** an owned backup Job has an active Pod and ordinary Pod termination is delayed
- **THEN** the coordinator conditionally suspends and reads back the Job before fresh Pod inventory and graceful deletion, preventing replacement Pod creation
- **AND** unrelated non-controller bystanders remain untouched, changed Job state or lost Lease refuses, and two fresh inventories prove owned descendants absent

#### Scenario: Patch commits before acknowledgment and coordinator restarts

- **WHEN** suspension or restoration reached Kubernetes but the next journal write failed
- **THEN** restart reconciles only the recorded UID, template, original suspension, token and exact expected current state
- **AND** missing, changed or ambiguous state refuses without replacing original history or rolling out a writer

#### Scenario: Rollback follows an authorized backup image transition

- **WHEN** the forward interval was restored and backend rollout changed the backup template before an eligible dormant abort
- **THEN** rollback retains completed forward history and establishes a separate rollback interval under the current template before source rollback work
- **AND** both histories retain their exact original suspension and distinct ownership tokens

#### Scenario: Retained coordinator history does not block or authorize source work

- **WHEN** completed source task Jobs and their terminated Pods remain for their normal retention period
- **THEN** subsequent source barriers accept only their strict inert status and leave those resources intact
- **AND** live, deleting, active, terminating or falsely completed source consumers still refuse before the next source task

#### Scenario: Eligible rollback restarts after its restore acknowledgment

- **WHEN** dormant rollback reused the forward interval and the coordinator dies after durably acknowledging its restoration before old-tier rollout
- **THEN** restart verifies that completed forward history and finishes rollback without inventing or selecting an absent rollback interval

### Requirement: Kubernetes source intent retains its authoritative journal

Before checkpointing source-controller intent, the coordinator SHALL mark the real
release Lease as requiring its journal using UID/resourceVersion/session CAS and
readback. That marker SHALL remain true across renewal, takeover and parking.
Missing, unreadable or malformed marked journals SHALL refuse recovery as a fresh
release. Lease UID replacement, marker loss and session loss SHALL prevent further
controller mutation, acknowledgment or source work. Marked Lease cleanup SHALL
require an eligible completed journal with restored controller histories and use
UID/resourceVersion deletion preconditions.

#### Scenario: Journal disappears after the sticky marker

- **WHEN** the journal is missing, unreadable or malformed after the Lease acquired its marker, including before the first controller checkpoint
- **THEN** recovery refuses and retains the Lease and current controller state for attended recovery

#### Scenario: A contender reads a live marked Lease during the first checkpoint

- **WHEN** another coordinator owns and renews the live Lease while its journal-required marker is committed before its first journal checkpoint
- **THEN** a contender waits or refuses as a live-holder conflict without taking over or mutating the release
- **AND** a missing journal still prevents takeover after that Lease lapses or is parked

#### Scenario: Lease is deleted and recreated under the same holder

- **WHEN** the Lease UID changes despite a repeated holder or resourceVersion
- **THEN** marker changes, renewals, parking, takeover and cleanup refuse to adopt or delete that replacement

### Requirement: Detached Kubernetes dependency evidence preserves exact claims

A versioned evidence codec SHALL preserve the exact independently bound source,
candidate and retained binary invocations, participant claims, activation receipt
and exposure progress as closed canonical bytes with a matching SHA256 and decoded
projection. Decoding SHALL reject missing, extra, sparse or inconsistent fields.
An internally consistent participant claim SHALL NOT certify participant exclusion.

#### Scenario: Equal-image invocations have different identities

- **WHEN** candidate and retained binaries share a digest but their observation,
  Job or Pod identity is missing or reused
- **THEN** evidence decoding refuses rather than attributing one invocation to both

#### Scenario: Sparse or changed persisted evidence

- **WHEN** an evidence list has a missing array index, or its bytes, hash, binding
  or decoded projection disagree
- **THEN** decoding refuses before any recovery classification

### Requirement: Detached evidence never grants automatic recovery

The evidence classifier SHALL route missing or uncertain evidence and any durable
activation or exposure intent or confirmation to attended recovery. Only explicit
unstarted activation and exposure states MAY request independent dormant admission;
that request SHALL NOT authorize rollback, schema reversal or old-writer restart.

#### Scenario: Intent survives an interrupted release

- **WHEN** a valid envelope records durable activation or exposure intent without
  confirmation
- **THEN** classification requires attended recovery and grants no rollback

### Requirement: Connected blockage roots remain explainable

A connected tree SHALL carry captured stable identities and qualified labels for exactly its referenced foreign blockage roots, including transitive roots outside incident links. Scheduled and unavailable reads SHALL preserve those explanations and local labels. Missing or malformed referenced metadata SHALL fail the read.

#### Scenario: Transitive foreign root on desktop and phone

- **GIVEN** C depends on B and B depends on a held or directly blocked root in A
- **WHEN** C's connected tree is displayed on desktop or phone, including while a dependency calendar is missing
- **THEN** the step explanation names A's captured qualified root and preserves its stable root identity
- **AND** the unavailable-date warning remains visible when applicable

#### Scenario: Remote root rename and clear

- **GIVEN** a connected step explanation names a foreign root
- **WHEN** a refreshed read renames that root and later clears its stoppage
- **THEN** both layouts display the renamed label under the same root identity and remove its explanation after clearing

#### Scenario: Invalid remote root evidence

- **GIVEN** referenced foreign root metadata is absent or malformed
- **WHEN** the connected tree is projected or its known HTTP metadata is decoded
- **THEN** the read fails instead of showing an unknown or fabricated root label

### Requirement: HTTP resource clients declare exact dependency semantics

Production resource and control requests SHALL inspect validated durable activation
authority afresh in one coherent read transaction after origin and identity policies.
Valid DISABLED authority SHALL preserve legacy admission. ENABLED authority SHALL
require exact client semantics and immutable backend support, even with zero external
edges. Explicit process, authentication and immutable catalogue exemptions SHALL
match the shared operation matrix.

#### Scenario: Activation changes between resource requests

- **GIVEN** a legacy resource client admitted against valid DISABLED authority
- **WHEN** another connection persists valid ENABLED authority
- **THEN** its next resource request without exact `X-WBS-Dependency-Semantics: cross-project-dependencies-v1` receives 409 `{error: "client_dependency_incompatible", required: "cross-project-dependencies-v1"}`
- **AND** a capable runtime admits the exact claim without changing persisted revisions, events, journal entries or activation
- **AND** an incapable runtime refuses even that exact claim

#### Scenario: Authority changes during inspection

- **GIVEN** an inspection has read DISABLED authority's migration ledger
- **WHEN** another connection activates before the remaining inspection reads
- **THEN** the current request observes the coherent DISABLED snapshot
- **AND** the next request observes ENABLED and requires the exact claim

#### Scenario: Trusted authority cannot be read

- **WHEN** a protected request encounters missing, malformed or unreadable authority
- **THEN** it fails with an infrastructure response rather than legacy admission
- **AND** earlier origin and identity refusals retain their existing ordering

#### Scenario: Production composition requires authority admission

- **WHEN** an erased caller omits the production app admission callable
- **THEN** app composition throws before serving requests

#### Scenario: Foreign SCIM provisioning routes require dependency admission

- **GIVEN** a provisioning token authenticates against ENABLED dependency authority
- **WHEN** a client lists, reads, creates, patches or deletes `/scim/v2/Users` resources without the exact dependency semantics claim, or the backend is incapable
- **THEN** the foreign SCIM adapter returns its SCIM 409 error envelope with `detail: "client_dependency_incompatible"` and `required: "cross-project-dependencies-v1"` before reading the body or dispatching a resource operation
- **AND** no provisioning user, membership, organization audit, project, event or command journal row changes
- **AND** SCIM authentication and per-token rate admission retain precedence; missing or malformed dependency authority is a SCIM infrastructure 500, never legacy admission

#### Scenario: Immutable OpenAPI observation remains available

- **GIVEN** the production app's dependency authority callback throws if invoked
- **WHEN** a client requests the separately mounted `GET /api/openapi.json`
- **THEN** it receives HTTP200 without inspecting dependency authority
- **AND** this immutable schema observation is explicitly exempt from resource admission

### Requirement: Gateway upgrades require fresh dependency compatibility admission

Every authenticated WebSocket upgrade and reconnect with valid protocol negotiation SHALL ask the backend's secret-authenticated `POST /internal/gateway/dependency-admission` before presence, subscription or replay. The empty-body endpoint SHALL inspect current trusted authority and return no-store 204 or typed incompatibility 409 without receipt or project information. Transport, decoding and deadline failures SHALL refuse the upgrade.

#### Scenario: Activation changes between socket upgrades

- **GIVEN** a legacy socket admitted against valid DISABLED authority
- **WHEN** authority becomes ENABLED before reconnect
- **THEN** the gateway freshly asks the backend and refuses an incapable binary even if the client offers the exact v1 protocol
- **AND** refusal creates no presence, subscription or replay

#### Scenario: Semantic claims require both participants

- **GIVEN** a gateway binary supports v1
- **WHEN** a client offers only a substring, differently cased token or HTTP semantic header
- **THEN** the gateway refuses the unsupported offer without a semantic claim or application effects
- **AND** only an exact offered protocol may be selected as the accepted WebSocket subprotocol

#### Scenario: Admission transport cannot establish compatibility

- **WHEN** the backend transport fails, exceeds its finite deadline or returns an invalid status or malformed typed refusal
- **THEN** the gateway refuses before opening the socket
- **AND** origin and credential refusals precede any backend admission request

### Requirement: Gateway protocol selection is explicit and exact

The browser SHALL offer `wbs.cross-project-dependencies.v1` and `wbs.legacy` on every connection. The gateway SHALL prefer offered v1 only with immutable v1 support; otherwise it SHALL select only explicitly offered legacy. An absent offer SHALL mean legacy. Only HTTP SP/HTAB may surround tokens; malformed, duplicate or unknown-only offers SHALL refuse. The response SHALL name exactly the selected offered token, never echo the raw list or retry with weaker claims after failure.

#### Scenario: Legacy-first offer still selects supported v1

- **GIVEN** a v1-capable gateway and an offer listing legacy before exact v1
- **WHEN** the authenticated upgrade succeeds
- **THEN** the response selects exact v1 and the socket retains that selection
- **AND** Bun's implicit first-token echo cannot substitute for explicit selection

#### Scenario: Invalid whitespace refuses before gateway work

- **GIVEN** a raw upgrade with NBSP surrounding the v1 token and pipelined application frames
- **WHEN** protocol negotiation inspects the header
- **THEN** it responds 409 without backend requests, presence, project access, subscriptions, replay or forwarding
- **AND** valid SP/HTAB surrounding exact tokens remains accepted

### Requirement: Selected semantics follow every gateway request

The gateway SHALL retain the selected protocol per admitted connection. Fresh retained-delivery admission, project authorization, forwarding and resume SHALL claim exact HTTP semantics only for that selected v1 token with immutable gateway support. Legacy SHALL omit the claim. Neither the original offer list nor server readiness SHALL grant support. Deployment SHALL introduce the negotiating gateway before browsers that offer protocols to historically reject-all gateways.

#### Scenario: Legacy cannot inherit another connection's selected semantics

- **GIVEN** v1 and legacy connections on a capable gateway
- **WHEN** either connection authorizes a project, forwards, resumes or receives retained delivery
- **THEN** only the v1 connection carries the exact backend semantic claim
- **AND** ENABLED backend authority refuses legacy before application effects

### Requirement: Gateway application delivery is bounded and awaitable

Gateway push, presence, replay and control frames SHALL share one awaitable per-socket FIFO with at most 64 pending frames and a five-second queued delivery deadline. Overflow, expiry, writer failure or physical drop SHALL retire the connection, cancel waiting producers, remove subscriptions and close with 1013. Cancellation SHALL prevent queued physical writes. This prerequisite SHALL NOT activate or advertise semantic support.

#### Scenario: Push counts completed accepted sends

- **GIVEN** a subscription with a healthy recipient and a recipient whose asynchronous delivery fails
- **WHEN** an internal push arrives
- **THEN** its response awaits both outcomes and reports one delivered socket
- **AND** fanout metrics count one accepted frame, the failed connection is retired with its reason and original asynchronous error reported, and no asynchronous rejection is detached
- **AND** Bun backpressure acceptance counts once without a retry; Bun drop does not count

#### Scenario: A delayed replay precedes its acknowledgement

- **GIVEN** the first replay event is waiting for delivery admission
- **WHEN** the gateway processes multiple replay events
- **THEN** later replay events and `resume_ack` wait for the first event
- **AND** a retired replay stops before later events and acknowledgement

#### Scenario: Presence failure is modeled or surfaced

- **GIVEN** a presence broadcast with one failing recipient and one healthy recipient
- **WHEN** their deliveries complete
- **THEN** the production delivery boundary returns retirement for the failed connection and preserves healthy delivery
- **AND** any unexpected rejected delivery is observable through the broadcast promise

#### Scenario: Stalled delivery cannot accumulate an unbounded queue

- **GIVEN** stalled authority admission on a retained connection
- **WHEN** its application queue reaches capacity or its deadline expires
- **THEN** the connection is retired, all waiting producers settle, and queued successors never start
- **AND** cancellation before or during delivery prevents new physical writes even if a delayed adapter later settles

### Requirement: Resource clients retain typed dependency incompatibility

The shared HTTP client SHALL decode exact protected-resource 409 dependency
admission envelopes into typed compatibility failures retaining required semantics.
The plan UI SHALL display compatibility guidance for refused reads. This SHALL NOT
send semantic claims, enable authoring or advertise capability.

#### Scenario: Browser retained across activation sees a compatibility instruction

- **WHEN** a resource read returns 409 with exactly `error: "client_dependency_incompatible"` and `required: "cross-project-dependencies-v1"`
- **THEN** the shared client returns `dependency_incompatible` with that required semantic
- **AND** the mounted plan read displays a compatible-client instruction and no successful plan export
- **AND** browser requests still omit the dependency semantics claim

#### Scenario: Compatibility decoding preserves other boundaries

- **WHEN** the envelope has missing, extra or wrong fields, arrives at another status or answers an exempt operation
- **THEN** it retains the ordinary response-boundary failure rather than claiming dependency incompatibility
- **AND** ordinary declared 409 conflicts retain their operation-specific refusal
- **AND** cancellation during compatibility decoding returns controlled cancellation

### Requirement: Retained gateway egress freshly admits every FIFO head

Every retained application frame SHALL await fresh backend dependency admission after its FIFO predecessor within its absolute five-second enqueue budget. The gateway SHALL check cancellation and expiry before and after admission, then call its synchronous physical writer with no await gap. Admission SHALL reuse the existing endpoint and closed decoder with parent cancellation, without caching authority or advertising capability.

#### Scenario: Authority changes between queued frames

- **GIVEN** an incapable retained socket with two queued frames
- **WHEN** the first is accepted and authority becomes ENABLED before the second admission
- **THEN** the second frame is not physically written and the connection retires as incompatible
- **AND** accepted push counts exclude that frame and replay sends no later event or acknowledgement

#### Scenario: Admission completes after cancellation or expiry

- **GIVEN** held authority admission and a withheld timer callback
- **WHEN** the connection is canceled or its absolute enqueue budget reaches exactly five seconds before admission settles
- **THEN** no physical write occurs even if admission later returns success
- **AND** parent cancellation aborts pending authority transport

#### Scenario: Authority cannot be established

- **WHEN** retained admission receives an old backend's 404, malformed trusted refusal, thrown transport error or deadline
- **THEN** the connection retires without sending the frame
- **AND** infrastructure failure remains distinguishable from typed incompatibility

#### Scenario: Retirement precedes physical close

- **WHEN** a retained connection retires while physical close is delayed
- **THEN** its pending work is already canceled and its subscriptions and presence are already removed
- **AND** delayed identity verification or held subscription admission cannot restore membership

#### Scenario: Enabled authority with no external rows

- **GIVEN** a real backend store changes from DISABLED to synthetic ENABLED with zero external dependency rows
- **WHEN** an existing incapable socket receives unsolicited push or requests replay
- **THEN** no sentinel application frame or replay acknowledgement is sent and push reports zero accepted recipients
- **AND** this fresh-observation behavior makes no guarantee about a delayed DISABLED response arriving after activation; deployment participant exclusion remains required

### Requirement: Retained gateway fence blocks ordinary deploy admission

The Compose swap runner SHALL refuse retained gateway fence markers under the
deploy lock before observation or planning, and direct executors SHALL refuse
before effects. Only marker absence in readable existing state permits admission.
Malformed/unreadable markers and missing/unreadable state SHALL fail closed.
Presence SHALL be a conservative barrier without asserting physical exclusion.
This prerequisite SHALL NOT create/clear markers, stop participants or activate semantics.

#### Scenario: Retained intent blocks a gateway-only retry

- **GIVEN** `state/dependency-gateway-fence.json` contains exactly `{"format":"dependency-gateway-fence","version":1}` with no other fields
- **WHEN** an ordinary gateway-only swap acquires the deploy lock
- **THEN** it refuses before tier observation, Docker calls or configuration writes

#### Scenario: Retained intent also blocks other selections and direct execution

- **GIVEN** a valid retained gateway fence marker in deployment state
- **WHEN** frontend-only, backend-only or mixed swaps run, or any tier executor is called directly
- **THEN** admission refuses before effects and retains the marker bytes

#### Scenario: Trusted state cannot be established

- **GIVEN** deployment state is absent, unreadable (including a traverse-only directory) or not a directory, or the marker is unreadable, malformed or a symlink (including a dangling link)
- **WHEN** ordinary swap admission runs
- **THEN** it refuses with the relevant state or marker path before effects

#### Scenario: No retained fence permits ordinary admission

- **GIVEN** a readable existing deployment state directory with no gateway fence marker
- **WHEN** ordinary swap admission runs
- **THEN** execution reaches the existing observation and executor path

### Requirement: Managed Compose gateway physical exclusion is explicit and retained

The Compose executor SHALL own the deploy lock for explicit managed-gateway fence and inspection modes, rejecting mixed tiers/flags before ordinary image or planning work. It SHALL retain separate closed/versioned intent and completion beside the unchanged v1 marker. Ordinary swaps SHALL refuse any retained record. These modes SHALL NOT activate semantics, clear evidence, restart/recreate gateways or bypass ordinary admission.

#### Scenario: Exact existing managed cohort is physically stopped

- **GIVEN** the readable canonical state root has no retained records and unfiltered complete Docker inventory proves the two expected Compose gateway names or explicit absences with strict image, Compose, network, init, PID, privilege, restart and process identities
- **WHEN** the operator explicitly invokes `gw --fence-dependency-gateways --execute --sha=<full SHA>`
- **THEN** the executor exclusively fsyncs and reads back marker and intent before effects, reobserves identity, disables restart on exact full IDs with readbacks and then stops those exact IDs within the shared Docker deadline
- **AND** fresh full-cohort proof requires stopped/PID0/no-restart state and stable identities before exclusive completion bound to the exact intent bytes and attempt, followed by final fresh proof
- **AND** both names absent proves only an empty managed cohort, never complete participant exclusion

#### Scenario: Interrupted or lying effect retains evidence and current state

- **GIVEN** marker publication has begun
- **WHEN** publication/readback, identity, restart update, stop or final fresh observation fails or times out
- **THEN** the executor refuses and retains published records and current Docker state without automatic restart, cleanup, policy restoration, retry or activation
- **AND** marker-only is interrupted, intent without completion uncertain, and orphan/foreign/changed records corrupt

#### Scenario: Historical completion cannot substitute for current exclusion

- **GIVEN** retained intent and completion bind the same attempt and exact intent SHA256
- **WHEN** `gw --inspect-dependency-gateway-fence` runs under the deploy lock
- **THEN** it validates closed records and freshly inventories/proves the same complete managed cohort
- **AND** a resumed/replaced/missing/extra member or changed image, name, label, network, process/start identity or restart policy refuses

### Requirement: Managed Compose backend exclusion follows verified gateway exclusion

A dedicated managed Compose backend fence SHALL own the environment deploy lock,
require fresh retained gateway exclusion, and refuse ordinary swap, activation,
preflight, mixed-tier and unknown flag combinations. It SHALL NOT migrate,
activate, restart, restore policy or clear retained evidence. Empty backend
membership SHALL refuse without implying that a store is excluded.

#### Scenario: Exact backend cohort stops only after durable intent and restart readback

- **GIVEN** a freshly verified managed gateway fence and a nonempty supported managed backend cohort sharing one canonical SQLite family
- **WHEN** `be --fence-dependency-backends --execute --sha=<40 hex>` executes
- **THEN** exclusive fsynced/readback backend marker and closed intent precede all backend effects
- **AND** intent binds layout, attempt, source SHA, exact gateway marker/intent/completion byte hashes, both backend identities or absences, original restart/process identity and canonical database family/main-file identity
- **AND** every exact backend ID has restart disabled with independent readback before either backend is stopped
- **AND** bounded exact-ID stops and complete fresh joint gateway/backend inventories prove stopped PID-zero/no-restart state
- **AND** completion binds the exact intent bytes and gateway hashes and is followed by another fresh joint inventory

#### Scenario: Unsupported or foreign writers refuse before backend effects

- **GIVEN** missing or resumed gateway exclusion, an empty backend cohort, conflicting DB_PATH/family identity, unsupported backend process/security/image/network/Compose identity, or an unmanaged overlapping writable database mount
- **WHEN** a backend fence is requested
- **THEN** backend effects and backend evidence publication are refused

#### Scenario: Interruption and current-state drift retain evidence and refuse

- **GIVEN** a retained backend attempt with interrupted publication, malformed or orphan records, changed intent/gateway bytes, replaced containers/database main file, restarted processes, failed policy/stop readback or deadline expiry
- **WHEN** fencing or `be --inspect-dependency-backend-fence` runs
- **THEN** it refuses and retains evidence and current Docker state without automatic recovery
- **AND** ordinary gateway/frontend/backend/mixed runs and direct executors refuse a retained backend marker or orphan companion
- **AND** a historical completion alone never establishes current exclusion or semantic authority

#### Scenario: Opaque host sources require actual namespace admission

- **GIVEN** an unmanaged persistent Docker mount whose host source is readable, absent or inaccessible, including one reported read-only by Docker
- **WHEN** the backend fence evaluates that participant
- **THEN** known host path/inode overlap may refuse early but no host source observation establishes exclusion
- **AND** the existing initialized bounded namespace census must prove the exact participant, all mount destinations and full SQLite family without writable aliases or unclean scanner sessions
- **AND** unavailable, malformed, incomplete, timed-out, unreaped or unsupported privilege/capability/init/PID namespaces refuse
- **AND** a fresh complete joint inventory after all audits must preserve membership, mount/security/config/network and PID/start/restart identities before durable intent publication

#### Scenario: Managed backend retains a replaced source directory

- **WHEN** a running managed backend retains an earlier mounted directory after
  its Docker Source pathname is replaced, including when another colour uses the
  replacement or every current SQLite-family file is hardlinked into it
- **THEN** actual namespace main-file and parent-directory identity admission
  MUST refuse before backend intent or effects
- **AND** a missing directory receipt or changed captured host identity before or
  after census MUST refuse rather than adopt a newly resolved family

### Requirement: Compose participant observation cannot grant activation

The dedicated backend participant inspection SHALL hold one selected deploy lock and share one bounded deadline across fresh retained backend/gateway proof and full Docker/network/process/live-Caddy readbacks. It SHALL return only a versioned blocked observation with unresolved obligations, never activation authority or a participant-proof digest.

#### Scenario: Dedicated read-only invocation

- **WHEN** `be --inspect-dependency-participants` runs
- **THEN** it inspects retained proof and the full topology twice before returning
- **AND** it refuses changes to container, image, process, network, restart, retained-record or live-Caddy evidence
- **AND** any other tier, extra flag or malformed inspection flag refuses before ordinary image or planning work
- **AND** it does not publish records, change restart policy, stop application containers, reload ingress or enable authoring

#### Scenario: Ingress target resolution is bounded by observed Docker networks

- **GIVEN** the full live Caddy configuration includes primary, alternate or catch-all reverse-proxy routes
- **WHEN** participant inspection enumerates their upstreams
- **THEN** each static target resolves unambiguously through a container name, IP or alias advertised on a Caddy-attached network
- **AND** edge hosts/DNS overrides, dynamic targets, unresolved/ambiguous addresses, unknown Caddy apps/handlers or unsupported proxy transports refuse observation

#### Scenario: Unsupported process obligations stay explicit

- **WHEN** inspection observes source-run `wbs-dev-src`, missing or unreadable evidence, an incomplete inventory or a foreign network participant
- **THEN** it refuses to issue the managed Compose observation
- **AND** any returned observation still names unresolved ingress, restart authority, MCP, retained clients, host processes and continuous exclusion
- **AND** it never claims a complete participant proof or permits activation

### Requirement: Shared edge owner admission precedes deployment effects

Supported source launchers SHALL serialize shared-edge writers under one canonical
host-wide lock before selected deployment locks. Retained owner state SHALL close
ordinary deployment without granting activation. This prerequisite SHALL NOT
claim that installed launchers adopted source changes.

#### Scenario: Concurrent prod, dev and provisioning writers

- **GIVEN** a supported writer holds the shared edge lock
- **WHEN** a prod/dev swap, dev poller/candidate loader, devsync or bootstrap/configure writer starts
- **THEN** it refuses before checkout/reset, candidate extraction, configuration, restart or reload
- **AND** nested launchers reuse only a descriptor verified against the canonical inode and real flock

#### Scenario: Retained, malformed or interrupted owner publication

- **GIVEN** `edge-owner.json` or `edge-owner.pending` exists in canonical edge state
- **WHEN** an ordinary supported writer or direct swap/devsync executor starts
- **THEN** it refuses effects even for malformed, unreadable, directory or dangling-link owner state
- **AND** absence preserves legacy deployment without establishing exclusion or activation

#### Scenario: Installed writer adoption remains unproven

- **WHEN** source admission tests pass without an installed-byte and prior-holder drain audit
- **THEN** participant observation remains activation blocked
- **AND** no owner publication, Caddy mutation or activation is performed

#### Scenario: Devsync retains the lock across its production child spawn

- **GIVEN** the unlocked devsync parent acquired or inherited the canonical edge lock
- **WHEN** it starts the real flock executor and locked Bun child
- **THEN** it explicitly passes the kernel descriptor with its matching token
- **AND** the locked child verifies and reuses that description while excluding competing processes

#### Scenario: Provisioning stages Compose bytes before configure admission

- **GIVEN** bootstrap completed and candidate base Compose bytes were uploaded
- **WHEN** configure observes retained owner state or another shared-edge writer
- **THEN** live `base.yml` remains unchanged and the staged candidate remains separate
- **AND** admitted configure commits through a sibling file and final rename under the canonical lock

#### Scenario: Manual deployment refuses retained ownership before fetch

- **GIVEN** retained owner or interrupted-publication state exists
- **WHEN** the manual SSH deployment holds the canonical outer lock
- **THEN** it refuses before invoking Git fetch or acquiring the poll lock

### Requirement: Installed executor replacement admits under the shared edge lock

The swap/smoke installer SHALL use unique staging, capture local hashes, and
validate both staged files before replacing either under the existing canonical
edge lock. It SHALL refuse retained owner markers or unreadable/missing trusted
state and verify both installed hashes before releasing the lock. Installation
SHALL NOT claim pairwise atomicity, host adoption, prior-holder drain or activation.

#### Scenario: Concurrent or retained-owner publication refuses replacement

- **WHEN** another process holds the canonical lock, canonical lock state is absent, or either owner marker exists even as malformed, unreadable, directory or dangling state
- **THEN** the installer refuses before chmod or replacement of either installed executor
- **AND** separate attempts cannot overwrite one another's staging names

#### Scenario: Canonical state or lock path has the wrong kind

- **WHEN** the canonical state root is a symlink/non-directory or the canonical lock is a directory, FIFO, symlink or unreadable file
- **THEN** installation refuses before either installed executor is changed
- **AND** the durable recovery recipe refuses a symlink state root even when it points at a valid lock and retained marker

#### Scenario: Staged bytes differ from the captured build

- **WHEN** either uploaded file differs from its captured local SHA-256 identity
- **THEN** neither installed executor is replaced

#### Scenario: Replacement or installed readback fails

- **WHEN** a rename, installed-byte comparison or SSH transport fails during publication
- **THEN** installation fails loudly with partial or uncertain publication guidance
- **AND** success requires both installed comparisons while the canonical lock remains held

### Requirement: Installed writer capture inventory is read-only and never adoption

The system SHALL compare a strictly decoded reviewed source/build manifest with
all required local captured writer artifacts and SHALL always block activation.

#### Scenario: Complete equal captured inventory

- **GIVEN** a separately reviewed v1 manifest declaring exact source/build commits, expected hashes and declared locations for every required prod/dev/shared slot
- **WHEN** both complete read passes match every reviewed and installed artifact
- **THEN** the CLI emits a versioned local supplied capture inventory binding the manifest and per-member digests
- **AND** activation is blocked, with explicit unresolved effective authority, process, solver runtime and continuous exclusion obligations
- **AND** no adoption receipt, participant proof, marker publication or process control occurs

#### Scenario: Incomplete, malformed or substituted observations

- **WHEN** a required member or environment is omitted, duplicated or aliased, the manifest is malformed or carries an activation field, or required bytes are absent, unreadable, nonregular, larger than 128 MiB, hardlinked across required paths, outside the capture root, symlinked (including parent substitution during open) or differ from their independently reviewed digest
- **THEN** the CLI refuses without inventory output
- **AND** substituted interpreter or authority configuration bytes receive the same refusal

#### Scenario: Required evidence changes during inspection

- **WHEN** a required artifact or the reviewed manifest changes during the two-pass inspection
- **THEN** the CLI refuses without inventory output
- **AND** equal local snapshots never establish host-wide quiescence, effective authority or live process drain

### Requirement: Solver command local inherited edge descriptor prerequisite

The solver command runner SHALL offer an explicit local mode that validates
canonical state readability, nonsymlink state/lock kinds, inherited descriptor
identity and flock before launch. It SHALL refuse retained owner markers and
map the verified open description to child FD3, preserving exclusion. The state
path SHALL be absolute and normalized before filesystem inspection, rejecting
trailing slashes, dot or parent segments and duplicate slashes. The child SHALL
receive the exact validated state path. Existing remote installer calls SHALL remain unchanged until a shared install operation
is admitted.

#### Scenario: Local child inherits the held description

- **GIVEN** the parent holds the canonical edge lock on inherited FD8
- **WHEN** it explicitly invokes the local solver command mode
- **THEN** the real child verifies FD3 and a competing lock acquisition refuses

#### Scenario: Forged descriptor or retained ownership refuses before launch

- **GIVEN** a missing, malformed, foreign or independently opened descriptor, a retained marker, unreadable state or symlink canonical path
- **WHEN** the local solver command mode is requested
- **THEN** the runner refuses before the child starts

#### Scenario: Alternate state spellings cannot hide a symlink root

- **GIVEN** a genuinely held canonical FD8 and a symlink state path ending in `/` or `/.`
- **WHEN** the local solver command mode is requested
- **THEN** the runner refuses the noncanonical spelling before filesystem checks or child launch

### Requirement: Supervisor installation retains shared edge admission

The supervisor installer SHALL retain canonical edge admission through four
replacements, installed readback and bounded service/socket readiness. It SHALL
refuse invalid local inheritance or retained owner markers; remote mode SHALL
acquire authority independently. Transport SHALL preserve captured source hashes
and use private invocation staging. Failures SHALL report uncertainty without
automatic rollback or activation permission.

#### Scenario: Devsync installs through an inherited local description

- **GIVEN** devsync holds canonical edge.lock and no retained owner marker exists
- **WHEN** its installer child uses explicit `--local` to launch the host publication shell
- **THEN** the shell receives the same open description at FD3 through both Bun boundaries
- **AND** competing lock attempts cannot enter during replacement, readback or service readiness

#### Scenario: Invalid local inheritance refuses without fallback

- **GIVEN** the local installer lacks its inherited descriptor or receives a foreign descriptor
- **WHEN** execution is requested
- **THEN** it refuses before installed files or service state change
- **AND** it does not reopen edge.lock or switch to remote transport
- **AND** combining `--local` with an explicit `--host` refuses at the argument boundary

#### Scenario: Transport and publication evidence remain invocation bound

- **GIVEN** source hashes were captured before SCP and staging is private to this invocation
- **WHEN** staged or source config bytes change after capture, or installed bytes change after a rename
- **THEN** the respective hash verification refuses and the service cannot report successful installation
- **AND** a failure after publication begins reports partial or uncertain state requiring inspection

#### Scenario: Service readiness is bounded inside admission

- **GIVEN** all four installed hashes match and service restart has returned
- **WHEN** service activity or its Unix socket remains unavailable
- **THEN** installation fails after at most forty probes while retaining edge admission
- **AND** it reports uncertainty rather than rolling files back automatically

#### Scenario: Canonical host state and installed modes are verified

- **GIVEN** the installer is about to publish its private staged files
- **WHEN** canonical state or edge.lock is missing, unreadable, a symlink or the wrong kind, or a retained owner marker exists in any shape
- **THEN** it refuses before any final file replacement
- **AND** accepted staging must match all four hashes captured before transport, including the same config bytes accepted by validation, and its Bun version must be supported
- **AND** published Bun/bundle modes are 0755, config is 0600 and the unit is 0644 before systemd reload, enable and restart

#### Scenario: Cross-filesystem transport never copies into live destinations

- **GIVEN** transport staging and installed destinations may use different filesystems
- **WHEN** the installer acquires edge admission
- **THEN** it creates any first-install destination parents inside admission and copies each payload into an invocation-owned 0700 sibling directory beside its destination
- **AND** it sets exact file modes and verifies all four sibling hashes and the sibling Bun version before the first final replacement
- **AND** final replacement uses the native rename syscall with no cross-device copy recovery
- **AND** preparation failure leaves all installed files unchanged, collisions preserve directories this attempt did not create, and failed staging cleanup reports the attempt and original expected hashes rather than success

### Requirement: Solver exclusion remains continuous through activation and exposure

The deployment coordinator SHALL establish actual solver stop/drain and closed request admission before protected work. It SHALL continuously fence effective supervisor restart, installation/replacement and launch paths together with all required participants through maintenance, activation and final pre-exposure recheck. Missing, unknown or lost authority SHALL refuse and retain barriers for attended recovery.

#### Scenario: Existing and competing solver work is excluded

- **WHEN** deployment enters the protected interval with in-flight solver attempts and possible new requests
- **THEN** actual solver attempts are drained or terminally stopped before protected storage work, and new attempts cannot enter throughout the interval
- **AND** complete backend/gateway/MCP/ingress/replay/background and other required participant exclusions remain enforced
- **AND** a one-time service stop, absent socket or source-only lock is not sufficient evidence

#### Scenario: Restart and installer competitors cannot reopen admission

- **WHEN** Restart=always, manual launch, local/remote installer, devsync or another supported replacement path competes during exclusion
- **THEN** effective retained fences prevent supervisor re-entry or replacement until authorized restoration
- **AND** unknown, changing, incomplete or unreadable launch/restart authority refuses protected work and exposure
- **AND** independently bypassing each restart, installer or owner guard fails its production-path acceptance

#### Scenario: Interrupted or uncertain deployment preserves barriers

- **WHEN** coordinator recovery cannot prove continuous exclusion or exposure/activation history
- **THEN** it retains barriers and uncertainty evidence for attended compatible recovery rather than reopening an old participant
- **AND** final pre-exposure recheck must establish complete current exclusion before requests reopen
- **AND** the separately proposed identity broker cannot substitute for exclusion or grant activation

### Requirement: Supervisor restoration uses independently pinned compatible identities

Restoration SHALL admit only an independently pinned compatible supervisor/runtime/config/unit/solver-image tuple and compatible participants under retained deployment admission. Actual installed/mapping identity, effective restart/readiness and final pre-exposure readbacks SHALL precede reopening. Possible activation or uncertain exposure SHALL preserve current storage and require attended compatible recovery.

#### Scenario: Compatible pinned restoration reopens only after readback

- **WHEN** an authorized recovery restores the approved compatible tuple
- **THEN** installed artifacts, solver mapping, restart configuration and readiness agree with independent pins while exclusion remains held
- **AND** requests reopen only after final participant/exclusion readback succeeds

#### Scenario: Incompatible or uncertain restoration refuses

- **WHEN** a tuple is unpinned, changed, semantically incapable, partially restored or cannot be read back
- **THEN** barriers and diagnostic evidence remain, with the pinned manual completion procedure
- **AND** removing the tuple, compatibility or final-readback guard fails its production-path acceptance
- **AND** absence of current external edges never permits an incapable binary after possible activation

#### Scenario: Dormant rollback preserves its exact existing boundary

- **WHEN** recovery proves the separately admitted dormant rollback contract before semantic exposure
- **THEN** only exact captured migration additions are reversed and the complete name/hash ledger is compared
- **AND** possible activation or uncertain exposure prohibits automatic schema reversal, snapshot restore or old-writer restart

### Requirement: Dedicated retained dependency owner lifecycle

The dedicated deployment owner SHALL publish durable attempt-bound exact plan
intent under canonical ordered locks before managed exclusion. Only its live
in-memory capability SHALL authorize owner operations. Every Docker boundary
SHALL retain readable intent before execution and check live ownership and exact
retained bytes before and after execution. Success SHALL report only managed
exclusion with unresolved participant obligations and SHALL retain evidence.

#### Scenario: Managed exclusion retains ordinary admission closure

- **WHEN** the dedicated managed fence completes
- **THEN** gateway/backend exclusion receipts and the exact owner plan remain
- **AND** ordinary deployment refuses and no activation or restoration occurs

#### Scenario: Interrupted or lost owner cannot continue

- **WHEN** an operation loses its live lock identity, marker readback or callback lifetime
- **THEN** subsequent owner effects refuse and all existing evidence remains
- **AND** retained JSON, digest, boolean or environment token cannot recreate ownership

#### Scenario: Future activation requires complete continuous exclusion

- **WHEN** only the managed backend/gateway slice has completed
- **THEN** the owner cannot issue a complete participant proof or activate storage
- **AND** future handoff requires complete installed writer, ingress, MCP, solver,
  replay/background and restart exclusion through the final exposure readback

### Requirement: Guarded supervisor runtime admission

The supervisor executable SHALL hold canonical solver-runtime.lock from before
config read, orphan sweep and socket bind until process termination. It SHALL
refuse retained owner markers. Mapping preflight SHALL remain read-only and
independent of runtime occupancy. A live dependency owner SHALL hold that same
lock throughout its protected callback and include it in owner boundary checks.
This source prerequisite SHALL NOT claim legacy process drain or activation.

#### Scenario: Ready supervisor retains admission

- **WHEN** the actual guarded supervisor is ready or paused in startup
- **THEN** a competing launch or protected owner callback refuses
- **AND** edge-held installer readiness remains possible
- **AND** the kernel releases runtime admission after process termination

#### Scenario: Retained owner and invalid trusted state refuse

- **WHEN** owner markers exist or trusted runtime state is absent or unreadable
- **THEN** supervisor admission refuses before config read, orphan sweep or bind
- **AND** read-only mapping preflight still validates mapping under owner markers and runtime occupancy

#### Scenario: Owner runtime callback loses evidence

- **WHEN** the runtime descriptor identity or retained owner bytes change
- **THEN** subsequent owner boundaries and successful callback completion refuse
- **AND** interruption retains owner markers for attended recovery
