import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';

import type { SavedDependencyHistory } from './dependency-history';
import { readLegacySavedPlanInput11 } from './legacy-input11';
import * as versions from './versioned-plan-input';

/** Constructed11 controls captured before writer retirement; these are not released production saves. */
function historical(kind: 'local' | 'connected') {
  const bytes = readFileSync(
    new URL('./fixtures/constructed-input11-' + kind + '.txt', import.meta.url),
    'utf8',
  );
  return { bytes, input: readLegacySavedPlanInput11(JSON.parse(bytes)) };
}
function current(kind: 'local' | 'connected' = 'local') {
  const { input } = historical(kind);
  const { ownerId: retiredOwner, ...workPackage } = input.workPackage;
  return {
    ...input,
    schemaVersion: 12 as const,
    workPackage: { ...workPackage, projectId: 'recorded-parent' },
  };
}

for (const kind of ['local', 'connected'] as const)
  test('reads strict12 ' + kind + ' without owner metadata or mutable retained input', () => {
    const body = current(kind),
      before = JSON.stringify(body);
    expect(() => versions.readSavedPlanInput(body, 12)).not.toThrow();
    const decoded = versions.readSavedPlanInput(body, 12);
    expect(decoded).toEqual(body);
    expect(decoded.schemaVersion).toBe(12);
    expect(decoded.workPackage).not.toHaveProperty('ownerId');
    expect(Object.isFrozen(decoded.workPackage)).toBe(true);
    expect(JSON.stringify(body)).toBe(before);
    expect(Reflect.get(decoded.workPackage, 'projectId')).toBe('recorded-parent');
  });

test('strict12 requires a nonempty string parent and refuses retired or audit fields', () => {
  for (const parent of [undefined, null, '', 42]) {
    const body = current();
    if (parent === undefined) Reflect.deleteProperty(body.workPackage, 'projectId');
    else Reflect.set(body.workPackage, 'projectId', parent);
    expect(() => versions.readSavedPlanInput(body, 12)).toThrow('shape');
  }
  for (const key of ['ownerId', 'createdBy', 'createdByName']) {
    const body = current();
    Reflect.set(body.workPackage, key, 'retired-or-audit');
    expect(() => versions.readSavedPlanInput(body, 12)).toThrow('shape');
  }
});

test('strict12 retains measure and local-fact semantic refusals', () => {
  const factor = current();
  Reflect.set(factor.workPackage, 'budgetFactor', 0);
  expect(() => versions.readSavedPlanInput(factor, 12)).toThrow('budget_factor');
  const values = current();
  Reflect.set(values, 'measureEstimates', [
    {
      workItemId: 'w2',
      stepId: 's1',
      key: 'hours',
      optimistic: 3,
      realistic: 2,
      pessimistic: 1,
      currency: null,
      rateCardDigest: null,
    },
  ]);
  expect(() => versions.readSavedPlanInput(values, 12)).toThrow('measure_values');
  const basis = current();
  Reflect.set(basis, 'measures', [
    {
      workItemId: 'w2',
      stepId: 's1',
      metric: 'hours',
      value: 1,
      currency: 'USD',
      rateCardDigest: null,
    },
  ]);
  expect(() => versions.readSavedPlanInput(basis, 12)).toThrow('measure_basis');
  const budgets = current();
  Reflect.set(budgets, 'budgets', [
    { workItemId: 'w2', key: 'hours', cap: -1, policy: 'strict', holdPerAttempt: null },
  ]);
  expect(() => versions.readSavedPlanInput(budgets, 12)).toThrow('budget_values');
  const facts = current();
  Reflect.set(facts, 'stepParallels', [{ workItemId: 'missing', stepId: 's1', maxParallel: 2 }]);
  expect(() => versions.readSavedPlanInput(facts, 12)).toThrow('local_facts');
});

test('strict12 retains connected target identity and metadata equality', () => {
  const target = current('connected');
  Reflect.set(target.workPackage, 'id', 'not-the-captured-target');
  expect(() => versions.readSavedPlanInput(target, 12)).toThrow('target');
  const name = current('connected');
  Reflect.set(name.workPackage, 'name', 'Torn target name');
  expect(() => versions.readSavedPlanInput(name, 12)).toThrow('target_metadata');
});

test('only the current12 writer accepts ownerless rows and explicit captured history', () => {
  const body = current();
  const { schemaVersion: ignoredVersion, dependencyHistory, ...rows } = body;
  const writer = Reflect.get(versions, 'canonicalisePlanInputV12') as
    ((inputRows: typeof rows, history: SavedDependencyHistory) => unknown) | undefined;
  expect(typeof writer).toBe('function');
  if (writer === undefined) throw new Error('current12 writer absent');
  const before = JSON.stringify(rows),
    first = writer(rows, dependencyHistory);
  expect(first).toEqual(body);
  expect(
    JSON.stringify(
      writer(
        { ...rows, steps: [...rows.steps].reverse(), workItems: [...rows.workItems].reverse() },
        dependencyHistory,
      ),
    ),
  ).toBe(JSON.stringify(first));
  expect(JSON.stringify(rows)).toBe(before);
});

test('reader13 preserves historical11 and refuses mismatched or future headers', () => {
  const original = historical('local');
  expect(versions.readSavedPlanInput(JSON.parse(original.bytes), 11)).toEqual(original.input);
  expect(versions.readSavedPlanInput(JSON.parse(original.bytes), 11).schemaVersion).toBe(11);
  expect(versions.SAVED_PLAN_INPUT_READER_VERSION).toBe(13);
  expect(() => versions.readSavedPlanInput(current(), 11)).toThrow('version');
  expect(() => versions.readSavedPlanInput(current(), 14)).toThrow('from-the-future');
});
