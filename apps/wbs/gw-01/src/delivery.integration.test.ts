import { systemTimers } from '@wbs/runtime-portable';
import { expect, test } from 'bun:test';
import { Elysia } from 'elysia';

import { internalController } from './controller/internal.controller';
import { handleWsMessage, type WsSocket } from './controller/ws.controller';
import { SocketDelivery } from './service/delivery';
import { GatewayMetrics } from './service/gateway-metrics';
import { Presence } from './service/presence';
import { SubscriptionMap } from './service/subscription-map';
import { grantingAccess } from './testing/project-access';

const SECRET = 's'.repeat(32);
const PROJECT = 'project:11111111-1111-4111-8111-111111111111';

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

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 1000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('delivery observation deadline');
    await Bun.sleep(2);
  }
}

test('push awaits asynchronous recipient outcome and never counts a failed send', async () => {
  const gate = deferred();
  const subs = new SubscriptionMap<WsSocket>();
  const retired: string[] = [];
  subs.subscribe(
    PROJECT,
    new SocketDelivery({
      admit: async () => {
        await gate.pending;
        return 'admitted';
      },
      write: () => {
        throw new Error('transport failed');
      },
      signal: new AbortController().signal,
      timers: systemTimers,
      capacity: 2,
      deadlineMs: 1000,
      onRetired: (reason) => {
        retired.push(reason);
      },
    }),
  );
  subs.subscribe(PROJECT, { send: () => Promise.resolve('sent') });
  const metrics = new GatewayMetrics();
  const app = new Elysia().use(internalController({ secret: SECRET, subs, metrics })).listen(0);
  const port = app.server?.port;
  if (port === undefined) throw new Error('push server did not listen');
  try {
    let settled = false;
    const pushing = fetch(`http://localhost:${String(port)}/internal/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-auth': SECRET },
      body: JSON.stringify({ subscription: PROJECT, seq: 10, message: { text: 'live' } }),
    }).then(async (response) => {
      settled = true;
      expect(response.status).toBe(202);
      return response.json();
    });
    await Bun.sleep(20);
    expect(settled).toBe(false);
    gate.release();
    expect(await pushing).toEqual({ delivered_to_sockets: 1 });
    expect(metrics.counters.messageFanoutTotal).toBe(1);
    expect(retired).toEqual(['failure']);
  } finally {
    gate.release();
    await app.stop(true);
  }
});

test('delayed replay reaches its recipient before later replay and resume acknowledgement', async () => {
  const gate = deferred();
  const written: string[] = [];
  let attempted = false;
  const replaying = handleWsMessage({
    frame: { type: 'resume', resume_points: { [PROJECT]: 0 } },
    socket: {
      send: async (payload) => {
        if ((JSON.parse(payload) as { seq?: number }).seq === 1) {
          attempted = true;
          await gate.pending;
        }
        written.push(payload);
        return 'sent';
      },
    },
    subs: new SubscriptionMap(),
    connectionId: 'retained',
    clientId: 'ada',
    access: grantingAccess(),
    reportUnexpectedBackendFailure: () => {
      throw new Error('unexpected backend failure');
    },
    forward: () => Promise.resolve({ ack: true }),
    resume: () =>
      Promise.resolve({
        [PROJECT]: {
          status: 'replaying',
          events: [
            { seq: 1, message: 'first' },
            { seq: 2, message: 'second' },
          ],
        },
      }),
  });
  try {
    await until(() => attempted);
    expect(written).toEqual([]);
    gate.release();
    await replaying;
    expect(
      written.map((payload) => {
        const frame = JSON.parse(payload) as { seq?: number; type?: string };
        return frame.seq ?? frame.type;
      }),
    ).toEqual([1, 2, 'resume_ack']);
  } finally {
    gate.release();
    await replaying;
  }
});

test('presence exposes asynchronous delivery failure while reaching healthy recipients', async () => {
  const presence = new Presence();
  let healthy = false;
  presence.join('failed', 'ada', {
    send: () => Promise.reject(new Error('roster transport failed')),
  });
  presence.join('healthy', 'grace', {
    send: () => {
      healthy = true;
      return Promise.resolve('sent');
    },
  });
  presence.enterProject('failed', PROJECT);
  presence.enterProject('healthy', PROJECT);
  const failure: unknown = await presence.broadcast([PROJECT]).then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(failure).toMatchObject({ message: 'roster transport failed' });
  expect(healthy).toBe(true);
});

test('a retired replay stops before any later event or acknowledgement', async () => {
  const attempted: string[] = [];
  await handleWsMessage({
    frame: { type: 'resume', resume_points: { [PROJECT]: 0 } },
    socket: {
      send: (payload) => {
        attempted.push(payload);
        return Promise.resolve('retired');
      },
    },
    subs: new SubscriptionMap(),
    connectionId: 'retained',
    clientId: 'ada',
    access: grantingAccess(),
    reportUnexpectedBackendFailure: () => {
      throw new Error('unexpected backend failure');
    },
    forward: () => Promise.resolve({ ack: true }),
    resume: () =>
      Promise.resolve({
        [PROJECT]: {
          status: 'replaying',
          events: [
            { seq: 1, message: 'first' },
            { seq: 2, message: 'second' },
          ],
        },
      }),
  });
  expect(attempted.map((payload) => (JSON.parse(payload) as { seq?: number }).seq)).toEqual([1]);
});

test('fresh admission stops replay when authority changes after the first accepted event', async () => {
  let enabled = false;
  const accepted: string[] = [];
  const socket = new SocketDelivery({
    admit: () => Promise.resolve(enabled ? 'incompatible' : 'admitted'),
    write: (payload) => {
      accepted.push(payload);
      enabled = true;
      return 'sent';
    },
    signal: new AbortController().signal,
    timers: systemTimers,
    capacity: 64,
    deadlineMs: 5000,
    onRetired: () => undefined,
  });
  await handleWsMessage({
    frame: { type: 'resume', resume_points: { [PROJECT]: 0 } },
    socket,
    subs: new SubscriptionMap(),
    connectionId: 'retained',
    clientId: 'ada',
    access: grantingAccess(),
    reportUnexpectedBackendFailure: () => {
      throw new Error('unexpected backend failure');
    },
    forward: () => Promise.resolve({ ack: true }),
    resume: () =>
      Promise.resolve({
        [PROJECT]: {
          status: 'replaying',
          events: [
            { seq: 1, message: 'first' },
            { seq: 2, message: 'sentinel' },
          ],
        },
      }),
  });
  expect(accepted.map((payload) => JSON.parse(payload) as unknown)).toEqual([
    { subscription: PROJECT, seq: 1, message: 'first' },
  ]);
});

test('held project admission cannot restore subscription after connection cancellation', async () => {
  const gate = deferred();
  const cancellation = new AbortController();
  const subs = new SubscriptionMap<WsSocket>();
  const socket: WsSocket = { send: () => Promise.resolve('retired') };
  const subscribing = handleWsMessage({
    frame: { type: 'subscribe', subscription: PROJECT },
    signal: cancellation.signal,
    socket,
    subs,
    connectionId: 'retired',
    clientId: 'ada',
    access: {
      ...grantingAccess(),
      admit: async () => {
        await gate.pending;
        return 'granted';
      },
    },
    reportUnexpectedBackendFailure: () => {
      throw new Error('unexpected backend failure');
    },
    forward: () => Promise.resolve({ ack: true }),
    resume: () => Promise.resolve({}),
  });
  await Bun.sleep(2);
  cancellation.abort();
  gate.release();
  await subscribing;
  expect([...subs.socketsFor(PROJECT)]).toEqual([]);
});

test('mounted push cannot write after held admission cancellation or exact expiry with withheld timer', async () => {
  for (const fault of ['cancel', 'expire'] as const) {
    const gate = deferred();
    let admitted = false;
    let now = 0;
    let writes = 0;
    const cancellation = new AbortController();
    const subs = new SubscriptionMap<WsSocket>();
    subs.subscribe(
      PROJECT,
      new SocketDelivery({
        admit: async () => {
          admitted = true;
          await gate.pending;
          return 'admitted';
        },
        write: () => {
          writes++;
          return 'sent';
        },
        signal: cancellation.signal,
        timers: { nowMs: () => now, schedule: () => () => undefined },
        capacity: 64,
        deadlineMs: 5000,
        onRetired: () => undefined,
      }),
    );
    const app = new Elysia().use(
      internalController({ secret: SECRET, subs, metrics: new GatewayMetrics() }),
    );
    const pushing = app.handle(
      new Request('http://localhost/internal/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-auth': SECRET },
        body: JSON.stringify({ subscription: PROJECT, seq: 1, message: 'sentinel' }),
      }),
    );
    await until(() => admitted);
    if (fault === 'cancel') cancellation.abort();
    else now = 5000;
    gate.release();
    const response = await pushing;
    expect(await response.json()).toEqual({ delivered_to_sockets: 0 });
    await Bun.sleep(2);
    expect(writes).toBe(0);
  }
});

test('mounted expired FIFO head never asks authority even when timer callback is withheld', async () => {
  let inspections = 0;
  let reads = 0;
  const subs = new SubscriptionMap<WsSocket>();
  subs.subscribe(
    PROJECT,
    new SocketDelivery({
      admit: () => {
        inspections++;
        return Promise.resolve('admitted');
      },
      write: () => 'sent',
      signal: new AbortController().signal,
      timers: { nowMs: () => (reads++ === 0 ? 0 : 5000), schedule: () => () => undefined },
      capacity: 64,
      deadlineMs: 5000,
      onRetired: () => undefined,
    }),
  );
  const app = new Elysia().use(
    internalController({ secret: SECRET, subs, metrics: new GatewayMetrics() }),
  );
  const response = await app.handle(
    new Request('http://localhost/internal/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-auth': SECRET },
      body: JSON.stringify({ subscription: PROJECT, seq: 1, message: 'sentinel' }),
    }),
  );
  expect(await response.json()).toEqual({ delivered_to_sockets: 0 });
  expect(inspections).toBe(0);
});
