import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { levelAt, type TokenBucketRate, TokenBuckets } from './token-bucket';

/** A step of a fake clock and what a client does then. */
type Step =
  | { readonly kind: 'advance'; readonly ms: number }
  | { readonly kind: 'take'; readonly key: 'a' | 'b' }
  | { readonly kind: 'give'; readonly key: 'a' | 'b' };

const rateArbitrary: fc.Arbitrary<TokenBucketRate> = fc.record({
  burst: fc.integer({ min: 1, max: 40 }),
  perSecond: fc.oneof(
    fc.constantFrom(5 / 60, 30 / 60, 300 / 60, 10),
    fc.double({ min: 0.01, max: 50, noNaN: true }),
  ),
});

const stepArbitrary: fc.Arbitrary<Step> = fc.oneof(
  fc.record({ kind: fc.constant('advance' as const), ms: fc.integer({ min: 0, max: 15_000 }) }),
  fc.record({
    kind: fc.constant('take' as const),
    key: fc.constantFrom('a' as const, 'b' as const),
  }),
  fc.record({
    kind: fc.constant('give' as const),
    key: fc.constantFrom('a' as const, 'b' as const),
  }),
);

describe('a token bucket on a fake clock', () => {
  it('never admits more than the burst plus the rate times the elapsed time plus what was given back, per key', () => {
    fc.assert(
      fc.property(rateArbitrary, fc.array(stepArbitrary, { maxLength: 200 }), (rate, steps) => {
        const clock = { now: 1_000_000 };
        const buckets = new TokenBuckets(rate, () => clock.now);
        const admitted = { a: 0, b: 0 };
        const given = { a: 0, b: 0 };
        for (const step of steps) {
          if (step.kind === 'advance') clock.now += step.ms;
          else if (step.kind === 'take' && buckets.take(step.key) === null) admitted[step.key] += 1;
          else if (step.kind === 'give') {
            buckets.give(step.key);
            given[step.key] += 1;
          }
        }
        const elapsedSeconds = (clock.now - 1_000_000) / 1_000;
        // A small epsilon absorbs floating-point refills.
        for (const key of ['a', 'b'] as const)
          expect(admitted[key]).toBeLessThanOrEqual(
            rate.burst + rate.perSecond * elapsedSeconds + given[key] + 1e-6,
          );
      }),
    );
  });

  it('admits a fresh key its whole burst at once, then refuses with a wait that suffices', () => {
    fc.assert(
      fc.property(rateArbitrary, (rate) => {
        const clock = { now: 0 };
        const buckets = new TokenBuckets(rate, () => clock.now);
        for (let taken = 0; taken < rate.burst; taken += 1) expect(buckets.take('a')).toBeNull();
        const waiting = buckets.take('a');
        expect(waiting).not.toBeNull();
        const seconds = waiting?.retryAfterSeconds ?? 0;
        expect(seconds).toBeGreaterThanOrEqual(1);
        // Waiting a second less than asked can still be too early; waiting what was asked is not.
        clock.now += seconds * 1_000;
        expect(buckets.take('a')).toBeNull();
      }),
    );
  });

  it('asks for the shortest whole-second wait that finds a token', () => {
    fc.assert(
      fc.property(rateArbitrary, fc.integer({ min: 0, max: 120_000 }), (rate, ms) => {
        const clock = { now: 0 };
        const buckets = new TokenBuckets(rate, () => clock.now);
        for (let taken = 0; taken < rate.burst; taken += 1) buckets.take('a');
        clock.now += ms;
        const waiting = buckets.retryAfter('a');
        if (waiting === null) return;
        if (waiting.retryAfterSeconds > 1) {
          clock.now += (waiting.retryAfterSeconds - 1) * 1_000 - 1;
          expect(buckets.retryAfter('a')).not.toBeNull();
        }
      }),
    );
  });

  it('keeps keys apart', () => {
    fc.assert(
      fc.property(rateArbitrary, fc.array(stepArbitrary, { maxLength: 100 }), (rate, steps) => {
        const clock = { now: 0 };
        const shared = new TokenBuckets(rate, () => clock.now);
        const alone = new TokenBuckets(rate, () => clock.now);
        for (const step of steps) {
          if (step.kind === 'advance') clock.now += step.ms;
          else if (step.kind === 'take') {
            const answer = shared.take(step.key);
            if (step.key === 'b') expect(answer).toEqual(alone.take('b'));
          } else {
            shared.give(step.key);
            if (step.key === 'b') alone.give('b');
          }
        }
        expect(shared.retryAfter('b')).toEqual(alone.retryAfter('b'));
      }),
    );
  });

  it('never holds more than the burst after a give', () => {
    fc.assert(
      fc.property(rateArbitrary, fc.integer({ min: 0, max: 80 }), (rate, gives) => {
        const buckets = new TokenBuckets(rate, () => 0);
        for (let given = 0; given < gives; given += 1) buckets.give('a');
        let admitted = 0;
        while (buckets.take('a') === null && admitted <= rate.burst) admitted += 1;
        expect(admitted).toBe(rate.burst);
      }),
    );
  });

  it('gives back exactly what a take took', () => {
    fc.assert(
      fc.property(rateArbitrary, fc.integer({ min: 1, max: 40 }), (rate, takes) => {
        const buckets = new TokenBuckets(rate, () => 0);
        let taken = 0;
        for (let attempt = 0; attempt < takes; attempt += 1)
          if (buckets.take('a') === null) taken += 1;
        for (let given = 0; given < taken; given += 1) buckets.give('a');
        let admitted = 0;
        while (buckets.take('a') === null && admitted <= rate.burst) admitted += 1;
        expect(admitted).toBe(rate.burst);
      }),
    );
  });

  it('admits at most the burst at once, however long the bucket sat idle', () => {
    fc.assert(
      fc.property(
        rateArbitrary,
        fc.array(stepArbitrary, { maxLength: 50 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (rate, steps, idleMs) => {
          const clock = { now: 0 };
          const buckets = new TokenBuckets(rate, () => clock.now);
          for (const step of steps) {
            if (step.kind === 'advance') clock.now += step.ms;
            else if (step.kind === 'take') buckets.take(step.key);
            else buckets.give(step.key);
          }
          clock.now += idleMs;
          let admitted = 0;
          while (buckets.take('a') === null && admitted <= rate.burst) admitted += 1;
          expect(admitted).toBeLessThanOrEqual(rate.burst);
        },
      ),
    );
  });

  it('counts a spend without refusing it, down to zero and no further', () => {
    fc.assert(
      fc.property(rateArbitrary, fc.integer({ min: 0, max: 80 }), (rate, spends) => {
        const clock = { now: 0 };
        const buckets = new TokenBuckets(rate, () => clock.now);
        for (let spent = 0; spent < spends; spent += 1) buckets.spend('a');
        expect(buckets.retryAfter('a') === null).toBe(spends < rate.burst);
        // Floored at zero: one token's refill makes one token, however many were spent.
        clock.now += Math.ceil(1_000 / rate.perSecond) + 1;
        expect(buckets.take('a')).toBeNull();
      }),
    );
  });

  it('counts a spend on a part-filled bucket, so the part is spent too', () => {
    fc.assert(
      fc.property(rateArbitrary, fc.double({ min: 0.05, max: 0.95, noNaN: true }), (rate, part) => {
        const clock = { now: 0 };
        const buckets = new TokenBuckets(rate, () => clock.now);
        for (let spent = 0; spent < rate.burst; spent += 1) buckets.spend('a');
        clock.now += (part / rate.perSecond) * 1_000;
        buckets.spend('a');
        // Empty again: what refilled before the spend is gone, so after less than one token's
        // refill there is no token; had the part been kept, there would be.
        clock.now += ((1 - part / 2) / rate.perSecond) * 1_000;
        expect(buckets.retryAfter('a')).not.toBeNull();
      }),
    );
  });

  it('carries a spend below zero down to its debt, and asks for the wait that pays it back', () => {
    fc.assert(
      fc.property(
        rateArbitrary,
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 120 }),
        (rate, debt, spends) => {
          const clock = { now: 0 };
          const buckets = new TokenBuckets(rate, () => clock.now, debt);
          for (let spent = 0; spent < spends; spent += 1) buckets.spend('a');
          const level = Math.max(-debt, rate.burst - spends);
          const waiting = buckets.retryAfter('a');
          if (level >= 1) {
            expect(waiting).toBeNull();
            return;
          }
          expect(waiting).not.toBeNull();
          const seconds = waiting?.retryAfterSeconds ?? 0;
          expect(seconds).toBe(Math.max(1, Math.ceil((1 - level) / rate.perSecond)));
          clock.now += seconds * 1_000;
          expect(buckets.take('a')).toBeNull();
        },
      ),
    );
  });

  it('refuses a negative or unbounded debt', () => {
    expect(() => new TokenBuckets({ burst: 1, perSecond: 1 }, () => 0, -1)).toThrow('debt');
    expect(() => new TokenBuckets({ burst: 1, perSecond: 1 }, () => 0, Infinity)).toThrow('debt');
  });

  it('gains nothing from a clock that steps back', () => {
    fc.assert(
      fc.property(rateArbitrary, fc.integer({ min: 1, max: 60_000 }), (rate, back) => {
        const level = levelAt({ tokens: 0, at: 100_000 }, rate, 100_000 - back);
        expect(level.tokens).toBe(0);
        expect(level.at).toBe(100_000);
      }),
    );
  });

  it('holds only the keys touched within two full-refill intervals', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 2_000 }), { maxLength: 300 }), (gaps) => {
        const rate = { burst: 5, perSecond: 5 };
        const fullRefillMs = 1_000;
        const clock = { now: 0 };
        const buckets = new TokenBuckets(rate, () => clock.now);
        const touchedAt: number[] = [];
        gaps.forEach((gap, index) => {
          clock.now += gap;
          buckets.take(`key-${String(index)}`);
          touchedAt.push(clock.now);
          const recent = touchedAt.filter((at) => clock.now - at < 2 * fullRefillMs).length;
          expect(buckets.size).toBeLessThanOrEqual(recent);
        });
      }),
    );
  });

  it('refuses a bucket that could admit nothing', () => {
    expect(() => new TokenBuckets({ burst: 0, perSecond: 1 }, () => 0)).toThrow('burst');
    expect(() => new TokenBuckets({ burst: 1, perSecond: 0 }, () => 0)).toThrow('rate');
  });
});
