import { DEPENDENCY_SEMANTICS } from '@wbs/contracts';
import { systemTimers } from '@wbs/runtime-portable';
import { expect, test } from 'bun:test';

import { buildApp } from './app';
import { GRANT_EVERY_PROJECT } from './testing/project-access';

const SECRET = 's'.repeat(32);
const PROJECT = 'project:11111111-1111-4111-8111-111111111111';

async function until(predicate: () => boolean) {
  const expires = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() >= expires) throw new Error('retained admission observation deadline');
    await Bun.sleep(2);
  }
}

function refusal() {
  return Response.json(
    { error: 'client_dependency_incompatible', required: DEPENDENCY_SEMANTICS },
    { status: 409 },
  );
}

async function connect(port: number) {
  const frames: unknown[] = [];
  const socket = new WebSocket(`ws://localhost:${String(port)}/ws`);
  socket.addEventListener('message', (event: MessageEvent<string>) => {
    frames.push(JSON.parse(event.data));
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener(
      'open',
      () => {
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      'error',
      () => {
        reject(new Error('socket did not open'));
      },
      { once: true },
    );
  });
  await until(() => frames.length > 0);
  return { socket, frames };
}

async function push(port: number) {
  const response = await fetch(`http://localhost:${String(port)}/internal/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-auth': SECRET },
    body: JSON.stringify({ subscription: PROJECT, seq: 1, message: 'sentinel' }),
  });
  expect(response.status).toBe(202);
  return response.json();
}

test('incompatible retained push accepts zero and retires held subscribe without revival', async () => {
  let enabled = false;
  let held = false;
  let release: (decision: 'granted') => void = () => {
    throw new Error('not held');
  };
  const app = buildApp({
    beUrl: 'http://be.test',
    internalAuthSecret: SECRET,
    jwtKey: 'k'.repeat(32),
    localIdentity: 'ada',
    projectAccess: () => () => {
      held = true;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
    fetchImpl: () => Promise.resolve(enabled ? refusal() : new Response(null, { status: 204 })),
  }).listen(0);
  const port = app.server?.port;
  if (port === undefined) throw new Error('gateway did not listen');
  try {
    const client = await connect(port);
    client.socket.send(JSON.stringify({ type: 'subscribe', subscription: PROJECT }));
    await until(() => held);
    enabled = true;
    client.socket.send(JSON.stringify({ type: 'ping' }));
    await until(() => client.socket.readyState === WebSocket.CLOSED);
    release('granted');
    await Bun.sleep(10);
    expect(await push(port)).toEqual({ delivered_to_sockets: 0 });
    expect(client.frames).toEqual([{ type: 'presence', users: [] }]);
  } finally {
    await app.stop(true);
  }
});

test('retained authority unavailable retires without sending application frames', async () => {
  for (const fault of ['404', 'malformed', 'throw', 'deadline'] as const) {
    let broken = false;
    const app = buildApp({
      beUrl: 'http://be.test',
      internalAuthSecret: SECRET,
      jwtKey: 'k'.repeat(32),
      localIdentity: 'ada',
      projectAccess: GRANT_EVERY_PROJECT,
      requests: { timers: systemTimers, attemptMs: 20, overallMs: 30 },
      fetchImpl: () => {
        if (!broken) return Promise.resolve(new Response(null, { status: 204 }));
        if (fault === 'throw') return Promise.reject(new Error('authority unavailable'));
        if (fault === 'deadline') return new Promise(() => undefined);
        return Promise.resolve(
          Response.json({ error: 'wrong' }, { status: fault === '404' ? 404 : 409 }),
        );
      },
    }).listen(0);
    const port = app.server?.port;
    if (port === undefined) throw new Error('gateway did not listen');
    try {
      const client = await connect(port);
      broken = true;
      client.socket.send(JSON.stringify({ type: 'ping' }));
      await until(() => client.socket.readyState === WebSocket.CLOSED);
      expect(client.frames).toEqual([{ type: 'presence', users: [] }]);
      expect(await push(port)).toEqual({ delivered_to_sockets: 0 });
    } finally {
      await app.stop(true);
    }
  }
});

test('retirement aborts pending backend work and removes subscriptions before physical close', async () => {
  let enabled = false;
  let pendingSignal: AbortSignal | undefined;
  let closed = false;
  const app = buildApp({
    beUrl: 'http://be.test',
    internalAuthSecret: SECRET,
    jwtKey: 'k'.repeat(32),
    localIdentity: 'ada',
    projectAccess: GRANT_EVERY_PROJECT,
    fetchImpl: (url, init) => {
      if (url.endsWith('/internal/forward')) {
        pendingSignal = init?.signal ?? undefined;
        return new Promise(() => undefined);
      }
      return Promise.resolve(enabled ? refusal() : new Response(null, { status: 204 }));
    },
  }).listen(0);
  const port = app.server?.port;
  if (port === undefined) throw new Error('gateway did not listen');
  try {
    const client = await connect(port);
    client.socket.send(JSON.stringify({ type: 'subscribe', subscription: PROJECT }));
    await until(() => client.frames.length === 2);
    client.socket.send(JSON.stringify({ subscription: PROJECT, message: { write: true } }));
    await until(() => pendingSignal !== undefined);
    client.socket.addEventListener('close', () => {
      closed = true;
    });
    enabled = true;
    expect(await push(port)).toEqual({ delivered_to_sockets: 0 });
    expect(pendingSignal?.aborted).toBe(true);
    await until(() => closed);
    expect(client.frames).toHaveLength(2);
    expect(await push(port)).toEqual({ delivered_to_sockets: 0 });
  } finally {
    await app.stop(true);
  }
});

test('physical close cancels a held retained authority request', async () => {
  let hold = false;
  let authoritySignal: AbortSignal | undefined;
  const app = buildApp({
    beUrl: 'http://be.test',
    internalAuthSecret: SECRET,
    jwtKey: 'k'.repeat(32),
    localIdentity: 'ada',
    projectAccess: GRANT_EVERY_PROJECT,
    fetchImpl: (_url, init) => {
      if (!hold) return Promise.resolve(new Response(null, { status: 204 }));
      authoritySignal = init?.signal ?? undefined;
      return new Promise(() => undefined);
    },
  }).listen(0);
  const port = app.server?.port;
  if (port === undefined) throw new Error('gateway did not listen');
  try {
    const client = await connect(port);
    hold = true;
    client.socket.send(JSON.stringify({ type: 'ping' }));
    await until(() => authoritySignal !== undefined);
    client.socket.close();
    await until(() => authoritySignal?.aborted === true);
    expect(client.frames).toEqual([{ type: 'presence', users: [] }]);
  } finally {
    await app.stop(true);
  }
});
