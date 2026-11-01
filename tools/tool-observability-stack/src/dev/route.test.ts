import { randomUUID } from 'node:crypto';

import { expect, test } from 'bun:test';

import { assertRouteTransition, readRouteAcceptance, routeChecks } from './route';

function binding(target = '1') {
  return {
    environment: 'dev' as const,
    sourceRevision: 'a'.repeat(40),
    candidateRevision: 'b'.repeat(40),
    observedRevision: 'a'.repeat(40),
    adapterRevision: 'c'.repeat(40),
    artifactSHA256: 'd'.repeat(64),
    target: target.repeat(64),
    source: 'e'.repeat(64),
    stores: 'f'.repeat(64),
    routes: 'a'.repeat(64),
    selection: 'b'.repeat(64),
  };
}
function cohort() {
  const now = Date.now(),
    rehearsal = binding('1'),
    staged = binding('2');
  const member = (target: ReturnType<typeof binding>) => ({
    binding: target,
    startedAt: now - 120000,
    completedAt: now - 1,
    checks: routeChecks.map((check) => ({
      check,
      capture: { path: '/private/capture', sha256: 'b'.repeat(64) },
      projection: { path: '/private/projection', sha256: 'c'.repeat(64) },
    })),
    windows: [
      {
        observationId: 'one',
        observedAt: now - 90000,
        capture: { path: '/private/window-one', sha256: 'd'.repeat(64) },
      },
      {
        observationId: 'two',
        observedAt: now - 1000,
        capture: { path: '/private/window-two', sha256: 'e'.repeat(64) },
      },
    ],
  });
  return {
    wire: {
      version: 1,
      kind: 'reviewed-observability-acceptance',
      rehearsal: member(rehearsal),
      staged: member(staged),
    },
    expected: {
      rehearsal: structuredClone(rehearsal),
      staged: structuredClone(staged),
      maxAgeMs: 300000,
      freshnessWindowMs: 60000,
    },
    now,
  };
}

test('reviewed cohort accepts complete separately bound rehearsal and staged evidence', () => {
  const { wire, expected, now } = cohort();
  expect(readRouteAcceptance(wire, expected, now).staged.binding.target).toBe('2'.repeat(64));
});
test('fix1 core acceptance names controller convergence and effective workload isolation', () => {
  expect([...routeChecks]).toContain('controller-convergence');
  expect([...routeChecks]).toContain('effective-workload-isolation');
  expect([...routeChecks]).not.toContain('flux');
  expect([...routeChecks]).not.toContain('effective-pods-storage-network');
});
for (const fault of [
  'source-only',
  'missing-check',
  'duplicate-check',
  'wrong-target',
  'stale',
  'same-window',
  'same-target',
] as const) {
  test(`reviewed cohort refuses ${fault}`, () => {
    const { wire, expected, now } = cohort();
    if (fault === 'source-only') Object.assign(wire, { runtimeVerified: true });
    if (fault === 'missing-check') wire.staged.checks.pop();
    if (fault === 'duplicate-check') wire.staged.checks[1] = wire.staged.checks[0];
    if (fault === 'wrong-target') wire.staged.binding.target = '9'.repeat(64);
    if (fault === 'stale') wire.staged.completedAt = now - 600000;
    if (fault === 'same-window') wire.staged.windows[1] = wire.staged.windows[0];
    if (fault === 'same-target') {
      wire.staged.binding.target = wire.rehearsal.binding.target;
      expected.staged.target = expected.rehearsal.target;
    }
    expect(() => readRouteAcceptance(wire, expected, now)).toThrow();
  });
}

test('rollback and restore require the exact completed parent and reversed route', () => {
  const parent = {
    operationId: randomUUID(),
    kind: 'switch' as const,
    before: 'a'.repeat(64),
    after: 'b'.repeat(64),
    phase: 'completed' as const,
  };
  expect(() => {
    assertRouteTransition('rollback', parent.after, parent.before, parent);
  }).not.toThrow();
  expect(() => {
    assertRouteTransition('rollback', parent.before, parent.after, parent);
  }).toThrow();
  expect(() => {
    assertRouteTransition('restore', parent.before, parent.after, parent);
  }).toThrow();
  expect(() => {
    assertRouteTransition('rollback', parent.after, parent.before, {
      ...parent,
      phase: 'uncertain',
    });
  }).toThrow();
  expect(() => {
    assertRouteTransition('switch', parent.before, parent.before);
  }).toThrow();
  expect(() => {
    assertRouteTransition('switch', parent.before, parent.after, parent);
  }).toThrow();
});
