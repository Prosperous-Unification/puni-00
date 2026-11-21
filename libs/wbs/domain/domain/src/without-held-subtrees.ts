import type { ScheduleInput } from './canonical-schedule-input';
import { indexTree } from './schedule';
import { NoDescendantStepError } from './slice-edges';
import type { TypedDependency } from './typed-dependency';

/**
 * The schedule input with every held leaf, and every ancestor all of whose
 * leaves are held, taken out: their rows and slices, every legacy and typed
 * dependency with either end on one of them, and their not-before and deadline
 * entries. What remains is an ordinary, smaller plan, so `schedule()`, the
 * solver request and the solver wire need not know holds exist (ADR 0032).
 *
 * A partly held parent stays, with the dependencies, floor and deadline
 * written on it: they now expand to its unheld leaves only. A descendant-step
 * constraint disappears when every originally matching leaf is held. An
 * originally unmatched selector still throws. Nothing held returns an equal
 * valid input.
 *
 * Throws for a held id that is not a leaf of `input`: holds are stored on
 * leaves, so anything else is a caller reading another plan.
 */
export function withoutHeldSubtrees(
  input: ScheduleInput,
  heldLeafIds: ReadonlySet<string>,
): ScheduleInput {
  const index = indexTree(input.rows);
  const leafIds = new Set(index.leafIds);
  for (const id of heldLeafIds) {
    // Proof: this check disabled and `refuses a held id that is not a leaf of
    // this plan` failed on `Received function did not throw`; watched
    // 2026-09-28.
    if (!leafIds.has(id)) throw new Error(`held work item ${id} is not a leaf of this plan`);
  }

  const removed = new Set<string>();
  for (const [id, leaves] of index.leavesUnder) {
    // Proof: `heldLeafIds.has(id)` in place of this every-leaf test kept a
    // fully held parent as a leaf with no slice, and `removes a parent whose
    // every leaf is held…` failed on its rows (`+ "p"`); watched 2026-09-28.
    if (leaves.every((leafId) => heldLeafIds.has(leafId))) removed.add(id);
  }
  const kept = (id: string) => !removed.has(id);
  const keptEntries = (map: ReadonlyMap<string, number>) =>
    new Map([...map].filter(([id]) => kept(id)));
  const stepsByLeaf = new Map<string, Set<string>>();
  for (const slice of input.slices) {
    const steps = stepsByLeaf.get(slice.workItemId) ?? new Set<string>();
    if (slice.stepId !== null) steps.add(slice.stepId);
    stepsByLeaf.set(slice.workItemId, steps);
  }
  const keepsEndpoint = (dependency: TypedDependency, side: 'predecessor' | 'successor') => {
    const endpoint = dependency[side];
    if (endpoint.scope !== 'descendant-step') return kept(endpoint.workItemId);
    const leaves = index.leavesUnder.get(endpoint.workItemId);
    // Proof: accepting an absent owner failed 'held reduction refuses a missing descendant owner' (2026-11-20).
    if (leaves === undefined)
      throw new Error(`held descendant endpoint owner ${endpoint.workItemId} is absent`);
    const matching = leaves.filter((leafId) => {
      const steps = stepsByLeaf.get(leafId);
      // Proof: treating absent slices as nonmatching failed 'held reduction refuses absent descendant slices' (2026-11-20).
      if (steps === undefined) throw new Error(`held descendant slices for ${leafId} are absent`);
      return steps.has(endpoint.stepId);
    });
    // Proof: silently dropping the constraint failed 'held reduction does not hide a selector' (2026-11-20).
    if (matching.length === 0)
      throw new NoDescendantStepError(dependency.id, side, endpoint.workItemId, endpoint.stepId);
    // Proof: keeping every selector failed 'holding every matching descendant suppresses' (2026-11-20).
    return matching.some(kept);
  };

  return {
    ...input,
    rows: input.rows.filter(({ id }) => kept(id)),
    slices: input.slices.filter(({ workItemId }) => kept(workItemId)),
    edges: input.edges.filter(
      ({ predecessorId, successorId }) => kept(predecessorId) && kept(successorId),
    ),
    typed: input.typed.filter((dependency) => {
      const predecessor = keepsEndpoint(dependency, 'predecessor');
      const successor = keepsEndpoint(dependency, 'successor');
      return predecessor && successor;
    }),
    notBefore: keptEntries(input.notBefore),
    deadlines: keptEntries(input.deadlines),
  };
}
