import { and, eq, inArray, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type { ActualStore, StoredActual } from './index';
import { bumpWorkItems } from './revision';
import { actual, step, workItem } from './schema';

/**
 * An actual is a **satellite** of the work item it is for, exactly as an
 * estimate is: it has no identity anyone holds and is only ever read through
 * that work item. So every write here moves that work item's revision, inside
 * the same transaction as the actual write — see `work_item.revision` in
 * `schema.ts`.
 *
 * Deliberately shaped as a copy of `EstimateRepository` rather than as a second
 * design: the two tables share a key, a grain and every structural rule about
 * where rows may live, and the failure this shape prevents is the one where
 * estimates follow a subtree and actuals quietly do not.
 */
export class ActualRepository implements ActualStore {
  constructor(private readonly db: SQLiteBunDatabase) {}

  /**
   * Every actual in the project, **in step order** within each work item.
   *
   * Ordered for `EstimateRepository.listByProject`'s reason and for one weaker
   * one. The strong half does not apply here — a work item's actuals are summed
   * in the roll-up, and floating-point addition is not associative, so the order
   * decides the last bit of a parent's total exactly as it does for estimates.
   * The weak half is that two reads of an unchanged plan must not disagree about
   * the order of a row's steps on screen.
   *
   * Ordered by the step's **position**, so the order this hands back is the
   * order the work runs in — the same order the estimates come back in, which is
   * what lets a reader put the two lists side by side.
   */
  async listByProject(projectId: string): Promise<StoredActual[]> {
    const ids = await this.db
      .select({ id: workItem.id })
      .from(workItem)
      .where(eq(workItem.projectId, projectId));
    if (ids.length === 0) return [];
    return (
      this.db
        .select({
          workItemId: actual.workItemId,
          stepId: actual.stepId,
          days: actual.days,
          recordedAt: actual.recordedAt,
        })
        .from(actual)
        // Inner rather than left: `actual.role_id` is a foreign key, so an
        // actual whose step is gone cannot exist — `StepRepository.remove`
        // deletes them in the same transaction as the step.
        .innerJoin(step, eq(actual.stepId, step.id))
        .where(
          inArray(
            actual.workItemId,
            ids.map((row) => row.id),
          ),
        )
        .orderBy(actual.workItemId, step.position, actual.stepId)
    );
  }

  /**
   * Writes one work item's actual for one step, replacing any earlier one.
   *
   * `recordedAt` is replaced with the new write's own stamp rather than kept
   * from the row being overwritten: the column says when this number was typed,
   * and a corrected figure was typed today.
   */
  async set(toSet: StoredActual): Promise<void> {
    await Promise.resolve();
    this.db.transaction((tx) => {
      tx.insert(actual)
        .values(toSet)
        .onConflictDoUpdate({
          target: [actual.workItemId, actual.stepId],
          set: { days: toSet.days, recordedAt: toSet.recordedAt },
        })
        .run();
      bumpWorkItems(tx, [toSet.workItemId]);
    });
  }

  async remove(workItemId: string, stepId: string): Promise<void> {
    // Both halves of the key, not the step alone: the composite primary key is
    // (work item, step), and narrowing to one of them would clear that step
    // across the whole database. `actual.test.ts` keeps a survivor for each half
    // so that mistake cannot pass — the same guard `estimate.test.ts` keeps.
    await Promise.resolve();
    this.db.transaction((tx) => {
      tx.delete(actual)
        .where(and(eq(actual.workItemId, workItemId), eq(actual.stepId, stepId)))
        .run();
      bumpWorkItems(tx, [workItemId]);
    });
  }

  /**
   * Both work items move when anything moved, for `EstimateRepository.moveAll`'s
   * reason: one lost every actual it held and the other gained them, and a
   * reader of either sees different figures afterwards.
   *
   * **The bump is conditional here and unconditional there**, which is the one
   * place these two classes deliberately differ. This runs on **every** create
   * that gives a leaf its first child, beside the estimate move, and almost
   * every plan has no actuals at all: an unconditional bump would move two
   * revisions on a write that touched no row of this table, and every reader's
   * precondition on that parent would go stale for a change that did not happen.
   *
   * The conditional is not a read-then-write — the argument `EstimateRepository`
   * makes against those still stands. `changes()` reports what the statement in
   * this transaction just did, so a row written by somebody else a moment
   * earlier is inside the `UPDATE` and inside the count.
   *
   * Proof: bumped unconditionally, `hands the estimate down to a first child,
   * moving both` in `service/revision.test.ts` fails with the child at revision
   * 2 where 1 is owed — a work item reporting two writes for one create;
   * watched 2026-08-17.
   */
  async moveAll(fromWorkItemId: string, toWorkItemId: string): Promise<void> {
    await Promise.resolve();
    this.db.transaction((tx) => {
      tx.update(actual)
        .set({ workItemId: toWorkItemId })
        .where(eq(actual.workItemId, fromWorkItemId))
        .run();
      const changed = tx.all<{ n: number }>(sql`SELECT changes() AS n`).at(0);
      if (changed === undefined) {
        throw new Error('SELECT changes() answered no row after moving actuals');
      }
      if (changed.n === 0) return;
      bumpWorkItems(tx, [fromWorkItemId, toWorkItemId]);
    });
  }
}
