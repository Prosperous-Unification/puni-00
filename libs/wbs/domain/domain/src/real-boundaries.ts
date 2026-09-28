import type { ScheduleInput } from './canonical-schedule-input';
import {
  expandToLeaves,
  indexTree,
  leavesUnderOf,
  type Schedule,
  ScheduleInvalidOptimizedStartError,
  sliceKey,
} from './schedule';
import { resolveStepNodeGraph } from './slice-edges';
import { groupSlicesByLeaf } from './slice-groups';

/**
 * Check every resolved dependency against the actual, exclusive real finishes.
 * Both Fast and optimized publication use this after placement, so rounded
 * integer finishes cannot hide a fractional FF violation.
 *
 * The comparison is strict, without `withinDrift`, on purpose: both placement
 * paths already move a pin that is short by drift onto the boundary itself, so
 * any shortfall reaching this check is a placement bug, not solver rounding.
 *
 * Throws {@link ScheduleInvalidOptimizedStartError} for a missing or early
 * materialized slice. The optimized caller classifies that as invalid output.
 */
export function validateRealBoundaries(input: ScheduleInput, plan: Schedule): void {
  const index = indexTree(input.rows);
  const groups = groupSlicesByLeaf(index.leafIds, input.slices);
  const slicesOf = (leafId: string) => {
    const slices = groups.get(leafId);
    if (slices === undefined) throw new Error(`no slices for work item ${leafId}`);
    return slices;
  };
  const graph = resolveStepNodeGraph(
    index.leafIds,
    slicesOf,
    expandToLeaves(index, input.edges),
    input.reach,
    { dependencies: input.typed, leavesUnder: leavesUnderOf(index) },
  );
  for (const edge of graph.edges) {
    const beforeSlice = slicesOf(edge.predecessor.leafId)[edge.predecessor.at];
    const afterSlice = slicesOf(edge.successor.leafId)[edge.successor.at];
    const beforeKey = sliceKey(beforeSlice.workItemId, beforeSlice.stepId);
    const afterKey = sliceKey(afterSlice.workItemId, afterSlice.stepId);
    const before = plan.slices.get(beforeKey);
    const after = plan.slices.get(afterKey);
    if (before === undefined || after === undefined) {
      throw new ScheduleInvalidOptimizedStartError(
        afterKey,
        'materialized dependency slice missing',
      );
    }
    const boundary = edge.type === 'SS' ? before.earliestStart : before.earliestFinish;
    const observed = edge.type === 'FF' ? after.earliestFinish : after.earliestStart;
    // Proof: disabling this comparison made `rejects a materialized FF finish
    // that integer equal starts would hide` return a publication decision
    // instead of throwing; its B finish was 0.021 before A at 0.030.
    if (observed < boundary) {
      throw new ScheduleInvalidOptimizedStartError(
        afterKey,
        `violates ${edge.type} real boundary on publication`,
      );
    }
  }
}
