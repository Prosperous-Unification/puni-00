import {
  type AuthoredDependencyGraph,
  blockedByProxyOf,
  foldStatuses,
  indexTree,
  type LeafStatus,
  leafStatusOf,
  type ProgressStatus,
  type WorkItemStatus,
} from '@wbs/domain';

import type { WorkItem } from '../ports/work-item-store';

/**
 * Every work item's status (`add-work-item-statuses`): each leaf from its
 * progress reading, hold and readiness ({@link leafStatusOf}), then
 * `blocked_by_proxy` from the full dependency graph ({@link blockedByProxyOf}),
 * then each parent from its children ({@link foldStatuses}).
 *
 * `progress` is `rollUpWorkItemStatuses`' answer; only its leaf entries are
 * read, because a parent's status is folded from its children's statuses and
 * never from its own progress fold.
 *
 * Throws for a leaf with no progress reading, and for a parent holding a
 * readiness or hold: both are stored on leaves only, so either is state this
 * read cannot place.
 */
export function workItemStatusesOf(
  rows: readonly WorkItem[],
  progress: ReadonlyMap<string, ProgressStatus>,
  dependencies: AuthoredDependencyGraph,
): Map<string, WorkItemStatus> {
  const index = indexTree(rows);
  const leafIds = new Set(index.leafIds);
  const leafStatuses = new Map<string, LeafStatus>();
  for (const row of rows) {
    if (!leafIds.has(row.id)) {
      // Proof: this check removed made `refuses a readiness or hold stored on
      // a parent` fail on `Received function did not throw`; watched 2026-09-29.
      if (row.readiness !== null || row.hold !== null) {
        throw new Error(`parent ${row.id} holds a readiness or a hold`);
      }
      continue;
    }
    const reading = progress.get(row.id);
    if (reading === undefined) throw new Error(`no progress reading for leaf ${row.id}`);
    leafStatuses.set(
      row.id,
      leafStatusOf({ progress: reading, hold: row.hold, readiness: row.readiness }),
    );
  }
  const statuses = blockedByProxyOf(index, dependencies, leafStatuses);

  const childrenOf = new Map<string, string[]>();
  for (const row of rows) {
    if (row.parentId === null) continue;
    const siblings = childrenOf.get(row.parentId);
    if (siblings === undefined) childrenOf.set(row.parentId, [row.id]);
    else siblings.push(row.id);
  }
  const statusFor = (id: string): WorkItemStatus => {
    const known = statuses.get(id);
    if (known !== undefined) return known;
    const folded = foldStatuses((childrenOf.get(id) ?? []).map(statusFor));
    statuses.set(id, folded);
    return folded;
  };
  for (const row of rows) statusFor(row.id);
  return statuses;
}
