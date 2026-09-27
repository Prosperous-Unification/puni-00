import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { httpShapes } from '@wbs/contracts';
import { describe, expect, it } from 'bun:test';

import type { McpConfig } from './config';
import type { DerivedTool } from './openapi-tools';
import { readDocument, toolsFromDocument } from './openapi-tools';
import { createServer, describeTool, SERVER_VERSION } from './server';
import type {
  UnexpectedToolDisclosure,
  UnexpectedToolFailureReporter,
} from './unexpected-tool-failure';
import { type FetchLike, SessionRefreshRefused } from './wbs-client';

const CONFIG: McpConfig = {
  MCP_AUTH_MODE: 'standalone',
  WBS_API_URL: 'https://dev.wbs.bulletpoints.club',
  MCP_PUBLIC_URL: 'https://dev.wbs.bulletpoints.club/mcp',
  WBS_BASIC_AUTH: undefined,
};

const READ: DerivedTool = {
  name: 'getApiProjectsByIdWorkItems',
  description: 'Read a project’s work items',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
    additionalProperties: false,
  },
  method: 'get',
  path: '/api/projects/{id}/work-items',
  locations: { id: 'path' },
};

const WRITE: DerivedTool = {
  name: 'patchApiWorkItemsById',
  description: 'Change a work item’s own fields',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' }, name: { type: 'string' } },
    required: ['id'],
    additionalProperties: false,
  },
  method: 'patch',
  path: '/api/work-items/{id}',
  locations: { id: 'path', name: 'body' },
};

/** The batch route as the committed document derives it, cut to what this test reads. */
const COMMANDS: DerivedTool = {
  name: 'postApiProjectsByIdCommands',
  description: 'Apply a batch of commands to a project, all or none',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' }, commands: { type: 'array' } },
    required: ['id', 'commands'],
    additionalProperties: false,
  },
  method: 'post',
  path: '/api/projects/{id}/commands',
  locations: { id: 'path', commands: 'body' },
};

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/** An in-process stand-in for be-01: records the request, answers with `payload`. */
const stub =
  (seen: Seen[], payload: string, status = 200): FetchLike =>
  (url, init) => {
    seen.push({
      url,
      method: init.method,
      headers: init.headers,
      ...(init.body === undefined ? {} : { body: init.body }),
    });
    return Promise.resolve(
      new Response(payload, { status, headers: { 'content-type': 'application/json' } }),
    );
  };

/** A client and a server on a linked in-memory transport pair, already connected. */
async function connected(
  tools: readonly DerivedTool[],
  fetchImpl: FetchLike,
  options: {
    /** Defaults to a read/write caller; `null` sends no authentication at all. */
    readonly authInfo?: AuthInfo | null;
    readonly reportUnexpectedToolFailure?: UnexpectedToolFailureReporter;
    readonly endSession?: (mcpSessionId: string) => void | Promise<void>;
    readonly refreshSession?: (mcpSessionId: string) => Promise<string>;
  } = {},
): Promise<{ client: Client }> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const authInfo =
    options.authInfo === undefined
      ? { token: 'token-abc', clientId: 'test-client', scopes: ['read', 'write'] }
      : options.authInfo;
  if (authInfo !== null) {
    const send = clientTransport.send.bind(clientTransport);
    clientTransport.send = (message, sendOptions) => send(message, { ...sendOptions, authInfo });
  }
  const server = createServer({
    tools,
    config: CONFIG,
    fetchImpl,
    callerTokenOf: (authInfo) => authInfo?.token ?? 'token-abc',
    reportUnexpectedToolFailure:
      options.reportUnexpectedToolFailure ??
      (() => ({ sentence: 'unused test disclosure', occurrenceId: 'UNUSED_TEST' })),
    endSession: options.endSession,
    refreshSession: options.refreshSession,
  });
  const client = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: {} });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client };
}

const failingFetch: FetchLike = () => {
  throw new Error('be-01 must not be called in this test');
};

describe('the round trip over MCP', () => {
  it('lists the derived tools, with their schemas, over the protocol', async () => {
    const { client } = await connected([READ, WRITE], failingFetch);

    const listed = await client.listTools();

    expect(listed.tools.map((tool) => tool.name)).toEqual([
      'getApiProjectsByIdWorkItems',
      'patchApiWorkItemsById',
    ]);
    // The schema the document produced, not a re-description of it.
    expect(listed.tools[0]?.inputSchema).toEqual({
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    });
  });

  it('calls a read tool: the stub sees GET, the substituted path and the token', async () => {
    const seen: Seen[] = [];
    const { client } = await connected([READ, WRITE], stub(seen, '{"workItems":[]}'));

    const result = await client.callTool({
      name: 'getApiProjectsByIdWorkItems',
      arguments: { id: 'p-1' },
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe('GET');
    expect(seen[0]?.url).toBe('https://dev.wbs.bulletpoints.club/api/projects/p-1/work-items');
    expect(seen[0]?.headers['authorization']).toBe('Bearer token-abc');
    expect(seen[0]?.body).toBeUndefined();
    // be-01's body, passed through rather than re-serialised.
    expect(result.content).toEqual([{ type: 'text', text: '{"workItems":[]}' }]);
    expect(result.isError).toBeUndefined();
  });

  // Proof: removing the single retry leaves the first 401 as tool-error content;
  // retrying without the refreshed token records the stale header twice.
  it('refreshes once and retries one be-01 401 before ending the session', async () => {
    const seen: Seen[] = [];
    let calls = 0;
    let refreshes = 0;
    let ended = false;
    const fetchImpl: FetchLike = (url, init) => {
      calls += 1;
      seen.push({ url, method: init.method, headers: init.headers });
      return Promise.resolve(
        calls === 1
          ? new Response('{"error":"unauthorized"}', { status: 401 })
          : Response.json({ workItems: [] }),
      );
    };
    const authInfo: AuthInfo = {
      token: 'stale-token',
      clientId: 'person-1',
      scopes: ['read'],
      extra: { mcpSessionId: 'session-1' },
    };
    const { client } = await connected([READ], fetchImpl, {
      authInfo,
      endSession: () => {
        ended = true;
      },
      refreshSession: (sessionId) => {
        expect(sessionId).toBe('session-1');
        refreshes += 1;
        return Promise.resolve('fresh-token');
      },
    });

    const result = await client.callTool({
      name: READ.name,
      arguments: { id: 'p-1' },
    });
    expect(result.isError).toBeUndefined();
    expect(refreshes).toBe(1);
    expect(seen.map((request) => request.headers['authorization'])).toEqual([
      'Bearer stale-token',
      'Bearer fresh-token',
    ]);
    expect(ended).toBeFalse();
  });

  it('forwards a refused batch whole: the code, and the index and kind beside it (D7)', async () => {
    // A batch refusal is `{ error, at, kind }`, and a model correcting its batch
    // needs all three. The body follows the head whole, as it does for the
    // directory's 409s. Proof: `trimmed` dropped from the refusal text in
    // `wbs-client.ts`, this failed on `expected '…from POST …' to contain
    // '"at":1'`. Watched, 2026-08-29.
    const seen: Seen[] = [];
    const { client } = await connected(
      [COMMANDS],
      stub(seen, '{"error":"unknown_step","at":1,"kind":"setEstimate"}', 404),
    );
    const batch = [
      { kind: 'createWorkItem', ref: 'a', name: 'A' },
      {
        kind: 'setEstimate',
        workItemRef: 'a',
        stepId: 'nope',
        days: { optimistic: 1, realistic: 2, pessimistic: 3 },
      },
    ];

    const result = await client.callTool({
      name: 'postApiProjectsByIdCommands',
      arguments: { id: 'p-1', commands: batch },
    });

    expect(seen[0]?.method).toBe('POST');
    expect(seen[0]?.url).toBe('https://dev.wbs.bulletpoints.club/api/projects/p-1/commands');
    expect(JSON.parse(seen[0]?.body ?? 'null')).toEqual({ commands: batch });
    expect(result.isError).toBe(true);
    const [content] = result.content as [{ type: string; text: string }];
    expect(content.text).toContain('HTTP 404 unknown_step from POST /api/projects/{id}/commands');
    expect(content.text).toContain('"at":1');
    expect(content.text).toContain('"kind":"setEstimate"');
  });

  it('calls a write tool: the stub sees PATCH and the body properties, and not the path one', async () => {
    const seen: Seen[] = [];
    const { client } = await connected([READ, WRITE], stub(seen, '{"id":"w-1"}'));

    await client.callTool({
      name: 'patchApiWorkItemsById',
      arguments: { id: 'w-1', name: 'Renamed' },
    });

    expect(seen[0]?.method).toBe('PATCH');
    expect(seen[0]?.url).toBe('https://dev.wbs.bulletpoints.club/api/work-items/w-1');
    expect(seen[0]?.headers['authorization']).toBe('Bearer token-abc');
    expect(seen[0]?.headers['content-type']).toBe('application/json');
    expect(JSON.parse(seen[0]?.body ?? 'null')).toEqual({ name: 'Renamed' });
  });

  it('reports the server name and version it was built with', async () => {
    const { client } = await connected([READ], failingFetch);

    expect(client.getServerVersion()).toEqual({ name: 'mcp-01', version: SERVER_VERSION });
  });
});

describe('the MCP grant scope', () => {
  const readOnly: AuthInfo = { token: 'upstream-with-write', clientId: 'c', scopes: ['read'] };

  // Proof: on 2026-09-27, disabling the write-scope guard in createServer failed this test and the
  // unauthenticated one below on `toContain('insufficient_scope')`.
  it('refuses a write tool to a grant without wbs:write before be-01 is called', async () => {
    const { client } = await connected([READ, WRITE], failingFetch, { authInfo: readOnly });

    const toolResponse = await client.callTool({
      name: 'patchApiWorkItemsById',
      arguments: { id: 'w-1', name: 'Renamed' },
    });

    expect(toolResponse.isError).toBe(true);
    const [content] = toolResponse.content as [{ type: string; text: string }];
    expect(content.text).toContain('insufficient_scope');
    expect(content.text).toContain('wbs:read wbs:write');
  });

  it('refuses a write tool when no authenticated caller reached the server', async () => {
    const { client } = await connected([WRITE], failingFetch, { authInfo: null });

    const toolResponse = await client.callTool({
      name: 'patchApiWorkItemsById',
      arguments: { id: 'w-1', name: 'Renamed' },
    });

    expect(toolResponse.isError).toBe(true);
    expect(JSON.stringify(toolResponse.content)).toContain('insufficient_scope');
  });

  it('still reads with a read-only grant', async () => {
    const seen: Seen[] = [];
    const { client } = await connected([READ, WRITE], stub(seen, '[]'), { authInfo: readOnly });

    const toolResponse = await client.callTool({
      name: 'getApiProjectsByIdWorkItems',
      arguments: { id: 'p-1' },
    });

    expect(toolResponse.isError).toBeUndefined();
    expect(seen).toHaveLength(1);
  });

  it('refuses a read tool to a caller without wbs:read', async () => {
    const { client } = await connected([READ], failingFetch, {
      authInfo: { token: 'upstream-with-read', clientId: 'c', scopes: ['write'] },
    });

    const toolResponse = await client.callTool({
      name: 'getApiProjectsByIdWorkItems',
      arguments: { id: 'p-1' },
    });

    expect(toolResponse.isError).toBe(true);
    expect(JSON.stringify(toolResponse.content)).toContain('does not include wbs:read');
  });

  it('marks every non-GET tool of the real document as needing be-01 write scope', () => {
    const writes = toolsFromDocument(readDocument()).filter((tool) => tool.method !== 'get');
    const writeScoped = new Set(
      httpShapes
        .filter((shape) =>
          shape.policies.some(
            (policy) => policy.kind === 'identity' && policy.require === 'write-scope',
          ),
        )
        .map((shape) => `${shape.method.toLowerCase()} ${shape.path.replace(/:(\w+)/g, '{$1}')}`),
    );

    expect(writes.length).toBeGreaterThan(0);
    for (const tool of writes) expect(writeScoped).toContain(`${tool.method} ${tool.path}`);
  });
});

describe('a name that is not a tool', () => {
  it('is a protocol error naming what to call instead, not an empty result', async () => {
    const reported: unknown[] = [];
    const { client } = await connected([READ, WRITE], failingFetch, {
      reportUnexpectedToolFailure: (caught) => {
        reported.push(caught);
        return { sentence: 'must not report', occurrenceId: 'must-not-report' };
      },
    });

    // Rejects: a client cannot mistake this for a call that ran and returned
    // nothing. Caught rather than `rejects.toThrow`, whose bun typing is `void`
    // and which `await-thenable` therefore reads as an await of nothing.
    const cause: unknown = await client
      .callTool({ name: 'deleteEverything', arguments: {} })
      .then(() => undefined)
      .catch((error: unknown) => error);

    expect(cause).toBeInstanceOf(McpError);
    if (!(cause instanceof McpError)) return;
    expect(cause.code).toBe(ErrorCode.InvalidParams);
    expect(String(cause)).toContain('no tool named "deleteEverything"');
    expect(String(cause)).toContain('tools/list');
    expect(reported).toHaveLength(0);
  });

  it('does not call be-01 at all', async () => {
    const seen: Seen[] = [];
    const { client } = await connected([READ], stub(seen, '{}'));

    const cause: unknown = await client
      .callTool({ name: 'nope', arguments: {} })
      .then(() => undefined)
      .catch((error: unknown) => error);

    expect(cause).toBeInstanceOf(Error);
    expect(seen).toHaveLength(0);
  });
});

describe('a call that cannot be built', () => {
  it('comes back as tool content the caller can correct, not a dropped connection', async () => {
    const seen: Seen[] = [];
    const reported: unknown[] = [];
    const { client } = await connected([READ], stub(seen, '{}'), {
      reportUnexpectedToolFailure: (caught) => {
        reported.push(caught);
        return { sentence: 'must not report', occurrenceId: 'must-not-report' };
      },
    });

    const toolResponse = await client.callTool({
      name: 'getApiProjectsByIdWorkItems',
      arguments: { id: 'p-1', parentID: 'typo' },
    });

    expect(toolResponse.isError).toBe(true);
    // The message names the input and what the tool does declare, because that
    // is what the caller has to fix.
    expect(JSON.stringify(toolResponse.content)).toContain('parentID');
    expect(JSON.stringify(toolResponse.content)).toContain('getApiProjectsByIdWorkItems');
    // And the request was never made: an undeclared input is refused here, not
    // stripped by be-01 into a write that did something else.
    expect(seen).toHaveLength(0);
    expect(reported).toHaveLength(0);
  });

  it('passes be-01’s own refusal code through as tool content', async () => {
    const seen: Seen[] = [];
    const reported: unknown[] = [];
    const { client } = await connected(
      [WRITE],
      stub(seen, '{"error":"number_is_derived","at":1,"kind":"setEstimate"}', 409),
      {
        reportUnexpectedToolFailure: (caught) => {
          reported.push(caught);
          return { sentence: 'must not report', occurrenceId: 'must-not-report' };
        },
      },
    );

    const toolResponse = await client.callTool({
      name: 'patchApiWorkItemsById',
      arguments: { id: 'w-1', name: 'x' },
    });

    expect(toolResponse.isError).toBe(true);
    const [content] = toolResponse.content as [{ type: string; text: string }];
    expect(content.text).toContain('number_is_derived');
    expect(content.text).toContain('"at":1');
    expect(content.text).toContain('"kind":"setEstimate"');
    expect(reported).toHaveLength(0);
  });

  it('keeps an upstream credential refusal modeled and does not report it', async () => {
    const reported: unknown[] = [];
    const ended: string[] = [];
    const { client } = await connected([READ], stub([], '{"error":"unauthorized"}', 401), {
      authInfo: {
        token: 'caller-token',
        clientId: 'modeled-upstream-test',
        scopes: ['read'],
        extra: { mcpSessionId: 'session-1' },
      },
      reportUnexpectedToolFailure: (caught) => {
        reported.push(caught);
        return { sentence: 'must not report', occurrenceId: 'must-not-report' };
      },
      endSession: (sessionId) => void ended.push(sessionId),
    });

    const toolResponse = await client.callTool({
      name: 'getApiProjectsByIdWorkItems',
      arguments: { id: 'p-1' },
    });

    expect(toolResponse.isError).toBe(true);
    expect(JSON.stringify(toolResponse.content)).toContain('session ended. Reauthorize and retry');
    expect(ended).toEqual(['session-1']);
    expect(reported).toHaveLength(0);
  });

  it('keeps a deployment edge-gate refusal modeled and does not report it', async () => {
    const reported: unknown[] = [];
    const { client } = await connected(
      [READ],
      () =>
        Promise.resolve(
          new Response('<html>401</html>', {
            status: 401,
            headers: { 'www-authenticate': 'Basic realm="wbs-dev"' },
          }),
        ),
      {
        reportUnexpectedToolFailure: (caught) => {
          reported.push(caught);
          return { sentence: 'must not report', occurrenceId: 'must-not-report' };
        },
      },
    );

    const toolResponse = await client.callTool({
      name: 'getApiProjectsByIdWorkItems',
      arguments: { id: 'p-1' },
    });

    expect(toolResponse.isError).toBe(true);
    expect(JSON.stringify(toolResponse.content)).toContain('WBS_BASIC_AUTH');
    expect(reported).toHaveLength(0);
  });
});

describe('an unexpected tool failure', () => {
  const disclosure: UnexpectedToolDisclosure = {
    sentence: 'Something went wrong',
    occurrenceId: 'AE_test_reference',
  };
  const expected = (toolName: string, selected = disclosure) => ({
    content: [
      {
        type: 'text' as const,
        text: `${toolName} could not be called: ${selected.sentence}. Reference ${selected.occurrenceId}.`,
      },
    ],
    isError: true as const,
  });
  const recordingReporter =
    (caught: unknown[]): UnexpectedToolFailureReporter =>
    (failure) => {
      caught.push(failure);
      return disclosure;
    };

  it('reports one fetch rejection and returns only the correlated generic envelope', async () => {
    const secret = 'alice@example.com boundary-secret';
    const failure = new Error(`connect ${secret}`);
    const reported: unknown[] = [];
    const { client } = await connected([READ], () => Promise.reject(failure), {
      reportUnexpectedToolFailure: recordingReporter(reported),
    });

    const toolResponse = await client.callTool({
      name: 'getApiProjectsByIdWorkItems',
      arguments: { id: 'p-1' },
    });

    expect(reported).toHaveLength(1);
    // Proof: on 2026-09-21, reporting a new Error with the same fetch message passed structural
    // equality but failed this original-object identity assertion.
    expect(reported[0]).toBe(failure);
    expect(toolResponse).toEqual(expected(READ.name));
    expect(JSON.stringify(toolResponse)).not.toContain(secret);
  });

  it('reports a transport failure on the retry after a refresh, and keeps the session', async () => {
    const failure = new Error('connect ECONNRESET alice@example.com retry-secret');
    const reported: unknown[] = [];
    let calls = 0;
    let ended = false;
    const fetchImpl: FetchLike = () => {
      calls += 1;
      return calls === 1
        ? Promise.resolve(new Response('{"error":"unauthorized"}', { status: 401 }))
        : Promise.reject(failure);
    };
    const { client } = await connected([READ], fetchImpl, {
      authInfo: {
        token: 'stale-token',
        clientId: 'person-1',
        scopes: ['read'],
        extra: { mcpSessionId: 'session-1' },
      },
      reportUnexpectedToolFailure: recordingReporter(reported),
      endSession: () => {
        ended = true;
      },
      refreshSession: () => Promise.resolve('fresh-token'),
    });

    const toolResponse = await client.callTool({ name: READ.name, arguments: { id: 'p-1' } });

    expect(calls).toBe(2);
    expect(reported).toHaveLength(1);
    expect(reported[0]).toBe(failure);
    expect(toolResponse).toEqual(expected(READ.name));
    expect(ended).toBeFalse();
  });

  const rejectedSession: AuthInfo = {
    token: 'stale-token',
    clientId: 'person-1',
    scopes: ['read'],
    extra: { mcpSessionId: 'session-1' },
  };
  const upstreamRejects: FetchLike = () =>
    Promise.resolve(new Response('{"error":"unauthorized"}', { status: 401 }));

  it('reports a refresh whose session lookup throws, and keeps the session', async () => {
    const failure = new Error('SQLITE_IOERR alice@example.com store-secret');
    const reported: unknown[] = [];
    const ended: string[] = [];
    const { client } = await connected([READ], upstreamRejects, {
      authInfo: rejectedSession,
      reportUnexpectedToolFailure: recordingReporter(reported),
      endSession: (sessionId) => void ended.push(sessionId),
      refreshSession: () => Promise.reject(failure),
    });

    const toolResponse = await client.callTool({ name: READ.name, arguments: { id: 'p-1' } });

    expect(reported).toHaveLength(1);
    expect(reported[0]).toBe(failure);
    expect(toolResponse).toEqual(expected(READ.name));
    expect(JSON.stringify(toolResponse)).not.toContain('store-secret');
    expect(ended).toEqual([]);
  });

  it('keeps a refused refresh modeled: the session ends and nothing is reported', async () => {
    const reported: unknown[] = [];
    const ended: string[] = [];
    const { client } = await connected([READ], upstreamRejects, {
      authInfo: rejectedSession,
      reportUnexpectedToolFailure: recordingReporter(reported),
      endSession: (sessionId) => void ended.push(sessionId),
      refreshSession: () =>
        Promise.reject(
          new SessionRefreshRefused('MCP OAuth session is missing, expired, or revoked'),
        ),
    });

    const toolResponse = await client.callTool({ name: READ.name, arguments: { id: 'p-1' } });

    expect(toolResponse.isError).toBe(true);
    expect(JSON.stringify(toolResponse.content)).toContain('session ended. Reauthorize and retry');
    expect(ended).toEqual(['session-1']);
    expect(reported).toHaveLength(0);
  });

  it('reports a session end that rejects instead of failing the protocol call', async () => {
    const failure = new Error('SQLITE_BUSY alice@example.com end-secret');
    const reported: unknown[] = [];
    const { client } = await connected([READ], upstreamRejects, {
      authInfo: rejectedSession,
      reportUnexpectedToolFailure: recordingReporter(reported),
      endSession: () => Promise.reject(failure),
      refreshSession: () =>
        Promise.reject(new SessionRefreshRefused('upstream refresh was refused')),
    });

    const toolResponse = await client.callTool({ name: READ.name, arguments: { id: 'p-1' } });

    expect(reported).toHaveLength(1);
    expect(reported[0]).toBe(failure);
    expect(toolResponse).toEqual(expected(READ.name));
    expect(JSON.stringify(toolResponse)).not.toContain('session ended');
  });

  it('reports a secret-bearing 500 instead of returning its body', async () => {
    const marker = '500 alice@example.com boundary-secret';
    const reported: unknown[] = [];
    const { client } = await connected([READ], stub([], marker, 500), {
      reportUnexpectedToolFailure: recordingReporter(reported),
    });

    const toolResponse = await client.callTool({
      name: READ.name,
      arguments: { id: 'p-1' },
    });

    // Proof: on 2026-09-21, widening declared refusals through HTTP 599 exposed this marker as
    // tool content while leaving the reporter count at zero; this compound diff observed both.
    expect({
      reportCount: reported.length,
      toolResponse,
      markerPresent: JSON.stringify(toolResponse).includes(marker),
    }).toEqual({
      reportCount: 1,
      toolResponse: expected(READ.name),
      markerPresent: false,
    });
  });

  it('reports a malformed successful body instead of returning its text', async () => {
    const marker = '<html>alice@example.com boundary-secret</html>';
    const reported: unknown[] = [];
    const { client } = await connected([READ], stub([], marker), {
      reportUnexpectedToolFailure: recordingReporter(reported),
    });

    const toolResponse = await client.callTool({
      name: READ.name,
      arguments: { id: 'p-1' },
    });

    expect(reported).toHaveLength(1);
    expect(toolResponse).toEqual(expected(READ.name));
    expect(JSON.stringify(toolResponse)).not.toContain(marker);
  });

  it('reports a redirect instead of returning its body as a declared refusal', async () => {
    const marker = 'redirect alice@example.com boundary-secret';
    const reported: unknown[] = [];
    const { client } = await connected([READ], stub([], marker, 302), {
      reportUnexpectedToolFailure: recordingReporter(reported),
    });

    const toolResponse = await client.callTool({
      name: READ.name,
      arguments: { id: 'p-1' },
    });

    // Proof: on 2026-09-21, sending 3xx through the old refusal path exposed the marker as tool
    // content while leaving the reporter count at zero; this compound diff observed both.
    expect({
      reportCount: reported.length,
      toolResponse,
      markerPresent: JSON.stringify(toolResponse).includes(marker),
    }).toEqual({
      reportCount: 1,
      toolResponse: expected(READ.name),
      markerPresent: false,
    });
  });

  it('reports the exact body-read rejection and returns none of its text', async () => {
    const failure = new Error('body read alice@example.com boundary-secret');
    const reported: unknown[] = [];
    class UnreadableResponse extends Response {
      override text(): Promise<string> {
        return Promise.reject(failure);
      }
    }
    const { client } = await connected(
      [READ],
      () => Promise.resolve(new UnreadableResponse('{}', { status: 200 })),
      { reportUnexpectedToolFailure: recordingReporter(reported) },
    );

    const toolResponse = await client.callTool({
      name: READ.name,
      arguments: { id: 'p-1' },
    });

    // Proof: on 2026-09-21, catching the body-read rejection in `callTool` and returning a fixed
    // synthetic refusal skipped the boundary reporter and left this array empty.
    expect(reported).toHaveLength(1);
    // Proof: on 2026-09-21, reporting a new Error with the same body-read message failed this
    // original-object identity assertion.
    expect(reported[0]).toBe(failure);
    expect(toolResponse).toEqual(expected(READ.name));
    expect(JSON.stringify(toolResponse)).not.toContain(failure.message);
  });

  it('returns one correlated tool result when reporting itself is lost', async () => {
    const lost: UnexpectedToolDisclosure = {
      sentence: 'the failure could not be described',
      occurrenceId: 'UNREPORTED_test',
    };
    let reports = 0;
    const { client } = await connected([READ], () => Promise.reject(new Error('fetch failed')), {
      reportUnexpectedToolFailure: () => {
        reports += 1;
        return lost;
      },
    });

    const toolResponse = await client.callTool({
      name: READ.name,
      arguments: { id: 'p-1' },
    });

    expect(reports).toBe(1);
    expect(toolResponse).toEqual(expected(READ.name, lost));
  });
});

describe('describeTool', () => {
  it('leaves a read tool’s description exactly as the document wrote it', () => {
    expect(describeTool(READ)).toBe(READ.description);
  });

  it('adds D9’s re-read warning to a write the document says nothing about', () => {
    const described = describeTool(WRITE);

    expect(described.startsWith(WRITE.description)).toBe(true);
    expect(described).toContain('re-derived on every read');
  });

  it('does not add it twice where be-01 already says it', () => {
    const already: DerivedTool = {
      ...WRITE,
      description:
        'Add a work item to a project. Numbers are derived from the tree and re-derived on every read.',
    };

    expect(describeTool(already)).toBe(already.description);
  });
});

describe('the tools derived from the real document', () => {
  const tools = toolsFromDocument(readDocument());

  it('every write tool tells the caller the result is not the new state', () => {
    const writes = tools.filter((tool) => tool.method !== 'get');
    const silent = writes.filter(
      (tool) => !/re-?read|re-?derive|derived from the tree|recomput/i.test(describeTool(tool)),
    );

    expect(writes.length).toBeGreaterThan(0);
    expect(silent.map((tool) => tool.name)).toEqual([]);
  });

  it('serves every one of them, and answers tools/list with the whole set', async () => {
    const { client } = await connected(tools, failingFetch);

    const listed = await client.listTools();

    expect(listed.tools).toHaveLength(tools.length);
    expect(listed.tools.every((tool) => (tool.description ?? '') !== '')).toBe(true);
  });
});
