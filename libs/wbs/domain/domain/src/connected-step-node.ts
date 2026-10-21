import type { TreeIndex } from './schedule';
import {
  type AuthoredEndpointContext,
  type GraphSlice,
  resolveAuthoredEdges,
  type StepNodeGraph,
} from './slice-edges';
import { formatTypedDependencyKey, type ScopedTypedDependency } from './typed-dependency';

/**
 * One project's graph prepared using its own tree, steps, reach and estimate presence.
 * Authored contexts retain held work; placement contexts use the held-reduced tree and slices.
 */
export interface ConnectedProjectGraph {
  readonly projectId: string;
  readonly tree: TreeIndex;
  readonly slicesByLeaf: ReadonlyMap<string, readonly GraphSlice[]>;
  readonly graph: StepNodeGraph;
  readonly relationships: readonly ScopedTypedDependency[];
}

/** Local graphs and the external authored relationships joining them. */
export interface ConnectedGraphInput {
  readonly projects: readonly ConnectedProjectGraph[];
  readonly external: readonly ScopedTypedDependency[];
}

/** The resolved node graph and detached ownership/provenance needed to explain it. */
export interface ConnectedGraph {
  readonly graph: StepNodeGraph;
  readonly projectIdByWorkItem: ReadonlyMap<string, string>;
  readonly relationships: ReadonlyMap<string, ScopedTypedDependency>;
}

/** Stable scoped relationship meaning, independent of object property insertion order. */
export function formatScopedDependencyKey(dependency: ScopedTypedDependency): string {
  return JSON.stringify([
    dependency.predecessor.projectId,
    dependency.successor.projectId,
    formatTypedDependencyKey(dependency),
  ]);
}

/**
 * Combines already prepared local graphs, expanding external selectors under
 * their actual endpoint projects through {@link resolveAuthoredEdges}.
 * Authored graphs retain held work. Only {@link findStepNodeCycle} decides
 * cycles; revisiting a project through different nodes is valid.
 * Throws on conflicting identities, ownership, missing projects/items/slices
 * and invalid selectors. Never substitutes another project's steps or reach.
 */
export function resolveConnectedGraph(input: ConnectedGraphInput): ConnectedGraph {
  const projects = new Map<string, ConnectedProjectGraph>();
  const projectIdByWorkItem = new Map<string, string>();
  const relationships = new Map<string, ScopedTypedDependency>();
  const graph: StepNodeGraph = { nodes: [], edges: [] };
  for (const project of input.projects) {
    // Proof: omitting project identity uniqueness made `refuses duplicate empty project identities without ownership masking` accept duplicate empty projects (2026-10-22).
    if (projects.has(project.projectId)) throw new Error(`duplicate project ${project.projectId}`);
    projects.set(project.projectId, project);
    for (const workItemId of project.tree.leavesUnder.keys()) {
      // Proof: omitting work-item ownership uniqueness made `refuses duplicate project and work-item ownership` accept the cross-owned leaf (2026-10-22).
      if (projectIdByWorkItem.has(workItemId))
        throw new Error(`work item ${workItemId} has duplicate ownership`);
      projectIdByWorkItem.set(workItemId, project.projectId);
    }
    graph.nodes.push(...project.graph.nodes);
    graph.edges.push(...project.graph.edges);
  }
  const contextOf = (projectId: string): AuthoredEndpointContext => {
    const project = projects.get(projectId);
    // Proof (diagnostic): bypassing this refusal made `refuses missing endpoint project` throw a property-access error instead of naming the missing project (2026-10-22).
    if (project === undefined) throw new Error(`no project ${projectId} in connected graph`);
    return {
      leavesUnder: (workItemId) => {
        const leaves = project.tree.leavesUnder.get(workItemId);
        // Proof (diagnostic): bypassing this refusal made the cross-owned endpoint case in `refuses missing endpoint project` throw on leaves.length instead of naming the work item (2026-10-22).
        if (leaves === undefined)
          throw new Error(`no work item ${workItemId} in project ${projectId}`);
        return leaves;
      },
      slicesOf: (leafId) => {
        const slices = project.slicesByLeaf.get(leafId);
        // Proof: allowing empty slices made `refuses absent and empty slices` accept an edge at -1. Allowing absent slices instead produced a downstream property-access error (diagnostic only); both watched 2026-10-22.
        if (slices === undefined || slices.length === 0)
          throw new Error(`no slice for work item ${leafId}`);
        return slices;
      },
    };
  };
  const register = (dependency: ScopedTypedDependency): boolean => {
    const previous = relationships.get(dependency.id);
    if (previous !== undefined) {
      // Proof: ignoring conflicting meanings made `refuses local/external misclassification and conflicting relationship identities` accept the reused ID (2026-10-22).
      if (formatScopedDependencyKey(previous) !== formatScopedDependencyKey(dependency))
        throw new Error(`conflicting relationship ${dependency.id}`);
      return false;
    }
    relationships.set(dependency.id, dependency);
    return true;
  };
  for (const project of input.projects) {
    for (const dependency of project.relationships) {
      // Proof: bypassing either local endpoint equality independently made `refuses each foreign local endpoint project independently` accept the foreign-scoped relationship (2026-10-22).
      if (
        dependency.predecessor.projectId !== project.projectId ||
        dependency.successor.projectId !== project.projectId
      )
        throw new Error(`local relationship ${dependency.id} has foreign endpoints`);
      const context = contextOf(project.projectId);
      // Proof: skipping local endpoint evidence made `refuses missing local endpoint facts` accept the absent work item (2026-10-22).
      resolveAuthoredEdges(dependency, context, context);
      register(dependency);
    }
  }
  for (const dependency of input.external) {
    // Proof: skipping external classification made `refuses local/external misclassification` accept a local relationship in the external set (2026-10-22).
    if (dependency.predecessor.projectId === dependency.successor.projectId)
      throw new Error(`external relationship ${dependency.id} is local`);
    if (!register(dependency)) continue;
    // Proof: using the predecessor context for both sides failed `expands every remote parent pair` on the missing remote parent (2026-10-22).
    graph.edges.push(
      ...resolveAuthoredEdges(
        dependency,
        contextOf(dependency.predecessor.projectId),
        contextOf(dependency.successor.projectId),
      ),
    );
  }
  // Proof: project-level reverse-edge refusal rejected the valid A.design B.build A.test case; node-cycle evaluation accepts it (2026-10-22).
  return { graph, projectIdByWorkItem, relationships };
}
