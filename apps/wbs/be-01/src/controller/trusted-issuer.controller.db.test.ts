import { JwksTokenVerifier } from '@wbs/auth';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { type LocalIssuer, LocalOidcIssuers } from '../testing/local-oidc-issuer';
import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { TEST_MCP_AUTHORIZATION_SERVER } from '../testing/machine-grant-fixture';
import { callForwarded, forwardingMachineGrants } from '../testing/mcp-forwarded-call';
import {
  type Answer,
  type HarnessMachineGrants,
  OrganizationHarness,
} from '../testing/organization-harness';

/** The tests' authorization server: every new audience sits under it (`wbs-mcp-agent-surface` M2). */
const ROOT = TEST_MCP_AUTHORIZATION_SERVER;

const PATH = '/api/organization/trusted-issuers';
const CONFIGURED = 'https://idp.test';

let issuers: LocalOidcIssuers;
let idp: LocalIssuer;
let ci: LocalIssuer;
let h: OrganizationHarness;
let machineGrants: HarnessMachineGrants;

beforeAll(async () => {
  machineGrants = await forwardingMachineGrants();
  issuers = new LocalOidcIssuers();
  idp = await issuers.add('idp.test');
});

afterAll(async () => {
  await issuers.stop();
});

/**
 * Trusted issuer administration (`wbs-machine-credentials` task 5.1, design
 * A16, A17) over be-01's production composition and real SQLite, discovering
 * against a local issuer: nothing here reaches a real IdP.
 */
beforeEach(async () => {
  ci = await issuers.add(`ci-${crypto.randomUUID().slice(0, 8)}.test`);
  h = openHarness();
  for (const username of ['dany', 'mem', 'vic', 'bob']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'dany', 'super_admin');
  h.member('org-a', 'mem', 'member');
  h.member('org-a', 'vic', 'viewer');
  h.member('org-b', 'bob', 'admin');
  for (const username of ['dany', 'mem', 'vic']) h.bind(username, 'org-a');
  h.bind('bob', 'org-b');
  h.activate();
  addAgentPerson(h.sqlite, 'claire', 'org-a', h.userId('dany'));
  addAgentPerson(h.sqlite, 'mems-agent', 'org-a', h.userId('mem'));
});

afterEach(() => {
  h.close();
});

function openHarness(): OrganizationHarness {
  return OrganizationHarness.openComposedWith({
    upstreamCredential: {
      verifier: new JwksTokenVerifier({
        audience: 'api://wbs',
        issuer: CONFIGURED,
        jwksUri: issuers.directJwksUrl(idp),
      }),
      groupPrefix: 'dev',
      groupsClaim: 'wbs_groups',
    },
    trustedIssuers: { fetch: issuers.fetch, configuredIssuer: CONFIGURED },
    machineGrants,
  });
}

/** Registers as `username`, with the audience `<ROOT>/aud-<username>` unless `body` names one. */
function register(username: string, body: Record<string, unknown>): Promise<Answer> {
  return h.call(username, 'POST', PATH, { audience: `${ROOT}/aud-${username}`, ...body });
}

function issuerRows(): unknown[] {
  return h.sqlite.query('SELECT id FROM organization_trusted_issuer').all();
}

function auditRows(): { action: string; actor_id: string; subject_id: string; detail: string }[] {
  return h.sqlite
    .query<{ action: string; actor_id: string; subject_id: string; detail: string }, []>(
      "SELECT action, actor_id, subject_id, detail FROM organization_audit WHERE subject_kind = 'trusted_issuer' ORDER BY created_at, id",
    )
    .all();
}

/** A connection record of `organizationId` on its own domain claim. */
function addConnection(
  id: string,
  organizationId: string,
  strategy: 'oidc' | 'samlp',
  proven: boolean,
): void {
  h.sqlite.run(
    "INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, created_at) VALUES (?, ?, ?, 'verified', 'proof', 1, 1)",
    [`claim-${id}`, organizationId, `${id}.example.org`],
  );
  h.sqlite.run(
    'INSERT INTO organization_sso_connection (id, organization_id, domain_claim_id, auth0_connection, strategy, login_slug, enforced, proven_at, proven_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 1)',
    [
      id,
      organizationId,
      `claim-${id}`,
      `auth0-${id}`,
      strategy,
      `slug-${id}`,
      proven ? 1 : null,
      proven ? h.userId('dany') : null,
    ],
  );
}

/** An OIDC credential of org-a for `subject` under trusted issuer `trustedIssuerId`. */
async function createOidc(trustedIssuerId: string, subject: string, name: string) {
  const created = await h.call('dany', 'POST', '/api/organization/machine-credentials', {
    source: 'oidc',
    name,
    personId: 'claire',
    trustedIssuerId,
    subject,
  });
  if (created.status !== 201) throw new Error(`create refused: ${JSON.stringify(created)}`);
  return (created.body as { id: string }).id;
}

describe('registering a trusted issuer', () => {
  it('lists the audience root every new audience must sit under', async () => {
    expect(await h.call('dany', 'GET', PATH)).toEqual({
      status: 200,
      body: { trustedIssuers: [], audienceRoot: ROOT },
    });
  });

  it('refuses a look-alike or wbs:org audience audience_not_wbs, fetching and storing nothing', async () => {
    for (const audience of [`${ROOT}.evil.example`, 'wbs:org:org-a', 'https://wbs.example/mcp'])
      expect(await register('dany', { issuer: ci.url, audience })).toEqual({
        status: 400,
        body: { error: 'audience_not_wbs' },
      });
    expect(ci.discoveryFetches).toBe(0);
    expect(auditRows()).toEqual([]);
    expect((await h.call('dany', 'GET', PATH)).body).toMatchObject({ trustedIssuers: [] });
    // The audience root itself, and any path under it, is WBS's.
    expect((await register('dany', { issuer: ci.url, audience: ROOT })).status).toBe(201);
  });

  it('answers a member forbidden before judging the audience', async () => {
    expect(await register('mem', { issuer: ci.url, audience: 'wbs:org:org-a' })).toMatchObject({
      status: 403,
      body: { error: 'forbidden' },
    });
  });

  it('discovers once, lists the jwks_uri and audits the registration', async () => {
    const registered = await register('dany', { issuer: ci.url, audience: `${ROOT}/org/org-a` });
    expect(registered).toMatchObject({
      status: 201,
      body: {
        issuer: ci.url,
        jwksUri: ci.jwksUri,
        audience: `${ROOT}/org/org-a`,
        ssoConnectionId: null,
        createdBy: h.userId('dany'),
        machineCredentials: 0,
      },
    });
    expect(ci.discoveryFetches).toBe(1);
    expect(ci.jwksFetches).toBe(0);
    const id = (registered.body as { id: string }).id;
    expect(await h.call('dany', 'GET', PATH)).toMatchObject({
      status: 200,
      body: { trustedIssuers: [{ id, issuer: ci.url, jwksUri: ci.jwksUri }] },
    });
    const audit = auditRows();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'trusted_issuer_registered',
      actor_id: h.userId('dany'),
      subject_id: id,
    });
    const detail = JSON.parse(audit[0]?.detail ?? '{}') as Record<string, unknown>;
    expect(detail).toMatchObject({ issuer: ci.url, jwksUri: ci.jwksUri });
    expect(detail).not.toHaveProperty('audience');
    expect(audit[0]?.detail).not.toContain(`${ROOT}/org/org-a`);
  });

  // Proof: with `trustedIssuerDiscovery`'s catch rethrowing, the unroutable
  // case answered 500; watched 2026-10-22.
  it('refuses an unreachable issuer, storing nothing', async () => {
    ci.discoveryStatus = 503;
    expect(await register('dany', { issuer: ci.url })).toEqual({
      status: 409,
      body: { error: 'issuer_unreachable' },
    });
    expect(await register('dany', { issuer: 'https://nowhere.test' })).toEqual({
      status: 409,
      body: { error: 'issuer_unreachable' },
    });
    expect(issuerRows()).toEqual([]);
    expect(auditRows()).toEqual([]);
  });

  // Proof: with the issuer-equality check removed from
  // `trustedIssuerDiscovery`, this registered the disagreeing issuer;
  // watched 2026-10-22.
  it('refuses a document naming another issuer, storing nothing', async () => {
    ci.discoveryIssuer = 'https://elsewhere.test';
    expect(await register('dany', { issuer: ci.url })).toEqual({
      status: 409,
      body: { error: 'issuer_mismatch' },
    });
    ci.discoveryIssuer = `${ci.url}/`;
    expect(await register('dany', { issuer: ci.url })).toEqual({
      status: 409,
      body: { error: 'issuer_mismatch' },
    });
    expect(issuerRows()).toEqual([]);
  });

  // Proof: with the route's `issuer_reserved` refusal removed, this fetched
  // the configured issuer's discovery and registered it; watched 2026-10-22.
  it('refuses the configured sign-in issuer, fetching nothing', async () => {
    const before = idp.discoveryFetches;
    expect(await register('dany', { issuer: CONFIGURED })).toEqual({
      status: 409,
      body: { error: 'issuer_reserved' },
    });
    expect(idp.discoveryFetches).toBe(before);
    expect(issuerRows()).toEqual([]);
  });

  it('refuses an issuer the organization already trusts, before discovering again', async () => {
    expect((await register('dany', { issuer: ci.url })).status).toBe(201);
    expect(await register('dany', { issuer: ci.url })).toEqual({
      status: 409,
      body: { error: 'issuer_taken' },
    });
    expect(ci.discoveryFetches).toBe(1);
    expect(issuerRows()).toHaveLength(1);
    h.bind('bob', 'org-b');
    expect((await register('bob', { issuer: ci.url })).status).toBe(201);
  });

  it('refuses a body whose issuer is no HTTPS issuer URL', async () => {
    for (const issuer of [
      'http://ci.test',
      'ci.test',
      'https://ci.test/?x=1',
      'https://ci.test#f',
      `${ci.url}/tenant|subject`,
    ])
      expect(await register('dany', { issuer })).toEqual({
        status: 400,
        body: { error: 'invalid_body' },
      });
    expect(issuerRows()).toEqual([]);
  });

  it('refuses a body without an audience', async () => {
    expect(await h.call('dany', 'POST', PATH, { issuer: ci.url })).toEqual({
      status: 400,
      body: { error: 'invalid_body' },
    });
    expect(await h.call('dany', 'POST', PATH, { issuer: ci.url, audience: '' })).toEqual({
      status: 400,
      body: { error: 'invalid_body' },
    });
    expect(ci.discoveryFetches).toBe(0);
  });

  it('refuses an issuer on a literal IP or a private name, fetching nothing', async () => {
    for (const issuer of [
      'https://127.0.0.1',
      'https://10.0.0.8/realm',
      'https://169.254.169.254',
      'https://[::1]',
      'https://[fd00::1]',
      'https://localhost',
      'https://metadata.internal',
      'https://printer.local',
      'https://app.localhost',
    ])
      expect(await register('dany', { issuer })).toEqual({
        status: 400,
        body: { error: 'invalid_body' },
      });
    expect(issuerRows()).toEqual([]);
  });

  // Proof: with the `audience_taken` refusal removed from
  // `registrationRefusal`, this answered 500 on the unique index instead of
  // 409; watched 2026-10-22.
  it('refuses a second organization the same issuer and audience', async () => {
    expect((await register('dany', { issuer: ci.url, audience: `${ROOT}/shared` })).status).toBe(
      201,
    );
    expect(await register('bob', { issuer: ci.url, audience: `${ROOT}/shared` })).toEqual({
      status: 409,
      body: { error: 'audience_taken' },
    });
    expect((await register('bob', { issuer: ci.url, audience: `${ROOT}/org/org-b` })).status).toBe(
      201,
    );
    expect(issuerRows()).toHaveLength(2);
  });

  // Proof: with the `trusted_issuer_limit` refusal removed, the ninth
  // registered (201); watched 2026-10-22.
  it('refuses a ninth trusted issuer', async () => {
    for (let n = 0; n < 8; n += 1) {
      const each = await issuers.add(`many-${String(n)}-${crypto.randomUUID().slice(0, 6)}.test`);
      expect((await register('dany', { issuer: each.url })).status).toBe(201);
    }
    expect(await register('dany', { issuer: ci.url })).toEqual({
      status: 409,
      body: { error: 'trusted_issuer_limit' },
    });
    expect(ci.discoveryFetches).toBe(0);
    expect(issuerRows()).toHaveLength(8);
  });

  it('registers on a proven OIDC connection of the organization', async () => {
    addConnection('okta', 'org-a', 'oidc', true);
    expect(await register('dany', { issuer: ci.url, ssoConnectionId: 'okta' })).toMatchObject({
      status: 201,
      body: { ssoConnectionId: 'okta' },
    });
  });

  // Proof: with the strategy check removed from `registrationRefusal`, this
  // registered on the SAML connection; watched 2026-10-22.
  it('refuses a SAML connection as the gate', async () => {
    addConnection('saml', 'org-a', 'samlp', true);
    expect(await register('dany', { issuer: ci.url, ssoConnectionId: 'saml' })).toEqual({
      status: 409,
      body: { error: 'issuer_not_oidc' },
    });
    expect(ci.discoveryFetches).toBe(0);
    expect(issuerRows()).toEqual([]);
  });

  // Proof: with the proof check removed from `registrationRefusal`, this
  // registered on the unproven connection; watched 2026-10-22.
  it('refuses an unproven connection as the gate', async () => {
    addConnection('draft', 'org-a', 'oidc', false);
    expect(await register('dany', { issuer: ci.url, ssoConnectionId: 'draft' })).toEqual({
      status: 409,
      body: { error: 'sso_connection_unproven' },
    });
    expect(issuerRows()).toEqual([]);
  });

  // Proof: with the organization predicate dropped from the connection read,
  // this registered on B's proven connection; watched 2026-10-22.
  it("refuses another organization's connection", async () => {
    addConnection('b-okta', 'org-b', 'oidc', true);
    expect(await register('dany', { issuer: ci.url, ssoConnectionId: 'b-okta' })).toEqual({
      status: 404,
      body: { error: 'unknown_sso_connection' },
    });
    expect(issuerRows()).toEqual([]);
  });

  // Proof: with `register`'s audit append's failure caught and dropped, this
  // answered 201 instead of 500; watched 2026-10-22.
  it('stores no trusted issuer when the audit row cannot be written', async () => {
    h.sqlite.run(
      "CREATE TRIGGER refuse_audit BEFORE INSERT ON organization_audit BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END",
    );
    expect((await register('dany', { issuer: ci.url })).status).toBe(500);
    expect(issuerRows()).toEqual([]);
  });
});

describe('removing a trusted issuer', () => {
  it('removes an unused issuer and audits it', async () => {
    const id = ((await register('dany', { issuer: ci.url })).body as { id: string }).id;
    expect(await h.call('dany', 'DELETE', `${PATH}/${id}`)).toEqual({ status: 204, body: null });
    expect(issuerRows()).toEqual([]);
    expect(auditRows().map((row) => row.action)).toEqual([
      'trusted_issuer_registered',
      'trusted_issuer_removed',
    ]);
    expect(await h.call('dany', 'DELETE', `${PATH}/${id}`)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
  });

  // Proof: with the `in_use` refusal removed from `remove`, this answered 500
  // on the foreign key instead of 409; watched 2026-10-22.
  it('refuses removing an issuer two live credentials name, then removes it once both are revoked', async () => {
    const id = ((await register('dany', { issuer: ci.url })).body as { id: string }).id;
    const first = await createOidc(id, 'repo:acme/wbs:ref:refs/heads/main', 'main');
    const second = await createOidc(id, 'repo:acme/wbs:ref:refs/heads/next', 'next');
    expect(await h.call('dany', 'GET', PATH)).toMatchObject({
      body: { trustedIssuers: [{ id, machineCredentials: 2 }] },
    });
    expect(await h.call('dany', 'DELETE', `${PATH}/${id}`)).toEqual({
      status: 409,
      body: { error: 'in_use', machineCredentials: 2 },
    });
    expect(issuerRows()).toHaveLength(1);
    for (const credential of [first, second])
      expect(
        (await h.call('dany', 'DELETE', `/api/organization/machine-credentials/${credential}`))
          .status,
      ).toBe(204);
    expect((await h.call('dany', 'DELETE', `${PATH}/${id}`)).status).toBe(204);
    expect(issuerRows()).toEqual([]);
    expect(h.sqlite.query('SELECT id FROM machine_credential').all()).toEqual([]);
    expect(
      h.sqlite
        .query("SELECT action FROM organization_audit WHERE action = 'machine_credential_revoked'")
        .all(),
    ).toHaveLength(2);
  });

  it("answers another organization's issuer not_found", async () => {
    const id = ((await register('bob', { issuer: ci.url })).body as { id: string }).id;
    expect(await h.call('dany', 'DELETE', `${PATH}/${id}`)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(issuerRows()).toHaveLength(1);
  });
});

describe('who may administer trusted issuers', () => {
  // Proof: with members admitted by `administering`, this answered the
  // member's list 200; watched 2026-10-22.
  it('refuses a member and a viewer every trusted issuer route', async () => {
    const id = ((await register('dany', { issuer: ci.url })).body as { id: string }).id;
    for (const username of ['mem', 'vic'])
      for (const [method, path, body] of [
        ['GET', PATH, undefined],
        ['POST', PATH, { issuer: ci.url, audience: 'x' }],
        ['DELETE', `${PATH}/${id}`, undefined],
      ] as const)
        expect(await h.call(username, method, path, body)).toEqual({
          status: 403,
          body: { error: 'forbidden' },
        });
    expect(ci.discoveryFetches).toBe(1);
    expect(issuerRows()).toHaveLength(1);
  });

  it('refuses a machine key every trusted issuer route', async () => {
    const id = ((await register('dany', { issuer: ci.url })).body as { id: string }).id;
    const { key } = await issueApiKey(h.sqlite, {
      organizationId: 'org-a',
      personId: 'claire',
      issuedBy: h.userId('dany'),
    });
    for (const [method, path, body] of [
      ['GET', PATH, undefined],
      ['POST', PATH, { issuer: ci.url, audience: 'x' }],
      ['DELETE', `${PATH}/${id}`, undefined],
    ] as const) {
      // The routes are `humanOnly`, so mcp-01 lists no tool for them; be-01
      // still refuses the forwarded grant.
      expect(await callForwarded(h, key, method, path, body)).toEqual({
        status: 403,
        body: { error: 'insufficient_scope' },
      });
      // Removed by 7.1 (M9): the key itself as a Bearer on `/api`.
      expect(await h.callWith(key, method, path, body)).toEqual({
        status: 403,
        body: { error: 'insufficient_scope' },
      });
    }
    expect(issuerRows()).toHaveLength(1);
  });

  it('answers every trusted issuer route no_active_organization before activation', async () => {
    h.close();
    h = openHarness();
    await h.register('dany');
    h.organization('org-a');
    h.member('org-a', 'dany', 'super_admin');
    for (const [method, path, body] of [
      ['GET', PATH, undefined],
      ['POST', PATH, { issuer: ci.url, audience: 'x' }],
      ['DELETE', `${PATH}/${crypto.randomUUID()}`, undefined],
    ] as const)
      expect(await h.call('dany', method, path, body)).toEqual({
        status: 403,
        body: { error: 'no_active_organization' },
      });
    expect(ci.discoveryFetches).toBe(0);
    expect(issuerRows()).toEqual([]);
  });
});
