import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { expect, it } from 'bun:test';

import { TEST_JWT_KEY } from '../testing/auth-fixture';
import { OrganizationHarness } from '../testing/organization-harness';

// Bun supplies headers at runtime; the backend's DOM library shadows its constructor overload.
const CookieSocket = WebSocket as unknown as new (
  url: string,
  options: Bun.WebSocketOptions,
) => WebSocket;

interface Frame {
  type?: string;
  users?: string[];
  subscription?: string;
  seq?: number;
  message?: { type: string; projectId: string; causeProjectId: string };
}

/** Event-driven deadlines fail at the delivery boundary without guessing socket readiness. */
function inbox(socket: WebSocket) {
  const frames: Frame[] = [];
  const pending = new Set<() => void>();
  socket.addEventListener('message', (event: MessageEvent<string>) => {
    frames.push(JSON.parse(event.data) as Frame);
    for (const inspect of pending) inspect();
  });
  return {
    frames,
    wait: (predicate: (frame: Frame) => boolean, description: string) =>
      new Promise<Frame>((resolve, reject) => {
        const inspect = () => {
          const found = frames.find(predicate);
          if (found === undefined) return;
          clearTimeout(deadline);
          pending.delete(inspect);
          resolve(found);
        };
        const deadline = setTimeout(() => {
          pending.delete(inspect);
          reject(new Error(`missing ${description}: ${JSON.stringify(frames)}`));
        }, 3000);
        pending.add(inspect);
        inspect();
      }),
  };
}

it('mounted completion delivers durable successor envelopes through the production gateway', async () => {
  let gatewayUrl: string | undefined;
  const secret = 's'.repeat(32);
  const harness = OrganizationHarness.openComposedWith({
    internalAuthSecret: secret,
    pushFetch: (url, init) => {
      if (gatewayUrl === undefined) throw new Error('gateway must start before publishing');
      return fetch(url.replace('http://gw.invalid', gatewayUrl), init);
    },
  });
  let gateway: ReturnType<typeof Bun.spawn> | undefined;
  let backend: ReturnType<typeof Bun.serve> | undefined;
  const sockets: WebSocket[] = [];
  try {
    // Stored active edges exercise consumption without activating production authoring.
    seedDependencyAuthority(harness.databasePath());
    for (const username of ['ada', 'grace']) await harness.register(username);
    for (const organizationId of ['org-a', 'org-b']) harness.organization(organizationId);
    harness.member('org-a', 'ada', 'member');
    harness.member('org-b', 'grace', 'member');
    harness.bind('ada', 'org-a');
    harness.bind('grace', 'org-b');
    harness.activate();
    expect(
      harness.sqlite.query("SELECT shared_people FROM organization WHERE id = 'org-a'").get(),
    ).toEqual({ shared_people: 0 });
    const create = async (username: string, name: string) => {
      const created = await harness.call(username, 'POST', '/api/projects', { name });
      expect(created.status).toBe(200);
      const body = created.body as { project: { id: string }; steps: { id: string }[] };
      const step = body.steps.at(0);
      if (step === undefined) throw new Error('project has no step');
      const project = { id: body.project.id, row: `${body.project.id}-row`, step: step.id };
      harness.sqlite.run('DELETE FROM step WHERE project_id = ? AND id <> ?', [
        project.id,
        project.step,
      ]);
      harness.sqlite.run(
        "INSERT INTO work_item (id, project_id, position, name, readiness) VALUES (?, ?, 10, ?, 'ready')",
        [project.row, project.id, name],
      );
      return project;
    };
    // Creation emits pushes, so start the real listener before preparing projects.
    backend = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: async (request) =>
        harness.request(new URL(request.url).pathname, {
          method: request.method,
          headers: request.headers,
          ...(request.method === 'GET' || request.method === 'HEAD'
            ? {}
            : { body: await request.text() }),
        }),
    });
    gateway = Bun.spawn(
      [
        process.execPath,
        new URL('../../../gw-01/src/testing/cross-project-delivery-gateway.ts', import.meta.url)
          .pathname,
        `http://127.0.0.1:${String(backend.port)}`,
        TEST_JWT_KEY,
        secret,
      ],
      { stdout: 'pipe', stderr: 'inherit' },
    );
    if (!(gateway.stdout instanceof ReadableStream)) throw new Error('gateway stdout is not piped');
    const reader = gateway.stdout.getReader();
    let startupDeadline: ReturnType<typeof setTimeout> | undefined;
    const ready = await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        startupDeadline = setTimeout(() => {
          reject(new Error('gateway startup deadline'));
        }, 10000);
      }),
    ]).finally(() => {
      clearTimeout(startupDeadline);
    });
    reader.releaseLock();
    const address = JSON.parse(new TextDecoder().decode(ready.value)) as { port: number };
    gatewayUrl = `http://127.0.0.1:${String(address.port)}`;
    const upstream = await create('ada', 'A');
    const downstream = await create('ada', 'B');
    const tail = await create('ada', 'C');
    const unrelated = await create('ada', 'Unrelated');
    const foreign = await create('grace', 'Foreign');
    for (const [id, predecessor, successor] of [
      ['a-b', upstream, downstream],
      ['b-c', downstream, tail],
    ] as const)
      harness.sqlite.run(
        `INSERT INTO external_dependency (id, organization_id, predecessor_project_id, successor_project_id,
        predecessor_work_item_id, predecessor_scope, predecessor_step_id,
        successor_work_item_id, successor_scope, successor_step_id, type)
        VALUES (?, 'org-a', ?, ?, ?, 'node', ?, ?, 'node', ?, 'FS')`,
        [
          id,
          predecessor.id,
          successor.id,
          predecessor.row,
          predecessor.step,
          successor.row,
          successor.step,
        ],
      );
    expect(harness.sqlite.query('SELECT * FROM assignment').all()).toEqual([]);
    const before = await harness.call(
      'ada',
      'GET',
      `/api/projects/${downstream.id}/work-items?full=true`,
    );
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({
      workItems: [{ nodeReadings: { [downstream.step]: 'unknown' } }],
    });
    const connect = async (username: string, projectId: string) => {
      const socket = new CookieSocket(`ws://127.0.0.1:${String(address.port)}/ws`, {
        headers: {
          origin: 'http://localhost',
          cookie: `__Host-wbs_access=${harness.token(username)}`,
        },
      });
      sockets.push(socket);
      const received = inbox(socket);
      await received.wait((frame) => frame.type === 'presence', 'authenticated socket roster');
      socket.send(JSON.stringify({ type: 'subscribe', subscription: `project:${projectId}` }));
      await received.wait(
        (frame) => frame.type === 'presence' && frame.users?.includes(username) === true,
        'admitted project roster',
      );
      return { socket, ...received };
    };
    const [b, c, observer, outsider] = await Promise.all([
      connect('ada', downstream.id),
      connect('ada', tail.id),
      connect('ada', unrelated.id),
      connect('grace', foreign.id),
    ]);
    const changed = await harness.call('ada', 'POST', `/api/projects/${upstream.id}/commands`, {
      commands: [
        { kind: 'setProgress', workItemId: upstream.row, stepId: upstream.step, state: 'done' },
      ],
    });
    expect(changed.status).toBe(200);
    for (const [client, project] of [
      [b, downstream],
      [c, tail],
    ] as const) {
      await client.wait(
        (frame) => frame.message?.type === 'elsewhere_changed',
        `successor ${project.id} delivery`,
      );
      client.socket.send(JSON.stringify({ type: 'ping' }));
      await client.wait((frame) => frame.type === 'pong', 'successor delivery barrier');
      const ledger = harness.sqlite
        .query<{ subscription: string; seq: number; message: string }, [string]>(
          "SELECT subscription, seq, message FROM event_log WHERE subscription = ? AND message LIKE '%elsewhere_changed%' ORDER BY seq",
        )
        .all(`project:${project.id}`)
        .map((entry) => ({ ...entry, message: JSON.parse(entry.message) as Frame['message'] }));
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({
        subscription: `project:${project.id}`,
        message: {
          type: 'elsewhere_changed',
          projectId: project.id,
          causeProjectId: upstream.id,
        },
      });
      expect(client.frames.filter((frame) => frame.message?.type === 'elsewhere_changed')).toEqual(
        ledger,
      );
    }
    // Pong is an ordered wire barrier after the command's awaited push responses.
    for (const client of [observer, outsider]) {
      client.socket.send(JSON.stringify({ type: 'ping' }));
      await client.wait((frame) => frame.type === 'pong', 'observer barrier');
      expect(client.frames.filter((frame) => frame.subscription !== undefined)).toEqual([]);
    }
    for (const project of [unrelated, foreign])
      expect(
        harness.sqlite
          .query(
            "SELECT * FROM event_log WHERE subscription = ? AND message LIKE '%elsewhere_changed%'",
          )
          .all(`project:${project.id}`),
      ).toEqual([]);
    const refreshed = await harness.call(
      'ada',
      'GET',
      `/api/projects/${downstream.id}/work-items?full=true`,
    );
    expect(refreshed.status).toBe(200);
    expect(refreshed.body).toMatchObject({
      workItems: [{ nodeReadings: { [downstream.step]: 'waiting' } }],
    });
  } finally {
    for (const socket of sockets) socket.close();
    if (gateway !== undefined) {
      gateway.kill();
      await gateway.exited;
    }
    if (backend !== undefined) await backend.stop(true);
    await harness.closeComposed();
  }
}, 30000);
