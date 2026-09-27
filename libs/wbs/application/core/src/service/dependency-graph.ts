import {
  DEFAULT_ESTIMATE_RULE,
  type DependencyReach,
  expandToLeaves,
  findStepNodeCycle,
  indexTree,
  resolveStepNodeGraph,
  type StepNodeCycle,
  type TypedDependency,
} from '@wbs/domain';

import type { DependencyStore, StoredDependency } from '../ports/dependency-store';
import type { EstimateStore, StoredEstimate } from '../ports/estimate-store';
import type { ProjectStore } from '../ports/project-store';
import type { TypedDependencyStore } from '../ports/typed-dependency-store';
import type { WorkItem, WorkItemStore } from '../ports/work-item-store';
import { slicesOf } from './work-item.service';

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
  readonly stepIds: readonly string[];
  readonly estimates: readonly Pick<StoredEstimate, 'workItemId' | 'stepId'>[];
  readonly legacy: readonly StoredDependency[];
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
  const index = indexTree(state.rows);
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
    state.stepIds,
    DEFAULT_ESTIMATE_RULE,
    new Map(),
    new Map(),
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
        if (found === undefined) throw new Error(`no work item ${workItemId} in this project`);
        return found;
      },
    },
  );
  return findStepNodeCycle(graph);
}

/** What a proposed change replaces in the stored state before the graph is asked. */
export interface DependencyGraphChange {
  readonly reach?: DependencyReach;
  /** A step about to be removed: its column and every estimate on it go. */
  readonly withoutStepId?: string;
  readonly typed?: readonly TypedDependency[];
}

/** The stores the combined graph is read from. */
export interface DependencyGraphStores {
  readonly projects: ProjectStore;
  readonly workItems: WorkItemStore;
  readonly estimates: EstimateStore;
  readonly dependencies: DependencyStore;
  readonly typedDependencies: TypedDependencyStore;
}

/**
 * Reads one project's combined dependency graph from its stores and asks
 * {@link findDependencyGraphCycle} of it, with a proposed change applied first
 * when a caller validates before it writes.
 *
 * A project with no typed dependency answers `null` without reading the rest.
 * Its graph is legacy links and workflow chains alone, and those stay acyclic
 * through the writes that already refuse them: `canDepend` for a new link and
 * `canReparent` for a move. A legacy-only cycle is exactly a leaf-level cycle,
 * because a legacy link leaves the predecessor's reached node and enters the
 * successor's first, and every leaf's first node reaches its reached node
 * through its own chain. Estimates and steps move only the reached node, so
 * nothing but a typed dependency can make them close one.
 */
export class DependencyGraphGuard {
  constructor(private readonly stores: DependencyGraphStores) {}

  async findCycle(
    projectId: string,
    change: DependencyGraphChange = {},
  ): Promise<StepNodeCycle | null> {
    const typed = change.typed ?? (await this.stores.typedDependencies.listByProject(projectId));
    if (typed.length === 0) return null;
    const project = await this.stores.projects.findById(projectId);
    if (project === null) throw new Error(`project ${projectId} vanished while its graph was read`);
    const [rows, steps, estimates, legacy] = await Promise.all([
      this.stores.workItems.listByProject(projectId),
      this.stores.projects.stepsOf(projectId),
      this.stores.estimates.listByProject(projectId),
      this.stores.dependencies.listByProject(projectId),
    ]);
    const without = change.withoutStepId;
    return findDependencyGraphCycle({
      rows,
      stepIds: steps.map((step) => step.id).filter((id) => id !== without),
      estimates: estimates.filter((estimate) => estimate.stepId !== without),
      legacy,
      typed,
      reach: change.reach ?? project.depReach,
    });
  }

  /** The typed dependencies whose node or descendant-step endpoint names `stepId`. */
  async findStepReferences(projectId: string, stepId: string): Promise<string[]> {
    const typed = await this.stores.typedDependencies.listByProject(projectId);
    return typed
      .filter((dependency) =>
        [dependency.predecessor, dependency.successor].some(
          (endpoint) => endpoint.scope !== 'whole' && endpoint.stepId === stepId,
        ),
      )
      .map((dependency) => dependency.id);
  }
}
