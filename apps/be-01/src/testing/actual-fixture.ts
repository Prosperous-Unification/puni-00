import type { ActualStore, StoredActual, WorkItemStore } from '../repository';

/** An ActualStore backed by an array, keyed as the composite primary key is. */
export function inMemoryActuals(workItems: WorkItemStore): ActualStore {
  let rows: StoredActual[] = [];

  return {
    async listByProject(projectId) {
      const ids = new Set((await workItems.listByProject(projectId)).map((w) => w.id));
      return rows.filter((row) => ids.has(row.workItemId));
    },
    set(toSet) {
      rows = rows.filter(
        (row) => !(row.workItemId === toSet.workItemId && row.roleId === toSet.roleId),
      );
      rows.push(toSet);
      return Promise.resolve();
    },
    remove(workItemId, roleId) {
      rows = rows.filter((row) => !(row.workItemId === workItemId && row.roleId === roleId));
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
