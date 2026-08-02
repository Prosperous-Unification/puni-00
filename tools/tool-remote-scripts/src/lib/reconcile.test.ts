import { describe, expect, it } from 'bun:test';

import { type Observed, planSwap, resolveLiveColor } from './reconcile';

const base: Observed = {
  routedColor: 'blue',
  runningColors: ['blue'],
  recordedColor: 'blue',
  phase: 'committed',
};

describe('resolveLiveColor', () => {
  it('trusts the routing layer when it agrees with the state file', () => {
    expect(resolveLiveColor(base)).toBe('blue');
  });

  it('prefers the routing layer when the state file disagrees', () => {
    // The exact split-brain a deploy killed between reload and commit produces.
    expect(
      resolveLiveColor({
        routedColor: 'green',
        runningColors: ['blue', 'green'],
        recordedColor: 'blue',
        phase: 'routed',
      }),
    ).toBe('green');
  });

  it('falls back to the state file when nothing is routed but its container runs', () => {
    expect(
      resolveLiveColor({
        routedColor: null,
        runningColors: ['blue'],
        recordedColor: 'blue',
        phase: 'committed',
      }),
    ).toBe('blue');
  });

  it('returns null when the recorded colour is not actually running', () => {
    expect(
      resolveLiveColor({
        routedColor: null,
        runningColors: [],
        recordedColor: 'blue',
        phase: 'committed',
      }),
    ).toBeNull();
  });
});

describe('planSwap', () => {
  it('targets the colour that is not live', () => {
    const plan = planSwap('be', base);
    expect(plan.from).toBe('blue');
    expect(plan.to).toBe('green');
  });

  it('deploys to blue on a first-ever deploy', () => {
    const plan = planSwap('be', {
      routedColor: null,
      runningColors: [],
      recordedColor: null,
      phase: null,
    });
    expect(plan.from).toBeNull();
    expect(plan.to).toBe('blue');
  });

  it('includes migrate and move-alias for be, in that order, before routing', () => {
    const plan = planSwap('be', base);
    expect(plan.steps).toContain('migrate');
    expect(plan.steps.indexOf('migrate')).toBeLessThan(plan.steps.indexOf('health-gate'));
    expect(plan.steps.indexOf('move-alias')).toBeLessThan(plan.steps.indexOf('reload'));
  });

  it('includes drain for gw but not for be or fe', () => {
    expect(planSwap('gw', base).steps).toContain('drain');
    expect(planSwap('be', base).steps).not.toContain('drain');
    expect(planSwap('fe', base).steps).not.toContain('drain');
  });

  it('never includes migrate or move-alias for gw or fe', () => {
    for (const tier of ['gw', 'fe'] as const) {
      expect(planSwap(tier, base).steps).not.toContain('migrate');
      expect(planSwap(tier, base).steps).not.toContain('move-alias');
    }
  });

  it('always ends by committing', () => {
    expect(planSwap('fe', base).steps.at(-1)).toBe('commit');
  });
});
