import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect, setDefaultTimeout, test } from 'bun:test';

import { readDocument, toolsFromDocument } from './openapi-tools';
import { createServer } from './server';
import type { FetchLike } from './wbs-client';

interface FixtureFaults {
  optimizer?: 'installed' | 'absent';
  readinessTimeout?: number;
  onSpawn?: (backend: ParityBackend) => void;
  readDocument?: typeof readDocument;
  closeClient?: (client: Client) => Promise<void>;
  closeServer?: () => Promise<void>;
  onTransports?: (transports: readonly InMemoryTransport[]) => void;
  stopGracefully?: (backend: ParityBackend) => void;
}
type ParityBackend = Bun.Subprocess<'ignore', 'pipe', 'inherit'>;
type ForwardedRequest = Parameters<FetchLike>[1] & { url: Parameters<FetchLike>[0] };

/** Real machine-key authentication; this packet does not exercise delegated OAuth authority. */
async function openFixture(active = true, scopes = ['read', 'write'], faults: FixtureFaults = {}) {
  const backend = Bun.spawn(
    [process.execPath, 'apps/wbs/be-01/src/testing/mcp-command-parity-backend.ts'],
    {
      cwd: new URL('../../../../', import.meta.url).pathname,
      env: {
        ...process.env,
        MCP_PARITY_ACTIVE: String(active),
        MCP_PARITY_OPTIMIZER: faults.optimizer,
      },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'inherit',
    },
  );
  const resources: (() => Promise<void>)[] = [];
  const transports: (() => Promise<void>)[] = [];
  let cleanup: Promise<void> | undefined;
  const close = (): Promise<void> => {
    cleanup ??= (async () => {
      const failures: unknown[] = [];
      const release = async (closers: readonly (() => Promise<void>)[]) => {
        const closed = await Promise.allSettled(
          closers.map((closer) => Promise.resolve().then(closer)),
        );
        for (const outcome of closed)
          if (outcome.status === 'rejected') failures.push(outcome.reason);
      };
      try {
        await release(resources);
      } finally {
        try {
          // Proof: omitting this release kept both real transport sends connected after
          // setup/resource-close failures; both lifecycle negatives failed (2026-10-23).
          await release(transports);
        } finally {
          try {
            // Proof: omitting child shutdown left exitCode/signalCode null in both
            // setup and resource-close failure negatives (2026-10-23).
            await stopBackend(backend, faults.stopGracefully);
          } catch (cause) {
            failures.push(cause);
          }
        }
      }
      if (failures.length > 0) throw new AggregateError(failures, failures.map(String).join('; '));
    })();
    return cleanup;
  };
  try {
    faults.onSpawn?.(backend);
    const reader = backend.stdout.getReader();
    let printed = '';
    try {
      await withinDeadline(
        (async () => {
          while (!printed.includes('\n')) {
            const chunk = await reader.read();
            if (chunk.done) throw new Error(`parity backend exited before readiness: ${printed}`);
            printed += new TextDecoder().decode(chunk.value);
          }
        })(),
        faults.readinessTimeout ?? 25_000,
        'parity backend readiness timed out',
      );
    } finally {
      reader.releaseLock();
    }
    const ready = JSON.parse(printed.split('\n')[0] ?? '') as {
      port: number;
      key: string;
      controlToken: string;
      predecessor: Endpoint;
      successor: Endpoint;
    };
    const { predecessor, successor } = ready;
    const apiUrl = `http://127.0.0.1:${String(ready.port)}`;
    const inspect = async (): Promise<Snapshot> => {
      const reply = await fetch(`${apiUrl}/_parity/state`, {
        headers: { authorization: `Bearer ${ready.controlToken}` },
      });
      if (reply.status !== 200)
        throw new Error(`parity inspection failed: ${String(reply.status)}`);
      return (await reply.json()) as Snapshot;
    };
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    transports.push(
      () => clientTransport.close(),
      () => serverTransport.close(),
    );
    faults.onTransports?.([clientTransport, serverTransport]);
    const send = clientTransport.send.bind(clientTransport);
    clientTransport.send = (message, options) =>
      send(message, {
        ...options,
        authInfo: { token: ready.key, clientId: 'parity', scopes },
      });
    const forwarded: ForwardedRequest[] = [];
    const server = createServer({
      tools: toolsFromDocument((faults.readDocument ?? readDocument)()),
      config: {
        MCP_AUTH_MODE: 'standalone',
        MCP_TRUSTED_PROXY_HOPS: 0,
        MCP_PUBLIC_URL: 'http://mcp.test/mcp',
        WBS_API_URL: apiUrl,
      },
      // Forward the actual generated URL, headers and body without adding browser authority.
      fetchImpl: (url, init) => {
        forwarded.push({ url, ...init });
        return fetch(url, init);
      },
      reportUnexpectedToolFailure: (cause) => {
        throw cause;
      },
    });
    resources.push(() =>
      faults.closeServer === undefined ? server.close() : faults.closeServer(),
    );
    const client = new Client({ name: 'parity', version: '1' });
    resources.push(() =>
      faults.closeClient === undefined ? client.close() : faults.closeClient(client),
    );
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    const call = async (name: string, arguments_: Record<string, unknown>) => {
      const reply = await client.callTool({ name, arguments: arguments_ });
      const content = reply.content;
      if (!Array.isArray(content)) throw new Error('MCP content missing');
      const part: unknown = content[0];
      if (
        typeof part !== 'object' ||
        part === null ||
        !('text' in part) ||
        typeof part.text !== 'string'
      )
        throw new Error('MCP text missing');
      return { isError: reply.isError, text: part.text };
    };
    const command = {
      kind: 'addTypedDependency',
      predecessor: wholeEndpoint(predecessor),
      successor: wholeEndpoint(successor),
      type: 'FS',
    };
    return {
      predecessor,
      successor,
      call,
      command,
      inspect,
      authority: async (
        action:
          | 'restricted-predecessor'
          | 'hold'
          | 'queued'
          | 'revoke-credential'
          | 'restrict-successor'
          | 'release',
      ) => {
        const reply = await fetch(`${apiUrl}/_parity/authority/${action}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${ready.controlToken}` },
        });
        if (reply.status !== 200)
          throw new Error(`authority preparation failed: ${String(reply.status)}`);
      },
      prepareOptimization: async () => {
        const reply = await fetch(`${apiUrl}/_parity/optimization`, {
          method: 'POST',
          headers: { authorization: `Bearer ${ready.controlToken}` },
        });
        if (reply.status !== 200)
          throw new Error(`optimization preparation failed: ${String(reply.status)}`);
      },
      forwarded,
      apiUrl,
      key: ready.key,
      http: async (method: string, path: string, body?: unknown) => {
        const reply = await fetch(`${apiUrl}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${ready.key}`,
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: reply.status, body: (await reply.json()) as unknown };
      },
      close,
    };
  } catch (cause) {
    try {
      // Proof: bypassing setup cleanup left the ready child alive in the
      // document-read failure negative (2026-10-23).
      await close();
    } catch (cleanupCause) {
      throw new AggregateError(
        [cause, cleanupCause],
        `${String(cause)}; cleanup also failed: ${String(cleanupCause)}`,
        { cause: cleanupCause },
      );
    }
    throw cause;
  }
}

async function withinDeadline<T>(
  operation: Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => {
          reject(new Error(message));
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(deadline);
  }
}

async function stopBackend(
  backend: ParityBackend,
  stopGracefully = (child: ParityBackend) => {
    child.kill('SIGTERM');
  },
): Promise<void> {
  if (backend.exitCode === null && backend.signalCode === null) stopGracefully(backend);
  let forced = false;
  let grace: ReturnType<typeof setTimeout> | undefined;
  try {
    const stopped = await Promise.race([
      backend.exited.then((code) => ({ kind: 'exited' as const, code })),
      new Promise<{ kind: 'timeout' }>((resolve) => {
        grace = setTimeout(() => {
          resolve({ kind: 'timeout' });
        }, 1_000);
      }),
    ]);
    if (stopped.kind === 'timeout') {
      forced = true;
      // Proof: removing SIGKILL hit the reap deadline and failed the forced-exit
      // negative's required-SIGKILL rejection assertion (2026-10-23).
      backend.kill('SIGKILL');
    }
    const code = await withinDeadline(
      backend.exited,
      1_000,
      'parity backend did not exit after SIGKILL',
    );
    if (forced) throw new Error(`parity backend required SIGKILL; reaped exit ${String(code)}`);
    if (code !== 0) throw new Error(`parity backend exited with ${String(code)}`);
  } finally {
    clearTimeout(grace);
  }
}

interface Endpoint {
  projectId: string;
  workItemId: string;
  scope: 'whole';
  steps: string[];
}
interface Snapshot {
  pushes: string[];
  predecessorAuthored: unknown;
  relationship: ({ id: string } & Record<string, unknown>) | null;
  journal: { preconditions: string; payload: string } | null;
  staged: { id: string; projectId: string; revision: number } | null;
  localRelationships: unknown[];
  journalCount: number;
  revisions: unknown;
  effects: unknown;
}
setDefaultTimeout(45_000);

// Proof: dropping nested projectId in wbs-client.ts failed MCP add with 404; replacing
// command-bindings minted id failed the response/SQLite identity assertion; omitting
// resolveConnectedGraph external edges failed the expected 2→4 placement (2026-10-22).
for (const transport of ['HTTP', 'MCP'] as const) {
  test(`${transport} commits whole FS and rereads connected placement through generated MCP`, async () => {
    const fixture = await openFixture();
    try {
      const { successor, predecessor } = fixture;
      const tree = async () => {
        const reply = await fixture.call('getApiProjectsByIdWork-items', {
          id: successor.projectId,
        });
        expect(reply.isError).not.toBe(true);
        return JSON.parse(reply.text) as unknown;
      };
      expect(await tree()).toMatchObject({
        workItems: [{ schedule: { earliestStart: 0, earliestFinish: 2 } }],
      });
      const beforeJournal = (await fixture.inspect()).journalCount;
      const commands = [fixture.command];
      let committed: unknown;
      if (transport === 'MCP') {
        const reply = await fixture.call('postApiProjectsByIdCommands', {
          id: successor.projectId,
          commands,
        });
        expect(reply.isError).not.toBe(true);
        committed = JSON.parse(reply.text) as unknown;
        const write = fixture.forwarded.find((request) => request.method === 'POST');
        // Proof: omitting wbs-client's production V1 claim failed this exact equality
        // with the missing header (2026-10-23).
        expect(write).toEqual<unknown>({
          url: `${fixture.apiUrl}/api/projects/${successor.projectId}/commands`,
          method: 'POST',
          redirect: 'manual',
          signal: expect.any(AbortSignal) as unknown,
          headers: {
            'X-WBS-Dependency-Semantics': 'cross-project-dependencies-v1',
            authorization: `Bearer ${fixture.key}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ commands }),
        });
      } else {
        const reply = await fixture.http('POST', `/api/projects/${successor.projectId}/commands`, {
          commands,
        });
        expect(reply.status).toBe(200);
        committed = reply.body;
      }
      const snapshot = await fixture.inspect();
      const relationship = snapshot.relationship;
      if (relationship === null) throw new Error('committed relationship missing');
      expect(committed).toMatchObject({ results: [{ index: 0, id: relationship.id }] });
      expect(relationship).toMatchObject({
        predecessor_project_id: predecessor.projectId,
        successor_project_id: successor.projectId,
        predecessor_work_item_id: predecessor.workItemId,
        successor_work_item_id: successor.workItemId,
        predecessor_scope: 'whole',
        successor_scope: 'whole',
        type: 'FS',
      });
      expect(snapshot.journalCount).toBe(beforeJournal + 1);
      const journal = snapshot.journal;
      if (journal === null) throw new Error('fixture journal missing');
      expect(JSON.parse(journal.preconditions)).toMatchObject({
        externalRevisions: {
          from: [
            { projectId: predecessor.projectId, workItemId: predecessor.workItemId, revision: 0 },
          ],
          expected: [
            { projectId: predecessor.projectId, workItemId: predecessor.workItemId, revision: 1 },
          ],
        },
      });
      expect(snapshot.revisions).toEqual([{ revision: 1 }, { revision: 1 }]);
      const expected = {
        scheduleError: null,
        workItems: [
          {
            id: successor.workItemId,
            revision: 1,
            schedule: { earliestStart: 2, earliestFinish: 4 },
            dates: { startsOn: '2026-10-21', endsOn: '2026-10-22' },
          },
        ],
        connectedDependencies: [
          {
            id: relationship.id,
            type: 'FS',
            predecessor: { endpoint: wholeEndpoint(predecessor), revision: 1 },
            successor: { endpoint: wholeEndpoint(successor), revision: 1 },
          },
        ],
      };
      expect(await tree()).toMatchObject(expected);
      const direct = await fixture.http('GET', `/api/projects/${successor.projectId}/work-items`);
      expect(direct.status).toBe(200);
      expect(await tree()).toEqual(direct.body);
      expect((await fixture.inspect()).pushes.length).toBeGreaterThan(0);
    } finally {
      await fixture.close();
    }
  });
}

// Proof: switching compose.ts inactive authoring to active made this call succeed
// (isError undefined instead of true), watched 2026-10-22. Unconditionally seeding
// ENABLED reproduced the same failure with the capable source (2026-10-23).
test('ordinary MCP composition refuses dormant external commands without durable effects or pushes', async () => {
  const fixture = await openFixture(false);
  try {
    const before = (await fixture.inspect()).effects;
    const reply = await fixture.call('postApiProjectsByIdCommands', {
      id: fixture.successor.projectId,
      commands: [fixture.command],
    });
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain('HTTP 409 external_dependencies_inactive');
    expect((await fixture.inspect()).effects).toEqual(before);
    expect((await fixture.inspect()).pushes).toEqual([]);
  } finally {
    await fixture.close();
  }
});

for (const transport of ['HTTP', 'MCP'] as const) {
  test(`${transport} rolls back external add when a later command fails at its index`, async () => {
    const fixture = await openFixture();
    try {
      const before = (await fixture.inspect()).effects;
      const commands = [
        fixture.command,
        { kind: 'patchWorkItem', workItemId: 'missing-row', patch: { name: 'Invalid' } },
      ];
      if (transport === 'MCP') {
        const reply = await fixture.call('postApiProjectsByIdCommands', {
          id: fixture.successor.projectId,
          commands,
        });
        expect(reply.isError).toBe(true);
        expect(reply.text).toContain('"at":1');
        expect(reply.text).toContain('"kind":"patchWorkItem"');
      } else {
        const reply = await fixture.http(
          'POST',
          `/api/projects/${fixture.successor.projectId}/commands`,
          { commands },
        );
        expect(reply.status).toBe(404);
        expect(reply.body).toMatchObject({ at: 1, kind: 'patchWorkItem' });
      }
      expect((await fixture.inspect()).effects).toEqual(before);
      expect((await fixture.inspect()).pushes).toEqual([]);
    } finally {
      await fixture.close();
    }
  });
}

// Proof: bypassing server.ts write-scope guard made this call succeed
// (isError undefined instead of true), watched 2026-10-22.
test('read-only MCP grant refuses the otherwise admitted external command', async () => {
  const fixture = await openFixture(true, ['read']);
  try {
    const before = (await fixture.inspect()).effects;
    const reply = await fixture.call('postApiProjectsByIdCommands', {
      id: fixture.successor.projectId,
      commands: [fixture.command],
    });
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain('insufficient_scope');
    expect((await fixture.inspect()).effects).toEqual(before);
    expect((await fixture.inspect()).pushes).toEqual([]);
  } finally {
    await fixture.close();
  }
});

function expectReaped(backend: ParityBackend): void {
  expect(backend.exitCode !== null || backend.signalCode !== null).toBe(true);
  expect(() => process.kill(backend.pid, 0)).toThrow();
}

async function rescueChild(backend: ParityBackend | undefined): Promise<void> {
  if (backend?.exitCode !== null || backend.signalCode !== null) return;
  backend.kill('SIGKILL');
  await backend.exited;
}

test('setup document failure closes acquired transports and reaps the already ready backend', async () => {
  let backend: ParityBackend | undefined;
  let transports: readonly InMemoryTransport[] = [];
  try {
    const failure = await readFailure(
      openFixture(true, ['read', 'write'], {
        onSpawn: (child) => {
          backend = child;
        },
        onTransports: (acquired) => {
          transports = acquired;
        },
        readDocument: () => {
          throw new Error('injected document read failure');
        },
      }),
    );
    expect(failure.message).toContain('injected document read failure');
    if (backend === undefined) throw new Error('fixture child was not spawned');
    expectReaped(backend);
    expect(transports).toHaveLength(2);
    for (const transport of transports)
      expect(
        (await readFailure(transport.send({ jsonrpc: '2.0', method: 'notifications/initialized' })))
          .message,
      ).toBe('Not connected');
  } finally {
    await rescueChild(backend);
  }
});

test('client and server close failures still disconnect transports and reap backend', async () => {
  let backend: ParityBackend | undefined;
  let transports: readonly InMemoryTransport[] = [];
  try {
    const fixture = await openFixture(true, ['read', 'write'], {
      onSpawn: (child) => {
        backend = child;
      },
      onTransports: (acquired) => {
        transports = acquired;
      },
      closeClient: () => Promise.reject(new Error('injected client close failure')),
      closeServer: () => Promise.reject(new Error('injected server close failure')),
    });
    expect((await readFailure(fixture.close())).message).toContain('injected client close failure');
    if (backend === undefined) throw new Error('fixture child was not spawned');
    expectReaped(backend);
    expect(transports).toHaveLength(2);
    for (const transport of transports)
      expect(
        (await readFailure(transport.send({ jsonrpc: '2.0', method: 'notifications/initialized' })))
          .message,
      ).toBe('Not connected');
  } finally {
    await rescueChild(backend);
  }
});

test('a backend that misses graceful exit is force killed reaped and reported', async () => {
  let backend: ParityBackend | undefined;
  try {
    const fixture = await openFixture(true, ['read', 'write'], {
      onSpawn: (child) => {
        backend = child;
      },
      stopGracefully: () => undefined,
    });
    expect((await readFailure(fixture.close())).message).toContain('required SIGKILL');
    if (backend === undefined) throw new Error('fixture child was not spawned');
    expectReaped(backend);
  } finally {
    await rescueChild(backend);
  }
});

async function readFailure(operation: Promise<unknown>): Promise<Error> {
  try {
    await operation;
  } catch (cause) {
    if (cause instanceof Error) return cause;
    throw new Error('expected an Error rejection', { cause });
  }
  throw new Error('expected the operation to reject');
}

function wholeEndpoint({ projectId, workItemId, scope }: Endpoint) {
  return { projectId, workItemId, scope };
}

function nodeCommands(
  fixture: Awaited<ReturnType<typeof openFixture>>,
  encoded = false,
  type: 'FS' | 'SS' | 'FF' = 'FS',
) {
  const remoteStep = fixture.predecessor.steps.at(-1);
  const ownerStep = fixture.successor.steps.at(0);
  if (remoteStep === undefined || ownerStep === undefined) throw new Error('fixture steps missing');
  const predecessor = encoded
    ? {
        projectId: fixture.predecessor.projectId,
        scope: 'node',
        stepNodeId: `sn1.${fixture.predecessor.workItemId}.${remoteStep}`,
      }
    : { ...wholeEndpoint(fixture.predecessor), scope: 'node', stepId: remoteStep };
  return [
    { kind: 'createWorkItem', ref: 'REMOTE.010', name: 'Staged successor' },
    { kind: 'setStatus', workItemRef: 'REMOTE.010', status: 'ready' },
    {
      kind: 'setEstimate',
      workItemRef: 'REMOTE.010',
      stepId: ownerStep,
      days: { optimistic: 1, realistic: 1, pessimistic: 1 },
    },
    {
      kind: 'addTypedDependency',
      type,
      predecessor,
      successor: { scope: 'node', workItemRef: 'REMOTE.010', stepId: ownerStep },
    },
  ];
}

async function submit(
  fixture: Awaited<ReturnType<typeof openFixture>>,
  transport: 'HTTP' | 'MCP',
  commands: unknown[],
) {
  if (transport === 'HTTP') {
    const reply = await fixture.http(
      'POST',
      `/api/projects/${fixture.successor.projectId}/commands`,
      { commands },
    );
    return { status: reply.status, text: JSON.stringify(reply.body) };
  }
  const reply = await fixture.call('postApiProjectsByIdCommands', {
    id: fixture.successor.projectId,
    commands,
  });
  return { status: reply.isError === true ? 0 : 200, text: reply.text };
}

// Proof: dropping nested projectId forwarding, forcing owner project binding, or
// skipping dotted alias lookup each failed the MCP split-node success (2026-10-23).
for (const transport of ['HTTP', 'MCP'] as const) {
  for (const encoded of [false, true]) {
    test(`${transport} node ${encoded ? 'encoded' : 'split'} binds dotted successor alias and derives FS placement`, async () => {
      const fixture = await openFixture();
      try {
        const commands = nodeCommands(fixture, encoded);
        const before = await fixture.inspect();
        const reply = await submit(fixture, transport, commands);
        expect(reply.status).toBe(200);
        const snapshot = await fixture.inspect();
        const { staged, relationship, journal } = snapshot;
        if (staged === null || relationship === null || journal === null)
          throw new Error('node commit missing');
        expect(JSON.parse(reply.text)).toMatchObject({
          results: [
            { index: 0, id: staged.id },
            { index: 1 },
            { index: 2 },
            { index: 3, id: relationship.id },
          ],
        });
        expect(staged).toMatchObject({ projectId: fixture.successor.projectId, revision: 3 });
        const predecessor = {
          ...wholeEndpoint(fixture.predecessor),
          scope: 'node',
          stepId: fixture.predecessor.steps.at(-1),
        };
        const successor = {
          projectId: fixture.successor.projectId,
          workItemId: staged.id,
          scope: 'node',
          stepId: fixture.successor.steps.at(0),
        };
        expect(relationship).toMatchObject({
          predecessor_project_id: predecessor.projectId,
          predecessor_work_item_id: predecessor.workItemId,
          predecessor_scope: 'node',
          predecessor_step_id: predecessor.stepId,
          successor_project_id: successor.projectId,
          successor_work_item_id: staged.id,
          successor_scope: 'node',
          successor_step_id: successor.stepId,
          type: 'FS',
        });
        expect(snapshot.localRelationships).toEqual([]);
        expect(snapshot.journalCount).toBe(before.journalCount + 1);
        expect(journal.payload).toContain(staged.id);
        expect(journal.payload).not.toContain('REMOTE.010');
        expect(JSON.parse(journal.preconditions)).toMatchObject({
          externalRevisions: {
            from: [
              { projectId: predecessor.projectId, workItemId: predecessor.workItemId, revision: 0 },
            ],
            expected: [
              { projectId: predecessor.projectId, workItemId: predecessor.workItemId, revision: 1 },
            ],
          },
        });
        const reading = await fixture.call('getApiProjectsByIdWork-items', {
          id: successor.projectId,
        });
        expect(reading.isError).not.toBe(true);
        const tree = JSON.parse(reading.text) as { workItems: { id: string }[] };
        // Remote's two serial one-day steps finish at 2; the staged one-day node follows.
        expect(tree.workItems.find(({ id }) => id === staged.id)).toMatchObject({
          revision: 3,
          schedule: { earliestStart: 2, earliestFinish: 3 },
        });
        expect(tree).toMatchObject({
          scheduleError: null,
          connectedDependencies: [
            {
              id: relationship.id,
              type: 'FS',
              predecessor: { endpoint: predecessor, revision: 1 },
              successor: { endpoint: successor, revision: 3 },
            },
          ],
        });
        const direct = await fixture.http('GET', `/api/projects/${successor.projectId}/work-items`);
        expect(direct.status).toBe(200);
        expect(direct.body).toEqual(tree);
        if (transport === 'MCP')
          expect(fixture.forwarded.find(({ method }) => method === 'POST')?.body).toBe(
            JSON.stringify({ commands }),
          );
        expect(snapshot.pushes.length).toBeGreaterThan(0);
      } finally {
        await fixture.close();
      }
    });
  }
  // Proof: bypassing explicit-project alias refusal or dormant authoring made the
  // selected MCP refusal succeed. Skipping remote step identity or leaf scope
  // checks lost typed refusal and raised HTTP 500; all watched 2026-10-23.
  for (const fault of [
    'remote-step',
    'descendant-leaf',
    'explicit-remote-alias',
    'explicit-owner-alias',
    'later-command',
    'dormant',
  ] as const) {
    test(`${transport} node ${fault} refuses atomically with all staged effects rolled back`, async () => {
      const fixture = await openFixture(fault !== 'dormant');
      try {
        const commands: Record<string, unknown>[] = nodeCommands(fixture);
        const last = commands.at(-1);
        if (last === undefined) throw new Error('node command missing');
        if (fault === 'remote-step')
          last['predecessor'] = {
            ...wholeEndpoint(fixture.predecessor),
            scope: 'node',
            stepId: fixture.successor.steps.at(0),
          };
        if (fault === 'descendant-leaf')
          last['predecessor'] = {
            ...wholeEndpoint(fixture.predecessor),
            scope: 'descendant-step',
            stepId: fixture.predecessor.steps.at(-1),
          };
        if (fault === 'explicit-remote-alias' || fault === 'explicit-owner-alias')
          last['successor'] = {
            projectId:
              fault === 'explicit-owner-alias'
                ? fixture.successor.projectId
                : fixture.predecessor.projectId,
            scope: 'node',
            workItemRef: 'REMOTE.010',
            stepId: fixture.successor.steps.at(0),
          };
        if (fault === 'later-command')
          commands.push({
            kind: 'patchWorkItem',
            workItemId: 'missing-row',
            patch: { name: 'Invalid' },
          });
        const before = (await fixture.inspect()).effects;
        const reply = await submit(fixture, transport, commands);
        expect(reply.status).not.toBe(200);
        const expectedStatus =
          fault === 'remote-step' || fault === 'later-command'
            ? 404
            : fault.startsWith('explicit-')
              ? 400
              : 409;
        if (transport === 'HTTP') expect(reply.status).toBe(expectedStatus);
        else expect(reply.text).toContain(`HTTP ${String(expectedStatus)}`);
        if (fault === 'remote-step') expect(reply.text).toContain('not_found');
        if (fault === 'descendant-leaf') expect(reply.text).toContain('not_a_parent');
        if (fault === 'dormant') expect(reply.text).toContain('external_dependencies_inactive');
        if (!fault.startsWith('explicit-'))
          expect(reply.text).toContain(`"at":${String(fault === 'later-command' ? 4 : 3)}`);
        const after = await fixture.inspect();
        expect(after.effects).toEqual(before);
        expect(after.pushes).toEqual([]);
      } finally {
        await fixture.close();
      }
    });
  }
}

// Proof: bypassing outer setup cleanup left the child alive after the injected
// readiness deadline; the reaped-child assertion failed (2026-10-23).
test('readiness deadline failure reaps the child before returning', async () => {
  let backend: ParityBackend | undefined;
  try {
    const failure = await readFailure(
      openFixture(true, ['read', 'write'], {
        readinessTimeout: 1,
        onSpawn: (child) => {
          backend = child;
        },
      }),
    );
    expect(failure.message).toContain('parity backend readiness timed out');
    if (backend === undefined) throw new Error('fixture child was not spawned');
    expectReaped(backend);
  } finally {
    await rescueChild(backend);
  }
});

async function prepareLongPredecessor(fixture: Awaited<ReturnType<typeof openFixture>>) {
  const stepId = fixture.predecessor.steps.at(-1);
  if (stepId === undefined) throw new Error('remote step missing');
  const reply = await fixture.http(
    'POST',
    `/api/projects/${fixture.predecessor.projectId}/commands`,
    {
      commands: [
        {
          kind: 'setEstimate',
          workItemId: fixture.predecessor.workItemId,
          stepId,
          days: { optimistic: 3, realistic: 3, pessimistic: 3 },
        },
      ],
    },
  );
  expect(reply.status).toBe(200);
  return fixture.inspect();
}

// Proof: forcing binding to FS failed both MCP SS/FF persisted-type assertions;
// replacing SS zero or FF duration-difference weight with predecessor duration
// placed the successor at 4→5 instead of 1→2 or 3→4 (2026-10-23).
// Comparing the FF successor start instead of finish in materialized reconciliation
// failed the MCP FF command with HTTP 500. Zero nominal FF weight survived because
// that independent reconciliation restores its finish bound; see bounded evidence.
for (const transport of ['HTTP', 'MCP'] as const) {
  for (const encoded of [false, true]) {
    for (const { type, earliestStart, earliestFinish } of [
      { type: 'SS', earliestStart: 1, earliestFinish: 2 },
      { type: 'FF', earliestStart: 3, earliestFinish: 4 },
      { type: 'FS', earliestStart: 4, earliestFinish: 5 },
    ] as const) {
      test(`${transport} node ${encoded ? 'encoded' : 'split'} ${type} preserves type and distinct connected placement`, async () => {
        const fixture = await openFixture();
        try {
          const before = await prepareLongPredecessor(fixture);
          const commands = nodeCommands(fixture, encoded, type);
          const reply = await submit(fixture, transport, commands);
          expect(reply.status).toBe(200);
          const snapshot = await fixture.inspect();
          const { staged, relationship, journal } = snapshot;
          if (staged === null || relationship === null || journal === null)
            throw new Error('typed node commit missing');
          const predecessor = {
            ...wholeEndpoint(fixture.predecessor),
            scope: 'node',
            stepId: fixture.predecessor.steps.at(-1),
          };
          const successor = {
            projectId: fixture.successor.projectId,
            workItemId: staged.id,
            scope: 'node',
            stepId: fixture.successor.steps.at(0),
          };
          expect(JSON.parse(reply.text)).toMatchObject({
            results: [
              { index: 0, id: staged.id },
              { index: 1 },
              { index: 2 },
              { index: 3, id: relationship.id },
            ],
          });
          expect(staged).toMatchObject({ projectId: successor.projectId, revision: 3 });
          expect(relationship).toMatchObject({
            predecessor_project_id: predecessor.projectId,
            predecessor_work_item_id: predecessor.workItemId,
            predecessor_scope: 'node',
            predecessor_step_id: predecessor.stepId,
            successor_project_id: successor.projectId,
            successor_work_item_id: staged.id,
            successor_scope: 'node',
            successor_step_id: successor.stepId,
            type,
          });
          expect(snapshot.localRelationships).toEqual([]);
          expect(snapshot.journalCount).toBe(before.journalCount + 1);
          expect(journal.payload).toContain(staged.id);
          expect(journal.payload).toContain(relationship.id);
          expect(journal.payload).toContain(`"type":"${type}"`);
          expect(journal.payload).not.toContain('REMOTE.010');
          expect(JSON.parse(journal.preconditions)).toMatchObject({
            externalRevisions: {
              from: [
                {
                  projectId: predecessor.projectId,
                  workItemId: predecessor.workItemId,
                  revision: 1,
                },
              ],
              expected: [
                {
                  projectId: predecessor.projectId,
                  workItemId: predecessor.workItemId,
                  revision: 2,
                },
              ],
            },
          });
          const reading = await fixture.call('getApiProjectsByIdWork-items', {
            id: successor.projectId,
          });
          expect(reading.isError).not.toBe(true);
          const tree = JSON.parse(reading.text) as { workItems: { id: string }[] };
          // Remote's selected second node is 1→4; successor is one day.
          expect(tree.workItems.find(({ id }) => id === staged.id)).toMatchObject({
            revision: 3,
            schedule: { earliestStart, earliestFinish },
          });
          expect(tree).toMatchObject({
            scheduleError: null,
            connectedDependencies: [
              {
                id: relationship.id,
                type,
                predecessor: { endpoint: predecessor, revision: 2 },
                successor: { endpoint: successor, revision: 3 },
              },
            ],
          });
          const direct = await fixture.http(
            'GET',
            `/api/projects/${successor.projectId}/work-items`,
          );
          expect(direct.status).toBe(200);
          expect(direct.body).toEqual(tree);
          if (transport === 'MCP')
            expect(fixture.forwarded.find(({ method }) => method === 'POST')).toEqual<unknown>({
              url: `${fixture.apiUrl}/api/projects/${successor.projectId}/commands`,
              method: 'POST',
              redirect: 'manual',
              signal: expect.any(AbortSignal) as unknown,
              headers: {
                'X-WBS-Dependency-Semantics': 'cross-project-dependencies-v1',
                authorization: `Bearer ${fixture.key}`,
                'content-type': 'application/json',
              },
              body: JSON.stringify({ commands }),
            });
          expect(snapshot.pushes.length).toBeGreaterThan(before.pushes.length);
        } finally {
          await fixture.close();
        }
      });
    }
  }
  test(`${transport} node without external edge keeps the staged successor at 0→1`, async () => {
    const fixture = await openFixture();
    try {
      await prepareLongPredecessor(fixture);
      const reply = await submit(fixture, transport, nodeCommands(fixture).slice(0, 3));
      expect(reply.status).toBe(200);
      const snapshot = await fixture.inspect();
      if (snapshot.staged === null) throw new Error('staged control missing');
      expect(snapshot.relationship).toBeNull();
      const reading = await fixture.call('getApiProjectsByIdWork-items', {
        id: fixture.successor.projectId,
      });
      expect(reading.isError).not.toBe(true);
      const tree = JSON.parse(reading.text) as { workItems: { id: string }[] };
      expect(tree.workItems.find(({ id }) => id === snapshot.staged?.id)).toMatchObject({
        schedule: { earliestStart: 0, earliestFinish: 1 },
      });
    } finally {
      await fixture.close();
    }
  });
  // Proof: switching ordinary compose authoring to active made both MCP SS/FF
  // dormant refusals return successful command results instead of HTTP 409 (2026-10-23).
  for (const type of ['SS', 'FF'] as const) {
    for (const fault of ['later-command', 'dormant'] as const) {
      test(`${transport} node ${type} ${fault} preserves the prepared database and pushes`, async () => {
        const fixture = await openFixture(fault !== 'dormant');
        try {
          const before = await prepareLongPredecessor(fixture);
          const commands: Record<string, unknown>[] = nodeCommands(fixture, false, type);
          if (fault === 'later-command')
            commands.push({
              kind: 'patchWorkItem',
              workItemId: 'missing-row',
              patch: { name: 'Invalid' },
            });
          const reply = await submit(fixture, transport, commands);
          const status = fault === 'dormant' ? 409 : 404;
          if (transport === 'HTTP') expect(reply.status).toBe(status);
          else expect(reply.text).toContain(`HTTP ${String(status)}`);
          expect(reply.text).toContain(`"at":${fault === 'dormant' ? '3' : '4'}`);
          expect(reply.text).toContain(
            fault === 'dormant' ? 'external_dependencies_inactive' : 'patchWorkItem',
          );
          const after = await fixture.inspect();
          expect(after.effects).toEqual(before.effects);
          expect(after.pushes).toEqual(before.pushes);
        } finally {
          await fixture.close();
        }
      });
    }
  }
}

async function prepareDescendantPredecessor(
  fixture: Awaited<ReturnType<typeof openFixture>>,
  slowFirst = false,
) {
  const commands: Record<string, unknown>[] = [];
  for (const [index, days] of (slowFirst ? [3, 1] : [1, 3]).entries()) {
    const ref = `REMOTE.LEAF.${String(index)}`;
    commands.push(
      {
        kind: 'createWorkItem',
        ref,
        parentId: fixture.predecessor.workItemId,
        name: `Remote leaf ${String(index)}`,
      },
      { kind: 'setStatus', workItemRef: ref, status: 'ready' },
    );
    for (const [position, stepId] of fixture.predecessor.steps.entries()) {
      const duration = position === 0 ? 1 : days;
      commands.push({
        kind: 'setEstimate',
        workItemRef: ref,
        stepId,
        days: { optimistic: duration, realistic: duration, pessimistic: duration },
      });
    }
  }
  const reply = await fixture.http(
    'POST',
    `/api/projects/${fixture.predecessor.projectId}/commands`,
    { commands },
  );
  expect(reply.status).toBe(200);
  const committed = reply.body as { results: { ref?: string; id?: string }[] };
  const leaves = [0, 1].map((index) => {
    const id = committed.results.find(({ ref }) => ref === `REMOTE.LEAF.${String(index)}`)?.id;
    if (id === undefined) throw new Error('remote descendant leaf missing');
    return id;
  });
  return { leaves, before: await fixture.inspect() };
}

function descendantCommands(fixture: Awaited<ReturnType<typeof openFixture>>) {
  const commands: Record<string, unknown>[] = nodeCommands(fixture);
  const dependency = commands.at(-1);
  if (dependency === undefined) throw new Error('descendant command missing');
  dependency['predecessor'] = {
    ...wholeEndpoint(fixture.predecessor),
    scope: 'descendant-step',
    stepId: fixture.predecessor.steps.at(-1),
  };
  return commands;
}

// Proof: forcing the owner project failed remote MCP success; forcing node scope
// failed remote and local-parent alias success. Omitting all expanded external
// graph edges placed the successor at 0→1 instead of 4→5 (2026-10-23). Keeping
// just the first edge survived both leaf orders; this is not an individual-edge proof.
for (const transport of ['HTTP', 'MCP'] as const) {
  for (const slowFirst of [false, true]) {
    test(`${transport} descendant-step remote parent constrains local node with slow leaf ${slowFirst ? 'first' : 'last'}`, async () => {
      const fixture = await openFixture();
      try {
        const { before, leaves } = await prepareDescendantPredecessor(fixture, slowFirst);
        const commands = descendantCommands(fixture);
        const reply = await submit(fixture, transport, commands);
        expect(reply.status).toBe(200);
        const snapshot = await fixture.inspect();
        const { staged, relationship, journal } = snapshot;
        if (staged === null || relationship === null || journal === null)
          throw new Error('descendant commit missing');
        const predecessor = {
          ...wholeEndpoint(fixture.predecessor),
          scope: 'descendant-step',
          stepId: fixture.predecessor.steps.at(-1),
        };
        const successor = {
          projectId: fixture.successor.projectId,
          workItemId: staged.id,
          scope: 'node',
          stepId: fixture.successor.steps.at(0),
        };
        expect(JSON.parse(reply.text)).toMatchObject({
          results: [{ index: 0, id: staged.id }, {}, {}, { index: 3, id: relationship.id }],
        });
        expect(relationship).toMatchObject({
          predecessor_project_id: predecessor.projectId,
          predecessor_work_item_id: predecessor.workItemId,
          predecessor_scope: 'descendant-step',
          predecessor_step_id: predecessor.stepId,
          successor_project_id: successor.projectId,
          successor_work_item_id: successor.workItemId,
          successor_scope: 'node',
          successor_step_id: successor.stepId,
          type: 'FS',
        });
        expect(staged).toMatchObject({ projectId: successor.projectId, revision: 3 });
        expect(snapshot.localRelationships).toEqual([]);
        expect(snapshot.journalCount).toBe(before.journalCount + 1);
        const payload = JSON.parse(journal.payload) as {
          forward: { do: string; steps: { do: string; dependency?: unknown }[] };
        };
        expect(payload.forward.do).toBe('batch');
        expect(
          payload.forward.steps.find((step) => step.do === 'add_typed_dependency'),
        ).toMatchObject({
          do: 'add_typed_dependency',
          dependency: {
            id: relationship.id,
            projectId: successor.projectId,
            predecessor,
            successor,
            type: 'FS',
          },
        });
        expect(journal.payload).not.toContain('REMOTE.010');
        const reading = await fixture.call('getApiProjectsByIdWork-items', {
          id: successor.projectId,
        });
        expect(reading.isError).not.toBe(true);
        const tree = JSON.parse(reading.text) as { workItems: { id: string }[] };
        // Two independent remote leaves finish at 2 and 4. Both must constrain
        // the one-day successor; either leaf can carry the maximum bound.
        expect(tree.workItems.find(({ id }) => id === staged.id)).toMatchObject({
          schedule: { earliestStart: 4, earliestFinish: 5 },
        });
        expect(tree).toMatchObject({
          scheduleError: null,
          connectedDependencies: [
            {
              id: relationship.id,
              type: 'FS',
              predecessor: { endpoint: predecessor },
              successor: { endpoint: successor },
            },
          ],
        });
        const remote = await fixture.http(
          'GET',
          `/api/projects/${predecessor.projectId}/work-items`,
        );
        expect(remote.status).toBe(200);
        const remoteTree = remote.body as {
          workItems: {
            id: string;
            parentId: string | null;
            schedule: { earliestFinish: number };
          }[];
        };
        const children = remoteTree.workItems.filter(
          ({ parentId }) => parentId === predecessor.workItemId,
        );
        expect(children).toHaveLength(2);
        for (const [index, leafId] of leaves.entries())
          expect(children.find(({ id }) => id === leafId)).toMatchObject({
            id: leafId,
            schedule: {
              earliestStart: 0,
              earliestFinish: (slowFirst ? index === 0 : index === 1) ? 4 : 2,
            },
          });
        const direct = await fixture.http('GET', `/api/projects/${successor.projectId}/work-items`);
        expect(direct.status).toBe(200);
        expect(direct.body).toEqual(tree);
        if (transport === 'MCP')
          expect(fixture.forwarded.find(({ method }) => method === 'POST')?.body).toBe(
            JSON.stringify({ commands }),
          );
        expect(snapshot.pushes.length).toBeGreaterThan(before.pushes.length);
      } finally {
        await fixture.close();
      }
    });
  }

  test(`${transport} descendant-step local successor parent alias resolves within its batch`, async () => {
    const fixture = await openFixture();
    try {
      const commands: Record<string, unknown>[] = [
        { kind: 'createWorkItem', ref: 'LOCAL.PARENT', name: 'Staged successor' },
      ];
      for (const ref of ['LOCAL.FIRST', 'LOCAL.SECOND'])
        commands.push(
          { kind: 'createWorkItem', ref, parentRef: 'LOCAL.PARENT', name: ref },
          { kind: 'setStatus', workItemRef: ref, status: 'ready' },
          {
            kind: 'setEstimate',
            workItemRef: ref,
            stepId: fixture.successor.steps.at(0),
            days: { optimistic: 1, realistic: 1, pessimistic: 1 },
          },
        );
      commands.push({
        kind: 'addTypedDependency',
        type: 'FS',
        predecessor: {
          ...wholeEndpoint(fixture.predecessor),
          scope: 'node',
          stepId: fixture.predecessor.steps.at(-1),
        },
        successor: {
          scope: 'descendant-step',
          workItemRef: 'LOCAL.PARENT',
          stepId: fixture.successor.steps.at(0),
        },
      });
      const before = await fixture.inspect();
      const reply = await submit(fixture, transport, commands);
      expect(reply.status).toBe(200);
      const snapshot = await fixture.inspect();
      if (snapshot.staged === null || snapshot.relationship === null || snapshot.journal === null)
        throw new Error('local parent alias commit missing');
      expect(snapshot.relationship).toMatchObject({
        successor_project_id: fixture.successor.projectId,
        successor_work_item_id: snapshot.staged.id,
        successor_scope: 'descendant-step',
        successor_step_id: fixture.successor.steps.at(0),
      });
      expect(snapshot.localRelationships).toEqual([]);
      expect(snapshot.journalCount).toBe(before.journalCount + 1);
      expect(snapshot.journal.payload).toContain(snapshot.relationship.id);
      expect(snapshot.journal.payload).not.toContain('LOCAL.PARENT');
      const reading = await fixture.call('getApiProjectsByIdWork-items', {
        id: fixture.successor.projectId,
      });
      expect(reading.isError).not.toBe(true);
      const tree = JSON.parse(reading.text) as {
        workItems: { id: string; parentId: string | null }[];
      };
      const children = tree.workItems.filter(({ parentId }) => parentId === snapshot.staged?.id);
      expect(children).toHaveLength(2);
      for (const child of children)
        expect(child).toMatchObject({ schedule: { earliestStart: 2, earliestFinish: 3 } });
      const direct = await fixture.http(
        'GET',
        `/api/projects/${fixture.successor.projectId}/work-items`,
      );
      expect(direct.status).toBe(200);
      expect(direct.body).toEqual(tree);
    } finally {
      await fixture.close();
    }
  });

  for (const fault of [
    'wrong-project-step',
    'leaf-selector',
    'later-command',
    'dormant',
  ] as const) {
    test(`${transport} descendant-step ${fault} refuses with complete rollback`, async () => {
      const fixture = await openFixture(fault !== 'dormant');
      try {
        const { leaves, before } = await prepareDescendantPredecessor(fixture);
        const commands = descendantCommands(fixture);
        const dependency = commands.at(-1);
        if (dependency === undefined) throw new Error('descendant command missing');
        if (fault === 'wrong-project-step')
          dependency['predecessor'] = {
            ...wholeEndpoint(fixture.predecessor),
            scope: 'descendant-step',
            stepId: fixture.successor.steps.at(0),
          };
        if (fault === 'leaf-selector')
          dependency['predecessor'] = {
            projectId: fixture.predecessor.projectId,
            workItemId: leaves[0],
            scope: 'descendant-step',
            stepId: fixture.predecessor.steps.at(-1),
          };
        if (fault === 'later-command')
          commands.push({
            kind: 'patchWorkItem',
            workItemId: 'missing-row',
            patch: { name: 'Invalid' },
          });
        const reply = await submit(fixture, transport, commands);
        const status = fault === 'wrong-project-step' || fault === 'later-command' ? 404 : 409;
        if (transport === 'HTTP') expect(reply.status).toBe(status);
        else {
          // Proof: forcing submit's MCP error-status projection to success left its HTTP 404 text intact; this assertion failed (received 200).
          expect(reply.status).toBe(0);
          expect(reply.text).toContain(`HTTP ${String(status)}`);
        }
        expect(reply.text).toContain(`"at":${String(fault === 'later-command' ? 4 : 3)}`);
        expect(reply.text).toContain(
          fault === 'leaf-selector'
            ? 'not_a_parent'
            : fault === 'dormant'
              ? 'external_dependencies_inactive'
              : 'not_found',
        );
        const after = await fixture.inspect();
        expect(after.effects).toEqual(before.effects);
        expect(after.pushes).toEqual(before.pushes);
      } finally {
        await fixture.close();
      }
    });
  }
}

// Proof: dropping scheduleError in wbs-client's successful response forwarding
// failed both calendar parity cases against the unmodified mounted HTTP body.
for (const transport of ['HTTP', 'MCP'] as const) {
  test(`${transport} authored external edge propagates real calendar unavailability through generated MCP`, async () => {
    const fixture = await openFixture();
    try {
      const { predecessor, successor } = fixture;
      const committed = await submit(fixture, transport, [fixture.command]);
      expect(committed.status).toBe(200);
      const relationship = (await fixture.inspect()).relationship;
      if (relationship === null) throw new Error('outcome relationship missing');
      const path = `/api/projects/${successor.projectId}/work-items`;
      const scheduled = await fixture.http('GET', path);
      expect(scheduled.status).toBe(200);
      expect(scheduled.body).toMatchObject({
        scheduleError: null,
        workItems: [
          { id: successor.workItemId, schedule: { earliestStart: 2, earliestFinish: 4 } },
        ],
      });
      const patch = await fixture.http('PATCH', `/api/projects/${predecessor.projectId}`, {
        startDate: null,
      });
      expect(patch.status).toBe(200);
      const beforeRead = await fixture.inspect();
      for (const endpoint of [predecessor, successor]) {
        const direct = await fixture.http('GET', `/api/projects/${endpoint.projectId}/work-items`);
        expect(direct.status).toBe(200);
        const reading = await fixture.call('getApiProjectsByIdWork-items', {
          id: endpoint.projectId,
        });
        expect(reading.isError).not.toBe(true);
        const tree: unknown = JSON.parse(reading.text);
        expect(tree).toEqual(direct.body);
        expect(tree).toMatchObject({
          scheduleError: {
            kind: 'dependency_calendar_missing',
            projects: [{ projectId: predecessor.projectId, name: 'Predecessor' }],
          },
          slices: [],
          workItems: [{ id: endpoint.workItemId, schedule: null, dates: null }],
          connectedDependencies: [
            {
              id: relationship.id,
              predecessor: { endpoint: wholeEndpoint(predecessor) },
              successor: { endpoint: wholeEndpoint(successor) },
            },
          ],
        });
      }
      const afterRead = await fixture.inspect();
      expect(afterRead.effects).toEqual(beforeRead.effects);
      expect(afterRead.pushes).toEqual(beforeRead.pushes);
    } finally {
      await fixture.close();
    }
  });

  test(`${transport} authored external edge retains Fast placement when real optimizer admission refuses`, async () => {
    const fixture = await openFixture();
    try {
      const committed = await submit(fixture, transport, [fixture.command]);
      expect(committed.status).toBe(200);
      const before = await fixture.inspect();
      const patch = { optimizationEnabled: true, scheduleEngine: 'optimized' };
      const path = `/api/projects/${fixture.predecessor.projectId}`;
      const direct = await fixture.http('PATCH', path, patch);
      expect(direct).toEqual({ status: 409, body: { error: 'optimizer_unavailable' } });
      const refused = await fixture.call('patchApiProjectsById', {
        id: fixture.predecessor.projectId,
        ...patch,
      });
      expect(refused.isError).toBe(true);
      expect(refused.text).toContain('HTTP 409 optimizer_unavailable');
      const after = await fixture.inspect();
      expect(after.effects).toEqual(before.effects);
      expect(after.pushes).toEqual(before.pushes);
      const reading = await fixture.call('getApiProjectsByIdWork-items', {
        id: fixture.successor.projectId,
      });
      expect(reading.isError).not.toBe(true);
      expect(JSON.parse(reading.text)).toMatchObject({
        scheduleError: null,
        workItems: [
          { id: fixture.successor.workItemId, schedule: { earliestStart: 2, earliestFinish: 4 } },
        ],
      });
    } finally {
      await fixture.close();
    }
  });
}

// Proof: dropping optimization or changing failed→idle in production wbs-client forwarding
// each failed terminal HTTP/MCP equality; dropping scheduleError failed required-engine equality (2026-10-23).
for (const optimizer of ['installed', 'absent'] as const) {
  test(`generated MCP preserves real connected ${optimizer === 'installed' ? 'terminal optimization' : 'required-engine-unavailable'} tree`, async () => {
    const fixture = await openFixture(true, ['read', 'write'], { optimizer });
    try {
      const committed = await submit(fixture, 'MCP', [fixture.command]);
      expect(committed.status).toBe(200);
      await fixture.prepareOptimization();
      const before = await fixture.inspect();
      if (before.relationship === null) throw new Error('optimization relationship missing');
      const direct = await fixture.http(
        'GET',
        `/api/projects/${fixture.successor.projectId}/work-items`,
      );
      expect(direct.status).toBe(200);
      const reading = await fixture.call('getApiProjectsByIdWork-items', {
        id: fixture.successor.projectId,
      });
      expect(reading.isError).not.toBe(true);
      const tree: unknown = JSON.parse(reading.text);
      expect(tree).toEqual(direct.body);
      expect(tree).toMatchObject({
        connectedDependencies: [
          {
            id: before.relationship.id,
            predecessor: { endpoint: wholeEndpoint(fixture.predecessor) },
            successor: { endpoint: wholeEndpoint(fixture.successor) },
          },
        ],
      });
      if (optimizer === 'installed') {
        expect((tree as { optimization: { inputHash: string } }).optimization.inputHash).toMatch(
          /^[a-f0-9]{64}$/,
        );
        expect(tree).toMatchObject({
          scheduleError: null,
          optimization: {
            engine: 'optimized',
            enabled: true,
            displayed: 'fast',
            generation: 1,
            variants: {
              pri: { state: 'failed', reason: 'internal-error' },
              time: { state: 'failed', reason: 'internal-error' },
            },
            scope: {
              kind: 'connected-stage',
              projectId: fixture.successor.projectId,
              fixed: fixture.predecessor.steps.map((stepId, index) => ({
                projectId: fixture.predecessor.projectId,
                workItemId: fixture.predecessor.workItemId,
                stepId,
                start: index,
                finish: index + 1,
              })),
            },
          },
          workItems: [
            { id: fixture.successor.workItemId, schedule: { earliestStart: 2, earliestFinish: 4 } },
          ],
        });
      } else {
        expect(tree).toMatchObject({
          scheduleError: {
            kind: 'engine_unavailable',
            engine: 'optimized',
            projects: [fixture.successor.projectId],
            reason: 'adapter_missing',
          },
          slices: [],
          workItems: [{ id: fixture.successor.workItemId, schedule: null, dates: null }],
        });
        expect(tree).not.toHaveProperty('optimization');
      }
      const after = await fixture.inspect();
      expect(after.effects).toEqual(before.effects);
      expect(after.pushes).toEqual(before.pushes);
    } finally {
      await fixture.close();
    }
  });
}

// Proof: independently widening each production FS/SS/FF schema to string made its
// HTTP case return 422 and MCP report HTTP 422 unsupported_relationship_type instead of 400 (2026-10-23).
for (const kind of ['addTypedDependency', 'updateTypedDependency'] as const) {
  for (const transport of ['HTTP', 'MCP'] as const) {
    test(`${transport} rejects unsupported ${kind} at the shared shape boundary`, async () => {
      const fixture = await openFixture();
      try {
        const before = await fixture.inspect();
        const refused = await submit(fixture, transport, [
          {
            ...fixture.command,
            kind,
            type: 'SF',
            ...(kind === 'updateTypedDependency' ? { dependencyId: 'not-reached' } : {}),
          },
        ]);
        if (transport === 'HTTP') expect(refused.status).toBe(400);
        else {
          expect(refused.status).toBe(0);
          expect(refused.text).toContain('HTTP 400');
        }
        expect(refused.text).toContain('invalid_body');
        const after = await fixture.inspect();
        expect(after.effects).toEqual(before.effects);
        expect(after.pushes).toEqual(before.pushes);
      } finally {
        await fixture.close();
      }
    });
  }
}

// Proof: rejecting restricted remote evidence failed this accepted add (tool error instead of 200), watched 2026-10-23.
test('generated MCP authors and updates a restricted readable node predecessor without edit authority', async () => {
  const fixture = await openFixture();
  try {
    await fixture.authority('restricted-predecessor');
    const before = await fixture.inspect();
    const denied = await fixture.call('postApiProjectsByIdCommands', {
      id: fixture.predecessor.projectId,
      commands: [
        {
          kind: 'patchWorkItem',
          workItemId: fixture.predecessor.workItemId,
          patch: { name: 'Denied' },
        },
      ],
    });
    expect(denied.isError).toBe(true);
    expect(denied.text).toContain('HTTP 403 forbidden');
    expect((await fixture.inspect()).effects).toEqual(before.effects);
    expect((await fixture.inspect()).pushes).toEqual(before.pushes);
    const command = {
      ...fixture.command,
      predecessor: {
        ...wholeEndpoint(fixture.predecessor),
        scope: 'node',
        stepId: fixture.predecessor.steps[0],
      },
      successor: {
        ...wholeEndpoint(fixture.successor),
        scope: 'node',
        stepId: fixture.successor.steps[0],
      },
      type: 'SS',
    };
    const added = await submit(fixture, 'MCP', [command]);
    expect(added.status).toBe(200);
    const committed = await fixture.inspect();
    if (committed.relationship === null)
      throw new Error('restricted predecessor relationship missing');
    const dependencyId = committed.relationship.id;
    expect(JSON.parse(added.text)).toMatchObject({ results: [{ index: 0, id: dependencyId }] });
    expect(committed.relationship).toMatchObject({
      predecessor_project_id: fixture.predecessor.projectId,
      successor_project_id: fixture.successor.projectId,
      predecessor_scope: 'node',
      successor_scope: 'node',
      type: 'SS',
    });
    const updated = await submit(fixture, 'MCP', [
      { ...command, kind: 'updateTypedDependency', dependencyId, type: 'FF' },
    ]);
    expect(updated.status).toBe(200);
    const after = await fixture.inspect();
    expect(after.relationship).toEqual({ ...committed.relationship, type: 'FF' });
    expect(after.journalCount).toBe(before.journalCount + 2);
    expect(after.predecessorAuthored).toEqual(before.predecessorAuthored);
    if (after.journal === null) throw new Error('restricted predecessor update journal missing');
    expect(after.journal.payload).toContain(dependencyId);
    expect(after.journal.payload).toContain('"type":"FF"');
    expect(JSON.parse(after.journal.preconditions)).toMatchObject({
      externalRevisions: {
        from: [
          {
            projectId: fixture.predecessor.projectId,
            workItemId: fixture.predecessor.workItemId,
            revision: 1,
          },
        ],
        expected: [
          {
            projectId: fixture.predecessor.projectId,
            workItemId: fixture.predecessor.workItemId,
            revision: 2,
          },
        ],
      },
    });
    expect(after.revisions).toEqual([{ revision: 2 }, { revision: 2 }]);
    expect(after.pushes.length).toBeGreaterThan(before.pushes.length);
    const direct = await fixture.http(
      'GET',
      `/api/projects/${fixture.successor.projectId}/work-items`,
    );
    expect(direct.status).toBe(200);
    const reading = await fixture.call('getApiProjectsByIdWork-items', {
      id: fixture.successor.projectId,
    });
    expect(reading.isError).not.toBe(true);
    expect(JSON.parse(reading.text)).toEqual(direct.body);
    expect(JSON.parse(reading.text)).toMatchObject({
      connectedDependencies: [
        {
          id: dependencyId,
          type: 'FF',
          predecessor: { endpoint: command.predecessor },
          successor: { endpoint: command.successor },
        },
      ],
    });
  } finally {
    await fixture.close();
  }
});

// Proof: capturing request access admitted the revoked queued update; independently
// omitting AdmittedScope's forbidden branch admitted the restricted-successor update.
// Both answered MCP success instead of the required 409/403 (2026-10-23).
for (const fault of ['revoke-credential', 'restrict-successor'] as const) {
  test(`generated MCP queued external update revalidates ${fault} atomically`, async () => {
    const fixture = await openFixture();
    let held = false;
    try {
      await fixture.authority('restricted-predecessor');
      expect((await submit(fixture, 'MCP', [fixture.command])).status).toBe(200);
      const initial = await fixture.inspect();
      if (initial.relationship === null) throw new Error('queued update relationship missing');
      const lookup = await fixture.call('getApiProjectsByIdWork-items', {
        id: fixture.predecessor.projectId,
      });
      expect(lookup.isError).not.toBe(true);
      await fixture.authority('hold');
      held = true;
      const pending = fixture.call('postApiProjectsByIdCommands', {
        id: fixture.successor.projectId,
        commands: [
          {
            kind: 'patchWorkItem',
            workItemId: fixture.successor.workItemId,
            patch: { name: 'Must roll back' },
          },
          {
            ...fixture.command,
            kind: 'updateTypedDependency',
            dependencyId: initial.relationship.id,
            type: 'SS',
          },
        ],
      });
      await fixture.authority('queued');
      await fixture.authority(fault);
      const before = await fixture.inspect();
      await fixture.authority('release');
      held = false;
      const refused = await pending;
      expect(refused.isError).toBe(true);
      expect(refused.text).toContain(
        fault === 'revoke-credential'
          ? 'HTTP 409 organization_context_changed'
          : 'HTTP 403 forbidden',
      );
      const after = await fixture.inspect();
      expect(after.effects).toEqual(before.effects);
      expect(after.pushes).toEqual(before.pushes);
      expect(after.relationship).toEqual(initial.relationship);
      expect(after.journalCount).toBe(initial.journalCount);
      expect(after.revisions).toEqual(initial.revisions);
    } finally {
      if (held) await fixture.authority('release');
      await fixture.close();
    }
  });
}

// Proof: stripping startable prerequisites in production wbs-client forwarding failed
// all six generated MCP runtime permission cases (2026-10-23).
for (const locality of ['local', 'remote'] as const) {
  for (const type of ['FS', 'SS', 'FF'] as const) {
    test(`generated MCP ${locality} ${type} startable permission governs corrected claim identity`, async () => {
      const fixture = await openFixture();
      try {
        const { successor } = fixture;
        const stepId = successor.steps.at(0);
        const secondStepId = successor.steps.at(1);
        if (stepId === undefined || secondStepId === undefined)
          throw new Error('claim fixture steps missing');
        let predecessor = fixture.predecessor;
        if (locality === 'local') {
          const created = await submit(fixture, 'MCP', [
            { kind: 'createWorkItem', name: 'Local predecessor' },
          ]);
          expect(created.status).toBe(200);
          const identity = JSON.parse(created.text) as { results: { id: string }[] };
          const workItemId = identity.results.at(0)?.id;
          if (workItemId === undefined) throw new Error('local predecessor identity missing');
          predecessor = { ...successor, workItemId };
          expect(
            (await submit(fixture, 'MCP', [{ kind: 'setStatus', workItemId, status: 'ready' }]))
              .status,
          ).toBe(200);
        }
        const predecessorStepId = predecessor.steps.at(0);
        if (predecessorStepId === undefined) throw new Error('predecessor step missing');
        const added = await submit(fixture, 'MCP', [
          {
            kind: 'addTypedDependency',
            predecessor: {
              ...wholeEndpoint(predecessor),
              scope: 'node',
              stepId: predecessorStepId,
            },
            successor: { ...wholeEndpoint(successor), scope: 'node', stepId },
            type,
          },
        ]);
        expect(added.status).toBe(200);
        const addedIdentity = JSON.parse(added.text) as { results: { id: string }[] };
        const relationshipId = addedIdentity.results.at(0)?.id;
        if (relationshipId === undefined) throw new Error('claim prerequisite identity missing');
        const read = async () => {
          const direct = await fixture.http(
            'GET',
            `/api/projects/${successor.projectId}/startable`,
          );
          expect(direct.status).toBe(200);
          const reply = await fixture.call('getApiProjectsByIdStartable', {
            id: successor.projectId,
          });
          expect(reply.isError).not.toBe(true);
          const reading = JSON.parse(reply.text) as {
            leaves: { workItemId: string; stepIds: string[] }[];
            prerequisites: {
              workItemId: string;
              stepId: string;
              started: boolean;
              canStart: boolean;
              canFinish: boolean;
              startBlockers: unknown[];
              finishBlockers: unknown[];
            }[];
            claimed: { workItemId: string; stepId: string; claimId: string }[];
          };
          expect(reading as unknown).toEqual(direct.body);
          expect(fixture.forwarded.at(-1)?.url).toBe(
            `${fixture.apiUrl}/api/projects/${successor.projectId}/startable`,
          );
          return reading;
        };
        const reading = await read();
        const blocker = {
          workItemId: predecessor.workItemId,
          stepId: predecessorStepId,
          type,
          provenance: 'authored',
          relationshipId,
        };
        expect(
          reading.prerequisites.find(
            (step) => step.workItemId === successor.workItemId && step.stepId === stepId,
          ),
        ).toEqual({
          workItemId: successor.workItemId,
          stepId,
          started: false,
          canStart: type === 'FF',
          canFinish: type !== 'FF',
          startBlockers: type === 'FF' ? [] : [blocker],
          finishBlockers: type === 'FF' ? [blocker] : [],
        });
        const claim = {
          kind: 'claimWorkItem',
          workItemId: successor.workItemId,
          personId: 'parity-agent',
        };
        const refuse = async (steps: string[] | undefined) => {
          const before = await fixture.inspect();
          const refused = await submit(fixture, 'MCP', [
            {
              kind: 'patchWorkItem',
              workItemId: successor.workItemId,
              patch: { name: 'Must roll back' },
            },
            { ...claim, ...(steps === undefined ? {} : { steps }) },
          ]);
          expect(refused.status).toBe(0);
          expect(refused.text).toContain('HTTP 409 prerequisites_unmet');
          expect(refused.text).toContain('"at":1');
          expect(refused.text).toContain('"kind":"claimWorkItem"');
          const after = await fixture.inspect();
          expect(after.effects).toEqual(before.effects);
          expect(after.pushes).toEqual(before.pushes);
        };
        if (type !== 'FF') {
          expect(
            reading.leaves.find((leaf) => leaf.workItemId === successor.workItemId),
          ).toBeUndefined();
          await refuse([stepId]);
          // These remain observation commands: only the subsequent claim is governed.
          const milestone = await fixture.call('postApiProjectsByIdCommands', {
            id: predecessor.projectId,
            commands: [
              type === 'FS'
                ? {
                    kind: 'setProgress',
                    workItemId: predecessor.workItemId,
                    stepId: predecessorStepId,
                    state: 'done',
                  }
                : {
                    kind: 'startAttempt',
                    workItemId: predecessor.workItemId,
                    stepId: predecessorStepId,
                    at: 1,
                  },
            ],
          });
          expect(milestone.isError).not.toBe(true);
        }
        const ready = await read();
        const leaf = ready.leaves.find((leaf) => leaf.workItemId === successor.workItemId);
        expect(leaf).toMatchObject({ workItemId: successor.workItemId, stepIds: [stepId] });
        // The second step still requires completion of the first: both whole-leaf
        // omission and explicit mixed selection must roll back the preceding edit.
        await refuse(undefined);
        await refuse([stepId, secondStepId]);
        const accepted = await submit(fixture, 'MCP', [{ ...claim, steps: [stepId] }]);
        expect(accepted.status).toBe(200);
        const after = await read();
        expect(after.claimed).toMatchObject([
          { workItemId: successor.workItemId, stepId, holder: { personId: 'parity-agent' } },
        ]);
        expect(after.claimed).toHaveLength(1);
        expect(
          after.leaves.find((candidate) => candidate.workItemId === successor.workItemId),
        ).toBeUndefined();
        const durable = await fixture.inspect();
        const claims = durable.effects as { name: string; rows: unknown[] }[];
        expect(claims.find((table) => table.name === 'claim')?.rows).toMatchObject([
          {
            id: after.claimed[0].claimId,
            work_item_id: successor.workItemId,
            step_id: stepId,
            person_id: 'parity-agent',
          },
        ]);
        expect(
          fixture.forwarded.filter((request) => request.method === 'POST').at(-1),
        ).toMatchObject({
          url: `${fixture.apiUrl}/api/projects/${successor.projectId}/commands`,
          body: JSON.stringify({ commands: [{ ...claim, steps: [stepId] }] }),
        });
      } finally {
        await fixture.close();
      }
    });
  }
}
