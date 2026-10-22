import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect, setDefaultTimeout, test } from 'bun:test';

import { readDocument, toolsFromDocument } from './openapi-tools';
import { createServer } from './server';
import type { WbsRequest } from './wbs-client';

/** Real machine-key authentication; this packet does not exercise delegated OAuth authority. */
async function openFixture(active = true, scopes = ['read', 'write']) {
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
  const reader = backend.stdout.getReader();
  let printed = '';
  const readiness = setTimeout(() => {
    backend.kill('SIGTERM');
  }, 15_000);
  try {
    while (!printed.includes('\n')) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error(`parity backend exited before readiness: ${printed}`);
      printed += new TextDecoder().decode(chunk.value);
    }
  } catch (cause) {
    backend.kill('SIGTERM');
    await backend.exited;
    throw cause;
  } finally {
    clearTimeout(readiness);
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
    if (reply.status !== 200) throw new Error(`parity inspection failed: ${String(reply.status)}`);
    return (await reply.json()) as Snapshot;
  };
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const send = clientTransport.send.bind(clientTransport);
  clientTransport.send = (message, options) =>
    send(message, {
      ...options,
      authInfo: { token: ready.key, clientId: 'parity', scopes },
    });
  const forwarded: WbsRequest[] = [];
  const server = createServer({
    tools: toolsFromDocument(readDocument()),
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
  const client = new Client({ name: 'parity', version: '1' });
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
    close: async () => {
      await client.close();
      await server.close();
      backend.kill('SIGTERM');
      expect(await backend.exited).toBe(0);
    },
  };
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
