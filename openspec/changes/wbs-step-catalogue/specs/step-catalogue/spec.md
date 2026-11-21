## ADDED Requirements

### Requirement: Steps are defined once per organization and bound per scope and type

An organization SHALL hold one step catalogue with codes unique per organization; bindings at
organization, space or project scope SHALL name one work item type or every type (design.md
SC1, SC2). A leaf SHALL resolve the bindings on its chain matching its type or every type; an
untyped leaf only every-type ones (SC3); a type conflict leaf nothing (SC19).

#### Scenario: A story and a spike estimate different steps

- **WHEN** organization A binds `dev` and `qa` for every type, binds `research` for
  `spike`, and project P adds `review` for `story`
- **THEN** a `story` leaf in P resolves `dev`, `qa`, `review` with provenance
  `organization, organization, project`, a `spike` leaf resolves `dev`, `qa`, `research`,
  and an untyped leaf resolves `dev`, `qa`

#### Scenario: A lower scope cannot hide an inherited step

- **WHEN** project P tries to remove the organization's `qa` binding through its own
  bindings route
- **THEN** the request is refused `404 not_found` for a binding P does not own, and every
  leaf of P still resolves `qa`

#### Scenario: A type conflict resolves nothing

- **WHEN** a leaf carries the stored types `story` and `spike` and `setEstimate` names `dev`
- **THEN** it is refused `409 type_conflict`, the leaf's steps read empty and flagged, and no
  type is chosen

### Requirement: Current local references follow the addressed leaf's resolved steps

Current tree step nodes and local reference resolution SHALL use each leaf's resolved order and count. Parents, zero-step leaves and type-conflict leaves SHALL expose no step nodes. A local address revision SHALL change when a leaf's applicable identities or their order changes, even if the package union is unchanged. Names and unused union columns SHALL NOT affect it. Legacy uniform address descriptions SHALL retain their prior representation through an explicit uniform mode; partial or wholly absent current leaf metadata SHALL throw instead of applying a package-wide fallback.

#### Scenario: Opposing leaf orders and an empty leaf

- **GIVEN** the package union is `dev, qa`, leaf A resolves `dev, qa`, leaf B resolves `qa, dev` and leaf C resolves nothing
- **WHEN** the current tree and local references are read
- **THEN** A's first reference names `dev`, B's first names `qa`, C exposes no nodes and C's `dev` reference is refused `unknown_code`

#### Scenario: A direct type change preserves the union but invalidates an address

- **GIVEN** a leaf's reference was read while its direct type resolved a step
- **WHEN** an admitted type edit makes that leaf resolve no steps without changing the package union
- **THEN** the old reference revision is refused as stale, and the same code under the fresh revision is unresolvable

### Requirement: Current creation replies describe the actual birth snapshot

Direct work-package creation and project-with-first-work-package creation SHALL return the actual born header and inherited catalogue steps captured inside their birth owner. Current creation SHALL mint no Dev/QA definition identities. An empty catalogue SHALL return an explicit empty step list; typed bindings SHALL still materialize their package values before any leaves exist. A subsequent catalogue edit SHALL NOT be combined with the birth header through an independent response read. Missing current metadata or explicit values SHALL fail the whole birth without leaving package, allocator, values, grants or audit writes. Ordinary and repair loans SHALL expire with their owner, and queued public input SHALL be retained before waiting.

#### Scenario: A born package inherits authored organization and project steps

- **GIVEN** an organization and project bind existing definitions with explicit positions, units and allowances
- **WHEN** a current Source service creates a work package in that project
- **THEN** its response lists those actual identities and materialized values in resolved package order, or `[]` when none reach the project
- **AND** it generates no separate Dev/QA steps

#### Scenario: A catalogue edit after publication cannot mix response epochs

- **GIVEN** the birth owner captured the new header and its inherited steps
- **WHEN** another admitted write renames a definition after publication but before the service returns
- **THEN** the birth response retains its captured step name and header revision together
- **AND** a fresh read observes the later name and revision

### Requirement: Bindings are unique and totally ordered

Two bindings with one scope, step and type, every-type included, SHALL NOT both exist, and a
leaf's resolved steps SHALL sort by the total order of design.md SC18, listing every matching
binding as provenance.

#### Scenario: A duplicate every-type binding is refused

- **WHEN** project P binds `qa` for every type twice
- **THEN** the second write is refused `409 duplicate_binding` and one binding remains

#### Scenario: A step bound at two scopes orders by the higher one

- **WHEN** the organization binds `qa` at position 2 for every type and project P binds `qa`
  at position 1 for `story`
- **THEN** a `story` leaf of P lists `qa` at the organization's position with both bindings
  in its provenance, and deleting P's binding leaves `qa` resolved

### Requirement: Current claim observations preserve each leaf's resolved order

A current Source claim observation SHALL capture required ordered step identities for every actual leaf from its same admitted snapshot. A zero-step leaf SHALL have an explicit empty inventory. Claim display SHALL keep tree order and nullable subtree claims before step claims, then order a leaf's point claims by that leaf's SC18 resolution. A package-union order SHALL NOT substitute for missing or distinct per-leaf order. Missing current metadata, unresolved point claims, absent explicit values and broken ancestry SHALL fail visibly. Existing access rechecks and public claim payloads SHALL remain; stored claims and timestamps SHALL NOT be rewritten.

#### Scenario: Two types order shared definitions oppositely

- **GIVEN** one project's story bindings order `dev` before `qa` and spike bindings order `qa` before `dev`, using the same definitions
- **WHEN** actual current Sources observe claims written in a different order on both leaf types
- **THEN** display follows each leaf's own order, within the unchanged tree order, in both adapters
- **AND** a nullable subtree claim precedes point claims of that same work item

#### Scenario: Missing order never becomes a package-wide fallback

- **GIVEN** actual current leaf order was captured beside its claims
- **WHEN** that leaf's required order is absent, or a retained point claim no longer resolves
- **THEN** the read fails visibly without changing claims or returning a partially sorted display
- **AND** an actual zero-step leaf remains explicitly empty rather than being treated as missing metadata

### Requirement: Definitions are created through a scope the caller manages

A definition SHALL be created only by `defineAndBindStep` at one scope, with that scope's
permission checked at the scope id (design.md SC20); scope, definition and type SHALL share
the caller's organization; renaming or retiring a definition SHALL need
`organization.manage_settings`.

#### Scenario: A project manager adds a step to their project

- **WHEN** a manager of project P calls `defineAndBindStep` at P with code `review`
- **THEN** one organization definition `review` and one binding at P exist, written in one
  transaction

#### Scenario: A sibling project or another organization is refused

- **WHEN** the same manager binds at sibling project P2, or names a type of another
  organization
- **THEN** the write is refused and nothing is created

### Requirement: Step nodes exist for resolved steps and never vanish with data

A step node SHALL exist for every leaf and every step in its resolved set. Every write that
would remove a step from a leaf's set (design.md SC17 lists them) SHALL be refused
`409 step_nodes_in_use { count, pairs }` while any protected fact of SC17 exists for a
vanishing pair, issued attempt counters included, listing each pair (work item `id`, `name`,
`stepId`, `workPackageId`, fact kinds; the first 200, `count` the total); each such write SHALL
accept `dryRun: true` and answer the same list, or `wouldRefuse: null`, under the write's
permission without writing or announcing. Every fact writer SHALL refuse a step outside the leaf's resolved
set with `422 step_not_resolved`.

An issued-attempt counter retained on a parent is an allocator reservation, not an active parent step node. Its applicability SHALL be evaluated against that work item’s own stated/direct type and current package chain, with the same definition identity, organization ownership, explicit package values and scalar validation as a current leaf counter. A configuration or structural change that would leave the retained reservation unresolved SHALL be refused with that parent’s identity and `attempt_issued`, using its actual tree rank in the same count/order/cap contract. Descendant types SHALL NOT replace the parent’s stated type. Other point facts SHALL remain leaf-only; this exception SHALL NOT hide, delete, reset or silently ignore any retained counter.

#### Scenario: Retained parent numbering survives child deletion and configuration preview

- **GIVEN** a leaf has issued number 11 and lawful first-child transfer retains its allocator reservation while copying 11 to the child
- **AND** an unmarked sibling is added and the marked child is deleted
- **WHEN** removing the binding is previewed or applied while the unmarked sibling still exists
- **THEN** the change lists the retained parent with `attempt_issued` and is refused without changing persistence or announcing
- **AND** after deleting the last sibling, the parent becomes a leaf with the same resolved step and its next attempt is numbered 12
- **AND** a reservation in a sibling project or foreign organization does not veto an unrelated binding change that leaves its own applicability unchanged

#### Scenario: Restoring historical point values revalidates the candidate leaf

- **GIVEN** a lawful subtree payload contains an actual, progress statement or measure and its step definition and explicit package values remain after safe unbinding
- **WHEN** public or borrowed subtree insertion would restore that value outside the candidate leaf's current resolved set
- **THEN** the store returns `point_refused { fact, workItemId, stepId, reason }`, where `fact` is the singular SC17 kind `actual`, `progress` or `measure` and `reason` is the current step-write refusal
- **AND** the refusal is returned only after confirmed method-local rollback, retaining all existing state and archived package values even when the borrowed caller catches it and commits an unrelated write
- **AND** the existing estimate-specific `estimate_refused` contract remains unchanged; application callers refuse before announcing or journalling success

#### Scenario: A predecessor deletion cannot recreate current parent progress

- **GIVEN** a genuine predecessor deletion journal retains original progress for the surviving parent in its inverse
- **WHEN** current undo would restore that parent's children and its original progress together
- **THEN** it returns `409 stale_undo` with a diagnostic before clearing any facts or inserting rows, using the existing stale-entry discard and outer-rollback repair contract
- **AND** immutable plan-history rows and their recorded bodies remain unchanged; ordinary current parent-point writers remain invalid
- **AND** a predecessor deletion carrying only lawful leaf progress still supports undo, redo and another undo with its recorded progress timestamp intact
- **AND** unreadable required current state still throws and preserves the undo entry rather than being converted to a stale refusal

#### Scenario: First-child transfer is one applicability-checked write

- **GIVEN** a leaf has protected facts and an explicitly untyped first child is proposed
- **WHEN** any transferred step does not resolve on that actual child, or a protected fact has no lawful transfer
- **THEN** the write returns `409 step_nodes_in_use` with original leaf identities and fact kinds and leaves the complete persisted state unchanged
- **AND** otherwise all affected facts and relationship endpoints transfer within one writer-owned atomic operation, retaining identity, tuple multiplicity, claim satellites and allocator reservations
- **AND** success exposes one complete post-transition working-plan refresh; undo and redo use the same atomic boundary, with existing incident authority and restoration ownership preserved

#### Scenario: Moving existing work under a leaf with protected values

- **GIVEN** destination leaf L holds a protected point value on a resolved step
- **WHEN** an existing work item is moved under L and no lawful ownership transfer exists
- **THEN** the actual writer refuses step_nodes_in_use with L's original identity and protected fact kinds before clearing facts or changing structural state
- **AND** a preview returns the same count/pairs without writes, journalling or publication
- **AND** the incoming work item's direct type cannot replace L's type when projecting that loss
- **AND** an explicit retained allocator reservation is checked against its own direct type rather than treated as an ordinary parent point fact
- **AND** an otherwise lawful move under an empty destination succeeds without inheriting unrelated sibling facts

#### Scenario: Re-typing a leaf with an estimate on a type-bound step

- **WHEN** a `spike` leaf holds a trio on `research` and is changed to `story`
- **THEN** the change is refused
  `409 step_nodes_in_use { count: 1, pairs: [{ id: L, name, stepId: research, workPackageId: W, facts: ['estimate'] }] }`
  and the trio is still read; the same change with `dryRun: true` answers
  `200 { wouldRefuse: 'step_nodes_in_use', count: 1, pairs: [...] }` and the leaf is still a
  `spike`; after `clearEstimate` the change succeeds and `research` is absent from the
  leaf's steps

#### Scenario: A blockage alone keeps its step node

- **WHEN** the only fact on (leaf L, `research`) is a step blockage and the `research`
  binding is deleted
- **THEN** the delete is refused `409 step_nodes_in_use` and
  `GET /api/projects/:id/step-nodes-in-use?stepId=research` lists L with `blockage`

#### Scenario: An estimate on an unresolved step

- **WHEN** `setEstimate` names `research` on a `story` leaf
- **THEN** it is refused `422 step_not_resolved` and nothing is written

#### Scenario: Current move history uses the actual owned before-image

- **GIVEN** an existing work item is moved under a destination leaf with no protected point facts
- **AND** lawful destination nonpoint statements or resource demand change after preflight but before the actual writer admits the move
- **THEN** comparison, nonpoint clears and placement occur through the same owned transition
- **AND** current forward history contains no independent destination-clear prelude
- **AND** undo restores the actual writer's nonpoint before-image, without assigning destination point facts to the incoming work

#### Scenario: Late protected facts during current move replay

- **GIVEN** a current move entry passes its ordinary authority/revision/structural replay checks
- **AND** a protected destination step fact is admitted before the actual structural writer
- **WHEN** undo or redo reaches that writer
- **THEN** it returns step_nodes_in_use with the exact current count/pairs before destination clears or placement writes
- **AND** the command scope rolls back preceding effects, keeps the selected journal entry and publishes nothing
- **AND** the undo/redo HTTP response reports409with count/pairs and no private journal metadata

#### Scenario: A replay direction without a nonpoint inverse still watches its destination

- **GIVEN** a current move was recorded under a leaf with no nonpoint statements or demand to restore
- **WHEN** undo succeeds and another admitted move changes that destination's revision
- **THEN** redo retains its prior watched destination identity and refuses through the existing revision-stale policy
- **AND** it performs no structural or publication effects

### Requirement: Unit and allowance stay per work package

Each work package SHALL hold one `work_package_step` row per step of every binding reaching
its project for any type, written explicitly when the package is created, a step is bound or
the package or project moves, defaulting from the definition at that moment, never deleted
by unbinding and never read through a fallback (design.md SC21). Changing a unit while the step holds estimates SHALL stay refused.

#### Scenario: A new package gets explicit rows

- **WHEN** an empty work package is created in project P whose bindings name `dev`, `qa`
  (every type) and `review` (`story`)
- **THEN** three `work_package_step` rows exist with the definitions' units and
  allowances, and a read with one row deleted behind the store throws
  `WorkPackageStepMissing` naming the pair

#### Scenario: A unit-only current package refresh reaches its controls

- **GIVEN** an unestimated package step is shown in workdays
- **WHEN** its current package-value write and covering read return minutes while its identity, name, code and allowance remain unchanged
- **THEN** the delivered snapshot and package unit control display minutes
- **AND** a genuinely equal later snapshot preserves the existing editor instances

### Requirement: The scheduler slices each leaf by its resolved steps

The engines SHALL receive per-leaf slices in the leaf's resolved order; a leaf resolving no
step SHALL keep one zero-duration boundary slice; a `descendant-step` endpoint SHALL apply to
the descendants that resolve the step and SHALL throw `no_descendant_resolves_step` when none
does (design.md SC16). Fast and the solver SHALL agree.

#### Scenario: A mixed subtree waits on its QA nodes only

- **WHEN** parent E has a `story` child resolving `qa` and a `spike` child that does not, and
  X depends finish-to-start on E's `qa` across descendants
- **THEN** X starts after the story's `qa` node in both engines and the spike adds no edge

#### Scenario: No descendant resolves the step

- **WHEN** every descendant of E is a `spike` and the dependency names `qa`
- **THEN** scheduling throws `no_descendant_resolves_step` naming the dependency

#### Scenario: A zero-step leaf retains whole-dependency boundaries

- **GIVEN** a leaf explicitly resolves no steps
- **WHEN** whole dependencies connect a positive-duration predecessor through that leaf to a successor
- **THEN** its boundary waits for the predecessor and releases the successor at the same instant in Fast and the solver request

#### Scenario: Holds remove every originally matching descendant

- **GIVEN** a valid descendant-step relationship and a partly held parent
- **WHEN** every descendant resolving the selected step is held
- **THEN** the reduced schedule omits that relationship and the authored input remains exact
- **AND** any remaining matching descendant keeps its constraint
- **AND** an originally unmatched selector, absent owner or missing descendant slice evidence throws

#### Scenario: Per-leaf slicing requires complete explicit inventories

- **WHEN** a current leaf inventory is absent, repeats an identity, names an unknown package policy or excludes a retained estimate
- **THEN** slice preparation throws before returning a schedule input
- **AND** an explicit empty inventory produces the leaf boundary

### Requirement: Current tree node readings and resources follow own execution

Current tree node readings and resource records SHALL contain only each actual leaf's
resolved steps, in that leaf's order. Empty leaves SHALL have explicit empty records;
parents SHALL omit node readings and resources. Held leaves SHALL retain resources
before schedule reduction. Resource projection SHALL reject missing own lists,
nonleaf owners and repeated own step identities. Reads SHALL preserve stored progress.

#### Scenario: Opposite orders produce different waiting nodes

- **GIVEN** one leaf resolves Dev then QA and another resolves QA then Dev
- **WHEN** both have stored Dev done and their current tree is read
- **THEN** the first leaf reads QA waiting and the second reads QA unknown
- **AND** each leaf's resource keys follow its own order

#### Scenario: Distinct sets, empty leaves and held resources remain explicit

- **GIVEN** one leaf resolves Dev only, another resolves Dev then QA, and an empty leaf resolves none
- **WHEN** the full tree is read while the second leaf is held
- **THEN** the first leaf has no QA reading/resource, the empty leaf has empty records and the held leaf retains both resources
- **AND** held work is absent from schedule input and parents expose neither node record

### Requirement: Current execution and claim views use the addressed leaf's inventory

Scheduler-free execution, its local service fallback, startable work and claim decisions
SHALL use required per-leaf resolved inventories for graph order and step enumeration.
By-person assignments and step claims SHALL follow each addressed leaf's own order;
nullable subtree claims SHALL retain their existing ordering. Missing required leaf
metadata SHALL throw, including metadata for an empty leaf, rather than substitute the
package union or an empty list. Live progress, blockages and attempts SHALL name pairs
in that leaf's inventory. Current authorization, read lifetimes, holds, leases, capacity,
identity, quota and transaction rules SHALL remain in force.

#### Scenario: Execution respects opposite orders and an empty leaf

- **GIVEN** A resolves `dev, qa`, B resolves `qa, dev` and C resolves nothing
- **WHEN** current execution and startable work are read through the actual Source
- **THEN** A can start `dev`, B can start `qa`, C exposes no step prerequisites and each
  leaf's by-person records follow its own order
- **AND** after each first step is done, claiming unfinished work acquires only A's `qa`
  and B's `dev`, while C returns `no_steps`

#### Scenario: A package policy does not authorize an unresolved claim target

- **GIVEN** `qa` exists in the package but does not resolve on leaf B
- **WHEN** the current claim command explicitly asks for B's `qa`
- **THEN** it returns `step_not_resolved` without progress or claim writes
- **AND** an identity absent from the package still returns `unknown_step`

#### Scenario: Captured package membership cannot legalize unresolved live facts

- **GIVEN** a captured policy belongs to the package but is absent from a leaf's inventory
- **WHEN** progress, a blockage or an attempt names that unresolved pair
- **THEN** readiness throws for each collection independently

### Requirement: Status commands build recipes from each selected leaf's resolved steps

Current `setStatus` point recipes SHALL use each addressed leaf's own resolved order.
Starting SHALL select its first silent step; reopening SHALL select its last step.
A parent start SHALL skip empty leaves and retain tree order and unheld preference.
A selected leaf or subtree with no resolved steps SHALL refuse `done` and `in_progress`
as `no_steps`, regardless of policies elsewhere in the package. Missing current metadata
SHALL throw before mutation. Current own-step recipes SHALL undo/redo through their
actual journal, retaining existing date, hold and readiness behavior.

#### Scenario: Opposite orders govern start and reopen

- **GIVEN** A resolves `dev, qa` and B resolves `qa, dev`
- **WHEN** each leaf is first started, then each completed leaf is reopened
- **THEN** the first starts name A's `dev` and B's `qa`, and reopened steps name A's `qa` and B's `dev`

#### Scenario: Empty targets cannot borrow a package policy

- **GIVEN** another leaf uses steps but the selected target contains only empty leaves
- **WHEN** it is marked `done` or `in_progress`
- **THEN** the act returns `no_steps` and changes no point, date, readiness or hold
- **AND** its nonpoint readiness/hold commands retain their existing behavior

#### Scenario: A bulk point status does not skip a conflicted descendant

- **GIVEN** the selected scope contains a leaf with a stored type conflict
- **WHEN** `done` or `in_progress` addresses that scope
- **THEN** the entire act returns `type_conflict` before point, date or hold writes
- **AND** nonpoint readiness/hold changes remain allowed

#### Scenario: Claiming a conflicted leaf preserves explicit refusal precedence

- **GIVEN** a leaf has a stored type conflict
- **WHEN** a claim asks for all its unfinished steps or an owned package step
- **THEN** it returns `type_conflict` without claim/progress writes
- **AND** a step identity absent from the package still returns `unknown_step`

### Requirement: Saved input selects its recorded execution interpretation explicitly

Saved input13 SHALL record complete ordered step identities for each actual leaf, including
empty lists and excluding parents. Every connected member SHALL record its own census.
Original1–12 SHALL retain their declared uniform interpretation and original bytes. A missing
input13 inventory SHALL refuse rather than select the uniform interpretation.

Current saved-store writers SHALL select input13 and preserve every captured own list
through save, read and current comparison. Current live and captured schedule preparation
SHALL require complete own inventories. Explicit older constructors SHALL retain their
original version and uniform interpretation independently of the current writer version.

#### Scenario: Actual current stores retain own execution through save and later edits

- **GIVEN** an actual current catalogue with opposite leaf orders, distinct leaf sets and an empty leaf
- **WHEN** Memory or SQLite saves, reads and compares that capture with current state
- **THEN** input13 records each own list and the unchanged current comparison is empty
- **AND** a later valid type or name edit appears in the comparison while stored bytes remain exact
- **AND** actual live and captured preparation retain both own orders and the empty boundary

#### Scenario: Current preparation refuses an incoherent detached census

- **WHEN** a detached actual capture omits an empty leaf or includes a parent or foreign leaf entry
- **THEN** current preparation refuses the capture with the modeled history error
- **AND** a missing list does not select uniform package policy

#### Scenario: Mixed orders survive explicit13 capture and comparison

- **GIVEN** two leaves resolving the same definitions in opposite orders and a zero-step leaf
- **WHEN** their actual capture is encoded as input13, decoded and compared
- **THEN** each order and the explicit empty inventory remain exact
- **AND** identity-keyed leaf row reordering alone creates no order difference
- **AND** a changed own execution order appears as a difference on that leaf
- **AND** merged identities translate only in detached meaning, including connected member orders

#### Scenario: Current saved slices cannot use another leaf's policy

- **WHEN** a local or connected input13 schedule records an unresolved step, a parent node or
  a null-step boundary for a leaf with a nonempty own list
- **THEN** integrity validation refuses the saved schedule
- **AND** a zero-step leaf beside nonempty package policy retains its valid boundary

#### Scenario: Older captures retain their original evidence

- **WHEN** an original1–12 body is read or compared with input13
- **THEN** its uniform execution interpretation is derived from the validated original version
- **AND** its bytes, hashes, recorded owner/parent evidence and original closed grammar remain exact
- **AND** the comparison does not fabricate catalogue bindings or unrecorded parent evidence

#### Scenario: Historical uniform order precedes alias translation

- **GIVEN** a validated original12 connected member with tied policy positions
- **WHEN** aliases change the lexical order of its step identities
- **THEN** comparison derives uniform execution order from the original identities before translation
- **AND** translated metadata sets are canonical while the execution order and captured bytes remain exact

### Requirement: Current Source capture records each actual leaf's resolved order

Current Memory and SQLite captures SHALL return required ordered step IDs for every actual
leaf, including an explicit empty list. Their ordinary stored work-item rows SHALL retain
their previous shape. Rows and leaf resolution SHALL come from the same observation; a
missing resolved row or list SHALL throw rather than imply zero steps. Source close SHALL
refuse new capture acquisition and delivery of an in-flight capture.

#### Scenario: A rival type edit preserves the original capture

- **WHEN** another actual writer changes a leaf's type after the capture's first read
- **THEN** the in-flight capture retains its original row and step order together
- **AND** a later capture observes both the changed row and its new order

#### Scenario: Source close controls capture resources and delivery

- **WHEN** capture is called after SQLite Source close for a known or absent package
- **THEN** it rejects without acquiring a connection
- **WHEN** Source closes during the first-read continuation
- **THEN** capture rejects and SQLite issues no later SELECT
- **WHEN** SQLite Source closes during its final directory read
- **THEN** the detached capture is not delivered

### Requirement: The migration keeps step ids and refuses what it cannot preserve

The migration SHALL keep every step's id as its definition id, SHALL bind each at its
package's project for every type, SHALL change no stored history byte, SHALL refuse every
report row of design.md SC23 until the rules file rules it, SHALL record each merged id in
`step_identity_history`, and history readers SHALL translate merged ids on read only
(SC11–SC13).

#### Scenario: Unsupported live parent points refuse catalogue admission

- **GIVEN** a genuine predecessor database retains a concrete point fact on a work item that has children
- **WHEN** report, merge-rule preflight or guarded apply observes that state
- **THEN** it refuses identifying the table, work item and step before changing the complete database, previous report or migration ledger
- **AND** it does not clear, transfer, hide or reinterpret the fact or rewrite any historical body
- **AND** retained issued-attempt reservations and whole/subtree claims with a null step remain permitted by their existing scope rules
- **AND** missing/foreign tree ownership still refuses before point applicability; this diagnostic adds no report kind or automatic repair rule

An unmerged migration-origin step SHALL return to its original predecessor representation on
rollback, including a NULL code promoted by an explicit SC23 confirmation. Apply SHALL retain
lossless raw-code provenance; down SHALL NOT infer the predecessor code from the confirmed code
or step name. Missing or incoherent required provenance SHALL refuse before destructive writes,
leaving current rows and the complete ledger unchanged.

#### Scenario: An explicitly confirmed formerly uncoded step reverses losslessly

- **WHEN** a predecessor step S has code NULL, apply receives its exact explicit code confirmation,
  and the catalogue remains unmerged and otherwise representable by the predecessor layout
- **THEN** public down restores S with the same ID and original NULL code, every original step
  scalar and fact answers unchanged, historical JSON/hash bytes stay identical, and the complete
  predecessor migration name/hash ledger is restored
- **AND** the confirmed forward code alone is not evidence of the original code

#### Scenario: Missing legacy-code provenance cannot be guessed during down

- **WHEN** down cannot read the required original-code provenance for an otherwise unmerged step
- **THEN** it refuses naming that step before changing schema, rows or the complete ledger

#### Scenario: Equal codes merge, differing codes refuse

- **WHEN** two packages of A in different projects define `qa` with equal name, unit and
  allowance, two others define `dev` as "Dev" (workdays) and "Development" (minutes), and
  `report` runs
- **THEN** one `shared_code_identical` row names the `qa` survivor (earliest `created_at`,
  then lowest id) and one `shared_code` row lists both `dev` rows and their differing
  fields, and nothing else is written; `apply` without a rule for `dev` refuses; with
  `survivorStepId` for `dev` both codes merge, every loser's facts are re-pointed, each
  package keeps its unit and allowance, and every losing id is in `step_identity_history`

#### Scenario: One project with disjoint sets

- **WHEN** packages W1 and W2 of project P hold `{dev}` and `{qa}`
- **THEN** the report has one `divergent_project_set` row for P naming `W1: dev` and
  `W2: qa`, `apply` refuses whatever the rules file says, and neither package gains a step;
  after W2 is moved to project P2, `apply` succeeds and W1 resolves `{dev}`, W2 `{qa}`

#### Scenario: A saved plan reads after a merge

- **WHEN** a saved plan captured before the merge names the losing id in its input and
  schedule bodies
- **THEN** its stored hashes still verify, its resolved comparison meaning names the survivor,
  and its original captured evidence and stored bytes are unchanged afterwards

#### Scenario: Connected saved comparison resolves a merged step without changing evidence

- **GIVEN** valid connected saved captures before and after a merge that differ only by a
  losing step id and its derived identity sites, including a typed relationship and a ready
  optimization stage
- **WHEN** their original bytes, hashes and links verify and both saved comparison paths read them
- **THEN** their detached input and schedule meanings compare equal using the survivor
- **AND** captured dependency history, stage bytes, question hashes, signatures, detail bytes and
  provenance summaries retain their original values; no stored body or history row is rewritten

#### Scenario: Identity translation cannot hide corrupt original bytes

- **WHEN** a connected saved body naming a merged step is altered without changing its stored hash
- **THEN** reading refuses on original-body integrity before identity projection or comparison

#### Scenario: Connected comparison retains differences beyond identity

- **WHEN** two verified connected captures use equivalent merged-step identities but differ in
  solver configuration, a selected timing, or an optimization variant outcome
- **THEN** comparison reports the corresponding difference rather than treating the captures as equal
- **AND** normalization of derived digest spelling does not suppress the differing configuration
  or captured outcome

#### Scenario: A stale rules file

- **WHEN** a step row changes between `report` and `apply`
- **THEN** `apply` refuses on the fingerprint and writes nothing

### Requirement: Workflow bindings validate offline over a manifest

WBS SHALL serve a revision-bound step manifest per project; Burokrat SHALL validate every type
and code pair and the default mapping of a workflow binding offline against it and SHALL
refuse a manifest of another revision (design.md SC22).

#### Scenario: A code of another type

- **WHEN** the binding maps `story.research` and the manifest resolves `research` for
  `spike` only
- **THEN** validation exits non-zero naming `story.research`, without network

### Requirement: Scoped admission follows current catalogue fact identities

Scoped work-package admission SHALL census the current eleven point-fact families and both step columns of typed/external dependency endpoints against actual definition organization and the addressed endpoint package's explicit values. Missing trusted definition or organization state SHALL throw; a missing explicit pair SHALL throw WorkPackageStepMissing. Foreign identities SHALL retain precise crossing refusal semantics. A null subtree claim SHALL not invent a point, and parent-issued attempt history SHALL retain identity-only validation. Existing directory, person, parent, legacy dependency and capacity checks SHALL remain.

#### Scenario: A shared definition does not create incoming point ownership

- **GIVEN** packages A and B in one organization both hold explicit values for shared definition S
- **WHEN** B stores a fact on (B work item,S)
- **THEN** scoped admission of A does not classify that fact as incoming to A
- **AND WHEN** only B's explicit values are removed behind the store
- **THEN** admission of A remains unaffected and admission of B throws WorkPackageStepMissing for (B,S)

#### Scenario: Explicit relationship endpoint ownership remains authoritative

- **GIVEN** a current typed or external relationship has a node/descendant-step endpoint in package P
- **WHEN** the endpoint's step definition is foreign, missing, or its explicit values for P are missing
- **THEN** admission reports the precise foreign crossing or throws the required trusted-state failure
- **AND** a shared definition elsewhere does not supply missing endpoint values or override declared work-item package identity

### Requirement: Imports reconcile step codes under the actual destination project

Import SHALL reuse active same-organization definitions by code. A file code absent from the destination project's untyped/default resolution SHALL acquire an every-type binding there under current `project.manage_settings`. Existing inherited/default bindings SHALL require no additional settings permission. Project-scoped definition birth SHALL use SC20 without an additional organization settings grant. The optional request boolean `defineMissing` SHALL default to false; malformed flags SHALL be rejected before the importer. Without opt-in, all unknown codes SHALL answer `422 unknown_step_codes` in file step order without writes. Retired codes SHALL retain the distinct SC25 refusal in either mode, before unknown-code reconciliation.

Import SHALL initialize only the newly born package's explicit units and allowances from the file and map portable facts and dependency endpoints to actual definition identities. Existing definition metadata and other packages' values SHALL remain unchanged. Direct work-item types SHALL be present when facts are inserted. Actual current per-leaf orders SHALL govern dependency validation, including imports with only legacy edges; archival uniform order SHALL not veto a lawful current graph. Catalogue writes, directory writes, birth, grants, values and facts SHALL share one rollback owner. Reached-package catalogue refreshes SHALL publish only after total commit.

#### Scenario: Reuse preserves independent package values

- **GIVEN** the destination already resolves a code whose default unit and allowance differ from the file
- **WHEN** a permitted importer imports without settings permission or definition opt-in
- **THEN** its facts use the existing definition id and its new explicit values use the file values
- **AND** definition metadata and an existing sibling package's independent values remain exact

#### Scenario: Unknown codes and project-scoped authoring remain distinct

- **WHEN** a file names several unknown codes without definition opt-in
- **THEN** the import returns their complete ordered code list without any persisted effects
- **AND WHEN** a project manager explicitly opts in
- **THEN** the actual project receives every-type bindings and definitions without requiring organization-wide settings permission
- **AND** an importer lacking project settings permission can reuse existing bindings but cannot add missing ones

#### Scenario: Own order and transactional refusal govern current imports

- **GIVEN** two actual types order shared steps oppositely
- **WHEN** an import's dependencies are cyclic only under those actual orders
- **THEN** import refuses and preserves complete persistence and notifications
- **AND** a graph that is lawful under actual orders is accepted even if uniform file order would be cyclic
- **AND** a missing actual own-order capture, including for a legacy-only graph, throws and rolls back

### Requirement: Retirement preserves step identity and authored history

An organization manager SHALL be able to retire an active unbound definition using the definition DELETE route, including when unused package values or historical aliases still reference it. The operation SHALL retain the definition and all original package/history records, answer 204, and omit the retired definition from the active catalogue. Any binding SHALL still cause `409 step_bound`. Foreign, absent and already-retired definition mutation addresses SHALL answer `404 not_found`.

Retirement SHALL preserve organization-wide code and name reservation. Defining a retired code or name SHALL return `code_taken` or `name_taken`, respectively. New binding or rename by a retired id SHALL not reactivate it. Import naming a retired code SHALL answer `422 retired_step_codes`, including with `defineMissing: true`. Current replay SHALL use its current applicability refusal and SHALL not reactivate a retired identity; frozen historical reads SHALL retain the original identity translation and stored bytes.

#### Scenario: An unbound definition retains different package values after retirement

- **GIVEN** one definition has materialized into two packages with distinct authored units, allowance values and revisions
- **AND** its final binding is safely removed and the unused package rows remain
- **WHEN** a caller with organization settings permission retires the definition
- **THEN** the response is 204 and the active catalogue omits it
- **AND** the definition identity, original package rows, journal and historical bodies are retained without rewriting
- **AND** rebinding or importing its retired code is refused explicitly, while defining the reserved code or name remains a uniqueness refusal

#### Scenario: Retiring a merged survivor preserves frozen read translation

- **GIVEN** a genuine catalogue migration retained an old step id as an alias of a survivor
- **AND** the survivor is now unbound
- **WHEN** it is retired through the current admitted definition operation
- **THEN** historical saved-plan reads retain the same survivor translation and original body/hash verification
- **AND** no historical alias, input bytes, schedule bytes, signature or resource-use snapshot is changed

#### Scenario: A retired definition cannot hide a corrupt current binding

- **GIVEN** trusted storage contains a binding naming a retired definition
- **WHEN** the owning current catalogue or applicability reader captures that binding
- **THEN** it throws for inconsistent trusted state rather than silently filtering the binding or its protected facts

#### Scenario: Downgrade cannot reactivate retired definitions silently

- **GIVEN** a retirement record exists
- **WHEN** rollback reaches the retirement migration
- **THEN** rollback refuses with a named retained-state diagnostic and preserves the migration ledger and records
- **AND** an empty retirement migration can be reversed under the normal complete-ledger rollback owner

### Requirement: Current MCP tools preserve catalogue request alternatives

MCP SHALL derive the current catalogue operations and addressed work-package values from the generated shared document, and SHALL omit retired package-local definition mutation tools. It SHALL preserve positive object alternatives, root body constraints and every declared body input. Negation-only names SHALL NOT grant input locations. Required body names and path/query/body collisions SHALL be checked before tools are exposed. Whole-body constraints that cannot be faithfully flattened with URL inputs SHALL cause an explicit derivation refusal, not be dropped.

#### Scenario: Existing versus newly defined catalogue steps

- **WHEN** the current generated bind body allows either an existing step id or a new definition
- **THEN** the advertised MCP input schema accepts both alternatives and refuses both together, neither, and undeclared inputs under the actual SDK JSON Schema validator
- **AND** each valid alternative reaches the exact declared HTTP body with the caller credential and dependency-semantics claim

#### Scenario: Root constraints survive derivation

- **WHEN** an object body has oneOf or not constraints
- **THEN** those constraints remain in the derived input schema and keep the same valid and invalid object outcomes
- **AND** malformed or empty alternatives, undeclared required names, input-location collisions, and opaque constraints mixed with flattened URL inputs refuse derivation explicitly

### Requirement: Binding removal previews and applies under its stored scope

The catalogue binding DELETE operation SHALL require an explicit boolean dryRun. It SHALL authorize both modes against the stored binding's actual scope inside the current write loan. Preview SHALL return200 with wouldRefuse null or the same protected count and first200 ordered pairs, rolling back every proposed effect. Apply SHALL return204 after safe removal, or409 step_nodes_in_use without changing state. Foreign or absent binding addresses SHALL be404. Only actual removal SHALL advance affected package/project revisions and publish package refreshes after commit; retained values and history SHALL remain.

#### Scenario: Preview and apply share protected-pair admission

- **WHEN** an authorized manager previews removal that would leave201 protected leaf pairs unresolved
- **THEN** preview returns wouldRefuse step_nodes_in_use, count201 and the first200 pairs, with exact persisted state and announcements unchanged
- **AND** apply refuses409 with the same count and pairs and preserves state

#### Scenario: Stored scope and inherited bindings remain authoritative

- **WHEN** a project manager removes their own binding and a higher-scope binding still resolves the protected step
- **THEN** preview succeeds without writing and apply removes only the owned binding, preserving facts and package values
- **AND** organization/space/sibling-project binding removal requires that actual scope's permission in both modes; no body field can substitute another scope

#### Scenario: Empty-project removal still advances its manifest revision

- **WHEN** safe removal affects an empty project
- **THEN** preview advances nothing, and apply advances that project once without announcing a nonexistent work package

### Requirement: Binding order is a complete own-scope census

The binding reorder POST SHALL admit the actual same-organization scope under SC20 inside the current write loan. Its ids SHALL name exactly that scope's complete binding set across all types. Missing, extra, duplicate or inherited/foreign-scope identities SHALL refuse409 stale_order with exact state and announcements unchanged. Foreign/absent scopes SHALL answer404. Malformed scope/ids requests SHALL answer422. An empty or unchanged total order SHALL retain ranks and revisions. A changed order SHALL assign positions10,20,… and advance each reached package/project once, including empty projects. Definitions, facts, explicit values and other scopes SHALL remain unchanged; package refreshes SHALL publish only after commit.

#### Scenario: Scoped managers preserve inherited bindings and exact values

- **WHEN** an authorized organization, space or project manager reorders their complete own bindings, including typed and every-type bindings
- **THEN** only that scope's ranks change, existing values and protected facts remain exact, and every reached package/project advances once
- **AND** sibling/foreign scopes remain exact and each affected package observes committed order in its single refresh

#### Scenario: A stale census or unchanged order advances nothing

- **WHEN** a request omits, repeats or adds any binding, including an inherited binding
- **THEN** it refuses409 stale_order without changes
- **AND WHEN** an authorized request supplies the existing total order or an actual empty scope
- **THEN** it answers204 without changing positions, revisions or announcements

### Requirement: Project step reads resolve the actual chain and selected type

The project steps GET SHALL require project.read at the actual same-organization project under the current owner. It SHALL return resolved identities and every matching binding’s provenance in SC18 order. An absent type query SHALL select untyped resolution; a supplied nonempty type SHALL name an organization-owned work-item type. Unknown or foreign types SHALL answer404 after project admission, while malformed query structure SHALL answer400. No package unit, allowance, synthetic package identity or materialization SHALL be inferred. The read SHALL preserve state and announcements, including for empty projects. Organization-wide catalogue permission SHALL not be required when actual project.read is granted.

#### Scenario: Typed and untyped reads preserve inherited provenance

- **GIVEN** organization, space and project bindings, including typed and every-type bindings to one shared step
- **WHEN** an authorized reader requests the project without a type or with an actual owned type
- **THEN** the read returns the corresponding untyped or typed union and every matching provenance entry in SC18 order
- **AND** sibling and foreign bindings, package-specific values and nonmatching typed bindings do not appear

#### Scenario: Empty projects and narrow project grants remain readable

- **WHEN** a project reader without organization.read requests that project’s steps, including a project with no packages
- **THEN** the actual inherited/project bindings resolve without creating a package or package values
- **AND** invisible, foreign and absent projects remain404; a caller with a readable actual child but no project.read receives403 project.read, matching the existing visible project shell; invalid type/query requests preserve all state

#### Scenario: A package-only reader sees a project shell, without catalogue detail

- **GIVEN** a member can read an actual child work package but lacks project.read
- **WHEN** the member requests that project's steps, including with a foreign type id
- **THEN** the request answers403 project.read before type lookup, matching project detail
- **AND** a different project with no readable children remains404, even when an unrelated package is readable
- **AND** all persisted state and announcements remain unchanged

### Requirement: Project step usage reads preserve child privacy and report all protected usage

The project usage GET SHALL require current project.read and a nonempty singleton stepId. It SHALL return count and at most200 protected pairs for a step reachable in the actual project's any-type union, including when redundant bindings keep it resolved. It SHALL filter by actual project and current package.read before counting and limiting. It SHALL validate the complete captured thirteen-family evidence, preserve both external endpoints, and perform no writes, revisions or notifications. Unreachable, foreign and absent steps SHALL answer404 after project admission. Project-shell, hidden-project and query refusals SHALL match the project steps read.

#### Scenario: Redundant inheritance does not erase usage

- **GIVEN** a stored protected fact and two applicable bindings for its step
- **WHEN** a project reader requests that step's usage
- **THEN** the fact appears even when removing one binding would be safe

#### Scenario: Private children do not affect usage counts or response limits

- **GIVEN** a project reader can read201 used pairs in one child and cannot read201 earlier-sorting pairs in another child
- **WHEN** the reader requests the project's step usage
- **THEN** count is201 and the first200 readable pairs are returned
- **AND** a reader of both children sees count402 and the first200 pairs in the private-for-the-first-reader child
- **AND** the complete persisted state and announcements remain unchanged

### Requirement: Project manifests bind complete type applicability to the actual project revision

The project manifest GET SHALL require project.read and return version1 with the actual project identity/revision, untyped default codes and every organization-owned work-item type's resolved codes. Type entries SHALL use stable type IDs in binary order and codes SHALL follow SC18. A type whose ID is default SHALL remain distinct from the untyped default. Empty mappings and empty projects SHALL be represented without materialization. The read SHALL observe actual revision, chain, type ownership and bindings on one admitted owner and preserve all state and announcements. Project-shell403, hidden/foreign/absent404 and invalid-query400 SHALL match other project catalogue reads.

#### Scenario: Every type and the untyped default retain their own mapping

- **GIVEN** organization, space and project bindings, a typed-only research step, an unbound owned type and a type whose stable ID is default
- **WHEN** a project reader lacking organization.read requests the manifest
- **THEN** each owned type and the untyped default return their exact resolved codes, including inherited codes
- **AND** foreign types, sibling-only bindings and package-private fields do not appear

#### Scenario: Empty projects retain revision-bound applicability

- **GIVEN** an actual project with no work packages
- **WHEN** bindings are added, definition metadata changes and its own binding order changes
- **THEN** the next manifest carries each actual advanced project revision and current code order
- **AND** reading the manifest creates no work package or values and changes no state or announcements

#### Scenario: Changing the owned type set invalidates every affected manifest revision

- **GIVEN** an organization has both empty projects and projects with packages
- **WHEN** the real directory command creates a new owned work-item type or removes an unused owned type
- **THEN** every project in that organization advances its revision once in the same writer
- **AND** idempotent creation, refusals and rollback preserve revisions
- **AND** foreign project revisions and explicit package values remain unchanged

### Requirement: Offline manifest bindings retain type and revision identity

Burokrat SHALL accept the version2 revision-naming workflow binding with the `--manifest` command. It SHALL compare exact project identity/revision, validate the untyped default and every actual type against its own resolved code set, and use whole-mapping fallback only. Duplicate or unknown types/codes, unknown classes, malformed trusted input and absent/unreadable/nonregular manifest files SHALL refuse without network. Empty resolved sets SHALL be valid. Acceptance SHALL bind canonical manifest content and original prompt bytes; legacy version1 bindings/acceptance/digests SHALL remain compatible.

#### Scenario: Whole fallback cannot supply a typed-only step

- **GIVEN** the default maps build and spike additionally resolves research
- **WHEN** spike has no explicit complete mapping
- **THEN** offline validation refuses naming types.spike.research

#### Scenario: Actual type named default is separate from untyped mapping

- **GIVEN** the actual type ID default resolves research while the untyped default does not
- **WHEN** an explicit typed-default mapping includes research but the untyped mapping only includes build
- **THEN** validation accepts
- **AND WHEN** research is added to the untyped mapping
- **THEN** validation refuses naming default.research

#### Scenario: Binding revision pins the exported manifest

- **GIVEN** a valid binding and manifest for one project revision
- **WHEN** either project ID or revision in the manifest differs
- **THEN** validation refuses manifest_mismatch naming the exact project field

#### Scenario: Original prompt and manifest content affect acceptance

- **WHEN** referenced original prompt bytes change or the manifest gains an owned type using valid default fallback
- **THEN** the accepted digest changes
- **AND** merely reordering type entries or mapping presentation preserves the digest

### Requirement: Qualified address candidates follow actual leaf resolution

Qualified candidate discovery and reference resolution SHALL use current catalogue metadata and each actual leaf's ordered resolved steps, captured within the existing read-only organization admission snapshot. They SHALL NOT query retired local steps or infer a uniform model from missing leaf metadata. Parent descendant-step candidates SHALL include only steps resolved by at least one actual descendant leaf, ordered by first matching descendant in effective number/ID order and that leaf's SC18 order. Leaf reference ordinals and padding SHALL use that leaf's step count. Qualified revision and cursor staleness SHALL reflect changed leaf resolution and ancestry and exclude unused package-union columns.

#### Scenario: Opposing leaf orders remain distinct in qualified references

- **GIVEN** two leaf types resolve the same two steps in opposing orders and ten other package-union steps match neither leaf
- **WHEN** candidates and code-only references are read
- **THEN** each leaf spells s1 and s2 in its own order without two-digit padding
- **AND** parent selectors contain only their actual matching descendant steps

#### Scenario: A current leaf edit invalidates the observed qualified revision

- **WHEN** a leaf type or its matching binding order changes while the package union remains present
- **THEN** its old qualified reference revision and paging cursor refuse as stale
- **AND** the fresh code-only reference uses the new leaf ordinal; changing only unused bindings preserves the address revision

#### Scenario: An unused type cannot reorder matching parent candidates

- **WHEN** an unused type gains a binding for an already used definition that changes only the package-union order
- **THEN** the qualified revision and ordered endpoint candidates remain unchanged

#### Scenario: A frozen move changes descendant selectors

- **GIVEN** two retained parents, frozen effective numbers and one typed leaf that alone resolves a step
- **WHEN** that leaf moves to the other parent while all numbers, leafhood and per-leaf step lists stay unchanged
- **THEN** the descendant selector changes parent and the old qualified cursor refuses as stale
- **AND** unchanged local leaf addresses retain their local revision

### Requirement: Current node labels follow the leaf address model

New attempt-history sentences and connected node labels SHALL spell the node using its own leaf's ordered resolved steps and step count. They SHALL NOT use unused package-union columns for ordinal or padding. Missing current leaf inventories and unresolved node steps SHALL fail visibly. Connected node endpoints SHALL require an actual leaf; descendant-step selectors SHALL retain their parent address and no single-node reference. Changes to current bindings SHALL NOT rewrite recorded history sentences.

#### Scenario: Future attempt sentences follow a changed leaf order

- **GIVEN** twelve steps occur in a package union but a leaf resolves two in an opposing order
- **WHEN** an attempt starts and its leaf order later changes before ending and removal
- **THEN** each new sentence spells the ordinal using the leaf order at that write without two-digit padding
- **AND** every previously recorded event row remains exact

#### Scenario: Connected node metadata cannot fall back to the package union

- **WHEN** a node endpoint has missing leaf metadata, a step outside its leaf inventory, a zero-step leaf or a parent row
- **THEN** projection refuses instead of inventing a node reference from package metadata
- **AND** valid leaf nodes use their own number, order and count while parent selectors retain null step references

### Requirement: Settings use actual observed space and project owners

Named spaces SHALL offer scoped step creation and binding management from their actual space read. Virtual All work packages SHALL offer no space binding owner. Project settings SHALL read the actual project under the captured organization resource context before exposing its controls; a route address or list-visible shell SHALL NOT supply authority. Returned owner identity or organization contradictions SHALL fail visibly. Empty projects SHALL need no work package to manage their steps. Work-package settings SHALL retain their package value and commit/unsaved/busy behavior.

#### Scenario: A manager creates a typed step at a named space

- **GIVEN** a current named space read and an actual directory type
- **WHEN** the reader adds a definition for that type here
- **THEN** define-and-bind addresses the actual space id with that type and exact defaults
- **AND** All work packages exposes no corresponding space creation or binding control

#### Scenario: An observed empty project reaches real settings admission

- **GIVEN** the picker lists an actual empty project
- **WHEN** the reader follows its project settings link
- **THEN** the project settings route reads that project before offering scoped controls
- **AND** project read403/404 renders its named refusal without inventing a child package or exposing a settings editor

#### Scenario: Typed project resolution retains every matching provenance

- **WHEN** the reader chooses a real type or the explicit untyped default
- **THEN** settings reads current project resolution with the exact type query or no type query respectively
- **AND** each resolved step shows every returned organization, space and project binding in order
- **AND** inherited bindings are read-only in the lower scope; scope changes, lost credentials and later reads cannot publish an earlier owner's content

### Requirement: Browser import requires an explicit single-attempt definition choice

The existing transfer menu and empty-state import SHALL offer an unchecked Define missing steps option. One admitted file attempt SHALL capture that option before asynchronous file reading, disable edits while busy, and reset it after settlement. Changing project or session SHALL discard the choice and retire callbacks from the previous lifetime. With no destination project, the choice and file control SHALL be disabled. Server project settings permission SHALL remain authoritative. Unknown and retired code refusals SHALL show their complete ordered code lists with distinct guidance; neither SHALL automatically retry, enable definition creation or reactivate steps.

An attempt admitted before a visible destination-project change SHALL retain its captured destination and definition option. The new destination SHALL start unchecked, and old file/choice callbacks SHALL admit no new work. One current catalog/publication SHALL admit at most one file read, including across destination changes. Busy/duplicate-admission ownership SHALL remain with that publication until settlement. Actual catalog/session/publication replacement, withdrawal or unmount SHALL still fence the admitted attempt before further reads, writes, refresh installation, navigation or reporting.

#### Scenario: Opt-in is captured once and reset

- **GIVEN** a selected actual project and an explicitly checked definition option
- **WHEN** one file is chosen and its read is held
- **THEN** the option is disabled and its captured true value reaches the actual import request
- **AND** success, refusal or read failure resets the option before a subsequent attempt

#### Scenario: A visible destination change preserves the admitted request

- **GIVEN** project A and an explicitly checked definition option captured before file reading
- **WHEN** the visible destination changes to B while that file is held
- **THEN** the single admitted request still targets A with its captured true option
- **AND** B is unchecked, remains busy until settlement, and admits no second file read
- **AND** retained callbacks from A cannot start another attempt or change B's choice

#### Scenario: Publication loss still retires an admitted file

- **WHEN** a held file's actual publication is withdrawn, replaced or unmounted
- **THEN** completion does not submit, install a refreshed list, navigate or report through that retired publication

#### Scenario: Refusals do not change definition authority

- **WHEN** the server returns unknown or retired step codes
- **THEN** the user sees the ordered codes and the appropriate distinct guidance
- **AND** no retry occurs and definition creation remains unchecked
- **AND** a project settings permission refusal explains why binding or creating steps requires that permission
