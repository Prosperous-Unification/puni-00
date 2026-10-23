import {
  DEPENDENCY_SEMANTICS,
  DEPENDENCY_SEMANTICS_HEADER,
  DEPENDENCY_WEBSOCKET_PROTOCOL,
} from '@wbs/contracts';
import { systemTimers } from '@wbs/runtime-portable';
import { expect, test } from 'bun:test';

import { buildApp } from './app';
import { GRANT_EVERY_PROJECT } from './testing/project-access';

function connect(port: number, protocol?: string): Promise<WebSocket | null> {
  return new Promise((resolve) => {
    const socket = new WebSocket(
      `ws://localhost:${String(port)}/ws`,
      protocol === undefined ? [] : [protocol],
    );
    socket.addEventListener(
      'open',
      () => {
        resolve(socket);
      },
      { once: true },
    );
    socket.addEventListener(
      'error',
      () => {
        resolve(null);
      },
      { once: true },
    );
  });
}

test('every reconnect freshly admits before presence and incapable gateway omits even exact client claim', async () => {
  let enabled = false;
  const claims: (string | null)[] = [];
  const app = buildApp({
    beUrl: 'http://be.test',
    internalAuthSecret: 's'.repeat(32),
    jwtKey: 'k'.repeat(32),
    localIdentity: 'ada',
    projectAccess: GRANT_EVERY_PROJECT,
    fetchImpl: (_url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('x-internal-auth')).toBe('s'.repeat(32));
      claims.push(headers.get(DEPENDENCY_SEMANTICS_HEADER));
      return Promise.resolve(
        enabled && headers.get(DEPENDENCY_SEMANTICS_HEADER) !== DEPENDENCY_SEMANTICS
          ? Response.json(
              { error: 'client_dependency_incompatible', required: DEPENDENCY_SEMANTICS },
              { status: 409 },
            )
          : new Response(null, { status: 204 }),
      );
    },
  }).listen(0);
  const port = app.server?.port;
  if (port === undefined) throw new Error('gateway did not listen');
  try {
    const legacy = await connect(port);
    expect(legacy).not.toBeNull();
    legacy?.close();
    const offered = await connect(port, DEPENDENCY_WEBSOCKET_PROTOCOL);
    expect(offered).toBeNull();
    enabled = true;
    for (const protocol of [
      undefined,
      DEPENDENCY_WEBSOCKET_PROTOCOL,
      `${DEPENDENCY_WEBSOCKET_PROTOCOL}.other`,
    ])
      expect(await connect(port, protocol)).toBeNull();
    expect(claims).toEqual([null, null, null, null, null]);
    const snapshot = await fetch(`http://localhost:${String(port)}/metrics/snapshot`).then((r) =>
      r.json(),
    );
    expect(snapshot).toMatchObject({ activeConnections: 0 });
  } finally {
    await app.stop(true);
  }
});

test('transport, malformed success and malformed refusal fail closed within the upgrade deadline', async () => {
  for (const mode of ['throw', 'bad-success', 'bad-refusal', 'deadline'] as const) {
    const app = buildApp({
      beUrl: 'http://be.test',
      internalAuthSecret: 's'.repeat(32),
      jwtKey: 'k'.repeat(32),
      localIdentity: 'ada',
      projectAccess: GRANT_EVERY_PROJECT,
      requests: { timers: systemTimers, attemptMs: 20, overallMs: 30 },
      fetchImpl: () => {
        if (mode === 'throw') return Promise.reject(new Error('offline'));
        if (mode === 'deadline') return new Promise(() => undefined);
        return Promise.resolve(
          Response.json({ error: 'wrong' }, { status: mode === 'bad-success' ? 200 : 409 }),
        );
      },
    }).listen(0);
    const port = app.server?.port;
    if (port === undefined) throw new Error('gateway did not listen');
    try {
      expect(await connect(port)).toBeNull();
    } finally {
      await app.stop(true);
    }
  }
});

test('origin and credential refusals never inspect backend dependency authority', async () => {
  let inspections = 0;
  const app = buildApp({
    beUrl: 'http://be.test',
    internalAuthSecret: 's'.repeat(32),
    jwtKey: 'k'.repeat(32),
    appOrigin: 'https://wbs.test',
    projectAccess: GRANT_EVERY_PROJECT,
    fetchImpl: () => {
      inspections += 1;
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  }).listen(0);
  const port = app.server?.port;
  if (port === undefined) throw new Error('gateway did not listen');
  try {
    for (const headers of [
      { origin: 'https://foreign.test', cookie: '__Host-wbs_access=invalid' },
      { origin: 'https://wbs.test' },
      { origin: 'https://wbs.test', cookie: '__Host-wbs_access=invalid' },
    ]) {
      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(`ws://localhost:${String(port)}/ws`, { headers });
        socket.addEventListener(
          'error',
          () => {
            resolve();
          },
          { once: true },
        );
        socket.addEventListener(
          'open',
          () => {
            socket.close();
            reject(new Error('unauthenticated socket opened'));
          },
          { once: true },
        );
      });
    }
    expect(inspections).toBe(0);
  } finally {
    await app.stop(true);
  }
});
