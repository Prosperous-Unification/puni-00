import {readSqliteMeasureDefinitionsIn,readSqliteMeasuresIn} from './tuple-reads';
import type { MeasureStore, StepWriteOutcome, StoredMeasure, WriteStamp } from '@wbs/core';
import {
  factMetricOf,
  isLegacyMetric,
  type MeasureDefinition,
  type MeasureMetric,
  type MoneyBasis,
} from '@wbs/domain';
import { and, asc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import { rowsChanged } from './changes';
import type { Gate } from './gate';
import { bumpWorkItems } from './revision';
import { measure, workPackageOrganization, stepMeasure, workItem } from './schema';
import { readSqliteStepWriteIn } from './step-write';

/**
 * The id of the definition keyed `key` in the organization owning the work
 * item's work package, or null when no organization owns it or it defines no such
 * key.
 */
export function measureIdFor(
  db: SQLiteBunDatabase,
  workItemId: string,
  key: string,
): string | null {
  return (
    db
      .select({ id: measure.id })
      .from(workItem)
      .innerJoin(
        workPackageOrganization,
        eq(workPackageOrganization.resourceId, workItem.workPackageId),
      )
      .innerJoin(
        measure,
        and(
          eq(measure.organizationId, workPackageOrganization.organizationId),
          eq(measure.key, key),
        ),
      )
      .where(eq(workItem.id, workItemId))
      .get()?.id ?? null
  );
}

/**
 * The columns a money figure's basis is written to (design D43): both NULL
 * when it has none.
 */
export function basisColumns(basis: MoneyBasis | undefined): {
  currency: string | null;
  rateCardDigest: string | null;
} {
  return { currency: basis?.currency ?? null, rateCardDigest: basis?.rateCardDigest ?? null };
}

/**
 * The basis a stored figure carries, as a field to spread: none when both
 * columns are NULL.
 *
 * @throws when exactly one is set: the column CHECK refuses that, so it is a
 * schema that drifted from its constraint.
 */
export function basisOf(
  currency: string | null,
  rateCardDigest: string | null,
): { basis?: MoneyBasis } {
  if (currency === null && rateCardDigest === null) return {};
  // Proof: with this throw answering no basis, `rejects a stored figure
  // carrying half a money basis after constraint-bypassing corruption`
  // (targeted-readers.db.test.ts) read the fact and the trio unpriced; watched 2026-10-24.
  if (currency === null || rateCardDigest === null)
    throw new Error('a stored money figure carries half a basis');
  return { basis: { currency, rateCardDigest } };
}

/**
 * The stored columns of one fact: a legacy metric is written under its name
 * alone, and `step_measure_keys_legacy_fact` keys it in the same statement,
 * exactly as it keys the outgoing release's inserts; any other metric is a
 * definition key, written as that definition's id with no name.
 *
 * @throws when a defined metric names no definition of the work package's
 * organization: the service decided the key against those same definitions
 * inside this unit of work, so its absence is a caller fault, not a refusal.
 */
export function storedColumnsOf(
  db: SQLiteBunDatabase,
  toStore: Pick<StoredMeasure, 'workItemId' | 'metric'>,
): { metric: MeasureMetric; measureId: null } | { metric: null; measureId: string } {
  // `tokens` and `hours` are the legacy rows under their keys (design D18).
  // Proof: with this mapping removed, the SQLite certification's
  // `measures.set:alias-one-row` wrote a second row under `tokens`; watched 2026-10-23.
  const metric = factMetricOf(toStore.metric);
  if (isLegacyMetric(metric)) return { metric, measureId: null };
  const measureId = measureIdFor(db, toStore.workItemId, metric);
  // Proof: with this throw removed (a NULL id passed on), the SQLite
  // certification's `measures.set:defined-key` met the CHECK
  // `step_measure_addressed` instead of this message; watched 2026-10-23.
  if (measureId === null)
    throw new Error(
      `measure ${toStore.metric} is not defined by the organization owning work item ${toStore.workItemId}`,
    );
  return { metric: null, measureId };
}

/**
 * The condition naming one fact of one step node by its metric: the legacy
 * name, or the definition the key names in the work package's organization. A key
 * naming no definition matches no row, so removing it changes nothing.
 */
export function factCondition(
  db: SQLiteBunDatabase,
  workItemId: string,
  stepId: string,
  requested: string,
): SQL | undefined {
  const pair = and(eq(stepMeasure.workItemId, workItemId), eq(stepMeasure.stepId, stepId));
  // Proof: with this mapping removed, `measures.set:alias-one-row` in the
  // SQLite certification left the tokens fact after `remove('tokens')`; watched 2026-10-23.
  const metric = factMetricOf(requested);
  if (isLegacyMetric(metric)) return and(pair, eq(stepMeasure.metric, metric));
  const measureId = measureIdFor(db, workItemId, metric);
  if (measureId === null) return undefined;
  return and(pair, eq(stepMeasure.measureId, measureId));
}

/**
 * A measure is a **satellite** of the work item it is for, exactly as an
 * estimate and an actual are: it has no identity anyone holds and is only ever
 * read through that work item. So every write here moves that work item's
 * revision, inside the same transaction as the measure write — see
 * `work_item.revision` in `schema.ts`.
 *
 * Deliberately shaped as a copy of {@link ActualRepository} rather than as a
 * third design, for the reason that class gives for being a copy of
 * `EstimateRepository`: the tables share a grain and every structural rule about
 * where rows may live, and the failure this shape prevents is the one where
 * estimates and actuals follow a subtree and measures quietly do not.
 *
 * **What is different, and it is only the key.** `step_measure`'s primary key
 * carries a third column, so `metric` is a parameter of every method that names
 * one row — {@link remove} — and a field of the record on {@link set}. It is
 * deliberately **absent** from the two methods that do not name a row:
 * {@link listByWorkPackage} hands back every metric because the roll-up folds all
 * three from one read and a payload built from three queries could show three
 * different instants of the same plan, and {@link moveAll} moves every metric
 * because a leaf gaining its first child stops holding figures of **any** unit.
 * `design.md` D1's "every read path takes the metric as a parameter" is about
 * the fold — `rollUpMeasures(metric)`, task 5.1 — not about the list underneath
 * it, which carries the metric on each row instead.
 */
export class StepMeasureRepository implements MeasureStore {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /** Every metric is retained, in current SC18 leaf order and metric order within its addressed pair. */
  async listByWorkPackage(workPackageId:string):Promise<StoredMeasure[]>{
    return await this.gate.enter(()=>Promise.resolve(this.db.transaction(tx=>readSqliteMeasuresIn(tx,workPackageId,null))));
  }

  /** Only requested owned rows are decoded; duplicate/absent/sibling ids cannot expand selection. */
  async listByWorkItems(workPackageId:string,ids:readonly string[]):Promise<StoredMeasure[]>{
    const retained=[...ids];
    return await this.gate.enter(()=>Promise.resolve(this.db.transaction(tx=>readSqliteMeasuresIn(tx,workPackageId,retained))));
  }

  /** Current owned definitions, or null for an absent package, from the same snapshot as the scope lookup. */
  async definitionsFor(workPackageId:string):Promise<MeasureDefinition[]|null>{
    return await this.gate.enter(()=>Promise.resolve(this.db.transaction(tx=>readSqliteMeasureDefinitionsIn(tx,workPackageId))));
  }

  async listPlacements(workPackageId: string, ids: readonly string[]) {
    if (ids.length === 0) return [];
    const afterId = sql<string | null>`(
      SELECT predecessor.work_item_id FROM step_measure AS predecessor
      WHERE predecessor.work_item_id < ${stepMeasure.workItemId}
        AND EXISTS (
          SELECT 1 FROM work_item AS predecessor_owner
          WHERE predecessor_owner.id = predecessor.work_item_id
            AND predecessor_owner.work_package_id = ${workPackageId}
        )
      ORDER BY predecessor.work_item_id DESC LIMIT 1
    )`;
    return this.db
      .selectDistinct({ id: stepMeasure.workItemId, afterId })
      .from(stepMeasure)
      .innerJoin(workItem, eq(stepMeasure.workItemId, workItem.id))
      .where(
        and(eq(workItem.workPackageId, workPackageId), inArray(stepMeasure.workItemId, [...ids])),
      )
      .orderBy(asc(stepMeasure.workItemId));
  }

  /**
   * Writes one work item's figure in one metric for one step, replacing any
   * earlier one **in that metric only**.
   *
   * The conflict target is all three key columns, which is the whole of D1's
   * absence rule expressed in one line: correcting a pair's token estimate
   * leaves the hours somebody recorded beside it exactly where they were.
   *
   * `recordedAt` is replaced with the new write's own stamp rather than kept
   * from the row being overwritten, for `ActualRepository.set`'s reason: the
   * column says when this number was typed, and a corrected figure was typed
   * today.
   */
  async set(toSet: StoredMeasure, stamp: WriteStamp): Promise<StepWriteOutcome> {
    const kept=structuredClone(toSet),act={...stamp};
    return await this.gate.enter(()=>Promise.resolve(
      this.db.transaction((tx):StepWriteOutcome=>{
        const decision=readSqliteStepWriteIn(tx,kept.workItemId,kept.stepId);
        // Proof: removing this refusal made sqlite stepCatalogue.pointWrite:measure-untyped
        // return written for an unresolved step after its healthy typed write/read/remove.
        // Restoring the guard returned the same isolated owner to passing.
        if(decision.kind!=='resolved')return decision.kind;
          const columns = storedColumnsOf(tx, kept);
          // A legacy metric conflicts on its name, a defined one on its
          // definition: the two unique indexes `step_measure_metric_key` and
          // `step_measure_measure_key`, one per way a row is addressed.
          const basis = basisColumns(kept.basis);
          tx.insert(stepMeasure)
            .values({
              workItemId: kept.workItemId,
              stepId: kept.stepId,
              value: kept.value,
              recordedAt: kept.recordedAt,
              ...columns,
              ...basis,
              ...auditOnCreate(act),
            })
            .onConflictDoUpdate({
              target:
                columns.metric === null
                  ? [stepMeasure.workItemId, stepMeasure.stepId, stepMeasure.measureId]
                  : [stepMeasure.workItemId, stepMeasure.stepId, stepMeasure.metric],
              // The basis is part of the figure: a rewrite under another card,
              // or with none, replaces it (design D43).
              // Proof: with the basis left out of this update, the SQLite
              // certification's `measures.set:basis` read the first card after
              // a rewrite under another (watched 2026-10-23).
              set: {
                value: kept.value,
                recordedAt: kept.recordedAt,
                ...basis,
                ...auditOnUpdate(act),
              },
            })
            .run();
          bumpWorkItems(tx, [kept.workItemId], act);
        return 'written';
      }),
    ));
  }

  async remove(
    workItemId: string,
    stepId: string,
    metric: string,
    stamp: WriteStamp,
  ): Promise<void> {
    await this.gate.enter(async () => {
      // All three parts of the key, not one or two: the primary key is (work
      // item, step, metric). Narrowing to the step would clear it across the whole
      // database, and narrowing to the pair would take the hours away with the
      // tokens. `step-measure.test.ts` keeps a survivor for each of the three so
      // none of those three mistakes can pass — the guard `actual.test.ts` keeps
      // for its two halves, with the third the discriminator adds.
      await Promise.resolve();
      this.db.transaction((tx) => {
        const named = factCondition(tx, workItemId, stepId, metric);
        if (named !== undefined) tx.delete(stepMeasure).where(named).run();
        bumpWorkItems(tx, [workItemId], stamp);
      });
    });
  }

  /**
   * Both work items move when anything moved, for `ActualRepository.moveAll`'s
   * reason: one lost every measure it held and the other gained them, and a
   * reader of either sees different figures afterwards.
   *
   * **The bump is conditional**, the shape `actual-days` 2.2 established and for
   * a reason that is stronger here than there. This runs on **every** create
   * that gives a leaf its first child, beside the estimate and actual moves, and
   * a plan holding measures is rarer still than one holding actuals: an
   * unconditional bump would move two revisions on a write that touched no row
   * of this table, and every reader's precondition on that parent would go stale
   * for a change that did not happen.
   *
   * Not a read-then-write: `changes()` reports what the statement in this
   * transaction just did, so a row written by somebody else a moment earlier is
   * inside the `UPDATE` and inside the count.
   */
  async moveAll(fromWorkItemId: string, toWorkItemId: string, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((tx) => {
        tx.update(stepMeasure)
          .set({ workItemId: toWorkItemId, ...auditOnUpdate(stamp) })
          .where(eq(stepMeasure.workItemId, fromWorkItemId))
          .run();
        if (rowsChanged(tx, 'moving measures') === 0) return;
        bumpWorkItems(tx, [fromWorkItemId, toWorkItemId], stamp);
      });
    });
  }
}

