## ADDED Requirements

### Requirement: Steps are defined once per organization and bound per scope and type

An organization SHALL hold one step catalogue (`step_definition`: code unique per
organization, name, estimate unit, default allowance, position). A step SHALL reach work
items through bindings at organization, space or project scope, each naming one work item
type or every type (design.md SC1, SC2). A leaf's resolved steps SHALL be the union of the
bindings on its chain that match its type or name every type, each read with provenance; a
leaf without a type SHALL resolve only the every-type bindings (SC3).

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

### Requirement: Step nodes exist for resolved steps and never vanish with data

A step node SHALL exist for every leaf and every step in its resolved set. A write that
would remove a step from a leaf's set (unbinding, changing the leaf's type, moving the
package or the leaf to another project) SHALL be refused `409 step_nodes_in_use { stepId,
count }` while any estimate, actual, measure, progress, assignment, dependency or claim
exists for a vanishing pair (design.md SC7). `setEstimate` on a step outside the leaf's
resolved set SHALL be refused `422 step_not_resolved`.

#### Scenario: Re-typing a leaf with an estimate on a type-bound step

- **WHEN** a `spike` leaf holds a trio on `research` and is changed to `story`
- **THEN** the change is refused `409 step_nodes_in_use { stepId: research, count: 1 }`
  and the trio is still read; after `clearEstimate` the change succeeds and `research` is
  absent from the leaf's steps

#### Scenario: An estimate on an unresolved step

- **WHEN** `setEstimate` names `research` on a `story` leaf
- **THEN** it is refused `422 step_not_resolved` and nothing is written

### Requirement: Unit and allowance stay per work package

Each work package SHALL hold one `work_package_step` row per resolved step with its
estimate unit and allowance, written explicitly when the package is created or a step is
bound, defaulting from the definition at that moment and never read through a fallback
(design.md SC6). Changing a unit while the step holds estimates SHALL stay refused.

#### Scenario: A new package gets explicit rows

- **WHEN** a work package is created in project P whose leaves resolve `dev`, `qa`,
  `review`
- **THEN** three `work_package_step` rows exist with the definitions' units and
  allowances, and a read with one row deleted behind the store throws
  `WorkPackageStepMissing` naming the pair

### Requirement: The migration keeps every leaf's step set

The migration SHALL create one definition per distinct step code of each organization's
work packages, SHALL refuse and report every code whose rows differ across packages until
an operator rules through `--merge-rules`, SHALL bind each package's steps at its project
for every type, SHALL re-key every step-keyed table and rewrite journal payloads and
saved-plan input bodies once, and SHALL refuse on an unrecognised payload shape naming the
row (design.md SC8, E33).

#### Scenario: Equal codes merge, differing codes refuse

- **WHEN** two packages of A define `qa` with equal name, unit and allowance, and two
  others define `dev` as "Dev" (workdays) and "Development" (minutes)
- **THEN** `qa` merges into one definition bound at both projects, the migration refuses
  with `step_merge_conflict` listing `dev` and the two rows, and nothing is written; with
  `--merge-rules` naming the winning `dev` row it completes and every leaf resolves its
  former set
