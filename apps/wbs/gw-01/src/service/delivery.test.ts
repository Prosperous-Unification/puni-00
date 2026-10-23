import { systemTimers } from '@wbs/runtime-portable';
import { expect, test } from 'bun:test';

import { SocketDelivery } from './delivery';

function deferred() {
  let release: () => void = () => {
    throw new Error('not initialized');
  };
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    pending,
    release: () => {
      release();
    },
  };
}

function create(
  write: (payload: string, signal: AbortSignal) => 'sent' | 'backpressured' | 'dropped',
  capacity = 2,
  deadlineMs = 100,
  admit: (signal: AbortSignal) => Promise<'admitted' | 'incompatible'> = () =>
    Promise.resolve('admitted'),
) {
  const cancellation = new AbortController();
  const retirements: string[] = [];
  const failures: unknown[] = [];
  const delivery = new SocketDelivery({
    write: (payload) => write(payload, cancellation.signal),
    admit,
    signal: cancellation.signal,
    timers: systemTimers,
    capacity,
    deadlineMs,
    onRetired: (reason, caught) => {
      retirements.push(reason);
      failures.push(caught);
    },
  });
  return { delivery, retirements, failures, cancellation };
}

test('orders producers and counts Bun backpressure as accepted without retry', async () => {
  const gate = deferred();
  const written: string[] = [];
  let admissions = 0;
  const { delivery } = create(
    (payload) => {
      written.push(payload);
      return payload === 'ack' ? 'backpressured' : 'sent';
    },
    2,
    100,
    async () => {
      if (admissions++ === 0) await gate.pending;
      return 'admitted';
    },
  );
  const replay = delivery.send('replay');
  const ack = delivery.send('ack');
  await Bun.sleep(5);
  expect(written).toEqual([]);
  gate.release();
  expect(await replay).toBe('sent');
  expect(await ack).toBe('backpressured');
  expect(written).toEqual(['replay', 'ack']);
});

test('overflow retires once and cancels every queued write', async () => {
  const gate = deferred();
  const written: string[] = [];
  const { delivery, retirements } = create(
    (payload) => {
      written.push(payload);
      return 'sent' as const;
    },
    2,
    100,
    async () => {
      await gate.pending;
      return 'admitted';
    },
  );
  const first = delivery.send('first');
  const second = delivery.send('second');
  expect(await delivery.send('overflow')).toBe('retired');
  expect(await Promise.all([first, second])).toEqual(['retired', 'retired']);
  expect(retirements).toEqual(['overflow']);
  gate.release();
  await Bun.sleep(5);
  expect(written).toEqual([]);
});

test('bounds a signal-ignoring admission by deadline and never starts its queued successor', async () => {
  const gate = deferred();
  const started: string[] = [];
  const { delivery, retirements } = create(
    (payload) => {
      started.push(payload);
      return 'sent';
    },
    2,
    15,
    async () => {
      await gate.pending;
      return 'admitted';
    },
  );
  const first = delivery.send('first');
  const second = delivery.send('second');
  expect(await Promise.all([first, second])).toEqual(['retired', 'retired']);
  expect(retirements).toEqual(['deadline']);
  expect(started).toEqual([]);
  gate.release();
  await Bun.sleep(5);
  expect(started).toEqual([]);
});

test('writer rejection and physical drop retire without false acceptance or detached rejection', async () => {
  for (const mode of ['reject', 'drop'] as const) {
    const { delivery, retirements, failures } = create(() => {
      if (mode === 'reject') throw new Error('transport failed');
      return 'dropped';
    });
    expect(await delivery.send('frame')).toBe('retired');
    expect(await delivery.send('after')).toBe('retired');
    expect(retirements).toEqual([mode === 'reject' ? 'failure' : 'dropped']);
    if (mode === 'reject') expect(failures[0]).toMatchObject({ message: 'transport failed' });
  }
});

test('connection cancellation settles a stalled delivery and blocks later writes', async () => {
  let writes = 0;
  const { delivery, cancellation, retirements } = create(
    () => {
      writes++;
      return 'sent';
    },
    2,
    100,
    () => new Promise(() => undefined),
  );
  const sending = delivery.send('frame');
  await Bun.sleep(2);
  cancellation.abort(new Error('connection closed'));
  expect(await Promise.race([sending, Bun.sleep(25).then(() => 'still_pending')])).toBe('retired');
  expect(await delivery.send('after')).toBe('retired');
  expect(writes).toBe(0);
  expect(retirements).toEqual([]);
});

test('an already closed connection starts no physical writer', async () => {
  const cancellation = new AbortController();
  cancellation.abort(new Error('closed before delivery creation'));
  let writes = 0;
  const delivery = new SocketDelivery({
    admit: () => Promise.resolve('admitted'),
    write: () => {
      writes++;
      return 'sent';
    },
    signal: cancellation.signal,
    timers: systemTimers,
    capacity: 2,
    deadlineMs: 20,
    onRetired: () => {
      throw new Error('already closed is not a new failure');
    },
  });
  expect(await Promise.all(Array.from({ length: 10 }, () => delivery.send('after close')))).toEqual(
    Array.from({ length: 10 }, () => 'retired'),
  );
  expect(writes).toBe(0);
});

test('invalid queue limits cannot disable delivery bounds', () => {
  for (const capacity of [0, -1, Infinity, NaN, 1.5])
    expect(() => create(() => 'sent', capacity)).toThrow('finite positive');
  for (const deadline of [0, -1, Infinity, NaN])
    expect(() => create(() => 'sent', 2, deadline)).toThrow('finite positive');
});

test('withheld deadline callbacks never allow an expired queued frame to reach its writer', async () => {
  for (const elapsed of [25, 5]) {
    let now = 0;
    let writes = 0;
    const retirements: string[] = [];
    const delivery = new SocketDelivery({
      admit: () => Promise.resolve('admitted'),
      write: () => {
        writes++;
        return 'sent';
      },
      signal: new AbortController().signal,
      timers: {
        nowMs: () => now,
        // The clock advances while the event loop has not run its timer callback.
        schedule: () => () => undefined,
      },
      capacity: 2,
      deadlineMs: 5,
      onRetired: (reason) => {
        retirements.push(reason);
      },
    });
    const sending = delivery.send('expired while awaiting predecessor');
    now = elapsed;
    expect(await sending).toBe('retired');
    expect(writes).toBe(0);
    expect(retirements).toEqual(['deadline']);
  }
});

test('each FIFO head freshly admits and incompatible authority stops queued frames', async () => {
  let enabled = false;
  const written: string[] = [];
  const retired: string[] = [];
  const delivery = new SocketDelivery({
    admit: () => Promise.resolve(enabled ? 'incompatible' : 'admitted'),
    write: (payload) => {
      written.push(payload);
      enabled = true;
      return 'sent';
    },
    signal: new AbortController().signal,
    timers: systemTimers,
    capacity: 2,
    deadlineMs: 100,
    onRetired: (reason) => {
      retired.push(reason);
    },
  });
  expect(await Promise.all([delivery.send('first'), delivery.send('second')])).toEqual([
    'sent',
    'retired',
  ]);
  expect(written).toEqual(['first']);
  expect(retired).toEqual(['incompatible']);
});

test('held admission cancellation never reaches synchronous writer', async () => {
  const gate = deferred();
  const cancellation = new AbortController();
  let writes = 0;
  const delivery = new SocketDelivery({
    admit: async () => {
      await gate.pending;
      return 'admitted';
    },
    write: () => {
      writes++;
      return 'sent';
    },
    signal: cancellation.signal,
    timers: systemTimers,
    capacity: 2,
    deadlineMs: 100,
    onRetired: () => {
      throw new Error('normal cancellation');
    },
  });
  const sending = delivery.send('held');
  await Bun.sleep(2);
  cancellation.abort();
  expect(await sending).toBe('retired');
  gate.release();
  await Bun.sleep(2);
  expect(writes).toBe(0);
});

test('held admission exact expiry blocks writer even with withheld deadline callback', async () => {
  const gate = deferred();
  let now = 0;
  let writes = 0;
  const retired: string[] = [];
  const delivery = new SocketDelivery({
    admit: async () => {
      await gate.pending;
      return 'admitted';
    },
    write: () => {
      writes++;
      return 'sent';
    },
    signal: new AbortController().signal,
    timers: { nowMs: () => now, schedule: () => () => undefined },
    capacity: 2,
    deadlineMs: 5,
    onRetired: (reason) => {
      retired.push(reason);
    },
  });
  const sending = delivery.send('held');
  await Bun.sleep(2);
  now = 5;
  gate.release();
  expect(await sending).toBe('retired');
  expect(writes).toBe(0);
  expect(retired).toEqual(['deadline']);
});

test('incompatible retirement callback failures remain observable to the producer', async () => {
  const delivery = new SocketDelivery({
    admit: () => Promise.resolve('incompatible'),
    write: () => 'sent',
    signal: new AbortController().signal,
    timers: systemTimers,
    capacity: 1,
    deadlineMs: 100,
    onRetired: () => {
      throw new Error('retirement infrastructure failed');
    },
  });
  const failure: unknown = await delivery.send('incompatible').then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(failure).toMatchObject({ message: 'retirement infrastructure failed' });
});
