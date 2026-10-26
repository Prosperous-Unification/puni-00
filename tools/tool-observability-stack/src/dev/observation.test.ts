import { expect, test } from 'bun:test';

import { assessObservation, type ObservationEvidence, type SignalEvidence } from './observation';

const identity = { environment: 'dev', service: 'wbs', revision: 'abc', observationId: 'o1' };
const found: SignalEvidence = {
  state: 'found',
  identity,
  observedAt: 1000,
  proof: { kind: 'record' },
};
const trace: SignalEvidence = {
  ...found,
  proof: {
    kind: 'trace',
    traceId: 't1',
    parentSpanId: 'p1',
    childSpanId: 'c1',
    childParentSpanId: 'p1',
  },
};
const complete = (): ObservationEvidence => ({ log: found, metric: found, trace });
const assess = (evidence: ObservationEvidence) => assessObservation(identity, evidence, 1100, 100);

test('accepts complete evidence exactly at freshness boundary', () => {
  expect(assess(complete()).state).toBe('complete');
});
test('distinguishes all absent, partial and unavailable queries', () => {
  const missing = { state: 'missing' } as const;
  expect(assess({ log: missing, metric: missing, trace: missing }).state).toBe('missing');
  expect(assess({ ...complete(), log: missing }).state).toBe('incomplete');
  const health = assess({ ...complete(), log: { state: 'unavailable', reason: 'query deadline' } });
  expect(health.state).toBe('incomplete');
  expect(health.signals.log).toEqual(['unavailable: query deadline']);
});
for (const field of ['environment', 'service', 'revision', 'observationId'] as const) {
  test(`rejects mismatched ${field}`, () => {
    const health = assess({
      ...complete(),
      log: { ...found, identity: { ...identity, [field]: 'wrong' } },
    });
    expect(health.state).toBe('incomplete');
    expect(health.signals.log).toContain(`identity.${field}`);
  });
  test(`refuses empty expected ${field}`, () => {
    expect(() => assessObservation({ ...identity, [field]: '' }, complete(), 1100, 100)).toThrow();
  });
}
for (const observedAt of [NaN, Infinity, -Infinity, -1, 1101]) {
  test(`rejects invalid/future time ${String(observedAt)}`, () => {
    const health = assess({ ...complete(), metric: { ...found, observedAt } });
    expect(health.state).toBe('incomplete');
    expect(health.signals.metric.length).toBeGreaterThan(0);
  });
}
test('names stale evidence even alongside missing and mismatched evidence', () => {
  const health = assess({
    log: { state: 'missing' },
    metric: { ...found, observedAt: 999 },
    trace: { ...trace, identity: { ...identity, revision: 'old' } },
  });
  expect(health.state).toBe('stale');
  expect(health.signals.metric).toContain('stale');
  expect(health.signals.log).toContain('missing');
  expect(health.signals.trace).toContain('identity.revision');
});
for (const proof of [
  { kind: 'record' },
  { kind: 'trace', traceId: '', parentSpanId: 'p', childSpanId: 'c', childParentSpanId: 'p' },
  { kind: 'trace', traceId: 't', parentSpanId: '', childSpanId: 'c', childParentSpanId: '' },
  { kind: 'trace', traceId: 't', parentSpanId: 'p', childSpanId: '', childParentSpanId: 'p' },
  { kind: 'trace', traceId: 't', parentSpanId: 'p', childSpanId: 'p', childParentSpanId: 'p' },
  { kind: 'trace', traceId: 't', parentSpanId: 'p', childSpanId: 'c', childParentSpanId: 'other' },
] as const) {
  test(`refuses partial trace ${JSON.stringify(proof)}`, () => {
    expect(assess({ ...complete(), trace: { ...trace, proof } }).state).toBe('incomplete');
  });
}
for (const [now, freshness] of [
  [NaN, 100],
  [-1, 100],
  [1100, 0],
  [1100, Infinity],
]) {
  test(`refuses invalid assessment clock/window ${String(now)}/${String(freshness)}`, () => {
    expect(() => assessObservation(identity, complete(), now, freshness)).toThrow();
  });
}
