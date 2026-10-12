import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import type { ParentedRow } from './is-within';
import { agree, type ProgressStatus, UNKNOWN } from './progress';
import { rollUpProgress, workedStepsOf } from './roll-up';
import type { StepNodeRef } from './step-node';
import type { StoredProgress } from './step-values';

/**
 * The fold as it was before `step-node-readings` slice 2, kept as the oracle:
 * a leaf's worked steps read unknown, its statements override, and a parent
 * agrees its children's maps step by step.
 */
function rollUpProgressBeforeAttempts(
  rows: readonly ParentedRow[],
  stated: readonly StoredProgress[],
  worked: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, Map<string, ProgressStatus>> {
  const own = new Map<string, Map<string, ProgressStatus>>();
  for (const [workItemId, stepIds] of worked) {
    own.set(workItemId, new Map([...stepIds].map((stepId) => [stepId, UNKNOWN] as const)));
  }
  for (const said of stated) {
    const byStep = own.get(said.workItemId) ?? new Map<string, ProgressStatus>();
    byStep.set(said.stepId, said.state);
    own.set(said.workItemId, byStep);
  }
  const totals = new Map<string, Map<string, ProgressStatus>>();
  const totalFor = (id: string): Map<string, ProgressStatus> => {
    const cached = totals.get(id);
    if (cached !== undefined) return cached;
    const children = rows.filter((row) => row.parentId === id);
    const total = new Map<string, ProgressStatus>();
    if (children.length === 0) {
      for (const [stepId, state] of own.get(id) ?? []) total.set(stepId, state);
    }
    for (const child of children) {
      for (const [stepId, state] of totalFor(child.id)) {
        const before = total.get(stepId);
        total.set(stepId, before === undefined ? state : agree(before, state));
      }
    }
    totals.set(id, total);
    return total;
  };
  for (const row of rows) totalFor(row.id);
  return totals;
}

/** The pre-change candidate set: estimates, actuals and statements, nothing else. */
function workedStepsBeforeAttempts(
  ...lists: readonly (readonly StepNodeRef[])[]
): Map<string, Set<string>> {
  const worked = new Map<string, Set<string>>();
  for (const each of lists.flat()) {
    const steps = worked.get(each.workItemId) ?? new Set<string>();
    steps.add(each.stepId);
    worked.set(each.workItemId, steps);
  }
  return worked;
}

const ids = ['a', 'b', 'c', 'd', 'e'] as const;
const stepIds = ['dev', 'qa', 'ops'] as const;

/** A forest over `ids`: each row's parent is an earlier row or none. */
const forest = fc
  .tuple(...ids.map((_, at) => fc.integer({ min: -1, max: at - 1 })))
  .map((parents): ParentedRow[] =>
    ids.map((id, at) => ({ id, parentId: parents[at] < 0 ? null : ids[parents[at]] })),
  );
const nodeRef = fc.record({
  workItemId: fc.constantFrom(...ids),
  stepId: fc.constantFrom(...stepIds),
});
const statement = fc.record({
  workItemId: fc.constantFrom(...ids),
  stepId: fc.constantFrom(...stepIds),
  state: fc.constantFrom('in_progress' as const, 'done' as const),
  statedAt: fc.constant(1),
});

describe('the fold with no attempts', () => {
  /**
   * Why no leaf on a store without attempts moves (`step-node-readings` task
   * 2.4): with the attempts list and the running list empty, the candidate set
   * and the fold are the ones before attempts existed, for any tree, any
   * figures and any statements.
   *
   * Proof: `stated` left out of `workedStepsOf`'s union and this failed after
   * 2 runs on a counterexample stating `a.dev in_progress` with no figures;
   * watched 2026-10-12.
   */
  it('with no attempts the fold equals the fold before attempts', () => {
    fc.assert(
      fc.property(
        forest,
        fc.array(nodeRef, { maxLength: 8 }),
        fc.array(nodeRef, { maxLength: 8 }),
        fc.array(statement, { maxLength: 8 }),
        (rows, estimates, actuals, stated) => {
          const worked = workedStepsOf(estimates, actuals, stated, []);
          expect(worked).toEqual(workedStepsBeforeAttempts(estimates, actuals, stated));
          expect(rollUpProgress(rows, stated, worked, [])).toEqual(
            rollUpProgressBeforeAttempts(rows, stated, worked),
          );
        },
      ),
      { numRuns: 1_000 },
    );
  });
});
