import type {
  Step,
  StepBlockageStore,
  StepStore,
  StoredStepBlockage,
  WorkItem,
  WorkItemStore,
} from '@wbs/core';

/** Mutable sparse table used by fixture snapshots and corruption tests. */
export interface MemoryStepBlockageTable {
  readonly rows: StoredStepBlockage[];
}
export function memoryStepBlockageTable(): MemoryStepBlockageTable {
  return { rows: [] };
}

/**
 * Pair-keyed blockage fixture with the SQLite ownership/read rules. Like the
 * progress fixture it models fact values, not SQL audit/revision transactions.
 */
export function inMemoryStepBlockages(
  workItems: WorkItemStore,
  steps: StepStore,
  table = memoryStepBlockageTable(),
): StepBlockageStore {
  const { rows } = table;
  const validateNode = async (
    blockage: StoredStepBlockage,
    owner: WorkItem,
    step: Step,
  ): Promise<void> => {
    // Proof: project guard removed; cross-project fixture negative failed; watched 2026-10-13.
    if (step.projectId !== owner.projectId)
      throw new Error('step blockage has an invalid step reference');
    // Proof: leaf guard removed; parent-owner fixture negatives failed; watched 2026-10-13.
    if ((await workItems.listByProject(owner.projectId)).some((row) => row.parentId === owner.id))
      throw new Error('step blockage owner is not a leaf');
    // Proof: time guard removed; malformed timestamp fixture negative failed; watched 2026-10-13.
    if (!Number.isSafeInteger(blockage.blockedAt))
      throw new Error('step blockage has an invalid blocked time');
  };
  const read = async (
    projectId: string,
    ids?: readonly string[],
  ): Promise<StoredStepBlockage[]> => {
    const selected: { blockage: StoredStepBlockage; position: number }[] = [];
    for (const blockage of rows) {
      if (ids !== undefined && !ids.includes(blockage.workItemId)) continue;
      const owner = await workItems.findById(blockage.workItemId);
      // Proof: owner guard removed independently in read/set/transfer; named reference negatives failed; watched 2026-10-13.
      if (owner === null) throw new Error('step blockage has an invalid work-item reference');
      if (owner.projectId !== projectId) continue;
      const step = await steps.findById(blockage.stepId);
      // Proof: step guard removed independently in read/set/transfer; missing-step negatives failed; watched 2026-10-13.
      if (step === null) throw new Error('step blockage has an invalid step reference');
      await validateNode(blockage, owner, step);
      selected.push({ blockage, position: step.position });
    }
    return selected
      .sort(
        (left, right) =>
          left.blockage.workItemId.localeCompare(right.blockage.workItemId) ||
          left.position - right.position ||
          left.blockage.stepId.localeCompare(right.blockage.stepId),
      )
      .map(({ blockage }) => ({ ...blockage }));
  };
  return {
    listByProject: (projectId) => read(projectId),
    listByWorkItems: (projectId, ids) => read(projectId, ids),
    async set(blockage, _stamp) {
      const step = await steps.findById(blockage.stepId);
      // Proof: step guard removed independently in read/set/transfer; missing-step negatives failed; watched 2026-10-13.
      if (step === null) return 'unknown_step';
      const owner = await workItems.findById(blockage.workItemId);
      // Proof: owner guard removed independently in read/set/transfer; named reference negatives failed; watched 2026-10-13.
      if (owner === null) throw new Error('step blockage has an invalid work-item reference');
      await validateNode(blockage, owner, step);
      const kept = rows.filter(
        (row) => row.workItemId !== blockage.workItemId || row.stepId !== blockage.stepId,
      );
      rows.splice(0, rows.length, ...kept, { ...blockage });
      return 'written';
    },
    remove(workItemId, stepId, _stamp) {
      rows.splice(
        0,
        rows.length,
        ...rows.filter((row) => row.workItemId !== workItemId || row.stepId !== stepId),
      );
      return Promise.resolve();
    },
    async moveAll(fromWorkItemId, toWorkItemId, _stamp) {
      const transferred = rows
        .filter((row) => row.workItemId === fromWorkItemId)
        .map((row) => ({ ...row, workItemId: toWorkItemId }));
      for (const blockage of transferred) {
        const owner = await workItems.findById(toWorkItemId);
        const step = await steps.findById(blockage.stepId);
        // Proof: owner guard removed independently in read/set/transfer; named reference negatives failed; watched 2026-10-13.
        if (owner === null) throw new Error('step blockage has an invalid work-item reference');
        // Proof: step guard removed independently in read/set/transfer; missing-step negatives failed; watched 2026-10-13.
        if (step === null) throw new Error('step blockage has an invalid step reference');
        await validateNode(blockage, owner, step);
        // Proof: collision guard removed; atomic duplicate-transfer negative failed; watched 2026-10-13.
        if (rows.some((row) => row.workItemId === toWorkItemId && row.stepId === blockage.stepId))
          throw new Error('duplicate step blockage');
      }
      rows.splice(
        0,
        rows.length,
        ...rows.filter((row) => row.workItemId !== fromWorkItemId),
        ...transferred,
      );
    },
  };
}
