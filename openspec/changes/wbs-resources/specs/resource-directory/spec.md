## ADDED Requirements

### Requirement: Resources are directory entities with a kind and a unit

The directory SHALL hold resources, each with a name unique in the directory, a kind that is
`exclusive` or `divisible`, and a unit label. The commands `createResource`,
`patchResource` and `deleteResource` SHALL exist with the directory scope and the same
refusal shapes as teams. Deleting a resource that any demand, capacity or occupancy names
SHALL be refused `in_use` with the counts unless `cascade` is given, in which case demands,
capacities and occupancies of that resource are removed in the same transaction.

#### Scenario: A host's RAM is declared

- **WHEN** `createResource { name: 'h2puni ram', kind: 'divisible', unitLabel: 'GB' }` is
  applied
- **THEN** the resource exists, the directory read lists it, and a second create with the same name is refused `taken` (not answered with the existing resource, whose kind and unit the caller did not ask for)

#### Scenario: Deleting a demanded resource

- **WHEN** a resource is named by two demands and `deleteResource` is applied without cascade
- **THEN** the command is refused `in_use` naming 2 demands, 0 capacities, 0 occupancies

### Requirement: A project states how many units of a resource its plan may use

`setResourceCapacity { resource, units | null }` SHALL record the pair `(project, resource)`
exactly as `setCapacity` records `(project, team)`: absent or null is unstated and constrains
nothing; a stated 0 clamps every demand in the schedule (dates are still placed) and refuses every claim that would occupy it; a number stated for a resource no leaf of the plan demands any more is remembered
and re-applies when a demand returns. The project settings read SHALL list stated pairs.

#### Scenario: Unstated constrains nothing

- **WHEN** a leaf demands 4 units of a resource the project has no capacity for
- **THEN** the schedule and the claim path treat the resource as unbounded

### Requirement: A work item states its demand on a resource

`setDemand { workItem, resource, units | null }` SHALL record a demand of `units` ≥ 1 on
that work item, null removing it; `exclusive` resources SHALL refuse any units other than 1
with `exclusive_demand_is_one`. A demand SHALL move the work item's revision, be undoable
through the journal with preconditions, be carried by the plan export and the plan document
as an additive field, and be removed when the work item is deleted. Demands SHALL NOT be
inherited down the tree. When a leaf gains its first child by `createWorkItem`, its demand moves to that child; when a delete promotes the parent back to a leaf, the child's demand moves back up (from a deleted branch, per resource the largest units any of its former leaves demanded, replacing what the parent stated while it was one); the child's step claims move back up with their occupancy in the same journal entry, and a promoting delete of a branch in which more than one former leaf holds claims is refused `children_claimed` naming the holders, since two leaves' claims cannot merge into one; when `moveWorkItem` turns an unclaimed demanded leaf into a parent, the parent's demand is cleared with its other statements and the moved child keeps only its own; each of these is journalled and undone exactly.

#### Scenario: A demand on a parent does not reach its leaves

- **WHEN** a non-leaf carries a demand of 2 on a resource
- **THEN** its leaves' effective demands are their own only, and the parent's demand charges
  nothing in the schedule or the claim path

#### Scenario: A demand follows a split and a promotion

- **WHEN** leaf `L` demands 4 GB, a first child `C` is created under it, and later `C` is deleted
- **THEN** after the create `C` demands 4 GB and `L` none; after the delete `L` demands 4 GB again
  and a claim on `L` acquires 4 GB; undo and redo of each step restore the previous state

#### Scenario: A claimed child is promoted back

- **WHEN** `claire` holds `Impl` of `C`, the only child of `L`, with 4 GB occupied, and `C` is
  deleted
- **THEN** `L` holds `claire`'s claim on `Impl` and the 4 GB, `releaseWorkItem` on `L` frees
  them, and undo of the delete moves the claim back to `C`

#### Scenario: A move under a demanded leaf clears its demand

- **WHEN** unclaimed leaf `P` demands 4 GB and `X` is moved under it
- **THEN** `P` carries no demand, `X` keeps its own, and undo of the move restores `P`'s 4 GB

#### Scenario: Export round trip

- **WHEN** a plan with resources, capacities and demands is exported and imported
- **THEN** every demand, capacity and resource is present after import with the same units

### Requirement: The plan read names each work item's demands

The project tree read (`GET /api/projects/:id/work-items`) SHALL carry `demands`, every demand
of the project's work items as `{ workItemId, resourceId, units }` in work-item then
resource-id order, and `demandedResources`, one `{ id, name, kind, unitLabel }` per resource a
demand names under the caller's directory names. Both SHALL be present exactly when the project
states a demand and absent otherwise, so a plan stating none keeps its payload shape. A shared
read SHALL take both from the same snapshot as its schedule. The plan export and the plan
document SHALL NOT carry them; they keep their own file-local `demands` and resources.

#### Scenario: A row says what it consumes

- **WHEN** two leaves each demand 1 unit of the exclusive resource `staging`
- **THEN** the tree read lists both demands and names `staging` once in `demandedResources`,
  with its kind and unit label, on the isolated and the shared read alike

#### Scenario: A plan stating no demand

- **WHEN** no work item of the project states a demand
- **THEN** the tree read carries neither `demands` nor `demandedResources`

### Requirement: fe-01 manages resources and states demands

fe-01 SHALL let a planner manage the directory's resources and a leaf's demands without the
API. The project settings' Resources section SHALL add a resource (name, kind, unit label),
rename it or change its unit label, remove it, and state or clear this project's capacity of
it; a removal refused `in_use` SHALL be said with the counts of demands, capacities and claims
holding it, and removing it with them SHALL need a second, explicit confirm (`cascade`). A
leaf's Resources cell (a column hidden by default) and the row menu's `Resources…` SHALL open a
panel listing every resource with this work item's units, an exclusive one as needed or not,
and saving SHALL send every changed demand as one batch, so the plan's Undo takes the edit back
whole. A parent SHALL be offered no demand edit. Loading, an empty directory, a failed read
and every refusal (a role that may not write included) SHALL be rendered in place.

#### Scenario: A demand set from the table is undone in one step

- **WHEN** a planner sets `RAM` to 8 and ticks `staging` on leaf `020` and saves
- **THEN** one `setDemand` batch is sent, the cell reads `RAM 8 GiB · staging`, and one Undo
  restores the previous demands

#### Scenario: A demanded resource is removed only on confirm

- **WHEN** a planner removes a resource two demands still name
- **THEN** the section says it is used by 2 demands, offers `Remove with them`, and removes
  nothing until that is chosen
