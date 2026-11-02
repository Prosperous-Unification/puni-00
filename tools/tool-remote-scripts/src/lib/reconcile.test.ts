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
  it('stops and proves the outgoing writer before candidate start and exposure', () => {
    const steps = planSwap('be', base).steps;
    expect(steps.indexOf('preflight-green')).toBe(0);
    // The MCP preflight refuses while the outgoing writer still serves.
    expect(steps.indexOf('mcp-preflight')).toBe(1);
    expect(steps.indexOf('record-writer-stop')).toBeLessThan(steps.indexOf('stop-blue'));
    expect(steps.indexOf('stop-blue')).toBeLessThan(steps.indexOf('verify-blue-stopped'));
    expect(steps.indexOf('verify-blue-stopped')).toBeLessThan(steps.indexOf('start-green'));
    expect(steps.indexOf('verify-blue-stopped')).toBeLessThan(
      steps.indexOf('record-writer-exposure'),
    );
    expect(steps.indexOf('stored-vocabularies-before-start')).toBeGreaterThan(
      steps.indexOf('verify-blue-stopped'),
    );
    expect(steps.indexOf('stored-vocabularies-before-start')).toBeLessThan(
      steps.indexOf('record-writer-exposure'),
    );
    expect(steps.indexOf('record-writer-exposure')).toBeLessThan(steps.indexOf('start-green'));
    expect(steps.indexOf('record-writer-exposure')).toBeLessThan(steps.indexOf('grant-alias'));
  });

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

  it('includes migrate and grant-alias for be, in that order, before routing', () => {
    const plan = planSwap('be', base);
    expect(plan.steps.indexOf('stored-vocabularies')).toBeGreaterThan(
      plan.steps.indexOf('start-green'),
    );
    expect(plan.steps.indexOf('stored-vocabularies-before-start')).toBeLessThan(
      plan.steps.indexOf('migrate'),
    );
    expect(plan.steps).toContain('migrate');
    expect(plan.steps.indexOf('migrate')).toBeLessThan(plan.steps.indexOf('health-gate'));
    expect(plan.steps.indexOf('grant-alias')).toBeLessThan(plan.steps.indexOf('render-route'));
  });

  it('backs up before migrating, and never after', () => {
    const plan = planSwap('be', base);
    expect(plan.steps.indexOf('stored-vocabularies-before-start')).toBeLessThan(
      plan.steps.indexOf('backup-db'),
    );
    expect(plan.steps.indexOf('backup-db')).toBe(plan.steps.indexOf('migrate') - 1);
    for (const tier of ['gw', 'fe'] as const) {
      expect(planSwap(tier, base).steps).not.toContain('backup-db');
    }
  });

  it('keeps outgoing backend stopped instead of reconnecting its alias', () => {
    expect(planSwap('be', base).steps).not.toContain('revoke-alias');
  });

  it('skips revoke-alias for be on a first-ever deploy — nothing to revoke it from', () => {
    const plan = planSwap('be', {
      routedColor: null,
      runningColors: [],
      recordedColor: null,
      phase: null,
    });
    expect(plan.steps).toContain('grant-alias');
    expect(plan.steps).not.toContain('revoke-alias');
  });

  it('includes drain for gw but not for be or fe', () => {
    expect(planSwap('gw', base).steps).toContain('drain');
    expect(planSwap('be', base).steps).not.toContain('drain');
    expect(planSwap('fe', base).steps).not.toContain('drain');
  });

  it('never includes migrate or grant-alias for gw or fe', () => {
    for (const tier of ['gw', 'fe'] as const) {
      expect(planSwap(tier, base).steps).not.toContain('migrate');
      expect(planSwap(tier, base).steps).not.toContain('grant-alias');
    }
  });

  it('backfills step codes for be once the old colour has stopped, before committing', () => {
    const steps = planSwap('be', base).steps;
    expect(steps.indexOf('stop-blue')).toBeLessThan(steps.indexOf('backfill-step-codes'));
    expect(steps.indexOf('backfill-step-codes')).toBeLessThan(steps.indexOf('grant-alias'));
  });

  it('backfills step codes for be on a first-ever deploy too — the file may predate it', () => {
    const steps = planSwap('be', {
      routedColor: null,
      runningColors: [],
      recordedColor: null,
      phase: null,
    }).steps;
    expect(steps).toContain('stored-vocabularies-after-stop');
    expect(steps.indexOf('backfill-step-codes')).toBeLessThan(steps.indexOf('grant-alias'));
  });

  it('never backfills step codes for gw or fe', () => {
    for (const tier of ['gw', 'fe'] as const) {
      expect(planSwap(tier, base).steps).not.toContain('backfill-step-codes');
    }
  });

  it('always ends by committing', () => {
    expect(planSwap('fe', base).steps.at(-1)).toBe('commit');
  });
});

it('migrates through inert maintenance before application startup', () => {
  const steps = planSwap('be', base).steps;
  expect(steps).toContain('start-maintenance');
  expect(steps.indexOf('verify-blue-stopped')).toBeLessThan(steps.indexOf('start-maintenance'));
  expect(steps.indexOf('start-maintenance')).toBeLessThan(steps.indexOf('backup-db'));
  expect(steps.indexOf('migrate')).toBeLessThan(steps.indexOf('stop-maintenance'));
  expect(steps.indexOf('stop-maintenance')).toBeLessThan(steps.indexOf('record-writer-exposure'));
  expect(steps.indexOf('migrate')).toBeLessThan(steps.indexOf('start-green'));
});
