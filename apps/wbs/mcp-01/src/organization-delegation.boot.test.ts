import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { JwksTokenVerifier } from '@wbs/auth';
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import type { McpConfig } from './config';
import { mcpFetchHandler } from './http';
import { McpOAuthServer } from './oauth';
import { readDocument, toolsFromDocument } from './openapi-tools';
import { organizationAuthority } from './organization-authority';
import { createServer } from './server';

/**
 * Tasks 2.5, 6.4 and 6.6 end to end: mcp-01's real OAuth front, tool surface
 * and organization authority client against be-01 booted in its own process
 * (`apps/wbs/be-01/src/testing/mcp-delegation-backend.ts`, `bootBe01`'s
 * production composition) over real HTTP, activated by the operator's CLI.
 * Upstream access tokens are RS256 JWTs from a local JWKS that both tiers
 * verify, as they verify Auth0's.
 *
 * The tests share one backend and run in order: before activation, activation,
 * then the bound session's reach, refusals, refresh retry and removal.
 */
setDefaultTimeout(60_000);

const REPO_ROOT = join(import.meta.dir, '../../../..');
const ISSUER = 'https://idp.test/';
const AUDIENCE = 'api://wbs';
const BOOTED_INTERNAL_SECRET = 'x'.repeat(32);
const MCP_URL = 'https://mcp.test/mcp';
const OAUTH = 'https://mcp.test/mcp/oauth';
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'v'.repeat(43);

let upstreamKeys: CryptoKeyPair;
let jwks: ReturnType<typeof Bun.serve>;
let backend: Bun.Subprocess<'ignore', 'pipe', 'inherit'> | undefined;
let beUrl = '';
let oauth: McpOAuthServer;
let handle: (request: Request) => Promise<Response>;
/** Who the fake provider signs the next login and refresh as, and for how long. */
const login = { subject: 'auth0|dany', lifetimeSeconds: 900 };
let refreshes = 0;

function upstreamToken(subject: string, lifetimeSeconds: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ wbs_groups: ['dev:wbs:read', 'dev:wbs:write'] })
    .setProtectedHeader({ alg: 'RS256', kid: 'idp' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(subject)
    .setJti(crypto.randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + lifetimeSeconds)
    .sign(upstreamKeys.privateKey);
}

beforeAll(async () => {
  upstreamKeys = await generateKeyPair('RS256', { extractable: true });
  const publicJwk = await exportJWK(upstreamKeys.publicKey);
  jwks = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => Response.json({ keys: [{ ...publicJwk, alg: 'RS256', kid: 'idp', use: 'sig' }] }),
  });
  const jwksUrl = `http://127.0.0.1:${String(jwks.port)}/jwks`;
  backend = Bun.spawn([process.execPath, 'apps/wbs/be-01/src/testing/mcp-delegation-backend.ts'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      MCP_TEST_JWKS_URL: jwksUrl,
      MCP_TEST_ISSUER: ISSUER,
      MCP_TEST_AUDIENCE: AUDIENCE,
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'inherit',
  });
  const reader = backend.stdout.getReader();
  let printed = '';
  while (!printed.includes('\n')) {
    const chunk = await reader.read();
    if (chunk.done) throw new Error(`be-01 exited before serving: ${printed}`);
    printed += new TextDecoder().decode(chunk.value);
  }
  reader.releaseLock();
  const { port } = JSON.parse(printed.split('\n')[0] ?? '') as { port: number };
  beUrl = `http://127.0.0.1:${String(port)}`;

  const config: McpConfig & { readonly INTERNAL_AUTH_SECRET: string } = {
    MCP_AUTH_MODE: 'standalone',
    MCP_PUBLIC_URL: MCP_URL,
    WBS_API_URL: beUrl,
    INTERNAL_AUTH_SECRET: BOOTED_INTERNAL_SECRET,
  };
  const verifier = new JwksTokenVerifier({
    audience: AUDIENCE,
    issuer: ISSUER,
    jwksUri: new URL(jwksUrl),
  });
  oauth = new McpOAuthServer(
    config,
    {
      authorizationUrl: (input) =>
        Promise.resolve(new URL(`https://idp.test/authorize?state=${input.state}`)),
      exchange: async () => ({
        accessToken: await upstreamToken(login.subject, login.lifetimeSeconds),
        refreshToken: `refresh-${login.subject}`,
        // The provider promises longer than the token's own `exp`: mcp-01 keeps
        // using it until be-01 refuses it, which is the refresh-retry path.
        expiresIn: 900,
      }),
      refresh: async (refreshToken) => {
        refreshes += 1;
        return {
          accessToken: await upstreamToken(refreshToken.replace('refresh-', ''), 900),
          refreshToken,
          expiresIn: 900,
        };
      },
      revoke: () => Promise.resolve(),
    },
    {
      groupPrefix: 'dev',
      verifyUpstream: (token) => verifier.verify(token),
      organizations: organizationAuthority(config),
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
        endSession: (sessionId) => oauth.endSession(sessionId),
        refreshSession: (sessionId) => oauth.refreshSession(sessionId),
        bearerFor: (sessionId, upstream, scopes) => oauth.bearerFor(sessionId, upstream, scopes),
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
  await jwks.stop(true);
});

async function oauthCall(request: Request): Promise<Response> {
  const response = await oauth.response(request);
  if (response === undefined) throw new Error(`${request.url} was not an OAuth route`);
  return response;
}

/**
 * The whole consent for `subject`; returns the MCP access token. When a choice page asks, it
 * picks agent `agent` if given, else "authorize as yourself" in the first organization.
 */
async function connect(
  subject: string,
  options: { readonly lifetimeSeconds?: number; readonly agent?: string } = {},
): Promise<{ access: string; refresh: string; clientId: string }> {
  login.subject = subject;
  login.lifetimeSeconds = options.lifetimeSeconds ?? 900;
  const registered = await oauthCall(
    new Request(`${OAUTH}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none' }),
    }),
  );
  const clientId = ((await registered.json()) as { client_id: string }).client_id;
  const authorize = new URL(`${OAUTH}/authorize`);
  authorize.search = new URLSearchParams({
    client_id: clientId,
    code_challenge: createHash('sha256').update(VERIFIER).digest('base64url'),
    code_challenge_method: 'S256',
    redirect_uri: CALLBACK,
    response_type: 'code',
    scope: 'wbs:read wbs:write',
  }).toString();
  const started = await oauthCall(new Request(authorize));
  const binding = started.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
  const state = new URL(started.headers.get('location') ?? '').searchParams.get('state') ?? '';
  let callback = await oauthCall(
    new Request(`${OAUTH}/callback?code=upstream&state=${state}`, { headers: { cookie: binding } }),
  );
  if (callback.status === 200) callback = await choose(callback, options.agent);
  else if (options.agent !== undefined) throw new Error('no choice page offered the agent');
  if (callback.status !== 302)
    throw new Error(`consent did not redirect: ${String(callback.status)}`);
  const code = new URL(callback.headers.get('location') ?? '').searchParams.get('code');
  if (code === null)
    throw new Error(`consent refused: ${String(callback.headers.get('location'))}`);
  const token = await oauthCall(
    new Request(`${OAUTH}/token`, {
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
  const body = (await token.json()) as { access_token: string; refresh_token: string };
  return { access: body.access_token, refresh: body.refresh_token, clientId };
}

/** Posts the choice of `agent` (or of yourself) on the consent page `page`. */
async function choose(page: Response, agent: string | undefined): Promise<Response> {
  const html = await page.text();
  const cookie = page.headers
    .getSetCookie()
    .find((value) => value.startsWith('__Host-wbs_mcp_select='))
    ?.split(';', 1)[0];
  if (cookie === undefined) throw new Error('the choice page set no selection cookie');
  const choice: Record<string, string> =
    agent === undefined
      ? { organizationId: /name="organizationId" value="([^"]+)"/.exec(html)?.[1] ?? '' }
      : {
          agent:
            new RegExp(`name="agent" value="(\\d+)">[^<]*<small>as agent ${agent}</small>`).exec(
              html,
            )?.[1] ?? '',
        };
  return await oauthCall(
    new Request(`${OAUTH}/organization`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ selection: cookie.split('=')[1] ?? '', ...choice }),
    }),
  );
}

/** One consent credential as the booted be-01 stores it. */
interface StoredConsent {
  readonly personId: string;
  readonly issuedBy: string;
  readonly revokedAt: number | null;
}

async function consents(): Promise<StoredConsent[]> {
  return (await (await fetch(`${beUrl}/__fixture/consents`)).json()) as StoredConsent[];
}

async function fixture(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${beUrl}/__fixture/${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (response.status !== 200) throw new Error(`fixture ${path}: ${await response.text()}`);
  return await response.json();
}

async function refreshWith(refresh: string, clientId: string): Promise<Response> {
  return await oauthCall(
    new Request(`${OAUTH}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh,
        client_id: clientId,
      }),
    }),
  );
}

let rpcId = 0;
/** One `tools/call` through mcp-01's HTTP surface; the tool's text and error flag, or the HTTP refusal. */
async function tool(
  access: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ status: number; isError: boolean; text: string }> {
  rpcId += 1;
  const response = await handle(
    new Request(MCP_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${access}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: rpcId,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    }),
  );
  if (response.status !== 200) return { status: response.status, isError: true, text: '' };
  const body = (await response.json()) as {
    result: { isError?: boolean; content: { text: string }[] };
  };
  return {
    status: 200,
    isError: body.result.isError === true,
    text: body.result.content.map((part) => part.text).join('\n'),
  };
}

const projectNames = (text: string) =>
  (JSON.parse(text) as { projects: { name: string }[] }).projects.map((p) => p.name).toSorted();

const sessions: Record<string, string> = {};
const ids = { launch: '', foreign: '', leaf: '' };
const claire = { access: '', refresh: '', clientId: '' };

/** One `claimWorkItem` of the leaf for `personId` through `access`. */
function claimLeaf(access: string, personId: string) {
  return tool(access, 'postApiProjectsByIdCommands', {
    id: ids.launch,
    commands: [{ kind: 'claimWorkItem', workItemId: ids.leaf, personId }],
  });
}

describe('MCP organization delegation against a booted be-01', () => {
  test('before activation an MCP session works exactly as before', async () => {
    const dany = await connect('auth0|dany');
    sessions['legacy'] = dany.access;
    const created = await tool(dany.access, 'postApiProjects', { name: 'Launch' });
    expect(created.isError).toBe(false);
    ids.launch = (JSON.parse(created.text) as { project: { id: string } }).project.id;
    const listed = await tool(dany.access, 'getApiProjects', {});
    expect(projectNames(listed.text)).toEqual(['Launch']);
  });

  test('the operator activates organizations', async () => {
    const activated = await fetch(`${beUrl}/__fixture/activate`, { method: 'POST' });
    expect({ status: activated.status, body: await activated.text() }).toMatchObject({
      status: 200,
    });
    // The pre-activation session bound no organization: be-01 refuses its raw token.
    const legacy = await tool(sessions['legacy'] ?? '', 'getApiProjects', {});
    expect(legacy.isError).toBe(true);
    expect(legacy.text).toContain('no_active_organization');
  });

  test('a session bound at consent lists projects and runs a command batch', async () => {
    const dany = await connect('auth0|dany');
    sessions['dany'] = dany.access;
    sessions['danyRefresh'] = dany.refresh;
    sessions['danyClient'] = dany.clientId;
    const listed = await tool(dany.access, 'getApiProjects', {});
    expect(listed.isError).toBe(false);
    expect(projectNames(listed.text)).toEqual(['Launch']);
    const batch = await tool(dany.access, 'postApiProjectsByIdCommands', {
      id: ids.launch,
      commands: [
        { kind: 'createWorkItem', ref: 'epic', parentId: null, afterId: null, name: 'Payments' },
        { kind: 'createWorkItem', ref: 'a', parentRef: 'epic', afterId: null, name: 'Schema' },
      ],
    });
    expect(batch.isError).toBe(false);
    expect((JSON.parse(batch.text) as { results: unknown[] }).results).toHaveLength(2);
  });

  test("the same session is refused on another organization's project", async () => {
    const grace = await connect('auth0|grace');
    const created = await tool(grace.access, 'postApiProjects', { name: 'Foreign' });
    expect(created.isError).toBe(false);
    ids.foreign = (JSON.parse(created.text) as { project: { id: string } }).project.id;
    expect(projectNames((await tool(grace.access, 'getApiProjects', {})).text)).toEqual([
      'Foreign',
    ]);
    const foreign = await tool(sessions['dany'] ?? '', 'getApiProjectsById', { id: ids.foreign });
    expect(foreign.isError).toBe(true);
    expect(foreign.text).toContain('HTTP 404');
    // A forged organization argument is not an input any tool declares.
    const forged = await tool(sessions['dany'] ?? '', 'getApiProjects', {
      organizationId: 'org-b',
    });
    expect(forged.isError).toBe(true);
    expect(forged.text).toContain('does not declare an input named "organizationId"');
  });

  test('a raw upstream Bearer with no delegation is refused', async () => {
    const raw = await upstreamToken('auth0|dany', 900);
    // Through mcp-01 as a direct upstream token: be-01 receives it unbound.
    const viaMcp = await tool(raw, 'getApiProjects', {});
    expect(viaMcp.isError).toBe(true);
    expect(viaMcp.text).toContain('no_active_organization');
    // And straight at be-01.
    const direct = await fetch(`${beUrl}/api/projects`, {
      headers: { authorization: `Bearer ${raw}` },
    });
    expect(direct.status).toBe(403);
    expect(await direct.json()).toEqual({ error: 'no_active_organization' });
  });

  test('keeps the signed delegation through an upstream refresh retry', async () => {
    // The upstream token expires in two seconds although the provider promised 900.
    const dany = await connect('auth0|dany', { lifetimeSeconds: 2 });
    await Bun.sleep(3_000);
    const before = refreshes;
    const listed = await tool(dany.access, 'getApiProjects', {});
    expect(refreshes).toBe(before + 1);
    expect(listed.isError).toBe(false);
    expect(projectNames(listed.text)).toEqual(['Launch']);
  });

  test("offers dany's agents at consent, and a consent as claire mints her credential", async () => {
    await fixture('agent', { id: 'claire', account: 'dany' });
    await fixture('agent', { id: 'codex', account: 'dany' });
    await fixture('agent', { id: 'loose', account: null });
    const connected = await connect('auth0|dany', { agent: 'claire' });
    Object.assign(claire, connected);
    expect(await consents()).toEqual([{ personId: 'claire', issuedBy: 'u-dany', revokedAt: null }]);
    const listed = await tool(claire.access, 'getApiProjects', {});
    expect(listed.isError).toBe(false);
    expect(projectNames(listed.text)).toEqual(['Launch']);
  });

  test("a consent session's tool call claims as its agent, never with the human's reach", async () => {
    const created = await tool(sessions['dany'] ?? '', 'postApiProjectsByIdCommands', {
      id: ids.launch,
      commands: [{ kind: 'createWorkItem', parentId: null, afterId: null, name: 'Claimable' }],
    });
    expect(created.isError).toBe(false);
    ids.leaf = (JSON.parse(created.text) as { results: { id: string }[] }).results[0]?.id ?? '';
    // Another of dany's persons: the pin refuses it.
    const asCodex = await claimLeaf(claire.access, 'codex');
    expect(asCodex.isError).toBe(true);
    expect(asCodex.text).toContain('credential_not_for_person');
    // A person bound to nobody: dany is super-admin, but the agent acts as a member (A23).
    const asLoose = await claimLeaf(claire.access, 'loose');
    expect(asLoose.isError).toBe(true);
    expect(asLoose.text).toContain('person_not_bound');
    const asClaire = await claimLeaf(claire.access, 'claire');
    expect(asClaire.isError).toBe(false);
    // One claim row per step of the leaf, every one of them claire's.
    const claimed = (await (await fetch(`${beUrl}/__fixture/claims`)).json()) as {
      personId: string;
    }[];
    expect(claimed.length).toBeGreaterThan(0);
    expect(new Set(claimed.map((row) => row.personId))).toEqual(new Set(['claire']));
    const members = await tool(claire.access, 'getApiOrganizationMembers', {});
    expect(members.isError).toBe(true);
    expect(members.text).toContain('insufficient_scope');
  });

  test('refresh keeps the agent alive as the agent', async () => {
    const refreshed = await refreshWith(claire.refresh, claire.clientId);
    expect(refreshed.status).toBe(200);
    const body = (await refreshed.json()) as { access_token: string; refresh_token: string };
    claire.access = body.access_token;
    claire.refresh = body.refresh_token;
    const asCodex = await claimLeaf(claire.access, 'codex');
    expect(asCodex.text).toContain('credential_not_for_person');
  });

  test('authorizing as yourself beside agents stays the human session', async () => {
    const dany = await connect('auth0|dany');
    expect(await consents()).toHaveLength(1);
    // The human's own session is unpinned: dany may claim for any of dany's persons.
    const created = await tool(dany.access, 'postApiProjectsByIdCommands', {
      id: ids.launch,
      commands: [{ kind: 'createWorkItem', parentId: null, afterId: null, name: 'Human' }],
    });
    const human = (JSON.parse(created.text) as { results: { id: string }[] }).results[0]?.id;
    const asCodex = await tool(dany.access, 'postApiProjectsByIdCommands', {
      id: ids.launch,
      commands: [{ kind: 'claimWorkItem', workItemId: human, personId: 'codex' }],
    });
    expect(asCodex.isError).toBe(false);
  });

  test('a second consent for the same agent mints a second credential', async () => {
    const second = await connect('auth0|dany', { agent: 'claire' });
    sessions['claireSecond'] = second.access;
    expect(await consents()).toEqual([
      { personId: 'claire', issuedBy: 'u-dany', revokedAt: null },
      { personId: 'claire', issuedBy: 'u-dany', revokedAt: null },
    ]);
  });

  test('revoking the consent in WBS ends the session: 401, and refresh is refused', async () => {
    expect(await fixture('revoke-consent', { personId: 'claire' })).toEqual({ revoked: 2 });
    // Refresh first: it alone must learn the revocation from the authority read.
    const refreshed = await refreshWith(claire.refresh, claire.clientId);
    expect(refreshed.status).toBe(400);
    expect(await refreshed.json()).toEqual({ error: 'invalid_grant' });
    const next = await tool(claire.access, 'getApiProjects', {});
    expect(next.status).toBe(401);
    // The second family learns it on its own next call.
    expect((await tool(sessions['claireSecond'] ?? '', 'getApiProjects', {})).status).toBe(401);
    // be-01 refused both families' authority, as for a removed member, so mcp-01 keeps them
    // unrevoked and refuses each use; their ends are already held by be-01, and the sweep reports
    // them (as already revoked) once they expire. Nothing is reported now.
    expect(await oauth.reportEndedConsents()).toBe(0);
  });

  test('a family mcp-01 ends marks its credential revoked in WBS', async () => {
    const third = await connect('auth0|dany', { agent: 'claire' });
    expect((await consents()).at(-1)).toEqual({
      personId: 'claire',
      issuedBy: 'u-dany',
      revokedAt: null,
    });
    const revoked = await oauthCall(
      new Request(`${OAUTH}/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: third.access }),
      }),
    );
    expect(revoked.status).toBe(200);
    expect(await oauth.reportEndedConsents()).toBe(1);
    expect(typeof (await consents()).at(-1)?.revokedAt).toBe('number');
  });

  test("a removed member's session is refused on its next call and cannot refresh", async () => {
    const removed = await fetch(`${beUrl}/__fixture/remove-member`, {
      method: 'POST',
      body: JSON.stringify({ username: 'dany' }),
    });
    expect(removed.status).toBe(200);
    const next = await tool(sessions['dany'] ?? '', 'getApiProjects', {});
    expect(next.status).toBe(401);
    const refreshed = await oauthCall(
      new Request(`${OAUTH}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: sessions['danyRefresh'] ?? '',
          client_id: sessions['danyClient'] ?? '',
        }),
      }),
    );
    expect(refreshed.status).toBe(400);
    expect(await refreshed.json()).toEqual({ error: 'invalid_grant' });
  });
});
