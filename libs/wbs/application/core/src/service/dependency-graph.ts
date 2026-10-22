import {
  type ConnectedProjectGraph,
  DEFAULT_ESTIMATE_RULE,
  type DependencyReach,
  expandToLeaves,
  findStepNodeCycle,
  indexTree,
  resolveStepNodeGraph,
  type StepNodeCycle,
  type StepNodeGraph,
  type StepPolicy,
  type TypedDependency,
} from '@wbs/domain';

import type { StoredDependency } from '../ports/dependency-store';
import type { StoredEstimate } from '../ports/estimate-store';
import type { StoredTypedDependency } from '../ports/typed-dependency-store';
import type { WorkItem } from '../ports/work-item-store';
import type { ConnectedDependencyGraphReader } from './connected-dependency-graph';
import { resolveConnectedDependencyGraph } from './connected-dependency-graph';
import { slicesOf } from './schedule-slices';

/**
 * Everything the combined step-node graph is built from: the tree, the
 * project's steps, which step nodes carry an estimate, both kinds of
 * dependency and the project's reach.
 *
 * Only an estimate's **presence** is read. It decides where a legacy link's
 * `anchor-slice` reach lands, and nothing else about the graph depends on a
 * number of days.
 */
export interface DependencyGraphState {
  readonly rows: readonly WorkItem[];
  /** The project's steps in step order; an estimate on any other step throws in `slicesOf`. */
  readonly steps: readonly StepPolicy[];
  readonly estimates: readonly Pick<StoredEstimate, 'workItemId' | 'stepId'>[];
  readonly legacy: readonly Pick<StoredDependency, 'predecessorId' | 'successorId'>[];
  readonly typed: readonly TypedDependency[];
  readonly reach: DependencyReach;
}

/**
 * The self-node pair or directed cycle the combined graph of `state` holds, or
 * `null` when it can be ordered.
 *
 * Every write that can change the graph — a typed or legacy link, a move, a
 * step added or removed, a reach change, an estimate that moves a dynamic
 * legacy anchor, an undo or redo — asks this of the state it **would leave**,
 * before anything is persisted, and refuses on an answer.
 *
 * The slices come from {@link slicesOf}, the one slicing the schedule itself
 * uses, so the step order (listed steps, then unlisted estimated ones) and the
 * estimated-or-not reading cannot drift from what the scheduler will build.
 * The rule and people are placeholders: they change days and widths, never
 * whether a slice is estimated.
 */
export function findDependencyGraphCycle(state: DependencyGraphState): StepNodeCycle | null {
  return findStepNodeCycle(resolveDependencyGraph(state));
}

/**
 * The combined step-node graph of `state` — every leaf's nodes in step order,
 * its workflow chain, the legacy joins and the authored edges — resolved once
 * by {@link resolveStepNodeGraph} over {@link slicesOf}'s slicing, so the
 * cycle guard and the plan read's node readings ask one graph.
 *
 * @throws for a leaf with no slice, a work item a typed dependency names that
 * the tree does not hold, or an endpoint `resolveStepNodeGraph` refuses: each
 * is stored state the write boundary refuses.
 */
export function resolveDependencyGraph(state: DependencyGraphState): StepNodeGraph {
  return prepareDependencyGraph(state).graph;
}

/**
 * Prepares one unreduced project context using the graph guard's existing
 * slicing. Estimate placeholders answer presence only, never scheduling days.
 * Local typed endpoints acquire the supplied stable project identity.
 */
export function resolveDependencyGraphContext(
  projectId: string,
  state: DependencyGraphState,
): ConnectedProjectGraph {
  return {
    projectId,
    ...prepareDependencyGraph(state),
    relationships: state.typed.map((dependency) => ({
      ...dependency,
      predecessor: { ...dependency.predecessor, projectId },
      successor: { ...dependency.successor, projectId },
    })),
  };
}

/** Resolves the shared local slicing without manufacturing a project identity. */
function prepareDependencyGraph(
  state: DependencyGraphState,
): Omit<ConnectedProjectGraph, 'projectId' | 'relationships'> {
  const index = indexTree(state.rows);
  const rowIds = new Set(state.rows.map((row) => row.id));
  // Proof: this endpoint validation absent and `refuses legacy endpoints absent
  // from the full tree before expanding to leaves` returned a graph rather than
  // throwing for both missing predecessor and successor. Removing it also
  // made the main live-tree caller resolve instead of refusing its absent
  // predecessor; both watched 2026-10-13.
  for (const dependency of state.legacy) {
    for (const endpoint of [dependency.predecessorId, dependency.successorId]) {
      if (!rowIds.has(endpoint))
        throw new Error(`legacy dependency names absent work item ${endpoint}`);
    }
  }
  const hasChildren = new Set(
    state.rows.flatMap((row) => (row.parentId === null ? [] : [row.parentId])),
  );
  const estimates: StoredEstimate[] = state.estimates.map(({ workItemId, stepId }) => ({
    workItemId,
    stepId,
    optimistic: 1,
    realistic: 1,
    pessimistic: 1,
  }));
  const slices = slicesOf(
    state.rows,
    estimates,
    hasChildren,
    state.steps,
    DEFAULT_ESTIMATE_RULE,
    new Map(),
    new Map(),
    new Map(),
    // The graph reads step order and endpoints only; no demand moves an edge.
    new Map(),
  );
  const byLeaf = new Map<string, (typeof slices)[number][]>();
  for (const slice of slices) {
    const group = byLeaf.get(slice.workItemId);
    if (group === undefined) byLeaf.set(slice.workItemId, [slice]);
    else group.push(slice);
  }
  const graph = resolveStepNodeGraph(
    index.leafIds,
    (leafId) => {
      const found = byLeaf.get(leafId);
      if (found === undefined) throw new Error(`no slice for work item ${leafId}`);
      return found;
    },
    expandToLeaves(index, state.legacy),
    state.reach,
    {
      dependencies: state.typed,
      leavesUnder: (workItemId) => {
        const found = index.leavesUnder.get(workItemId);
        // Proof: returning an empty leaf set for absent typed owner made the
        // graph negative fail: it received a later "not a leaf" error instead
        // of this missing-work-item refusal; watched 2026-10-13.
        if (found === undefined) throw new Error(`no work item ${workItemId} in this project`);
        return found;
      },
    },
  );
  return { tree: index, slicesByLeaf: byLeaf, graph };
}

/** Complete proposed owner facts; omitted fields retain current transaction evidence. */
export interface DependencyGraphChange extends Partial<Omit<DependencyGraphState, 'typed'>> {
  readonly withoutStepId?: string;
  readonly typed?: readonly StoredTypedDependency[];
}

/**
 * The service facade over fresh connected transaction evidence. Every call
 * follows both incident directions, including projects with no owned links.
 * Overrides replace only this graph owner's facts, never remote state.
 */
export class DependencyGraphGuard {
  constructor(
    private readonly reader: ConnectedDependencyGraphReader,
    private readonly projectId: string | null,
    private readonly assertActive: () => void,
  ) {}

  private assertOwner(projectId: string): void {
    this.assertActive();
    if (projectId !== this.projectId) throw new Error('dependency graph owner mismatch');
  }

  async findCycle(
    projectId: string,
    change: DependencyGraphChange = {},
  ): Promise<StepNodeCycle | null> {
    this.assertOwner(projectId);
    const { withoutStepId, ...replacement } = change;
    const captured = await this.reader.read([projectId], [{ ...replacement, projectId }]);
    this.assertOwner(projectId);
    const proposed =
      withoutStepId === undefined
        ? captured
        : {
            ...captured,
            projects: captured.projects.map((project) =>
              project.projectId !== projectId
                ? project
                : {
                    ...project,
                    state: {
                      ...project.state,
                      steps: project.state.steps.filter((step) => step.id !== withoutStepId),
                      estimates: project.state.estimates.filter(
                        (estimate) => estimate.stepId !== withoutStepId,
                      ),
                    },
                  },
            ),
          };
    const cycle = findStepNodeCycle(resolveConnectedDependencyGraph(proposed).graph);
    this.assertOwner(projectId);
    return cycle;
  }

  /** Modeled endpoint defects in the owner tree a structural write would leave. */
  async findEndpointConflict(
    projectId: string,
    change: DependencyGraphChange = {},
  ): Promise<{
    reason: 'node_on_parent' | 'descendant_step_on_leaf';
    dependencyIds: string[];
  } | null> {
    this.assertOwner(projectId);
    const { withoutStepId: _withoutStepId, ...replacement } = change;
    const captured = await this.reader.read([projectId], [{ ...replacement, projectId }]);
    this.assertOwner(projectId);
    const owner = captured.projects.find((project) => project.projectId === projectId);
    if (owner === undefined) throw new Error('structural graph owner evidence is missing');
    const held = new Set(owner.state.rows.map((row) => row.id));
    const parents = new Set(
      owner.state.rows.flatMap((row) => (row.parentId === null ? [] : [row.parentId])),
    );
    const relationships = [
      ...captured.external,
      ...owner.state.typed.map((relationship) => ({
        ...relationship,
        predecessor: { ...relationship.predecessor, projectId },
        successor: { ...relationship.successor, projectId },
      })),
    ];
    const defects = new Map<'node_on_parent' | 'descendant_step_on_leaf', string[]>();
    for (const relationship of relationships)
      for (const endpoint of [relationship.predecessor, relationship.successor]) {
        if (endpoint.projectId !== projectId) continue;
        if (!held.has(endpoint.workItemId))
          throw new Error(
            'external dependency endpoint lifecycle requires incident transfer admission',
          );
        // Proof: endpoint-shape bypass failed `structural first-child creation`'s selected assertion
        // (actual SQLite boundary; watched 2026-10-22).
        // Proof: endpoint-shape bypass failed `last-child deletion refuses`'s selected assertion
        // (actual SQLite boundary; watched 2026-10-22).
        const reason =
          endpoint.scope === 'node' && parents.has(endpoint.workItemId)
            ? 'node_on_parent'
            : endpoint.scope === 'descendant-step' && !parents.has(endpoint.workItemId)
              ? 'descendant_step_on_leaf'
              : null;
        if (reason !== null) defects.set(reason, [...(defects.get(reason) ?? []), relationship.id]);
      }
    this.assertOwner(projectId);
    for (const [reason, dependencyIds] of defects)
      return { reason, dependencyIds: [...new Set(dependencyIds)].sort() };
    return null;
  }

  /** Incident node/descendant endpoints naming this exact project's step. */
  async findStepReferences(projectId: string, stepId: string): Promise<string[]> {
    this.assertOwner(projectId);
    const references = await this.reader.findStepReferences(projectId, stepId);
    this.assertOwner(projectId);
    return references;
  }
}
