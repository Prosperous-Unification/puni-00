import type { ActualStore, StepWriteOutcome, StoredActual, WriteStamp } from '@wbs/core';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import { rowsChanged } from './changes';
import type { Gate } from './gate';
import { bumpWorkItems } from './revision';
import { actual, workItem } from './schema';
import { readSqliteStepWriteIn } from './step-write';
import { readSqliteActualsIn } from './point-reads';

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
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /** Current leaf-resolved SC18 order keeps rendering and floating-point roll-up operands stable on one captured metadata snapshot. */
  async listByWorkPackage(workPackageId:string):Promise<StoredActual[]>{
    return this.db.transaction(snapshot=>readSqliteActualsIn(snapshot,workPackageId,null));
  }

  /** Targeted selection excludes other packages, validates retained references, and preserves current leaf order. */
  async listByWorkItems(workPackageId:string,ids:readonly string[]):Promise<StoredActual[]>{
    const retained=[...ids];
    return this.db.transaction(snapshot=>readSqliteActualsIn(snapshot,workPackageId,retained));
  }

  /** Identity-only persisted group placement retains its existing indexed query and unrequested predecessor. */
  async listPlacements(workPackageId: string, ids: readonly string[]) {
    if (ids.length === 0) return [];
    const afterId = sql<string | null>`(
      SELECT predecessor.work_item_id FROM actual AS predecessor
      WHERE predecessor.work_item_id < ${actual.workItemId}
        AND EXISTS (
          SELECT 1 FROM work_item AS predecessor_owner
          WHERE predecessor_owner.id = predecessor.work_item_id
            AND predecessor_owner.work_package_id = ${workPackageId}
        )
      ORDER BY predecessor.work_item_id DESC LIMIT 1
    )`;
    return this.db
      .selectDistinct({ id: actual.workItemId, afterId })
      .from(actual)
      .innerJoin(workItem, eq(actual.workItemId, workItem.id))
      .where(and(eq(workItem.workPackageId, workPackageId), inArray(actual.workItemId, [...ids])))
      .orderBy(asc(actual.workItemId));
  }

  /**
   * Writes one work item's actual for one step, replacing any earlier one.
   *
   * `recordedAt` is replaced with the new write's own stamp rather than kept
   * from the row being overwritten: the column says when this number was typed,
   * and a corrected figure was typed today.
   */
  async set(toSet: StoredActual, stamp: WriteStamp): Promise<StepWriteOutcome> {
    const kept=structuredClone(toSet),act={...stamp};
    return await this.gate.enter(()=>Promise.resolve(
      this.db.transaction((tx):StepWriteOutcome=>{
        const decision=readSqliteStepWriteIn(tx,kept.workItemId,kept.stepId);
        // Proof: removing this refusal made sqlite stepCatalogue.pointWrite:actual-untyped
        // return written for an unresolved step after its healthy typed write/read/remove.
        // Restoring the guard returned the same isolated owner to passing.
        if(decision.kind!=='resolved')return decision.kind;
          tx.insert(actual)
            .values({ ...kept, ...auditOnCreate(act) })
            .onConflictDoUpdate({
              target: [actual.workItemId, actual.stepId],
              set: { days: kept.days, recordedAt: kept.recordedAt, ...auditOnUpdate(act) },
            })
            .run();
          bumpWorkItems(tx, [kept.workItemId], act);
        return 'written';
      }),
    ));
  }

  async remove(workItemId: string, stepId: string, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      // Both halves of the key, not the step alone: the composite primary key is
      // (work item, step), and narrowing to one of them would clear that step
      // across the whole database. `actual.test.ts` keeps a survivor for each half
      // so that mistake cannot pass — the same guard `estimate.test.ts` keeps.
      await Promise.resolve();
      this.db.transaction((tx) => {
        tx.delete(actual)
          .where(and(eq(actual.workItemId, workItemId), eq(actual.stepId, stepId)))
          .run();
        bumpWorkItems(tx, [workItemId], stamp);
      });
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
  async moveAll(fromWorkItemId: string, toWorkItemId: string, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((tx) => {
        tx.update(actual)
          .set({ workItemId: toWorkItemId, ...auditOnUpdate(stamp) })
          .where(eq(actual.workItemId, fromWorkItemId))
          .run();
        if (rowsChanged(tx, 'moving actuals') === 0) return;
        bumpWorkItems(tx, [fromWorkItemId, toWorkItemId], stamp);
      });
    });
  }
}
