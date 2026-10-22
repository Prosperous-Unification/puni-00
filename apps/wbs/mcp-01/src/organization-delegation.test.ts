import { createHash, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'bun:test';

import type { McpConfig } from './config';
import { McpOAuthServer } from './oauth';
import type {
  ConsentCredentialOutcome,
  ConsentCredentialRequest,
  ConsentEndReport,
  ConsentOrganizations,
  DelegationOutcome,
  DelegationRequest,
  OrganizationAuthority,
} from './organization-authority';
import { McpSessionStore } from './session-store';
import { DelegationRefused, UpstreamRejected } from './wbs-client';

/**
 * Task 6.4 in mcp-01: a consent after activation binds one organization
 * through the authorization code, refresh family and session, and a bound
 * session's be-01 calls carry the delegation be-01 issues for exactly that
 * binding. be-01's side is a recording stub here; the booted pair is
 * `organization-delegation.boot.test.ts`.
 */
const CONFIG: McpConfig = {
  MCP_AUTH_MODE: 'standalone',
  MCP_PUBLIC_URL: 'https://dev.wbs.bulletpoints.club/mcp',
  WBS_API_URL: 'https://dev.wbs.bulletpoints.club',
};
const BASE = 'https://dev.wbs.bulletpoints.club/mcp/oauth';
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'v'.repeat(43);

interface Recorded {
  readonly delegations: { readonly upstreamToken: string; readonly request: DelegationRequest }[];
  readonly authorityReads: unknown[];
  readonly mints: { readonly upstreamToken: string; readonly request: ConsentCredentialRequest }[];
  readonly ends: { readonly credentialId: string; readonly familyId: string }[];
}

/** be-01's answers to a consent credential mint and to an end report, and the shared clock. */
interface ConsentStub {
  mint: ConsentCredentialOutcome;
  end: ConsentEndReport;
  now: number;
}

function fixture(
  consent: ConsentOrganizations,
  delegation?: DelegationOutcome,
  stub: ConsentStub = { mint: { kind: 'minted' }, end: 'acknowledged', now: Date.now() },
) {
  let counter = 0;
  const recorded: Recorded = { delegations: [], authorityReads: [], mints: [], ends: [] };
  const store = new McpSessionStore(':memory:', [randomBytes(32)]);
  const organizations: OrganizationAuthority = {
    organizationsFor: () => Promise.resolve(consent),
    mintConsentCredential: (upstreamToken, request) => {
      recorded.mints.push({ upstreamToken, request });
      return Promise.resolve(stub.mint);
    },
    reportConsentEnded: (ended) => {
      if (stub.end === 'acknowledged') recorded.ends.push(ended);
      return Promise.resolve(stub.end);
    },
    delegationFor: (upstreamToken, request) => {
      recorded.delegations.push({ upstreamToken, request });
      return Promise.resolve(delegation ?? { kind: 'issued', token: 'signed-delegation' });
    },
    readRefreshAuthority: (authority) => {
      recorded.authorityReads.push(authority);
      return Promise.resolve({
        outcome: 'admitted',
        authority,
        facts: { enforced: [], policy: null, lifecycle: null },
      });
    },
  };
  const oauth = new McpOAuthServer(
    CONFIG,
    {
      authorizationUrl: (input) =>
        Promise.resolve(new URL(`https://idp.example/authorize?state=${input.state}`)),
      exchange: () =>
        Promise.resolve({
          accessToken: 'upstream-token',
          refreshToken: 'up-refresh',
          expiresIn: 600,
        }),
      refresh: () => Promise.resolve({ accessToken: 'refreshed-upstream', expiresIn: 600 }),
      revoke: () => Promise.resolve(),
    },
    {
      groupPrefix: 'dev',
      now: () => stub.now,
      store,
      random: () => `random-${String((counter += 1))}`,
      verifyUpstream: () =>
        Promise.resolve({
          iss: 'https://idp.example/',
          sub: 'auth0|ada',
          wbs_groups: ['dev:wbs:read', 'dev:wbs:write'],
        }),
      organizations,
    },
  );
  return { oauth, recorded, store };
}

async function handled(oauth: McpOAuthServer, request: Request): Promise<Response> {
  const response = await oauth.response(request);
  if (response === undefined) throw new Error(`${request.url} was not handled`);
  return response;
}

/** Registers, authorizes and returns the callback's answer. */
async function consent(oauth: McpOAuthServer): Promise<{ clientId: string; callback: Response }> {
  const registered = await handled(
    oauth,
    new Request(`${BASE}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none' }),
    }),
  );
  const clientId = ((await registered.json()) as { client_id: string }).client_id;
  const authorize = new URL(`${BASE}/authorize`);
  authorize.search = new URLSearchParams({
    client_id: clientId,
    code_challenge: createHash('sha256').update(VERIFIER).digest('base64url'),
    code_challenge_method: 'S256',
    redirect_uri: CALLBACK,
    response_type: 'code',
    scope: 'wbs:read wbs:write',
    state: 'client-state',
  }).toString();
  const started = await handled(oauth, new Request(authorize));
  const binding = started.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
  const state = new URL(started.headers.get('location') ?? 'https://invalid').searchParams.get(
    'state',
  );
  const callback = await handled(
    oauth,
    new Request(`${BASE}/callback?code=upstream&state=${String(state)}`, {
      headers: { cookie: binding },
    }),
  );
  return { clientId, callback };
}

/** Exchanges the code in `redirect` and returns the MCP access token. */
async function exchange(oauth: McpOAuthServer, clientId: string, redirect: Response) {
  const code = new URL(redirect.headers.get('location') ?? 'https://invalid').searchParams.get(
    'code',
  );
  if (code === null) throw new Error(`no code in ${String(redirect.headers.get('location'))}`);
  const token = await handled(
    oauth,
    new Request(`${BASE}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        code,
        code_verifier: VERIFIER,
        grant_type: 'authorization_code',
        redirect_uri: CALLBACK,
      }),
    }),
  );
  expect(token.status).toBe(200);
  return ((await token.json()) as { access_token: string }).access_token;
}

const ACTIVATED_ONE: ConsentOrganizations = {
  kind: 'activated',
  userId: 'u-ada',
  memberships: [{ organizationId: 'org-a', name: 'Acme', role: 'member', agents: [] }],
};
const ACTIVATED_TWO: ConsentOrganizations = {
  kind: 'activated',
  userId: 'u-ada',
  memberships: [
    { organizationId: 'org-a', name: 'Acme <Labs>', role: 'member', agents: [] },
    { organizationId: 'org-b', name: 'Beta', role: 'admin', agents: [] },
  ],
};
/** One organization in which ada has one agent person, `claire`. */
const ACTIVATED_WITH_AGENT: ConsentOrganizations = {
  kind: 'activated',
  userId: 'u-ada',
  memberships: [
    {
      organizationId: 'org-a',
      name: 'Acme',
      role: 'super_admin',
      agents: [{ personId: 'p-claire', name: 'claire <bot>' }],
    },
  ],
};

/** The selection cookie and id of a choice page. */
function selectionOf(page: Response): { cookie: string; id: string } {
  const cookie = page.headers
    .getSetCookie()
    .find((value) => value.startsWith('__Host-wbs_mcp_select='))
    ?.split(';', 1)[0];
  if (cookie === undefined) throw new Error('no selection cookie');
  return { cookie, id: cookie.split('=')[1] ?? '' };
}

/** Posts one choice of the page `page` answered. */
function choose(
  oauth: McpOAuthServer,
  page: Response,
  choice: Record<string, string>,
): Promise<Response> {
  const selection = selectionOf(page);
  return handled(
    oauth,
    new Request(`${BASE}/organization`, {
      method: 'POST',
      headers: { cookie: selection.cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ selection: selection.id, ...choice }),
    }),
  );
}

describe('MCP organization binding', () => {
  it('keeps a consent before activation unbound and forwards the upstream token', async () => {
    const { oauth, recorded } = fixture({ kind: 'pre_activation' });
    const { clientId, callback } = await consent(oauth);
    expect(callback.status).toBe(302);
    const session = await oauth.callerSessionFor(await exchange(oauth, clientId, callback));
    expect(await oauth.bearerFor(session.mcpSessionId, session.upstreamToken, ['read'])).toBe(
      'upstream-token',
    );
    expect(recorded.delegations).toEqual([]);
    expect(recorded.authorityReads).toEqual([]);
  });

  it("binds the consent's organization through code, family and session", async () => {
    const { oauth, recorded } = fixture(ACTIVATED_ONE);
    const { clientId, callback } = await consent(oauth);
    // One membership is implicit: no page, straight back to the client.
    expect(callback.status).toBe(302);
    const session = await oauth.callerSessionFor(await exchange(oauth, clientId, callback));
    // The per-request authority read names the bound family.
    expect(recorded.authorityReads).toMatchObject([
      {
        clientId,
        binding: { organizationId: 'org-a', userId: 'u-ada', issuer: 'https://idp.example/' },
      },
    ]);
    expect(
      await oauth.bearerFor(session.mcpSessionId, session.upstreamToken, ['read', 'write']),
    ).toBe('signed-delegation');
    // The grant is the family the per-request authority read named.
    const family = recorded.authorityReads[0] as { readonly familyId: string };
    expect(recorded.delegations).toEqual([
      {
        upstreamToken: 'upstream-token',
        request: {
          organizationId: 'org-a',
          userId: 'u-ada',
          client: clientId,
          grant: family.familyId,
          scopes: ['read', 'write'],
        },
      },
    ]);
  });

  it('lets a member of several organizations choose one, and binds that one', async () => {
    const { oauth, recorded } = fixture(ACTIVATED_TWO);
    const { clientId, callback } = await consent(oauth);
    expect(callback.status).toBe(200);
    expect(callback.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    const page = await callback.text();
    expect(page).toContain('Acme &lt;Labs&gt;');
    expect(page).not.toContain('Acme <Labs>');
    const selectionCookie = callback.headers
      .getSetCookie()
      .find((value) => value.startsWith('__Host-wbs_mcp_select='))
      ?.split(';', 1)[0];
    if (selectionCookie === undefined) throw new Error('no selection cookie');
    const selection = selectionCookie.split('=')[1] ?? '';
    const chosen = await handled(
      oauth,
      new Request(`${BASE}/organization`, {
        method: 'POST',
        headers: { cookie: selectionCookie, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ selection, organizationId: 'org-b' }),
      }),
    );
    expect(chosen.status).toBe(302);
    expect(new URL(chosen.headers.get('location') ?? '').searchParams.get('state')).toBe(
      'client-state',
    );
    const session = await oauth.callerSessionFor(await exchange(oauth, clientId, chosen));
    await oauth.bearerFor(session.mcpSessionId, session.upstreamToken, ['read']);
    expect(recorded.delegations.map(({ request }) => request.organizationId)).toEqual(['org-b']);
    // The selection is single-use.
    const replay = await handled(
      oauth,
      new Request(`${BASE}/organization`, {
        method: 'POST',
        headers: { cookie: selectionCookie, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ selection, organizationId: 'org-a' }),
      }),
    );
    expect(replay.status).toBe(400);
  });

  it('refuses a selection posted without its browser cookie', async () => {
    const { oauth } = fixture(ACTIVATED_TWO);
    const { callback } = await consent(oauth);
    const selection =
      callback.headers
        .getSetCookie()
        .find((value) => value.startsWith('__Host-wbs_mcp_select='))
        ?.split(';', 1)[0]
        ?.split('=')[1] ?? '';
    const posted = await handled(
      oauth,
      new Request(`${BASE}/organization`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ selection, organizationId: 'org-a' }),
      }),
    );
    expect(posted.status).toBe(400);
    expect(posted.headers.get('location')).toBeNull();
  });

  it('refuses a forged organization in the selection', async () => {
    const { oauth } = fixture(ACTIVATED_TWO);
    const { callback } = await consent(oauth);
    const selectionCookie =
      callback.headers
        .getSetCookie()
        .find((value) => value.startsWith('__Host-wbs_mcp_select='))
        ?.split(';', 1)[0] ?? '';
    const posted = await handled(
      oauth,
      new Request(`${BASE}/organization`, {
        method: 'POST',
        headers: { cookie: selectionCookie, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          selection: selectionCookie.split('=')[1] ?? '',
          organizationId: 'org-c',
        }),
      }),
    );
    const location = new URL(posted.headers.get('location') ?? 'https://invalid');
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('code')).toBeNull();
  });

  it('refuses consent for a user with no current membership', async () => {
    for (const refused of [
      { kind: 'activated', userId: 'u-ada', memberships: [] },
      { kind: 'refused' },
    ] as const) {
      const { oauth } = fixture(refused);
      const { callback } = await consent(oauth);
      const location = new URL(callback.headers.get('location') ?? 'https://invalid');
      expect(location.searchParams.get('error')).toBe('access_denied');
      expect(location.searchParams.get('code')).toBeNull();
    }
  });

  it("ends a removed member's session", async () => {
    const { oauth } = fixture(ACTIVATED_ONE, { kind: 'membership_ended' });
    const { clientId, callback } = await consent(oauth);
    const session = await oauth.callerSessionFor(await exchange(oauth, clientId, callback));
    let refused: unknown;
    try {
      await oauth.bearerFor(session.mcpSessionId, session.upstreamToken, ['read']);
    } catch (cause) {
      refused = cause;
    }
    expect(refused).toBeInstanceOf(DelegationRefused);
    expect((refused as DelegationRefused).endsSession).toBe(true);
    // The family is revoked: the session no longer resolves, so no refresh revives it.
    let gone: unknown;
    try {
      await oauth.bearerFor(session.mcpSessionId, session.upstreamToken, ['read']);
    } catch (cause) {
      gone = cause;
    }
    expect(gone).toBeInstanceOf(UpstreamRejected);
  });

  it('keeps a refusing organization rule a tool error without ending the session', async () => {
    const { oauth } = fixture(ACTIVATED_ONE, {
      kind: 'refused',
      status: 403,
      body: '{"error":"sso_required"}',
    });
    const { clientId, callback } = await consent(oauth);
    const session = await oauth.callerSessionFor(await exchange(oauth, clientId, callback));
    let refused: unknown;
    try {
      await oauth.bearerFor(session.mcpSessionId, session.upstreamToken, ['read']);
    } catch (cause) {
      refused = cause;
    }
    expect(refused).toBeInstanceOf(DelegationRefused);
    expect((refused as DelegationRefused).endsSession).toBe(false);
    expect((refused as Error).message).toContain('sso_required');
  });

  it('offers the agents of a single organization', async () => {
    const { oauth, recorded } = fixture(ACTIVATED_WITH_AGENT);
    const { callback } = await consent(oauth);
    expect(callback.status).toBe(200);
    const page = await callback.text();
    expect(page).toContain('Choose who this connection acts as');
    expect(page).toContain('as yourself, super admin');
    expect(page).toContain('<button name="agent" value="0">');
    expect(page).toContain('claire &lt;bot&gt;');
    expect(recorded.mints).toEqual([]);
  });

  it('authorizes as yourself from the agent page, minting nothing', async () => {
    const { oauth, recorded } = fixture(ACTIVATED_WITH_AGENT);
    const { clientId, callback } = await consent(oauth);
    const chosen = await choose(oauth, callback, { organizationId: 'org-a' });
    const session = await oauth.callerSessionFor(await exchange(oauth, clientId, chosen));
    await oauth.bearerFor(session.mcpSessionId, session.upstreamToken, ['read']);
    expect(recorded.mints).toEqual([]);
    expect(recorded.delegations[0]?.request).not.toHaveProperty('credentialId');
  });

  it('acts as the chosen agent: mints before the code, carries person and credential', async () => {
    const { oauth, recorded, store } = fixture(ACTIVATED_WITH_AGENT);
    const { clientId, callback } = await consent(oauth);
    const chosen = await choose(oauth, callback, { agent: '0' });
    expect(chosen.status).toBe(302);
    expect(recorded.mints).toHaveLength(1);
    const mint = recorded.mints.at(0);
    if (mint === undefined) throw new Error('no mint');
    expect(mint.upstreamToken).toBe('upstream-token');
    expect(mint.request).toMatchObject({
      organizationId: 'org-a',
      userId: 'u-ada',
      personId: 'p-claire',
      client: 'claude.ai',
    });
    expect(mint.request.credentialId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    const session = await oauth.callerSessionFor(await exchange(oauth, clientId, chosen));
    const family = store.familyForSession(session.mcpSessionId ?? '', Date.now());
    expect(family?.familyId).toBe(mint.request.family);
    expect(family?.consent).toEqual({
      personId: 'p-claire',
      credentialId: mint.request.credentialId,
    });
    expect(recorded.authorityReads).toMatchObject([
      { consent: { personId: 'p-claire', credentialId: mint.request.credentialId } },
    ]);
    await oauth.bearerFor(session.mcpSessionId, session.upstreamToken, ['read', 'write']);
    expect(recorded.delegations[0]?.request).toEqual({
      organizationId: 'org-a',
      userId: 'u-ada',
      client: clientId,
      grant: mint.request.family,
      scopes: ['read', 'write'],
      credentialId: mint.request.credentialId,
    });
    // The pending consent became the family: nothing is reported ended.
    expect(await oauth.reportEndedConsents()).toBe(0);
  });

  it("refuses consent as another account's agent and creates no family", async () => {
    const stub: ConsentStub = { mint: { kind: 'refused' }, end: 'acknowledged', now: Date.now() };
    const { oauth, recorded, store } = fixture(ACTIVATED_WITH_AGENT, undefined, stub);
    const { callback } = await consent(oauth);
    const chosen = await choose(oauth, callback, { agent: '0' });
    const location = new URL(chosen.headers.get('location') ?? 'https://invalid');
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('code')).toBeNull();
    expect(recorded.mints).toHaveLength(1);
    expect(store.family(recorded.mints[0]?.request.family ?? '')).toBeNull();
    // Nothing was minted, so nothing is left to report, even after the code would have expired.
    stub.now += 600_000;
    expect(await oauth.reportEndedConsents()).toBe(0);
  });

  it('refuses a forged agent choice', async () => {
    const forgeries: Record<string, string>[] = [
      { agent: '7' },
      { agent: '-1' },
      { agent: '00' },
      { agent: '0', organizationId: 'org-a' },
      {},
    ];
    for (const forged of forgeries) {
      const { oauth, recorded } = fixture(ACTIVATED_WITH_AGENT);
      const { callback } = await consent(oauth);
      const posted = await choose(oauth, callback, forged);
      const location = new URL(posted.headers.get('location') ?? 'https://invalid');
      expect({ forged, error: location.searchParams.get('error') }).toEqual({
        forged,
        error: 'access_denied',
      });
      expect(recorded.mints).toEqual([]);
    }
  });

  it('reports a consent whose code was never exchanged, once it expires', async () => {
    const stub: ConsentStub = { mint: { kind: 'minted' }, end: 'acknowledged', now: Date.now() };
    const { oauth, recorded } = fixture(ACTIVATED_WITH_AGENT, undefined, stub);
    const { clientId, callback } = await consent(oauth);
    const chosen = await choose(oauth, callback, { agent: '0' });
    expect(await oauth.reportEndedConsents()).toBe(0);
    stub.now += 300_000;
    expect(await oauth.reportEndedConsents()).toBe(1);
    const mint = recorded.mints.at(0)?.request;
    expect(recorded.ends).toEqual([{ credentialId: mint?.credentialId, familyId: mint?.family }]);
    expect(await oauth.reportEndedConsents()).toBe(0);
    // The code itself is expired as well; it never becomes a family.
    const code = new URL(chosen.headers.get('location') ?? '').searchParams.get('code') ?? '';
    const late = await handled(
      oauth,
      new Request(`${BASE}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          code,
          code_verifier: VERIFIER,
          grant_type: 'authorization_code',
          redirect_uri: CALLBACK,
        }),
      }),
    );
    expect(late.status).toBe(400);
  });

  it('refuses a consent code whose pending consent was already reported ended', async () => {
    const { oauth, recorded, store } = fixture(ACTIVATED_WITH_AGENT);
    const { clientId, callback } = await consent(oauth);
    const chosen = await choose(oauth, callback, { agent: '0' });
    const mint = recorded.mints.at(0)?.request;
    if (mint === undefined) throw new Error('no mint');
    store.acknowledgeConsentEnd({ familyId: mint.family, credentialId: mint.credentialId }, 0);
    const code = new URL(chosen.headers.get('location') ?? '').searchParams.get('code') ?? '';
    const exchanged = await handled(
      oauth,
      new Request(`${BASE}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          code,
          code_verifier: VERIFIER,
          grant_type: 'authorization_code',
          redirect_uri: CALLBACK,
        }),
      }),
    );
    expect(exchanged.status).toBe(400);
    expect(await exchanged.json()).toEqual({ error: 'invalid_grant' });
    expect(store.family(mint.family)).toBeNull();
  });

  it('reports a consent family mcp-01 ended, keeping it until be-01 acknowledges', async () => {
    const stub: ConsentStub = { mint: { kind: 'minted' }, end: 'unavailable', now: Date.now() };
    const { oauth, recorded } = fixture(ACTIVATED_WITH_AGENT, undefined, stub);
    const { clientId, callback } = await consent(oauth);
    const chosen = await choose(oauth, callback, { agent: '0' });
    const access = await exchange(oauth, clientId, chosen);
    const revoked = await handled(
      oauth,
      new Request(`${BASE}/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: access }),
      }),
    );
    expect(revoked.status).toBe(200);
    // be-01 unreachable: nothing acknowledged, the end stays durable.
    expect(await oauth.reportEndedConsents()).toBe(0);
    stub.end = 'acknowledged';
    expect(await oauth.reportEndedConsents()).toBe(1);
    expect(recorded.ends.map((ended) => ended.credentialId)).toEqual([
      recorded.mints[0]?.request.credentialId,
    ]);
    expect(await oauth.reportEndedConsents()).toBe(0);
  });

  it('ends a consent family whose credential be-01 revoked', async () => {
    const { oauth, recorded } = fixture(ACTIVATED_WITH_AGENT, { kind: 'membership_ended' });
    const { clientId, callback } = await consent(oauth);
    const chosen = await choose(oauth, callback, { agent: '0' });
    const session = await oauth.callerSessionFor(await exchange(oauth, clientId, chosen));
    const refused = await oauth
      .bearerFor(session.mcpSessionId, session.upstreamToken, ['read'])
      .catch((cause: unknown) => cause);
    expect(refused).toBeInstanceOf(DelegationRefused);
    expect((refused as DelegationRefused).endsSession).toBe(true);
    expect(await oauth.reportEndedConsents()).toBe(1);
    expect(recorded.ends).toHaveLength(1);
  });

  it('refuses to forward for a bound family when no organization authority is installed', async () => {
    const store = new McpSessionStore(':memory:', [randomBytes(32)]);
    store.createFamily(
      {
        familyId: 'family-1',
        clientId: 'client-1',
        subject: 'auth0|ada',
        scope: 'wbs:read',
        upstreamAccessToken: 'upstream-token',
        upstreamExpiresAt: Date.now() + 600_000,
        idleExpiresAt: Date.now() + 600_000,
        absoluteExpiresAt: Date.now() + 600_000,
        binding: { organizationId: 'org-a', userId: 'u-ada', issuer: 'https://idp.example/' },
      },
      'session-1',
      Date.now() + 600_000,
      'refresh-1',
    );
    const unwired = new McpOAuthServer(
      CONFIG,
      {
        authorizationUrl: () => Promise.reject(new Error('unused')),
        exchange: () => Promise.reject(new Error('unused')),
        refresh: () => Promise.reject(new Error('unused')),
        revoke: () => Promise.resolve(),
      },
      { store },
    );
    // Proof: returning the upstream token here instead of throwing made this
    // resolve to 'upstream-token'; watched 2026-10-21.
    expect(
      await unwired.bearerFor('session-1', 'upstream-token', ['read']).then(
        () => 'forwarded',
        (cause: unknown) => (cause instanceof Error ? cause.message : 'not an error'),
      ),
    ).toContain('INTERNAL_AUTH_SECRET');
  });
});
