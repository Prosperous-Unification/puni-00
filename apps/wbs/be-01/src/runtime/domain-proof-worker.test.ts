import type { Intervals } from '@wbs/core';
import type { DomainProofChecks } from '@wbs/core/ports/domain-challenges';
import { describe, expect, it } from 'bun:test';

import { DomainProofSchedule } from './domain-proof-worker';

/** Intervals whose ticks the test fires by hand. */
function manualIntervals() {
  const ticks: (() => void)[] = [];
  let cancelled = 0;
  const intervals: Intervals = {
    every: (_milliseconds, callback) => {
      ticks.push(callback);
      return () => {
        cancelled += 1;
      };
    },
  };
  return {
    intervals,
    tick: () => {
      for (const callback of ticks) callback();
    },
    scheduled: () => ticks.length,
    cancelled: () => cancelled,
  };
}

function checksReading(readDueProofs: DomainProofChecks['readDueProofs']): DomainProofChecks {
  return {
    resolver: { lookupTxt: () => Promise.reject(new Error('unused')) },
    readDueProofs,
    finishProofCheck: () => Promise.resolve('checked'),
  };
}

describe('DomainProofSchedule', () => {
  it('runs one proof check per tick and reports its counts', async () => {
    const clock = manualIntervals();
    const reads: number[] = [];
    const reports: { checked: number; stale: number }[] = [];
    const schedule = new DomainProofSchedule({
      checks: checksReading((at) => {
        reads.push(at);
        return Promise.resolve([]);
      }),
      intervals: clock.intervals,
      intervalMs: 60_000,
      now: () => 1_000,
      onChecked: (counts) => reports.push(counts),
      onError: (error) => {
        throw error;
      },
    });

    expect(schedule.isRunning()).toBe(false);
    schedule.start();
    schedule.start();
    expect([schedule.isRunning(), clock.scheduled()]).toEqual([true, 1]);
    await Bun.sleep(0);
    clock.tick();
    await schedule.stop();

    expect(reads).toEqual([1_000, 1_000]);
    expect(reports).toEqual([
      { checked: 0, stale: 0 },
      { checked: 0, stale: 0 },
    ]);
    expect([schedule.isRunning(), clock.cancelled()]).toEqual([false, 1]);
  });

  it('reports a failed run and keeps the schedule', async () => {
    const clock = manualIntervals();
    const errors: unknown[] = [];
    const schedule = new DomainProofSchedule({
      checks: checksReading(() => Promise.reject(new Error('corrupt retained proof'))),
      intervals: clock.intervals,
      intervalMs: 60_000,
      now: () => 1_000,
      onError: (error) => errors.push(error),
    });
    schedule.start();
    await Bun.sleep(0);
    clock.tick();
    await Bun.sleep(0);
    expect(schedule.isRunning()).toBe(true);
    await schedule.stop();

    expect(errors.map((error) => (error instanceof Error ? error.message : error))).toEqual([
      'corrupt retained proof',
      'corrupt retained proof',
    ]);
  });

  it('drops a tick while a run is in flight and stop waits for that run', async () => {
    const clock = manualIntervals();
    const release = Promise.withResolvers<readonly []>();
    let reads = 0;
    let finished = false;
    const schedule = new DomainProofSchedule({
      checks: checksReading(() => {
        reads += 1;
        return release.promise;
      }),
      intervals: clock.intervals,
      intervalMs: 60_000,
      now: () => 1_000,
      onChecked: () => {
        finished = true;
      },
      onError: (error) => {
        throw error;
      },
    });
    schedule.start();
    clock.tick();
    clock.tick();
    const stopped = schedule.stop();
    await Promise.resolve();
    expect([reads, finished]).toEqual([1, false]);
    release.resolve([]);
    await stopped;

    expect(finished).toBe(true);
  });

  it('checks once at start, without waiting a whole interval', async () => {
    const clock = manualIntervals();
    const reads: number[] = [];
    const schedule = new DomainProofSchedule({
      checks: checksReading((at) => {
        reads.push(at);
        return Promise.resolve([]);
      }),
      intervals: clock.intervals,
      intervalMs: 3_600_000,
      now: () => 1_000,
      onError: (error) => {
        throw error;
      },
    });
    schedule.start();
    await schedule.stop();

    expect(reads).toEqual([1_000]);
  });

  it('stops between proofs instead of finishing every due proof', async () => {
    const clock = manualIntervals();
    const looked = Promise.withResolvers<undefined>();
    const answer = Promise.withResolvers<readonly string[]>();
    const finished: string[] = [];
    const proof = (id: string) => ({
      id,
      organizationId: 'org-a',
      domain: `${id}.example.org`,
      proofDigest: 'a'.repeat(64),
      previousProofDigest: null,
      previousProofValidUntil: null,
      lastCheckedAt: 0,
    });
    const schedule = new DomainProofSchedule({
      checks: {
        resolver: {
          lookupTxt: () => {
            looked.resolve(undefined);
            return answer.promise;
          },
        },
        readDueProofs: () => Promise.resolve([proof('first'), proof('second')]),
        finishProofCheck: (checked) => {
          finished.push(checked.id);
          return Promise.resolve('checked');
        },
      },
      intervals: clock.intervals,
      intervalMs: 3_600_000,
      now: () => 1_000,
      onError: (error) => {
        throw error;
      },
    });
    schedule.start();
    await looked.promise;
    const stopped = schedule.stop();
    answer.resolve([]);
    await stopped;

    expect(finished).toEqual(['first']);
  });
});
