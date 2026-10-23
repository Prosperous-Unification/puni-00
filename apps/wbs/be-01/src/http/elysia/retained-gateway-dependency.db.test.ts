import { DEPENDENCY_SEMANTICS } from '@wbs/contracts';
import { openConnection } from '@wbs/store-sqlite/db';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { expect, test } from 'bun:test';

import { DrizzleEventLogStore } from '../../repository/event-log';
import { OPEN } from '../../repository/gate';
import { admitDependencyClient } from '../../runtime/dependency-client';
import { TEST_JWT_KEY } from '../../testing/auth-fixture';
import { OrganizationHarness } from '../../testing/organization-harness';

// Bun's constructor includes forwarded headers; DOM declarations shadow that overload.
const CookieSocket = WebSocket as unknown as new (
  url: string,
  options: Bun.WebSocketOptions,
) => WebSocket;

async function until(predicate: () => boolean) {
  const expiry = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() >= expiry) throw new Error('retained gateway observation deadline');
    await Bun.sleep(2);
  }
}

test('mounted SQLite authority ENABLED with zero external rows fences retained push and replay', async () => {
  const capable = {
    protocol: 'wbs-dependency-runtime',
    version: 1,
    role: 'backend',
    semantics: [DEPENDENCY_SEMANTICS],
  } as const;
  const harness = OrganizationHarness.openComposedWith({
    admitDependencyClient: (claim) => admitDependencyClient(connection.db, capable, claim),
  });
  const connection = openConnection(harness.databasePath());
  let gateway: ReturnType<typeof Bun.spawn> | undefined;
  const sockets: WebSocket[] = [];
  let holdRecheck = false;
  let replayCaptured = false;
  let recheckHeld = false;
  let capturedReplay: unknown;
  let releaseRecheck: () => void = () => {
    throw new Error('recheck not initialized');
  };
  const recheckGate = new Promise<void>((resolve) => {
    releaseRecheck = resolve;
  });
  const backend = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const response = await harness.app.handle(request);
      const path = new URL(request.url).pathname;
      if (holdRecheck && path === '/internal/resume') {
        capturedReplay = await response.clone().json();
        replayCaptured = true;
      }
      if (holdRecheck && replayCaptured && path.endsWith('/browser-access')) {
        if (response.status !== 204)
          throw new Error('final browser-access recheck was not granted');
        recheckHeld = true;
        await recheckGate;
      }
      return response;
    },
  });
  const backendPort = backend.port;
  try {
    await harness.register('ada');
    const created = await harness.call('ada', 'POST', '/api/projects', { name: 'Retained' });
    expect(created.status).toBe(200);
    const projectId = (created.body as { project: { id: string } }).project.id;
    const subscription = `project:${projectId}`;
    gateway = Bun.spawn(
      [
        process.execPath,
        new URL('../../../../gw-01/src/testing/cross-project-delivery-gateway.ts', import.meta.url)
          .pathname,
        `http://localhost:${String(backendPort)}`,
        TEST_JWT_KEY,
        'x'.repeat(32),
      ],
      { stdout: 'pipe', stderr: 'inherit' },
    );
    if (!(gateway.stdout instanceof ReadableStream)) throw new Error('gateway stdout is not piped');
    const reader = gateway.stdout.getReader();
    const startup = await reader.read();
    reader.releaseLock();
    const { port } = JSON.parse(new TextDecoder().decode(startup.value)) as { port: number };
    const connect = async (subscription: string) => {
      const frames: unknown[] = [];
      const socket = new CookieSocket(`ws://localhost:${String(port)}/ws`, {
        headers: {
          origin: 'http://localhost',
          cookie: `__Host-wbs_access=${harness.token('ada')}`,
        },
      });
      sockets.push(socket);
      socket.addEventListener('message', (event: MessageEvent<string>) => {
        frames.push(JSON.parse(event.data));
      });
      await until(() => frames.length > 0);
      socket.send(JSON.stringify({ type: 'subscribe', subscription }));
      await until(() =>
        frames.some((frame) => (frame as { users?: string[] }).users?.includes('ada') === true),
      );
      return { socket, frames };
    };
    const replayProject = await harness.call('ada', 'POST', '/api/projects', { name: 'Replay' });
    expect(replayProject.status).toBe(200);
    const replaySubscription = `project:${(replayProject.body as { project: { id: string } }).project.id}`;
    const pushing = await connect(subscription);
    const replaying = await connect(replaySubscription);
    const sentinel = await new DrizzleEventLogStore(connection.db, OPEN).recordEvent(
      replaySubscription,
      'replay-sentinel',
      Date.now(),
    );
    const resume = () => {
      replaying.socket.send(
        JSON.stringify({
          type: 'resume',
          resume_points: { [replaySubscription]: sentinel.seq - 1 },
        }),
      );
    };
    const replayBeforeControl = replaying.frames.length;
    resume();
    await until(() =>
      replaying.frames
        .slice(replayBeforeControl)
        .some((frame) => (frame as { type?: string }).type === 'resume_ack'),
    );
    expect(replaying.frames.slice(replayBeforeControl)).toEqual([
      { subscription: replaySubscription, seq: sentinel.seq, message: 'replay-sentinel' },
      { type: 'resume_ack', replayed: { [replaySubscription]: 1 } },
    ]);
    const pushBefore = pushing.frames.length;
    const replayBefore = replaying.frames.length;
    holdRecheck = true;
    resume();
    await until(() => recheckHeld);
    expect(capturedReplay).toEqual({
      [replaySubscription]: {
        status: 'replaying',
        events: [{ seq: sentinel.seq, message: 'replay-sentinel' }],
      },
    });
    expect(connection.db.all('SELECT * FROM external_dependency')).toEqual([]);
    seedDependencyAuthority(harness.databasePath());
    const response = await fetch(`http://localhost:${String(port)}/internal/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-auth': 'x'.repeat(32) },
      body: JSON.stringify({ subscription, seq: 999, message: 'sentinel' }),
    });
    expect(await response.json()).toEqual({ delivered_to_sockets: 0 });
    releaseRecheck();
    await until(
      () =>
        replaying.socket.readyState === WebSocket.CLOSED || replaying.frames.length > replayBefore,
    );
    expect(replaying.frames.slice(replayBefore)).toEqual([]);
    await until(() => sockets.every((socket) => socket.readyState === WebSocket.CLOSED));
    expect(pushing.frames.slice(pushBefore)).toEqual([]);
    expect(replaying.frames.slice(replayBefore)).toEqual([]);
    expect(connection.db.all('SELECT * FROM external_dependency')).toEqual([]);
  } finally {
    releaseRecheck();
    for (const socket of sockets) socket.close();
    if (gateway !== undefined) {
      gateway.kill();
      await gateway.exited;
    }
    await backend.stop(true);
    connection.close();
    harness.close();
  }
});
