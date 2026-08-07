import { and, eq, inArray } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type { EstimateStore, StoredEstimate } from './index';
import { bumpWorkItems } from './revision';
import { estimate, workItem } from './schema';

/**
 * An estimate is a **satellite** of the work item it is for: it has no identity
 * anyone holds and is only ever read through that work item. So every write
 * here moves that work item's revision, inside the same transaction as the
 * estimate write — see `work_item.revision` in `schema.ts`.
 *
 * The bumps are unconditional rather than conditional on rows having actually
 * changed. Asking first would be a read-then-write, which is exactly the shape
 * the counter exists to avoid; and the two mistakes are not symmetric. A bump
 * nobody needed costs a conditional write one retry. A bump that did not happen
 * lets a stale write land on data that moved, which is the failure being
 * prevented.
 */
export class EstimateRepository implements EstimateStore {
  constructor(private readonly db: SQLiteBunDatabase) {}

  async listByProject(projectId: string): Promise<StoredEstimate[]> {
    const ids = await this.db
      .select({ id: workItem.id })
      .from(workItem)
      .where(eq(workItem.projectId, projectId));
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(estimate)
      .where(
        inArray(
          estimate.workItemId,
          ids.map((row) => row.id),
        ),
      );
  }

  async set(toSet: StoredEstimate): Promise<void> {
    await Promise.resolve();
    this.db.transaction((tx) => {
      tx.insert(estimate)
        .values(toSet)
        .onConflictDoUpdate({
          target: [estimate.workItemId, estimate.roleId],
          set: {
            optimistic: toSet.optimistic,
            realistic: toSet.realistic,
            pessimistic: toSet.pessimistic,
          },
        })
        .run();
      bumpWorkItems(tx, [toSet.workItemId]);
    });
  }

  async remove(workItemId: string, roleId: string): Promise<void> {
    // Both halves of the key, not the role alone: the composite primary key is
    // (work item, role), and narrowing to one of them would clear that role
    // across the whole database. `estimate.test.ts` keeps a survivor for each
    // half so that mistake cannot pass.
    //
    // Proof: narrowed to `eq(estimate.roleId, roleId)` alone, `removes one
    // work item's role without touching the other role or the same role
    // elsewhere` fails; watched 2026-08-06.
    await Promise.resolve();
    this.db.transaction((tx) => {
      tx.delete(estimate)
        .where(and(eq(estimate.workItemId, workItemId), eq(estimate.roleId, roleId)))
        .run();
      bumpWorkItems(tx, [workItemId]);
    });
  }

  /**
   * Both work items move: one lost every estimate it held, the other gained
   * them, and a reader of either sees different figures afterwards.
   *
   * Proof: bumped for `to` alone, `hands the estimate down to a first child,
   * moving both` fails on the parent's revision; watched 2026-08-07.
   */
  async moveAll(fromWorkItemId: string, toWorkItemId: string): Promise<void> {
    await Promise.resolve();
    this.db.transaction((tx) => {
      tx.update(estimate)
        .set({ workItemId: toWorkItemId })
        .where(eq(estimate.workItemId, fromWorkItemId))
        .run();
      bumpWorkItems(tx, [fromWorkItemId, toWorkItemId]);
    });
  }
}
