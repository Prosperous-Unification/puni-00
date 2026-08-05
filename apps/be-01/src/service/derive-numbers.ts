/** The placement facts a work item is numbered from. */
export interface WorkItemPlacement {
  id: string;
  parentId: string | null;
  position: number;
  frozenNumber: string | null;
}

/**
 * The labels one sibling group takes, in position order.
 *
 * Roots read `010`, `020`, `030` — leading zero so `010` sorts before `100`,
 * trailing zero so `011` can be inserted later without disturbing either
 * neighbour. Children read `1`, `2`, `3` and are joined to their parent's number
 * with a dot.
 *
 * Both widen by the same rule, and the rule exists because the sort is
 * byte-wise: at ten children `010.10` would otherwise sort second, between
 * `010.1` and `010.2`. Width is whatever the highest label needs, so a tenth
 * child takes the whole group to `010.01`–`010.10` and a hundredth root takes
 * every root to `0010`–`1000`.
 */
function labelsFor(count: number, isRoot: boolean): string[] {
  const step = isRoot ? 10 : 1;
  const highest = count * step;
  // Roots never drop below three characters: `010` is the agreed shape even
  // when a project holds one work item.
  const width = isRoot ? Math.max(3, String(highest).length) : String(highest).length;
  return Array.from({ length: count }, (_, i) => String((i + 1) * step).padStart(width, '0'));
}

/**
 * Every work item's number, keyed by id.
 *
 * Pure, and given the whole project at once, because a number is a fact about a
 * work item's place among its siblings rather than about the work item. It reads
 * only `parentId` and `position` and never a number it previously produced, so a
 * wrong number is repaired by running this again — which is what makes deleting
 * a work item safe to follow with a plain re-derivation.
 *
 * `frozenNumber` is not yet honoured here; freezing is the next slice.
 */
export function deriveNumbers(placements: readonly WorkItemPlacement[]): Map<string, string> {
  const childrenOf = new Map<string | null, WorkItemPlacement[]>();
  for (const placement of placements) {
    const group = childrenOf.get(placement.parentId) ?? [];
    group.push(placement);
    childrenOf.set(placement.parentId, group);
  }
  for (const group of childrenOf.values()) group.sort((a, b) => a.position - b.position);

  const numbers = new Map<string, string>();
  const numberGroup = (parentId: string | null, parentNumber: string | null): void => {
    const group = childrenOf.get(parentId) ?? [];
    const labels = labelsFor(group.length, parentNumber === null);
    group.forEach((placement, i) => {
      const label = labels[i] ?? '';
      const number = parentNumber === null ? label : `${parentNumber}.${label}`;
      numbers.set(placement.id, number);
      numberGroup(placement.id, number);
    });
  };
  numberGroup(null, null);

  // Every work item must have been reached. One that was not is either an
  // orphan — its `parentId` names a work item outside this project — or part of
  // a parent cycle, and both mean the caller is holding something that is not a
  // tree. Returning the reachable ones would hand back a project silently
  // missing rows, and a cycle would not even return.
  if (numbers.size !== placements.length) {
    const unreachable = placements.filter((p) => !numbers.has(p.id)).map((p) => p.id);
    throw new Error(`work items unreachable from any root: ${unreachable.join(', ')}`);
  }

  return numbers;
}
