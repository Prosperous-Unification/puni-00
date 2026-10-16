import { describe, expect, test } from 'bun:test';

import { runDomainProofWorker, startDomainProofWorker } from './domain-proof-worker';

async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

function createClock() {
  const waits: { milliseconds: number; signal: AbortSignal; advance: () => void }[] = [];
  return {
    waits,
    wait: (milliseconds: number, signal: AbortSignal): Promise<void> => {
      return new Promise((resolve) => {
        const advance = () => {
          signal.removeEventListener('abort', advance);
          resolve();
        };
        waits.push({ milliseconds, signal, advance });
        if (signal.aborted) advance();
        else signal.addEventListener('abort', advance, { once: true });
      });
    },
  };
}

describe('retained domain proof scheduling', () => {
  test('rejects sweep limits outside one through 32', () => {
    const checks = {
      resolver: { lookupTxt: () => Promise.resolve([]) },
      readDueProofs: () => Promise.resolve([]),
      finishProofCheck: () => Promise.resolve('checked' as const),
    };
    for (const limit of [0, -1, 33, Number.NaN, Number.POSITIVE_INFINITY, 1.5])
      expect(() => runDomainProofWorker(checks, 0, () => 0, limit)).toThrow(RangeError);
  });

  test('sweeps immediately and waits one hour after completion', async () => {
    const clock = createClock();
    let sweeps = 0;
    const worker = startDomainProofWorker({
      sweep: (_signal, limit) => {
        expect(limit).toBe(32);
        sweeps += 1;
        return Promise.resolve();
      },
      wait: clock.wait,
    });
    await settle();
    expect(sweeps).toBe(1);
    expect(clock.waits.map((wait) => wait.milliseconds)).toEqual([3_600_000]);
    clock.waits[0]?.advance();
    await settle();
    expect(sweeps).toBe(2);
    await worker.stop();
  });

  test('joins a running sweep before scheduling another', async () => {
    const clock = createClock();
    const held = Promise.withResolvers<undefined>();
    let sweeps = 0;
    const worker = startDomainProofWorker({
      sweep: async () => {
        sweeps += 1;
        await held.promise;
      },
      wait: clock.wait,
    });
    await settle();
    expect(sweeps).toBe(1);
    expect(clock.waits).toHaveLength(0);
    held.resolve(undefined);
    await settle();
    expect(clock.waits).toHaveLength(1);
    clock.waits[0]?.advance();
    await settle();
    expect(sweeps).toBe(2);
    await worker.stop();
  });

  test('aborts and joins in-flight work and never schedules after stop', async () => {
    const clock = createClock();
    const held = Promise.withResolvers<undefined>();
    let observedSignal: AbortSignal | undefined;
    let sweeps = 0;
    const worker = startDomainProofWorker({
      sweep: async (signal) => {
        observedSignal = signal;
        sweeps += 1;
        await held.promise;
      },
      wait: clock.wait,
    });
    await settle();
    let stopped = false;
    const stopping = worker.stop().then(() => {
      stopped = true;
    });
    await settle();
    expect(observedSignal?.aborted).toBe(true);
    expect(stopped).toBe(false);
    held.resolve(undefined);
    await stopping;
    expect(clock.waits).toHaveLength(0);
    expect(sweeps).toBe(1);
    await worker.stop();
  });

  test('cancels an idle timer without another sweep', async () => {
    const clock = createClock();
    let sweeps = 0;
    const worker = startDomainProofWorker({
      sweep: () => {
        sweeps += 1;
        return Promise.resolve();
      },
      wait: clock.wait,
    });
    await settle();
    await worker.stop();
    clock.waits[0]?.advance();
    await settle();
    expect(clock.waits[0]?.signal.aborted).toBe(true);
    expect(sweeps).toBe(1);
  });

  test('joins cancellation of the production timer', async () => {
    let sweeps = 0;
    const worker = startDomainProofWorker({
      sweep: () => {
        sweeps += 1;
        return Promise.resolve();
      },
    });
    await settle();
    await worker.stop();
    await worker.completed;
    expect(sweeps).toBe(1);
  }, 200);

  test('rejects completion and stop with an unexpected sweep failure', async () => {
    const fault = new Error('proof store unavailable');
    const clock = createClock();
    const worker = startDomainProofWorker({
      sweep: () => Promise.reject(fault),
      wait: clock.wait,
    });
    expect(await worker.completed.catch((cause: unknown) => cause)).toBe(fault);
    expect(await worker.stop().catch((cause: unknown) => cause)).toBe(fault);
    expect(clock.waits).toHaveLength(0);
  });
});
