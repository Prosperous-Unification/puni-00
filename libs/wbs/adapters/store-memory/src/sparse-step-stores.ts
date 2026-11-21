import {
  projectStoredStepFacts,
  readStoredBlockage,
  readStoredParallel,
  type StepBlockageStore,
  type StepFactAddress,
  type StepParallelStore,
} from '@wbs/core';

import { captureMemoryStepFactContextIn } from './estimate-reads';
import type { MemoryStepBlockageTable } from './step-blockage-fixture';
import type { MemoryStepParallelTable } from './step-parallel-fixture';
import { type MemoryStepWriteContext, readMemoryStepWriteIn } from './step-write';

/**
 * Sparse full reads retain the historical global orphan refusal. Targeted reads
 * first select exact requested identities; current facts and their catalogue/type/
 * explicit-value metadata are then captured synchronously on this same state.
 */
function readSparseFactsIn<Fact extends StepFactAddress>(
  context: MemoryStepWriteContext,
  rows: readonly Fact[],
  workPackageId: string,
  ids: readonly string[] | null,
  decode: (row: Fact) => Fact,
  family: 'blockage' | 'parallel',
): Fact[] {
  if (ids !== null && ids.length === 0) return [];
  const requested = ids === null ? null : new Set(ids);
  const facts: Fact[] = [];
  for (const raw of rows) {
    if (requested !== null && !requested.has(raw.workItemId)) continue;
    const owner = context.workItems.byId.get(raw.workItemId);
    if (owner === undefined)
      throw new Error(
        family === 'blockage'
          ? 'step blockage has an invalid work-item reference'
          : 'step parallelism has an invalid work-item reference',
      );
    if (owner.workPackageId !== workPackageId) continue;
    facts.push(decode(raw));
  }
  if (facts.length === 0) return [];
  const { captured, bindings, identities, values } = captureMemoryStepFactContextIn(
    context,
    workPackageId,
    facts,
    family,
  );
  return projectStoredStepFacts(captured, bindings, identities, values, facts, family);
}

/**
 * Current Source blockage composition: no global Step DTO lookup or other
 * package's projected step can supply this leaf's applicability/explicit values.
 * The existing Source coordinator owns writes; each operation itself validates
 * and mutates synchronously, so no port await can split its state observation.
 */
export function createCurrentBlockageStore(
  context: MemoryStepWriteContext,
  table: MemoryStepBlockageTable,
): StepBlockageStore {
  const { rows } = table;
  return {
    async listByWorkPackage(workPackageId) {
      return await Promise.resolve(
        readSparseFactsIn(context, rows, workPackageId, null, readStoredBlockage, 'blockage'),
      );
    },
    async listByWorkItems(workPackageId, ids) {
      const retained = [...ids];
      return await Promise.resolve(
        readSparseFactsIn(context, rows, workPackageId, retained, readStoredBlockage, 'blockage'),
      );
    },
    async set(blockage, _stamp) {
      const retained = readStoredBlockage(blockage);
      const decision = readMemoryStepWriteIn(context, retained.workItemId, retained.stepId);
      if (decision.kind !== 'resolved') return decision.kind;
      const kept = rows.filter(
        (row) => row.workItemId !== retained.workItemId || row.stepId !== retained.stepId,
      );
      rows.splice(0, rows.length, ...kept, retained);
      await Promise.resolve();
      return 'written';
    },
    remove(workItemId, stepId, _stamp) {
      const kept = rows.filter((row) => row.workItemId !== workItemId || row.stepId !== stepId);
      rows.splice(0, rows.length, ...kept);
      return Promise.resolve();
    },
    async moveAll(fromWorkItemId, toWorkItemId, _stamp) {
      const transferred = rows
        .filter((row) => row.workItemId === fromWorkItemId)
        .map((row) => readStoredBlockage({ ...row, workItemId: toWorkItemId }));
      for (const fact of transferred) {
        const decision = readMemoryStepWriteIn(context, fact.workItemId, fact.stepId);
        if (decision.kind !== 'resolved')
          throw new Error('step blockage transfer is not leaf-resolved: ' + decision.kind);
        if (rows.some((row) => row.workItemId === toWorkItemId && row.stepId === fact.stepId))
          throw new Error('duplicate step blockage');
      }
      rows.splice(
        0,
        rows.length,
        ...rows.filter((row) => row.workItemId !== fromWorkItemId),
        ...transferred,
      );
      await Promise.resolve();
    },
  };
}

/** Current parallel facts share the same strict raw boundary, same-state projection and existing pair-replacement/absence rules. */
export function createCurrentParallelStore(
  context: MemoryStepWriteContext,
  table: MemoryStepParallelTable,
): StepParallelStore {
  const { rows } = table;
  return {
    async listByWorkPackage(workPackageId) {
      return await Promise.resolve(
        readSparseFactsIn(context, rows, workPackageId, null, readStoredParallel, 'parallel'),
      );
    },
    async listByWorkItems(workPackageId, ids) {
      const retained = [...ids];
      return await Promise.resolve(
        readSparseFactsIn(context, rows, workPackageId, retained, readStoredParallel, 'parallel'),
      );
    },
    async set(parallel, _stamp) {
      const retained = readStoredParallel(parallel);
      const decision = readMemoryStepWriteIn(context, retained.workItemId, retained.stepId);
      if (decision.kind !== 'resolved')
        throw new Error('step parallelism is not leaf-resolved: ' + decision.kind);
      const kept = rows.filter(
        (row) => row.workItemId !== retained.workItemId || row.stepId !== retained.stepId,
      );
      rows.splice(0, rows.length, ...kept, retained);
      await Promise.resolve();
    },
    remove(workItemId, stepId, _stamp) {
      const kept = rows.filter((row) => row.workItemId !== workItemId || row.stepId !== stepId);
      rows.splice(0, rows.length, ...kept);
      return Promise.resolve();
    },
  };
}
