import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ClientCredentialsProvider } from '@modelcontextprotocol/sdk/client/auth-extensions.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { decodeJwt } from 'jose';

import type { McpConfig } from './config';
import type { McpDeploymentFault } from './deployment-fault';
import { mcpFetchHandler } from './http';
import { machineGrantClient } from './machine-grant-client';
import { NO_MACHINE_LIMITS } from './machine-limits';
import { McpOAuthServer } from './oauth';
import { readDocument, toolsFromDocument } from './openapi-tools';
import { organizationAuthority } from './organization-authority';
import { createServer } from './server';
import { McpSessionStore } from './session-store';

/**
 * Section 3 of `wbs-mcp-agent-surface` end to end: a headless agent holding only a `wbs_mk_`
 * key gets a token at `/mcp/oauth/token` with the MCP SDK's `ClientCredentialsProvider`, and
 * calls tools at `/mcp` in standalone mode as its machine person, against be-01's composed
 * routes in their own process (`apps/wbs/be-01/src/testing/mcp-machine-grant-backend.ts`)
 * over real HTTP. mcp-01's store is at the activated epoch and be-01's marker is set, so both
 * markers agree (M13), and mcp-01 reaches `/internal/mcp/*` with the dedicated secret alone
 * (task 3.7).
 *
 * The tests share one backend and run in order. Both person assertions select the same
 * initial workflow step; later steps retain their normal readiness prerequisites.
 */
setDefaultTimeout(60_000);

const REPO_ROOT = join(import.meta.dir, '../../../..');
const MCP_URL = 'https://wbs.example/mcp';
const OAUTH = 'https://wbs.example/mcp/oauth';
const TOKEN = `${OAUTH}/token`;
/** Generated per run, never a deployment's: be-01 and mcp-01 share it. */
const BE_SECRET = randomBytes(32).toString('base64url');
const TOOLS = toolsFromDocument(readDocument());
/** Every replica's access-token keys: replicas share these and the secret only (M5). */
const SIGNING = generateKeyPairSync('rsa', { modulusLength: 2048 });

let backend: Bun.Subprocess<'ignore', 'pipe', 'inherit'> | undefined;
let beUrl = '';
let storeDir = '';
/** Added to mcp-01's clock, to let a token expire without waiting twelve hours. */
let clockOffsetMs = 0;
/** Token requests the agent's SDK client sent. */
let tokenRequests = 0;
const faults: McpDeploymentFault[] = [];

interface Replica {
  readonly oauth: McpOAuthServer;
  readonly handle: (request: Request) => Promise<Response>;
  readonly store: McpSessionStore;
}
let replicaA: Replica;
/** The agent: its key, the SDK provider holding its token, and its MCP client. */
const agent = { id: '', key: '' };
let provider: ClientCredentialsProvider;
let client: Client;

async function readPort(stream: ReadableStream<Uint8Array>): Promise<number> {
  const reader = stream.getReader();
  let printed = '';
  while (!printed.includes('\n')) {
    const chunk = await reader.read();
    if (chunk.done) throw new Error(`be-01 exited before serving: ${printed}`);
    printed += new TextDecoder().decode(chunk.value);
  }
  // be-01's later log lines are drained so its pipe never fills.
  void (async () => {
    for (;;) if ((await reader.read()).done) return;
  })();
  return (JSON.parse(printed.split('\n')[0] ?? '') as { port: number }).port;
}

/** An mcp-01 store at the activated epoch, as the activation runbook's epoch step leaves it. */
function activatedStore(name: string): McpSessionStore {
  const path = join(storeDir, `${name}.sqlite`);
  const key = randomBytes(32);
  new McpSessionStore(path, [key]).close();
  const db = new Database(path);
  db.run('UPDATE mcp_credential_epoch SET epoch = 1');
  db.close();
  return new McpSessionStore(path, [key]);
}

function replica(name: string, secret: string): Replica {
  const config = {
    MCP_AUTH_MODE: 'standalone',
    MCP_PUBLIC_URL: MCP_URL,
    MCP_TRUSTED_PROXY_HOPS: 1,
    WBS_API_URL: beUrl,
    MCP_BE_INTERNAL_SECRET: secret,
  } satisfies McpConfig;
  const store = activatedStore(name);
  const oauth = new McpOAuthServer(
    config,
    {
      authorizationUrl: () => Promise.reject(new Error('no consent in this test')),
      exchange: () => Promise.reject(new Error('no consent in this test')),
      refresh: () => Promise.reject(new Error('no consent in this test')),
      revoke: () => Promise.resolve(),
    },
    {
      store,
      now: () => Date.now() + clockOffsetMs,
      signingKeys: { privateKey: SIGNING.privateKey, publicKey: SIGNING.publicKey },
      verifyUpstream: () => Promise.reject(new Error('no upstream token in this test')),
      organizations: organizationAuthority(config),
      reportFault: (fault) => faults.push(fault),
      machineGrants: {
        client: machineGrantClient(config),
        secret,
        tokenTtlSeconds: 12 * 60 * 60,
        limit: NO_MACHINE_LIMITS,
        reportFault: (fault) => faults.push(fault),
      },
    },
  );
  const handle = mcpFetchHandler(
    () =>
      createServer({
        tools: TOOLS,
        config,
        reportUnexpectedToolFailure: (cause) => {
          throw cause instanceof Error ? cause : new Error(String(cause));
        },
        bearerFor: (sessionId, upstreamToken, scopes) =>
          oauth.bearerFor(sessionId, upstreamToken, scopes),
      }),
    config,
    oauth,
    {},
    oauth,
  );
  return { oauth, handle, store };
}

beforeAll(async () => {
  backend = Bun.spawn(
    [process.execPath, 'apps/wbs/be-01/src/testing/mcp-machine-grant-backend.ts'],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        MCP_TEST_BE_SECRET: BE_SECRET,
        MCP_TEST_AUTHORIZATION_SERVER: OAUTH,
      },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'inherit',
    },
  );
  beUrl = `http://127.0.0.1:${String(await readPort(backend.stdout))}`;
  storeDir = mkdtempSync(join(tmpdir(), 'mcp-machine-admission-'));
  replicaA = replica('a', BE_SECRET);
});

afterAll(async () => {
  await client.close();
  replicaA.store.close();
  backend?.kill('SIGTERM');
  await backend?.exited;
  rmSync(storeDir, { recursive: true, force: true });
});

async function fixture<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(`${beUrl}/__fixture/${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (response.status !== 200) throw new Error(`${path}: ${await response.text()}`);
  return (await response.json()) as T;
}

/** The agent's SDK client, over replica A's fetch handler, its token requests counted. */
async function connectAgent(): Promise<void> {
  provider = new ClientCredentialsProvider({
    clientId: agent.id,
    clientSecret: agent.key,
    expectedIssuer: OAUTH,
  });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    authProvider: provider,
    fetch: (input, init) => {
      const request = new Request(input, init);
      if (request.url === TOKEN) tokenRequests += 1;
      return replicaA.handle(request);
    },
  });
  client = new Client({ name: 'headless-agent', version: '0.0.0' });
  await client.connect(transport);
}

/** One tool call through the agent's SDK client: its text and error flag. */
async function call(
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ isError: boolean; text: string }> {
  const result = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: { text: string }[];
  };
  return { isError: result.isError === true, text: result.content.map((p) => p.text).join('\n') };
}

/** One raw `tools/call` with `token` to `handle`: the HTTP status, and the tool's answer on 200. */
async function rawCall(
  handle: (request: Request) => Promise<Response>,
  token: string,
  name: string,
): Promise<{ status: number; text: string }> {
  const response = await handle(
    new Request(MCP_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: {} },
      }),
    }),
  );
  if (response.status !== 200) return { status: response.status, text: await response.text() };
  const body = (await response.json()) as { result: { content: { text: string }[] } };
  return { status: 200, text: body.result.content.map((part) => part.text).join('\n') };
}

function currentToken(): string {
  const token = provider.tokens()?.access_token;
  if (token === undefined) throw new Error('the agent holds no token');
  return token;
}

const ids = { project: '', leaf: '' };

describe('a headless agent on /mcp', () => {
  test('activation', async () => {
    await fixture('activate');
    Object.assign(
      agent,
      await fixture<{ id: string; key: string }>('api-key', { personId: 'claire' }),
    );
  });

  test("a headless agent's key reaches /mcp as its machine person", async () => {
    await connectAgent();
    expect(tokenRequests).toBe(1);
    expect(decodeJwt(currentToken())).toMatchObject({ token_use: 'machine', sub: agent.id });
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name).toSorted()).toEqual(
      TOOLS.map((tool) => tool.name).toSorted(),
    );

    const created = await call('postApiProjects', { name: 'Fleet' });
    expect(created.isError).toBe(false);
    const project = JSON.parse(created.text) as {
      project: { id: string };
      steps: { id: string }[];
    };
    ids.project = project.project.id;
    const firstStep = project.steps.at(0);
    if (firstStep === undefined) throw new Error('created project has no first workflow step');
    const leaf = await call('postApiProjectsByIdCommands', {
      id: ids.project,
      commands: [{ kind: 'createWorkItem', parentId: null, afterId: null, name: 'Leaf' }],
    });
    expect(leaf.isError).toBe(false);
    ids.leaf = (JSON.parse(leaf.text) as { results: { id: string }[] }).results[0]?.id ?? '';

    // The token is pinned to claire: another person of the same account is refused.
    const asOther = await call('postApiProjectsByIdCommands', {
      id: ids.project,
      commands: [
        {
          kind: 'claimWorkItem',
          workItemId: ids.leaf,
          personId: 'vics-agent',
          steps: [firstStep.id],
        },
      ],
    });
    expect(asOther.isError).toBe(true);
    const claimed = await call('postApiProjectsByIdCommands', {
      id: ids.project,
      commands: [
        { kind: 'claimWorkItem', workItemId: ids.leaf, personId: 'claire', steps: [firstStep.id] },
      ],
    });
    expect(claimed.isError, claimed.text).toBe(false);

    const claims = await call('getApiProjectsByIdClaims', { id: ids.project });
    expect(claims.isError).toBe(false);
    const listedClaims = (
      JSON.parse(claims.text) as {
        claims: { holder: { personId: string }; leaseExpiresAt: number | null }[];
      }
    ).claims;
    // The selected first workflow step is held by claire and leased, as a raw key's would be.
    expect(listedClaims.length).toBeGreaterThan(0);
    expect(new Set(listedClaims.map((claim) => claim.holder.personId))).toEqual(
      new Set(['claire']),
    );
    expect(listedClaims.every((claim) => typeof claim.leaseExpiresAt === 'number')).toBe(true);
    // The heartbeat renews the machine person's leases.
    const renewed = await call('postApiClaimsRenew');
    expect(renewed.isError).toBe(false);
    expect(JSON.parse(renewed.text)).toMatchObject({ leases: listedClaims.length });
    expect(tokenRequests).toBe(1);
  });

  test('re-fetches at expiry: the next request gets 401, the provider asks again, the call succeeds', async () => {
    const before = tokenRequests;
    const expired = currentToken();
    clockOffsetMs = 13 * 60 * 60 * 1000;
    expect((await rawCall(replicaA.handle, expired, 'getApiProjects')).status).toBe(401);
    const listed = await call('getApiProjects');
    expect(listed.isError).toBe(false);
    expect(tokenRequests).toBe(before + 1);
    expect(currentToken()).not.toBe(expired);
  });

  test("answers a key rotation 401 invalid_token, and the re-fetched token's call succeeds", async () => {
    const before = tokenRequests;
    const rotatedAway = currentToken();
    await fixture('rotate-grant-key');
    const refused = await rawCall(replicaA.handle, rotatedAway, 'getApiProjects');
    // Proof: answering be-01's unknown_grant_key as a tool error (`grantRejected()` dropped in
    // server.ts) made this 200, and the SDK call below resolved with the tool error without
    // re-fetching; watched 2026-10-27.
    expect(refused.status).toBe(401);
    const listed = await call('getApiProjects');
    expect(listed.isError).toBe(false);
    expect(tokenRequests).toBe(before + 1);
  });

  test('a wrong service secret is a reported fault, 502, never a re-fetch', async () => {
    const wrong = replica('wrong-secret', randomBytes(32).toString('base64url'));
    try {
      const before = faults.length;
      const answer = await rawCall(wrong.handle, currentToken(), 'getApiProjects');
      // Proof: with be-01 answering a missing or wrong secret `unknown_grant_key` (identity.ts,
      // slice 1's negative), this answered 401 and the client would re-fetch; watched
      // 2026-10-27.
      expect(answer.status).toBe(502);
      expect(faults.slice(before).map((fault) => fault.message)).toEqual([
        'be-01 answered a machine call to GET /api/projects HTTP 401 internal_unauthorized',
      ]);
      // The token stays good where the secret is right.
      expect((await rawCall(replicaA.handle, currentToken(), 'getApiProjects')).status).toBe(200);
    } finally {
      wrong.store.close();
    }
  });

  test('revocation at the next call: machine_credential_refused, then 401, then invalid_client', async () => {
    const token = currentToken();
    await fixture('revoke', { id: agent.id });
    const refused = await rawCall(replicaA.handle, token, 'getApiProjects');
    // Proof: with a per-jti admission cache in be-01's grant branch (identity.ts skipping
    // `admitMachineGrant` for a grant it admitted before), this call succeeded after the
    // revocation committed; watched 2026-10-27.
    expect(refused.status).toBe(200);
    expect(refused.text).toContain('machine_credential_refused');
    const next = await rawCall(replicaA.handle, token, 'getApiProjects');
    expect(next.status).toBe(401);
    const reissued = await replicaA.handle(
      new Request(TOKEN, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${btoa(`${agent.id}:${agent.key}`)}`,
        },
        body: new URLSearchParams({ grant_type: 'client_credentials', resource: MCP_URL }),
      }),
    );
    expect(reissued.status).toBe(401);
    expect(await reissued.json()).toEqual({ error: 'invalid_client' });
  });
});
