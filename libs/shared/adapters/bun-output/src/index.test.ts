import { expect, it } from 'bun:test';

import { createOutputs } from './index';

it('fails pending and future writes after an owner deadline without leaving native tails referenced', async () => {
  const native = Promise.withResolvers<number>(),
    started = Promise.withResolvers<undefined>();
  let releases = 0,
    flushes = 0,
    stderrOpens = 0;
  const output = createOutputs({
    name: 'lock',
    stdout: () => ({
      write: () => {
        started.resolve(undefined);
        return native.promise;
      },
      flush: () => {
        flushes++;
        return 0;
      },
      unref: () => {
        releases++;
      },
    }),
    stderr: () => {
      stderrOpens++;
      return { write: (bytes) => bytes.length, flush: () => 0, unref: () => undefined };
    },
    subscribeInterrupts: () => () => undefined,
  });
  let settlement: unknown;
  const writing = output.stdout(new Uint8Array([255, 0, 65]));
  const observed = writing.then(
    (value) => {
      settlement = value;
    },
    (cause: unknown) => {
      settlement = { cause };
    },
  );
  try {
    await started.promise;
    const fault = new Error('controlled admission output deadline');
    output.failWrites(fault);
    await Bun.sleep(0);
    expect(settlement).toEqual({ cause: fault });
    expect(releases).toBe(1);
    expect(flushes).toBe(0);
    const future = await output.stderr(new Uint8Array([1])).then(
      (value) => ({ kind: 'written' as const, value }),
      (cause: unknown) => ({ kind: 'failed' as const, cause }),
    );
    expect(future).toEqual({ kind: 'failed', cause: fault });
    await Bun.sleep(0);
    expect(stderrOpens).toBe(0);
  } finally {
    output.dispose();
    native.resolve(3);
    await observed;
  }
  expect(flushes).toBe(0);
  expect(releases).toBe(1);
});
