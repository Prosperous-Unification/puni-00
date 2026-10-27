import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

import { auth, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { ClientCredentialsProvider } from '@modelcontextprotocol/sdk/client/auth-extensions.js';
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { decodeJwt } from 'jose';

import type { McpConfig } from './config';
import { mcpFetchHandler } from './http';
import { machineGrantClient } from './machine-grant-client';
import { McpOAuthServer, NO_TOKEN_ENDPOINT_LIMITS, type OAuthRouteEvidence } from './oauth';
import { readDocument, toolsFromDocument } from './openapi-tools';
import { createServer } from './server';
import { McpSessionStore } from './session-store';
import { JWT_BEARER_GRANT } from './token-request';

/**
 * Tasks 2.2 and 2.3 of `wbs-mcp-agent-surface` end to end: mcp-01's token
 * endpoint, with the MCP SDK's `ClientCredentialsProvider` and a minimal
 * test-local JWT-bearer provider (the real one is Twilight Dash's, task 2.4),
 * against be-01's composed machine grant route in its own process
 * (`apps/wbs/be-01/src/testing/mcp-machine-grant-backend.ts`) over real HTTP,
 * with a local trusted issuer signing the workload tokens.
 *
 * The tests share one backend and run in order: before activation, then after.
 * `/mcp` admission of the machine token is section 3; here the token is read
 * as the client receives it.
 */
setDefaultTimeout(60_000);

const REPO_ROOT = join(import.meta.dir, '../../../..');
const MCP_URL = 'https://wbs.example/mcp';
const OAUTH = 'https://wbs.example/mcp/oauth';
const TOKEN = `${OAUTH}/token`;
/** Generated per run, never a deployment's: be-01 and mcp-01 share it. */
const BE_SECRET = randomBytes(32).toString('base64url');
const SUBJECT = 'repo:puni/fleet:ref:refs/heads/main';

let backend: Bun.Subprocess<'ignore', 'pipe', 'inherit'> | undefined;
let beUrl = '';
/** Everything be-01 printed after its port line: its log, reports included. */
let beLog = '';
let oauth: McpOAuthServer;
let handle: (request: Request) => Promise<Response>;
const evidence: OAuthRouteEvidence[] = [];
/** Grant requests mcp-01 sent to be-01. */
let grantRequests = 0;
let upstreamVerifications = 0;
let clientLookups = 0;

async function readBackend(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  let printed = '';
  while (!printed.includes('\n')) {
    const chunk = await reader.read();
    if (chunk.done) throw new Error(`be-01 exited before serving: ${printed}`);
    printed += new TextDecoder().decode(chunk.value);
  }
  const [first = '', ...rest] = printed.split('\n');
  beLog += rest.join('\n');
  void (async () => {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return;
      beLog += new TextDecoder().decode(chunk.value);
    }
  })();
  return first;
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
  const { port } = JSON.parse(await readBackend(backend.stdout)) as { port: number };
  beUrl = `http://127.0.0.1:${String(port)}`;

  const config = {
    MCP_AUTH_MODE: 'standalone',
    MCP_PUBLIC_URL: MCP_URL,
    WBS_API_URL: beUrl,
    MCP_BE_INTERNAL_SECRET: BE_SECRET,
  } satisfies McpConfig;
  const store = new McpSessionStore(':memory:', [randomBytes(32)]);
  const readClient = store.client.bind(store);
  store.client = (...args) => {
    clientLookups += 1;
    return readClient(...args);
  };
  oauth = new McpOAuthServer(
    config,
    {
      authorizationUrl: () => Promise.reject(new Error('no consent in this test')),
      exchange: () => Promise.reject(new Error('no consent in this test')),
      refresh: () => Promise.reject(new Error('no consent in this test')),
      revoke: () => Promise.resolve(),
    },
    {
      store,
      verifyUpstream: () => {
        upstreamVerifications += 1;
        return Promise.reject(new Error('not an upstream token'));
      },
      routeEvidence: (seen) => evidence.push(seen),
      machineGrants: {
        client: machineGrantClient(config, (input, init) => {
          grantRequests += 1;
          return fetch(input, init);
        }),
        secret: BE_SECRET,
        tokenTtlSeconds: 12 * 60 * 60,
        limit: NO_TOKEN_ENDPOINT_LIMITS,
        reportFault: (fault) => {
          throw fault;
        },
      },
    },
  );
  const tools = toolsFromDocument(readDocument());
  handle = mcpFetchHandler(
    () =>
      createServer({
        tools,
        config,
        reportUnexpectedToolFailure: (cause) => {
          throw cause instanceof Error ? cause : new Error(String(cause));
        },
      }),
    config,
    oauth,
    {},
    oauth,
  );
});

afterAll(async () => {
  backend?.kill('SIGTERM');
  await backend?.exited;
});

async function fixture<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${beUrl}/__fixture/${path}`, {
    method: body === undefined && path === 'audit' ? 'GET' : 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status !== 200) throw new Error(`${path}: ${await response.text()}`);
  return (await response.json()) as T;
}

function apiKey(personId = 'claire'): Promise<{ id: string; key: string }> {
  return fixture('api-key', { personId });
}

async function assertion(
  options: { typ?: string; lifetimeSeconds?: number; jti?: string } = {},
): Promise<string> {
  return (await fixture<{ assertion: string }>('assertion', { subject: SUBJECT, ...options }))
    .assertion;
}

function basic(id: string, key: string): string {
  return `Basic ${btoa(`${id}:${key}`)}`;
}

/** One raw token request, as a client without the SDK sends it. */
async function tokenRequest(
  fields: Record<string, string>,
  authorization?: string,
): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
  const response = await handle(
    new Request(TOKEN, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        ...(authorization === undefined ? {} : { authorization }),
      },
      body: new URLSearchParams({ resource: MCP_URL, ...fields }),
    }),
  );
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    headers: response.headers,
  };
}

/** The SDK's own client, its requests recorded; `auth` runs discovery, then the grant. */
async function sdkToken(provider: OAuthClientProvider, sent: Request[] = []): Promise<void> {
  const outcome = await auth(provider, {
    serverUrl: MCP_URL,
    fetchFn: (input, init) => {
      const request = new Request(input, init);
      sent.push(request.clone());
      return handle(request);
    },
  });
  expect(outcome).toBe('AUTHORIZED');
}

/**
 * The smallest JWT-bearer client (task 2.4's `WorkloadJwtBearerProvider` is
 * Dash's): client information stamped with the issuer so the SDK never
 * registers, no client authentication, and a freshly read assertion per
 * token request.
 */
class TestWorkloadProvider implements OAuthClientProvider {
  private saved: OAuthTokens | undefined;
  readonly reads: string[] = [];
  constructor(
    private readonly credentialId: string,
    private readonly readAssertion: () => Promise<string>,
  ) {}
  get redirectUrl(): undefined {
    return undefined;
  }
  get clientMetadata() {
    return { redirect_uris: [], grant_types: [JWT_BEARER_GRANT] };
  }
  clientInformation(): OAuthClientInformationMixed {
    return { client_id: this.credentialId, issuer: OAUTH };
  }
  tokens(): OAuthTokens | undefined {
    return this.saved;
  }
  saveTokens(tokens: OAuthTokens): void {
    this.saved = tokens;
  }
  redirectToAuthorization(): void {
    throw new Error('a workload never redirects');
  }
  saveCodeVerifier(): void {
    throw new Error('a workload has no code verifier');
  }
  codeVerifier(): string {
    throw new Error('a workload has no code verifier');
  }
  addClientAuthentication(): void {
    // RFC 7523 §2.1: the assertion is the grant, and no client authenticates.
  }
  async prepareTokenRequest(): Promise<URLSearchParams> {
    const fresh = await this.readAssertion();
    this.reads.push(fresh);
    return new URLSearchParams({ grant_type: JWT_BEARER_GRANT, assertion: fresh });
  }
}

describe('before activation', () => {
  test('nothing is issued: invalid_client for a key, invalid_grant for an assertion', async () => {
    const { id, key } = await apiKey();
    const credentials = await tokenRequest({ grant_type: 'client_credentials' }, basic(id, key));
    expect(credentials.status).toBe(401);
    expect(credentials.body).toEqual({ error: 'invalid_client' });
    expect(credentials.headers.get('www-authenticate')).toStartWith('Basic ');
    const bearer = await tokenRequest({
      grant_type: JWT_BEARER_GRANT,
      assertion: await assertion(),
    });
    expect(bearer).toMatchObject({ status: 400, body: { error: 'invalid_grant' } });
    expect(upstreamVerifications).toBe(0);
  });

  test('activation', async () => {
    await fixture('activate', {});
  });
});

describe('client credentials', () => {
  test('an SDK client gets a token over HTTP Basic, with no refresh token', async () => {
    const { id, key } = await apiKey();
    const provider = new ClientCredentialsProvider({
      clientId: id,
      clientSecret: key,
      expectedIssuer: OAUTH,
    });
    const sent: Request[] = [];
    await sdkToken(provider, sent);
    const tokenSent = sent.find((request) => request.url === TOKEN);
    expect(tokenSent?.headers.get('authorization')).toBe(basic(id, key));
    expect(sent.some((request) => request.url.endsWith('/register'))).toBe(false);
    const tokens = provider.tokens();
    expect(tokens?.refresh_token).toBeUndefined();
    expect(tokens?.scope).toBe('wbs:read wbs:write');

    const claims = decodeJwt(tokens?.access_token ?? '');
    expect(claims).toMatchObject({
      iss: OAUTH,
      aud: MCP_URL,
      sub: id,
      token_use: 'machine',
      scope: 'wbs:read wbs:write',
      wbs_person: 'claire',
    });
    const grant = decodeJwt(String(claims['wbs_machine_grant']));
    expect(grant.sub).toBe(id);
    expect(claims.exp).toBe((grant.exp ?? 0) - 60);
    // 12 h lowered by at most 10 %.
    const lifetime = (claims.exp ?? 0) - (claims.iat ?? 0);
    expect(lifetime).toBeLessThanOrEqual(12 * 60 * 60);
    expect(lifetime).toBeGreaterThanOrEqual(Math.floor(12 * 60 * 60 * 0.9));
  });

  test('a body secret works, and a client_id the registered-client store never saw', async () => {
    const { id, key } = await apiKey();
    const before = clientLookups;
    const answer = await tokenRequest({
      grant_type: 'client_credentials',
      client_id: id,
      client_secret: key,
    });
    expect(answer.status).toBe(200);
    expect(clientLookups).toBe(before);
  });

  test('a key bound to a viewer gets wbs:read only', async () => {
    const { id, key } = await apiKey('vics-agent');
    const answer = await tokenRequest({ grant_type: 'client_credentials' }, basic(id, key));
    expect(answer).toMatchObject({ status: 200, body: { scope: 'wbs:read' } });
    expect(decodeJwt(String(answer.body['access_token']))).toMatchObject({
      scope: 'wbs:read',
      wbs_groups: ['dev:wbs:read'],
    });
  });

  test('an unknown id, a revoked key and a wrong secret answer one invalid_client', async () => {
    const live = await apiKey();
    const revoked = await apiKey();
    await fixture('revoke', { id: revoked.id });
    const unknownId = crypto.randomUUID();
    const answers = await Promise.all(
      [
        basic(unknownId, live.key.replace(live.id, unknownId)),
        basic(revoked.id, revoked.key),
        basic(live.id, `${live.key.slice(0, -4)}AAAA`),
      ].map((authorization) => tokenRequest({ grant_type: 'client_credentials' }, authorization)),
    );
    for (const answer of answers) {
      expect(answer.status).toBe(401);
      expect(answer.body).toEqual({ error: 'invalid_client' });
      expect(answer.headers.get('www-authenticate')).toBe('Basic realm="wbs-mcp"');
    }
    expect(upstreamVerifications).toBe(0);
  });

  test('resource and scope are judged before be-01 is asked', async () => {
    const { id, key } = await apiKey();
    const before = grantRequests;
    const raw = (fields: string) =>
      handle(
        new Request(TOKEN, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            authorization: basic(id, key),
          },
          body: `grant_type=client_credentials${fields}`,
        }),
      );
    for (const fields of [
      '',
      `&resource=${encodeURIComponent('https://elsewhere.example/mcp')}`,
      `&resource=${encodeURIComponent(MCP_URL)}&resource=${encodeURIComponent(MCP_URL)}`,
    ]) {
      const response = await raw(fields);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_target' });
    }
    const editor = await raw(`&resource=${encodeURIComponent(MCP_URL)}&scope=wbs:editor`);
    expect(await editor.json()).toEqual({ error: 'invalid_scope' });
    expect(grantRequests).toBe(before);
  });

  test('two authentication methods are invalid_request; a lone client_assertion invalid_client', async () => {
    const { id, key } = await apiKey();
    expect(
      await tokenRequest({ grant_type: 'client_credentials', client_secret: key }, basic(id, key)),
    ).toMatchObject({ status: 400, body: { error: 'invalid_request' } });
    expect(
      await tokenRequest(
        { grant_type: 'client_credentials', client_assertion: await assertion() },
        basic(id, key),
      ),
    ).toMatchObject({ status: 400, body: { error: 'invalid_request' } });
    expect(
      await tokenRequest({
        grant_type: 'client_credentials',
        client_assertion: await assertion(),
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      }),
    ).toMatchObject({ status: 401, body: { error: 'invalid_client' } });
  });

  test('a run shaped like a secret is invalid_request, and no audit row names it', async () => {
    const { id, key } = await apiKey();
    const run = 'a'.repeat(64);
    const answer = await tokenRequest(
      { grant_type: 'client_credentials', wbs_run: run },
      basic(id, key),
    );
    expect(answer).toMatchObject({ status: 400, body: { error: 'invalid_request' } });
    const audit = await fixture<{ detail: string }[]>('audit');
    expect(audit.some((row) => row.detail.includes(run))).toBe(false);
  });
});

describe('JWT bearer', () => {
  let credentialId = '';

  test('a GitHub Actions workload gets a token naming its credential', async () => {
    credentialId = (await fixture<{ id: string }>('workload', { subject: SUBJECT })).id;
    let expiresAt = 0;
    const provider = new TestWorkloadProvider(credentialId, async () => {
      const fresh = await assertion();
      expiresAt = decodeJwt(fresh).exp ?? 0;
      return fresh;
    });
    const sent: Request[] = [];
    await sdkToken(provider, sent);
    expect(sent.some((request) => request.url.endsWith('/register'))).toBe(false);
    const claims = decodeJwt(provider.tokens()?.access_token ?? '');
    expect(claims).toMatchObject({ sub: credentialId, token_use: 'machine', aud: MCP_URL });
    expect(claims.exp).toBeLessThanOrEqual(expiresAt - 60);
    expect(provider.tokens()?.refresh_token).toBeUndefined();
  });

  test('a run outlives its workload token: the next request reads a fresh one', async () => {
    const first = await assertion({ lifetimeSeconds: 62 });
    let reads = 0;
    const provider = new TestWorkloadProvider(credentialId, async () =>
      reads++ === 0 ? first : await assertion(),
    );
    await sdkToken(provider);
    // The access token the first workload token capped (its exp less 60 s) expires, and that
    // workload token can mint no other.
    await Bun.sleep(2_500);
    expect(await tokenRequest({ grant_type: JWT_BEARER_GRANT, assertion: first })).toMatchObject({
      status: 400,
      body: { error: 'invalid_grant' },
    });
    await sdkToken(provider);
    expect(provider.reads).toHaveLength(2);
    expect(provider.reads[1]).not.toBe(first);
    expect(decodeJwt(provider.tokens()?.access_token ?? '').sub).toBe(credentialId);
  });

  test('a reused Kubernetes token: three processes, one jti, all 200', async () => {
    const shared = await assertion({ jti: 'kubelet-token-1' });
    const answers = await Promise.all(
      [1, 2, 3].map(() => tokenRequest({ grant_type: JWT_BEARER_GRANT, assertion: shared })),
    );
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200]);
  });

  test('a client_id the registered-client store has never seen is carried, not looked up', async () => {
    const before = clientLookups;
    const answer = await tokenRequest({
      grant_type: JWT_BEARER_GRANT,
      assertion: await assertion(),
      client_id: credentialId,
    });
    expect(answer.status).toBe(200);
    expect(clientLookups).toBe(before);
    const other = await tokenRequest({
      grant_type: JWT_BEARER_GRANT,
      assertion: await assertion(),
      client_id: crypto.randomUUID(),
    });
    expect(other).toMatchObject({ status: 400, body: { error: 'invalid_grant' } });
  });

  test('an ID-JAG and an access token are invalid_grant naming their typ', async () => {
    for (const typ of ['oauth-id-jag+jwt', 'at+jwt']) {
      const answer = await tokenRequest({
        grant_type: JWT_BEARER_GRANT,
        assertion: await assertion({ typ }),
      });
      expect(answer.status).toBe(400);
      expect(answer.body['error']).toBe('invalid_grant');
      expect(String(answer.body['error_description'])).toContain(typ);
    }
  });

  test('a Basic secret on the JWT-bearer grant is invalid_request', async () => {
    const { id, key } = await apiKey();
    expect(
      await tokenRequest(
        { grant_type: JWT_BEARER_GRANT, assertion: await assertion() },
        basic(id, key),
      ),
    ).toMatchObject({ status: 400, body: { error: 'invalid_request' } });
  });

  test('an assertion for an unknown subject answers invalid_grant, never the upstream verifier', async () => {
    const stranger = await fixture<{ assertion: string }>('assertion', { subject: 'nobody' });
    expect(
      await tokenRequest({ grant_type: JWT_BEARER_GRANT, assertion: stranger.assertion }),
    ).toMatchObject({ status: 400, body: { error: 'invalid_grant' } });
    expect(upstreamVerifications).toBe(0);
  });
});

describe('secrets never reach logs or reports (task 2.3)', () => {
  test('a failure inside be-01’s grant route leaks no key, Basic form or assertion', async () => {
    const { id, key } = await apiKey();
    const workload = await assertion();
    // One audit row of each source first, so the rows are there to read.
    expect(
      (await tokenRequest({ grant_type: 'client_credentials', wbs_run: 'run-ok' }, basic(id, key)))
        .status,
    ).toBe(200);
    const logBefore = beLog.length;
    await fixture('fail-next-issuance', {});
    const failed = await tokenRequest(
      { grant_type: 'client_credentials', wbs_run: 'run-failing' },
      basic(id, key),
    );
    expect(failed).toMatchObject({ status: 503, body: { error: 'temporarily_unavailable' } });
    await fixture('fail-next-issuance', {});
    const failedBearer = await tokenRequest({
      grant_type: JWT_BEARER_GRANT,
      assertion: workload,
      wbs_run: 'run-failing-bearer',
    });
    expect(failedBearer.status).toBe(503);
    // be-01 reported both failures; wait for its log lines to arrive.
    for (let attempt = 0; attempt < 50 && !beLog.slice(logBefore).includes('injected'); attempt++)
      await Bun.sleep(20);
    const report = beLog.slice(logBefore);
    expect(report).toContain('injected failure inside the machine grant route');

    const audit = JSON.stringify(await fixture('audit'));
    const routes = JSON.stringify(evidence);
    expect(routes).toContain('client_credentials');
    const basicForm = btoa(`${id}:${key}`);
    for (const text of [
      report,
      audit,
      routes,
      JSON.stringify(failed),
      JSON.stringify(failedBearer),
    ]) {
      expect(text).not.toContain(key);
      expect(text).not.toContain(key.slice(-43));
      expect(text).not.toContain(basicForm);
      expect(text).not.toContain(workload);
      expect(text).not.toContain(workload.split('.')[2] ?? workload);
      // The repository's `plaintext-secrets` pattern for a WBS API key.
      expect(text).not.toMatch(/wbs_mk_[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}/);
    }
  });
});
