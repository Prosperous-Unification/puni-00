import type { StepParallelStore, StepStore, StoredStepParallel, WorkItemStore } from '@wbs/core';
import { assertStepParallel } from '@wbs/domain';

/** Cloneable sparse facts owned by the memory source. */
export interface MemoryStepParallelTable {
  readonly rows: StoredStepParallel[];
}
export function memoryStepParallelTable(): MemoryStepParallelTable {
  return { rows: [] };
}

/** Refuses malformed trusted facts on writes and reads, retaining absent versus explicit values. */
export function inMemoryStepParallels(
  workItems: WorkItemStore,
  steps: Pick<StepStore, 'findById'>,
  table = memoryStepParallelTable(),
): StepParallelStore {
  const validateNode = async (parallel: StoredStepParallel) => {
    // Proof: range validation removed; real memory-source invalid writes were accepted, 2026-10-15.
    assertStepParallel(parallel.maxParallel);
    const owner = await workItems.findById(parallel.workItemId);
    // Proof: write-owner guard removed; trusted-reference write negative failed, 2026-10-15.
    if (owner === null) throw new Error('step parallelism has an invalid work-item reference');
    const step = await steps.findById(parallel.stepId);
    // Proof: step guard removed; corrupt-step read negative failed, 2026-10-15.
    if (step === null) throw new Error('step parallelism has an invalid step reference');
    // Proof: project guard removed; corrupt-project read negative failed, 2026-10-15.
    if (step.projectId !== owner.projectId) throw new Error('step parallelism project mismatch');
    // Proof: leaf guard removed; corrupt-leaf read negative failed, 2026-10-15.
    if ((await workItems.listByProject(owner.projectId)).some((row) => row.parentId === owner.id))
      throw new Error('step parallelism owner is not a leaf');
    return { projectId: owner.projectId, position: step.position };
  };
  const compareIds = (left: string, right: string): number =>
    left < right ? -1 : left > right ? 1 : 0;
  const readParallels = async (projectId: string, ids?: readonly string[]) => {
    const selected: { parallel: StoredStepParallel; position: number }[] = [];
    const seen = new Set<string>();
    for (const parallel of table.rows) {
      if (ids !== undefined && !ids.includes(parallel.workItemId)) continue;
      const owner = await workItems.findById(parallel.workItemId);
      // Proof: read-owner guard removed; missing-owner read received TypeError, failing its trusted-reference assertion, 2026-10-15.
      if (owner === null) throw new Error('step parallelism has an invalid work-item reference');
      if (owner.projectId !== projectId) continue;
      const { position } = await validateNode(parallel);
      const key = JSON.stringify([parallel.workItemId, parallel.stepId]);
      // Proof: duplicate guard removed; duplicate retained-pair read negative failed, 2026-10-15.
      if (seen.has(key)) throw new Error('duplicate step parallelism');
      seen.add(key);
      selected.push({ parallel, position });
    }
    return selected
      .sort(
        (left, right) =>
          compareIds(left.parallel.workItemId, right.parallel.workItemId) ||
          left.position - right.position ||
          compareIds(left.parallel.stepId, right.parallel.stepId),
      )
      .map(({ parallel }) => ({ ...parallel }));
  };
  return {
    listByProject: (projectId) => readParallels(projectId),
    listByWorkItems: (projectId, ids) => readParallels(projectId, ids),
    async set(parallel, _stamp) {
      await validateNode(parallel);
      const kept = table.rows.filter(
        (row) => row.workItemId !== parallel.workItemId || row.stepId !== parallel.stepId,
      );
      table.rows.splice(0, table.rows.length, ...kept, { ...parallel });
    },
    remove(workItemId, stepId, _stamp) {
      const kept = table.rows.filter(
        (row) => row.workItemId !== workItemId || row.stepId !== stepId,
      );
      table.rows.splice(0, table.rows.length, ...kept);
      return Promise.resolve();
    },
  };
}
