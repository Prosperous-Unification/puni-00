import type { WorkItemView } from '@/lib/wbs-api';

/** A work item with its children attached, which is the shape a table row model wants. */
export interface TreeRow extends WorkItemView {
  subRows: TreeRow[];
}

/**
 * Nests a flat, tree-ordered list.
 *
 * be-01 already returns the rows in the order they read, so this adds no
 * ordering of its own — it only attaches children to parents, which is what
 * expansion needs to know a branch exists. A work item whose parent is missing
 * from the list is kept at the root rather than dropped: losing a row silently
 * is worse than showing it in the wrong place.
 *
 * **`tagIds` is defaulted here**, and this is the one place it may be: the type
 * says it is a `string[]` and every surface reads `.length` on it without
 * checking, so the wire has to be made to match the type at the boundary rather
 * than at each of them.
 *
 * The absence is a real state and not a paranoid one. Blue and green run
 * together during a swap: an fe-01 carrying this change can be served a tree by
 * the **outgoing** be-01, which has never heard of the field. `serviceTeamId`
 * documents the same window from the other side. An untagged plan for the
 * length of a deploy is right; a page that throws on every row is not.
 */
export function toTree(flat: readonly WorkItemView[]): TreeRow[] {
  const rows = new Map<string, TreeRow>(
    flat.map((item) => [item.id, { ...item, tagIds: item.tagIds ?? [], subRows: [] }]),
  );
  const roots: TreeRow[] = [];
  for (const item of flat) {
    const row = rows.get(item.id);
    if (row === undefined) continue;
    const parent = item.parentId === null ? undefined : rows.get(item.parentId);
    if (parent === undefined) roots.push(row);
    else parent.subRows.push(row);
  }
  return roots;
}
