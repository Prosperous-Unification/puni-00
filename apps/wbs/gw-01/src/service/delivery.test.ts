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
  write: (
    payload: string,
    signal: AbortSignal,
  ) => 'sent' | 'backpressured' | 'dropped' | Promise<'sent' | 'backpressured' | 'dropped'>,
  capacity = 2,
  deadlineMs = 100,
) {
  const cancellation = new AbortController();
  const retirements: string[] = [];
  const failures: unknown[] = [];
  const delivery = new SocketDelivery({
    write,
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
  const { delivery } = create(async (payload) => {
    if (payload === 'replay') await gate.pending;
    written.push(payload);
    return payload === 'ack' ? 'backpressured' : 'sent';
  });
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
  const { delivery, retirements } = create(async (payload, signal) => {
    await gate.pending;
    signal.throwIfAborted();
    written.push(payload);
    return 'sent' as const;
  });
  const first = delivery.send('first');
  const second = delivery.send('second');
  expect(await delivery.send('overflow')).toBe('retired');
  expect(await Promise.all([first, second])).toEqual(['retired', 'retired']);
  expect(retirements).toEqual(['overflow']);
  gate.release();
  await Bun.sleep(5);
  expect(written).toEqual([]);
});

test('bounds a signal-ignoring writer by deadline and never starts its queued successor', async () => {
  const gate = deferred();
  const started: string[] = [];
  const { delivery, retirements } = create(
    async (payload) => {
      started.push(payload);
      await gate.pending;
      return 'sent' as const;
    },
    2,
    15,
  );
  const first = delivery.send('first');
  const second = delivery.send('second');
  expect(await Promise.all([first, second])).toEqual(['retired', 'retired']);
  expect(retirements).toEqual(['deadline']);
  expect(started).toEqual(['first']);
  gate.release();
  await Bun.sleep(5);
  expect(started).toEqual(['first']);
});

test('writer rejection and physical drop retire without false acceptance or detached rejection', async () => {
  for (const mode of ['reject', 'drop'] as const) {
    const { delivery, retirements, failures } = create(() =>
      mode === 'reject' ? Promise.reject(new Error('transport failed')) : 'dropped',
    );
    expect(await delivery.send('frame')).toBe('retired');
    expect(await delivery.send('after')).toBe('retired');
    expect(retirements).toEqual([mode === 'reject' ? 'failure' : 'dropped']);
    if (mode === 'reject') expect(failures[0]).toMatchObject({ message: 'transport failed' });
  }
});

test('connection cancellation settles a stalled delivery and blocks later writes', async () => {
  let writes = 0;
  const { delivery, cancellation, retirements } = create(() => {
    writes++;
    return new Promise(() => undefined);
  });
  const sending = delivery.send('frame');
  await Bun.sleep(2);
  cancellation.abort(new Error('connection closed'));
  expect(await Promise.race([sending, Bun.sleep(25).then(() => 'still_pending')])).toBe('retired');
  expect(await delivery.send('after')).toBe('retired');
  expect(writes).toBe(1);
  expect(retirements).toEqual([]);
});

test('an already closed connection starts no physical writer', async () => {
  const cancellation = new AbortController();
  cancellation.abort(new Error('closed before delivery creation'));
  let writes = 0;
  const delivery = new SocketDelivery({
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
