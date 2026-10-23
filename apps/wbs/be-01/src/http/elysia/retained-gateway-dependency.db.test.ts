import { DEPENDENCY_SEMANTICS } from '@wbs/contracts';
import { openConnection } from '@wbs/store-sqlite/db';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { expect, test } from 'bun:test';

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
  const harness = OrganizationHarness.open({
    admitDependencyClient: (claim) => admitDependencyClient(connection.db, capable, claim),
  });
  const connection = openConnection(harness.databasePath());
  let gateway: ReturnType<typeof Bun.spawn> | undefined;
  const sockets: WebSocket[] = [];
  harness.app.listen(0);
  const backendPort = harness.app.server?.port;
  if (backendPort === undefined) throw new Error('backend did not listen');
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
    const pushBefore = pushing.frames.length;
    const replayBefore = replaying.frames.length;
    expect(connection.db.all('SELECT * FROM external_dependency')).toEqual([]);
    seedDependencyAuthority(harness.databasePath());
    const response = await fetch(`http://localhost:${String(port)}/internal/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-auth': 'x'.repeat(32) },
      body: JSON.stringify({ subscription, seq: 999, message: 'sentinel' }),
    });
    expect(await response.json()).toEqual({ delivered_to_sockets: 0 });
    replaying.socket.send(
      JSON.stringify({ type: 'resume', resume_points: { [replaySubscription]: 0 } }),
    );
    await until(() => sockets.every((socket) => socket.readyState === WebSocket.CLOSED));
    expect(pushing.frames.slice(pushBefore)).toEqual([]);
    expect(replaying.frames.slice(replayBefore)).toEqual([]);
    expect(connection.db.all('SELECT * FROM external_dependency')).toEqual([]);
  } finally {
    for (const socket of sockets) socket.close();
    if (gateway !== undefined) {
      gateway.kill();
      await gateway.exited;
    }
    await harness.app.stop(true);
    connection.close();
    harness.close();
  }
});
