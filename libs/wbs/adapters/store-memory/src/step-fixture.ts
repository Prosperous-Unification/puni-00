import type { Step, StepRemoved, StepStore, StepUsageRows, WorkItemStore } from '@wbs/core';
import { assertStepParallel, NO_ALLOWANCE, STEP_POSITION_STEP, suggestStepCode } from '@wbs/domain';

import { type MemoryEstimateTable, memoryEstimateTable } from './estimate-fixture';
import type { MemoryStepParallelTable } from './step-parallel-fixture';

/**
 * A `Step` row carrying every field the schema requires.
 *
 * `position` is `STEP_POSITION_STEP`, the spacing `add` gives a project's first
 * step, so a row this builds sorts where production would put it.
 */
export function stepRow(overrides: Partial<Step> = {}): Step {
  const name = overrides.name ?? 'Build';
  return {
    id: crypto.randomUUID(),
    projectId: 'project',
    name,
    position: STEP_POSITION_STEP,
    code: suggestStepCode(name, new Set()),
    allowancePercent: NO_ALLOWANCE,
    estimateUnit: 'workdays',
    ...overrides,
  };
}

/**
 * A StepStore backed by an array, for tests that only need `buildApp` to be
 * constructible.
 *
 * It keeps the rules a caller branches on — a name or a code a project already
 * holds is refused, and a missing code is suggested as production suggests it —
 * because a fixture laxer than production lets a test pass against
 * behaviour that does not exist.
 *
 * Sparse parallelism shares its source-owned table with this store and refuses
 * removal for either cascade value, validating selected trusted facts first.
 * Returned references are detached and ordered by their structured identities.
 *
 * **What it deliberately does not model** is removal revisions and SQL deletes.
 * An array has no statement to put them in, so claiming them here would be a
 * second implementation of the rule under test. Successful `remove` reports
 * what it took; SQLite removal tests own the revision and SQL atomicity claims.
 */
export interface MemoryStepTable {
  readonly rows: Step[];
}

export function memoryStepTable(seed: readonly Step[] = []): MemoryStepTable {
  return { rows: structuredClone([...seed]) };
}

export function inMemorySteps(
  seed: readonly Step[] = [],
  table: MemoryStepTable = memoryStepTable(seed),
  estimates: MemoryEstimateTable = memoryEstimateTable(),
  parallelism?: { readonly table: MemoryStepParallelTable; readonly workItems: WorkItemStore },
): StepStore & { readonly rows: Step[] } {
  const { rows } = table;
  /**
   * Every stamp this store was handed, in call order, so a service test can
   * assert who wrote and when without a database to read audit columns from.
   */
  return {
    rows,
    listByProject(projectId) {
      // Sorted, because production is: without the `ORDER BY` SQLite answers
      // this from the name index, and a fixture that happened to return
      // insertion order would let a test pass against an order production does
      // not produce.
      return Promise.resolve(
        rows
          .filter((each) => each.projectId === projectId)
          .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1)),
      );
    },
    findById(stepId) {
      return Promise.resolve(rows.find((each) => each.id === stepId) ?? null);
    },
    add(toAdd, _stamp) {
      const held = rows.filter((each) => each.projectId === toAdd.projectId);
      if (held.some((each) => each.name === toAdd.name)) {
        return Promise.resolve({ ok: false, reason: 'taken' });
      }
      const taken = new Set(held.flatMap((each) => (each.code === null ? [] : [each.code])));
      if (toAdd.code !== undefined && taken.has(toAdd.code)) {
        return Promise.resolve({ ok: false, reason: 'code_taken' });
      }
      const written: Step = {
        ...toAdd,
        estimateUnit: toAdd.estimateUnit ?? 'workdays',
        code: toAdd.code ?? suggestStepCode(toAdd.name, taken),
        position: Math.max(0, ...held.map((each) => each.position)) + STEP_POSITION_STEP,
      };
      rows.push(written);
      return Promise.resolve({ ok: true, step: written });
    },
    patchUnit(projectId, stepId, unit) {
      const found = rows.find((each) => each.id === stepId && each.projectId === projectId);
      if (found === undefined) return Promise.resolve({ ok: false, reason: 'not_found' });
      if (found.estimateUnit === unit) return Promise.resolve({ ok: true, step: found });
      const count = estimates.rows.filter((each) => each.stepId === stepId).length;
      // Proof: without this refusal, step-unit.test.ts admitted conversion over a stored estimate.
      if (count > 0) return Promise.resolve({ ok: false, reason: 'estimates_present', count });
      found.estimateUnit = unit;
      return Promise.resolve({ ok: true, step: found });
    },
    rename(projectId, stepId, name, _stamp) {
      const found = rows.find((each) => each.id === stepId && each.projectId === projectId);
      if (found === undefined) return Promise.resolve({ ok: false, reason: 'not_found' });
      const taken = rows.some(
        (each) => each.projectId === found.projectId && each.name === name && each.id !== stepId,
      );
      if (taken) return Promise.resolve({ ok: false, reason: 'taken' });
      found.name = name;
      return Promise.resolve({ ok: true, step: found });
    },
    usageOf(): Promise<StepUsageRows> {
      // Nothing points at a step here: this fixture holds no estimates, no
      // actuals, no stated progress, no figures and no assignments to point
      // with.
      return Promise.resolve({
        estimates: 0,
        actuals: 0,
        progress: 0,
        blockages: 0,
        measures: 0,
        attempts: 0,
        assignments: [],
      });
    },
    async remove(projectId, stepId, _cascade, _stamp): Promise<StepRemoved> {
      const found = rows.findIndex((each) => each.id === stepId && each.projectId === projectId);
      if (found < 0) return { ok: false, reason: 'not_found' };
      const nodes: { workItemId: string; stepId: string }[] = [];
      if (parallelism !== undefined) {
        const seen = new Set<string>();
        const owners = await parallelism.workItems.listByProject(projectId);
        // Proof: targetless selection included a foreign-step fact and broke the exact-target test, 2026-10-17.
        for (const parallel of parallelism.table.rows.filter((row) => row.stepId === stepId)) {
          // Proof: range validation omitted; corrupt retained memory range test received a policy refusal, 2026-10-17.
          assertStepParallel(parallel.maxParallel);
          const owner = await parallelism.workItems.findById(parallel.workItemId);
          // Proof: owner guard omitted; corrupt retained memory owner test received TypeError, 2026-10-17.
          if (owner === null)
            throw new Error('step parallelism has an invalid work-item reference');
          // Proof: project guard omitted; corrupt retained memory project test received a policy refusal, 2026-10-17.
          if (owner.projectId !== projectId) throw new Error('step parallelism project mismatch');
          // Proof: leaf guard omitted; corrupt retained memory leaf test received a policy refusal, 2026-10-17.
          if (owners.some((row) => row.parentId === owner.id))
            throw new Error('step parallelism owner is not a leaf');
          // Proof: duplicate guard omitted; corrupt retained memory duplicate test received a policy refusal, 2026-10-17.
          if (seen.has(owner.id)) throw new Error('duplicate step parallelism');
          seen.add(owner.id);
          // Proof: retaining the fact object exposed maxParallel and broke detached-reference assertions, 2026-10-17.
          nodes.push({ workItemId: parallel.workItemId, stepId: parallel.stepId });
        }
      }
      // Proof: omitted guard and cascade-only guard deleted the step in retained memory tests, 2026-10-17.
      if (nodes.length > 0)
        return {
          ok: false,
          reason: 'referenced_by_step_parallel',
          // Proof: descending owner order broke the sorted detached-reference test, 2026-10-17.
          nodes: nodes.sort((left, right) =>
            left.workItemId < right.workItemId ? -1 : left.workItemId > right.workItemId ? 1 : 0,
          ),
        };
      // Proof: using the pre-await index made both delayed-owner concurrency tests fail, 2026-10-17.
      const current = rows.findIndex((row) => row.id === stepId && row.projectId === projectId);
      // Proof: omitting this guard let the same-step loser remove a sibling and report success, 2026-10-17.
      if (current < 0) return { ok: false, reason: 'not_found' };
      rows.splice(current, 1);
      return Promise.resolve({
        ok: true,
        removal: {
          estimates: 0,
          actuals: 0,
          progress: 0,
          blockages: 0,
          measures: 0,
          attempts: 0,
          assignments: 0,
          workItemIds: [],
        },
      });
    },
  };
}
