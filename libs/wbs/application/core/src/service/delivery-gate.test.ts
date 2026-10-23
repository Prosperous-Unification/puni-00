import type { DeliveryReader, DeliveryReading } from '@shared/delivery';
import { expect, test } from 'bun:test';

import { DELIVERY_GATE_LIMITS, DeliveryGate, type DeliveryGateLimits } from './delivery-gate';

const url = 'https://github.com/puni/project/pull/12';
const reading: DeliveryReading = { kind: 'unsupported', reason: 'test-provider' };
const org = (organizationId: string) => ({ organizationId });
const open = () => new AbortController().signal;

function counting(answer: (url: string, signal?: AbortSignal) => Promise<DeliveryReading>) {
  const reads: string[] = [];
  const reader: DeliveryReader = {
    read: (savedUrl, signal) => {
      reads.push(savedUrl);
      return answer(savedUrl, signal);
    },
  };
  return { reader, reads };
}

/** Bun's matchers spin on DOMException, so compare the rejection's name only. */
async function nameOfRejection(pending: Promise<unknown>): Promise<string> {
  try {
    await pending;
  } catch (failure) {
    if (failure instanceof Error || failure instanceof DOMException) return failure.name;
    throw failure;
  }
  throw new Error('Expected a rejection');
}

const schedule = (ms: number, fire: () => void) => {
  const timer = setTimeout(fire, ms);
  return () => {
    clearTimeout(timer);
  };
};

function gate(
  reader: DeliveryReader,
  clock: { at: number },
  limits: Partial<DeliveryGateLimits> = {},
): DeliveryGate {
  return new DeliveryGate(reader, () => clock.at, schedule, { ...DELIVERY_GATE_LIMITS, ...limits });
}

test('defaults to the recorded design assumptions', () => {
  expect(DELIVERY_GATE_LIMITS).toEqual({
    cacheTtlMs: 60_000,
    organizationReads: 30,
    organizationWindowMs: 600_000,
    concurrentReads: 4,
    busyWaitMs: 5_000,
  });
});

test('serves a second read inside the TTL from the cache', async () => {
  const { reader, reads } = counting(() => Promise.resolve(reading));
  const clock = { at: 1_000 };
  const delivery = gate(reader, clock);
  expect(await delivery.read(org('a'), url, open())).toEqual({
    kind: 'served',
    reading,
    servedAt: 1_000,
  });
  clock.at = 60_999;
  expect(await delivery.read(org('b'), `${url}/`, open())).toEqual({
    kind: 'served',
    reading,
    servedAt: 60_999,
  });
  expect(reads).toEqual([url]);
  clock.at = 61_000;
  await delivery.read(org('a'), url, open());
  expect(reads).toEqual([url, url]);
});

test('refuses the 31st provider read of one organization with retryAfterSeconds', async () => {
  const { reader, reads } = counting(() => Promise.resolve(reading));
  const clock = { at: 0 };
  const delivery = gate(reader, clock, { cacheTtlMs: 0 });
  for (let index = 0; index < 30; index++)
    expect((await delivery.read(org('a'), url, open())).kind).toBe('served');
  expect(await delivery.read(org('a'), url, open())).toEqual({
    kind: 'rate-limited',
    retryAfterSeconds: 20,
  });
  expect(reads).toHaveLength(30);
  expect((await delivery.read(org('b'), url, open())).kind).toBe('served');
  expect((await delivery.read('legacy', url, open())).kind).toBe('served');
  clock.at = 20_000;
  expect((await delivery.read(org('a'), url, open())).kind).toBe('served');
  expect((await delivery.read(org('a'), url, open())).kind).toBe('rate-limited');
});

test('answers busy when every provider read slot stays taken', async () => {
  const pending: (() => void)[] = [];
  const { reader, reads } = counting(
    () =>
      new Promise<DeliveryReading>((resolve) => {
        pending.push(() => {
          resolve(reading);
        });
      }),
  );
  const delivery = gate(reader, { at: 0 }, { cacheTtlMs: 0, busyWaitMs: 20 });
  const held = Array.from({ length: 4 }, (_unused, index) =>
    delivery.read(org(`o${String(index)}`), url, open()),
  );
  expect(await delivery.read(org('late'), url, open())).toEqual({ kind: 'busy' });
  expect(reads).toHaveLength(4);
  for (const release of pending) release();
  for (const read of await Promise.all(held)) expect(read.kind).toBe('served');
});

test('a waiting read takes the next free slot and busy refunds its token', async () => {
  let release: () => void = () => {
    throw new Error('no read is pending');
  };
  const { reader, reads } = counting(
    () =>
      new Promise<DeliveryReading>((resolve) => {
        release = () => {
          resolve(reading);
        };
      }),
  );
  const delivery = gate(
    reader,
    { at: 0 },
    { cacheTtlMs: 0, concurrentReads: 1, busyWaitMs: 20, organizationReads: 2 },
  );
  const first = delivery.read(org('a'), url, open());
  expect(await delivery.read(org('a'), url, open())).toEqual({ kind: 'busy' });
  const waiting = delivery.read(org('a'), url, open());
  release();
  expect((await first).kind).toBe('served');
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(reads).toHaveLength(2);
  release();
  expect((await waiting).kind).toBe('served');
  expect(reads).toHaveLength(2);
});

test('passes the caller signal to the provider and caches no cancelled read', async () => {
  const signals: (AbortSignal | undefined)[] = [];
  const { reader, reads } = counting((_url, signal) => {
    signals.push(signal);
    return new Promise<DeliveryReading>((_resolve, reject) => {
      signal?.addEventListener('abort', () => {
        reject(new DOMException('closed', 'AbortError'));
      });
    });
  });
  const delivery = gate(reader, { at: 0 });
  const caller = new AbortController();
  const read = delivery.read(org('a'), url, caller.signal);
  await new Promise((resolve) => setTimeout(resolve, 0));
  caller.abort(new DOMException('closed', 'AbortError'));
  expect(await nameOfRejection(read)).toBe('AbortError');
  expect(signals[0]).toBe(caller.signal);
  const aborted = new AbortController();
  aborted.abort(new DOMException('closed', 'AbortError'));
  expect(await nameOfRejection(delivery.read(org('a'), url, aborted.signal))).toBe('AbortError');
  expect(reads).toEqual([url]);
});
