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
- **THEN** the resource exists, the directory read lists it, and a second create with the
  same name is refused as a duplicate team name would be

#### Scenario: Deleting a demanded resource

- **WHEN** a resource is named by two demands and `deleteResource` is applied without cascade
- **THEN** the command is refused `in_use` naming 2 demands, 0 capacities, 0 occupancies

### Requirement: A project states how many units of a resource its plan may use

`setResourceCapacity { resource, units | null }` SHALL record the pair `(project, resource)`
exactly as `setCapacity` records `(project, team)`: absent or null is unstated and constrains
nothing; a number stated for a resource no leaf of the plan demands any more is remembered
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
inherited down the tree.

#### Scenario: A demand on a parent does not reach its leaves

- **WHEN** a non-leaf carries a demand of 2 on a resource
- **THEN** its leaves' effective demands are their own only, and the parent's demand charges
  nothing in the schedule or the claim path

#### Scenario: Export round trip

- **WHEN** a plan with resources, capacities and demands is exported and imported
- **THEN** every demand, capacity and resource is present after import with the same units
