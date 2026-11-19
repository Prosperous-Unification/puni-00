import type { StepProgressStore, StepWriteOutcome, StoredProgress, WriteStamp } from '@wbs/core';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import { rowsChanged } from './changes';
import type { Gate } from './gate';
import { bumpWorkItems } from './revision';
import { stepProgress, workItem } from './schema';
import { readSqliteStepWriteIn } from './step-write';
import { readSqliteProgressIn } from './point-reads';

/**
 * A stated step is a **satellite** of the work item it is on, exactly as an
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
export class StepProgressRepository implements StepProgressStore {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /** Current leaf-resolved SC18 order keeps rendering stable on one captured metadata snapshot. */
  async listByWorkPackage(workPackageId:string):Promise<StoredProgress[]>{
    return this.db.transaction(snapshot=>readSqliteProgressIn(snapshot,workPackageId,null));
  }

  /** Targeted selection excludes other packages, validates retained references, and preserves current leaf order. */
  async listByWorkItems(workPackageId:string,ids:readonly string[]):Promise<StoredProgress[]>{
    const retained=[...ids];
    return this.db.transaction(snapshot=>readSqliteProgressIn(snapshot,workPackageId,retained));
  }

  /** Identity-only persisted group placement retains its existing indexed query and unrequested predecessor. */
  async listPlacements(workPackageId: string, ids: readonly string[]) {
    if (ids.length === 0) return [];
    const afterId = sql<string | null>`(
      SELECT predecessor.work_item_id FROM step_progress AS predecessor
      WHERE predecessor.work_item_id < ${stepProgress.workItemId}
        AND EXISTS (
          SELECT 1 FROM work_item AS predecessor_owner
          WHERE predecessor_owner.id = predecessor.work_item_id
            AND predecessor_owner.work_package_id = ${workPackageId}
        )
      ORDER BY predecessor.work_item_id DESC LIMIT 1
    )`;
    return this.db
      .selectDistinct({ id: stepProgress.workItemId, afterId })
      .from(stepProgress)
      .innerJoin(workItem, eq(stepProgress.workItemId, workItem.id))
      .where(
        and(eq(workItem.workPackageId, workPackageId), inArray(stepProgress.workItemId, [...ids])),
      )
      .orderBy(asc(stepProgress.workItemId));
  }

  /**
   * States one work item's step, replacing whatever it said before.
   *
   * `statedAt` is replaced with the new write's own stamp rather than kept from
   * the row being overwritten: the column says when this statement was made, and
   * a step that has just gone from in progress to done was said to be done
   * today.
   */
  async set(toSet: StoredProgress, stamp: WriteStamp): Promise<StepWriteOutcome> {
    const kept=structuredClone(toSet),act={...stamp};
    return await this.gate.enter(()=>Promise.resolve(
      this.db.transaction((tx):StepWriteOutcome=>{
        const decision=readSqliteStepWriteIn(tx,kept.workItemId,kept.stepId);
        // Proof: removing this refusal made sqlite stepCatalogue.pointWrite:progress-untyped
        // return written for an unresolved step after its healthy typed write/read/remove.
        // Restoring the guard returned the same isolated owner to passing.
        if(decision.kind!=='resolved')return decision.kind;
          tx.insert(stepProgress)
            .values({ ...kept, ...auditOnCreate(act) })
            .onConflictDoUpdate({
              target: [stepProgress.workItemId, stepProgress.stepId],
              set: { state: kept.state, statedAt: kept.statedAt, ...auditOnUpdate(act) },
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
      // (work item, step), and narrowing to one of them would take that step's
      // state off every row in the database. `step-progress.test.ts` keeps a
      // survivor for each half so that mistake cannot pass — the same guard
      // `estimate.test.ts` and `actual.test.ts` keep.
      await Promise.resolve();
      this.db.transaction((tx) => {
        tx.delete(stepProgress)
          .where(and(eq(stepProgress.workItemId, workItemId), eq(stepProgress.stepId, stepId)))
          .run();
        bumpWorkItems(tx, [workItemId], stamp);
      });
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
  async moveAll(fromWorkItemId: string, toWorkItemId: string, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((tx) => {
        tx.update(stepProgress)
          .set({ workItemId: toWorkItemId, ...auditOnUpdate(stamp) })
          .where(eq(stepProgress.workItemId, fromWorkItemId))
          .run();
        if (rowsChanged(tx, 'moving stated progress') === 0) return;
        bumpWorkItems(tx, [fromWorkItemId, toWorkItemId], stamp);
      });
    });
  }
}

