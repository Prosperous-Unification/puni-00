import type { StoredDependency, WorkItem } from '../repository';

export type DependencyRefusal = 'not_found' | 'ancestor' | 'cycle';

/** Whether `candidateId` is `rootId` or sits anywhere beneath it. */
function isWithin(rows: readonly WorkItem[], candidateId: string, rootId: string): boolean {
  const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));
  let cursor: string | null | undefined = candidateId;
  while (cursor !== null && cursor !== undefined) {
    if (cursor === rootId) return true;
    cursor = parentOf.get(cursor);
  }
  return false;
}

/**
 * Whether `fromId` can already reach `toId` by following existing edges.
 *
 * Edges are followed **through the tree**: an edge on a parent constrains every
 * leaf beneath it, so reaching a parent reaches its descendants and reaching a
 * descendant means its ancestors are involved too. A search that only compared
 * the two ids written on each row would miss a cycle closed through a branch,
 * and the schedule would then throw on a graph the API had accepted.
 */
function canReach(
  rows: readonly WorkItem[],
  edges: readonly StoredDependency[],
  fromId: string,
  toId: string,
): boolean {
  const seen = new Set<string>();
  const queue = [fromId];
  while (queue.length > 0) {
    const here = queue.shift();
    if (here === undefined || seen.has(here)) continue;
    seen.add(here);
    if (here === toId) return true;
    for (const dependencyEdge of edges) {
      // The edge applies if its predecessor is this work item, an ancestor of
      // it, or a descendant of it — all three mean the two overlap in time.
      // Proof: narrowed to `dependencyEdge.predecessorId === here` and only
      // `follows the tree when a cycle runs through a parent` failed — the API
      // accepted an edge the schedule would then have thrown on.
      const touches =
        isWithin(rows, here, dependencyEdge.predecessorId) ||
        isWithin(rows, dependencyEdge.predecessorId, here);
      if (touches) queue.push(dependencyEdge.successorId);
    }
  }
  return false;
}

/**
 * Why an edge cannot be drawn, or `null` when it can.
 *
 * Pure, and the whole rule. be-01 refuses the write; the schedule's topological
 * sort throws on a cyclic graph anyway, because this guard protects the edges
 * this application creates and that one protects the computation from any graph
 * it is handed — see `design.md` D6.
 */
export function canDepend(
  rows: readonly WorkItem[],
  existing: readonly StoredDependency[],
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
  if (isWithin(rows, predecessorId, successorId) || isWithin(rows, successorId, predecessorId)) {
    return 'ancestor';
  }

  // The new edge says predecessor → successor. If the successor can already
  // reach the predecessor, adding it closes a loop in which neither can start.
  // Proof: this line deleted and the three cycle tests failed — the pair, the
  // three-item loop, and the one closed through a parent.
  if (canReach(rows, existing, successorId, predecessorId)) return 'cycle';

  return null;
}
