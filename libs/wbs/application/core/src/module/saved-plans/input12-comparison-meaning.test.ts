import { readFileSync } from 'node:fs';

import { canonicalisePlanInputV12, type PlanSide, projectSavedPlanInput } from '@wbs/domain';
import { expect, test } from 'bun:test';

import { compareSavedPlanMeaning } from './plan-comparison-meaning';

const schedule = { present: false, absentReason: 'not requested' } as const;
function current(parent: string): PlanSide {
  const facts = historical().input;
  return {
    comparison: { kind: 'captured' as const },
    ...projectSavedPlanInput(
      canonicalisePlanInputV12(
        { ...facts, workPackage: { ...facts.workPackage, projectId: parent } },
        { kind: 'local' },
      ),
      12,
    ),
    schedule,
  };
}
function historical(): PlanSide {
  const body: unknown = JSON.parse(
    readFileSync(
      new URL(
        '../../../../../domain/domain/src/saved-plan/fixtures/constructed-input11-local.txt',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  return {
    comparison: { kind: 'captured' as const },
    ...projectSavedPlanInput(body, 11),
    schedule,
  };
}
test('meaning comparison retains current parent evidence through its schedule projection', () => {
  expect(compareSavedPlanMeaning(current('before'), current('after'))).toEqual({
    input: [
      { category: 'reparented', path: 'workPackage.projectId', left: 'before', right: 'after' },
    ],
    schedule: [],
  });
});
test('meaning comparison preserves mixed-generation provenance without inventing input differences', () => {
  const old = historical(),
    fresh = current('actual-parent');
  expect(compareSavedPlanMeaning(old, fresh)).toEqual({ input: [], schedule: [] });
  expect(compareSavedPlanMeaning(fresh, old)).toEqual({ input: [], schedule: [] });
  expect(old.inputEvidence.parent).toEqual({ kind: 'unrecorded' });
  expect(fresh.inputEvidence.parent).toEqual({ kind: 'recorded', projectId: 'actual-parent' });
});
