import type { IncidentDependencyStore, Step } from '@wbs/core';

import type { MemoryState } from './memory-stores';

/**
 * Source-bound restoration checks the current package union and its explicit
 * values through the required same-stage projection, preserving the original
 * receipt and advancing the completed endpoint union once.
 */
export function bindIncidentDependencies(
  store: IncidentDependencyStore,
  state: MemoryState,
  readPackageSteps: (workPackageId: string) => readonly Step[],
): IncidentDependencyStore {
  return {
    capture: (id) => store.capture(id),
    detach: (receipt) => store.detach(receipt),
    restore: async (receipt, previous, stamp) => {
      // Proof: source tests independently admitted coherent wrong work-item/step ownership, leaf scopes and missing organization when each guard was removed, 2026-10-22.
      const relationship = receipt.dependency;
      for (const endpoint of [relationship.predecessor, relationship.successor]) {
        const row = state.tables.workItems.byId.get(endpoint.workItemId);
        if (row?.workPackageId !== endpoint.workPackageId)
          throw new Error('incident work-item ownership is missing or inconsistent');
        // Proof: omitting this condition let absent and sibling-project steps
        // restore without an Error in the actual Source's two atomic refusal
        // cases (incident-effect-current-step-ownership-v1).
        if (
          endpoint.scope !== 'whole' &&
          !readPackageSteps(endpoint.workPackageId).some((step) => step.id === endpoint.stepId)
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
      if (relationship.predecessor.workPackageId !== relationship.successor.workPackageId) {
        const predecessorOrganization = state.tables.workPackages.owning.get(
          relationship.predecessor.workPackageId,
        );
        const successorOrganization = state.tables.workPackages.owning.get(
          relationship.successor.workPackageId,
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
