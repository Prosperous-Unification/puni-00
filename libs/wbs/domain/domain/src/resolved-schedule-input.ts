import type { ScheduleInput } from './canonical-schedule-input';
import type { PlannedRow } from './derive-numbers';
import {
  type Elsewhere,
  expandToLeaves,
  indexTree,
  leavesUnderOf,
  type PoolSizes,
  type Slice,
} from './schedule';
import { resolveStepNodeGraph, type StepNodeGraph } from './slice-edges';
import { groupSlicesByLeaf } from './slice-groups';

/** Placement facts already resolved under each project's own dependency rules, in one workday coordinate system. */
export interface ResolvedScheduleInput {
  readonly rows: readonly PlannedRow[];
  readonly slices: readonly Slice[];
  readonly graph: StepNodeGraph;
  readonly notBefore: ReadonlyMap<string, number>;
  readonly deadlines: ReadonlyMap<string, number>;
  readonly poolSizes: PoolSizes;
  readonly resourceCapacities: PoolSizes;
  readonly elsewhere: Elsewhere;
  readonly order:
    | { readonly kind: 'local' }
    | {
        readonly kind: 'connected';
        readonly projectIdByWorkItem: ReadonlyMap<string, string>;
        readonly rankByProject: ReadonlyMap<string, number>;
      };
}

/** Adapt the historical local tuple without changing canonical serialization or dependency reach. */
export function resolveScheduleInput(input: ScheduleInput): ResolvedScheduleInput {
  const index = indexTree(input.rows);
  const groups = groupSlicesByLeaf(index.leafIds, input.slices);
  const slicesOf = (leafId: string): readonly Slice[] => {
    const slices = groups.get(leafId);
    if (slices === undefined) throw new Error(`no slice for work item ${leafId}`);
    return slices;
  };
  return {
    rows: input.rows,
    slices: input.slices,
    // Proof: the typed list replaced by [] made four of five original
    // schedule-typed-dependency tests fail; `holds a later successor step`
    // started at 1 instead of 3 (watched 2026-09-27 at the former local seam).
    graph: resolveStepNodeGraph(
      index.leafIds,
      slicesOf,
      expandToLeaves(index, input.edges),
      input.reach,
      { dependencies: input.typed, leavesUnder: leavesUnderOf(index) },
    ),
    notBefore: input.notBefore,
    deadlines: input.deadlines,
    poolSizes: input.poolSizes,
    resourceCapacities: input.resourceCapacities ?? new Map(),
    elsewhere: input.elsewhere ?? new Map(),
    order: { kind: 'local' },
  };
}

/** Refuse graphs that rename, omit or invent slices, or attach an edge outside its actual group. */
export function validateResolvedGraph(input: ResolvedScheduleInput): void {
  const index = indexTree(input.rows);
  const groups = groupSlicesByLeaf(index.leafIds, input.slices);
  const unseen = new Map<string, Set<number>>();
  for (const leafId of index.leafIds) {
    const group = groups.get(leafId);
    if (group === undefined) throw new Error(`no slice for work item ${leafId}`);
    unseen.set(leafId, new Set(group.map((_, at) => at)));
  }
  for (const node of input.graph.nodes) {
    const leafId = node.kind === 'step' ? node.ref.workItemId : node.workItemId;
    const slice = groups.get(leafId)?.[node.at];
    const expectedStep = node.kind === 'step' ? node.ref.stepId : null;
    // Proof: independently bypassing identity, foreign-node and duplicate
    // checks made `refuses step`, `refuses extra` and `refuses duplicate`
    // accept malformed graphs through scheduleResolved.
    if (slice?.stepId !== expectedStep || !unseen.get(leafId)?.delete(node.at)) {
      throw new Error(`resolved graph node does not match slice ${leafId}/${String(node.at)}`);
    }
  }
  // Proof: removing the exact-set guard made `refuses missing graph facts`
  // accept a graph that omitted an actual scheduled slice.
  if ([...unseen.values()].some((positions) => positions.size > 0)) {
    throw new Error('resolved graph omits a slice node');
  }
  for (const edge of input.graph.edges) {
    for (const endpoint of [edge.predecessor, edge.successor]) {
      // Proof: bypassing this guard made `refuses endpoint graph facts`
      // reach the cycle check instead (diagnostic-only: it still refused).
      if (
        !Number.isInteger(endpoint.at) ||
        groups.get(endpoint.leafId)?.[endpoint.at] === undefined
      ) {
        throw new Error(
          `resolved graph edge endpoint does not match slice ${endpoint.leafId}/${String(endpoint.at)}`,
        );
      }
    }
  }
}
