import { expect, test } from 'bun:test';

import { startRegistryHttpObservation } from './registry-http-observation.fixture';
import { requireRejection } from './registry-rejection.fixture';

test('fetch observer preserves receiver, exact arguments and response while exposing only bounded classifications', async () => {
  const saved = globalThis.fetch;
  const response = new Response('private body', { status: 405 });
  const init = { method: 'POST', headers: { authorization: 'private token' } };
  const calls: unknown[][] = [];
  const receiver = { private: 'receiver' };
  globalThis.fetch = function (this: unknown, ...args: unknown[]) {
    calls.push([this, ...args]);
    return Promise.resolve(response);
  } as unknown as typeof fetch;
  const forwarded = globalThis.fetch;
  let now = 1000;
  const observer = startRegistryHttpObservation(() => now++);
  try {
    expect(
      await Reflect.apply(globalThis.fetch, receiver, [
        'http://127.0.0.1:5052/v2/retained/main/blobs/uploads/?secret=private',
        init,
      ]),
    ).toBe(response);
    expect(calls).toEqual([
      [receiver, 'http://127.0.0.1:5052/v2/retained/main/blobs/uploads/?secret=private', init],
    ]);
    const observed = observer.finish();
    expect(globalThis.fetch).toBe(forwarded);
    expect(observed.events).toEqual([
      {
        started: 1000,
        finished: 1001,
        method: 'POST',
        path: 'blob-start',
        endpoint: 'ordinary',
        status: 405,
        transport: 'none',
      },
    ]);
    expect(JSON.stringify(observed)).not.toMatch(/private|token|retained|uploads/);
  } finally {
    globalThis.fetch = saved;
  }
});

test('transport error identity is unchanged and only its fixed category is recorded', async () => {
  const saved = globalThis.fetch;
  const failure = Object.assign(new Error('private connection'), { code: 'ECONNREFUSED' });
  globalThis.fetch = (() => Promise.reject(failure)) as unknown as typeof fetch;
  const observer = startRegistryHttpObservation(() => 1000);
  try {
    expect((await requireRejection(globalThis.fetch('http://127.0.0.1:5052/v2/'))).cause).toBe(
      failure,
    );
    expect(observer.finish().events).toEqual([
      {
        started: 1000,
        finished: 1000,
        method: 'GET',
        path: 'ping',
        endpoint: 'ordinary',
        status: null,
        transport: 'refused',
      },
    ]);
  } finally {
    globalThis.fetch = saved;
  }
});

test('bounded observer retains the latest requests and marks discarded history', async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(null, { status: 200 }))) as unknown as typeof fetch;
  let now = 0;
  const observer = startRegistryHttpObservation(() => now++);
  try {
    for (let index = 0; index < 70; index++) await globalThis.fetch('http://127.0.0.1:5052/v2/');
    const observed = observer.finish();
    expect(observed.events).toHaveLength(64);
    expect(observed.truncated).toBe(true);
    expect(observed.pending).toBe(0);
    expect(observed.events[0]?.started).toBe(12);
    expect(observed.events.at(-1)?.finished).toBe(139);
  } finally {
    globalThis.fetch = saved;
  }
});

test('failed time observation does not change fetch outcome and becomes visible on finalization', async () => {
  const saved = globalThis.fetch;
  const response = new Response(null, { status: 200 });
  globalThis.fetch = (() => Promise.resolve(response)) as unknown as typeof fetch;
  const forwarded = globalThis.fetch;
  const observer = startRegistryHttpObservation(() => {
    throw new Error('private clock');
  });
  try {
    expect(await globalThis.fetch('http://127.0.0.1:5052/v2/')).toBe(response);
    expect(() => observer.finish()).toThrow('HTTP fixture observation failed');
    expect(globalThis.fetch).toBe(forwarded);
  } finally {
    globalThis.fetch = saved;
  }
});

test('HTTP receipt receiver refuses malformed, duplicate, oversized and private unknown fields', async () => {
  const { readRegistryHttpObservationOutput } = await import('./registry-http-observation.fixture');
  const valid =
    'task8-population-http:' + JSON.stringify({ events: [], truncated: false, pending: 0 });
  expect(readRegistryHttpObservationOutput(valid)).toEqual({
    state: 'valid',
    observation: { events: [], truncated: false, pending: 0 },
  });
  for (const stderr of [
    valid + '\n' + valid,
    'task8-population-http:{"private":"token"}',
    valid + 'x',
    'task8-population-http:' +
      JSON.stringify({ events: [], truncated: false, pending: 0, private: 'token' }),
    'x'.repeat(32769),
  ]) {
    const observed = readRegistryHttpObservationOutput(stderr);
    expect(observed.state).toBe('invalid');
    expect(JSON.stringify(observed)).not.toContain('private');
  }
  expect(readRegistryHttpObservationOutput('other')).toEqual({
    state: 'absent',
    observation: null,
  });
});
