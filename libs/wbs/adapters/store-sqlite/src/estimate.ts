import type { EstimateStore, StepWriteOutcome, StoredEstimate, WriteStamp } from '@wbs/core';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import { readSqliteEstimatesIn } from './estimate-reads';
import type { Gate } from './gate';
import { bumpWorkItems } from './revision';
import { estimate, workItem } from './schema';
import { readSqliteStepWriteIn } from './step-write';

/**
 * An estimate is a **satellite** of the work item it is for: it has no identity
 * anyone holds and is only ever read through that work item. So every write
 * here moves that work item's revision, inside the same transaction as the
 * estimate write — see `work_item.revision` in `schema.ts`.
 *
 * **What the four satellite stores share is named, and it is not the class.**
 * `rowsChanged` is one function where three of them held the same eight lines,
 * and `listByWorkPackage` is one statement in all four — a join through
 * `work_item`, where it used to be an id read followed by an `IN (…)` over
 * every row. What is *not* shared is the four classes themselves, and the
 * reason is in this paragraph and the next: the value columns, the key width
 * (`step_measure` carries a third column) and the bump below all differ, so a
 * parameterised store would take each of them as an option and would need a
 * cast to hand drizzle a table it does not know the shape of. The rules would
 * be no shorter and no longer typechecked.
 *
 * The bumps are unconditional rather than conditional on rows having actually
 * changed. Asking first would be a read-then-write, which is exactly the shape
 * the counter exists to avoid; and the two mistakes are not symmetric. A bump
 * nobody needed costs a conditional write one retry. A bump that did not happen
 * lets a stale write land on data that moved, which is the failure being
 * prevented.
 */
export class EstimateRepository implements EstimateStore {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /** Current public owner turn or borrowed writer, held across the entire synchronous capture. */
  async readTarget(workItemId: string, stepId: string) {
    return await this.gate.enter(() =>
      Promise.resolve(this.db.transaction((tx) => readSqliteStepWriteIn(tx, workItemId, stepId))),
    );
  }

  /**
   * Every estimate in the work package, **in step order** within each work item.
   *
   * The order is part of the contract, not a side effect of how SQLite felt
   * about the query. A caller that adds these up — the schedule's adapter does,
   * one work item at a time — is doing floating-point addition, which is not
   * associative: three steps summed in one order and in another can differ in
   * the last bit, and a work item's finish is read through `Math.ceil`, so that
   * bit can be a whole day on the screen. An unordered read makes which day it
   * is depend on the query planner.
   *
   * Ordered by the leaf's current SC18 resolved binding order, not definition or ID
   * order. Every fact is checked against the same coherent catalogue snapshot.
   *
   * Historical proof for the old step-table reader: with the `orderBy` removed, `reads a work item's estimates in step
   * order, not in the order the row ids happen to sort` fails, handing back the
   * work package's second step first — the composite primary key's own order;
   * watched 2026-08-09.
   */
  async listByWorkPackage(workPackageId: string): Promise<StoredEstimate[]> {
    return await this.gate.enter(() =>
      Promise.resolve(this.db.transaction((tx) => readSqliteEstimatesIn(tx, workPackageId, null))),
    );
  }

  async listByWorkItems(workPackageId: string, ids: readonly string[]): Promise<StoredEstimate[]> {
    const retained = [...ids];
    return await this.gate.enter(() =>
      Promise.resolve(
        this.db.transaction((tx) => readSqliteEstimatesIn(tx, workPackageId, retained)),
      ),
    );
  }

  async listPlacements(workPackageId: string, ids: readonly string[]) {
    if (ids.length === 0) return [];
    const afterId = sql<string | null>`(
      SELECT predecessor.work_item_id FROM estimate AS predecessor
      WHERE predecessor.work_item_id < ${estimate.workItemId}
        AND EXISTS (
          SELECT 1 FROM work_item AS predecessor_owner
          WHERE predecessor_owner.id = predecessor.work_item_id
            AND predecessor_owner.work_package_id = ${workPackageId}
        )
      ORDER BY predecessor.work_item_id DESC LIMIT 1
    )`;
    return this.db
      .selectDistinct({ id: estimate.workItemId, afterId })
      .from(estimate)
      .innerJoin(workItem, eq(estimate.workItemId, workItem.id))
      .where(and(eq(workItem.workPackageId, workPackageId), inArray(estimate.workItemId, [...ids])))
      .orderBy(asc(estimate.workItemId));
  }

  /** Captures leaf applicability on this exact writer, then changes value and revision without an intervening await. */
  async set(toSet: StoredEstimate, stamp: WriteStamp): Promise<StepWriteOutcome> {
    const kept = structuredClone(toSet),
      act = { ...stamp };
    return await this.gate.enter(() =>
      Promise.resolve(
        this.db.transaction((tx): StepWriteOutcome => {
          const decision = readSqliteStepWriteIn(tx, kept.workItemId, kept.stepId);
          // Proof: W_SQL removes this refusal; both post-unbind estimate owners return written.
          if (decision.kind !== 'resolved') return decision.kind;
          tx.insert(estimate)
            .values({ ...kept, ...auditOnCreate(act) })
            .onConflictDoUpdate({
              target: [estimate.workItemId, estimate.stepId],
              set: {
                optimistic: kept.optimistic,
                realistic: kept.realistic,
                pessimistic: kept.pessimistic,
                ...auditOnUpdate(act),
              },
            })
            .run();
          bumpWorkItems(tx, [kept.workItemId], act);
          return 'written';
        }),
      ),
    );
  }

  async remove(workItemId: string, stepId: string, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      // Both halves of the key, not the step alone: the composite primary key is
      // (work item, step), and narrowing to one of them would clear that step
      // across the whole database. `estimate.test.ts` keeps a survivor for each
      // half so that mistake cannot pass.
      //
      // Proof: narrowed to `eq(estimate.stepId, stepId)` alone, `removes one
      // work item's step without touching the other step or the same step
      // elsewhere` fails; watched 2026-08-06.
      await Promise.resolve();
      this.db.transaction((tx) => {
        tx.delete(estimate)
          .where(and(eq(estimate.workItemId, workItemId), eq(estimate.stepId, stepId)))
          .run();
        bumpWorkItems(tx, [workItemId], stamp);
      });
    });
  }

  /**
   * Both work items move: one lost every estimate it held, the other gained
   * them, and a reader of either sees different figures afterwards.
   *
   * Proof: bumped for `to` alone, `hands the estimate down to a first child,
   * moving both` fails on the parent's revision; watched 2026-08-07.
   */
  async moveAll(fromWorkItemId: string, toWorkItemId: string, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((tx) => {
        tx.update(estimate)
          .set({ workItemId: toWorkItemId, ...auditOnUpdate(stamp) })
          .where(eq(estimate.workItemId, fromWorkItemId))
          .run();
        bumpWorkItems(tx, [fromWorkItemId, toWorkItemId], stamp);
      });
    });
  }
}
