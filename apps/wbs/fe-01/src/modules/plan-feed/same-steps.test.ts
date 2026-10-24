import { describe, expect, it } from 'vitest';

import { createDeliveredPlan, sameSteps } from './delivered-plan-store';

describe('sameSteps', () => {
  const qa = { estimateUnit: 'workdays' as const, id: 'qa', name: 'QA', allowancePercent: 0 };

  it('treats an identical list as the same', () => {
    expect(sameSteps([qa], [{ ...qa }])).toBe(true);
  });

  /** Proof: see `sameSteps`. */
  it('a changed allowance is a different step list', () => {
    expect(sameSteps([qa], [{ ...qa, allowancePercent: 30 }])).toBe(false);
  });
});

it('invalidates dependency defaults when a step code changes or becomes known', () => {
  const step = { estimateUnit: 'workdays' as const, id: 'dev', name: 'Dev', allowancePercent: 0 };
  expect(sameSteps([step], [{ ...step, code: null }])).toBe(false);
  expect(sameSteps([{ ...step, code: 'DEV' }], [{ ...step, code: 'QA' }])).toBe(false);
});

it('publishes a step code-only refresh through the delivered plan store', () => {
  const store = createDeliveredPlan();
  const step = {
    estimateUnit: 'workdays' as const,
    id: 'dev',
    name: 'Dev',
    allowancePercent: 0,
    code: 'DEV',
  };
  const unchanged = {
    staleResources: [],
    treeFailure: null,
    directory: null,
    tree: null,
    markers: null,
    claims: null,
  };
  store.deliver({ ...unchanged, steps: [step] });
  const before = store.snapshot();
  store.deliver({ ...unchanged, steps: [{ ...step, code: 'BUILD' }] });
  expect(store.snapshot()).not.toBe(before);
  expect(store.snapshot().steps[0]?.code).toBe('BUILD');
});
