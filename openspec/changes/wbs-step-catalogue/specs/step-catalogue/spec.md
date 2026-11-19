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

#### Scenario: First-child transfer is one applicability-checked write

- **GIVEN** a leaf has protected facts and an explicitly untyped first child is proposed
- **WHEN** any transferred step does not resolve on that actual child, or a protected fact has no lawful transfer
- **THEN** the write returns `409 step_nodes_in_use` with original leaf identities and fact kinds and leaves the complete persisted state unchanged
- **AND** otherwise all affected facts and relationship endpoints transfer within one writer-owned atomic operation, retaining identity, tuple multiplicity, claim satellites and allocator reservations
- **AND** success exposes one complete post-transition working-plan refresh; undo and redo use the same atomic boundary, with existing incident authority and restoration ownership preserved

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

### Requirement: The migration keeps step ids and refuses what it cannot preserve

The migration SHALL keep every step's id as its definition id, SHALL bind each at its
package's project for every type, SHALL change no stored history byte, SHALL refuse every
report row of design.md SC23 until the rules file rules it, SHALL record each merged id in
`step_identity_history`, and history readers SHALL translate merged ids on read only
(SC11–SC13).

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
