import { expect, test } from 'bun:test';

import { readRetainedObservation } from './history';

function observation() {
  return {
    version: 1,
    operationId: '7b55e932-5942-4673-a225-14b16b46a327',
    identity: {
      environment: 'test',
      service: 'worker',
      revision: 'release.2',
      observationId: 'event:1',
    },
    observedAt: 100,
    capturedAt: 200,
    authority: 'evidence-only',
    signals: {
      log: [{ id: 'log:1', fingerprint: 'a'.repeat(64) }],
      trace: [{ id: 'trace:1', fingerprint: 'b'.repeat(64) }],
      metric: [{ id: 'metric:1', fingerprint: 'c'.repeat(64) }],
    },
  };
}
test('neutral model retains non-dev identity without backend or runner bindings', () => {
  expect(readRetainedObservation(observation()).identity).toEqual({
    environment: 'test',
    service: 'worker',
    revision: 'release.2',
    observationId: 'event:1',
  });
});
test.each(['log', 'trace', 'metric'] as const)(
  'neutral %s references are nonempty and bounded',
  (kind) => {
    const empty = observation();
    empty.signals[kind] = [];
    expect(() => readRetainedObservation(empty)).toThrow();
    const oversized = observation();
    oversized.signals[kind] = Array.from(
      { length: kind === 'metric' ? 513 : 17 },
      (_, ordinal) => ({ id: `${kind}:${String(ordinal)}`, fingerprint: 'a'.repeat(64) }),
    );
    expect(() => readRetainedObservation(oversized)).toThrow();
  },
);
