import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MCP_INTERNAL_SECRET_HEADER } from '@wbs/contracts';
import { newMachineKey } from '@wbs/core';
import { describe, expect, it } from 'bun:test';
import { decodeJwt, SignJWT } from 'jose';

import { loadConfig, type McpConfig, offersMachineGrants } from './config';
import { oauthMetadataResponse } from './http';
import { machineGrantClient, MachineGrantDefect } from './machine-grant-client';
import { type MachineLimits, NO_MACHINE_LIMITS } from './machine-limits';
import {
  machineTokenTtlOf,
  mcpOAuthFromEnv,
  McpOAuthServer,
  type OAuthRouteEvidence,
} from './oauth';
import { CLIENT_CREDENTIALS_GRANT, Concealed, JWT_BEARER_GRANT } from './token-request';

const MCP_URL = 'https://wbs.example/mcp';
const OAUTH = 'https://wbs.example/mcp/oauth';
const BE = 'https://be.example';
const SECRET = randomBytes(32).toString('base64url');
const NOW = 1_793_000_000_000;
const CONFIG = {
  MCP_AUTH_MODE: 'standalone',
  MCP_PUBLIC_URL: MCP_URL,
  MCP_TRUSTED_PROXY_HOPS: 1,
  WBS_API_URL: BE,
  MCP_BE_INTERNAL_SECRET: SECRET,
} satisfies McpConfig;
const CREDENTIAL = '0b7c2f8e-3a41-4c55-9f0e-1d2e3f405162';
const KEY = newMachineKey(CREDENTIAL).key;
const TTL = 12 * 60 * 60;

interface Sent {
  readonly url: string;
  readonly headers: Headers;
  readonly body: Record<string, unknown>;
}

/** be-01 answering `answer` to every grant request, recording what mcp-01 sent. */
function fakeBe(answer: () => Response | Promise<Response>) {
  const sent: Sent[] = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    sent.push({
      url: request.url,
      headers: request.headers,
      body: (await request.json()) as Record<string, unknown>,
    });
    return await answer();
  };
  return { sent, fetchImpl };
}

function issued(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    grant: 'grant-jwt',
    credentialId: CREDENTIAL,
    personId: 'claire',
    organizationId: 'org-a',
    scopes: ['read', 'write'],
    expiresAt: Math.floor(NOW / 1000) + TTL + 60,
    runId: null,
    ...overrides,
  });
}

function server(
  answer: () => Response | Promise<Response>,
  options: {
    jitter?: () => number;
    limit?: MachineLimits;
    config?: McpConfig;
    secret?: string;
  } = {},
) {
  const be = fakeBe(answer);
  const evidence: OAuthRouteEvidence[] = [];
  const faults: MachineGrantDefect[] = [];
  let upstream = 0;
  const oauth = new McpOAuthServer(
    options.config ?? CONFIG,
    {
      authorizationUrl: () => Promise.reject(new Error('unused')),
      exchange: () => Promise.reject(new Error('unused')),
      refresh: () => Promise.reject(new Error('unused')),
      revoke: () => Promise.resolve(),
    },
    {
      now: () => NOW,
      verifyUpstream: () => {
        upstream += 1;
        return Promise.reject(new Error('not upstream'));
      },
      routeEvidence: (seen) => evidence.push(seen),
      machineGrants: {
        client: machineGrantClient(
          { ...CONFIG, MCP_BE_INTERNAL_SECRET: options.secret ?? SECRET },
          be.fetchImpl,
        ),
        secret: options.secret ?? SECRET,
        tokenTtlSeconds: TTL,
        jitter: options.jitter ?? (() => 0),
        limit: options.limit ?? NO_MACHINE_LIMITS,
        reportFault: (fault) => faults.push(fault),
      },
    },
  );
  return { oauth, be, evidence, faults, upstreamCalls: () => upstream };
}

async function assertion(): Promise<string> {
  return await new SignJWT({ sub: 'workload' })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(new TextEncoder().encode('k'.repeat(32)));
}

async function token(
  oauth: McpOAuthServer,
  fields: Record<string, string>,
  authorization?: string,
): Promise<Response> {
  const response = await oauth.response(
    new Request(`${OAUTH}/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        ...(authorization === undefined ? {} : { authorization }),
      },
      body: new URLSearchParams({ resource: MCP_URL, ...fields }),
    }),
  );
  if (response === undefined) throw new Error('not a token route');
  return response;
}

const basic = `Basic ${btoa(`${CREDENTIAL}:${KEY}`)}`;
const keyRequest = (oauth: McpOAuthServer, fields: Record<string, string> = {}) =>
  token(oauth, { grant_type: CLIENT_CREDENTIALS_GRANT, ...fields }, basic);
const bearerRequest = async (oauth: McpOAuthServer, fields: Record<string, string> = {}) =>
  token(oauth, { grant_type: JWT_BEARER_GRANT, assertion: await assertion(), ...fields });

describe('asking be-01', () => {
  it('sends the key with the dedicated secret, mcp-01’s issuer and the jittered lifetime plus 60 s', async () => {
    const { oauth, be } = server(
      () =>
        issued({
          runId: 'run-1',
          expiresAt: Math.floor(NOW / 1000) + TTL - Math.floor(TTL * 0.05) + 60,
        }),
      { jitter: () => 0.5 },
    );
    expect((await keyRequest(oauth, { wbs_run: 'run-1' })).status).toBe(200);
    expect(be.sent).toHaveLength(1);
    const [sent] = be.sent;
    expect(sent.url).toBe(`${BE}/internal/mcp/machine-grants`);
    expect(sent.headers.get(MCP_INTERNAL_SECRET_HEADER)).toBe(SECRET);
    expect(sent.headers.get('x-internal-auth')).toBeNull();
    expect(sent.body).toEqual({
      issuer: OAUTH,
      credential: { kind: 'api_key', key: KEY },
      expiresAt: Math.floor(NOW / 1000) + TTL - Math.floor(TTL * 0.05) + 60,
      run: 'run-1',
    });
  });

  it('sends an assertion as an oidc credential', async () => {
    const { oauth, be } = server(() => issued());
    expect((await bearerRequest(oauth)).status).toBe(200);
    expect(be.sent[0]?.body['credential']).toMatchObject({ kind: 'oidc' });
  });
});

describe('the token', () => {
  it('expires 60 s before the grant, carries its scopes, the grant and no refresh token', async () => {
    const grantExp = Math.floor(NOW / 1000) + 3_600;
    const { oauth } = server(() => issued({ expiresAt: grantExp, runId: 'run-1' }));
    const response = await keyRequest(oauth, { wbs_run: 'run-1' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      token_type: 'Bearer',
      expires_in: 3_540,
      scope: 'wbs:read wbs:write',
    });
    expect(body['refresh_token']).toBeUndefined();
    expect(decodeJwt(String(body['access_token']))).toMatchObject({
      iss: OAUTH,
      aud: MCP_URL,
      sub: CREDENTIAL,
      exp: grantExp - 60,
      token_use: 'machine',
      scope: 'wbs:read wbs:write',
      wbs_groups: ['dev:wbs:read', 'dev:wbs:write'],
      wbs_machine_grant: 'grant-jwt',
      wbs_person: 'claire',
      wbs_organization: 'org-a',
      wbs_run: 'run-1',
    });
  });

  it('lowers the lifetime by at most 10 %, uniformly', async () => {
    const expiries: number[] = [];
    for (const draw of [0, 0.25, 0.999]) {
      const { oauth, be } = server(() => issued(), { jitter: () => draw });
      await keyRequest(oauth);
      expiries.push(Number(be.sent[0]?.body['expiresAt']) - Math.floor(NOW / 1000) - 60);
    }
    expect(expiries).toEqual([TTL, TTL - Math.floor(TTL * 0.025), TTL - Math.floor(TTL * 0.0999)]);
  });

  it('narrows to the grant’s scopes, and refuses a request beyond them invalid_scope', async () => {
    const readOnly = () => issued({ scopes: ['read'] });
    const narrowed = await keyRequest(server(readOnly).oauth);
    expect(await narrowed.json()).toMatchObject({ scope: 'wbs:read' });
    const beyond = await keyRequest(server(readOnly).oauth, { scope: 'wbs:write' });
    expect(beyond.status).toBe(400);
    expect(await beyond.json()).toEqual({ error: 'invalid_scope' });
  });

  it('refuses a grant that leaves no lifetime after the 60 s margin', async () => {
    const short = () => issued({ expiresAt: Math.floor(NOW / 1000) + 60 });
    expect((await keyRequest(server(short).oauth)).status).toBe(401);
    expect((await bearerRequest(server(short).oauth)).status).toBe(400);
  });
});

describe('be-01’s answers', () => {
  const refusal = (status: number, body: unknown) => () => Response.json(body, { status });

  it('maps unknown_identity and not_activated to invalid_client for a key, invalid_grant for an assertion', async () => {
    for (const answer of [
      refusal(401, { error: 'unknown_identity' }),
      refusal(409, { error: 'not_activated' }),
    ]) {
      const { oauth, upstreamCalls } = server(answer);
      const key = await keyRequest(oauth);
      expect(key.status).toBe(401);
      expect(key.headers.get('www-authenticate')).toBe('Basic realm="wbs-mcp"');
      expect(await key.json()).toEqual({ error: 'invalid_client' });
      const bearer = await bearerRequest(oauth);
      expect(bearer.status).toBe(400);
      expect(await bearer.json()).toEqual({ error: 'invalid_grant' });
      expect(upstreamCalls()).toBe(0);
    }
  });

  it('maps an assertion’s invalid_token to invalid_grant, and an unsupported typ naming it', async () => {
    const invalid = server(refusal(401, { error: 'invalid_token' }));
    expect(await (await bearerRequest(invalid.oauth)).json()).toEqual({ error: 'invalid_grant' });
    const jag = server(refusal(401, { error: 'unsupported_assertion_type', typ: 'x+jwt' }));
    const answer = await bearerRequest(jag.oauth);
    expect(answer.status).toBe(400);
    const body = (await answer.json()) as { error: string; error_description: string };
    expect(body.error).toBe('invalid_grant');
    expect(body.error_description).toContain('x+jwt');
  });

  it('maps a secret-shaped run’s invalid_body to invalid_request', async () => {
    const { oauth } = server(refusal(400, { error: 'invalid_body' }));
    const answer = await keyRequest(oauth, { wbs_run: 'a'.repeat(64) });
    expect(answer.status).toBe(400);
    expect(await answer.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('answers 503 temporarily_unavailable when be-01 fails or cannot be reached', async () => {
    for (const answer of [
      refusal(500, { error: 'internal' }),
      () => Promise.reject(Object.assign(new TypeError('fetch failed'), { code: 'ECONNREFUSED' })),
    ]) {
      const response = await keyRequest(server(answer).oauth);
      expect(response.status).toBe(503);
      expect(response.headers.get('retry-after')).toBe('5');
      expect(await response.json()).toEqual({ error: 'temporarily_unavailable' });
    }
  });

  it('answers a be-01 fault 502 server_error and reports it, never a refusal', async () => {
    const requested = Math.floor(NOW / 1000) + TTL + 60;
    const cases: [
      () => Response | Promise<Response>,
      (oauth: McpOAuthServer) => Promise<Response>,
    ][] = [
      [refusal(401, { error: 'internal_unauthorized' }), (oauth) => keyRequest(oauth)],
      [refusal(401, { error: 'invalid_token' }), (oauth) => keyRequest(oauth)],
      [
        refusal(401, { error: 'unsupported_assertion_type', typ: 'x' }),
        (oauth) => keyRequest(oauth),
      ],
      // An assertion's typ refusal is a 401 with the typ, nothing else.
      [
        refusal(403, { error: 'unsupported_assertion_type', typ: 'x' }),
        (oauth) => bearerRequest(oauth),
      ],
      [refusal(401, { error: 'unsupported_assertion_type' }), (oauth) => bearerRequest(oauth)],
      [refusal(400, { error: 'invalid_body' }), (oauth) => keyRequest(oauth)],
      [refusal(403, { error: 'forbidden' }), (oauth) => bearerRequest(oauth)],
      [() => issued({ credentialId: crypto.randomUUID() }), (oauth) => keyRequest(oauth)],
      [() => issued({ scopes: ['admin'] }), (oauth) => keyRequest(oauth)],
      [() => issued({ scopes: ['admin'] }), (oauth) => bearerRequest(oauth)],
      [() => new Response('not json', { status: 200 }), (oauth) => keyRequest(oauth)],
      // be-01 only lowers the lifetime asked for, and signs the run it was sent.
      [() => issued({ expiresAt: requested + 1 }), (oauth) => keyRequest(oauth)],
      [() => issued({ runId: 'other-run' }), (oauth) => keyRequest(oauth, { wbs_run: 'run-1' })],
      [() => issued({ runId: 'other-run' }), (oauth) => keyRequest(oauth)],
      // A TypeError without a system error code is no network failure.
      [() => Promise.reject(new TypeError('cannot build')), (oauth) => keyRequest(oauth)],
    ];
    for (const [answer, ask] of cases) {
      const { oauth, faults } = server(answer);
      const response = await ask(oauth);
      expect(response.status).toBe(502);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ error: 'server_error' });
      expect(faults).toHaveLength(1);
      expect(faults[0]).toBeInstanceOf(MachineGrantDefect);
    }
  });

  it('answers 502 for a secret fetch cannot carry in a header, reporting no value of it', async () => {
    const secret = `${SECRET}\nnext`;
    const faults: MachineGrantDefect[] = [];
    const sent: unknown[] = [];
    const real = new McpOAuthServer(
      CONFIG,
      {
        authorizationUrl: () => Promise.reject(new Error('unused')),
        exchange: () => Promise.reject(new Error('unused')),
        refresh: () => Promise.reject(new Error('unused')),
        revoke: () => Promise.resolve(),
      },
      {
        now: () => NOW,
        machineGrants: {
          client: machineGrantClient(
            { ...CONFIG, MCP_BE_INTERNAL_SECRET: secret },
            (input, init) => {
              sent.push(input);
              return fetch(input, init);
            },
          ),
          secret,
          tokenTtlSeconds: TTL,
          limit: NO_MACHINE_LIMITS,
          reportFault: (fault) => faults.push(fault),
        },
      },
    );
    const response = await keyRequest(real);
    // fetch was asked, and refused to build the request.
    expect(sent).toHaveLength(1);
    expect(response.status).toBe(502);
    expect(faults).toHaveLength(1);
    expect(faults[0]?.message ?? '').not.toContain(SECRET);
  });

  it('refuses an assertion grant naming another credential than the client_id', async () => {
    const { oauth } = server(() => issued());
    const answer = await bearerRequest(oauth, { client_id: crypto.randomUUID() });
    expect(answer.status).toBe(400);
    expect(await answer.json()).toEqual({ error: 'invalid_grant' });
  });
});

describe('redirects', () => {
  it('never follows a redirect, so the key and the secret stay with be-01', async () => {
    const seen: Headers[] = [];
    const elsewhere = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: (request) => {
        seen.push(request.headers);
        return issued();
      },
    });
    const redirecting = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: () =>
        new Response(null, {
          status: 307,
          headers: { location: `http://127.0.0.1:${String(elsewhere.port)}/stolen` },
        }),
    });
    try {
      const client = machineGrantClient({
        ...CONFIG,
        WBS_API_URL: `http://127.0.0.1:${String(redirecting.port)}`,
      });
      const answer = await client
        .issue({
          issuer: OAUTH,
          credential: { kind: 'api_key', key: new Concealed(KEY) },
          expiresAt: Math.floor(NOW / 1000) + TTL,
          run: null,
        })
        .then(
          () => 'answered',
          (cause: unknown) => (cause instanceof MachineGrantDefect ? 'defect' : String(cause)),
        );
      expect(seen.map((headers) => headers.get(MCP_INTERNAL_SECRET_HEADER))).toEqual([]);
      expect(answer).toBe('defect');
    } finally {
      await redirecting.stop(true);
      await elsewhere.stop(true);
    }
  });
});

describe('the endpoint around the grants', () => {
  it('answers 429 invalid_request with Retry-After when the limit refuses, asking nobody', async () => {
    const { oauth, be } = server(() => issued(), {
      limit: {
        ...NO_MACHINE_LIMITS,
        reserveIssuance: () => ({ kind: 'limited', retryAfterSeconds: 7 }),
      },
    });
    const answer = await keyRequest(oauth);
    expect(answer.status).toBe(429);
    expect(answer.headers.get('retry-after')).toBe('7');
    expect(await answer.json()).toEqual({
      error: 'invalid_request',
      error_description: 'rate_limited',
    });
    expect(be.sent).toHaveLength(0);
  });

  it('answers unsupported_grant_type in gateway mode, even with the settings', async () => {
    const { oauth, be } = server(() => issued(), {
      config: { ...CONFIG, MCP_AUTH_MODE: 'gateway' },
    });
    const answer = await keyRequest(oauth);
    expect(answer.status).toBe(400);
    expect(await answer.json()).toEqual({ error: 'unsupported_grant_type' });
    expect(be.sent).toHaveLength(0);
  });

  it('composes machine grants from the environment in standalone mode only', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-machine-env-'));
    try {
      const env = {
        MCP_SIGNING_KEY_CURRENT: generateKeyPairSync('rsa', { modulusLength: 2048 })
          .privateKey.export({ format: 'der', type: 'pkcs8' })
          .toString('base64'),
        MCP_STORE_KEY_CURRENT: randomBytes(32).toString('base64'),
      };
      const reached: string[] = [];
      const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
        const request = new Request(input, init);
        reached.push(request.url);
        // The real clock runs here: grant exactly the lifetime asked for.
        const { expiresAt } = (await request.json()) as { expiresAt: number };
        return issued({ expiresAt });
      };
      const ask = async (config: McpConfig, store: string) => {
        const oauth = mcpOAuthFromEnv(
          config,
          { ...env, MCP_STORE_PATH: join(dir, store) },
          undefined,
          fetchImpl,
          () => undefined,
        );
        return await keyRequest(oauth);
      };
      const gateway = await ask({ ...CONFIG, MCP_AUTH_MODE: 'gateway' }, 'gateway.sqlite');
      expect(await gateway.json()).toEqual({ error: 'unsupported_grant_type' });
      expect(reached).toHaveLength(0);
      const standalone = await ask(CONFIG, 'standalone.sqlite');
      expect(standalone.status).toBe(200);
      expect(reached).toEqual([`${BE}/internal/mcp/machine-grants`]);
      expect(() =>
        mcpOAuthFromEnv(CONFIG, { ...env, MCP_STORE_PATH: join(dir, 'none.sqlite') }),
      ).toThrow('no fault reporter');
      // Gateway mode composes no machine grants at all, so only organization authority (which
      // the secret composes in either mode, task 3.7) asks for the reporter there.
      expect(() =>
        mcpOAuthFromEnv(
          { ...CONFIG, MCP_AUTH_MODE: 'gateway' },
          { ...env, MCP_STORE_PATH: join(dir, 'gateway-none.sqlite') },
        ),
      ).toThrow('organization authority is composed but no fault reporter');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never hands a machine token to the upstream verifier', async () => {
    const { oauth, upstreamCalls } = server(() => issued());
    const body = (await (await keyRequest(oauth)).json()) as { access_token: string };
    const refused = (attempt: Promise<unknown>) =>
      attempt.then(
        () => 'admitted',
        () => 'refused',
      );
    // Admitted as a machine (section 3), which has no session.
    expect(await refused(oauth.verify(body.access_token))).toBe('admitted');
    expect(await refused(oauth.callerSessionFor(body.access_token))).toBe('refused');
    // One that fails local verification is refused here, never verified upstream.
    const [header, payload] = body.access_token.split('.');
    const forged = `${header}.${payload}.${'A'.repeat(342)}`;
    expect(await refused(oauth.verify(forged))).toBe('refused');
    expect(await refused(oauth.admitCaller(forged))).toBe('refused');
    expect(upstreamCalls()).toBe(0);
  });

  it('answers unsupported_grant_type without the machine grant settings', async () => {
    const oauth = new McpOAuthServer(
      { MCP_PUBLIC_URL: MCP_URL, MCP_TRUSTED_PROXY_HOPS: 1 },
      {
        authorizationUrl: () => Promise.reject(new Error('unused')),
        exchange: () => Promise.reject(new Error('unused')),
        refresh: () => Promise.reject(new Error('unused')),
        revoke: () => Promise.resolve(),
      },
    );
    for (const grant of [CLIENT_CREDENTIALS_GRANT, JWT_BEARER_GRANT]) {
      const answer = await token(oauth, { grant_type: grant }, basic);
      expect(answer.status).toBe(400);
      expect(await answer.json()).toEqual({ error: 'unsupported_grant_type' });
    }
  });

  it('records the grant type, and nothing else of the request, as route evidence', async () => {
    const { oauth, evidence } = server(() => issued());
    await keyRequest(oauth);
    await bearerRequest(oauth);
    expect(evidence).toEqual([
      {
        method: 'POST',
        path: '/mcp/oauth/token',
        status: 200,
        grant_type: CLIENT_CREDENTIALS_GRANT,
      },
      { method: 'POST', path: '/mcp/oauth/token', status: 200, grant_type: JWT_BEARER_GRANT },
    ]);
  });
});

describe('registration', () => {
  async function register(oauth: McpOAuthServer, grantTypes?: readonly string[]) {
    const response = await oauth.response(
      new Request(`${OAUTH}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          redirect_uris: ['http://127.0.0.1:33418/callback'],
          token_endpoint_auth_method: 'none',
          ...(grantTypes === undefined ? {} : { grant_types: grantTypes }),
        }),
      }),
    );
    if (response === undefined) throw new Error('not a registration route');
    return response;
  }

  it('refuses a client that asks for a machine grant', async () => {
    for (const grants of [[CLIENT_CREDENTIALS_GRANT], ['authorization_code', JWT_BEARER_GRANT]]) {
      const response = await register(server(() => issued()).oauth, grants);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_client_metadata' });
    }
  });

  it('still registers a consent client', async () => {
    expect((await register(server(() => issued()).oauth, ['authorization_code'])).status).toBe(201);
    expect((await register(server(() => issued()).oauth)).status).toBe(201);
  });
});

describe('metadata and configuration', () => {
  const metadataOf = async (config: McpConfig) =>
    (await oauthMetadataResponse(
      new URL('https://wbs.example/.well-known/oauth-authorization-server/mcp/oauth'),
      config,
    )?.json()) as Record<string, unknown>;

  it('advertises both grants and the secret methods, never private_key_jwt', async () => {
    const metadata = await metadataOf(CONFIG);
    expect(metadata['grant_types_supported']).toEqual([
      'authorization_code',
      'refresh_token',
      CLIENT_CREDENTIALS_GRANT,
      JWT_BEARER_GRANT,
    ]);
    expect(metadata['token_endpoint_auth_methods_supported']).toEqual([
      'none',
      'client_secret_basic',
      'client_secret_post',
    ]);
  });

  it('omits them without the secret and in gateway mode', async () => {
    const { MCP_BE_INTERNAL_SECRET: _omitted, ...withoutSecret } = CONFIG;
    for (const config of [withoutSecret, { ...CONFIG, MCP_AUTH_MODE: 'gateway' as const }]) {
      expect(offersMachineGrants(config)).toBe(false);
      const metadata = await metadataOf(config);
      expect(metadata['grant_types_supported']).toEqual(['authorization_code', 'refresh_token']);
      expect(metadata['token_endpoint_auth_methods_supported']).toEqual(['none']);
    }
  });

  it('reads MCP_MACHINE_TOKEN_TTL as 60 s to 24 h, 12 h when unset', () => {
    expect(machineTokenTtlOf({})).toBe(TTL);
    expect(machineTokenTtlOf({ MCP_MACHINE_TOKEN_TTL: '' })).toBe(TTL);
    expect(machineTokenTtlOf({ MCP_MACHINE_TOKEN_TTL: '60' })).toBe(60);
    expect(machineTokenTtlOf({ MCP_MACHINE_TOKEN_TTL: '86400' })).toBe(86_400);
    for (const value of ['59', '86401', '3600.5', '1e4', '-60', 'twelve hours'])
      expect(() => machineTokenTtlOf({ MCP_MACHINE_TOKEN_TTL: value })).toThrow(
        'MCP_MACHINE_TOKEN_TTL must be a whole number of seconds from 60 to 86400',
      );
  });

  it('refuses a short MCP_BE_INTERNAL_SECRET, naming it and not its value', () => {
    const env = {
      MCP_AUTH_MODE: 'standalone',
      WBS_API_URL: BE,
      MCP_PUBLIC_URL: MCP_URL,
      MCP_TRUSTED_PROXY_HOPS: '1',
      MCP_BE_INTERNAL_SECRET: 'short-secret',
    };
    expect(() => loadConfig(env)).toThrow('MCP_BE_INTERNAL_SECRET is set but invalid');
    expect(() => loadConfig(env)).not.toThrow('short-secret');
  });
});
