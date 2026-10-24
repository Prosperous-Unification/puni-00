import { describe, expect, test } from 'bun:test';

import { observation, source } from './fixture.test-support';
import {
  DeliveryObservationSchema,
  DeliveryReadingSchema,
  validateDeliveryObservation,
  validateDeliveryReading,
} from './observation';

describe('delivery observation boundary', () => {
  test('accepts opaque identities, revisions and resource labels from another provider', () => {
    expect(validateDeliveryObservation(observation()).change.revision).toBe('revision:next@β');
  });

  test('exports an inline wire schema without transforms or predicates', () => {
    expect(DeliveryReadingSchema.toJsonSchema()).toBeDefined();
    expect(DeliveryReadingSchema.in.toJsonSchema()).toEqual(
      DeliveryReadingSchema.out.toJsonSchema(),
    );
    expect(JSON.stringify(DeliveryReadingSchema.toJsonSchema())).not.toContain('$ref');
  });

  test('rejects malformed identities through the production parser', () => {
    for (const id of ['', '   ', 7, null]) {
      const malformed = observation();
      expect(() =>
        validateDeliveryObservation({
          ...malformed,
          change: { ...malformed.change, source: { ...source('change'), id } },
        }),
      ).toThrow();
    }
  });

  test('rejects malformed and impossible timestamps through the production parser', () => {
    for (const observedAt of ['yesterday', '2026-02-30T10:00:00Z', '2026-10-23T25:00:00Z']) {
      expect(() => validateDeliveryObservation({ ...observation(), observedAt })).toThrow();
    }
  });

  test('rejects reversed execution timing instead of producing a successful reading', () => {
    const reading = observation();
    reading.runs[0].attempts[0].executions[0].completedAt = '2026-10-23T08:00:00Z';
    expect(() => validateDeliveryObservation(reading)).toThrow('precede');
  });

  test('rejects duplicate performed execution identity', () => {
    const reading = observation();
    const attempt = reading.runs[0].attempts[0];
    attempt.executions.push({ ...attempt.executions[0], source: source('different-job') });
    expect(() => validateDeliveryObservation(reading)).toThrow('duplicate');
  });

  test('rejects stale checks presented as current revision checks', () => {
    const reading = observation();
    reading.checks[0].revision = 'revision:older';
    expect(() => validateDeliveryObservation(reading)).toThrow('revision');
  });

  test('permits a repeated opaque execution id scoped to a different provider', () => {
    const reading = observation();
    const attempt = reading.runs[0].attempts[0];
    attempt.executions.push({
      ...attempt.executions[0],
      source: { ...source('job:other'), provider: 'other-forge' },
    });
    expect(validateDeliveryObservation(reading).runs[0].attempts[0].executions).toHaveLength(3);
  });

  test('requires merged revision only for merged change state', () => {
    const reading = observation();
    reading.change.mergedRevision = 'revision:merge';
    expect(() => validateDeliveryObservation(reading)).toThrow('merged');
  });
});

test('validates observed, unsupported and unavailable readings at the exported boundary', () => {
  expect(validateDeliveryReading({ kind: 'observed', observation: observation() }).kind).toBe(
    'observed',
  );
  expect(validateDeliveryReading({ kind: 'unsupported', reason: 'Unknown link kind' })).toEqual({
    kind: 'unsupported',
    reason: 'Unknown link kind',
  });
  expect(
    validateDeliveryReading({
      kind: 'unavailable',
      reason: 'rate-limited',
      message: 'Try later',
      observedAt: '2026-10-23T10:00:00.000Z',
    }).kind,
  ).toBe('unavailable');
  const stale = observation();
  stale.checks[0].revision = 'old';
  expect(() => validateDeliveryReading({ kind: 'observed', observation: stale })).toThrow(
    'revision',
  );
  expect(() =>
    validateDeliveryReading({
      kind: 'unavailable',
      reason: 'missing',
      message: 'Gone',
      observedAt: '2026-02-30T10:00:00Z',
    }),
  ).toThrow('timestamp');
  expect(() => validateDeliveryReading({ kind: 'observed' })).toThrow();
});

test('wire schema rejects invalid UTC timestamp syntax without relying on semantic parsing', () => {
  for (const observedAt of ['tomorrow', '2026-10-23', '2026-10-23T10:00:00+01:00'])
    expect(() => DeliveryObservationSchema.assert({ ...observation(), observedAt })).toThrow();
});

test('schema and semantic refusals expose a typed delivery validation boundary', () => {
  const stale = observation();
  stale.checks[0].revision = 'older';
  for (const validate of [
    () => validateDeliveryObservation({ ...observation(), version: 2 }),
    () => validateDeliveryObservation(stale),
    () => validateDeliveryReading({ kind: 'observed' }),
    () =>
      validateDeliveryReading({
        kind: 'unavailable',
        reason: 'missing',
        message: 'Gone',
        observedAt: '2026-02-30T10:00:00Z',
      }),
  ]) {
    try {
      validate();
      throw new Error('Expected rejection');
    } catch (failure) {
      expect(failure).toMatchObject({ name: 'DeliveryValidationError' });
    }
  }
});
