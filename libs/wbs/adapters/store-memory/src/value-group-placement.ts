import type { ValueGroupPlacement, WorkItemStore } from '@wbs/core';

/** Reads identity-only satellite placement without borrowing work-item collection order. */
export async function listValueGroupPlacements(
  rows: readonly { readonly workItemId: string }[],
  workPackageId: string,
  ids: readonly string[],
  workItems: WorkItemStore,
): Promise<ValueGroupPlacement[]> {
  if (ids.length === 0) return [];
  const requested = new Set(ids);
  const groupIds = [...new Set(rows.map(({ workItemId }) => workItemId))].sort(
    compareValueGroupIds,
  );
  const workPackageGroups: string[] = [];
  for (const id of groupIds) {
    const workItem = await workItems.findById(id);
    if (workItem?.workPackageId === workPackageId) workPackageGroups.push(id);
  }
  return workPackageGroups.flatMap((id, index) =>
    requested.has(id) ? [{ id, afterId: index === 0 ? null : workPackageGroups[index - 1] }] : [],
  );
}

/** Orders populated groups exactly as the memory satellite full readers do. */
export function compareValueGroupIds(left: string, right: string): number {
  return left.localeCompare(right);
}
