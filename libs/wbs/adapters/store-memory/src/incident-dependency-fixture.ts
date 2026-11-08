import type { IncidentDependencyStore } from '@wbs/core';

import type { MemoryState } from './memory-stores';

/** Source-bound staging preserves the fixture receipt and writes the completed endpoint union once. */
export function bindIncidentDependencies(
  store: IncidentDependencyStore,
  state: MemoryState,
): IncidentDependencyStore {
  return {
    capture: (id) => store.capture(id),
    detach: (receipt) => store.detach(receipt),
    restore: async (receipt, previous, stamp) => {
      // Proof: source tests independently admitted coherent wrong work-item/step ownership, leaf scopes and missing organization when each guard was removed, 2026-10-22.
      const relationship = receipt.dependency;
      for (const endpoint of [relationship.predecessor, relationship.successor]) {
        const row = state.tables.workItems.byId.get(endpoint.workItemId);
        if (row?.projectId !== endpoint.projectId)
          throw new Error('incident work-item ownership is missing or inconsistent');
        if (
          endpoint.scope !== 'whole' &&
          !state.tables.projects.steps
            .get(endpoint.projectId)
            ?.some((step) => step.id === endpoint.stepId)
        )
          throw new Error('incident step ownership is missing or inconsistent');
        const isParent = [...state.tables.workItems.byId.values()].some(
          (candidate) => candidate.parentId === endpoint.workItemId,
        );
        if (endpoint.scope === 'node' && isParent)
          throw new Error('incident node endpoint is not a leaf');
        if (endpoint.scope === 'descendant-step' && !isParent)
          throw new Error('incident descendant endpoint is a leaf');
      }
      if (relationship.predecessor.projectId !== relationship.successor.projectId) {
        const predecessorOrganization = state.tables.projects.owning.get(
          relationship.predecessor.projectId,
        );
        const successorOrganization = state.tables.projects.owning.get(
          relationship.successor.projectId,
        );
        if (
          predecessorOrganization === undefined ||
          predecessorOrganization !== successorOrganization
        )
          throw new Error('incident requires matching organization ownership');
      }
      await store.restore(receipt, previous, stamp);
      // Proof: skipping the completed union bump left child/parent/peer at 0 instead of 1, 2026-10-22.
      for (const id of new Set([
        previous.predecessor.workItemId,
        previous.successor.workItemId,
        receipt.dependency.predecessor.workItemId,
        receipt.dependency.successor.workItemId,
      ])) {
        const row = state.tables.workItems.byId.get(id);
        // The exact structural inverse may already have removed the old child.
        if (row !== undefined)
          state.tables.workItems.byId.set(id, { ...row, revision: row.revision + 1 });
      }
    },
  };
}
