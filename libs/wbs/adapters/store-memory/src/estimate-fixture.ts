import type { EstimateStore, StoredEstimate, WorkItemStore } from '@wbs/core';

import { readMemoryEstimatesIn } from './estimate-reads';
import { type MemoryStepWriteContext, readMemoryStepWriteIn } from './step-write';
import { listValueGroupPlacements } from './value-group-placement';

/** An EstimateStore backed by an array, keyed as the composite primary key is. */
export function inMemoryEstimates(
  workItems: WorkItemStore,
  context: MemoryStepWriteContext,
  table: MemoryEstimateTable = memoryEstimateTable(),
): EstimateStore {
  const { rows } = table;
  /**
   * Every stamp this store was handed, in call order, so a service test can
   * assert who wrote and when without a database to read audit columns from.
   */

  return {
    async readTarget(workItemId, stepId) {
      return await Promise.resolve(readMemoryStepWriteIn(context, workItemId, stepId));
    },
    async listByWorkPackage(workPackageId) {
      return await Promise.resolve(readMemoryEstimatesIn(context, rows, workPackageId, null));
    },
    async listByWorkItems(workPackageId, workItemIds) {
      return await Promise.resolve(
        readMemoryEstimatesIn(context, rows, workPackageId, workItemIds),
      );
    },
    listPlacements: (workPackageId, ids) =>
      listValueGroupPlacements(rows, workPackageId, ids, workItems),
    async set(toSet, _stamp) {
      const keptValue = structuredClone(toSet);
      const decision = readMemoryStepWriteIn(context, keptValue.workItemId, keptValue.stepId);
      // Proof: W_MEM removes this refusal; both post-unbind estimate owners return written.
      if (decision.kind !== 'resolved') return await Promise.resolve(decision.kind);
      const kept = rows.filter(
        (row) => !(row.workItemId === keptValue.workItemId && row.stepId === keptValue.stepId),
      );
      rows.splice(0, rows.length, ...kept, keptValue);
      return await Promise.resolve<'written'>('written');
    },
    remove(workItemId, stepId, _stamp) {
      const kept = rows.filter((row) => !(row.workItemId === workItemId && row.stepId === stepId));
      rows.splice(0, rows.length, ...kept);
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

export interface MemoryEstimateTable {
  readonly rows: StoredEstimate[];
}
export function memoryEstimateTable(): MemoryEstimateTable {
  return { rows: [] };
}
