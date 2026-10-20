## ADDED Requirements

### Requirement: Resource, demand and subtree-assignment commands exist in the registry

The command registry SHALL offer `createResource`, `patchResource`, `deleteResource`
(directory scope), `setResourceCapacity`, `setDemand`, `assignSubtree` (project scope), and
`claimWorkItem` SHALL accept `resources?: { resourceId, units }[]` and `assign?: boolean`.
Each SHALL be an all-or-none member of its batch, one journal entry, undoable with
preconditions, described for the MCP batch tool, and SHALL add no MCP tool.

#### Scenario: The batch tool carries the new kinds

- **WHEN** the MCP tool list is snapshotted after this change
- **THEN** it has the same tools, and the batch tool's description names the new kinds
