import type {
  DependencyStore,
  DirectoryStore,
  EstimateStore,
  SubtreeStore,
  WorkItemStore,
} from '../repository';

/**
 * A SubtreeStore that writes a copy through the four in-memory stores it is
 * given, in the order the real foreign keys force.
 *
 * **It is not atomic, and cannot be.** Maps have no transaction to roll back,
 * so a fixture claiming atomicity here would be a check that cannot fail —
 * exactly what R5 forbids. The claim is proved where it is real, against
 * SQLite, in `repository/work-item.test.ts`: the last write is given a broken
 * foreign key and nothing lands.
 *
 * What it does keep is the ordering, because that part *is* observable: the
 * work item fixture throws on a reposition it cannot find, and every store
 * here would accept the writes in any order the real database refuses.
 */
export function inMemorySubtrees(stores: {
  workItems: WorkItemStore;
  estimates: EstimateStore;
  dependencies: DependencyStore;
  directory: DirectoryStore;
}): SubtreeStore {
  return {
    async insertSubtree(copy) {
      // The respacing rides with the first row, which is how `WorkItemStore.insert`
      // takes it — one call applies both, as the one transaction does.
      for (const [index, row] of copy.rows.entries()) {
        await stores.workItems.insert(row, index === 0 ? copy.respaced : []);
      }
      for (const estimate of copy.estimates) await stores.estimates.set(estimate);
      for (const assigned of copy.assignments) {
        await stores.directory.assign(assigned.workItemId, assigned.roleId, assigned.personId);
      }
      for (const edge of copy.dependencies) await stores.dependencies.add(edge);
    },
  };
}
