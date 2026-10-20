## ADDED Requirements

### Requirement: Resource, demand and subtree-assignment commands exist in the registry

The command registry SHALL offer `createResource`, `patchResource`, `deleteResource`
(directory scope), `setResourceCapacity`, `setDemand`, `assignSubtree` (project scope), and
`claimWorkItem` SHALL accept `resources?: { resourceId, units }[]` and `assign?: boolean`.
Each SHALL be an all-or-none member of its batch, one journal entry, undoable with
preconditions, described for the MCP batch tool. The commands SHALL add no MCP tool; the
by-person read of `assignee-management` adds exactly one.

#### Scenario: The batch tool carries the new kinds

- **WHEN** the MCP tool list is snapshotted after this change
- **THEN** it has one more tool, the by-person work read, and the batch tool's description
  names the new kinds

## MODIFIED Requirements

### Requirement: Steps, leaves and subtrees are claimed as one conditional act

The claim SHALL NOT read or write assignments unless `assign: true` is given, in which case
it SHALL set the claimant as the assignee of every step it claims in the same journal entry,
and go through the same calendar preflight as `setAssignee`.

#### Scenario: A claim without assign leaves assignments alone

- **WHEN** `claimWorkItem` is applied without `assign`
- **THEN** no assignment row changes
