import { JwksTokenVerifier } from '@wbs/auth';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from 'bun:test';
import { decodeJwt, exportJWK, exportPKCS8, exportSPKI, generateKeyPair, SignJWT } from 'jose';

import { joseTokenCodec } from './runtime/bun-runtime';
import { DELEGATION_TOKEN_TYPE } from './runtime/delegation';
import { TEST_JWT_KEY } from './testing/auth-fixture';
import {
  BOOTED_INTERNAL_SECRET,
  BOOTED_ORIGIN,
  BootedBrowserProcess,
} from './testing/booted-browser-process';
import { FakeOidcProvider } from './testing/fake-oidc-provider';

/**
 * MCP organization delegation through `bootBe01`'s own composition
 * (`organization-ownership-and-access` tasks 2.5, 6.4 and 6.6): mcp-01's three
 * internal routes, the live delegation verifier a configured key pair now
 * composes, and organization access behind them. Upstream tokens are RS256
 * JWTs from a local JWKS, verified exactly as an Auth0 access token is.
 */
setDefaultTimeout(30_000);

const ISSUER = 'https://idp.test/';
const AUDIENCE = 'api://wbs';
const INTERNAL = { 'x-internal-auth': BOOTED_INTERNAL_SECRET };

let upstreamKeys: CryptoKeyPair;
let delegationKeys: CryptoKeyPair;
let jwks: ReturnType<typeof Bun.serve>;
let be: BootedBrowserProcess | undefined;

beforeAll(async () => {
  upstreamKeys = await generateKeyPair('RS256', { extractable: true });
  delegationKeys = await generateKeyPair('RS256', { extractable: true });
  const publicJwk = await exportJWK(upstreamKeys.publicKey);
  jwks = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => Response.json({ keys: [{ ...publicJwk, alg: 'RS256', kid: 'idp', use: 'sig' }] }),
  });
});

afterAll(async () => {
  await jwks.stop(true);
});

afterEach(async () => {
  await be?.close();
  be = undefined;
});

/** be-01 as boot composes it, with an RS256 upstream verifier and, unless told not to, delegation keys. */
async function boot(withKeys = true): Promise<BootedBrowserProcess> {
  const provider = new FakeOidcProvider();
  const oidc = {
    ...provider.routeOptions(BOOTED_ORIGIN),
    verifier: new JwksTokenVerifier({
      audience: AUDIENCE,
      issuer: ISSUER,
      jwksUri: new URL(`http://127.0.0.1:${String(jwks.port)}/jwks`),
    }),
  };
  const process = await BootedBrowserProcess.open(
    'enabled',
    oidc,
    BOOTED_ORIGIN,
    undefined,
    undefined,
    withKeys
      ? {
          signingKey: await exportPKCS8(delegationKeys.privateKey),
          verifyKey: await exportSPKI(delegationKeys.publicKey),
        }
      : undefined,
  );
  for (const name of ['ada', 'grace', 'eve']) {
    process.sqlite.run(
      'INSERT INTO users (id, username, password_hash, created_at, idp_issuer, idp_sub) VALUES (?, ?, NULL, 1, ?, ?)',
      [`u-${name}`, name, ISSUER, `auth0|${name}`],
    );
    process.sqlite.run(
      'INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES (?, ?, ?, ?, 1)',
      [`map-${name}`, `u-${name}`, ISSUER, `auth0|${name}`],
    );
  }
  return process;
}

/** A human upstream access token for `subject`, with the read and write groups. */
function upstreamToken(
  subject: string,
  options: { readonly lifetimeSeconds?: number; readonly groups?: readonly string[] } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ wbs_groups: options.groups ?? ['dev:wbs:read', 'dev:wbs:write'] })
    .setProtectedHeader({ alg: 'RS256', kid: 'idp' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(subject)
    .setIssuedAt(now)
    .setExpirationTime(now + (options.lifetimeSeconds ?? 600))
    .sign(upstreamKeys.privateKey);
}

async function call(
  process: BootedBrowserProcess,
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await process.app.handle(
    new Request(`${BOOTED_ORIGIN}${path}`, {
      method,
      headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : (JSON.parse(text) as unknown) };
}

/** mcp-01's delegation request for `subject`'s session bound to `organizationId`. */
async function requestDelegation(
  process: BootedBrowserProcess,
  subject: string,
  body: Partial<Record<'organizationId' | 'userId' | 'client' | 'grant' | 'scope', string>> = {},
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  return call(
    process,
    'POST',
    '/internal/mcp/delegation',
    { ...INTERNAL, authorization: `Bearer ${await upstreamToken(subject)}`, ...headers },
    {
      organizationId: 'org-a',
      userId: `u-${subject.replace('auth0|', '')}`,
      client: 'client-1',
      grant: 'family-1',
      scope: 'read write',
      ...body,
    },
  );
}

function tokenOf(answer: { status: number; body: unknown }): string {
  if (answer.status !== 200) throw new Error(`delegation refused: ${JSON.stringify(answer)}`);
  return (answer.body as { token: string }).token;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Two organizations, ada in A only, grace in B only, one project each; then activation. */
async function activateTwoOrganizations(process: BootedBrowserProcess): Promise<string> {
  process.organization('org-a');
  process.organization('org-b');
  process.sqlite.run(
    "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'u-ada', 'member', 1), ('org-b', 'u-grace', 'member', 1)",
  );
  process.activate();
  const created = await call(
    process,
    'POST',
    '/api/projects',
    { ...bearer(tokenOf(await requestDelegation(process, 'auth0|ada'))), origin: BOOTED_ORIGIN },
    { name: 'A plan' },
  );
  expect(created.status).toBe(200);
  const foreign = await call(
    process,
    'POST',
    '/api/projects',
    {
      ...bearer(
        tokenOf(
          await requestDelegation(process, 'auth0|grace', {
            organizationId: 'org-b',
            userId: 'u-grace',
          }),
        ),
      ),
      origin: BOOTED_ORIGIN,
    },
    { name: 'B plan' },
  );
  expect(foreign.status).toBe(200);
  return (foreign.body as { project: { id: string } }).project.id;
}

const projectNames = (answer: { body: unknown }) =>
  (answer.body as { projects: { name: string }[] }).projects.map((p) => p.name).toSorted();

describe('MCP delegation through the booted composition', () => {
  test('lists nothing and issues nothing before activation', async () => {
    be = await boot();
    const organizations = await call(be, 'POST', '/internal/mcp/organizations', {
      ...INTERNAL,
      ...bearer(await upstreamToken('auth0|ada')),
    });
    expect(organizations).toEqual({ status: 200, body: { state: 'pre_activation' } });
    expect(await requestDelegation(be, 'auth0|ada')).toEqual({
      status: 403,
      body: { error: 'delegation_inactive' },
    });
    expect(
      await call(be, 'POST', '/internal/mcp/authority', INTERNAL, {
        issuer: ISSUER,
        subject: 'auth0|ada',
        userId: 'u-ada',
        organizationId: 'org-a',
      }),
    ).toEqual({ status: 200, body: { outcome: 'denied' } });
    // Before activation the raw upstream token keeps its legacy reach.
    expect(
      (await call(be, 'GET', '/api/projects', bearer(await upstreamToken('auth0|ada')))).status,
    ).toBe(200);
  });

  test('refuses every route without the service secret', async () => {
    be = await boot();
    for (const path of ['organizations', 'delegation', 'authority'])
      expect(
        (
          await call(
            be,
            'POST',
            `/internal/mcp/${path}`,
            bearer(await upstreamToken('auth0|ada')),
            {
              organizationId: 'org-a',
              userId: 'u-ada',
              client: 'c',
              grant: 'g',
              scope: 'read',
              issuer: ISSUER,
              subject: 'auth0|ada',
            },
          )
        ).status,
      ).toBe(401);
  });

  test('lists, issues and verifies an MCP delegation only after activation', async () => {
    be = await boot();
    const foreignProject = await activateTwoOrganizations(be);
    expect(
      await call(be, 'POST', '/internal/mcp/organizations', {
        ...INTERNAL,
        ...bearer(await upstreamToken('auth0|ada')),
      }),
    ).toEqual({
      status: 200,
      body: {
        state: 'activated',
        userId: 'u-ada',
        memberships: [{ organizationId: 'org-a', name: 'org-a', role: 'member' }],
      },
    });
    const token = tokenOf(await requestDelegation(be, 'auth0|ada'));
    expect(decodeJwt(token)).toMatchObject({
      iss: 'wbs',
      aud: 'wbs-be-01/via-mcp-01',
      sub: 'u-ada',
      org: 'org-a',
      client: 'client-1',
      grant: 'family-1',
      scope: 'read write',
      upstream_iss: ISSUER,
      upstream_sub: 'auth0|ada',
    });
    const listed = await call(be, 'GET', '/api/projects', bearer(token));
    expect(listed.status).toBe(200);
    expect(projectNames(listed)).toEqual(['A plan']);
    // One use: the same delegation again is refused.
    expect(await call(be, 'GET', '/api/projects', bearer(token))).toEqual({
      status: 401,
      body: { error: 'unauthenticated' },
    });
    // Another organization's project is not found, exactly like an absent one.
    expect(
      await call(
        be,
        'GET',
        `/api/projects/${foreignProject}`,
        bearer(tokenOf(await requestDelegation(be, 'auth0|ada'))),
      ),
    ).toMatchObject({ status: 404 });
  });

  test('issues an MCP delegation only for the bound organization', async () => {
    be = await boot();
    await activateTwoOrganizations(be);
    // A caller header names B; the body's A is what the delegation carries.
    const token = tokenOf(
      await requestDelegation(be, 'auth0|ada', {}, { 'x-wbs-organization': 'org-b' }),
    );
    expect(decodeJwt(token)['org']).toBe('org-a');
    // Headers on the resource request cannot move it either.
    const listed = await call(be, 'GET', '/api/projects', {
      ...bearer(token),
      'x-wbs-organization': 'org-b',
      'X-WBS-Expected-Organization': 'org-b',
    });
    expect(projectNames(listed)).toEqual(['A plan']);
  });

  test('refuses a delegation for an organization the user does not belong to', async () => {
    be = await boot();
    await activateTwoOrganizations(be);
    expect(await requestDelegation(be, 'auth0|ada', { organizationId: 'org-b' })).toEqual({
      status: 403,
      body: { error: 'not_a_member' },
    });
  });

  test("refuses a delegation the organization's credential rules refuse", async () => {
    be = await boot();
    await activateTwoOrganizations(be);
    // A session policy needs trusted lifecycle evidence an MCP delegation does not carry.
    be.sqlite.run(
      "INSERT INTO organization_session_policy (organization_id, max_session_seconds, reauthenticate_after_seconds, created_at) VALUES ('org-a', 86400, NULL, 1)",
    );
    expect(await requestDelegation(be, 'auth0|ada')).toMatchObject({
      status: 403,
      body: { error: 'reauthentication_required', organizationId: 'org-a' },
    });
    expect(
      (
        await call(be, 'POST', '/internal/mcp/organizations', {
          ...INTERNAL,
          ...bearer(await upstreamToken('auth0|ada')),
        })
      ).body,
    ).toEqual({ state: 'activated', userId: 'u-ada', memberships: [] });
    expect(
      (
        await call(be, 'POST', '/internal/mcp/authority', INTERNAL, {
          issuer: ISSUER,
          subject: 'auth0|ada',
          userId: 'u-ada',
          organizationId: 'org-a',
        })
      ).body,
    ).toMatchObject({
      outcome: 'admitted',
      policy: { maxSessionSeconds: 86400, reauthenticateAfterSeconds: null },
    });
  });

  test('refuses a token that now maps to another account', async () => {
    be = await boot();
    await activateTwoOrganizations(be);
    expect(await requestDelegation(be, 'auth0|ada', { userId: 'u-grace' })).toEqual({
      status: 403,
      body: { error: 'binding_changed' },
    });
  });

  test('narrows scopes to the token and refuses none in common', async () => {
    be = await boot();
    await activateTwoOrganizations(be);
    const readOnly = await call(
      be,
      'POST',
      '/internal/mcp/delegation',
      {
        ...INTERNAL,
        ...bearer(await upstreamToken('auth0|ada', { groups: ['dev:wbs:read'] })),
      },
      { organizationId: 'org-a', userId: 'u-ada', client: 'c', grant: 'g', scope: 'read write' },
    );
    expect(decodeJwt(tokenOf(readOnly))['scope']).toBe('read');
    expect(
      (
        await call(
          be,
          'POST',
          '/internal/mcp/delegation',
          {
            ...INTERNAL,
            ...bearer(await upstreamToken('auth0|ada', { groups: ['dev:wbs:read'] })),
          },
          { organizationId: 'org-a', userId: 'u-ada', client: 'c', grant: 'g', scope: 'write' },
        )
      ).body,
    ).toEqual({ error: 'insufficient_scope' });
  });

  test('refuses a delegation presented as the upstream token', async () => {
    be = await boot();
    await activateTwoOrganizations(be);
    const delegated = tokenOf(await requestDelegation(be, 'auth0|ada'));
    expect(
      await call(
        be,
        'POST',
        '/internal/mcp/delegation',
        { ...INTERNAL, ...bearer(delegated) },
        {
          organizationId: 'org-a',
          userId: 'u-ada',
          client: 'c',
          grant: 'g',
          scope: 'read',
        },
      ),
    ).toEqual({ status: 401, body: { error: 'unauthenticated' } });
  });

  test('refuses an unlinked token, a native session and an expired upstream token', async () => {
    be = await boot();
    await activateTwoOrganizations(be);
    // Groups-less and linked to nobody: the claims change's machine-token rule.
    const machine = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'idp' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('stranger@clients')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(upstreamKeys.privateKey);
    const ask = (token: string) =>
      call(
        be!,
        'POST',
        '/internal/mcp/delegation',
        {
          ...INTERNAL,
          ...bearer(token),
        },
        { organizationId: 'org-a', userId: 'u-ada', client: 'c', grant: 'g', scope: 'read' },
      );
    expect(await ask(machine)).toEqual({ status: 401, body: { error: 'unknown_identity' } });
    const expired = await upstreamToken('auth0|ada', { lifetimeSeconds: -10 });
    expect(await ask(expired)).toEqual({ status: 401, body: { error: 'unauthenticated' } });
    expect(await ask('not-a-token')).toEqual({ status: 401, body: { error: 'unauthenticated' } });
    // A first-party password session proves no upstream pair to bind.
    const native = await joseTokenCodec(TEST_JWT_KEY).sign(
      { subject: 'u-ada', username: 'ada' },
      600,
    );
    expect(await ask(native)).toEqual({ status: 401, body: { error: 'unauthenticated' } });
  });

  test('refuses a wrong audience, a forged organization and an expired signature', async () => {
    be = await boot();
    const foreignProject = await activateTwoOrganizations(be);
    const now = Math.floor(Date.now() / 1000);
    const signed = (claims: { aud?: string; org?: string; iat?: number; exp?: number }) =>
      new SignJWT({
        org: claims.org ?? 'org-a',
        client: 'client-1',
        grant: 'family-1',
        scope: 'read write',
        upstream_iss: ISSUER,
        upstream_sub: 'auth0|ada',
      })
        .setProtectedHeader({ alg: 'RS256', typ: DELEGATION_TOKEN_TYPE })
        .setIssuer('wbs')
        .setSubject('u-ada')
        .setAudience(claims.aud ?? 'wbs-be-01/via-mcp-01')
        .setJti(crypto.randomUUID())
        .setIssuedAt(claims.iat ?? now)
        .setExpirationTime(claims.exp ?? now + 120)
        .sign(delegationKeys.privateKey);
    // A gateway delegation on a resource route, and an MCP one on the gateway route.
    expect(
      (await call(be, 'GET', '/api/projects', bearer(await signed({ aud: 'wbs-be-01/via-gw-01' }))))
        .status,
    ).toBe(401);
    expect(
      (
        await call(be, 'POST', `/internal/gateway/projects/${foreignProject}/access`, {
          ...INTERNAL,
          ...bearer(tokenOf(await requestDelegation(be, 'auth0|ada'))),
        })
      ).status,
    ).toBe(401);
    // A correctly signed delegation naming B, which ada does not belong to.
    expect(await call(be, 'GET', '/api/projects', bearer(await signed({ org: 'org-b' })))).toEqual({
      status: 403,
      body: { error: 'not_a_member' },
    });
    // An issued delegation whose organization claim was edited no longer verifies.
    const [header, payload, signature] = tokenOf(await requestDelegation(be, 'auth0|ada')).split(
      '.',
    ) as [string, string, string];
    const forged = Buffer.from(
      JSON.stringify({
        ...(JSON.parse(Buffer.from(payload, 'base64url').toString()) as object),
        org: 'org-b',
      }),
    ).toString('base64url');
    expect(
      (await call(be, 'GET', '/api/projects', bearer(`${header}.${forged}.${signature}`))).status,
    ).toBe(401);
    expect(
      (
        await call(
          be,
          'GET',
          '/api/projects',
          bearer(await signed({ iat: now - 200, exp: now - 1 })),
        )
      ).status,
    ).toBe(401);
  });

  test('refuses a raw upstream token after activation, linked or not', async () => {
    be = await boot();
    await activateTwoOrganizations(be);
    // A direct upstream token binds no organization (6.6): no delegation, no selection.
    expect(
      await call(be, 'GET', '/api/projects', bearer(await upstreamToken('auth0|ada'))),
    ).toEqual({ status: 403, body: { error: 'no_active_organization' } });
  });

  test("denies a removed member's family and refuses its next delegation", async () => {
    be = await boot();
    await activateTwoOrganizations(be);
    const authority = {
      issuer: ISSUER,
      subject: 'auth0|ada',
      userId: 'u-ada',
      organizationId: 'org-a',
    };
    expect(await call(be, 'POST', '/internal/mcp/authority', INTERNAL, authority)).toEqual({
      status: 200,
      body: { outcome: 'admitted', ...authority, enforced: [], policy: null },
    });
    const unused = tokenOf(await requestDelegation(be, 'auth0|ada'));
    be.sqlite.run(
      "DELETE FROM organization_membership WHERE organization_id = 'org-a' AND user_id = 'u-ada'",
    );
    expect(await call(be, 'POST', '/internal/mcp/authority', INTERNAL, authority)).toEqual({
      status: 200,
      body: { outcome: 'denied' },
    });
    expect(await requestDelegation(be, 'auth0|ada')).toEqual({
      status: 403,
      body: { error: 'not_a_member' },
    });
    // A delegation issued before the removal is refused on use.
    expect(await call(be, 'GET', '/api/projects', bearer(unused))).toEqual({
      status: 403,
      body: { error: 'not_a_member' },
    });
  });

  test('denies a family whose upstream pair maps to another account', async () => {
    be = await boot();
    await activateTwoOrganizations(be);
    expect(
      await call(be, 'POST', '/internal/mcp/authority', INTERNAL, {
        issuer: ISSUER,
        subject: 'auth0|grace',
        userId: 'u-ada',
        organizationId: 'org-a',
      }),
    ).toEqual({ status: 200, body: { outcome: 'denied' } });
  });

  test('answers delegation_inactive after activation without a key pair', async () => {
    be = await boot(false);
    await be.app.handle(new Request(`${BOOTED_ORIGIN}/health`));
    be.organization('org-a');
    be.sqlite.run(
      "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'u-ada', 'member', 1)",
    );
    be.activate();
    expect(
      await call(be, 'POST', '/internal/mcp/organizations', {
        ...INTERNAL,
        ...bearer(await upstreamToken('auth0|ada')),
      }),
    ).toEqual({ status: 403, body: { error: 'delegation_inactive' } });
    expect(await requestDelegation(be, 'auth0|ada')).toEqual({
      status: 403,
      body: { error: 'delegation_inactive' },
    });
  });
});
