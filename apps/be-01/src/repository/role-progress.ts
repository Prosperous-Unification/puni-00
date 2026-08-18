import { and, eq, inArray, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type { RoleProgressStore, StoredProgress } from './index';
import { bumpWorkItems } from './revision';
import { role, roleProgress, workItem } from './schema';

/**
 * A stated role is a **satellite** of the work item it is on, exactly as an
 * estimate and an actual are: it has no identity anyone holds and is only ever
 * read through that work item. So every write here moves that work item's
 * revision, inside the same transaction as the write — see `work_item.revision`
 * in `schema.ts`.
 *
 * Deliberately shaped as a copy of `ActualRepository` rather than as a second
 * design, for the reason that class gives for copying `EstimateRepository`: the
 * three tables share a key, a grain and every structural rule about where rows
 * may live, and the failure this prevents is the one where estimates and actuals
 * follow a subtree and the statement about them quietly does not.
 */
export class RoleProgressRepository implements RoleProgressStore {
  constructor(private readonly db: SQLiteBunDatabase) {}

  /**
   * Every stated role in the project, **in role order** within each work item.
   *
   * Ordered for `ActualRepository.listByProject`'s weaker reason and not its
   * stronger one: folding states is `agree`, which is commutative and
   * idempotent, so unlike a sum of reals the order cannot change the answer.
   * What it does change is the order the roles appear in on screen, and two
   * reads of an unchanged plan must not disagree about that.
   *
   * Ordered by the role's **position**, so this hands back the order the work
   * runs in — the same order the estimates and the actuals come back in, which
   * is what lets a reader put the three lists side by side.
   */
  async listByProject(projectId: string): Promise<StoredProgress[]> {
    const ids = await this.db
      .select({ id: workItem.id })
      .from(workItem)
      .where(eq(workItem.projectId, projectId));
    if (ids.length === 0) return [];
    return (
      this.db
        .select({
          workItemId: roleProgress.workItemId,
          roleId: roleProgress.roleId,
          state: roleProgress.state,
          statedAt: roleProgress.statedAt,
        })
        .from(roleProgress)
        // Inner rather than left: `role_progress.role_id` is a foreign key, so a
        // statement whose role is gone cannot exist — `RoleRepository.remove`
        // deletes them in the same transaction as the role.
        .innerJoin(role, eq(roleProgress.roleId, role.id))
        .where(
          inArray(
            roleProgress.workItemId,
            ids.map((row) => row.id),
          ),
        )
        .orderBy(roleProgress.workItemId, role.position, roleProgress.roleId)
    );
  }

  /**
   * States one work item's role, replacing whatever it said before.
   *
   * `statedAt` is replaced with the new write's own stamp rather than kept from
   * the row being overwritten: the column says when this statement was made, and
   * a role that has just gone from in progress to done was said to be done
   * today.
   */
  async set(toSet: StoredProgress): Promise<void> {
    await Promise.resolve();
    this.db.transaction((tx) => {
      tx.insert(roleProgress)
        .values(toSet)
        .onConflictDoUpdate({
          target: [roleProgress.workItemId, roleProgress.roleId],
          set: { state: toSet.state, statedAt: toSet.statedAt },
        })
        .run();
      bumpWorkItems(tx, [toSet.workItemId]);
    });
  }

  async remove(workItemId: string, roleId: string): Promise<void> {
    // Both halves of the key, not the role alone: the composite primary key is
    // (work item, role), and narrowing to one of them would take that role's
    // state off every row in the database. `role-progress.test.ts` keeps a
    // survivor for each half so that mistake cannot pass — the same guard
    // `estimate.test.ts` and `actual.test.ts` keep.
    await Promise.resolve();
    this.db.transaction((tx) => {
      tx.delete(roleProgress)
        .where(and(eq(roleProgress.workItemId, workItemId), eq(roleProgress.roleId, roleId)))
        .run();
      bumpWorkItems(tx, [workItemId]);
    });
  }

  /**
   * Both work items move when anything moved, for `EstimateRepository.moveAll`'s
   * reason: one lost every statement it held and the other gained them, and a
   * reader of either sees a different state afterwards.
   *
   * **Conditional, exactly as `ActualRepository.moveAll` is and for the same
   * measurement.** This runs on every create that gives a leaf its first child,
   * beside the estimate move and the actual move, and almost every plan has no
   * stated rows at all: an unconditional bump would move two revisions on a
   * write that touched no row of this table, and every reader's precondition on
   * that parent would go stale for a change that did not happen.
   *
   * The conditional is not a read-then-write — `changes()` reports what the
   * statement in this transaction just did, so a row written by somebody else a
   * moment earlier is inside the `UPDATE` and inside the count.
   *
   * Proof: bumped unconditionally, `hands the estimate down to a first child,
   * moving both` in `service/revision.test.ts` fails with the child at revision
   * 2 where 1 is owed; watched 2026-08-18.
   */
  async moveAll(fromWorkItemId: string, toWorkItemId: string): Promise<void> {
    await Promise.resolve();
    this.db.transaction((tx) => {
      tx.update(roleProgress)
        .set({ workItemId: toWorkItemId })
        .where(eq(roleProgress.workItemId, fromWorkItemId))
        .run();
      const changed = tx.all<{ n: number }>(sql`SELECT changes() AS n`).at(0);
      if (changed === undefined) {
        throw new Error('SELECT changes() answered no row after moving stated progress');
      }
      if (changed.n === 0) return;
      bumpWorkItems(tx, [fromWorkItemId, toWorkItemId]);
    });
  }
}
