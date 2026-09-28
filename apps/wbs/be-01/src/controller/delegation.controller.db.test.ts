import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { generateKeyPair, SignJWT } from 'jose';

import { DELEGATION_TOKEN_TYPE } from '../runtime/delegation';
import { TEST_JWT_KEY } from '../testing/auth-fixture';
import { OrganizationHarness } from '../testing/organization-harness';

/**
 * Task 2.5, first slice: be-01 verifies a WBS-signed delegation for the MCP
 * audience and scopes the request to its organization, over real SQLite and
 * the production organization access. Headers never select authority.
 */
let h: OrganizationHarness;
let keys: CryptoKeyPair;
const ISSUER = 'https://idp.test';

beforeEach(async () => {
  keys = await generateKeyPair('RS256');
  h = OrganizationHarness.open(keys.publicKey);
  for (const username of ['ada', 'grace']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'member');
  h.member('org-b', 'ada', 'member');
  h.member('org-b', 'grace', 'member');
  h.bind('ada', 'org-a');
  h.bind('grace', 'org-b');
  for (const username of ['ada', 'grace']) {
    h.sqlite.run(
      'INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES (?, ?, ?, ?, 1)',
      [`map-${username}`, h.userId(username), ISSUER, `sub-${username}`],
    );
  }
});

afterEach(() => {
  h.close();
});

interface Claims {
  readonly username?: string;
  readonly org?: string;
  readonly aud?: string | string[];
  readonly upstream?: string;
  readonly lifetime?: number;
  readonly issuedAgo?: number;
  readonly scope?: string;
  /** null leaves the grant claim out. */
  readonly grant?: string | null;
}

/** A delegation for `ada` to org-a via mcp-01, signed with the delegation key unless told otherwise. */
async function delegation(
  claims: Claims = {},
  key: CryptoKey | Uint8Array = keys.privateKey,
): Promise<string> {
  const username = claims.username ?? 'ada';
  const iat = Math.floor(Date.now() / 1000) - (claims.issuedAgo ?? 0);
  return new SignJWT({
    // A session token's own claim, so that a delegation signed with the
    // session key would pass as a session if anything fell back to that path.
    username,
    org: claims.org ?? 'org-a',
    client: 'client-1',
    ...(claims.grant === null ? {} : { grant: claims.grant ?? 'family-1' }),
    scope: claims.scope ?? 'read write',
    upstream_iss: ISSUER,
    upstream_sub: claims.upstream ?? `sub-${username}`,
  })
    .setProtectedHeader({
      alg: key instanceof Uint8Array ? 'HS256' : 'RS256',
      typ: DELEGATION_TOKEN_TYPE,
    })
    .setIssuer('wbs')
    .setSubject(h.userId(username))
    .setAudience(claims.aud ?? 'wbs-be-01/via-mcp-01')
    .setJti(crypto.randomUUID())
    .setIssuedAt(iat)
    .setExpirationTime(iat + (claims.lifetime ?? 120))
    .sign(key);
}

async function project(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

const names = (answer: { body: unknown }) =>
  (answer.body as { projects: { name: string }[] }).projects.map((p) => p.name).sort();

describe('after activation', () => {
  let bProject: string;

  beforeEach(async () => {
    h.activate();
    await project('ada', 'A plan');
    bProject = await project('grace', 'B plan');
  });

  it('admits one gateway project check with both credentials and refuses replay', async () => {
    const projectId = await project('ada', 'Gateway plan');
    const path = `/internal/gateway/projects/${projectId}/access`;
    const token = await delegation({ aud: 'wbs-be-01/via-gw-01' });
    const headers = { 'x-internal-auth': 'x'.repeat(32) };
    expect((await h.callWith(token, 'POST', path, undefined, headers)).status).toBe(204);
    // Proof: bypassing durable consumption answered 204 for this replay
    // instead of 401; watched 2026-09-28.
    expect((await h.callWith(token, 'POST', path, undefined, headers)).status).toBe(401);
    expect(
      (await h.callWith(await delegation({ aud: 'wbs-be-01/via-gw-01' }), 'POST', path)).body,
    ).toEqual({ error: 'unauthorized' });
    expect(
      (
        await h.callWith(await delegation(), 'POST', path, undefined, {
          ...headers,
          'x-wbs-audience': 'wbs-be-01/via-mcp-01',
        })
      ).status,
    ).toBe(401);
    const noRead = await delegation({ aud: 'wbs-be-01/via-gw-01', scope: 'write' });
    expect((await h.callWith(noRead, 'POST', path, undefined, headers)).body).toEqual({
      error: 'insufficient_scope',
    });
    expect((await h.callWith(noRead, 'POST', path, undefined, headers)).status).toBe(401);
  });

  it('checks gateway membership and returns identical foreign and absent project 404s', async () => {
    const headers = { 'x-internal-auth': 'x'.repeat(32), 'x-wbs-organization': 'org-b' };
    const token = () => delegation({ aud: 'wbs-be-01/via-gw-01' });
    const foreign = await h.callWith(
      await token(),
      'POST',
      `/internal/gateway/projects/${bProject}/access`,
      undefined,
      headers,
    );
    const absent = await h.callWith(
      await token(),
      'POST',
      '/internal/gateway/projects/absent/access',
      undefined,
      headers,
    );
    expect(foreign).toEqual(absent);
    expect(foreign.status).toBe(404);
    h.sqlite.run('DELETE FROM organization_membership WHERE organization_id = ? AND user_id = ?', [
      'org-a',
      h.userId('ada'),
    ]);
    const removedMemberToken = await token();
    expect(
      (
        await h.callWith(
          removedMemberToken,
          'POST',
          '/internal/gateway/projects/absent/access',
          undefined,
          headers,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await h.callWith(
          removedMemberToken,
          'POST',
          '/internal/gateway/projects/absent/access',
          undefined,
          headers,
        )
      ).status,
    ).toBe(401);
  });

  it('refuses delegated onboarding discovery and writes', async () => {
    h.sqlite.run("UPDATE users SET email = 'ada@example.org', email_verified = 1 WHERE id = ?", [
      h.userId('ada'),
    ]);
    const signed = await delegation();
    expect(await h.callWith(signed, 'GET', '/api/onboarding')).toMatchObject({ status: 403 });

    await h.register('newcomer');
    h.sqlite.run(
      "INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES ('map-newcomer', ?, ?, 'sub-newcomer', 1)",
      [h.userId('newcomer'), ISSUER],
    );
    h.sqlite.run("UPDATE users SET email = 'newcomer@else.org', email_verified = 1 WHERE id = ?", [
      h.userId('newcomer'),
    ]);
    // A delegation is single-use per request, so each call presents a fresh one.
    const newcomer = () => delegation({ username: 'newcomer' });
    expect(await h.callWith(await newcomer(), 'GET', '/api/onboarding')).toMatchObject({
      status: 403,
    });
    expect(
      await h.callWith(await newcomer(), 'POST', '/api/onboarding/organizations', {
        name: 'Unexpected',
      }),
    ).toMatchObject({ status: 403 });
    h.sqlite.run(
      "INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, created_at) VALUES ('claim-else', 'org-a', 'else.org', 'verified', 'proof', 1, 1)",
    );
    expect(
      await h.callWith(await newcomer(), 'POST', '/api/onboarding/join-requests', {
        organizationId: 'org-a',
      }),
    ).toMatchObject({ status: 403 });
    expect(h.sqlite.query("SELECT id FROM organization WHERE name = 'Unexpected'").all()).toEqual(
      [],
    );
  });

  it('lists only the delegated organization’s projects', async () => {
    const answer = await h.callWith(await delegation(), 'GET', '/api/projects');

    expect(answer.status).toBe(200);
    expect(names(answer)).toEqual(['A plan']);
    const toB = await h.callWith(await delegation({ org: 'org-b' }), 'GET', '/api/projects');
    expect(names(toB)).toEqual(['B plan']);
  });

  it('consumes an MCP delegation once even when the project is missing', async () => {
    const token = await delegation();
    expect((await h.callWith(token, 'GET', '/api/projects/absent')).status).toBe(404);
    expect((await h.callWith(token, 'GET', '/api/projects/absent')).status).toBe(401);
  });

  it('refuses a gateway or unknown audience', async () => {
    for (const aud of ['wbs-be-01/via-gw-01', 'somewhere-else']) {
      expect(await h.callWith(await delegation({ aud }), 'GET', '/api/projects')).toMatchObject({
        status: 401,
      });
    }
  });

  it('refuses a signed array audience that includes the MCP route', async () => {
    expect(
      await h.callWith(
        await delegation({ aud: ['wbs-be-01/via-mcp-01', 'wbs-be-01/via-gw-01'] }),
        'GET',
        '/api/projects',
      ),
    ).toMatchObject({ status: 401 });
  });

  it('refuses a gateway bearer beside a session cookie', async () => {
    const projectId = await project('ada', 'Cookie check');
    const token = await delegation({ aud: 'wbs-be-01/via-gw-01' });
    expect(
      await h.callWith(token, 'POST', `/internal/gateway/projects/${projectId}/access`, undefined, {
        'x-internal-auth': 'x'.repeat(32),
        cookie: `__Host-wbs_access=${h.token('ada')}`,
      }),
    ).toMatchObject({ status: 401 });
  });

  it('refuses an expired, re-signed or forged-organization delegation', async () => {
    const expired = await delegation({ issuedAgo: 600, lifetime: 60 });
    const sessionSigned = await delegation({}, new TextEncoder().encode(TEST_JWT_KEY));
    // The same signature over a body whose organization now says org-b.
    const [header, body, signature] = (await delegation()).split('.') as [string, string, string];
    const claims: unknown = JSON.parse(Buffer.from(body, 'base64url').toString());
    const forgedBody = Buffer.from(
      JSON.stringify({ ...(claims as object), org: 'org-b' }),
    ).toString('base64url');
    const forged = `${header}.${forgedBody}.${signature}`;

    for (const token of [expired, sessionSigned, forged]) {
      expect(await h.callWith(token, 'GET', '/api/projects')).toMatchObject({ status: 401 });
    }
  });

  it('refuses a delegation longer than five minutes', async () => {
    expect(
      await h.callWith(await delegation({ lifetime: 3600 }), 'GET', '/api/projects'),
    ).toMatchObject({ status: 401 });
  });

  it('refuses a delegation issued in the future, of no lifetime, or with no grant', async () => {
    for (const claims of [
      { issuedAgo: -3600 },
      { lifetime: 0 },
      { grant: null },
    ] satisfies Claims[]) {
      expect(await h.callWith(await delegation(claims), 'GET', '/api/projects')).toMatchObject({
        status: 401,
      });
    }
  });

  it('refuses a delegation carried in the session cookie, or beside one', async () => {
    const signed = await delegation({}, new TextEncoder().encode(TEST_JWT_KEY));
    const cookieOnly = await h.app.handle(
      new Request('http://localhost/api/projects', {
        headers: { cookie: `__Host-wbs_access=${signed}` },
      }),
    );
    expect(cookieOnly.status).toBe(401);

    // Proof: skipping the ambiguity refusal in `http/identity.ts` made this
    // answer 200; watched 2026-09-28.
    const beside = await h.app.handle(
      new Request('http://localhost/api/projects', {
        headers: {
          cookie: `__Host-wbs_access=${h.token('ada')}`,
          authorization: `Bearer ${await delegation({ org: 'org-b' })}`,
        },
      }),
    );
    expect(beside.status).toBe(401);
  });

  it('refuses a delegation whose upstream identity maps to someone else', async () => {
    expect(
      await h.callWith(await delegation({ upstream: 'sub-grace' }), 'GET', '/api/projects'),
    ).toMatchObject({ status: 401 });
  });

  it('refuses a delegation to an organization the user has left', async () => {
    h.sqlite.run('DELETE FROM organization_membership WHERE organization_id = ? AND user_id = ?', [
      'org-b',
      h.userId('ada'),
    ]);

    expect(
      await h.callWith(await delegation({ org: 'org-b' }), 'GET', '/api/projects'),
    ).toMatchObject({ status: 403 });
  });

  // Proof: letting an `x-wbs-organization` header replace the verified
  // delegation's organization in `http/identity.ts` made this fail; watched
  // 2026-09-28.
  it('lets no header select the organization', async () => {
    const forged = { 'x-wbs-organization': 'org-b', 'x-organization-id': 'org-b' };

    expect(
      await h.callWith(await delegation(), 'GET', `/api/projects/${bProject}`, undefined, forged),
    ).toMatchObject({ status: 404 });
    expect(
      await h.callWith(h.token('ada'), 'GET', `/api/projects/${bProject}`, undefined, forged),
    ).toMatchObject({ status: 404 });
    h.unbind('ada');
    expect(
      await h.callWith(h.token('ada'), 'GET', `/api/projects/${bProject}`, undefined, forged),
    ).toMatchObject({ status: 403 });
  });
});

describe('before activation', () => {
  it('refuses a verified delegation before activation', async () => {
    await project('grace', 'B plan');

    expect(await h.callWith(await delegation(), 'GET', '/api/projects')).toMatchObject({
      status: 403,
      body: { error: 'no_active_organization' },
    });
    expect((await h.call('ada', 'GET', '/api/projects')).status).toBe(200);
  });

  it('refuses every delegation when no delegation key is configured', async () => {
    h.close();
    h = OrganizationHarness.open();
    await h.register('ada');
    h.sqlite.run(
      'INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES (?, ?, ?, ?, 1)',
      ['map-ada', h.userId('ada'), ISSUER, 'sub-ada'],
    );

    const sessionSigned = await delegation({}, new TextEncoder().encode(TEST_JWT_KEY));

    // Proof: answering `not_delegation` from `REFUSE_DELEGATIONS` made the
    // session-key-signed delegation answer 200; watched 2026-09-28.
    for (const token of [await delegation(), sessionSigned]) {
      expect(await h.callWith(token, 'GET', '/api/projects')).toMatchObject({ status: 401 });
    }
    expect((await h.call('ada', 'GET', '/api/projects')).status).toBe(200);
  });
});
