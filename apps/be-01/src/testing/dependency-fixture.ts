import type { DependencyStore, StoredDependency, WriteStamp } from '../repository';

/** The dependency table in an array, for tests whose subject is not SQLite. */
export function inMemoryDependencies(seed: readonly StoredDependency[] = []): DependencyStore & {
  readonly rows: StoredDependency[];
  stampsSeen: WriteStamp[];
} {
  const rows: StoredDependency[] = [...seed];
  /**
   * Every stamp this store was handed, in call order, so a service test can
   * assert who wrote and when without a database to read audit columns from.
   */
  const stampsSeen: WriteStamp[] = [];
  return {
    rows,
    stampsSeen,
    listByProject: (projectId) =>
      Promise.resolve(rows.filter((row) => row.projectId === projectId)),
    add(toAdd, stamp) {
      stampsSeen.push(stamp);
      // The real one leans on the unique pair; this mirrors it, because a test
      // that could hold the same edge twice would not be modelling the database.
      const already = rows.some(
        (row) => row.predecessorId === toAdd.predecessorId && row.successorId === toAdd.successorId,
      );
      if (!already) rows.push(toAdd);
      return Promise.resolve();
    },
    remove(predecessorId, successorId, stamp) {
      stampsSeen.push(stamp);
      const index = rows.findIndex(
        (row) => row.predecessorId === predecessorId && row.successorId === successorId,
      );
      if (index >= 0) rows.splice(index, 1);
      return Promise.resolve();
    },
    removeAllFor(workItemId, stamp) {
      stampsSeen.push(stamp);
      const kept = rows.filter(
        (row) => row.predecessorId !== workItemId && row.successorId !== workItemId,
      );
      rows.splice(0, rows.length, ...kept);
      return Promise.resolve();
    },
  };
}
