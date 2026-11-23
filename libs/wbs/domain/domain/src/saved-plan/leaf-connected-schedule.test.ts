import { expect, test } from 'bun:test';

import * as domain from '../index';
import { leafScheduleFixture } from './leaf-connected-schedule.fixture';
import { leafHistoryFixture } from './leaf-dependency-history.fixture';

const validate = (history: unknown, schedule: unknown) => {
  const check = Reflect.get(domain, 'validateSavedLeafConnectedHistory') as
    ((history: unknown, schedule: unknown) => void) | undefined;
  expect(typeof check).toBe('function');
  if (typeof check !== 'function') throw new Error('leaf cross-body validator absent');
  check(history, schedule);
};
test('connected input13 builder selects own inventory validation for a mixed zero boundary', () => {
  const { history, evidence } = leafScheduleFixture();
  const build = Reflect.get(domain, 'buildLeafConnectedScheduleBody') as
    | ((
        planned: unknown,
        start: string | null,
        history: unknown,
        evidence: unknown,
      ) => { version: number })
    | undefined;
  expect(typeof build).toBe('function');
  if (build === undefined) throw new Error('leaf connected builder absent');
  const planned = {
    ...evidence.composite,
    workItems: new Map(Object.entries(evidence.composite.workItems)),
    slices: new Map(Object.entries(evidence.composite.slices)),
  };
  const anchor = domain.dateOfWorkdayOrdinal(20727);
  Reflect.set(history.workPackages[0], 'startDate', anchor);
  expect(build(planned, anchor, history, evidence).version).toBe(4);
});
test('connected input13 accepts own placements including zero boundary beside nonempty package policy', () => {
  const { history, evidence } = leafScheduleFixture();
  expect(() => {
    validate(history, evidence);
  }).not.toThrow();
});
for (const fault of ['foreign-step', 'false-boundary', 'parent-step'] as const)
  test('connected input13 refuses captured placement ' + fault, () => {
    const orders = leafHistoryFixture().workPackages[0].leafSteps;
    if (fault === 'foreign-step')
      orders.find((leaf) => leaf.workItemId === 'spike')?.stepIds.push('qa');
    if (fault === 'false-boundary') {
      const spike = orders.find((leaf) => leaf.workItemId === 'spike');
      if (spike === undefined) throw new Error('fixture spike absent');
      spike.stepIds = [];
    }
    if (fault === 'parent-step') orders.push({ workItemId: 'P', stepIds: ['dev'] });
    const { history, evidence } = leafScheduleFixture(orders);
    expect(() => {
      validate(history, evidence);
    }).toThrow('placement_step');
  });
