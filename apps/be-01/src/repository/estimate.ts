import { and, eq, inArray } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type { EstimateStore, StoredEstimate } from './index';
import { bumpWorkItems } from './revision';
import { estimate, role, workItem } from './schema';

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

  /**
   * Every estimate in the project, **in role order** within each work item.
   *
   * The order is part of the contract, not a side effect of how SQLite felt
   * about the query. A caller that adds these up — the schedule's adapter does,
   * one work item at a time — is doing floating-point addition, which is not
   * associative: three roles summed in one order and in another can differ in
   * the last bit, and a work item's finish is read through `Math.ceil`, so that
   * bit can be a whole day on the screen. An unordered read makes which day it
   * is depend on the query planner.
   *
   * Ordered by the role's **position** rather than by its id, so that the order
   * this hands back is the order the work actually runs in.
   *
   * Proof: with the `orderBy` removed, `reads a work item's estimates in role
   * order, not in the order the row ids happen to sort` fails, handing back the
   * project's second role first — the composite primary key's own order;
   * watched 2026-08-09.
   */
  async listByProject(projectId: string): Promise<StoredEstimate[]> {
    const ids = await this.db
      .select({ id: workItem.id })
      .from(workItem)
      .where(eq(workItem.projectId, projectId));
    if (ids.length === 0) return [];
    return (
      this.db
        .select({
          workItemId: estimate.workItemId,
          roleId: estimate.roleId,
          optimistic: estimate.optimistic,
          realistic: estimate.realistic,
          pessimistic: estimate.pessimistic,
        })
        .from(estimate)
        // Inner rather than left: `estimate.role_id` is a foreign key, so an
        // estimate whose role is gone cannot exist — `RoleRepository.remove`
        // deletes them in the same transaction as the role.
        .innerJoin(role, eq(estimate.roleId, role.id))
        .where(
          inArray(
            estimate.workItemId,
            ids.map((row) => row.id),
          ),
        )
        .orderBy(estimate.workItemId, role.position, estimate.roleId)
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
