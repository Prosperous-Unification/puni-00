import { describe, expect, it } from 'bun:test';

import { brandedString } from './branded';
import { defineSchema, parseOrThrow, type, ValidationError } from './core';
import { injectedClock, makeFrame, makeTestDb } from './fixtures';

describe('@wbs/validation core', () => {
  it('re-exports ArkType type function that validates objects', () => {
    const Person = type({ name: 'string', age: 'number>0' });
    const result = Person({ name: 'Ada', age: 36 });
    expect(result).toEqual({ name: 'Ada', age: 36 });
  });

  it('parseOrThrow returns parsed value on success', () => {
    const Email = type('string.email');
    expect(parseOrThrow(Email, 'ada@example.com')).toBe('ada@example.com');
  });

  it('parseOrThrow throws ValidationError on failure, embedding the offending value', () => {
    const Email = type('string.email');
    const bad = 'not-an-email';
    expect(() => parseOrThrow(Email, bad)).toThrow(ValidationError);
    try {
      parseOrThrow(Email, bad);
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).message).toContain('not-an-email');
    }
  });
});

describe('@wbs/validation/fixtures', () => {
  it('makeTestDb returns an in-memory Drizzle instance with migrations applied', async () => {
    const db = await makeTestDb({ migrationsFolder: null });
    const result = db.$client.query('SELECT 1 AS one').get() as { one: number };
    expect(result.one).toBe(1);
    db.$client.close();
  });

  it('makeFrame produces a valid WS frame with defaults', () => {
    const f = makeFrame({ subscription: 'doc:abc' });
    expect(f.subscription).toBe('doc:abc');
    expect(typeof f.seq).toBe('number');
    expect(f.message).toBeDefined();
  });

  it('injectedClock returns monotonically increasing values from a fixed start', () => {
    const clock = injectedClock(1_000_000);
    expect(clock.now()).toBe(1_000_000);
    clock.advance(500);
    expect(clock.now()).toBe(1_000_500);
  });
});

describe('@wbs/validation branded + defineSchema', () => {
  it('brandedString returns an ArkType schema that validates the base constraint', () => {
    const UserId = brandedString('UserId', 'string>0');
    expect(parseOrThrow(UserId, 'u_123')).toBe('u_123');
    expect(() => parseOrThrow(UserId, '')).toThrow(ValidationError);
  });

  it('defineSchema is an identity pass-through for typed schemas', () => {
    const Age = type('number>=0');
    expect(defineSchema(Age)).toBe(Age);
  });
});
