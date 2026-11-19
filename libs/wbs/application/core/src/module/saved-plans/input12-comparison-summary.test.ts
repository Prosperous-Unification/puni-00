import { readFileSync } from 'node:fs';

import { canonicalisePlanInputV12, type PlanSide, projectSavedPlanInput } from '@wbs/domain';
import { expect, test } from 'bun:test';

import { summarizeSavedComparisonSide } from './saved-plan-comparison';

const schedule = { present: false, absentReason: 'not requested' } as const;
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
test('current summary retains recorded parent and local provenance even with an empty self diff', () => {
  const facts = historical().input;
  const side: PlanSide = {
    comparison: { kind: 'captured' as const },
    ...projectSavedPlanInput(
      canonicalisePlanInputV12(
        { ...facts, workPackage: { ...facts.workPackage, projectId: 'captured-parent' } },
        { kind: 'local' },
      ),
      12,
    ),
    schedule,
  };
  expect(summarizeSavedComparisonSide(side, { kind: 'current' })).toEqual({
    source: { kind: 'current' },
    parent: { kind: 'recorded', projectId: 'captured-parent' },
    schedule,
    provenance: { kind: 'local' },
  });
});
test('historical eleven summary keeps unknown parent separate from recorded local dependencies', () => {
  expect(summarizeSavedComparisonSide(historical(), { kind: 'saved', savedPlanId: 'old' })).toEqual(
    {
      source: { kind: 'saved', savedPlanId: 'old' },
      parent: { kind: 'unrecorded' },
      schedule,
      provenance: { kind: 'local' },
    },
  );
});
test('original nine summary keeps dependency evidence unrecorded after historical projection', () => {
  const body: unknown = JSON.parse(
    readFileSync(
      new URL(
        '../../../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-input9-local.txt',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const side: PlanSide = {
    comparison: { kind: 'captured' as const },
    ...projectSavedPlanInput(body, 9),
    schedule,
  };
  expect(summarizeSavedComparisonSide(side, { kind: 'saved', savedPlanId: 'older' })).toEqual({
    source: { kind: 'saved', savedPlanId: 'older' },
    parent: { kind: 'unrecorded' },
    schedule,
    provenance: { kind: 'legacy-unknown' },
  });
});
