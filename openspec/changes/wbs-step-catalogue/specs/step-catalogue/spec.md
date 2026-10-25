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
`409 step_nodes_in_use` while any protected fact of SC17 exists for a vanishing pair, issued
attempt counters included. Every fact writer SHALL refuse a step outside the leaf's resolved
set with `422 step_not_resolved`.

#### Scenario: Re-typing a leaf with an estimate on a type-bound step

- **WHEN** a `spike` leaf holds a trio on `research` and is changed to `story`
- **THEN** the change is refused `409 step_nodes_in_use { stepId: research, count: 1 }`
  and the trio is still read; after `clearEstimate` the change succeeds and `research` is
  absent from the leaf's steps

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
- **THEN** the report has one `divergent_project_set` row for P and the migration refuses;
  with `expand: true` for P both packages resolve `{dev, qa}`

#### Scenario: A saved plan reads after a merge

- **WHEN** a saved plan captured before the merge names the losing id in its input and
  schedule bodies
- **THEN** its stored hashes still verify, its read names the survivor, and its bytes are
  unchanged afterwards

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
