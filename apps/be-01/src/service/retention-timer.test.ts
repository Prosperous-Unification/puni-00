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
  let scheduled = 0;
  return {
    setInterval: (fn: () => void) => {
      tick = fn;
      scheduled += 1;
      return 'handle';
    },
    scheduledCount: () => scheduled,
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

/** The options the timer needs beyond its schedule, so a test can name only what it varies. */
const rethrow = (err: unknown): never => {
  throw err;
};

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
    // A macrotask, so every microtask the failed sweep queued has run and the
    // timer is idle again. `await Promise.resolve()` is one turn and leaves the
    // sweep still in flight, which the timer correctly refuses to double.
    await new Promise((resolve) => setTimeout(resolve, 0));
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
    // The `clearedCount` assertion alone was vacuous — agy caught it. A `start`
    // that scheduled nothing at all still set a handle for `stop` to clear, so
    // the test passed against a timer that never ran. Both numbers are asserted
    // now: one schedule created, and the second `start` adding none.
    const log = await seed(1);
    const schedule = fakeSchedule();
    const timer = new RetentionTimer({
      repo: log,
      maxPerSubscription: 2,
      intervalMs: 1_000,
      onError: rethrow,
      ...schedule,
    });

    timer.start();
    timer.start();
    await timer.stop();

    expect(schedule.scheduledCount()).toBe(1);
    expect(schedule.clearedCount()).toBe(1);
  });

  it('does not start a sweep on top of one still running', async () => {
    // codex, medium. Every tick started another sweep and overwrote `inFlight`,
    // so `stop()` waited only for the newest one and `process.exit(0)` could
    // land in the middle of an older DELETE — against a file the other
    // deployment colour is also using.
    const log = await seed(5);
    let started = 0;
    let release: (() => void) | null = null;
    const slow = {
      ...log,
      pruneBeyond: () => {
        started += 1;
        return new Promise<number>((resolve) => {
          release = () => {
            resolve(0);
          };
        });
      },
    };
    const schedule = fakeSchedule();
    const timer = new RetentionTimer({
      repo: slow,
      maxPerSubscription: 2,
      intervalMs: 1_000,
      onError: rethrow,
      ...schedule,
    });

    timer.start();
    schedule.advance();
    schedule.advance();
    schedule.advance();

    expect(started).toBe(1);

    const stopping = timer.stop();
    release?.();
    await stopping;

    // And the next tick after it finished would have swept again, had one come.
    expect(started).toBe(1);
  });
});
