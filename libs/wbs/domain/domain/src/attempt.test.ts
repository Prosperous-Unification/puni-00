import { describe, expect, it } from 'bun:test';

import { type Attempt, attemptOf, spanOfAttempts } from './attempt';

const ended = (attemptNumber: number, startedAt: number, endedAt: number): Attempt =>
  attemptOf({
    attemptNumber,
    startedAt,
    endedAt,
    outcome: 'failed',
    executorPersonId: null,
    reference: null,
    note: null,
  });

const running = (attemptNumber: number, startedAt: number): Attempt =>
  attemptOf({
    attemptNumber,
    startedAt,
    endedAt: null,
    outcome: null,
    executorPersonId: null,
    reference: null,
    note: null,
  });

describe('spanOfAttempts', () => {
  it('spanOfAttempts is first start to last end, open while one runs, absent with none', () => {
    expect(spanOfAttempts([ended(1, 100, 200), ended(2, 300, 450)])).toEqual({
      start: 100,
      end: 450,
    });
    // A later number may carry an earlier `at`: the span is the instants, not the numbers.
    expect(spanOfAttempts([ended(1, 300, 400), ended(2, 50, 120)])).toEqual({
      start: 50,
      end: 400,
    });
    expect(spanOfAttempts([ended(1, 100, 200), running(2, 300)])).toEqual({
      start: 100,
      end: null,
    });
    expect(spanOfAttempts([])).toBeUndefined();
  });
});

describe('attemptOf', () => {
  it('a running attempt has no outcome and no end', () => {
    const base = {
      attemptNumber: 1,
      startedAt: 100,
      executorPersonId: null,
      reference: null,
      note: null,
    };
    expect(attemptOf({ ...base, endedAt: null, outcome: null }).outcome).toBeNull();
    expect(() => attemptOf({ ...base, endedAt: null, outcome: 'failed' })).toThrow(
      /running attempt carries an outcome/,
    );
    expect(() => attemptOf({ ...base, endedAt: 200, outcome: null })).toThrow(
      /ended attempt has no outcome/,
    );
    expect(() => attemptOf({ ...base, endedAt: 50, outcome: 'failed' })).toThrow(
      /ends before it starts/,
    );
    expect(() => attemptOf({ ...base, attemptNumber: 0, endedAt: null, outcome: null })).toThrow(
      /attempt number/,
    );
  });
});
