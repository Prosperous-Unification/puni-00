import { DEPENDENCY_SEMANTICS } from '@wbs/contracts';
import { expect, spyOn, test } from 'bun:test';

import { buildApp } from './app';
import { Presence } from './service/presence';
import { GRANT_EVERY_PROJECT } from './testing/project-access';

const PROJECT = 'project:11111111-1111-4111-8111-111111111111';

interface MountedSocket {
  data: {
    request: Request;
    query: Record<symbol, unknown>;
    cancellation?: AbortController;
    socket?: { send(payload: string): Promise<string> };
  };
  send(payload: string): number;
  close(code: number, reason: string): void;
}

/** Framework hooks are unknown to Elysia's HTTP route type, checked once at this test boundary. */
function mountedHooks(app: ReturnType<typeof buildApp>) {
  const hooks: unknown = app.routes.find((route) => route.path === '/ws')?.hooks;
  if (hooks === undefined) throw new Error('missing mounted WebSocket route');
  return hooks as unknown as {
    websocket: {
      beforeHandle(context: {
        query: Record<symbol, unknown>;
        request: Request;
        set: { headers: Record<string, string> };
      }): Promise<unknown>;
      open(socket: MountedSocket): Promise<void>;
      message(socket: MountedSocket, frame: unknown): Promise<void>;
    };
  };
}

test('mounted retirement removes presence and subscriptions and aborts before physical close', async () => {
  let enabled = false;
  const joined: Presence[] = [];
  const join = Object.getOwnPropertyDescriptor(Presence.prototype, 'join')
    ?.value as Presence['join'];
  const observing = spyOn(Presence.prototype, 'join').mockImplementation(function (
    this: Presence,
    ...args
  ) {
    joined.push(this);
    return join.apply(this, args);
  });
  const app = buildApp({
    beUrl: 'http://be.test',
    internalAuthSecret: 's'.repeat(32),
    jwtKey: 'k'.repeat(32),
    localIdentity: 'ada',
    projectAccess: GRANT_EVERY_PROJECT,
    fetchImpl: () =>
      Promise.resolve(
        enabled
          ? Response.json(
              { error: 'client_dependency_incompatible', required: DEPENDENCY_SEMANTICS },
              { status: 409 },
            )
          : new Response(null, { status: 204 }),
      ),
  });
  const { websocket } = mountedHooks(app);
  let closes = 0;
  let beforeClose: unknown;
  const socket: MountedSocket = {
    data: {
      query: {},
      request: new Request('http://localhost/ws', {
        headers: { origin: 'http://localhost', cookie: '__Host-wbs_access=verified' },
      }),
    },
    send: () => 1,
    close: () => {
      closes++;
      // The physical close callback is deliberately withheld: these facts must already hold.
      beforeClose = {
        canceled: socket.data.cancellation?.signal.aborted,
        subscriptions: [...app.decorator.subs.socketsFor(PROJECT)],
        presence: joined.at(-1)?.connectionCount,
      };
    },
  };
  try {
    await websocket.beforeHandle({
      query: socket.data.query,
      request: socket.data.request,
      set: { headers: {} },
    });
    await websocket.open(socket);
    await websocket.message(socket, { type: 'subscribe', subscription: PROJECT });
    expect(joined.at(-1)?.list(PROJECT.slice('project:'.length))).toEqual(['ada']);
    expect([...app.decorator.subs.socketsFor(PROJECT)]).toHaveLength(1);
    enabled = true;
    await websocket.message(socket, { type: 'ping' });
    expect(closes).toBe(1);
    expect(beforeClose).toEqual({ canceled: true, subscriptions: [], presence: 0 });
  } finally {
    observing.mockRestore();
  }
});

test('mounted late identity verification cannot join presence after retirement', async () => {
  let inspections = 0;
  let release: () => void = () => {
    throw new Error('verification not held');
  };
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const joined: Presence[] = [];
  const join = Object.getOwnPropertyDescriptor(Presence.prototype, 'join')
    ?.value as Presence['join'];
  const observing = spyOn(Presence.prototype, 'join').mockImplementation(function (
    this: Presence,
    ...args
  ) {
    joined.push(this);
    return join.apply(this, args);
  });
  let enabled = false;
  const app = buildApp({
    beUrl: 'http://be.test',
    internalAuthSecret: 's'.repeat(32),
    jwtKey: 'k'.repeat(32),
    appOrigin: 'http://localhost',
    projectAccess: GRANT_EVERY_PROJECT,
    verifier: {
      verify: async () => {
        if (++inspections === 2) await held;
        return { sub: 'ada' };
      },
    },
    fetchImpl: () =>
      Promise.resolve(
        enabled
          ? Response.json(
              { error: 'client_dependency_incompatible', required: DEPENDENCY_SEMANTICS },
              { status: 409 },
            )
          : new Response(null, { status: 204 }),
      ),
  });
  const { websocket } = mountedHooks(app);
  const closes: number[] = [];
  const socket: MountedSocket = {
    data: {
      query: {},
      request: new Request('http://localhost/ws', {
        headers: { origin: 'http://localhost', cookie: '__Host-wbs_access=verified' },
      }),
    },
    send: () => 1,
    close: (code) => {
      closes.push(code);
    },
  };
  try {
    await websocket.beforeHandle({
      query: socket.data.query,
      request: socket.data.request,
      set: { headers: {} },
    });
    const joining = websocket.open(socket);
    enabled = true;
    if (socket.data.socket === undefined)
      throw new Error('delivery not initialized before open awaited');
    expect(await socket.data.socket.send('held identity')).toBe('retired');
    release();
    await joining;
    expect(joined.at(-1)?.connectionCount ?? 0).toBe(0);
    expect(closes).toEqual([1013]);
  } finally {
    release();
    observing.mockRestore();
  }
});
