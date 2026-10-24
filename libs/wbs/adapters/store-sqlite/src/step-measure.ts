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
import { listMeasuresIn } from './measure-definition';
import { bumpWorkItems } from './revision';
import { measure, projectOrganization, step, stepMeasure, workItem } from './schema';
import { writingStep } from './step-reference';

/**
 * A row's metric as every reader sees it (`wbs-measure-budgets` D4, design
 * D18): the legacy name when the row has one, else its definition's key.
 * Read through a left join on `measure`, so a row keyed to nothing and named
 * nothing reads NULL, which `step_measure_addressed` makes unstorable.
 */
// Proof: with `metric` read alone, the SQLite certification's
// `measures.set:defined-key` read a NULL metric for the gpu fact; watched 2026-10-23.
const METRIC_OF_ROW = sql<string | null>`coalesce(${stepMeasure.metric}, ${measure.key})`;

/**
 * The id of the definition keyed `key` in the organization owning the work
 * item's project, or null when no organization owns it or it defines no such
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
      .innerJoin(projectOrganization, eq(projectOrganization.resourceId, workItem.projectId))
      .innerJoin(
        measure,
        and(eq(measure.organizationId, projectOrganization.organizationId), eq(measure.key, key)),
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
 * @throws when a defined metric names no definition of the project's
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
 * name, or the definition the key names in the project's organization. A key
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
 * {@link listByProject} hands back every metric because the roll-up folds all
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

  /**
   * Every measure in the project, **in step order** within each work item and in
   * metric order within each pair.
   *
   * Ordered for `ActualRepository.listByProject`'s reasons — floating-point
   * addition is not associative, so the order decides the last bit of a parent's
   * roll-up, and two reads of an unchanged plan must not disagree about the
   * order of a row's steps on screen — plus one this table is the first to need:
   * a pair may hold three rows, so the steps alone are not a total order.
   * `metric` breaks that tie by its stored text, which is arbitrary but fixed.
   */
  async listByProject(projectId: string): Promise<StoredMeasure[]> {
    await Promise.resolve();
    return (
      this.db
        .select({
          workItemId: stepMeasure.workItemId,
          stepId: stepMeasure.stepId,
          metric: METRIC_OF_ROW,
          value: stepMeasure.value,
          recordedAt: stepMeasure.recordedAt,
          currency: stepMeasure.currency,
          rateCardDigest: stepMeasure.rateCardDigest,
        })
        .from(stepMeasure)
        .leftJoin(measure, eq(stepMeasure.measureId, measure.id))
        // Inner rather than left: `step_measure.step_id` is a foreign key, so a
        // measure whose step is gone cannot exist — `StepRepository.remove`
        // deletes them in the same transaction as the step (task 6.3).
        .innerJoin(step, eq(stepMeasure.stepId, step.id))
        // And the work item, so the project is asked for in the statement that
        // reads the rows. This was two queries until 2026-09-02 — every work item
        // id, then `IN (…)` over the lot — which put one bound parameter per row
        // into the read, four times over per plan read. Inner again, and for the
        // same reason: `workItemId` is a foreign key.
        .innerJoin(workItem, eq(stepMeasure.workItemId, workItem.id))
        .where(eq(workItem.projectId, projectId))
        .orderBy(stepMeasure.workItemId, step.position, stepMeasure.stepId, METRIC_OF_ROW)
        .all()
        .map(({ currency, rateCardDigest, ...row }) => ({
          ...row,
          metric: metricOrThrow(row),
          ...basisOf(currency, rateCardDigest),
        }))
    );
  }

  async listByWorkItems(projectId: string, ids: readonly string[]): Promise<StoredMeasure[]> {
    if (ids.length === 0) return [];
    await Promise.resolve();
    const rows = await this.db
      .select({
        workItemId: stepMeasure.workItemId,
        stepId: stepMeasure.stepId,
        metric: METRIC_OF_ROW,
        storedMetric: stepMeasure.metric,
        value: stepMeasure.value,
        recordedAt: stepMeasure.recordedAt,
        currency: stepMeasure.currency,
        rateCardDigest: stepMeasure.rateCardDigest,
        workItemProjectId: workItem.projectId,
        stepProjectId: step.projectId,
        stepPosition: step.position,
      })
      .from(stepMeasure)
      .leftJoin(measure, eq(stepMeasure.measureId, measure.id))
      .leftJoin(step, eq(stepMeasure.stepId, step.id))
      .leftJoin(workItem, eq(stepMeasure.workItemId, workItem.id))
      .where(
        and(
          inArray(stepMeasure.workItemId, [...ids]),
          or(eq(workItem.projectId, projectId), isNull(workItem.projectId)),
        ),
      )
      .orderBy(stepMeasure.workItemId, step.position, stepMeasure.stepId, METRIC_OF_ROW);
    if (rows.some(({ workItemProjectId }) => workItemProjectId === null)) {
      throw new Error('targeted measure has an invalid work-item reference');
    }
    const admitted = rows.filter(({ workItemProjectId }) => workItemProjectId === projectId);
    for (const row of admitted) {
      if (row.stepProjectId !== projectId || row.stepPosition === null) {
        throw new Error(`measure ${row.workItemId}/${row.stepId} has an invalid step reference`);
      }
      // The column holds legacy names alone (`role_measure_metric`), so any
      // other stored text bypassed the constraint.
      // Proof: with the stored-metric test removed, `rejects malformed measure
      // metrics after constraint-bypassing corruption` (targeted-readers.db.test.ts)
      // resolved; watched 2026-10-23.
      if (
        typeof row.metric !== 'string' ||
        (row.storedMetric !== null && !isLegacyMetric(row.storedMetric))
      ) {
        throw new Error(`measure ${row.workItemId}/${row.stepId} has an invalid metric`);
      }
      if (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < 0) {
        throw new Error(`measure ${row.workItemId}/${row.stepId} has an invalid value`);
      }
      if (typeof row.recordedAt !== 'number' || !Number.isFinite(row.recordedAt)) {
        throw new Error(`measure ${row.workItemId}/${row.stepId} has an invalid recorded time`);
      }
    }
    return admitted.map((row) => ({
      workItemId: row.workItemId,
      stepId: row.stepId,
      metric: metricOrThrow(row),
      value: row.value,
      recordedAt: row.recordedAt,
      ...basisOf(row.currency, row.rateCardDigest),
    }));
  }

  /**
   * The definitions of the organization owning the project, through
   * `project_organization`, or null when no organization owns it (a store
   * from before organizations, or a legacy project no bridge has mapped).
   */
  async definitionsFor(projectId: string): Promise<MeasureDefinition[] | null> {
    await Promise.resolve();
    const owner = this.db
      .select({ organizationId: projectOrganization.organizationId })
      .from(projectOrganization)
      .where(eq(projectOrganization.resourceId, projectId))
      .get();
    return owner === undefined ? null : listMeasuresIn(this.db, owner.organizationId);
  }

  async listPlacements(projectId: string, ids: readonly string[]) {
    if (ids.length === 0) return [];
    const afterId = sql<string | null>`(
      SELECT predecessor.work_item_id FROM step_measure AS predecessor
      WHERE predecessor.work_item_id < ${stepMeasure.workItemId}
        AND EXISTS (
          SELECT 1 FROM work_item AS predecessor_owner
          WHERE predecessor_owner.id = predecessor.work_item_id
            AND predecessor_owner.project_id = ${projectId}
        )
      ORDER BY predecessor.work_item_id DESC LIMIT 1
    )`;
    return this.db
      .selectDistinct({ id: stepMeasure.workItemId, afterId })
      .from(stepMeasure)
      .innerJoin(workItem, eq(stepMeasure.workItemId, workItem.id))
      .where(and(eq(workItem.projectId, projectId), inArray(stepMeasure.workItemId, [...ids])))
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
    return await writingStep(this.db, toSet.stepId, async () => {
      await this.gate.enter(async () => {
        await Promise.resolve();
        this.db.transaction((tx) => {
          const columns = storedColumnsOf(tx, toSet);
          // A legacy metric conflicts on its name, a defined one on its
          // definition: the two unique indexes `step_measure_metric_key` and
          // `step_measure_measure_key`, one per way a row is addressed.
          const basis = basisColumns(toSet.basis);
          tx.insert(stepMeasure)
            .values({
              workItemId: toSet.workItemId,
              stepId: toSet.stepId,
              value: toSet.value,
              recordedAt: toSet.recordedAt,
              ...columns,
              ...basis,
              ...auditOnCreate(stamp),
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
                value: toSet.value,
                recordedAt: toSet.recordedAt,
                ...basis,
                ...auditOnUpdate(stamp),
              },
            })
            .run();
          bumpWorkItems(tx, [toSet.workItemId], stamp);
        });
      });
    });
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

function metricOrThrow(row: { workItemId: string; stepId: string; metric: string | null }): string {
  // `step_measure_addressed` and the `measure_id` foreign key make a row with
  // neither a name nor a definition unstorable; one here is drifted state.
  // Proof: with this check made to pass, `rejects a stored fact naming
  // neither a metric nor a definition after constraint-bypassing corruption`
  // (targeted-readers.db.test.ts) resolved; watched 2026-10-24.
  if (row.metric === null)
    throw new Error(`measure ${row.workItemId}/${row.stepId} names no metric and no definition`);
  return row.metric;
}
