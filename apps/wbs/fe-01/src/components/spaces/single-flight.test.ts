import { describe, expect, it } from 'vitest';

import { singleFlight } from './single-flight';

/** A read that stays in flight until `finish` is called with its index. */
function gatedRead() {
  const finishes: (() => void)[] = [];
  return {
    read: () =>
      new Promise<void>((resolve) => {
        finishes.push(resolve);
      }),
    finish: (at: number) => {
      finishes[at]?.();
    },
    count: () => finishes.length,
  };
}

describe('singleFlight', () => {
  it('joins the read in flight', async () => {
    const gate = gatedRead();
    const reads = singleFlight(gate.read);
    const mounted = reads.join();
    const focused = reads.join();
    expect(gate.count()).toBe(1);
    gate.finish(0);
    await Promise.all([mounted, focused]);
    const polled = reads.join();
    expect(gate.count()).toBe(2);
    gate.finish(1);
    await polled;
  });

  it('queues one fresh read behind the read in flight', async () => {
    const gate = gatedRead();
    const reads = singleFlight(gate.read);
    const polled = reads.join();
    const afterWrite = reads.fresh();
    const afterAnotherWrite = reads.fresh();
    expect(gate.count()).toBe(1);
    gate.finish(0);
    await polled;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(gate.count()).toBe(2);
    gate.finish(1);
    await Promise.all([afterWrite, afterAnotherWrite]);
    expect(gate.count()).toBe(2);
  });

  it('still runs the fresh read when the one in flight fails', async () => {
    let calls = 0;
    const reads = singleFlight(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('down')) : Promise.resolve();
    });
    const failed = reads.join();
    const afterWrite = reads.fresh();
    await expect(failed).rejects.toThrow('down');
    await afterWrite;
    expect(calls).toBe(2);
  });
});
