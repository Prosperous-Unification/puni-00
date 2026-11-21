import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';

import * as domain from '../index';
import { readCurrentSavedPlanInput12 } from './input12';
import { input13Fixture } from './input13.fixture';
import { readLegacySavedPlanInput11 } from './legacy-input11';

function read(body: unknown): ReturnType<typeof input13Fixture> {
  const decode = Reflect.get(domain, 'readCurrentSavedPlanInput13') as
    ((body: unknown) => ReturnType<typeof input13Fixture>) | undefined;
  expect(typeof decode).toBe('function');
  if (decode === undefined) throw new Error('input13 reader absent');
  return decode(body);
}
for (const fault of ['duplicate', 'unknown'] as const)
  test('input13 refuses an invalid own step list ' + fault, () => {
    const body = input13Fixture();
    body.leafSteps[0].stepIds.push(fault === 'duplicate' ? 'dev' : 'absent');
    expect(() => read(body)).toThrow('leaf_step');
  });
test('input13 refuses an unknown captured parent even without an incident dependency', () => {
  const body = input13Fixture(),
    zero = body.workItems.find((row) => row.id === 'zero');
  if (zero === undefined) throw new Error('fixture zero leaf absent');
  zero.parentId = 'absent';
  expect(() => read(body)).toThrow('parent');
});
test('input13 refuses a missing typed whole endpoint owner', () => {
  const body = input13Fixture();
  Reflect.set(body.typedDependencies[0], 'predecessor', { scope: 'whole', workItemId: 'absent' });
  expect(() => read(body)).toThrow('dependency_owner');
});
test('input13 refuses a connected target identity different from its captured package', () => {
  const body = input13Fixture(true);
  body.workPackage.id = 'different';
  expect(() => read(body)).toThrow(domain.SavedHistoryError);
  expect(() => read(body)).toThrow('target');
});
for (const connected of [false, true])
  test(
    'input13 keeps required own inventories and freezes ' + String(connected) + ' history',
    () => {
      const body = input13Fixture(connected),
        before = JSON.stringify(body),
        captured = read(body);
      expect(captured).toEqual(body);
      expect(JSON.stringify(body)).toBe(before);
      expect(Object.isFrozen(captured.leafSteps[0].stepIds)).toBe(true);
      body.leafSteps[0].stepIds.reverse();
      expect(captured.leafSteps[0].stepIds).toEqual(['dev', 'qa']);
    },
  );
for (const fault of ['absent', 'unlisted', 'duplicate', 'foreign', 'parent'] as const)
  test('input13 refuses required leaf census ' + fault, () => {
    const body = input13Fixture();
    if (fault === 'absent') Reflect.deleteProperty(body, 'leafSteps');
    if (fault === 'unlisted')
      body.leafSteps = body.leafSteps.filter((leaf) => leaf.workItemId !== 'zero');
    if (fault === 'duplicate') body.leafSteps.push(structuredClone(body.leafSteps[0]));
    if (fault === 'foreign') body.leafSteps.push({ workItemId: 'foreign', stepIds: [] });
    if (fault === 'parent') body.leafSteps.push({ workItemId: 'P', stepIds: [] });
    expect(() => read(body)).toThrow(
      fault === 'absent' ? 'shape' : fault === 'duplicate' ? 'duplicate' : 'leaf_inventory',
    );
  });
for (const family of [
  'stepValues',
  'stepBlockages',
  'stepParallels',
  'measures',
  'measureEstimates',
  'assignments',
] as const)
  for (const owner of ['P', 'spike', 'foreign'] as const)
    test('input13 refuses unresolved ' + family + ' pair on ' + owner, () => {
      const body = input13Fixture();
      const pair = { workItemId: owner, stepId: 'qa' };
      const value =
        family === 'stepValues'
          ? { ...body.stepValues[0], ...pair }
          : family === 'stepBlockages'
            ? { ...pair, blockedAt: 1 }
            : family === 'stepParallels'
              ? { ...pair, maxParallel: 1 }
              : family === 'measures'
                ? { ...pair, metric: 'hours', value: 1, currency: null, rateCardDigest: null }
                : family === 'measureEstimates'
                  ? {
                      ...pair,
                      key: 'hours',
                      optimistic: 1,
                      realistic: 1,
                      pessimistic: 1,
                      currency: null,
                      rateCardDigest: null,
                    }
                  : { ...pair, personId: 'person' };
      Reflect.set(body, family, [value]);
      expect(() => read(body)).toThrow('leaf_fact');
    });
test('input13 refuses a node outside its leaf and a missing whole dependency owner', () => {
  const node = input13Fixture();
  Reflect.set(node.typedDependencies[0], 'successor', {
    scope: 'node',
    workItemId: 'spike',
    stepId: 'qa',
  });
  expect(() => read(node)).toThrow('leaf_dependency');
  const missing = input13Fixture();
  Reflect.set(missing, 'dependencies', [{ predecessorId: 'absent', successorId: 'target' }]);
  expect(() => read(missing)).toThrow('dependency_owner');
});
test('input13 refuses connected target leaf orders that disagree with its own capture', () => {
  const body = input13Fixture(true);
  body.leafSteps = structuredClone(body.leafSteps);
  body.leafSteps[0].stepIds.reverse();
  expect(() => read(body)).toThrow('target_leaf_steps');
});
test('input13 writer canonicalizes leaf identities without sorting their step order', () => {
  const encode = Reflect.get(domain, 'canonicalisePlanInputV13') as
    | ((rows: unknown, leafSteps: unknown, history: unknown) => ReturnType<typeof input13Fixture>)
    | undefined;
  expect(typeof encode).toBe('function');
  if (encode === undefined) throw new Error('input13 writer absent');
  const body = input13Fixture(),
    { schemaVersion: ignoredVersion, leafSteps, dependencyHistory, ...rows } = body,
    before = JSON.stringify(body);
  const first = encode(rows, leafSteps, dependencyHistory),
    second = encode(
      { ...rows, workItems: [...rows.workItems].reverse(), steps: [...rows.steps].reverse() },
      [...leafSteps].reverse(),
      dependencyHistory,
    );
  expect(first.schemaVersion).toBe(13);
  expect(first).toEqual(second);
  expect(first.leafSteps.find((leaf) => leaf.workItemId === 'target')?.stepIds).toEqual([
    'qa',
    'dev',
  ]);
  expect(JSON.stringify(body)).toBe(before);
});
test('input12 keeps its original closed grammar while input13 refuses former parent facts', () => {
  const frozen = readFileSync(
      new URL('./fixtures/constructed-input11-local.txt', import.meta.url),
      'utf8',
    ),
    older = readLegacySavedPlanInput11(JSON.parse(frozen)),
    { ownerId: retiredOwner, ...workPackage } = older.workPackage;
  const twelve = {
    ...older,
    schemaVersion: 12 as const,
    workPackage: { ...workPackage, projectId: 'recorded-parent' },
  };
  expect(readCurrentSavedPlanInput12(twelve)).toEqual(twelve);
  expect(() => readCurrentSavedPlanInput12({ ...input13Fixture(), schemaVersion: 12 })).toThrow(
    'shape',
  );
  expect(() =>
    read({
      ...twelve,
      schemaVersion: 13,
      leafSteps: [{ workItemId: 'w2', stepIds: ['s1', 's2'] }],
    }),
  ).toThrow('leaf_fact');
  expect(
    readFileSync(new URL('./fixtures/constructed-input11-local.txt', import.meta.url), 'utf8'),
  ).toBe(frozen);
});
