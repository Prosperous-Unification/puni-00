import { describe, expect, it } from 'bun:test';

import type { Intervals } from '../../ports/timers';
import { ClaimLeaseSweep, type ClaimLeaseSweepOptions } from './claim-lease-sweep';

/** Intervals a test fires by hand. */
function manualIntervals(): Intervals & { fire: () => void; scheduled: () => number } {
  const callbacks = new Set<() => void>();
  return {
    every: (_milliseconds, callback) => {
      callbacks.add(callback);
      return () => callbacks.delete(callback);
    },
    fire: () => {
      for (const callback of callbacks) callback();
    },
    scheduled: () => callbacks.size,
  };
}

function sweepOver(
  overrides: Partial<ClaimLeaseSweepOptions> = {},
  workPackages: () => Promise<string[]> = () => Promise.resolve(['p1', 'p2']),
) {
  const intervals = manualIntervals();
  const asked: { at: number; limit: number }[] = [];
  const released: string[] = [];
  const errors: { error: unknown; workPackageId: string | null }[] = [];
  const sweep = new ClaimLeaseSweep({
    runner: {
      releaseExpiredLeases: (workPackageId) => {
        released.push(workPackageId);
        return Promise.resolve(1);
      },
    },
    workPackagesWithExpiredLeases: (at, limit) => {
      asked.push({ at, limit });
      return workPackages();
    },
    now: () => 1_000,
    intervals,
    intervalMs: 30_000,
    workPackagesPerTick: 50,
    onError: (error, workPackageId) => errors.push({ error, workPackageId }),
    ...overrides,
  });
  return { sweep, intervals, asked, released, errors };
}

describe('ClaimLeaseSweep', () => {
  it('sweeps at start and on every interval, bounded and at the clock', async () => {
    const { sweep, intervals, asked, released } = sweepOver();
    sweep.start();
    await sweep.settled();
    expect(sweep.isRunning()).toBe(true);
    intervals.fire();
    await sweep.settled();
    expect(asked).toEqual([
      { at: 1_000, limit: 50 },
      { at: 1_000, limit: 50 },
    ]);
    expect(released).toEqual(['p1', 'p2', 'p1', 'p2']);
    await sweep.stop();
  });

  it('coalesces requests during a tick into one follow-up', async () => {
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    let calls = 0;
    const { sweep, asked } = sweepOver({}, async () => {
      calls += 1;
      if (calls === 1) await gate;
      return [];
    });
    sweep.start();
    sweep.requestSweep();
    sweep.requestSweep();
    sweep.requestSweep();
    expect(asked).toHaveLength(1);
    open();
    await sweep.settled();
    expect(asked).toHaveLength(2);
    await sweep.stop();
  });

  it('reports a failed tick and keeps the schedule', async () => {
    let fail = true;
    const { sweep, intervals, errors, released } = sweepOver({}, () =>
      fail ? Promise.reject(new Error('database is locked')) : Promise.resolve(['p1']),
    );
    sweep.start();
    await sweep.settled();
    expect(errors).toHaveLength(1);
    fail = false;
    intervals.fire();
    await sweep.settled();
    expect(released).toEqual(['p1']);
    await sweep.stop();
  });

  it('releases the next work package on the same tick when one work package’s release throws', async () => {
    const { sweep, released, errors } = sweepOver({
      runner: {
        releaseExpiredLeases: (workPackageId) => {
          if (workPackageId === 'p1') return Promise.reject(new Error('corrupt work package'));
          released.push(workPackageId);
          return Promise.resolve(1);
        },
      },
    });
    sweep.start();
    await sweep.settled();
    expect(released).toEqual(['p2']);
    expect(errors.map(({ workPackageId }) => workPackageId)).toEqual(['p1']);
    await sweep.stop();
  });

  it('runs nothing before start or after stop', async () => {
    const { sweep, intervals, asked } = sweepOver();
    sweep.requestSweep();
    await sweep.settled();
    expect(asked).toHaveLength(0);
    sweep.start();
    await sweep.stop();
    expect(intervals.scheduled()).toBe(0);
    sweep.requestSweep();
    await sweep.settled();
    expect(asked).toHaveLength(1);
    expect(sweep.isRunning()).toBe(false);
  });
});
