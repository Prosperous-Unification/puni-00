import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';

import { projectSavedPlanInput } from './comparison-input';
import { connectedHistoryFixture, connectedPlanFixtureRows } from './connected-history.fixture';
import { readSavedDependencyHistory } from './dependency-history';
import { diffPlans, type PlanSide } from './diff-plans';
import { readLegacySavedPlanInput11 } from './legacy-input11';
import { planFixtureRows } from './plan-fixture';
import { canonicalisePlanInputV12 } from './versioned-plan-input';

const schedule = { present: false, absentReason: 'not requested' } as const;
function current(projectId: string): PlanSide {
  return {
    comparison: { kind: 'captured' as const },
    ...projectSavedPlanInput(
      canonicalisePlanInputV12(
        { ...planFixtureRows, workPackage: { ...planFixtureRows.workPackage, projectId } },
        { kind: 'local' },
      ),
      12,
    ),
    schedule,
  };
}
function historical(ownerId: string | null): PlanSide {
  const body = structuredClone(
    readLegacySavedPlanInput11(
      JSON.parse(
        readFileSync(new URL('./fixtures/constructed-input11-local.txt', import.meta.url), 'utf8'),
      ),
    ),
  );
  Reflect.set(body.workPackage, 'ownerId', ownerId);
  return {
    comparison: { kind: 'captured' as const },
    ...projectSavedPlanInput(body, 11),
    schedule,
  };
}

test('two captured parents report a reparenting without altering per-side evidence', () => {
  const left = current('parent-left'),
    right = current('parent-right');
  const before = JSON.stringify([left, right]);
  expect(diffPlans(left, right)).toEqual({
    input: [
      {
        category: 'reparented',
        path: 'workPackage.projectId',
        left: 'parent-left',
        right: 'parent-right',
      },
    ],
    schedule: [],
  });
  expect(diffPlans(right, left).input).toEqual([
    {
      category: 'reparented',
      path: 'workPackage.projectId',
      left: 'parent-right',
      right: 'parent-left',
    },
  ]);
  expect(JSON.stringify([left, right])).toBe(before);
});

test('two recorded historical owners compare as retired evidence including recorded null', () => {
  expect(diffPlans(historical(null), historical('former-owner')).input).toEqual([
    { category: 'retired-field', path: 'workPackage.ownerId', left: null, right: 'former-owner' },
  ]);
});

test('mixed generations omit unshared parent and retired facts symmetrically', () => {
  const old = historical('former-owner'),
    fresh = current('actual-parent');
  for (const [left, right] of [
    [old, fresh],
    [fresh, old],
  ] as const) {
    expect(diffPlans(left, right)).toEqual({ input: [], schedule: [] });
  }
  expect(old.inputEvidence.parent).toEqual({ kind: 'unrecorded' });
  expect(fresh.inputEvidence.parent).toEqual({ kind: 'recorded', projectId: 'actual-parent' });
});

test('dependency history compares only when both original bodies actually recorded it', () => {
  const history = readSavedDependencyHistory(connectedHistoryFixture().history);
  if (history.kind !== 'connected') throw Error('connected fixture required');
  const rows = connectedPlanFixtureRows(history);
  const left: PlanSide = {
    comparison: { kind: 'captured' as const },
    ...projectSavedPlanInput(canonicalisePlanInputV12(rows, { kind: 'local' }), 12),
    schedule,
  };
  const extended: PlanSide = {
    comparison: { kind: 'captured' as const },
    ...projectSavedPlanInput(canonicalisePlanInputV12(rows, history), 12),
    schedule,
  };
  expect(
    diffPlans(left, extended).input.some((change) => change.path.startsWith('dependencyHistory.')),
  ).toBe(true);
  const unknown: PlanSide = {
    ...left,
    inputEvidence: { ...left.inputEvidence, dependencies: { kind: 'unrecorded' } },
  };
  expect(diffPlans(unknown, extended).input).toEqual([]);
  expect(diffPlans(extended, unknown).input).toEqual([]);
});

test('mixed generations still report changed authored facts and every schedule field', () => {
  const old = historical('old-owner'),
    fresh = current('parent');
  const changed: PlanSide = {
    ...fresh,
    input: { ...fresh.input, workPackage: { ...fresh.input.workPackage, name: 'Renamed' } },
    schedule: { present: false, absentReason: 'infeasible' },
  };
  expect(diffPlans(old, changed)).toEqual({
    input: [
      { category: 'renamed', path: 'workPackage.name', left: 'Rewire the shed', right: 'Renamed' },
    ],
    schedule: [
      {
        category: 'dates',
        path: 'schedule.absentReason',
        left: 'not requested',
        right: 'infeasible',
      },
    ],
  });
});
