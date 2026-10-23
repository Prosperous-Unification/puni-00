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
      write: async () => {
        await gate.pending;
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
