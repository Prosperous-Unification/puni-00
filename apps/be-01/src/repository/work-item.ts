import { eq, inArray } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type {
  FrozenNumber,
  Reparented,
  Repositioned,
  SubtreeCopy,
  SubtreeStore,
  WorkItem,
  WorkItemPatch,
  WorkItemStore,
} from './index';
import { assignment, dependency, estimate, workItem } from './schema';

/**
 * Every method that writes more than one row does so in one transaction.
 *
 * The reason is the derived number: two siblings sharing a position, or a child
 * pointing at a parent that is already gone, both produce a tree that cannot be
 * numbered. A reader landing between two separate writes would see that state
 * and have no way to tell it from the truth.
 */
export class WorkItemRepository implements WorkItemStore {
  constructor(private readonly db: SQLiteBunDatabase) {}

  listByProject(projectId: string): Promise<WorkItem[]> {
    return this.db.select().from(workItem).where(eq(workItem.projectId, projectId));
  }

  async findById(id: string): Promise<WorkItem | null> {
    const rows = await this.db.select().from(workItem).where(eq(workItem.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async insert(toInsert: WorkItem, respaced: readonly Repositioned[]): Promise<void> {
    await Promise.resolve();
    this.db.transaction((tx) => {
      for (const moved of respaced) {
        tx.update(workItem)
          .set({ position: moved.position })
          .where(eq(workItem.id, moved.id))
          .run();
      }
      tx.insert(workItem).values(toInsert).run();
    });
  }

  async patch(id: string, patch: WorkItemPatch): Promise<WorkItem | null> {
    if (
      patch.name === undefined &&
      patch.notes === undefined &&
      patch.startNoEarlierThan === undefined &&
      patch.serviceTeamId === undefined
    ) {
      return this.findById(id);
    }
    const rows = await this.db.update(workItem).set(patch).where(eq(workItem.id, id)).returning();
    return rows[0] ?? null;
  }

  async move(
    id: string,
    parentId: string | null,
    position: number,
    respaced: readonly Repositioned[],
  ): Promise<void> {
    await Promise.resolve();
    this.db.transaction((tx) => {
      for (const moved of respaced) {
        tx.update(workItem)
          .set({ position: moved.position })
          .where(eq(workItem.id, moved.id))
          .run();
      }
      tx.update(workItem).set({ parentId, position }).where(eq(workItem.id, id)).run();
    });
  }

  async setFrozenNumbers(updates: readonly FrozenNumber[]): Promise<void> {
    await Promise.resolve();
    if (updates.length === 0) return;
    this.db.transaction((tx) => {
      for (const update of updates) {
        tx.update(workItem)
          .set({ frozenNumber: update.frozenNumber })
          .where(eq(workItem.id, update.id))
          .run();
      }
    });
  }

  /**
   * `promoted` is applied *before* the deletion, and `ids` are deleted in
   * reverse of the order given.
   *
   * Both are forced by the foreign keys. A child still pointing at a parent
   * being deleted fails the constraint, so promotions have to land first; and
   * `ids` arrive ancestors-first from `subtreeOf`, so reversing them removes
   * leaves before the parents they hang from. Estimates go first for the same
   * reason — they reference the work items about to disappear.
   */
  async remove(ids: readonly string[], promoted: readonly Reparented[]): Promise<void> {
    await Promise.resolve();
    if (ids.length === 0) return;
    const deepestFirst = [...ids].reverse();
    this.db.transaction((tx) => {
      for (const child of promoted) {
        tx.update(workItem)
          .set({ parentId: child.parentId, position: child.position })
          .where(eq(workItem.id, child.id))
          .run();
      }
      tx.delete(estimate).where(inArray(estimate.workItemId, deepestFirst)).run();
      for (const id of deepestFirst) {
        tx.delete(workItem).where(eq(workItem.id, id)).run();
      }
    });
  }
}

/**
 * Writes a duplicated subtree, across the four tables it lives in, at once.
 *
 * Its own class rather than a method on {@link WorkItemRepository} because the
 * transaction is genuinely wider than the work item table: hiding an estimate
 * and dependency write inside the work item store would put them where nobody
 * looking for them would find them. It is not, however, novel — `remove` above
 * already deletes from `estimate` in its own transaction, for the same reason
 * the foreign keys give: the writes are one act or neither.
 *
 * See `openspec/changes/duplicate-subtree/design.md` for why the alternative —
 * atomic rows, then the other three stores in order — was rejected.
 */
export class SubtreeRepository implements SubtreeStore {
  constructor(private readonly db: SQLiteBunDatabase) {}

  /**
   * The statement order is forced by the foreign keys, not chosen: rows before
   * the estimates and assignments that reference them, and the dependencies
   * last because each references two rows.
   *
   * `async` is load-bearing, as it is in `ProjectRepository.create`:
   * `db.transaction` is synchronous, so without it a constraint violation
   * would throw before the promise this signature advertises exists, and a
   * caller holding it with `.catch()` would never see the rejection.
   */
  async insertSubtree(copy: SubtreeCopy): Promise<void> {
    await Promise.resolve();
    this.db.transaction((tx) => {
      for (const moved of copy.respaced) {
        tx.update(workItem)
          .set({ position: moved.position })
          .where(eq(workItem.id, moved.id))
          .run();
      }
      // One statement per row rather than one multi-row insert: a child
      // referencing a parent in the same `VALUES` list depends on the order
      // SQLite evaluates it in, which is not a contract worth resting a tree on.
      for (const row of copy.rows) tx.insert(workItem).values(row).run();
      if (copy.estimates.length > 0)
        tx.insert(estimate)
          .values([...copy.estimates])
          .run();
      if (copy.assignments.length > 0)
        tx.insert(assignment)
          .values([...copy.assignments])
          .run();
      // Plain inserts, never `onConflictDoNothing`: every id here was generated
      // for this copy, so a conflict is an id collision and swallowing it would
      // hide the one thing that must never be quiet.
      if (copy.dependencies.length > 0)
        tx.insert(dependency)
          .values([...copy.dependencies])
          .run();
    });
  }
}
