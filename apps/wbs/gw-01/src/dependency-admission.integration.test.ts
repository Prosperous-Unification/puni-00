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

test('legacy reconnect rereads ENABLED authority and exact V1 offers remain admitted', async () => {
  let enabled = false;
  const claims: (string | null)[] = [];
  const app = buildApp({
    beUrl: 'http://be.test',
    internalAuthSecret: 's'.repeat(32),
    jwtKey: 'k'.repeat(32),
    localIdentity: 'ada',
    projectAccess: GRANT_EVERY_PROJECT,
    fetchImpl: (_url, init) => {
      const claim = new Headers(init?.headers).get(DEPENDENCY_SEMANTICS_HEADER);
      claims.push(claim);
      return Promise.resolve(
        enabled && claim !== DEPENDENCY_SEMANTICS
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
    for (const protocol of [undefined, 'wbs.legacy']) {
      const socket = await connect(port, protocol);
      expect(socket).not.toBeNull();
      expect(socket?.protocol).toBe(protocol ?? '');
      socket?.close();
    }
    enabled = true;
    for (const protocol of [undefined, 'wbs.legacy', `${DEPENDENCY_WEBSOCKET_PROTOCOL}.other`])
      expect(await connect(port, protocol)).toBeNull();
    const exact = await connect(port, DEPENDENCY_WEBSOCKET_PROTOCOL);
    expect(exact?.protocol).toBe(DEPENDENCY_WEBSOCKET_PROTOCOL);
    exact?.close();
    expect(claims).toContain(null);
    expect(claims).toContain(DEPENDENCY_SEMANTICS);
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

test('dual offers explicitly select V1 and retained presence keeps that exact admission', async () => {
  const claims: (string | null)[] = [];
  const seen = new Set<string>();
  const accessClaims: unknown[] = [];
  const app = buildApp({
    beUrl: 'http://be.test',
    internalAuthSecret: 's'.repeat(32),
    jwtKey: 'k'.repeat(32),
    localIdentity: 'ada',
    projectAccess: (credential) => {
      accessClaims.push(credential.dependencySemantics);
      return GRANT_EVERY_PROJECT();
    },
    fetchImpl: (_url, init) => {
      const claim = new Headers(init?.headers).get(DEPENDENCY_SEMANTICS_HEADER);
      claims.push(claim);
      if (_url.endsWith('/internal/forward') || _url.endsWith('/internal/resume')) {
        seen.add(_url.endsWith('/internal/forward') ? 'forward' : 'resume');
        return Promise.resolve(
          claim === DEPENDENCY_SEMANTICS
            ? Response.json(_url.endsWith('/internal/forward') ? { ack: true } : {})
            : Response.json(
                { error: 'client_dependency_incompatible', required: DEPENDENCY_SEMANTICS },
                { status: 409 },
              ),
        );
      }
      return Promise.resolve(
        claim === DEPENDENCY_SEMANTICS
          ? new Response(null, { status: 204 })
          : Response.json(
              { error: 'client_dependency_incompatible', required: DEPENDENCY_SEMANTICS },
              { status: 409 },
            ),
      );
    },
  }).listen(0);
  const port = app.server?.port;
  if (port === undefined) throw new Error('gateway did not listen');
  try {
    const socket = new WebSocket(`ws://localhost:${String(port)}/ws`, [
      'wbs.legacy',
      DEPENDENCY_WEBSOCKET_PROTOCOL,
    ]);
    const roster = await new Promise<string>((resolve, reject) => {
      socket.addEventListener(
        'message',
        (event) => {
          resolve(String(event.data));
        },
        { once: true },
      );
      socket.addEventListener(
        'close',
        () => {
          reject(new Error('V1 retired before initial roster'));
        },
        { once: true },
      );
      socket.addEventListener(
        'error',
        () => {
          reject(new Error('V1 upgrade refused'));
        },
        {
          once: true,
        },
      );
    });
    expect(socket.protocol).toBe(DEPENDENCY_WEBSOCKET_PROTOCOL);
    expect(roster).toContain('presence');
    socket.send(JSON.stringify({ subscription: 'presence', message: { write: true } }));
    const resumed = new Promise<void>((resolve) => {
      socket.addEventListener('message', (event) => {
        if (String(event.data).includes('resume_ack')) resolve();
      });
    });
    socket.send(JSON.stringify({ type: 'resume', resume_points: {} }));
    await resumed;
    expect([...seen].sort()).toEqual(['forward', 'resume']);
    expect(accessClaims).toEqual([DEPENDENCY_SEMANTICS]);
    expect(claims.length).toBeGreaterThanOrEqual(2);
    expect(claims.every((claim) => claim === DEPENDENCY_SEMANTICS)).toBe(true);
    socket.close();
  } finally {
    await app.stop(true);
  }
});
