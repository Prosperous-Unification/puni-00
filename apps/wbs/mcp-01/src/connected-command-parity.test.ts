import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect, setDefaultTimeout, test } from 'bun:test';

import { readDocument, toolsFromDocument } from './openapi-tools';
import { createServer } from './server';
import type { WbsRequest } from './wbs-client';

interface FixtureFaults {
  onSpawn?: (backend: ParityBackend) => void;
  readDocument?: typeof readDocument;
  closeClient?: (client: Client) => Promise<void>;
  closeServer?: () => Promise<void>;
  onTransports?: (transports: readonly InMemoryTransport[]) => void;
  stopGracefully?: (backend: ParityBackend) => void;
}
type ParityBackend = Bun.Subprocess<'ignore', 'pipe', 'inherit'>;

/** Real machine-key authentication; this packet does not exercise delegated OAuth authority. */
async function openFixture(active = true, scopes = ['read', 'write'], faults: FixtureFaults = {}) {
  const backend = Bun.spawn(
    [process.execPath, 'apps/wbs/be-01/src/testing/mcp-command-parity-backend.ts'],
    {
      cwd: new URL('../../../../', import.meta.url).pathname,
      env: { ...process.env, MCP_PARITY_ACTIVE: String(active) },
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
        15_000,
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
    const forwarded: WbsRequest[] = [];
    const server = createServer({
      tools: toolsFromDocument((faults.readDocument ?? readDocument)()),
      config: {
        MCP_AUTH_MODE: 'standalone',
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
    const command = { kind: 'addTypedDependency', predecessor, successor, type: 'FS' };
    return {
      predecessor,
      successor,
      call,
      command,
      inspect,
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
}
interface Snapshot {
  pushes: string[];
  relationship: ({ id: string } & Record<string, unknown>) | null;
  journal: { preconditions: string } | null;
  journalCount: number;
  revisions: unknown;
  effects: unknown;
}
setDefaultTimeout(30_000);

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
        expect(write).toEqual({
          url: `${fixture.apiUrl}/api/projects/${successor.projectId}/commands`,
          method: 'POST',
          headers: { authorization: `Bearer ${fixture.key}`, 'content-type': 'application/json' },
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
            predecessor: { endpoint: predecessor, revision: 1 },
            successor: { endpoint: successor, revision: 1 },
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
// (isError undefined instead of true), watched 2026-10-22.
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
