import { describe, expect, it } from 'bun:test';

import { inMemoryEventLog } from '../testing/replay-fixture';
import { RetentionTimer } from './retention-timer';

/**
 * A schedule a test advances by hand.
 *
 * Real `setInterval` would make this file the slowest in the suite and flaky
 * under load, and the thing under test is the sweeping, not the clock.
 */
function fakeSchedule() {
  let tick: (() => void) | null = null;
  let cleared = 0;
  return {
    setInterval: (fn: () => void) => {
      tick = fn;
      return 'handle';
    },
    clearInterval: () => {
      cleared += 1;
    },
    advance: () => {
      if (tick === null) throw new Error('the timer never started');
      tick();
    },
    clearedCount: () => cleared,
  };
}

async function seed(count: number) {
  const log = inMemoryEventLog();
  for (let n = 0; n < count; n++) await log.record('project:a', { n });
  return log;
}

describe('RetentionTimer', () => {
  it('prunes the log on every tick', async () => {
    const log = await seed(5);
    const schedule = fakeSchedule();
    const swept: number[] = [];
    const timer = new RetentionTimer({
      repo: log,
      maxPerSubscription: 2,
      intervalMs: 1_000,
      onSweep: (removed) => swept.push(removed),
      onError: (err) => {
        throw err;
      },
      ...schedule,
    });

    timer.start();
    schedule.advance();
    await timer.stop();

    expect(swept).toEqual([3]);
    expect(await log.oldestSeq('project:a')).toBe(3);
    // The sequence does not move backwards when rows go, so a client resuming
    // after a prune is refused rather than told it is up to date.
    expect(await log.latestSeq('project:a')).toBe(4);
  });

  it('keeps sweeping after one sweep fails', async () => {
    // A locked database is transient. Stopping on it would turn a blip into
    // permanent unbounded growth in the same file the domain lives in.
    const log = await seed(5);
    let calls = 0;
    const failing = {
      ...log,
      pruneBeyond: (max: number) => {
        calls += 1;
        if (calls === 1) return Promise.reject(new Error('database is locked'));
        return log.pruneBeyond(max);
      },
    };
    const schedule = fakeSchedule();
    const errors: unknown[] = [];
    const swept: number[] = [];
    const timer = new RetentionTimer({
      repo: failing,
      maxPerSubscription: 2,
      intervalMs: 1_000,
      onSweep: (removed) => swept.push(removed),
      onError: (err) => errors.push(err),
      ...schedule,
    });

    timer.start();
    schedule.advance();
    await Promise.resolve();
    schedule.advance();
    await timer.stop();

    expect(errors).toHaveLength(1);
    expect(swept).toEqual([3]);
  });

  it('stops the schedule and waits for a sweep already running', async () => {
    const log = await seed(5);
    const schedule = fakeSchedule();
    let released: (() => void) | null = null;
    const slow = {
      ...log,
      pruneBeyond: () =>
        new Promise<number>((resolve) => {
          released = () => {
            resolve(0);
          };
        }),
    };
    let finished = false;
    const timer = new RetentionTimer({
      repo: slow,
      maxPerSubscription: 2,
      intervalMs: 1_000,
      onSweep: () => {
        finished = true;
      },
      onError: (err) => {
        throw err;
      },
      ...schedule,
    });

    timer.start();
    schedule.advance();
    const stopping = timer.stop();
    released?.();
    await stopping;

    expect(finished).toBe(true);
    expect(schedule.clearedCount()).toBe(1);
  });

  it('does not start a second schedule', async () => {
    const log = await seed(1);
    const schedule = fakeSchedule();
    const timer = new RetentionTimer({
      repo: log,
      maxPerSubscription: 2,
      intervalMs: 1_000,
      onError: (err) => {
        throw err;
      },
      ...schedule,
    });

    timer.start();
    timer.start();
    await timer.stop();

    expect(schedule.clearedCount()).toBe(1);
  });
});
