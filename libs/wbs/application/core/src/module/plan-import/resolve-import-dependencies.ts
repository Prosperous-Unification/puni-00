import type { ScopedDependencyEndpoint, TypedDependency } from '@wbs/domain';

import type { StoredTypedDependency } from '../../ports/typed-dependency-store';
import type { PreparedImport } from './import-values';

/** One fully allocated relationship and the original declaration used for refusals. */
export interface LocatedImportDependency {
  readonly path: string;
  readonly relationship: StoredTypedDependency;
}

/**
 * Allocates the complete successor-owned set in document order. Internal
 * references acquire destination identities; selected external predecessors
 * retain their stable destination verbatim, even when it coincides with an
 * allocated internal endpoint. Allocation grants no endpoint or graph admission.
 *
 * @throws when preparation's internal path or an allocated row/step is missing.
 */
export function resolveImportDependencies(
  prepared: PreparedImport,
  projectId: string,
  rows: ReadonlyMap<string, string>,
  steps: ReadonlyMap<string, string>,
  newId: () => string,
): readonly LocatedImportDependency[] {
  const requireId = (ids: ReadonlyMap<string, string>, fileId: string, kind: string): string => {
    const id = ids.get(fileId);
    // Proof: removing this guard failed `throws when a trusted row or step allocation disappears` (2026-10-22).
    if (id === undefined)
      throw new Error(`prepared typed dependency ${kind} mapping disappeared: ${fileId}`);
    return id;
  };
  const remapEndpoint = (endpoint: TypedDependency['predecessor']): ScopedDependencyEndpoint => {
    // Proof: independently retaining file row/project/step IDs failed the real SQLite remapped-endpoint import test (2026-10-22).
    const workItemId = requireId(rows, endpoint.workItemId, 'work item');
    return endpoint.scope === 'whole'
      ? { scope: 'whole', projectId, workItemId }
      : {
          scope: endpoint.scope,
          projectId,
          workItemId,
          stepId: requireId(steps, endpoint.stepId, 'step'),
        };
  };
  const internal = prepared.typedDependencies.map((relationship) => {
    const path = prepared.typedDependencyPaths.get(relationship.id);
    // Proof: removing this guard failed `throws when a trusted internal diagnostic path disappears` (2026-10-22).
    if (path === undefined)
      throw new Error(`prepared typed dependency path disappeared: ${relationship.id}`);
    return {
      path,
      predecessor: remapEndpoint(relationship.predecessor),
      successor: remapEndpoint(relationship.successor),
      type: relationship.type,
    };
  });
  const external = prepared.externalDependencies.map((relationship) => ({
    path: relationship.path,
    // Proof: substituting the source predecessor failed all three selected-destination scope cases (2026-10-22).
    predecessor: relationship.destination,
    successor: remapEndpoint(relationship.successor),
    type: relationship.type,
  }));
  const documentIndex = (path: string) => Number(path.slice('typedDependencies['.length, -1));
  return (
    [...internal, ...external]
      // Proof: lexical path ordering failed `orders declaration indices numerically beyond nine` (2026-10-22).
      .sort((left, right) => documentIndex(left.path) - documentIndex(right.path))
      .map(({ path, ...relationship }) => ({
        path,
        relationship: { ...relationship, id: newId(), projectId },
      }))
  );
}
