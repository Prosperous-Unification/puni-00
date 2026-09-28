import {
  type AuthoredDependencies,
  type DependencyReach,
  type LeafEdge,
  resolveStepNodeGraph,
  type Slice,
  sliceKey,
} from '@wbs/domain';

import type { SolverEdge } from './wire-types';

/**
 * The request's `edges`: the slice graph, keyed, exactly as `schedule()` builds
 * it.
 *
 * **This function derives nothing.** Both rules live in `@wbs/domain`'s
 * `resolveStepNodeGraph`, which `schedule()` itself calls: each leaf's intra-item
 * step chain, and the join from the predecessor's **reached** slice to the
 * successor's **first** slice plain. What is left here is the conversion the schema's own
 * `$defs/edge` comment calls "real work rather than a rename": the domain names
 * an edge's ends by leaf and position, and the wire names them by `sliceKey`,
 * because Python receives no work item ids and no tree.
 *
 * Position rather than key is the domain's choice and it is the right way
 * round: one leaf holds many slices, and a plan may hand two of them the same
 * `stepId`. `buildSolverSlices` refuses that duplicate — the whole request is
 * malformed if it survives, since three wire maps are keyed by this string —
 * so by the time an edge is keyed there is exactly one slice per key. Keying
 * inside the domain instead would have merged the pair silently before anything
 * could refuse it.
 *
 * `leafEdges` are already leaf-expanded — `expandToLeaves`, which is the tree's
 * question and not this one.
 */
export function buildSolverEdges(
  leafIds: readonly string[],
  slicesOf: (leafId: string) => readonly Slice[],
  leafEdges: readonly LeafEdge[],
  reach: DependencyReach,
  /**
   * The typed dependencies and the tree they resolve against. Required, with
   * no empty default: a request built without them would hand the solver a
   * plan missing constraints Fast honours, and the two would disagree about
   * which schedules are legal.
   */
  authored: AuthoredDependencies,
): readonly SolverEdge[] {
  /**
   * One end, keyed.
   *
   * The position is an index into the leaf's own group, and the group is the
   * one `buildSolverSlices` projected from, so this reads the same `Slice`
   * object that produced the wire slice's `key`. An out-of-range position
   * cannot come from `resolveStepNodeGraph` — it emits `0` and `reachedSliceOf`'s
   * answer, both inside the group it was handed — but it is refused rather
   * than allowed to become `undefined` and then the string `"undefined"`,
   * which is a key the re-validator would report as a missing slice in a
   * request Bun itself wrote.
   */
  const keyOf = (leafId: string, at: number): string => {
    const own = slicesOf(leafId);
    // A BOUNDS check rather than a `=== undefined` one. Indexing an array is
    // typed as always returning an element here, so the narrowing form is dead
    // to the type checker and eslint deletes it; the arithmetic is not. `at`
    // is also the only negative any caller can produce — `reachedSliceOf`
    // answers `length - 1`, which is -1 for the empty group that cannot exist
    // — and `own.at(-1)` would have wrapped round to the LAST slice and keyed
    // it silently.
    if (at < 0 || at >= own.length) {
      throw new Error(`no slice ${String(at)} for work item ${leafId}`);
    }
    const slice = own[at];
    return sliceKey(slice.workItemId, slice.stepId);
  };

  return resolveStepNodeGraph(leafIds, slicesOf, leafEdges, reach, authored).edges.map((edge) => {
    // Proof: removing this refusal made `refuses weighted authored edges until
    // the solver wire carries their types` fail: SS was emitted as an FS edge;
    // watched 2026-09-28.
    if (edge.type !== 'FS') {
      throw new Error(
        `solver wire does not support ${edge.type} relationship ${edge.relationshipId}`,
      );
    }
    return {
      predecessorKey: keyOf(edge.predecessor.leafId, edge.predecessor.at),
      successorKey: keyOf(edge.successor.leafId, edge.successor.at),
    };
  });
}
