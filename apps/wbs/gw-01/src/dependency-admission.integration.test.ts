import { createConnection } from 'node:net';

import {
  DEPENDENCY_SEMANTICS,
  DEPENDENCY_SEMANTICS_HEADER,
  DEPENDENCY_WEBSOCKET_PROTOCOL,
} from '@wbs/contracts';
import { systemTimers } from '@wbs/runtime-portable';
import { expect, spyOn, test } from 'bun:test';

import { buildApp } from './app';
import { Presence } from './service/presence';
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

/** Sends header octets and pipelined masked frames without WebSocket constructor normalization. */
function rawDependencyHandshake(port: number, protocol: string): Promise<string> {
  const frames = [
    { type: 'subscribe', subscription: 'project:11111111-1111-4111-8111-111111111111' },
    { type: 'resume', resume_points: {} },
    { subscription: 'presence', message: { write: true } },
  ].map((frame) => {
    const payload = Buffer.from(JSON.stringify(frame));
    if (payload.length >= 126) throw new Error('raw fixture frame requires extended length');
    const mask = Buffer.from([1, 2, 3, 4]);
    const masked = Buffer.from(payload.map((octet, index) => octet ^ mask[index % 4]));
    return Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, masked]);
  });
  return new Promise((resolve, reject) => {
    let response = '';
    const socket = createConnection({ host: '127.0.0.1', port }, () => {
      socket.write(
        Buffer.concat([
          Buffer.from(
            `GET /ws HTTP/1.1\r\nHost: localhost:${String(port)}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: ${protocol}\r\n\r\n`,
            'latin1',
          ),
          ...frames,
        ]),
      );
    });
    socket.setTimeout(2000, () => {
      socket.destroy(new Error('raw handshake deadline exceeded'));
    });
    socket.on('error', reject);
    socket.on('data', (chunk: Buffer) => {
      response += chunk.toString('latin1');
      if (response.includes('\r\n\r\n')) {
        socket.destroy();
        resolve(response);
      }
    });
    socket.on('end', () => {
      if (!response.includes('\r\n\r\n')) reject(new Error('raw handshake ended before response'));
    });
  });
}

test('raw NBSP protocol octets refuse before presence, project access, replay or backend work', async () => {
  const backendPaths: string[] = [];
  let accessChecks = 0;
  const joining = spyOn(Presence.prototype, 'join');
  const app = buildApp({
    beUrl: 'http://be.test',
    internalAuthSecret: 's'.repeat(32),
    jwtKey: 'k'.repeat(32),
    localIdentity: 'ada',
    projectAccess: () => {
      accessChecks++;
      return GRANT_EVERY_PROJECT();
    },
    fetchImpl: (url) => {
      backendPaths.push(url);
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  }).listen(0);
  const port = app.server?.port;
  if (port === undefined) throw new Error('gateway did not listen');
  try {
    for (const protocol of [
      `\xA0${DEPENDENCY_WEBSOCKET_PROTOCOL}\xA0`,
      `\xA0${DEPENDENCY_WEBSOCKET_PROTOCOL}`,
      `${DEPENDENCY_WEBSOCKET_PROTOCOL}\xA0`,
    ]) {
      const response = await rawDependencyHandshake(port, protocol);
      expect(response).toMatch(/^HTTP\/1\.1 409 /);
      expect(response).not.toContain('101 Switching Protocols');
      expect(response).not.toContain('presence');
      expect(backendPaths).toEqual([]);
      expect(accessChecks).toBe(0);
      expect(joining).not.toHaveBeenCalled();
    }
    expect(
      await (await fetch(`http://localhost:${String(port)}/metrics/snapshot`)).json(),
    ).toMatchObject({ activeConnections: 0 });
  } finally {
    joining.mockRestore();
    await app.stop(true);
  }
});
