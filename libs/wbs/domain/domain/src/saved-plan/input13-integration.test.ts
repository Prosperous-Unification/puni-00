import { expect, test } from 'bun:test';

import { projectSavedPlanInput } from './comparison-input';
import { connectedHistoryFixture, connectedPlanFixtureRows } from './connected-history.fixture';
import { readSavedDependencyHistory } from './dependency-history';
import { diffPlans, type PlanSide } from './diff-plans';
import { input13Fixture } from './input13.fixture';
import { projectSavedStepIdentity } from './step-identity';
import { canonicalisePlanInputV12 } from './versioned-plan-input';
import { readSavedPlanInput } from './versioned-plan-input';

test('declared reader accepts input13 without relabeling its captured mixed orders', () => {
  const body = input13Fixture(true),
    before = JSON.stringify(body);
  const decoded: unknown = readSavedPlanInput(body, 13);
  expect(decoded).toEqual(body);
  expect(JSON.stringify(body)).toBe(before);
  expect(() => readSavedPlanInput(body, 12)).toThrow('version');
  expect(() => readSavedPlanInput({ ...body, schemaVersion: 14 }, 14)).toThrow('from-the-future');
});

test('input13 comparison records actual parent and own execution lists without retired owner evidence', () => {
  const body = input13Fixture(),
    before = JSON.stringify(body),
    view = projectSavedPlanInput(body, 13);
  expect(view.inputEvidence.parent).toEqual({ kind: 'recorded', projectId: 'recorded-parent' });
  expect(view.inputEvidence).not.toHaveProperty('retired');
  expect(view.input.leafSteps).toEqual([
    { workItemId: 'spike', stepIds: ['research'] },
    { workItemId: 'story', stepIds: ['dev', 'qa'] },
    { workItemId: 'target', stepIds: ['qa', 'dev'] },
    { workItemId: 'zero', stepIds: [] },
  ]);
  expect(view.input).not.toHaveProperty('schemaVersion');
  expect(view.input).not.toHaveProperty('dependencyHistory');
  expect(JSON.stringify(body)).toBe(before);
  expect(Object.isFrozen(view.input.leafSteps[0].stepIds)).toBe(true);
});

const side = (body: unknown, version: number): PlanSide => ({
  ...projectSavedPlanInput(body, version),
  comparison: { kind: 'captured' },
  schedule: { present: false, absentReason: 'not_requested' },
});

test('input13 comparison finds own order changes by leaf identity despite row reordering', () => {
  const left = input13Fixture(),
    right = input13Fixture();
  right.leafSteps.find((leaf) => leaf.workItemId === 'target')?.stepIds.reverse();
  right.leafSteps.reverse();
  expect(diffPlans(side(left, 13), side(right, 13)).input).toEqual([
    {
      category: 'reordered',
      path: 'leafSteps[target].stepIds',
      left: ['qa', 'dev'],
      right: ['dev', 'qa'],
    },
  ]);
});

test('original12 comparison derives its declared uniform execution without rewriting the body', () => {
  const current = input13Fixture(),
    { leafSteps, ...older } = current,
    twelve = { ...older, schemaVersion: 12 },
    before = JSON.stringify(twelve);
  for (const leaf of current.leafSteps) leaf.stepIds = ['dev', 'qa', 'research'];
  expect(diffPlans(side(twelve, 12), side(current, 13))).toEqual({ input: [], schedule: [] });
  expect(diffPlans(side(current, 13), side(twelve, 12))).toEqual({ input: [], schedule: [] });
  expect(JSON.stringify(twelve)).toBe(before);
  expect(twelve).not.toHaveProperty('leafSteps');
});

test('input13 identity projection translates own orders and connected member orders without rewriting captures', () => {
  const captured = side(input13Fixture(true), 13),
    before = JSON.stringify(captured);
  const projected = projectSavedStepIdentity(captured, {
    kind: 'catalogue',
    aliases: [{ oldStepId: 'dev', stepId: 'new-dev' }],
  });
  if (projected.comparison.kind !== 'step-resolved') throw new Error('resolved comparison absent');
  expect(
    projected.comparison.input.leafSteps.find((leaf) => leaf.workItemId === 'target')?.stepIds,
  ).toEqual(['qa', 'new-dev']);
  expect(projected.comparison.dependencies).toMatchObject({
    kind: 'recorded',
    history: {
      workPackages: [
        {
          leafSteps: [
            { workItemId: 'spike', stepIds: ['research'] },
            { workItemId: 'story', stepIds: ['new-dev', 'qa'] },
            { workItemId: 'target', stepIds: ['qa', 'new-dev'] },
            { workItemId: 'zero', stepIds: [] },
          ],
        },
      ],
    },
  });
  expect(JSON.stringify(captured)).toBe(before);
});

test('uniform connected comparison derives tied policy order before identity translation', () => {
  const fixture = connectedHistoryFixture();
  for (const policy of fixture.history.workPackages[0].steps) policy.position = 0;
  const history = readSavedDependencyHistory(fixture.history);
  if (history.kind !== 'connected') throw new Error('connected fixture absent');
  const body = canonicalisePlanInputV12(connectedPlanFixtureRows(history), history);
  const captured = side(body, 12),
    before = JSON.stringify(captured);
  const projected = projectSavedStepIdentity(captured, {
    kind: 'catalogue',
    aliases: [
      { oldStepId: 'design', stepId: 'z-design' },
      { oldStepId: 'test', stepId: 'a-test' },
    ],
  });
  if (projected.comparison.kind !== 'step-resolved') throw new Error('comparison meaning absent');
  expect(projected.comparison.dependencies).toHaveProperty('history.workPackages.0.leafSteps', [
    { workItemId: 'a', stepIds: ['z-design', 'a-test'] },
  ]);
  expect(JSON.stringify(captured)).toBe(before);
  expect(history.workPackages[0]).not.toHaveProperty('leafSteps');
});
