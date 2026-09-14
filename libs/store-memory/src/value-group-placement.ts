import type { ValueGroupPlacement, WorkItemStore } from '@wbs/core';

/** Reads identity-only satellite placement without borrowing work-item collection order. */
export async function listValueGroupPlacements(
  rows: readonly { readonly workItemId: string }[],
  projectId: string,
  ids: readonly string[],
  workItems: WorkItemStore,
): Promise<ValueGroupPlacement[]> {
  if (ids.length === 0) return [];
  const requested = new Set(ids);
  const groupIds = [...new Set(rows.map(({ workItemId }) => workItemId))].sort(compareBinaryText);
  const projectGroups: string[] = [];
  for (const id of groupIds) {
    const workItem = await workItems.findById(id);
    if (workItem?.projectId === projectId) projectGroups.push(id);
  }
  return projectGroups.flatMap((id, index) =>
    requested.has(id) ? [{ id, afterId: index === 0 ? null : projectGroups[index - 1] }] : [],
  );
}

function compareBinaryText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
