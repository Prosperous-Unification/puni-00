import type { StepProgressStore, StoredProgress, WorkItemStore } from '@wbs/core';

import { readStoredProgress } from '@wbs/core';
import { readMemoryStepFactsIn } from './estimate-reads';
import {type MemoryStepWriteContext,readMemoryStepWriteIn} from './step-write';
import { listValueGroupPlacements } from './value-group-placement';

/** A StepProgressStore backed by an array, keyed as the composite primary key is. */
export function inMemoryProgress(
  workItems: WorkItemStore,
  context:MemoryStepWriteContext,
  table:MemoryProgressTable,
): StepProgressStore {
  const { rows } = table;
  /**
   * Every stamp this store was handed, in call order, so a service test can
   * assert who wrote and when without a database to read audit columns from.
   */

  return {
    async listByWorkPackage(workPackageId){return await Promise.resolve(readMemoryStepFactsIn(context,rows,workPackageId,null,readStoredProgress,'progress'));},
    async listByWorkItems(workPackageId,ids){return await Promise.resolve(readMemoryStepFactsIn(context,rows,workPackageId,ids,readStoredProgress,'progress'));},
    listPlacements: (workPackageId, ids) =>
      listValueGroupPlacements(rows, workPackageId, ids, workItems),
    async set(toSet,_stamp){
      const keptValue=structuredClone(toSet);
      const decision=readMemoryStepWriteIn(context,keptValue.workItemId,keptValue.stepId);
      // Proof: removing this refusal made memory stepCatalogue.pointWrite:progress-untyped
      // return written for an unresolved step after its healthy typed write/read/remove.
      // Restoring the guard returned the same isolated owner to passing.
      if(decision.kind!=='resolved')return await Promise.resolve(decision.kind);
      const kept=rows.filter(row=>!(row.workItemId===keptValue.workItemId&&row.stepId===keptValue.stepId));
      rows.splice(0,rows.length,...kept,keptValue);
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

export interface MemoryProgressTable {
  readonly rows: StoredProgress[];
}
export function memoryProgressTable(): MemoryProgressTable {
  return { rows: [] };
}
