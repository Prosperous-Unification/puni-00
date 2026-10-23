import type {
  MeasureEstimateStore,
  StepStore,
  StoredMeasureEstimate,
  WorkItemStore,
} from '@wbs/core';
import { type MeasureDefinition, TOKEN_ESTIMATE_KEY } from '@wbs/domain';

import type { MemoryMeasureTable } from './measure-fixture';
import { compareValueGroupIds } from './value-group-placement';

/** The trios held apart from the legacy measure rows: every one but a single-point tokens trio. */
export interface MemoryMeasureEstimateTable {
  readonly rows: StoredMeasureEstimate[];
}
export function memoryMeasureEstimateTable(): MemoryMeasureEstimateTable {
  return { rows: [] };
}

const LEGACY_TOKEN_ESTIMATE = 'token_estimate';

/**
 * A MeasureEstimateStore over an array, beside the source's measure table.
 *
 * **The single-point tokens trio is derived, not stored** (design D28). SQLite
 * keeps a copy in `measure_estimate` in step with every legacy
 * `token_estimate` row by triggers; this fixture reads each such row of
 * `measures` as a single-point `tokens` trio instead, so a legacy row written
 * by any path (a restore, a duplicate, an import, the measure store itself)
 * reads exactly as on SQLite without a second copy to keep in step. The array
 * holds every other trio, a three-point tokens one included; a tokens pair
 * never has both, because each write path removes the other.
 *
 * `definitionsOf` answers the owning organization's definitions, or null for
 * an unowned project, whose one estimable key is `tokens` (design D19).
 */
export function inMemoryMeasureEstimates(
  workItems: WorkItemStore,
  measures: MemoryMeasureTable,
  table: MemoryMeasureEstimateTable = memoryMeasureEstimateTable(),
  steps?: StepStore,
  definitionsOf: (projectId: string) => MeasureDefinition[] | null = () => null,
): MeasureEstimateStore {
  const { rows } = table;
  const samePair = (
    row: { workItemId: string; stepId: string },
    workItemId: string,
    stepId: string,
  ): boolean => row.workItemId === workItemId && row.stepId === stepId;
  const removeLegacyRow = (workItemId: string, stepId: string): void => {
    const kept = measures.rows.filter(
      (row) => !(samePair(row, workItemId, stepId) && row.metric === LEGACY_TOKEN_ESTIMATE),
    );
    measures.rows.splice(0, measures.rows.length, ...kept);
  };
  const removeStored = (workItemId: string, stepId: string, key: string): void => {
    const kept = rows.filter((row) => !(samePair(row, workItemId, stepId) && row.key === key));
    rows.splice(0, rows.length, ...kept);
  };

  return {
    async listByProject(projectId) {
      const ids = new Set((await workItems.listByProject(projectId)).map((w) => w.id));
      const derived: StoredMeasureEstimate[] = measures.rows
        .filter((row) => ids.has(row.workItemId) && row.metric === LEGACY_TOKEN_ESTIMATE)
        .map((row) => ({
          workItemId: row.workItemId,
          stepId: row.stepId,
          key: TOKEN_ESTIMATE_KEY,
          optimistic: row.value,
          realistic: row.value,
          pessimistic: row.value,
          singlePoint: true,
        }));
      const position = new Map(
        ((await steps?.listByProject(projectId)) ?? []).map((step) => [step.id, step.position]),
      );
      return [...rows.filter((row) => ids.has(row.workItemId)), ...derived].sort(
        (left, right) =>
          compareValueGroupIds(left.workItemId, right.workItemId) ||
          (position.get(left.stepId) ?? 0) - (position.get(right.stepId) ?? 0) ||
          left.stepId.localeCompare(right.stepId) ||
          left.key.localeCompare(right.key),
      );
    },
    async set(estimate, stamp) {
      const { workItemId, stepId, key, optimistic, realistic, pessimistic, singlePoint } = estimate;
      // SQLite's CHECKs refuse the same rows.
      if (!(0 <= optimistic && optimistic <= realistic && realistic <= pessimistic))
        throw new Error(`measure estimate ${workItemId}/${stepId}/${key} is not ordered`);
      if (
        singlePoint &&
        !(key === TOKEN_ESTIMATE_KEY && optimistic === realistic && realistic === pessimistic)
      )
        throw new Error(`measure estimate ${workItemId}/${stepId}/${key} is not a single point`);
      const owner = await workItems.findById(workItemId);
      if (owner === null) throw new Error(`measure estimate names absent work item ${workItemId}`);
      const held = definitionsOf(owner.projectId);
      // Proof: with this check removed, the memory certification's
      // `measureEstimates.set:defined-key` stored `story_points`; watched 2026-10-23.
      if (held === null ? key !== TOKEN_ESTIMATE_KEY : !held.some((each) => each.key === key))
        throw new Error(
          `measure ${key} is not defined by the organization owning work item ${workItemId}`,
        );
      if (singlePoint) {
        // The legacy row is the single-point trio (design D28).
        removeStored(workItemId, stepId, key);
        // In place when the row exists, as SQLite's upsert keeps it.
        const legacy = {
          workItemId,
          stepId,
          metric: LEGACY_TOKEN_ESTIMATE,
          value: optimistic,
          recordedAt: stamp.at,
        };
        const held = measures.rows.findIndex(
          (row) => samePair(row, workItemId, stepId) && row.metric === LEGACY_TOKEN_ESTIMATE,
        );
        if (held === -1) measures.rows.push(legacy);
        else measures.rows.splice(held, 1, legacy);
        return 'written' as const;
      }
      removeStored(workItemId, stepId, key);
      rows.push(structuredClone({ ...estimate, singlePoint: false }));
      // A three-point write retires the legacy figure, as SQLite's store does.
      // Proof: with this removal skipped, the memory certification's
      // `measureEstimates.set:three-point-clears-flag` read the single-point
      // trio back beside the three-point one; watched 2026-10-23.
      if (key === TOKEN_ESTIMATE_KEY) removeLegacyRow(workItemId, stepId);
      return 'written' as const;
    },
    remove(workItemId, stepId, key, _stamp) {
      removeStored(workItemId, stepId, key);
      if (key === TOKEN_ESTIMATE_KEY) removeLegacyRow(workItemId, stepId);
      return Promise.resolve();
    },
    moveAll(fromWorkItemId, toWorkItemId, _stamp) {
      const moved = rows.map((row) =>
        row.workItemId === fromWorkItemId ? { ...row, workItemId: toWorkItemId } : row,
      );
      rows.splice(0, rows.length, ...moved);
      return Promise.resolve();
    },
  };
}

/**
 * Takes the stored tokens trio off a pair the legacy `token_estimate` row is
 * being written on: the memory twin of SQLite's
 * `step_measure_mirrors_token_estimate`, which overwrites a three-point trio
 * with the legacy figure (design D28).
 */
export function retireTokensTrio(
  table: MemoryMeasureEstimateTable | undefined,
  workItemId: string,
  stepId: string,
): void {
  if (table === undefined) return;
  const kept = table.rows.filter(
    (row) =>
      !(row.workItemId === workItemId && row.stepId === stepId && row.key === TOKEN_ESTIMATE_KEY),
  );
  table.rows.splice(0, table.rows.length, ...kept);
}
