import { compareStepUsageIds, type ValueGroupPlacement, type WorkItemStore } from '@wbs/core';

/** Reads identity-only satellite placement without borrowing work-item collection order. */
export async function listValueGroupPlacements(
  rows: readonly { readonly workItemId: string }[],
  workPackageId: string,
  ids: readonly string[],
  workItems: WorkItemStore,
): Promise<ValueGroupPlacement[]> {
  if (ids.length === 0) return [];
  const requested = new Set(ids);
  // Proof: restoring localeCompare makes both admitted runner regressions
  // (mixed-case and Unicode) disagree with the actual binary full readers.
  // A UTF16 comparator passes mixed-case but fails the Unicode regression.
  const groupIds = [...new Set(rows.map(({ workItemId }) => workItemId))].sort(compareStepUsageIds);
  const workPackageGroups: string[] = [];
  for (const id of groupIds) {
    const workItem = await workItems.findById(id);
    if (workItem?.workPackageId === workPackageId) workPackageGroups.push(id);
  }
  return workPackageGroups.flatMap((id, index) =>
    requested.has(id) ? [{ id, afterId: index === 0 ? null : workPackageGroups[index - 1] }] : [],
  );
}

/** Locale ordering retained by budget and standalone legacy ranged-measure readers. */
export function compareValueGroupIds(left: string, right: string): number {
  return left.localeCompare(right);
}
