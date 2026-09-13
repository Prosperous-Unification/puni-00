import type { WorkItemStore } from '../ports/work-item-store';

interface RetainedWorkItemReads {
  all(): ReturnType<WorkItemStore['listByProject']>;
  byIds(ids: readonly string[]): ReturnType<WorkItemStore['listByIds']>;
}

/**
 * Builds the work-item part of a batch-owned working plan.
 *
 * Successful patches refresh the affected identity before resolving. The
 * other mutations remain guarded delegates until their complete affected-id
 * sets are supplied; callers must not mount this partial graph as the general
 * production batch graph yet.
 */
export function createWorkingPlanRows(
  source: () => WorkItemStore,
  reads: RetainedWorkItemReads,
  assertOpen: () => void,
  refreshRows: (ids: readonly string[]) => Promise<void>,
): WorkItemStore {
  const guarded =
    <Arguments extends readonly unknown[], Value>(
      operation: (...parameters: Arguments) => Promise<Value>,
    ): ((...parameters: Arguments) => Promise<Value>) =>
    (...parameters) => {
      assertOpen();
      return operation(...parameters);
    };

  return {
    listByProject: async () => reads.all(),
    listByIds: async (_projectId, ids) => reads.byIds(ids),
    findById: guarded((id) => source().findById(id)),
    insert: guarded((workItem, respaced, stamp) => source().insert(workItem, respaced, stamp)),
    patch: guarded(async (id, patch, stamp) => {
      const written = await source().patch(id, patch, stamp);
      if (written.ok) await refreshRows([id]);
      return written;
    }),
    move: guarded((id, parentId, position, respaced, stamp) =>
      source().move(id, parentId, position, respaced, stamp),
    ),
    setPositions: guarded((placements, moved, stamp) =>
      source().setPositions(placements, moved, stamp),
    ),
    setFrozenNumbers: guarded((updates, stamp) => source().setFrozenNumbers(updates, stamp)),
    remove: guarded((ids, promoted, stamp) => source().remove(ids, promoted, stamp)),
  };
}
