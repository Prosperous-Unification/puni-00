import type { EstimateStore, StoredEstimate, WorkItemStore } from '../repository';

/** An EstimateStore backed by an array, keyed as the composite primary key is. */
export function inMemoryEstimates(workItems: WorkItemStore): EstimateStore {
  let rows: StoredEstimate[] = [];

  return {
    async listByProject(projectId) {
      const ids = new Set((await workItems.listByProject(projectId)).map((w) => w.id));
      return rows.filter((row) => ids.has(row.workItemId));
    },
    set(toSet) {
      rows = rows.filter(
        (row) => !(row.workItemId === toSet.workItemId && row.stepId === toSet.stepId),
      );
      rows.push(toSet);
      return Promise.resolve();
    },
    remove(workItemId, stepId) {
      rows = rows.filter((row) => !(row.workItemId === workItemId && row.stepId === stepId));
      return Promise.resolve();
    },
    moveAll(fromWorkItemId, toWorkItemId) {
      rows = rows.map((row) =>
        row.workItemId === fromWorkItemId ? { ...row, workItemId: toWorkItemId } : row,
      );
      return Promise.resolve();
    },
  };
}
