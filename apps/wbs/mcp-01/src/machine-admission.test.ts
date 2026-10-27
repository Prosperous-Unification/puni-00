import { generateKeyPairSync, randomBytes } from 'node:crypto';

import { MCP_INTERNAL_SECRET_HEADER } from '@wbs/contracts';
import { newMachineKey } from '@wbs/core';
import { describe, expect, it } from 'bun:test';
import { decodeJwt, SignJWT } from 'jose';

import type { McpConfig } from './config';
import type { McpDeploymentFault } from './deployment-fault';
import { groupPrefixOf, mcpFetchHandler } from './http';
import { machineIdentityOf, RefusedMachineTokens } from './machine-admission';
import { machineGrantClient } from './machine-grant-client';
import { McpOAuthServer, NO_TOKEN_ENDPOINT_LIMITS } from './oauth';
import { readDocument, toolsFromDocument } from './openapi-tools';
import { organizationAuthority } from './organization-authority';
import { createServer } from './server';
import { McpSessionStore } from './session-store';
import { CLIENT_CREDENTIALS_GRANT } from './token-request';
import type { FetchLike } from './wbs-client';

/**
 * Task 3.2 of `wbs-mcp-agent-surface` against a fake be-01: a machine token at `/mcp` reads
 * no store, presents its grant with `MCP_BE_INTERNAL_SECRET`, and learns revocation per M3.
 * Task 3.5's gateway refusal and M5's `/revoke` and refresh answers sit here too. The booted
 * end-to-end flow is `machine-admission.boot.test.ts`.
 */
const MCP_URL = 'https://wbs.example/mcp';
const OAUTH = 'https://wbs.example/mcp/oauth';
const BE = 'https://be.example';
const SECRET = randomBytes(32).toString('base64url');
const NOW = 1_793_000_000_000;
const TTL = 12 * 60 * 60;
const CONFIG = {
  MCP_AUTH_MODE: 'standalone',
  MCP_PUBLIC_URL: MCP_URL,
  WBS_API_URL: BE,
  MCP_BE_INTERNAL_SECRET: SECRET,
} satisfies McpConfig;
const CREDENTIAL = '0b7c2f8e-3a41-4c55-9f0e-1d2e3f405162';
const KEY = newMachineKey(CREDENTIAL).key;
const BASIC = `Basic ${btoa(`${CREDENTIAL}:${KEY}`)}`;
const TOOLS = toolsFromDocument(readDocument());
const SIGNING = generateKeyPairSync('rsa', { modulusLength: 2048 });

interface ApiCall {
  readonly path: string;
  readonly headers: Headers;
}

/**
 * be-01: the grant route issues `grant-<n>`, and every `/api` call is answered by `api`, a
 * test's lever (by default a project list), and recorded.
 */
function fakeBe() {
  const api: ApiCall[] = [];
  let grants = 0;
  const state = {
    answer: (): Response => Response.json({ projects: [] }),
  };
  const fetchImpl: FetchLike = (url, init) => {
    const path = new URL(url).pathname;
    if (path === '/internal/mcp/machine-grants') {
      grants += 1;
      return Promise.resolve(
        Response.json({
          grant: `grant-${String(grants)}`,
          credentialId: CREDENTIAL,
          personId: 'claire',
          organizationId: 'org-a',
          scopes: ['read', 'write'],
          expiresAt: Math.floor(NOW / 1000) + TTL + 60,
          runId: null,
        }),
      );
    }
    api.push({ path, headers: new Headers(init.headers) });
    return Promise.resolve(state.answer());
  };
  return { api, state, fetchImpl };
}

const refusal = (status: number, error: string) => Response.json({ error }, { status });

/** One mcp-01 replica; replicas made with the same `signingKeys` share only those and the secret. */
function replica(
  be: ReturnType<typeof fakeBe>,
  options: {
    readonly config?: McpConfig;
    readonly store?: McpSessionStore;
    readonly now?: () => number;
    readonly secret?: string;
  } = {},
) {
  const faults: McpDeploymentFault[] = [];
  let upstream = 0;
  const config = options.config ?? CONFIG;
  const secret = options.secret ?? SECRET;
  const oauth = new McpOAuthServer(
    config,
    {
      authorizationUrl: () => Promise.reject(new Error('unused')),
      exchange: () => Promise.reject(new Error('unused')),
      refresh: () => Promise.reject(new Error('unused')),
      revoke: () => Promise.resolve(),
    },
    {
      now: options.now ?? (() => NOW),
      groupPrefix: groupPrefixOf({}),
      signingKeys: { privateKey: SIGNING.privateKey, publicKey: SIGNING.publicKey },
      ...(options.store === undefined ? {} : { store: options.store }),
      verifyUpstream: () => {
        upstream += 1;
        return Promise.reject(new Error('not upstream'));
      },
      machineGrants: {
        client: machineGrantClient({ ...config, MCP_BE_INTERNAL_SECRET: secret }, be.fetchImpl),
        secret,
        tokenTtlSeconds: TTL,
        jitter: () => 0,
        limit: NO_TOKEN_ENDPOINT_LIMITS,
        reportFault: (fault) => faults.push(fault),
      },
    },
  );
  const handle = mcpFetchHandler(
    () =>
      createServer({
        tools: TOOLS,
        config,
        fetchImpl: be.fetchImpl,
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
  return { oauth, handle, faults, upstreamCalls: () => upstream };
}

async function issue(
  oauth: McpOAuthServer,
  fields: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await oauth.response(
    new Request(`${OAUTH}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: BASIC },
      body: new URLSearchParams({
        resource: MCP_URL,
        grant_type: CLIENT_CREDENTIALS_GRANT,
        ...fields,
      }),
    }),
  );
  if (response === undefined) throw new Error('not a token route');
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function accessToken(oauth: McpOAuthServer, fields?: Record<string, string>) {
  const issued = await issue(oauth, fields);
  if (issued.status !== 200) throw new Error(`token refused: ${JSON.stringify(issued)}`);
  return issued.body['access_token'] as string;
}

interface CallAnswer {
  readonly status: number;
  readonly results: readonly { readonly isError: boolean; readonly text: string }[];
  readonly challenge: string | null;
}

let rpcId = 0;
/** One HTTP request to `/mcp` carrying `calls` tools/call messages (a batch when more than one). */
async function mcp(
  handle: (request: Request) => Promise<Response>,
  token: string,
  calls: readonly { readonly name: string; readonly args?: Record<string, unknown> }[],
): Promise<CallAnswer> {
  const messages = calls.map((call) => {
    rpcId += 1;
    return {
      jsonrpc: '2.0',
      id: rpcId,
      method: 'tools/call',
      params: { name: call.name, arguments: call.args ?? {} },
    };
  });
  const response = await handle(
    new Request(MCP_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(messages.length === 1 ? messages[0] : messages),
    }),
  );
  const challenge = response.headers.get('www-authenticate');
  if (response.status !== 200) return { status: response.status, results: [], challenge };
  const parsed = (await response.json()) as unknown;
  const replies = (Array.isArray(parsed) ? parsed : [parsed]) as {
    result: { isError?: boolean; content: { text: string }[] };
  }[];
  return {
    status: 200,
    challenge,
    results: replies.map((reply) => ({
      isError: reply.result.isError === true,
      text: reply.result.content.map((part) => part.text).join('\n'),
    })),
  };
}

const read = [{ name: 'getApiProjects' }] as const;

/** A session store that records every method called on it once armed. */
function spiedStore() {
  const store = new McpSessionStore(':memory:', [randomBytes(32)]);
  const calls: string[] = [];
  let armed = false;
  const spy = new Proxy(store, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        if (armed) calls.push(String(property));
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return {
    store: spy,
    calls,
    arm: () => {
      armed = true;
    },
  };
}

describe('a machine token at /mcp', () => {
  it('presents the grant with the secret, and never the access token', async () => {
    const be = fakeBe();
    const { oauth, handle } = replica(be);
    const token = await accessToken(oauth);
    const answer = await mcp(handle, token, read);
    expect(answer).toMatchObject({ status: 200, results: [{ isError: false }] });
    expect(be.api).toHaveLength(1);
    const call = be.api.at(0);
    if (call === undefined) throw new Error('be-01 was not asked');
    expect(call.path).toBe('/api/projects');
    expect(call.headers.get('authorization')).toBe('Bearer grant-1');
    expect(call.headers.get(MCP_INTERNAL_SECRET_HEADER)).toBe(SECRET);
    expect(call.headers.get('x-internal-auth')).toBeNull();
    // Proof: presenting the access token as the bearer (in `authenticateCaller`) failed the
    // grant expectation above; watched 2026-10-27.
    expect([...call.headers.values()].some((value) => value.includes(token))).toBe(false);
  });

  it('is answered by a second replica sharing only the keys and the secret, reading no store', async () => {
    const be = fakeBe();
    const a = spiedStore();
    const b = spiedStore();
    const replicaA = replica(be, { store: a.store });
    const replicaB = replica(be, { store: b.store });
    a.arm();
    b.arm();
    const token = await accessToken(replicaA.oauth);
    const answer = await mcp(replicaB.handle, token, read);
    expect(answer).toMatchObject({ status: 200, results: [{ isError: false }] });
    // Proof: reading the credential epoch in the machine path (`admitMachine`) made B's spy
    // record `credentialEpoch`; watched 2026-10-27.
    expect({ a: a.calls, b: b.calls }).toEqual({ a: [], b: [] });
    expect(replicaB.upstreamCalls()).toBe(0);
  });

  it("enforces a narrowed token's scope before asking be-01", async () => {
    const be = fakeBe();
    const { oauth, handle } = replica(be);
    const token = await accessToken(oauth, { scope: 'wbs:read' });
    expect(decodeJwt(token)['scope']).toBe('wbs:read');
    const write = await mcp(handle, token, [{ name: 'postApiProjects', args: { name: 'X' } }]);
    expect(write.results[0]?.text).toContain('insufficient_scope');
    expect(be.api).toHaveLength(0);
    expect((await mcp(handle, token, read)).results[0]?.isError).toBe(false);
  });

  it('answers the call after a revocation commits machine_credential_refused, then 401, and each replica learns it at its own call', async () => {
    const be = fakeBe();
    const replicaA = replica(be);
    const replicaB = replica(be);
    const token = await accessToken(replicaA.oauth);
    expect((await mcp(replicaA.handle, token, read)).results[0]?.isError).toBe(false);
    be.state.answer = () => refusal(401, 'unknown_identity');
    const refused = await mcp(replicaA.handle, token, read);
    expect(refused.status).toBe(200);
    expect(refused.results[0]?.text).toContain('machine_credential_refused');
    const next = await mcp(replicaA.handle, token, read);
    expect(next.status).toBe(401);
    expect(next.challenge).toContain('error="invalid_token"');
    expect(be.api).toHaveLength(2);
    // Replica B has not seen it: its first call asks be-01, which refuses.
    const atB = await mcp(replicaB.handle, token, read);
    expect(atB.results[0]?.text).toContain('machine_credential_refused');
    expect((await mcp(replicaB.handle, token, read)).status).toBe(401);
    expect(replicaA.faults).toEqual([]);
  });

  it('answers each call of a batch be-01 serves after the revocation machine_credential_refused', async () => {
    const be = fakeBe();
    const { oauth, handle } = replica(be);
    const token = await accessToken(oauth);
    let served = 0;
    // The revocation commits after be-01 served the first call of the batch.
    be.state.answer = () => {
      served += 1;
      return served === 1 ? Response.json({ projects: [] }) : refusal(401, 'unknown_identity');
    };
    const batch = await mcp(handle, token, [...read, ...read, ...read]);
    expect(batch.status).toBe(200);
    expect(batch.results.map((result) => result.isError).toSorted()).toEqual([false, true, true]);
    const refusedTexts = batch.results.filter((result) => result.isError).map((r) => r.text);
    expect(refusedTexts.every((text) => text.includes('machine_credential_refused'))).toBe(true);
    expect((await mcp(handle, token, read)).status).toBe(401);
  });

  it('answers a missing or wrong secret 502 and reports it, and keeps the token once the secret is fixed', async () => {
    const be = fakeBe();
    const { oauth, handle, faults } = replica(be);
    const token = await accessToken(oauth);
    be.state.answer = () => refusal(401, 'internal_unauthorized');
    const fault = await mcp(handle, token, read);
    expect(fault.status).toBe(502);
    expect(faults.map((reported) => reported.message)).toEqual([
      'be-01 answered a machine call to GET /api/projects HTTP 401 internal_unauthorized',
    ]);
    be.state.answer = () => Response.json({ projects: [] });
    // Proof: entering the fault into the refused set (`credentialRefused()` in its branch) made
    // this answer 401; watched 2026-10-27.
    const fixed = await mcp(handle, token, read);
    expect(fixed).toMatchObject({ status: 200, results: [{ isError: false }] });
  });

  it('answers a grant be-01 cannot verify 401 invalid_token, so the client re-fetches', async () => {
    for (const code of ['unknown_grant_key', 'invalid_token']) {
      const be = fakeBe();
      const { oauth, handle, faults } = replica(be);
      const token = await accessToken(oauth);
      be.state.answer = () => refusal(401, code);
      const answer = await mcp(handle, token, read);
      expect({ code, status: answer.status }).toEqual({ code, status: 401 });
      expect(answer.challenge).toContain('error="invalid_token"');
      expect(faults).toEqual([]);
      // Not entered into the refused set: the next call asks be-01 again.
      be.state.answer = () => Response.json({ projects: [] });
      expect((await mcp(handle, token, read)).status).toBe(200);
    }
  });

  it('answers an expired machine token 401 invalid_token, without asking be-01', async () => {
    const be = fakeBe();
    let now = NOW;
    const { oauth, handle } = replica(be, { now: () => now });
    const token = await accessToken(oauth);
    now = NOW + (TTL + 1) * 1000;
    const answer = await mcp(handle, token, read);
    expect(answer.status).toBe(401);
    expect(answer.challenge).toContain('error="invalid_token"');
    expect(be.api).toHaveLength(0);
  });

  it('refuses a machine token without its grant, and a token of an unknown use, asking nobody', async () => {
    const be = fakeBe();
    const { oauth, handle } = replica(be);
    const sign = (claims: Record<string, unknown>) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: decodeProtected(issuedKid), typ: 'JWT' })
        .setIssuer(OAUTH)
        .setAudience(MCP_URL)
        .setSubject(CREDENTIAL)
        .setJti(crypto.randomUUID())
        .setIssuedAt(Math.floor(NOW / 1000))
        .setExpirationTime(Math.floor(NOW / 1000) + 600)
        .sign(SIGNING.privateKey);
    const issuedKid = await accessToken(oauth);
    const groups = { wbs_groups: ['dev:wbs:read'], scope: 'wbs:read' };
    const grantless = await sign({
      ...groups,
      token_use: 'machine',
      wbs_person: 'claire',
      wbs_organization: 'org-a',
    });
    const otherUse = await sign({
      ...groups,
      token_use: 'other',
      wbs_machine_grant: 'grant-x',
      wbs_person: 'claire',
      wbs_organization: 'org-a',
    });
    for (const token of [grantless, otherUse])
      expect((await mcp(handle, token, read)).status).toBe(401);
    expect(be.api).toHaveLength(0);
  });

  it('refuses a machine token where no machine admission is composed', async () => {
    const be = fakeBe();
    const { oauth } = replica(be);
    const token = await accessToken(oauth);
    const gateway = replica(be, {
      config: { ...CONFIG, MCP_AUTH_MODE: 'gateway', MCP_TRUSTED_GATEWAY: 'true' },
    });
    expect(await settled(gateway.oauth.admitCaller(token))).toBe('refused');
    expect(await settled(oauth.admitCaller(token))).toBe('admitted');
  });

  it('answers unsupported_token_type for a machine token at /revoke, and invalid_grant at refresh', async () => {
    const be = fakeBe();
    const { oauth, handle } = replica(be);
    const token = await accessToken(oauth);
    const revoked = await oauth.response(
      new Request(`${OAUTH}/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
      }),
    );
    expect(revoked?.status).toBe(400);
    expect(await revoked?.json()).toEqual({ error: 'unsupported_token_type' });
    const refreshed = await oauth.response(
      new Request(`${OAUTH}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: token,
          client_id: CREDENTIAL,
        }),
      }),
    );
    expect(refreshed?.status).toBe(400);
    expect(await refreshed?.json()).toEqual({ error: 'invalid_grant' });
    // Neither ended it.
    expect((await mcp(handle, token, read)).status).toBe(200);
  });
});

describe('the review of PR #764', () => {
  it('answers a batch meeting a key fault and a secret fault 502', async () => {
    const be = fakeBe();
    const { oauth, handle, faults } = replica(be);
    const token = await accessToken(oauth);
    let served = 0;
    // The key fault arrives first, so a 401 recorded first must still give way to the 502.
    be.state.answer = () => {
      served += 1;
      return served === 1
        ? refusal(401, 'unknown_grant_key')
        : refusal(401, 'internal_unauthorized');
    };
    // Proof: with `deploymentFault` keeping an earlier outcome (`??=` in machine-admission.ts),
    // this answered 401; watched 2026-10-27.
    const answer = await mcp(handle, token, [...read, ...read]);
    expect(answer.status).toBe(502);
    expect(faults).toHaveLength(1);
  });

  it('refuses a machine token whose run claim is not text', async () => {
    const be = fakeBe();
    const { oauth, handle } = replica(be);
    const issued = decodeJwt(await accessToken(oauth));
    const kid = decodeProtected(await accessToken(oauth));
    for (const run of ['', 5]) {
      const forged = await new SignJWT({ ...issued, wbs_run: run })
        .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
        .sign(SIGNING.privateKey);
      expect((await mcp(handle, forged, read)).status).toBe(401);
    }
    expect(be.api).toHaveLength(0);
  });
});

/**
 * mcp-01 at epoch 0 with organization authority, asked by a raw upstream token: be-01's
 * `/internal/mcp/organizations` answers through `organizations`, and every other be-01 call is
 * recorded in `api`.
 */
function upstreamReplica(organizations: () => Response | Promise<Response>) {
  const api: string[] = [];
  const faults: McpDeploymentFault[] = [];
  const config = { ...CONFIG, INTERNAL_AUTH_SECRET: 'i'.repeat(32) };
  const fetchImpl: FetchLike = (url) => {
    const path = new URL(url).pathname;
    if (path === '/internal/mcp/organizations') return Promise.resolve(organizations());
    api.push(path);
    return Promise.resolve(Response.json({ projects: [] }));
  };
  const oauth = new McpOAuthServer(
    config,
    {
      authorizationUrl: () => Promise.reject(new Error('unused')),
      exchange: () => Promise.reject(new Error('unused')),
      refresh: () => Promise.reject(new Error('unused')),
      revoke: () => Promise.resolve(),
    },
    {
      now: () => NOW,
      verifyUpstream: (token) =>
        token === 'upstream-token'
          ? Promise.resolve({
              iss: 'https://idp.example/',
              sub: 'auth0|ada',
              wbs_groups: ['dev:wbs:read'],
            })
          : Promise.reject(new Error('not upstream')),
      organizations: organizationAuthority(config, fetchImpl),
      reportFault: (fault) => faults.push(fault),
    },
  );
  const handle = mcpFetchHandler(
    () =>
      createServer({
        tools: TOOLS,
        config,
        fetchImpl,
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
  return { handle, api, faults };
}

describe('the activation markers check (M13)', () => {
  it('forwards an upstream token while be-01 is not activated either', async () => {
    const { handle, api } = upstreamReplica(() => Response.json({ state: 'pre_activation' }));
    expect((await mcp(handle, 'upstream-token', read)).status).toBe(200);
    expect(api).toEqual(['/api/projects']);
  });

  it('answers 502 and reports a fault when be-01 cannot answer the markers check', async () => {
    const outages: (() => Response | Promise<Response>)[] = [
      () => Response.json({ error: 'unavailable' }, { status: 503 }),
      () => Promise.reject(Object.assign(new TypeError('fetch failed'), { code: 'ECONNREFUSED' })),
    ];
    for (const outage of outages) {
      const { handle, api, faults } = upstreamReplica(outage);
      const answer = await mcp(handle, 'upstream-token', read);
      expect(answer.status).toBe(502);
      expect(faults).toHaveLength(1);
      expect(api).toEqual([]);
    }
  });

  it('refuses an upstream token be-01 refuses at the markers check, forwarding nothing', async () => {
    const { handle, api, faults } = upstreamReplica(() =>
      Response.json({ error: 'unauthenticated' }, { status: 401 }),
    );
    expect((await mcp(handle, 'upstream-token', read)).status).toBe(401);
    expect(api).toEqual([]);
    expect(faults).toEqual([]);
  });
});

describe('gateway mode (M11, task 3.5)', () => {
  it('refuses a machine token in gateway mode, forwarding nothing', async () => {
    const be = fakeBe();
    const { oauth } = replica(be);
    const token = await accessToken(oauth, { scope: 'wbs:read' });
    // The groups are the ones gateway admission reads, so a forwarded token would be admitted
    // with wbs:read rather than masked by insufficient_scope.
    expect(decodeJwt(token)['wbs_groups']).toEqual([`${groupPrefixOf({})}:wbs:read`]);
    const config = { ...CONFIG, MCP_AUTH_MODE: 'gateway', MCP_TRUSTED_GATEWAY: 'true' } as const;
    const handle = mcpFetchHandler(
      () =>
        createServer({
          tools: TOOLS,
          config,
          fetchImpl: be.fetchImpl,
          reportUnexpectedToolFailure: (cause) => {
            throw cause instanceof Error ? cause : new Error(String(cause));
          },
        }),
      config,
      { verify: () => Promise.reject(new Error('gateway mode must not verify locally')) },
      {},
    );
    const answer = await mcp(handle, token, read);
    expect(answer.status).toBe(401);
    expect(answer.challenge).toContain('error="invalid_token"');
    expect(be.api).toHaveLength(0);
  });
});

describe('the refused set', () => {
  const identity = (jti: string, expiresAt: number) => ({
    credentialId: CREDENTIAL,
    personId: 'claire',
    organizationId: 'org-a',
    runId: null,
    jti,
    expiresAt,
    grant: 'g',
  });

  it('holds a token until its exp, and drops the expired ones as it grows', () => {
    let now = NOW;
    const refused = new RefusedMachineTokens(() => now);
    refused.refuse(identity('a', NOW / 1000 + 10));
    refused.refuse(identity('b', NOW / 1000 + 100));
    expect([refused.isRefused('a'), refused.isRefused('b'), refused.isRefused('c')]).toEqual([
      true,
      true,
      false,
    ]);
    now = NOW + 11_000;
    refused.refuse(identity('c', NOW / 1000 + 100));
    expect(refused.size).toBe(2);
    expect(refused.isRefused('a')).toBe(false);
  });

  it('reads a machine identity from its claims, run included', () => {
    expect(
      machineIdentityOf({
        token_use: 'machine',
        sub: CREDENTIAL,
        wbs_person: 'claire',
        wbs_organization: 'org-a',
        wbs_run: 'run-a',
        wbs_machine_grant: 'g',
        jti: 'j',
        exp: 10,
      }),
    ).toEqual({ ...identity('j', 10), runId: 'run-a' });
    expect(() => machineIdentityOf({ token_use: 'machine', sub: CREDENTIAL, exp: 10 })).toThrow(
      'wbs_person',
    );
  });
});

function decodeProtected(token: string): string {
  const [header = ''] = token.split('.');
  const parsed = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as { kid: string };
  return parsed.kid;
}

async function settled(attempt: Promise<unknown>): Promise<'admitted' | 'refused'> {
  try {
    await attempt;
    return 'admitted';
  } catch {
    return 'refused';
  }
}
