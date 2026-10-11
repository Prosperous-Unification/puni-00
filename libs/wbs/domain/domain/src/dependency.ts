import type { PlannedRow } from './derive-numbers';
import { isWithin, parentIndexOf } from './is-within';
import type { DependencyEdge } from './schedule';
import { hasCycle, indexTree } from './schedule';

export type DependencyRefusal = 'not_found' | 'ancestor' | 'cycle';

/**
 * Why an edge cannot be drawn, or `null` when it can.
 *
 * Pure, and the whole rule. be-01 refuses the write; the schedule's topological
 * sort throws on a cyclic graph anyway, because this guard protects the edges
 * this application creates and that one protects the computation from any graph
 * it is handed — see `design.md` D6.
 */
export function canDepend(
  rows: readonly PlannedRow[],
  existing: readonly DependencyEdge[],
  predecessorId: string,
  successorId: string,
): DependencyRefusal | null {
  const known = new Set(rows.map((row) => row.id));
  // Unknown is not OK, and it is also how a cross-project edge arrives: the rows
  // are one project's, so a work item from another is simply not among them.
  if (!known.has(predecessorId) || !known.has(successorId)) return 'not_found';

  // Onto itself, an ancestor, or a descendant. A parent already spans its
  // children, so asking it to wait for one is asking it to start after itself.
  // Proof: this branch deleted and exactly the three `ancestor` tests failed —
  // onto itself, onto its parent, onto its child.
  const parentOf = parentIndexOf(rows);
  if (
    isWithin(parentOf, predecessorId, successorId) ||
    isWithin(parentOf, successorId, predecessorId)
  ) {
    return 'ancestor';
  }

  // Asked of the graph the schedule will actually build, not of the edges as
  // written. The first version walked the written edges with its own tree-aware
  // reachability, and it was subtly wrong in both directions — an edge whose
  // *expansion* closed a cycle was accepted, and every later read of the project
  // then threw. Both reviewers found it independently, with different examples.
  //
  // Expanding the proposed edge and asking whether the result can be ordered is
  // the same question, asked of the same thing, by the same code. There is no
  // second implementation left to disagree.
  //
  // Proof: this line deleted and every cycle test failed, including the two the
  // old hand-rolled search let through.
  const proposed: DependencyEdge = { predecessorId, successorId };
  if (hasCycle(indexTree(rows), [...existing, proposed])) return 'cycle';

  return null;
}

/**
 * Why moving `id` beneath `parentId` would break a dependency already drawn,
 * or `null` when every edge stays valid in the moved tree.
 *
 * The same two questions {@link canDepend} asks of a new edge, asked of every
 * existing edge against the tree the move would leave: an edge between a row
 * and its own ancestor or descendant is `ancestor`, and an expanded graph that
 * cannot be ordered is `cycle`. Callers pass the rows and edges read inside the
 * write's own lock, so a concurrent tree edit is judged here rather than
 * trusted from whatever the client last drew.
 */
export function canReparent(
  rows: readonly PlannedRow[],
  existing: readonly DependencyEdge[],
  id: string,
  parentId: string | null,
): Exclude<DependencyRefusal, 'not_found'> | null {
  const moved = rows.map((row) => (row.id === id ? { ...row, parentId } : row));
  const parentOf = parentIndexOf(moved);
  // Its own arm although the expansion would also loop: `ancestor` tells the
  // reader which edge is in the way. Proof: loop skipped, the mounted `answers
  // 409 ancestor…` case failed on `"error": "cycle"`. Watched 2026-09-27.
  for (const edge of existing) {
    if (
      isWithin(parentOf, edge.predecessorId, edge.successorId) ||
      isWithin(parentOf, edge.successorId, edge.predecessorId)
    ) {
      return 'ancestor';
    }
  }
  if (hasCycle(indexTree(moved), existing)) return 'cycle';
  return null;
}
