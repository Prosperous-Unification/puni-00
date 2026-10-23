import type {
  MeasureEstimateStore,
  StepWriteOutcome,
  StoredMeasureEstimate,
  WriteStamp,
} from '@wbs/core';
import { TOKEN_ESTIMATE_KEY } from '@wbs/domain';
import { and, eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import { rowsChanged } from './changes';
import type { Gate } from './gate';
import { bumpWorkItems } from './revision';
import { measureEstimate, projectOrganization, step, stepMeasure, workItem } from './schema';
import { measureIdFor } from './step-measure';
import { writingStep } from './step-reference';

const LEGACY_TOKEN_ESTIMATE = 'token_estimate';

/**
 * The trios in measures other than time (`wbs-measure-budgets` D3), a
 * satellite of their work item exactly as {@link StepMeasureRepository}'s
 * facts are: every write moves that work item's revision in its own
 * transaction.
 *
 * **A single-point tokens trio is written as its legacy row** (design D28):
 * {@link set} upserts the `token_estimate` row of `step_measure`, and
 * `step_measure_mirrors_token_estimate_insert` writes the trio in the same
 * statement, exactly as it does for the outgoing release's writes. A
 * three-point trio is written here and the legacy row deleted, which the
 * delete trigger lets pass because the trio is no longer single-point.
 */
export class MeasureEstimateRepository implements MeasureEstimateStore {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /** Every trio in the project, in work item, step position and key order. */
  async listByProject(projectId: string): Promise<StoredMeasureEstimate[]> {
    await Promise.resolve();
    return (
      this.db
        .select({
          workItemId: measureEstimate.workItemId,
          stepId: measureEstimate.stepId,
          key: measureEstimate.measureKey,
          optimistic: measureEstimate.optimistic,
          realistic: measureEstimate.realistic,
          pessimistic: measureEstimate.pessimistic,
          singlePoint: measureEstimate.singlePoint,
        })
        .from(measureEstimate)
        // Inner joins: both columns are foreign keys.
        .innerJoin(step, eq(measureEstimate.stepId, step.id))
        .innerJoin(workItem, eq(measureEstimate.workItemId, workItem.id))
        .where(eq(workItem.projectId, projectId))
        .orderBy(
          measureEstimate.workItemId,
          step.position,
          measureEstimate.stepId,
          measureEstimate.measureKey,
        )
        .all()
    );
  }

  /**
   * Writes one trio, replacing any earlier one in its key.
   *
   * @throws when the key names no definition of the owning organization (or,
   * unowned, is not `tokens`), or when `singlePoint` is set on anything but an
   * equal tokens trio: the service decided both inside this unit of work.
   */
  async set(estimate: StoredMeasureEstimate, stamp: WriteStamp): Promise<StepWriteOutcome> {
    const { workItemId, stepId, key, optimistic, realistic, pessimistic, singlePoint } = estimate;
    return await writingStep(this.db, stepId, async () => {
      await this.gate.enter(async () => {
        await Promise.resolve();
        this.db.transaction((tx) => {
          const measureId = this.referenceOf(tx, workItemId, key);
          if (singlePoint) {
            // The CHECK `measure_estimate_single_point` holds the trio's half;
            // the legacy row would otherwise carry a figure the trio does not.
            if (!(
              key === TOKEN_ESTIMATE_KEY &&
              optimistic === realistic &&
              realistic === pessimistic
            ))
              throw new Error(
                `measure estimate ${workItemId}/${stepId}/${key} is not a single point`,
              );
            tx.insert(stepMeasure)
              .values({
                workItemId,
                stepId,
                metric: LEGACY_TOKEN_ESTIMATE,
                measureId: null,
                value: optimistic,
                recordedAt: stamp.at,
                ...auditOnCreate(stamp),
              })
              .onConflictDoUpdate({
                target: [stepMeasure.workItemId, stepMeasure.stepId, stepMeasure.metric],
                set: { value: optimistic, recordedAt: stamp.at, ...auditOnUpdate(stamp) },
              })
              .run();
          } else {
            tx.insert(measureEstimate)
              .values({
                workItemId,
                stepId,
                measureKey: key,
                measureId,
                optimistic,
                realistic,
                pessimistic,
                singlePoint: false,
                ...auditOnCreate(stamp),
              })
              .onConflictDoUpdate({
                target: [
                  measureEstimate.workItemId,
                  measureEstimate.stepId,
                  measureEstimate.measureKey,
                ],
                set: {
                  optimistic,
                  realistic,
                  pessimistic,
                  singlePoint: false,
                  ...auditOnUpdate(stamp),
                },
              })
              .run();
            // A three-point write retires the legacy figure; the delete trigger
            // leaves this trio, which is no longer single-point.
            // Proof: with this delete skipped, the SQLite certification's
            // `measureEstimates.set:three-point-clears-flag` read the legacy
            // row still in the measures; watched 2026-10-23.
            if (key === TOKEN_ESTIMATE_KEY) this.deleteLegacyRow(tx, workItemId, stepId);
          }
          bumpWorkItems(tx, [workItemId], stamp);
        });
      });
    });
  }

  async remove(workItemId: string, stepId: string, key: string, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((tx) => {
        if (key === TOKEN_ESTIMATE_KEY) this.deleteLegacyRow(tx, workItemId, stepId);
        tx.delete(measureEstimate)
          .where(
            and(
              eq(measureEstimate.workItemId, workItemId),
              eq(measureEstimate.stepId, stepId),
              eq(measureEstimate.measureKey, key),
            ),
          )
          .run();
        bumpWorkItems(tx, [workItemId], stamp);
      });
    });
  }

  /**
   * Moves every trio of one work item to another; the bump is conditional,
   * for `StepMeasureRepository.moveAll`'s reason. A single-point tokens trio
   * may already have moved with its legacy row through the update trigger.
   */
  async moveAll(fromWorkItemId: string, toWorkItemId: string, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((tx) => {
        tx.update(measureEstimate)
          .set({ workItemId: toWorkItemId, ...auditOnUpdate(stamp) })
          .where(eq(measureEstimate.workItemId, fromWorkItemId))
          .run();
        if (rowsChanged(tx, 'moving measure estimates') === 0) return;
        bumpWorkItems(tx, [fromWorkItemId, toWorkItemId], stamp);
      });
    });
  }

  /**
   * The definition id a trio in `key` references: the owning organization's,
   * or null for `tokens` on a project no organization owns.
   *
   * @throws when an owned project's organization defines no such key, or an
   * unowned project's trio is in anything but tokens.
   */
  private referenceOf(tx: SQLiteBunDatabase, workItemId: string, key: string): string | null {
    const resolved = measureIdFor(tx, workItemId, key);
    if (resolved !== null) return resolved;
    const owned = tx
      .select({ organizationId: projectOrganization.organizationId })
      .from(workItem)
      .innerJoin(projectOrganization, eq(projectOrganization.resourceId, workItem.projectId))
      .where(eq(workItem.id, workItemId))
      .get();
    // Proof: with this throw removed, the SQLite certification's
    // `measureEstimates.set:defined-key` stored `story_points` unkeyed;
    // watched 2026-10-23.
    if (owned !== undefined || key !== TOKEN_ESTIMATE_KEY)
      throw new Error(
        `measure ${key} is not defined by the organization owning work item ${workItemId}`,
      );
    return null;
  }

  private deleteLegacyRow(tx: SQLiteBunDatabase, workItemId: string, stepId: string): void {
    tx.delete(stepMeasure)
      .where(
        and(
          eq(stepMeasure.workItemId, workItemId),
          eq(stepMeasure.stepId, stepId),
          eq(stepMeasure.metric, LEGACY_TOKEN_ESTIMATE),
        ),
      )
      .run();
  }
}
