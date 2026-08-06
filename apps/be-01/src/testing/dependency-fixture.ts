import type { DependencyStore, StoredDependency } from '../repository';

/** The dependency table in an array, for tests whose subject is not SQLite. */
export function inMemoryDependencies(seed: readonly StoredDependency[] = []): DependencyStore & {
  readonly rows: StoredDependency[];
} {
  const rows: StoredDependency[] = [...seed];
  return {
    rows,
    listByProject: (projectId) =>
      Promise.resolve(rows.filter((row) => row.projectId === projectId)),
    add(toAdd) {
      // The real one leans on the unique pair; this mirrors it, because a test
      // that could hold the same edge twice would not be modelling the database.
      const already = rows.some(
        (row) => row.predecessorId === toAdd.predecessorId && row.successorId === toAdd.successorId,
      );
      if (!already) rows.push(toAdd);
      return Promise.resolve();
    },
    remove(predecessorId, successorId) {
      const index = rows.findIndex(
        (row) => row.predecessorId === predecessorId && row.successorId === successorId,
      );
      if (index >= 0) rows.splice(index, 1);
      return Promise.resolve();
    },
    removeAllFor(workItemId) {
      const kept = rows.filter(
        (row) => row.predecessorId !== workItemId && row.successorId !== workItemId,
      );
      rows.splice(0, rows.length, ...kept);
      return Promise.resolve();
    },
  };
}
