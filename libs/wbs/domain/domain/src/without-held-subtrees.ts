import type { ScheduleInput } from './canonical-schedule-input';
import { indexTree } from './schedule';

/**
 * The schedule input with every held leaf, and every ancestor all of whose
 * leaves are held, taken out: their rows and slices, every legacy and typed
 * dependency with either end on one of them, and their not-before and deadline
 * entries. What remains is an ordinary, smaller plan, so `schedule()`, the
 * solver request and the solver wire need not know holds exist (ADR 0033).
 *
 * A partly held parent stays, with the dependencies, floor and deadline
 * written on it: they now expand to its unheld leaves only. Nothing is held
 * returns an equal input.
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

  return {
    ...input,
    rows: input.rows.filter(({ id }) => kept(id)),
    slices: input.slices.filter(({ workItemId }) => kept(workItemId)),
    edges: input.edges.filter(
      ({ predecessorId, successorId }) => kept(predecessorId) && kept(successorId),
    ),
    typed: input.typed.filter(
      ({ predecessor, successor }) => kept(predecessor.workItemId) && kept(successor.workItemId),
    ),
    notBefore: keptEntries(input.notBefore),
    deadlines: keptEntries(input.deadlines),
  };
}
