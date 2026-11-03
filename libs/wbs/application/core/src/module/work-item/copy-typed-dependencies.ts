import type { ScopedDependencyEndpoint } from '@wbs/domain';

import type { StoredTypedDependency } from '../../ports/typed-dependency-store';

/** Exact source subtree identities and destination identities; outside predecessors retain their scoped address. */
export interface DependencyCopySelection {
  readonly sourceProjectId: string;
  readonly destinationProjectId: string;
  readonly workItemIds: ReadonlyMap<string, string>;
  readonly stepIds: ReadonlyMap<string, string>;
}

/** Selects only copied successors; malformed trusted ownership throws. */
export function selectCopiedDependencies(
  dependencies: readonly StoredTypedDependency[],
  selection: DependencyCopySelection,
): readonly StoredTypedDependency[] {
  // Proof: removing ownership validation failed the admitted corrupt-source copy
  // test's exact ownership throw; watched 2026-10-22.
  for (const dependency of dependencies)
    if (dependency.projectId !== dependency.successor.projectId)
      throw new Error('copied relationship owner differs from its successor');
  // Proof: incident OR failed exact selected membership; both-inside omitted X's
  // prerequisite in the mounted copy test (8 links instead of 9), 2026-10-22.
  // Proof: the synthetic mounted HTTP copy/history test caught both-inside (zero
  // retained prerequisites) and incident OR (HTTP 500 instead of 200), 2026-10-23.
  return dependencies.filter(
    (dependency) =>
      dependency.successor.projectId === selection.sourceProjectId &&
      selection.workItemIds.has(dependency.successor.workItemId),
  );
}

/** Detaches retained endpoints and remaps selected endpoints; missing required map entries throw. */
export function remapCopiedDependency(
  dependency: StoredTypedDependency,
  selection: DependencyCopySelection,
  relationshipId: string,
): StoredTypedDependency {
  const remapEndpoint = (
    endpoint: ScopedDependencyEndpoint,
    required: boolean,
  ): ScopedDependencyEndpoint => {
    // Proof: work-item-only mapping changed the retained remote endpoint in
    // `retains detached local outside and remote endpoints`, 2026-10-22.
    const copied =
      endpoint.projectId === selection.sourceProjectId
        ? selection.workItemIds.get(endpoint.workItemId)
        : undefined;
    if (copied === undefined) {
      // Proof: removing this guard stopped the missing-successor map case
      // in `throws for trusted ownership` from throwing, 2026-10-22.
      if (required) throw new Error('copied successor is absent from the work-item map');
      return { ...endpoint };
    }
    const mapped = { ...endpoint, projectId: selection.destinationProjectId, workItemId: copied };
    if (endpoint.scope === 'whole') return mapped;
    const stepId = selection.stepIds.get(endpoint.stepId);
    // Proof: removing this guard stopped the missing-step map case from throwing;
    // retaining the source step separately failed exact node remaps, 2026-10-22.
    if (stepId === undefined) throw new Error('copied endpoint step is absent from the step map');
    return { ...endpoint, projectId: selection.destinationProjectId, workItemId: copied, stepId };
  };
  return {
    // Proof: source identity reuse failed `remaps exact internal` on new-id, 2026-10-22.
    id: relationshipId,
    projectId: selection.destinationProjectId,
    predecessor: remapEndpoint(dependency.predecessor, false),
    successor: remapEndpoint(dependency.successor, true),
    type: dependency.type,
  };
}
