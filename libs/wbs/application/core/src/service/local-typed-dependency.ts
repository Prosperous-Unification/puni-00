import type { DependencyEndpoint, ScopedDependencyEndpoint, TypedDependency } from '@wbs/domain';

import type { StoredTypedDependency } from '../ports/typed-dependency-store';

/**
 * Projects stored local links into historical capture bodies without project fields.
 * External links require connected capture and cannot be represented by this format.
 */
export function captureLocalTypedDependency(row: StoredTypedDependency): TypedDependency {
  // Proof: bypassing this comparison made `refuses external rows in the historical single-project capture` resolve with a stripped foreign endpoint (2026-10-22).
  if (row.predecessor.projectId !== row.projectId || row.successor.projectId !== row.projectId) {
    throw new Error(`external dependency ${row.id} requires connected capture`);
  }
  const endpoint = (scoped: ScopedDependencyEndpoint): DependencyEndpoint =>
    scoped.scope === 'whole'
      ? { scope: scoped.scope, workItemId: scoped.workItemId }
      : { scope: scoped.scope, workItemId: scoped.workItemId, stepId: scoped.stepId };
  return {
    id: row.id,
    predecessor: endpoint(row.predecessor),
    successor: endpoint(row.successor),
    type: row.type,
  };
}
