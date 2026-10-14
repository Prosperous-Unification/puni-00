import { createHash } from 'node:crypto';

import { JwksTokenVerifier } from '@wbs/auth';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import { DELEGATION_TOKEN_TYPE } from '../runtime/delegation';
import { OrganizationHarness } from '../testing/organization-harness';

const ISSUER = 'https://idp.test';
const AUDIENCE = 'api://wbs';
const SECRET = 'x'.repeat(32);
const SSO = 'samlp|acme-saml|m@acme.test';
const SOCIAL = 'google-oauth2|7';

let signing: CryptoKeyPair;
let delegationKeys: CryptoKeyPair;
let jwks: ReturnType<typeof Bun.serve>;
let h: OrganizationHarness;
let clock: number;

beforeAll(async () => {
  signing = await generateKeyPair('RS256');
  delegationKeys = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(signing.publicKey);
  jwks = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      Response.json({ keys: [{ ...publicJwk, alg: 'RS256', kid: 'rules', use: 'sig' }] }),
  });
});

afterAll(async () => {
  await jwks.stop(true);
});

/**
 * Enforced SSO and session policy through the mounted app over real SQLite
 * (`organization-sso` "Enforced SSO admits only identities carrying the
 * connection's subject prefix"; `organization-session-policy`): browser
 * selection, every resolution of an existing binding, gateway browser access,
 * direct-context issue and MCP delegation verification, each refused only in
 * the organization whose rule fails.
 */
beforeEach(async () => {
  clock = Date.UTC(2026, 9, 12, 8);
  h = OrganizationHarness.open({
    sessionBinding: true,
    delegationKey: delegationKeys.publicKey,
    directSigningKey: delegationKeys.privateKey,
    now: () => clock,
    upstreamCredential: {
      verifier: new JwksTokenVerifier({
        audience: AUDIENCE,
        issuer: ISSUER,
        jwksUri: new URL(`http://127.0.0.1:${String(jwks.port)}/jwks`),
      }),
      groupPrefix: 'dev',
      groupsClaim: 'wbs_groups',
    },
  });
  for (const username of ['mia', 'pat']) await h.register(username);
  for (const organization of ['org-a', 'org-b']) {
    h.organization(organization);
    h.member(organization, 'mia', 'member');
  }
  h.member('org-a', 'pat', 'member');
  h.activate();
  for (const [index, subject] of [SSO, SOCIAL, 'github|9'].entries())
    h.sqlite.run(
      'INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES (?, ?, ?, ?, 1)',
      [`map-${String(index)}`, h.userId('mia'), ISSUER, subject],
    );
});

afterEach(() => {
  h.close();
});

/** A verified upstream access token for `subject`, valid for five minutes from now. */
function upstream(subject: string): Promise<string> {
  const seconds = Math.floor(Date.now() / 1000);
  return new SignJWT({ wbs_groups: ['dev:wbs:read', 'dev:wbs:write'] })
    .setProtectedHeader({ alg: 'RS256', kid: 'rules' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(subject)
    .setJti(crypto.randomUUID())
    .setIssuedAt(seconds)
    .setExpirationTime(seconds + 300)
    .sign(signing.privateKey);
}

/** An MCP delegation for `m` to `organization` carrying upstream `subject`. */
function delegation(subject: string, organization = 'org-a'): Promise<string> {
  const seconds = Math.floor(Date.now() / 1000);
  return new SignJWT({
    org: organization,
    client: 'client-1',
    grant: 'family-1',
    scope: 'read write',
    upstream_iss: ISSUER,
    upstream_sub: subject,
  })
    .setProtectedHeader({ alg: 'RS256', typ: DELEGATION_TOKEN_TYPE })
    .setIssuer('wbs')
    .setSubject(h.userId('mia'))
    .setAudience('wbs-be-01/via-mcp-01')
    .setJti(crypto.randomUUID())
    .setIssuedAt(seconds)
    .setExpirationTime(seconds + 120)
    .sign(delegationKeys.privateKey);
}

/** A's proven connection `acme-saml` on verified `acme.test`, enforced. */
function enforce(): void {
  h.sqlite.run(
    `INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, created_at)
     VALUES ('claim-a', 'org-a', 'acme.test', 'verified', ?, 1, 1)`,
    ['a'.repeat(64)],
  );
  h.sqlite.run(
    `INSERT INTO organization_sso_connection (id, organization_id, domain_claim_id, auth0_connection, strategy, login_slug, enforced, proven_at, proven_by, created_at)
     VALUES ('conn-a', 'org-a', 'claim-a', 'acme-saml', 'samlp', 'acme', 1, 2, ?, 1)`,
    [h.userId('mia')],
  );
}

async function send(
  token: string,
  method: 'GET' | 'POST',
  path: string,
  options: { body?: unknown; selection?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown; cookie: string | null }> {
  const response = await h.app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        cookie: `__Host-wbs_access=${token}${options.selection === undefined ? '' : `; ${options.selection}`}`,
        ...(method === 'POST'
          ? { origin: 'http://localhost', 'X-WBS-Expected-Organization': 'org-a' }
          : {}),
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...options.headers,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    }),
  );
  const text = await response.text();
  return {
    status: response.status,
    body: text === '' ? null : (JSON.parse(text) as unknown),
    cookie: response.headers.get('set-cookie'),
  };
}

/** Selects `organization` and answers the selection cookie pair, or the refusal. */
async function select(token: string, organization: string) {
  const answer = await send(token, 'POST', '/api/organization/active', {
    body: { organizationId: organization },
  });
  return { ...answer, pair: answer.cookie?.split(';')[0] };
}

const SSO_REQUIRED = {
  error: 'sso_required',
  organizationId: 'org-a',
  login: '/api/auth/login?organization=acme',
  link: true,
};

describe('enforced SSO', () => {
  it('admits an identity carrying the prefix to select and act', async () => {
    enforce();
    const token = await upstream(SSO);
    const selected = await select(token, 'org-a');
    expect(selected.status).toBe(200);
    expect((await send(token, 'GET', '/api/projects', { selection: selected.pair })).status).toBe(
      200,
    );
  });

  // Proof: skipping the admission in `organizationSelection.select`, and
  // separately skipping the prefix test in `credentialRuleRefusal`, made this
  // select A (200 instead of 403); watched 2026-10-12.
  it('refuses a social identity in the enforced organization only', async () => {
    enforce();
    const token = await upstream(SOCIAL);
    const refused = await select(token, 'org-a');
    expect(refused.status).toBe(403);
    expect(refused.body).toEqual(SSO_REQUIRED);
    expect(refused.cookie).toBeNull();
    expect((await select(token, 'org-b')).status).toBe(200);
  });

  // Proof: evaluating any pair linked to the user instead of the
  // authenticating one made this select A; watched 2026-10-12.
  it('does not lend a linked SSO pair to a social credential', async () => {
    enforce();
    // m holds both pairs; the credential was authenticated by the social one.
    const refused = await select(await upstream(SOCIAL), 'org-a');
    expect(refused.body).toEqual(SSO_REQUIRED);
  });

  it('refuses a password credential at selection and at direct-context issue', async () => {
    enforce();
    const token = h.token('pat');
    expect((await select(token, 'org-a')).body).toEqual(SSO_REQUIRED);
    expect(
      await h.callWith(token, 'POST', '/api/auth/context', { organizationId: 'org-a' }),
    ).toEqual({ status: 403, body: SSO_REQUIRED });
  });

  it('applies to an existing binding and the gateway at once', async () => {
    const token = await upstream(SOCIAL);
    const selected = await select(token, 'org-a');
    expect(selected.status).toBe(200);
    const created = await send(token, 'POST', '/api/projects', {
      selection: selected.pair,
      body: { name: 'Plan' },
    });
    expect(created.status).toBe(200);
    const projectId = (created.body as { project: { id: string } }).project.id;
    const gateway = () =>
      h.app.handle(
        new Request(`http://localhost/internal/gateway/projects/${projectId}/browser-access`, {
          method: 'POST',
          headers: {
            'x-internal-auth': SECRET,
            cookie: `__Host-wbs_access=${token}; ${selected.pair ?? ''}`,
          },
        }),
      );
    expect((await gateway()).status).toBe(204);
    enforce();
    const next = await send(token, 'GET', '/api/projects', { selection: selected.pair });
    expect(next).toMatchObject({ status: 403, body: SSO_REQUIRED });
    const refusedGateway = await gateway();
    expect(refusedGateway.status).toBe(403);
    expect(await refusedGateway.json()).toEqual(SSO_REQUIRED);
  });

  it('refuses an MCP delegation whose upstream subject lacks the prefix', async () => {
    enforce();
    expect(await h.callWith(await delegation('github|9'), 'GET', '/api/projects')).toEqual({
      status: 403,
      body: SSO_REQUIRED,
    });
    expect((await h.callWith(await delegation(SSO), 'GET', '/api/projects')).status).toBe(200);
  });

  // Proof: dropping the lockout guard in `EnterpriseConnectionRepository.setEnforced`
  // made the social credential enforce (200 instead of 409); watched 2026-10-12.
  it('enables enforcement for a super-admin signed in through the connection', async () => {
    enforce();
    h.sqlite.run("UPDATE organization_sso_connection SET enforced = 0 WHERE id = 'conn-a'");
    h.sqlite.run(
      "UPDATE organization_membership SET role = 'super_admin' WHERE organization_id = 'org-a' AND user_id = ?",
      [h.userId('mia')],
    );
    const request = async (subject: string) => {
      const token = await upstream(subject);
      const selected = await select(token, 'org-a');
      const response = await h.app.handle(
        new Request('http://localhost/api/organization/sso-connections/conn-a', {
          method: 'PATCH',
          headers: {
            cookie: `__Host-wbs_access=${token}; ${selected.pair ?? ''}`,
            origin: 'http://localhost',
            'X-WBS-Expected-Organization': 'org-a',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ enforced: true }),
        }),
      );
      return { status: response.status, body: (await response.json()) as unknown };
    };
    expect(await request(SOCIAL)).toEqual({
      status: 409,
      body: { error: 'enforcement_would_lock_out_actor' },
    });
    expect((await request(SSO)).status).toBe(200);
    expect(
      h.sqlite.query("SELECT enforced FROM organization_sso_connection WHERE id = 'conn-a'").get(),
    ).toEqual({ enforced: 1 });
    // The refused attempt wrote nothing; the change wrote exactly one row.
    expect(h.sqlite.query('SELECT actor_id, action, detail FROM organization_audit').all()).toEqual(
      [
        {
          actor_id: h.userId('mia'),
          action: 'sso_enforcement_changed',
          detail: '{"enforced":true,"prefix":"samlp|acme-saml|"}',
        },
      ],
    );
  });

  it('marks the memberships this credential cannot enter', async () => {
    enforce();
    const listed = await send(await upstream(SOCIAL), 'GET', '/api/organization/memberships');
    expect(listed.body).toEqual({
      state: 'selection_required',
      memberships: [
        { organizationId: 'org-a', name: 'org-a', role: 'member', ssoRequired: true },
        { organizationId: 'org-b', name: 'org-b', role: 'member', ssoRequired: false },
      ],
    });
  });
});

describe('session policy', () => {
  const policy = (max: number | null, reauthenticate: number | null) =>
    h.sqlite.run(
      'INSERT INTO organization_session_policy (organization_id, max_session_seconds, reauthenticate_after_seconds, created_at) VALUES (?, ?, ?, 1)',
      ['org-a', max, reauthenticate],
    );

  /** The browser lifecycle a login callback would have opened for `token`. */
  function lifecycle(token: string, openedAt: number | null, reauthenticatedAt: number | null) {
    const session = createHash('sha256').update(crypto.randomUUID()).digest('hex');
    const digest = createHash('sha256').update(token, 'utf8').digest('hex');
    const expiresAt = (Math.floor(Date.now() / 1000) + 300) * 1000;
    h.sqlite.run(
      `INSERT INTO browser_auth_lifecycle (session_digest, user_id, generation, state, current_kind, current_digest, current_expires_at, opened_at, reauthenticated_at)
       VALUES (?, ?, 1, 'active', 'oidc', ?, ?, ?, ?)`,
      [session, h.userId('mia'), digest, expiresAt, openedAt, reauthenticatedAt],
    );
    h.sqlite.run(
      `INSERT INTO browser_auth_association (session_digest, generation, kind, credential_digest, expires_at)
       VALUES (?, 1, 'oidc', ?, ?)`,
      [session, digest, expiresAt],
    );
  }

  it('admits the exact session bound and refuses one millisecond more, in A only', async () => {
    const token = await upstream(SSO);
    const opened = clock;
    lifecycle(token, opened, opened);
    const a = await select(token, 'org-a');
    const b = await select(token, 'org-b');
    policy(28_800, null);
    clock = opened + 28_800_000;
    expect((await send(token, 'GET', '/api/projects', { selection: a.pair })).status).toBe(200);
    clock += 1;
    expect(await send(token, 'GET', '/api/projects', { selection: a.pair })).toMatchObject({
      status: 403,
      body: {
        error: 'reauthentication_required',
        organizationId: 'org-a',
        reason: 'max_session',
        login: '/api/auth/login?reauthenticate=org-a',
      },
    });
    expect((await send(token, 'GET', '/api/projects', { selection: b.pair })).status).toBe(200);
  });

  it('admits the exact reauthentication bound and refuses one millisecond more', async () => {
    const token = await upstream(SSO);
    lifecycle(token, clock, clock);
    policy(null, 3_600);
    const start = clock;
    clock = start + 3_600_000;
    expect((await select(token, 'org-a')).status).toBe(200);
    clock += 1;
    expect((await select(token, 'org-a')).body).toMatchObject({
      error: 'reauthentication_required',
      reason: 'reauthenticate_after',
    });
  });

  // Proof: treating a null `opened_at` as now made this select A; watched
  // 2026-10-12.
  it('refuses an unknown time and a delegation without an authentication time', async () => {
    const token = await upstream(SSO);
    lifecycle(token, null, null);
    policy(28_800, null);
    expect((await select(token, 'org-a')).body).toMatchObject({
      error: 'reauthentication_required',
    });
    expect(await h.callWith(await delegation(SSO), 'GET', '/api/projects')).toMatchObject({
      status: 403,
      body: { error: 'reauthentication_required' },
    });
  });

  // Proof: omitting the session's `authentication` from the direct-context
  // resolution made the fresh session's issue answer 403 here; watched
  // 2026-10-12.
  it('refuses a direct context under a session policy only once the password session is too old', async () => {
    policy(null, 3_600);
    clock = Date.now();
    const fresh = await h.callWith(h.token('pat'), 'POST', '/api/auth/context', {
      organizationId: 'org-a',
    });
    expect(fresh.status).toBe(200);
    clock = Date.now() + 3_600_000 + 2_000;
    expect(
      await h.callWith(h.token('pat'), 'POST', '/api/auth/context', { organizationId: 'org-a' }),
    ).toMatchObject({ status: 403, body: { reason: 'reauthenticate_after' } });
  });

  it('admits everyone again once the policy is cleared', async () => {
    const token = await upstream(SSO);
    lifecycle(token, null, null);
    policy(28_800, null);
    expect((await select(token, 'org-a')).status).toBe(403);
    h.sqlite.run("DELETE FROM organization_session_policy WHERE organization_id = 'org-a'");
    expect((await select(token, 'org-a')).status).toBe(200);
  });
});

it('applies expected organization to verified OIDC cookie and Bearer writes', async () => {
  const token = await upstream(SOCIAL);
  await select(token, 'org-a');
  const selected = await select(token, 'org-b');
  if (selected.pair === undefined) throw new Error('OIDC selection cookie is absent');
  for (const bearer of [false, true]) {
    for (const expectation of [undefined, '', 'org-a', 'org-b, org-b', 'org-b']) {
      const before = h.sqlite.query('SELECT * FROM project').all();
      const response = await h.request('/api/projects', {
        method: 'POST',
        headers: {
          origin: 'http://localhost',
          'content-type': 'application/json',
          cookie: bearer ? selected.pair : `__Host-wbs_access=${token}; ${selected.pair}`,
          ...(bearer ? { authorization: `Bearer ${token}` } : {}),
          ...(expectation === undefined ? {} : { 'X-WBS-Expected-Organization': expectation }),
        },
        body: JSON.stringify({ name: 'OIDC scoped project' }),
      });
      expect(response.status).toBe(expectation === 'org-b' ? 200 : 409);
      if (expectation !== 'org-b') {
        expect(await response.json()).toEqual({ error: 'organization_context_changed' });
        expect(h.sqlite.query('SELECT * FROM project').all()).toEqual(before);
      }
    }
  }
});

it('a matching expectation cannot bypass SSO, membership, viewer or session policy', async () => {
  const token = await upstream(SOCIAL);
  const selected = await select(token, 'org-a');
  const attempt = () =>
    send(token, 'POST', '/api/projects', { selection: selected.pair, body: { name: 'refused' } });
  enforce();
  expect((await attempt()).body).toEqual(SSO_REQUIRED);
  const active = await send(token, 'GET', '/api/organization/active', { selection: selected.pair });
  expect(active.body).toEqual(SSO_REQUIRED);
  h.sqlite.run("UPDATE organization_sso_connection SET enforced = 0 WHERE id = 'conn-a'");
  h.sqlite.run(
    "UPDATE organization_membership SET role = 'viewer' WHERE organization_id = 'org-a' AND user_id = ?",
    [h.userId('mia')],
  );
  expect((await attempt()).body).toEqual({ error: 'forbidden' });
  h.sqlite.run(
    "UPDATE organization_membership SET role = 'member' WHERE organization_id = 'org-a' AND user_id = ?",
    [h.userId('mia')],
  );
  h.sqlite.run(
    "INSERT INTO organization_session_policy (organization_id, max_session_seconds, reauthenticate_after_seconds, created_at) VALUES ('org-a', 300, NULL, 1)",
  );
  expect((await attempt()).body).toMatchObject({ error: 'reauthentication_required' });
  expect(
    (await send(token, 'GET', '/api/organization/active', { selection: selected.pair })).body,
  ).toMatchObject({ error: 'reauthentication_required' });
  h.sqlite.run("DELETE FROM organization_session_policy WHERE organization_id = 'org-a'");
  h.sqlite.run(
    "DELETE FROM organization_membership WHERE organization_id = 'org-a' AND user_id = ?",
    [h.userId('mia')],
  );
  expect((await attempt()).body).toEqual({ error: 'not_a_member' });
});
