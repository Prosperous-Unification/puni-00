import { createHash, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { existsSync, mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BrowserOidcClient, JwtClaims } from '@wbs/auth';
import { describe, expect, it } from 'bun:test';

import type { McpConfig } from './config';
import { mcpHttpResponse } from './http';
import { InMemoryMcpOAuth, mcpOAuthFromEnv, type OAuthRouteEvidence } from './oauth';
import { McpSessionStore } from './session-store';

const CONFIG: McpConfig = {
  MCP_AUTH_MODE: 'standalone',
  MCP_PUBLIC_URL: 'https://dev.wbs.bulletpoints.club/mcp',
  WBS_API_URL: 'https://dev.wbs.bulletpoints.club',
};
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

function fixture(
  limits: {
    clientLimit?: number;
    clientSourceLimit?: number;
    clientTtlMs?: number;
    activeClientTtlMs?: number;
    grantLimit?: number;
    provenClientSourceLimit?: number;
    sessionLimit?: number;
    signingKeys?: { privateKey: KeyObject; publicKey: KeyObject; previousPublicKey?: KeyObject };
    store?: McpSessionStore;
    transactionLimit?: number;
    transactionLimitPerClient?: number;
    random?: () => string;
    authorizationUrl?: BrowserOidcClient['authorizationUrl'];
    exchange?: BrowserOidcClient['exchange'];
    verifyUpstream?: (token: string) => Promise<JwtClaims>;
    refresh?: BrowserOidcClient['refresh'];
    revoke?: BrowserOidcClient['revoke'];
    revocationFailure?: () => void;
  } = {},
) {
  const { authorizationUrl, exchange, refresh, verifyUpstream, revoke, ...oauthOptions } = limits;
  let now = 1_700_000_000_000;
  const values = Array.from({ length: 20 }, (_, index) => `random-${String(index + 1)}`);
  const authorizationCalls: unknown[] = [];
  const exchangeCalls: unknown[] = [];
  const routeEvidence: OAuthRouteEvidence[] = [];
  const provider: Pick<BrowserOidcClient, 'authorizationUrl' | 'exchange' | 'refresh' | 'revoke'> =
    {
      authorizationUrl: (input) => {
        authorizationCalls.push(input);
        return (
          authorizationUrl?.(input) ??
          Promise.resolve(new URL(`https://idp.example/authorize?state=${input.state}`))
        );
      },
      exchange: (request, checks) => {
        exchangeCalls.push({ request, checks });
        return (
          exchange?.(request, checks) ??
          Promise.resolve({ accessToken: 'upstream-okta-token', expiresIn: 300 })
        );
      },
      refresh:
        refresh ??
        (() => Promise.resolve({ accessToken: 'refreshed-upstream-token', expiresIn: 300 })),
      revoke: revoke ?? (() => Promise.resolve()),
    };
  return {
    authorizationCalls,
    exchangeCalls,
    routeEvidence,
    oauth: new InMemoryMcpOAuth(CONFIG, provider, {
      groupsClaim: 'wbs_groups',
      groupPrefix: 'dev',
      now: () => now,
      random: () => values.shift() ?? 'random-exhausted',
      verifyUpstream:
        verifyUpstream ??
        ((token) =>
          token === 'upstream-okta-token'
            ? Promise.resolve({
                iss: 'https://idp.example',
                sub: 'person-1',
                wbs_groups: ['dev:wbs:read', 'dev:wbs:write'],
              })
            : Promise.reject(new Error('not an upstream token'))),
      ...oauthOptions,
      routeEvidence: (evidence) => routeEvidence.push(evidence),
    }),
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

async function register(oauth: InMemoryMcpOAuth): Promise<string> {
  const response = await oauth.response(
    new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/register', {
      body: JSON.stringify({ redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
  );
  expect(response?.status).toBe(201);
  if (response === undefined) throw new Error('DCR endpoint did not handle the request');
  const body = (await response.json()) as { client_id: string };
  return body.client_id;
}

async function registrationResponse(
  oauth: InMemoryMcpOAuth,
  redirectUris: readonly string[],
  source = '203.0.113.1',
): Promise<Response> {
  const response = await oauth.response(
    new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/register', {
      body: JSON.stringify({ redirect_uris: redirectUris, token_endpoint_auth_method: 'none' }),
      headers: { 'content-type': 'application/json', 'x-forwarded-for': source },
      method: 'POST',
    }),
  );
  if (response === undefined) throw new Error('DCR endpoint did not handle the request');
  return response;
}

function authorizeUrl(clientId: string, redirectUri = CALLBACK): URL {
  const url = new URL('https://dev.wbs.bulletpoints.club/mcp/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: clientId,
    code_challenge: 'A'.repeat(43),
    code_challenge_method: 'S256',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'wbs:read wbs:write',
    state: 'claude-state',
  }).toString();
  return url;
}

function challengeOf(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** Applies this endpoint's single Set-Cookie exactly as a browser would. */
function browserCookie(previous: string | undefined, response: Response): string | undefined {
  const setCookie = response.headers.get('set-cookie');
  if (setCookie === null) return previous;
  const pair = setCookie.split(';', 1)[0];
  if (setCookie.includes('Max-Age=0')) return undefined;
  return pair;
}

function pendingMaps(oauth: InMemoryMcpOAuth): {
  contexts: Map<string, unknown>;
  records: Map<string, unknown>;
} {
  // Tests inspect the actual in-process backing maps to prove exact retention.
  const pending = (
    oauth as unknown as {
      pendingAuthorizations: {
        contexts: Map<string, unknown>;
        transactions: { records: Map<string, unknown> };
      };
    }
  ).pendingAuthorizations;
  return { contexts: pending.contexts, records: pending.transactions.records };
}

function transactionCount(oauth: InMemoryMcpOAuth): number {
  return pendingMaps(oauth).contexts.size;
}

function grantCount(oauth: InMemoryMcpOAuth): number {
  return (oauth as unknown as { grants: Map<string, unknown> }).grants.size;
}

async function completedAuthorization(
  oauth: InMemoryMcpOAuth,
  verifier: string,
  registeredClientId?: string,
): Promise<{ callback: Request; clientId: string; response: Response }> {
  const clientId = registeredClientId ?? (await register(oauth));
  const url = authorizeUrl(clientId);
  url.searchParams.set('code_challenge', challengeOf(verifier));
  const started = await oauth.response(new Request(url));
  const binding = started?.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
  const upstream = new URL(started?.headers.get('location') ?? 'https://invalid');
  const callback = new Request(
    `https://dev.wbs.bulletpoints.club/mcp/oauth/callback?code=upstream&state=${String(upstream.searchParams.get('state'))}`,
    { headers: { cookie: binding } },
  );
  const response = await oauth.response(callback);
  if (response === undefined) throw new Error('callback endpoint did not handle the request');
  return { callback, clientId, response };
}

async function authorizationCode(oauth: InMemoryMcpOAuth, verifier: string): Promise<string> {
  const { response } = await completedAuthorization(oauth, verifier);
  return (
    new URL(response.headers.get('location') ?? 'https://invalid').searchParams.get('code') ?? ''
  );
}

async function tokenResponse(
  oauth: InMemoryMcpOAuth,
  clientId: string,
  code: string,
  verifier: string,
): Promise<Response> {
  const response = await oauth.response(
    new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/token', {
      body: new URLSearchParams({
        client_id: clientId,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: CALLBACK,
      }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    }),
  );
  if (response === undefined) throw new Error('token endpoint did not handle the request');
  return response;
}

async function promoteClient(oauth: InMemoryMcpOAuth, source: string): Promise<string> {
  const registration = await registrationResponse(oauth, [CALLBACK], source);
  expect(registration.status).toBe(201);
  const clientId = ((await registration.json()) as { client_id: string }).client_id;
  const verifier = 'v'.repeat(43);
  const url = authorizeUrl(clientId);
  url.searchParams.set('code_challenge', challengeOf(verifier));
  const started = await oauth.response(new Request(url));
  const binding = started?.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
  const upstream = new URL(started?.headers.get('location') ?? 'https://invalid');
  const completed = await oauth.response(
    new Request(
      `https://dev.wbs.bulletpoints.club/mcp/oauth/callback?code=upstream&state=${String(upstream.searchParams.get('state'))}`,
      { headers: { cookie: binding } },
    ),
  );
  const code = new URL(completed?.headers.get('location') ?? 'https://invalid').searchParams.get(
    'code',
  );
  const token = await oauth.response(
    new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/token', {
      body: new URLSearchParams({
        client_id: clientId,
        code: code ?? '',
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: CALLBACK,
      }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    }),
  );
  expect(token?.status).toBe(200);
  return clientId;
}

describe('InMemoryMcpOAuth', () => {
  // Proof: serializing request bodies or query strings here exposes credentials;
  // these records retain only bounded grant classifications and the route path.
  it('records OAuth route evidence without request secrets', async () => {
    const { oauth, routeEvidence } = fixture();
    await oauth.response(
      new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/register?secret=query-secret', {
        body: JSON.stringify({
          grant_types: ['authorization_code', 'refresh_token', 'body-secret'],
          redirect_uris: [CALLBACK],
          token_endpoint_auth_method: 'none',
        }),
        headers: { authorization: 'Bearer header-secret', 'content-type': 'application/json' },
        method: 'POST',
      }),
    );
    await oauth.response(
      new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/token', {
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'token-secret' }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      }),
    );

    expect(routeEvidence).toEqual([
      {
        method: 'POST',
        path: '/mcp/oauth/register',
        registration_grant_types: ['authorization_code', 'refresh_token', 'other'],
        status: 201,
      },
      {
        grant_type: 'refresh_token',
        method: 'POST',
        path: '/mcp/oauth/token',
        status: 400,
      },
    ]);
    expect(JSON.stringify(routeEvidence)).not.toContain('secret');
  });

  // Break caught: accepting an arbitrary HTTPS callback lets an attacker
  // register their origin and exfiltrate a signed-in user's authorization code.
  it('limits dynamic registration to the real connector and loopback clients', async () => {
    const { oauth } = fixture();

    expect((await registrationResponse(oauth, ['https://evil.example/callback'])).status).toBe(400);
    expect(
      (await registrationResponse(oauth, ['https://claude.ai/api/mcp/auth_callback'])).status,
    ).toBe(201);
    expect(
      (await registrationResponse(oauth, ['http://127.0.0.1:6274/oauth/callback'])).status,
    ).toBe(201);
  });

  // Proof: omitting cleanup before the capacity check leaves an expired client
  // occupying the only slot and rejects a replacement connector forever.
  it('expires dynamic clients and frees their capacity', async () => {
    const expiring = fixture({ clientLimit: 1, clientTtlMs: 1_000 });
    const clientId = await register(expiring.oauth);
    expect((await registrationResponse(expiring.oauth, [CALLBACK])).status).toBe(429);
    expiring.advance(1_001);
    expect((await registrationResponse(expiring.oauth, [CALLBACK])).status).toBe(201);
    expect((await expiring.oauth.response(new Request(authorizeUrl(clientId))))?.status).toBe(400);
  });

  // Proof: a 24-hour anonymous registration lifetime lets an attacker keep all
  // slots occupied by refreshing the registry less than once per day.
  it('discloses a short expiry for unproven dynamic clients', async () => {
    const { advance, oauth } = fixture({ clientLimit: 1 });
    const response = await registrationResponse(oauth, [CALLBACK]);
    const body = (await response.json()) as {
      client_id_expires_at: number;
      client_id_issued_at: number;
    };

    expect(body.client_id_expires_at - body.client_id_issued_at).toBe(600);
    advance(600_001);
    expect((await registrationResponse(oauth, [CALLBACK])).status).toBe(201);
  });

  // Proof: leaving every registration short-lived makes a legitimate connector
  // lose its client id soon after completing the authenticated token exchange.
  it('promotes a client only after a successful token exchange', async () => {
    const { advance, oauth } = fixture({ clientLimit: 1 });
    const verifier = 'v'.repeat(43);
    const code = await authorizationCode(oauth, verifier);
    const response = await oauth.response(
      new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/token', {
        body: new URLSearchParams({
          client_id: 'random-1',
          code,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: CALLBACK,
        }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      }),
    );

    expect(response?.status).toBe(200);
    advance(600_001);
    expect((await registrationResponse(oauth, [CALLBACK])).status).toBe(429);
    expect((await oauth.response(new Request(authorizeUrl('random-1'))))?.status).toBe(302);
  });

  // Proof: leaving the client on its original DCR expiry lets unrelated
  // cleanup delete it after Auth0 has issued a valid local authorization code.
  it('keeps an unproven client alive through its active authorization flow', async () => {
    const { advance, oauth } = fixture({ clientLimit: 3 });
    const verifier = 'v'.repeat(43);
    const clientId = await register(oauth);
    advance(400_000);
    const url = authorizeUrl(clientId);
    url.searchParams.set('code_challenge', challengeOf(verifier));
    const started = await oauth.response(new Request(url));
    const binding = started?.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
    const upstream = new URL(started?.headers.get('location') ?? 'https://invalid');
    advance(290_000);
    const completed = await oauth.response(
      new Request(
        `https://dev.wbs.bulletpoints.club/mcp/oauth/callback?code=upstream&state=${String(upstream.searchParams.get('state'))}`,
        { headers: { cookie: binding } },
      ),
    );
    const code = new URL(completed?.headers.get('location') ?? 'https://invalid').searchParams.get(
      'code',
    );
    expect((await registrationResponse(oauth, [CALLBACK], '203.0.113.2')).status).toBe(201);

    const token = await oauth.response(
      new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/token', {
        body: new URLSearchParams({
          client_id: clientId,
          code: code ?? '',
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: CALLBACK,
        }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      }),
    );
    expect(token?.status).toBe(200);
  });

  // Proof: extending expiry from the current time on every authorize lets a
  // registered but unauthenticated client renew itself forever without login.
  it('caps repeated authorization extensions at an absolute unproven lifetime', async () => {
    const { advance, oauth } = fixture();
    const clientId = await register(oauth);

    advance(400_000);
    expect((await oauth.response(new Request(authorizeUrl(clientId))))?.status).toBe(302);
    advance(200_000);
    expect((await oauth.response(new Request(authorizeUrl(clientId))))?.status).toBe(302);
    advance(600_001);
    expect((await oauth.response(new Request(authorizeUrl(clientId))))?.status).toBe(400);
  });

  // Proof: starting after the remaining absolute lifetime falls below the
  // browser-plus-code window mints a grant whose client expires before token.
  it('refuses an unproven authorization too late to complete token exchange', async () => {
    const { advance, oauth } = fixture();
    const clientId = await register(oauth);

    advance(400_000);
    expect((await oauth.response(new Request(authorizeUrl(clientId))))?.status).toBe(302);
    advance(200_001);
    expect((await oauth.response(new Request(authorizeUrl(clientId))))?.status).toBe(429);
  });

  // Proof: a global-only cap lets one source refill all expired anonymous
  // registrations forever and prevent a new connector from registering.
  it('partitions anonymous registration capacity by forwarding source', async () => {
    const { oauth } = fixture({ clientLimit: 2, clientSourceLimit: 1 });

    expect((await registrationResponse(oauth, [CALLBACK], '203.0.113.1')).status).toBe(201);
    expect((await registrationResponse(oauth, [CALLBACK], '203.0.113.1')).status).toBe(429);
    expect((await registrationResponse(oauth, [CALLBACK], '203.0.113.2')).status).toBe(201);
  });

  // Proof: counting promoted clients in the source bucket makes shared
  // connector egress hit the anonymous cap for up to 24 hours.
  it('removes a proven client from its anonymous source partition', async () => {
    const { oauth } = fixture({ clientLimit: 2, clientSourceLimit: 1 });
    const verifier = 'v'.repeat(43);
    const code = await authorizationCode(oauth, verifier);
    const token = await oauth.response(
      new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/token', {
        body: new URLSearchParams({
          client_id: 'random-1',
          code,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: CALLBACK,
        }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      }),
    );

    expect(token?.status).toBe(200);
    expect((await registrationResponse(oauth, [CALLBACK], '')).status).toBe(201);
  });

  // Proof: leaving promoted clients under only the global cap lets one source
  // complete scripted logins until every registration slot is unavailable.
  it('partitions proven registration capacity by forwarding source', async () => {
    const { oauth } = fixture({
      clientLimit: 4,
      clientSourceLimit: 1,
      provenClientSourceLimit: 2,
    });

    await promoteClient(oauth, '203.0.113.1');
    await promoteClient(oauth, '203.0.113.1');

    expect((await registrationResponse(oauth, [CALLBACK], '203.0.113.1')).status).toBe(429);
    expect((await registrationResponse(oauth, [CALLBACK], '203.0.113.2')).status).toBe(201);
  });

  // Proof: checking the proven-source cap only during registration admits two
  // anonymous clients, then lets both promote and exceed the authenticated cap.
  it('reserves proven-source capacity before consuming a token grant', async () => {
    const { advance, oauth } = fixture({
      activeClientTtlMs: 1_000,
      clientLimit: 3,
      clientSourceLimit: 2,
      provenClientSourceLimit: 1,
    });
    const verifier = 'v'.repeat(43);
    const firstRegistration = await registrationResponse(oauth, [CALLBACK], '203.0.113.1');
    const secondRegistration = await registrationResponse(oauth, [CALLBACK], '203.0.113.1');
    const firstClientId = ((await firstRegistration.json()) as { client_id: string }).client_id;
    const secondClientId = ((await secondRegistration.json()) as { client_id: string }).client_id;
    const firstAuthorization = await completedAuthorization(oauth, verifier, firstClientId);
    const secondAuthorization = await completedAuthorization(oauth, verifier, secondClientId);
    const firstCode = new URL(
      firstAuthorization.response.headers.get('location') ?? '',
    ).searchParams.get('code');
    const secondCode = new URL(
      secondAuthorization.response.headers.get('location') ?? '',
    ).searchParams.get('code');

    expect((await tokenResponse(oauth, firstClientId, firstCode ?? '', verifier)).status).toBe(200);
    const refused = await tokenResponse(oauth, secondClientId, secondCode ?? '', verifier);
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: 'temporarily_unavailable' });

    advance(1_001);
    expect((await tokenResponse(oauth, secondClientId, secondCode ?? '', verifier)).status).toBe(
      200,
    );
  });

  // Proof: checking only the already-proven count lets concurrent signing
  // requests both observe a free slot and promote past the source cap.
  it('reserves proven-source capacity across concurrent token signing', async () => {
    const { oauth } = fixture({
      clientLimit: 3,
      clientSourceLimit: 2,
      provenClientSourceLimit: 1,
    });
    const verifier = 'v'.repeat(43);
    const firstRegistration = await registrationResponse(oauth, [CALLBACK], '203.0.113.1');
    const secondRegistration = await registrationResponse(oauth, [CALLBACK], '203.0.113.1');
    const firstClientId = ((await firstRegistration.json()) as { client_id: string }).client_id;
    const secondClientId = ((await secondRegistration.json()) as { client_id: string }).client_id;
    const firstAuthorization = await completedAuthorization(oauth, verifier, firstClientId);
    const secondAuthorization = await completedAuthorization(oauth, verifier, secondClientId);
    const firstCode = new URL(
      firstAuthorization.response.headers.get('location') ?? '',
    ).searchParams.get('code');
    const secondCode = new URL(
      secondAuthorization.response.headers.get('location') ?? '',
    ).searchParams.get('code');

    const responses = await Promise.all([
      tokenResponse(oauth, firstClientId, firstCode ?? '', verifier),
      tokenResponse(oauth, secondClientId, secondCode ?? '', verifier),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 429]);
  });

  // Proof: replacing capacity refusal with FIFO eviction makes the first
  // registered connector fail authorization after an anonymous registration.
  it('refuses registration at capacity without evicting a live connector', async () => {
    const { oauth } = fixture({ clientLimit: 1 });
    const first = await register(oauth);

    expect((await registrationResponse(oauth, [CALLBACK])).status).toBe(429);
    expect((await oauth.response(new Request(authorizeUrl(first))))?.status).toBe(302);
  });

  // Proof: evicting the oldest transaction lets anonymous authorize traffic
  // cancel a signed-in connector's in-flight callback.
  it('refuses authorization at capacity without evicting an in-flight login', async () => {
    const { exchangeCalls, oauth } = fixture({ transactionLimit: 1 });
    const clientId = await register(oauth);
    const first = await oauth.response(new Request(authorizeUrl(clientId)));
    const firstState = new URL(
      first?.headers.get('location') ?? 'https://invalid',
    ).searchParams.get('state');
    const firstCookie = first?.headers.get('set-cookie')?.split(';', 1)[0] ?? '';

    const overflow = await oauth.response(new Request(authorizeUrl(clientId)));
    const callback = await oauth.response(
      new Request(
        `https://dev.wbs.bulletpoints.club/mcp/oauth/callback?code=upstream&state=${String(firstState)}`,
        { headers: { cookie: firstCookie } },
      ),
    );
    expect(callback?.status).toBe(302);
    expect(exchangeCalls).toHaveLength(1);
    expect(overflow?.status).toBe(429);
  });

  // Proof: a global-only transaction cap lets one registered client deny
  // authorization to every other connector for the full transaction TTL.
  it('partitions pending authorization capacity by client', async () => {
    const { oauth } = fixture({ transactionLimit: 2, transactionLimitPerClient: 1 });
    const first = await register(oauth);
    const second = await register(oauth);

    expect((await oauth.response(new Request(authorizeUrl(first))))?.status).toBe(302);
    expect((await oauth.response(new Request(authorizeUrl(first))))?.status).toBe(429);
    expect((await oauth.response(new Request(authorizeUrl(second))))?.status).toBe(302);
  });

  // Proof: disabling the wrapper's shared expiry cleanup makes the next real
  // authorization return 429 instead of 302 at the deadline.
  it('frees global and per-client pending capacity at the shared expiry', async () => {
    const { advance, oauth } = fixture({ transactionLimit: 2, transactionLimitPerClient: 1 });
    const first = await register(oauth);
    const second = await register(oauth);

    expect((await oauth.response(new Request(authorizeUrl(first))))?.status).toBe(302);
    expect((await oauth.response(new Request(authorizeUrl(first))))?.status).toBe(429);
    expect((await oauth.response(new Request(authorizeUrl(second))))?.status).toBe(302);
    advance(300_000);
    expect((await oauth.response(new Request(authorizeUrl(first))))?.status).toBe(302);
    expect(pendingMaps(oauth).contexts.size).toBe(1);
    expect(pendingMaps(oauth).records.size).toBe(1);
  });

  // Proof: allowing callbacks to append authorization grants without a bound
  // lets completed Auth0 flows retain arbitrary upstream access tokens.
  it('refuses a callback at grant capacity without evicting a live grant', async () => {
    const { exchangeCalls, oauth } = fixture({ grantLimit: 1 });
    const verifier = 'v'.repeat(43);
    const firstCode = await authorizationCode(oauth, verifier);
    const second = await completedAuthorization(oauth, verifier);

    expect(firstCode).toBe('random-6');
    expect(second.response.status).toBe(429);
    expect(exchangeCalls).toHaveLength(2);
    expect((await oauth.response(second.callback))?.status).toBe(400);
    expect(exchangeCalls).toHaveLength(2);
    expect(await second.response.json()).toEqual({ error: 'temporarily_unavailable' });
    expect((await tokenResponse(oauth, 'random-1', firstCode, verifier)).status).toBe(200);
  });

  // Proof: allowing token exchanges to append sessions without a bound keeps
  // arbitrary upstream access tokens live until every local token expires.
  it('refuses token exchange at session capacity and preserves the retryable grant', async () => {
    const { oauth } = fixture({ sessionLimit: 1 });
    const verifier = 'v'.repeat(43);
    const firstCode = await authorizationCode(oauth, verifier);
    const secondCode = await authorizationCode(oauth, verifier);
    const first = await tokenResponse(oauth, 'random-1', firstCode, verifier);
    const firstToken = ((await first.json()) as { access_token: string }).access_token;

    expect((await tokenResponse(oauth, 'random-7', secondCode, verifier)).status).toBe(429);
    expect(await oauth.verify(firstToken)).toMatchObject({ sub: 'person-1' });
    await oauth.response(
      new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/revoke', {
        body: new URLSearchParams({ token: firstToken }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      }),
    );
    expect(oauth.verify(firstToken)).rejects.toThrow(/not an upstream token/);
    const store = oauth as unknown as { store: { sessionCount(now: number): number } };
    expect(store.store.sessionCount(1_700_000_000_000)).toBe(0);
    expect((await tokenResponse(oauth, 'random-7', secondCode, verifier)).status).toBe(200);
  });

  // Proof: removing the byte and multiplicity checks retains attacker-chosen
  // query material in a pending transaction.
  it('rejects oversized or repeated authorization query fields', async () => {
    const { oauth } = fixture();
    const clientId = await register(oauth);
    const oversizedState = authorizeUrl(clientId);
    oversizedState.searchParams.set('state', 'Д'.repeat(257));
    const repeatedScope = authorizeUrl(clientId);
    repeatedScope.searchParams.append('scope', 'wbs:read');

    expect((await oauth.response(new Request(oversizedState)))?.status).toBe(400);
    expect((await oauth.response(new Request(repeatedScope)))?.status).toBe(400);
  });

  // Proof: allowing unbounded redirect metadata retains arbitrary query bytes
  // for every dynamic client and broadens the exact Claude callback boundary.
  it('bounds stored redirects and rejects query-bearing Claude callbacks', async () => {
    const { oauth } = fixture();
    const tooMany = Array.from(
      { length: 11 },
      (_, port) => `http://127.0.0.1:${String(6000 + port)}/oauth/callback`,
    );

    expect((await registrationResponse(oauth, tooMany)).status).toBe(400);
    expect(
      (await registrationResponse(oauth, [`${CALLBACK}?retained=${'x'.repeat(20)}`])).status,
    ).toBe(400);
  });

  // Proof: weakening exact membership to same-origin lets this unregistered
  // path become an authorization-code exfiltration redirect.
  it('registers a public client and refuses an unregistered redirect URI', async () => {
    const { oauth } = fixture();
    const clientId = await register(oauth);
    const rejected = await oauth.response(
      new Request(authorizeUrl(clientId, 'https://claude.ai/steal')),
    );

    expect(rejected?.status).toBe(400);
    expect(await rejected?.json()).toEqual({ error: 'invalid_request' });
  });

  // Proof: replacing digestOidcBinding with identity made both retained keys
  // equal `random-2` instead of this independently fixed SHA-256 value.
  // Spreading browserBinding exposes it in the shared record's serialized value.
  it('retains no raw browser binding in pending authorization keys or values', async () => {
    const { oauth } = fixture();
    const clientId = await register(oauth);
    const started = await oauth.response(new Request(authorizeUrl(clientId)));
    const browserBinding =
      started?.headers.get('set-cookie')?.split(';', 1)[0]?.split('=', 2)[1] ?? '';
    const maps = pendingMaps(oauth);

    expect(browserBinding).toBe('random-2');
    const expectedDigest = 'a2d6d4faf36f2e1df73e7f326651ba0507442dc4b47698f700157c8460b4584d';
    expect([...maps.contexts.keys()]).toEqual([expectedDigest]);
    expect([...maps.records.keys()]).toEqual([expectedDigest]);
    expect([...maps.contexts.keys(), ...maps.records.keys()]).not.toContain(browserBinding);
    expect(JSON.stringify([...maps.contexts.values(), ...maps.records.values()])).not.toContain(
      browserBinding,
    );
  });

  // Proof: removing the generated-binding collision guard lets the second
  // authorization resolve instead of throwing before it can replace the first.
  it('duplicate live binding cannot overwrite an existing authorization', async () => {
    const values = [
      'client-id',
      'same-binding',
      'upstream-1',
      'nonce-1',
      'verifier-1',
      'same-binding',
      'upstream-2',
      'nonce-2',
      'verifier-2',
      'grant-1',
    ];
    const { exchangeCalls, oauth } = fixture({ random: () => values.shift() ?? 'exhausted' });
    const clientId = await register(oauth);
    const first = await oauth.response(new Request(authorizeUrl(clientId)));
    const cookie = first?.headers.get('set-cookie')?.split(';', 1)[0] ?? '';

    let thrown: unknown;
    try {
      await oauth.response(new Request(authorizeUrl(clientId)));
    } catch (failure) {
      thrown = failure;
    }
    const completed = await oauth.response(
      new Request(
        'https://dev.wbs.bulletpoints.club/mcp/oauth/callback?code=upstream&state=upstream-1',
        { headers: { cookie } },
      ),
    );
    expect(completed?.status).toBe(302);
    expect(
      new URL(completed?.headers.get('location') ?? 'https://invalid').searchParams.get('state'),
    ).toBe('claude-state');
    expect(exchangeCalls).toHaveLength(1);
    expect(thrown).toEqual(
      new Error('generated OIDC browser binding collided with a live authorization'),
    );
  });

  // Proof: returning `missing` for consumed proof without context leaves the
  // expected trusted-state error undefined, while exchange and grants stay zero.
  it('consumed proof with missing metadata throws before exchange', async () => {
    const { exchangeCalls, oauth } = fixture();
    const clientId = await register(oauth);
    const started = await oauth.response(new Request(authorizeUrl(clientId)));
    const cookie = started?.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
    const upstreamState = new URL(
      started?.headers.get('location') ?? 'https://invalid',
    ).searchParams.get('state');
    pendingMaps(oauth).contexts.clear();

    let thrown: unknown;
    try {
      await oauth.response(
        new Request(
          `https://dev.wbs.bulletpoints.club/mcp/oauth/callback?code=upstream&state=${String(upstreamState)}`,
          { headers: { cookie } },
        ),
      );
    } catch (failure) {
      thrown = failure;
    }
    expect(exchangeCalls).toHaveLength(0);
    expect(grantCount(oauth)).toBe(0);
    expect(thrown).toEqual(new Error('consumed OIDC proof has no authorization context'));
  });

  // Proof: deleting before state comparison or clearing the mismatch response
  // cookie makes the honest callback return 400 instead of 302 without exchange.
  it('wrong state preserves the honest MCP login and browser cookie', async () => {
    const { exchangeCalls, oauth } = fixture();
    const clientId = await register(oauth);
    const started = await oauth.response(new Request(authorizeUrl(clientId)));
    if (started === undefined) throw new Error('authorization endpoint did not handle the request');
    let heldCookie = browserCookie(undefined, started);
    const upstreamState = new URL(
      started.headers.get('location') ?? 'https://invalid',
    ).searchParams.get('state');
    const wrong = await oauth.response(
      new Request(
        'https://dev.wbs.bulletpoints.club/mcp/oauth/callback?code=forged&state=wrong-state',
        { headers: heldCookie === undefined ? undefined : { cookie: heldCookie } },
      ),
    );
    if (wrong === undefined) throw new Error('callback endpoint did not handle the request');

    expect(wrong.status).toBe(400);
    expect(exchangeCalls).toHaveLength(0);
    heldCookie = browserCookie(heldCookie, wrong);
    const honest = await oauth.response(
      new Request(
        `https://dev.wbs.bulletpoints.club/mcp/oauth/callback?code=upstream&state=${String(upstreamState)}`,
        { headers: heldCookie === undefined ? undefined : { cookie: heldCookie } },
      ),
    );

    expect(honest?.status).toBe(302);
    expect(exchangeCalls).toHaveLength(1);
    expect(wrong.headers.get('set-cookie')).toBeNull();
    expect(heldCookie).toBe('__Host-wbs_mcp_oauth=random-2');
  });

  // Proof: comparing the wrong state before expiry leaves one dead transaction
  // instead of removing it, so the exact retained-transaction assertion fails.
  it('expires before mismatch and clears the dead browser transaction', async () => {
    const { advance, exchangeCalls, oauth } = fixture({ transactionLimit: 1 });
    const clientId = await register(oauth);
    const started = await oauth.response(new Request(authorizeUrl(clientId)));
    if (started === undefined) throw new Error('authorization endpoint did not handle the request');
    let heldCookie = browserCookie(undefined, started);
    advance(300_000);
    const expired = await oauth.response(
      new Request(
        'https://dev.wbs.bulletpoints.club/mcp/oauth/callback?code=late&state=wrong-state',
        { headers: heldCookie === undefined ? undefined : { cookie: heldCookie } },
      ),
    );
    if (expired === undefined) throw new Error('callback endpoint did not handle the request');

    expect(expired.status).toBe(400);
    expect(exchangeCalls).toHaveLength(0);
    expect(transactionCount(oauth)).toBe(0);
    heldCookie = browserCookie(heldCookie, expired);
    expect(heldCookie).toBeUndefined();
  });

  // Proof: retaining the upstream proof makes replay reach the wrapper's
  // missing-context guard; sending downstream state to exchange changes its
  // check from random-3 to claude-state, and returning upstream state to the
  // connector changes its redirect from claude-state to random-3.
  it('binds PKCE to a one-use upstream browser round trip', async () => {
    const { authorizationCalls, exchangeCalls, oauth } = fixture();
    const clientId = await register(oauth);
    const started = await oauth.response(new Request(authorizeUrl(clientId)));
    const cookie = started?.headers.get('set-cookie')?.split(';', 1)[0];

    expect(started?.status).toBe(302);
    expect(started?.headers.get('location')).toBe('https://idp.example/authorize?state=random-3');
    expect(authorizationCalls).toEqual([
      {
        nonce: 'random-4',
        redirectUri: 'https://dev.wbs.bulletpoints.club/mcp/oauth/callback',
        state: 'random-3',
        verifier: 'random-5',
      },
    ]);

    const callback = new Request(
      'https://dev.wbs.bulletpoints.club/mcp/oauth/callback?code=upstream&state=random-3',
      { headers: { cookie: cookie ?? '' } },
    );
    const completed = await oauth.response(callback);
    const redirect = new URL(completed?.headers.get('location') ?? 'https://invalid');

    expect(completed?.status).toBe(302);
    expect(redirect.origin + redirect.pathname).toBe(CALLBACK);
    expect(redirect.searchParams.get('state')).toBe('claude-state');
    const code = redirect.searchParams.get('code');
    expect(code).toBe('random-6');
    expect(oauth.readGrant(code ?? '')).toMatchObject({
      clientId,
      codeChallenge: 'A'.repeat(43),
      redirectUri: CALLBACK,
      scope: 'wbs:read wbs:write',
      scopes: ['wbs:read', 'wbs:write'],
      upstreamAccessToken: 'upstream-okta-token',
    });
    expect(exchangeCalls).toHaveLength(1);
    const exchange = exchangeCalls[0] as {
      checks: { nonce: string; state: string; verifier: string };
      request: Request;
    };
    expect(exchange.checks).toEqual({
      nonce: 'random-4',
      state: 'random-3',
      verifier: 'random-5',
    });
    expect(new URL(exchange.request.url).searchParams.get('state')).toBe('random-3');
    const replay = await oauth.response(callback);
    expect(exchangeCalls).toHaveLength(1);
    expect(replay?.status).toBe(400);
    expect(completed?.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(transactionCount(oauth)).toBe(0);
  });

  // Break caught: forwarding the local MCP token or omitting its audience/JTI
  // makes this end-to-end trust trace fail before be-01 receives the Okta token.
  it('exchanges one authorization code for an audience-bound local token and retains the upstream token server-side', async () => {
    const { oauth } = fixture();
    const verifier = 'v'.repeat(43);
    const code = await authorizationCode(oauth, verifier);
    const clientId = 'random-1';
    const exchange = () =>
      oauth.response(
        new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/token', {
          body: new URLSearchParams({
            client_id: clientId,
            code,
            code_verifier: verifier,
            grant_type: 'authorization_code',
            redirect_uri: CALLBACK,
          }),
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          method: 'POST',
        }),
      );

    const response = await exchange();
    expect(response?.status).toBe(200);
    const body = (await response?.json()) as {
      access_token: string;
      expires_in: number;
      refresh_token: string;
      scope: string;
      token_type: string;
    };
    expect(body).toMatchObject({
      expires_in: 300,
      refresh_token: 'random-9',
      scope: 'wbs:read wbs:write',
      token_type: 'Bearer',
    });
    expect(oauth.verify(body.access_token)).resolves.toMatchObject({
      aud: 'https://dev.wbs.bulletpoints.club/mcp',
      iss: 'https://dev.wbs.bulletpoints.club/mcp/oauth',
      jti: 'random-8',
      sub: 'person-1',
    });
    expect(oauth.upstreamTokenFor(body.access_token)).resolves.toBe('upstream-okta-token');
    expect((await exchange())?.status).toBe(400);
  });

  it('uses a verified exp when the provider omits expiresIn and refuses when both are missing', async () => {
    const verifier = 'v'.repeat(43);
    const withExp = fixture({
      exchange: () => Promise.resolve({ accessToken: 'upstream-okta-token', expiresIn: 0 }),
      verifyUpstream: () =>
        Promise.resolve({
          exp: 1_700_000_600,
          iss: 'https://idp.example',
          sub: 'person-1',
          wbs_groups: ['dev:wbs:read'],
        }),
    }).oauth;
    const acceptedCode = await authorizationCode(withExp, verifier);
    expect((await tokenResponse(withExp, 'random-1', acceptedCode, verifier)).status).toBe(200);

    const withoutExpiry = fixture({
      exchange: () => Promise.resolve({ accessToken: 'upstream-okta-token', expiresIn: 0 }),
    }).oauth;
    const completed = await completedAuthorization(withoutExpiry, verifier);
    expect(completed.response.status).toBe(302);
    expect(
      new URL(completed.response.headers.get('location') ?? 'https://invalid').searchParams.get(
        'error',
      ),
    ).toBe('access_denied');
  });

  it('shares current signing keys between handlers and accepts the previous key during rotation', async () => {
    const oldKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const nextKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const store = new McpSessionStore(':memory:', [Buffer.alloc(32, 9)]);
    const first = fixture({ signingKeys: oldKeys, store }).oauth;
    const verifier = 'v'.repeat(43);
    const code = await authorizationCode(first, verifier);
    const issued = await tokenResponse(first, 'random-1', code, verifier);
    const accessToken = ((await issued.json()) as { access_token: string }).access_token;

    const sameKey = fixture({ signingKeys: oldKeys, store }).oauth;
    expect(sameKey.verify(accessToken)).resolves.toMatchObject({ sub: 'person-1' });
    const rotating = fixture({
      signingKeys: {
        privateKey: nextKeys.privateKey,
        publicKey: nextKeys.publicKey,
        previousPublicKey: oldKeys.publicKey,
      },
      store,
    }).oauth;
    expect(rotating.verify(accessToken)).resolves.toMatchObject({ sub: 'person-1' });
    store.close();
  });

  // Proof: replacing the reopened store below with a fresh in-memory store makes
  // the post-restart tool call return 401 and the refresh request return 400.
  it('keeps HTTP tool and refresh requests live across a handler restart', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mcp-oauth-restart-'));
    const path = join(root, 'sessions.sqlite');
    const storeKey = Buffer.alloc(32, 11);
    const signingKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const transport = {
      handleRequest: () => Promise.resolve(Response.json({ ok: true })),
    };
    const request = (token: string) =>
      new Request('https://dev.wbs.bulletpoints.club/mcp', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });

    const firstStore = new McpSessionStore(path, [storeKey]);
    const first = fixture({
      exchange: () =>
        Promise.resolve({
          accessToken: 'upstream-okta-token',
          expiresIn: 300,
          refreshToken: 'upstream-refresh-token',
        }),
      signingKeys,
      store: firstStore,
    }).oauth;
    const verifier = 'v'.repeat(43);
    const code = await authorizationCode(first, verifier);
    const issued = await tokenResponse(first, 'random-1', code, verifier);
    const tokens = (await issued.json()) as { access_token: string; refresh_token: string };

    expect(
      await mcpHttpResponse(request(tokens.access_token), CONFIG, first, transport),
    ).toHaveProperty('status', 200);
    firstStore.close();

    const secondStore = new McpSessionStore(path, [storeKey]);
    const second = fixture({ signingKeys, store: secondStore }).oauth;
    expect(
      await mcpHttpResponse(request(tokens.access_token), CONFIG, second, transport),
    ).toHaveProperty('status', 200);

    const refreshed = await mcpHttpResponse(
      new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/token', {
        body: new URLSearchParams({
          client_id: 'random-1',
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
        }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      }),
      CONFIG,
      second,
      transport,
      {},
      second,
    );
    expect(refreshed.status).toBe(200);
    const successor = (await refreshed.json()) as { access_token: string; refresh_token: string };
    expect(successor.refresh_token).not.toBe(tokens.refresh_token);
    expect(
      await mcpHttpResponse(request(successor.access_token), CONFIG, second, transport),
    ).toHaveProperty('status', 200);

    secondStore.close();
    for (const name of ['sessions.sqlite-wal', 'sessions.sqlite-shm', 'sessions.sqlite']) {
      const candidate = join(root, name);
      if (existsSync(candidate)) unlinkSync(candidate);
    }
    rmdirSync(root);
  });

  it('names missing, malformed, and unreadable persistence settings at startup', () => {
    expect(() => mcpOAuthFromEnv(CONFIG, {})).toThrow(/MCP_SIGNING_KEY_CURRENT/);
    expect(() =>
      mcpOAuthFromEnv(CONFIG, {
        MCP_SIGNING_KEY_CURRENT: 'not-a-key',
      }),
    ).toThrow(/MCP_SIGNING_KEY_CURRENT/);

    const signing = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({
        format: 'der',
        type: 'pkcs8',
      })
      .toString('base64');
    expect(() =>
      mcpOAuthFromEnv(CONFIG, {
        MCP_ACCESS_TOKEN_TTL: '3600',
        MCP_SIGNING_KEY_CURRENT: signing,
        MCP_STORE_KEY_CURRENT: Buffer.alloc(32, 1).toString('base64'),
        MCP_STORE_PATH: '/definitely/missing/mcp/session.sqlite',
      }),
    ).toThrow(/MCP_STORE_PATH/);
  });

  // Proof: accepting a consumed token without the family-revocation branch
  // leaves the successor access token valid after replay.
  it('rotates a single-use refresh token and revokes the family on reuse', async () => {
    const { oauth } = fixture({
      exchange: () =>
        Promise.resolve({
          accessToken: 'upstream-okta-token',
          expiresIn: 300,
          refreshToken: 'upstream-refresh-token',
        }),
    });
    const verifier = 'v'.repeat(43);
    const code = await authorizationCode(oauth, verifier);
    const first = await tokenResponse(oauth, 'random-1', code, verifier);
    const firstBody = (await first.json()) as { refresh_token: string };
    const refreshed = await oauth.response(
      new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/token', {
        body: new URLSearchParams({
          client_id: 'random-1',
          grant_type: 'refresh_token',
          refresh_token: firstBody.refresh_token,
        }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      }),
    );
    expect(refreshed?.status).toBe(200);
    const refreshedBody = (await refreshed?.json()) as {
      access_token: string;
      refresh_token: string;
    };
    expect(refreshedBody.refresh_token).not.toBe(firstBody.refresh_token);

    const replay = await oauth.response(
      new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/token', {
        body: new URLSearchParams({
          client_id: 'random-1',
          grant_type: 'refresh_token',
          refresh_token: firstBody.refresh_token,
        }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      }),
    );
    expect(replay?.status).toBe(400);
    expect(oauth.verify(refreshedBody.access_token)).rejects.toThrow(/not an upstream token/);
  });

  // Proof: dropping the versioned lease CAS makes both callers invoke the provider.
  it('refreshes an expiring upstream token once across two concurrent callers', async () => {
    let providerCalls = 0;
    const { advance, oauth } = fixture({
      exchange: () =>
        Promise.resolve({
          accessToken: 'upstream-okta-token',
          expiresIn: 121,
          refreshToken: 'upstream-refresh-token',
        }),
      refresh: (refreshToken) => {
        expect(refreshToken).toBe('upstream-refresh-token');
        providerCalls += 1;
        // Same effective expiry as the original token: completion is detected by version, not time.
        return Promise.resolve({ accessToken: 'fresh-upstream-token', expiresIn: 119 });
      },
      verifyUpstream: (token) =>
        token === 'upstream-okta-token' || token === 'fresh-upstream-token'
          ? Promise.resolve({
              iss: 'https://idp.example',
              sub: 'person-1',
              wbs_groups: ['dev:wbs:read', 'dev:wbs:write'],
            })
          : Promise.reject(new Error('not an upstream token')),
    });
    const verifier = 'v'.repeat(43);
    const code = await authorizationCode(oauth, verifier);
    const issued = await tokenResponse(oauth, 'random-1', code, verifier);
    const accessToken = ((await issued.json()) as { access_token: string }).access_token;
    advance(2_000);

    const callers = await Promise.all([
      oauth.callerSessionFor(accessToken),
      oauth.callerSessionFor(accessToken),
    ]);
    expect(providerCalls).toBe(1);
    expect(callers.map((caller) => caller.upstreamToken)).toEqual([
      'fresh-upstream-token',
      'fresh-upstream-token',
    ]);
  });

  // Proof: consuming before provider work makes a retry of the same token look
  // like replay after a transient provider failure.
  it('keeps a refresh token retryable after a transient upstream failure', async () => {
    let refreshCalls = 0;
    const { advance, oauth } = fixture({
      exchange: () =>
        Promise.resolve({
          accessToken: 'upstream-okta-token',
          expiresIn: 121,
          refreshToken: 'upstream-refresh-token',
        }),
      refresh: () => {
        refreshCalls += 1;
        return refreshCalls === 1
          ? Promise.reject(new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } }))
          : Promise.resolve({ accessToken: 'fresh-upstream-token', expiresIn: 300 });
      },
      verifyUpstream: (token) =>
        Promise.resolve({
          iss: 'https://idp.example',
          sub: 'person-1',
          wbs_groups: ['dev:wbs:read', 'dev:wbs:write'],
          ...(token === 'fresh-upstream-token' ? {} : {}),
        }),
    });
    const verifier = 'v'.repeat(43);
    const code = await authorizationCode(oauth, verifier);
    const issued = await tokenResponse(oauth, 'random-1', code, verifier);
    const refreshToken = ((await issued.json()) as { refresh_token: string }).refresh_token;
    advance(2_000);

    const request = () =>
      oauth.response(
        new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/token', {
          body: new URLSearchParams({
            client_id: 'random-1',
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }),
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          method: 'POST',
        }),
      );
    expect((await request())?.status).toBe(503);
    expect((await request())?.status).toBe(200);
    expect(refreshCalls).toBe(2);
  });

  // Break caught: replacing the original standalone JWKS verifier with only
  // the fronting-AS key would reject clients that already present Okta tokens.
  it('keeps verified upstream Bearer tokens valid in standalone mode', () => {
    const { oauth } = fixture();
    expect(oauth.verify('upstream-okta-token')).resolves.toMatchObject({ sub: 'person-1' });
    expect(oauth.upstreamTokenFor('upstream-okta-token')).resolves.toBe('upstream-okta-token');
  });

  // Break caught: signature-only verification would keep accepting a session
  // after its server-side mapping expires or is explicitly revoked. Proof:
  // omitting provider revocation leaves upstreamRevocations empty.
  it('refuses expired and revoked local sessions', async () => {
    const upstreamRevocations: string[] = [];
    const { advance, oauth } = fixture({
      exchange: () =>
        Promise.resolve({
          accessToken: 'upstream-okta-token',
          expiresIn: 300,
          refreshToken: 'upstream-refresh-token',
        }),
      revoke: (refreshToken) => {
        upstreamRevocations.push(refreshToken);
        return Promise.resolve();
      },
    });
    const verifier = 'v'.repeat(43);
    const code = await authorizationCode(oauth, verifier);
    const firstResponse = await oauth.response(
      new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/token', {
        body: new URLSearchParams({
          client_id: 'random-1',
          code,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: CALLBACK,
        }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      }),
    );
    const issued = (await firstResponse?.json()) as {
      access_token: string;
      refresh_token: string;
    };
    const token = issued.access_token;

    const revoked = await oauth.response(
      new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/revoke', {
        body: new URLSearchParams({ token: issued.refresh_token }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      }),
    );
    expect(revoked?.status).toBe(200);
    expect(upstreamRevocations).toEqual(['upstream-refresh-token']);
    expect(oauth.verify(token)).rejects.toThrow();
    const refreshAfterRevoke = await oauth.response(
      new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/token', {
        body: new URLSearchParams({
          client_id: 'random-1',
          grant_type: 'refresh_token',
          refresh_token: issued.refresh_token,
        }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      }),
    );
    expect(refreshAfterRevoke?.status).toBe(400);

    const second = await completedAuthorization(oauth, verifier);
    const secondCode =
      new URL(second.response.headers.get('location') ?? 'https://invalid').searchParams.get(
        'code',
      ) ?? '';
    const secondResponse = await tokenResponse(oauth, second.clientId, secondCode, verifier);
    const secondIssued = (await secondResponse.json()) as {
      access_token: string;
      refresh_token: string;
    };
    advance(3_600_001);
    expect(oauth.verify(secondIssued.access_token)).rejects.toThrow();
    const expiredRevocation = await oauth.response(
      new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/revoke', {
        body: new URLSearchParams({ token: secondIssued.access_token }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      }),
    );
    expect(expiredRevocation?.status).toBe(200);
    expect(upstreamRevocations).toEqual(['upstream-refresh-token', 'upstream-refresh-token']);
    const refreshAfterExpiry = await oauth.response(
      new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/token', {
        body: new URLSearchParams({
          client_id: 'random-8',
          grant_type: 'refresh_token',
          refresh_token: secondIssued.refresh_token,
        }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      }),
    );
    expect(refreshAfterExpiry?.status).toBe(400);
  });

  // Proof: returning provider failures locally strands the MCP client on the
  // callback page and never makes the following authorization ask for login.
  it('redirects provider errors and consumes a signed reauthentication marker', async () => {
    const { authorizationCalls, oauth } = fixture();
    const clientId = await register(oauth);
    const started = await oauth.response(new Request(authorizeUrl(clientId)));
    const binding = started?.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
    const upstreamState = new URL(
      started?.headers.get('location') ?? 'https://invalid',
    ).searchParams.get('state');
    const failed = await oauth.response(
      new Request(
        `https://dev.wbs.bulletpoints.club/mcp/oauth/callback?error=access_denied&state=${String(upstreamState)}`,
        { headers: { cookie: binding } },
      ),
    );
    const returned = new URL(failed?.headers.get('location') ?? 'https://invalid');
    expect(returned.origin + returned.pathname).toBe(CALLBACK);
    expect(returned.searchParams.get('error')).toBe('access_denied');
    expect(returned.searchParams.get('state')).toBe('claude-state');
    const setCookie = failed?.headers.get('set-cookie') ?? '';
    const marker = /(__Host-wbs_mcp_reauth=[^;,]+)/.exec(setCookie)?.[1];
    expect(marker).toBeDefined();

    const tampered = `${marker?.slice(0, -1) ?? ''}${marker?.endsWith('A') ? 'B' : 'A'}`;
    await oauth.response(new Request(authorizeUrl(clientId), { headers: { cookie: tampered } }));
    expect(authorizationCalls.at(-1)).not.toMatchObject({ prompt: 'login' });

    await oauth.response(
      new Request(authorizeUrl(clientId), { headers: { cookie: marker ?? '' } }),
    );
    expect(authorizationCalls.at(-1)).toMatchObject({ prompt: 'login' });

    await oauth.response(
      new Request(authorizeUrl(clientId), { headers: { cookie: marker ?? '' } }),
    );
    expect(authorizationCalls.at(-1)).not.toMatchObject({ prompt: 'login' });
  });

  it('restores a reserved reauthentication marker when provider discovery fails', async () => {
    let authorizationAttempts = 0;
    const { authorizationCalls, oauth } = fixture({
      authorizationUrl: (input) => {
        authorizationAttempts += 1;
        if (authorizationAttempts === 2) {
          return Promise.reject(new Error('provider discovery unavailable'));
        }
        return Promise.resolve(new URL(`https://idp.example/authorize?state=${input.state}`));
      },
    });
    const clientId = await register(oauth);
    const started = await oauth.response(new Request(authorizeUrl(clientId)));
    const binding = started?.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
    const upstreamState = new URL(
      started?.headers.get('location') ?? 'https://invalid',
    ).searchParams.get('state');
    const failed = await oauth.response(
      new Request(
        `https://dev.wbs.bulletpoints.club/mcp/oauth/callback?error=access_denied&state=${String(upstreamState)}`,
        { headers: { cookie: binding } },
      ),
    );
    const marker = /(__Host-wbs_mcp_reauth=[^;,]+)/.exec(
      failed?.headers.get('set-cookie') ?? '',
    )?.[1];

    const discoveryFailure = await oauth
      .response(new Request(authorizeUrl(clientId), { headers: { cookie: marker ?? '' } }))
      .catch((error: unknown) => error);
    expect(discoveryFailure).toBeInstanceOf(Error);
    expect(String(discoveryFailure)).toContain('provider discovery unavailable');
    await oauth.response(
      new Request(authorizeUrl(clientId), { headers: { cookie: marker ?? '' } }),
    );
    expect(authorizationCalls.at(-1)).toMatchObject({ prompt: 'login' });
  });

  it('still redirects when provider refresh-token revocation fails', async () => {
    let revocationFailures = 0;
    const { oauth } = fixture({
      exchange: () =>
        Promise.resolve({
          accessToken: 'unverifiable-upstream-token',
          expiresIn: 300,
          refreshToken: 'provider-refresh-token',
        }),
      revoke: () => Promise.reject(new Error('provider unavailable')),
      revocationFailure: () => {
        revocationFailures += 1;
      },
      verifyUpstream: () => Promise.reject(new Error('invalid upstream identity')),
    });
    const clientId = await register(oauth);
    const failed = await completedAuthorization(oauth, 'v'.repeat(43), clientId);
    const returned = new URL(failed.response.headers.get('location') ?? 'https://invalid');
    expect(failed.response.status).toBe(302);
    expect(returned.searchParams.get('error')).toBe('access_denied');
    expect(returned.searchParams.get('state')).toBe('claude-state');
    expect(revocationFailures).toBe(1);
  });

  it('maps an exchange exception to server_error at the validated client redirect', async () => {
    const { oauth } = fixture({
      exchange: () => Promise.reject(new Error('provider unavailable')),
    });
    const clientId = await register(oauth);
    const started = await oauth.response(new Request(authorizeUrl(clientId)));
    const binding = started?.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
    const upstreamState = new URL(
      started?.headers.get('location') ?? 'https://invalid',
    ).searchParams.get('state');
    const failed = await oauth.response(
      new Request(
        `https://dev.wbs.bulletpoints.club/mcp/oauth/callback?code=***&state=${String(upstreamState)}`,
        { headers: { cookie: binding } },
      ),
    );
    const returned = new URL(failed?.headers.get('location') ?? 'https://invalid');
    expect(returned.searchParams.get('error')).toBe('server_error');
    expect(returned.searchParams.get('state')).toBe('claude-state');
  });

  it('revokes a refresh token when upstream verification refuses the login', async () => {
    const revoked: string[] = [];
    const { oauth } = fixture({
      exchange: () =>
        Promise.resolve({
          accessToken: 'untrusted-upstream-token',
          expiresIn: 300,
          refreshToken: 'provider-refresh-token',
        }),
      verifyUpstream: () => Promise.reject(new Error('untrusted upstream token')),
      revoke: (token) => {
        revoked.push(token);
        return Promise.resolve();
      },
    });
    const clientId = await register(oauth);
    const started = await oauth.response(new Request(authorizeUrl(clientId)));
    const binding = started?.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
    const upstreamState = new URL(
      started?.headers.get('location') ?? 'https://invalid',
    ).searchParams.get('state');
    const failed = await oauth.response(
      new Request(
        `https://dev.wbs.bulletpoints.club/mcp/oauth/callback?code=***&state=${String(upstreamState)}`,
        { headers: { cookie: binding } },
      ),
    );
    expect(
      new URL(failed?.headers.get('location') ?? 'https://invalid').searchParams.get('error'),
    ).toBe('access_denied');
    expect(revoked).toEqual(['provider-refresh-token']);
  });

  it('redirects and revokes when the verified account lacks wbs:read', async () => {
    const revoked: string[] = [];
    const { oauth } = fixture({
      exchange: () =>
        Promise.resolve({
          accessToken: 'upstream-okta-token',
          expiresIn: 300,
          refreshToken: 'provider-refresh-token',
        }),
      verifyUpstream: () =>
        Promise.resolve({
          iss: 'https://idp.example',
          sub: 'person-without-wbs',
          wbs_groups: [],
        }),
      revoke: (token) => {
        revoked.push(token);
        return Promise.resolve();
      },
    });
    const clientId = await register(oauth);
    const started = await oauth.response(new Request(authorizeUrl(clientId)));
    const binding = started?.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
    const upstreamState = new URL(
      started?.headers.get('location') ?? 'https://invalid',
    ).searchParams.get('state');
    const failed = await oauth.response(
      new Request(
        `https://dev.wbs.bulletpoints.club/mcp/oauth/callback?code=***&state=${String(upstreamState)}`,
        { headers: { cookie: binding } },
      ),
    );
    expect(
      new URL(failed?.headers.get('location') ?? 'https://invalid').searchParams.get('error'),
    ).toBe('access_denied');
    expect(revoked).toEqual(['provider-refresh-token']);
  });
});
