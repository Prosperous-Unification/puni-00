import type { RoleProgressStore, StoredProgress, WorkItemStore } from '../repository';

/** A RoleProgressStore backed by an array, keyed as the composite primary key is. */
export function inMemoryProgress(workItems: WorkItemStore): RoleProgressStore {
  let rows: StoredProgress[] = [];

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
