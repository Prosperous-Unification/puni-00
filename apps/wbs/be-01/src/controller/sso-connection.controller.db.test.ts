import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { generateKeyPair, SignJWT } from 'jose';

import { DELEGATION_TOKEN_TYPE } from '../runtime/delegation';
import { OrganizationHarness } from '../testing/organization-harness';

const PATH = '/api/organization/sso-connections';
const DIGEST = 'a'.repeat(64);
const draft = {
  domainClaimId: 'claim-a',
  auth0Connection: 'acme-saml',
  strategy: 'samlp',
  loginSlug: 'acme',
} as const;

let harness: OrganizationHarness;

/** Inserts a claim of `organizationId` on `domain` in `status`. */
function claim(id: string, organizationId: string, domain: string, status: string): void {
  if (status === 'pending')
    harness.sqlite.run(
      "INSERT INTO organization_domain_claim (id, organization_id, domain, status, challenge_digest, challenge_expires_at, created_at) VALUES (?, ?, ?, 'pending', 'c', 9, 1)",
      [id, organizationId, domain],
    );
  else
    harness.sqlite.run(
      'INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, created_at) VALUES (?, ?, ?, ?, ?, 1, 1)',
      [id, organizationId, domain, status, DIGEST],
    );
}

const connections = () =>
  harness.sqlite
    .query(
      'SELECT id, organization_id, domain_claim_id, login_slug, enforced, proven_at FROM organization_sso_connection ORDER BY login_slug',
    )
    .all();
const audits = () =>
  harness.sqlite
    .query<{ organization_id: string; actor_id: string; action: string; subject_id: string }, []>(
      'SELECT organization_id, actor_id, action, subject_id FROM organization_audit',
    )
    .all();

beforeEach(async () => {
  harness = OrganizationHarness.open();
  await harness.register('owner');
  await harness.register('admin');
  await harness.register('other');
  harness.organization('org-a');
  harness.organization('org-b');
  harness.member('org-a', 'owner', 'super_admin');
  harness.member('org-a', 'admin', 'admin');
  harness.member('org-b', 'other', 'super_admin');
  harness.bind('owner', 'org-a');
  harness.bind('admin', 'org-a');
  harness.bind('other', 'org-b');
  claim('claim-a', 'org-a', 'acme.test', 'verified');
  claim('claim-p', 'org-a', 'pending.test', 'pending');
  claim('claim-s', 'org-a', 'susp.test', 'suspended');
  claim('claim-b', 'org-b', 'b.test', 'verified');
});
afterEach(() => {
  harness.close();
});

/**
 * `organization-sso` "A super-admin records one enterprise connection per
 * verified domain", mounted over real SQLite and the production store.
 */
describe('enterprise connection administration', () => {
  it('records an unproven, unenforced connection on a verified domain with one audit row', async () => {
    harness.activate();
    const created = await harness.call('owner', 'POST', PATH, draft);
    expect(created.status).toBe(201);
    const { connection } = created.body as { connection: { id: string } };
    expect(created.body).toEqual({
      connection: {
        id: connection.id,
        domainClaimId: 'claim-a',
        domain: 'acme.test',
        auth0Connection: 'acme-saml',
        strategy: 'samlp',
        loginSlug: 'acme',
        enforced: false,
        provenAt: null,
        provenBy: null,
        lastPrefixMismatchAt: null,
      },
    });
    expect(audits()).toEqual([
      {
        organization_id: 'org-a',
        actor_id: harness.userId('owner'),
        action: 'sso_connection_created',
        subject_id: connection.id,
      },
    ]);
    expect(await harness.call('owner', 'GET', PATH)).toEqual({
      status: 200,
      body: { connections: [connection] },
    });
  });

  it('refuses a pending or suspended domain and stores nothing', async () => {
    harness.activate();
    for (const domainClaimId of ['claim-p', 'claim-s'])
      expect(await harness.call('owner', 'POST', PATH, { ...draft, domainClaimId })).toEqual({
        status: 409,
        body: { error: 'domain_not_verified' },
      });
    expect(connections()).toEqual([]);
    expect(audits()).toEqual([]);
  });

  it('refuses a second connection on one domain and a slug already taken', async () => {
    harness.activate();
    expect((await harness.call('owner', 'POST', PATH, draft)).status).toBe(201);
    expect(await harness.call('owner', 'POST', PATH, { ...draft, loginSlug: 'acme-two' })).toEqual({
      status: 409,
      body: { error: 'sso_connection_exists' },
    });
    expect(
      await harness.call('other', 'POST', PATH, { ...draft, domainClaimId: 'claim-b' }),
    ).toEqual({ status: 409, body: { error: 'login_slug_taken' } });
    expect(connections()).toHaveLength(1);
  });

  it('refuses malformed connection names, strategies and slugs', async () => {
    harness.activate();
    for (const body of [
      { ...draft, auth0Connection: 'acme saml' },
      { ...draft, auth0Connection: '' },
      { ...draft, strategy: 'google-oauth2' },
      { ...draft, loginSlug: 'AC' },
      { ...draft, loginSlug: 'acme_corp' },
    ])
      expect((await harness.call('owner', 'POST', PATH, body)).status).toBe(400);
    expect(connections()).toEqual([]);
  });

  it('refuses an admin, a foreign claim and an inactive organization, changing nothing', async () => {
    expect(await harness.call('owner', 'POST', PATH, draft)).toEqual({
      status: 403,
      body: { error: 'no_active_organization' },
    });
    expect(await harness.call('owner', 'GET', PATH)).toEqual({
      status: 403,
      body: { error: 'no_active_organization' },
    });
    harness.activate();
    const created = await harness.call('owner', 'POST', PATH, draft);
    const { id } = (created.body as { connection: { id: string } }).connection;
    expect(await harness.call('admin', 'POST', PATH, { ...draft, loginSlug: 'other' })).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(await harness.call('admin', 'GET', PATH)).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(await harness.call('admin', 'PATCH', `${PATH}/${id}`, { loginSlug: 'other' })).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(await harness.call('admin', 'DELETE', `${PATH}/${id}`)).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(
      await harness.call('owner', 'POST', PATH, {
        ...draft,
        domainClaimId: 'claim-b',
        loginSlug: 'bee',
      }),
    ).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(await harness.call('other', 'PATCH', `${PATH}/${id}`, { loginSlug: 'stolen' })).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(await harness.call('other', 'DELETE', `${PATH}/${id}`)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(await harness.call('other', 'GET', PATH)).toEqual({
      status: 200,
      body: { connections: [] },
    });
    expect(connections()).toEqual([
      {
        id,
        organization_id: 'org-a',
        domain_claim_id: 'claim-a',
        login_slug: 'acme',
        enforced: 0,
        proven_at: null,
      },
    ]);
    expect(audits()).toHaveLength(1);
  });

  it('refuses a delegated caller even with current super-admin membership', async () => {
    const keys = await generateKeyPair('RS256');
    harness.close();
    harness = OrganizationHarness.open({ delegationKey: keys.publicKey });
    await harness.register('owner');
    harness.organization('org-a');
    harness.member('org-a', 'owner', 'super_admin');
    harness.bind('owner', 'org-a');
    claim('claim-a', 'org-a', 'acme.test', 'verified');
    harness.sqlite.run(
      "INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES ('map', ?, 'https://idp.test', 'owner-sub', 1)",
      [harness.userId('owner')],
    );
    harness.activate();
    const token = await new SignJWT({
      username: 'owner',
      org: 'org-a',
      client: 'client-1',
      grant: 'family-1',
      scope: 'read write',
      upstream_iss: 'https://idp.test',
      upstream_sub: 'owner-sub',
    })
      .setProtectedHeader({ alg: 'RS256', typ: DELEGATION_TOKEN_TYPE })
      .setIssuer('wbs')
      .setSubject(harness.userId('owner'))
      .setAudience('wbs-be-01/via-mcp-01')
      .setJti(crypto.randomUUID())
      .setIssuedAt()
      .setExpirationTime('2m')
      .sign(keys.privateKey);
    expect(await harness.callWith(token, 'GET', PATH)).toEqual({
      status: 403,
      body: { error: 'insufficient_scope' },
    });
    expect(connections()).toEqual([]);
  });

  it('changes a connection, and refuses enforcing an unproven one', async () => {
    harness.activate();
    const created = await harness.call('owner', 'POST', PATH, draft);
    const { id } = (created.body as { connection: { id: string } }).connection;
    const changed = await harness.call('owner', 'PATCH', `${PATH}/${id}`, {
      loginSlug: 'acme-corp',
    });
    expect(changed.status).toBe(200);
    expect((changed.body as { connection: { loginSlug: string } }).connection.loginSlug).toBe(
      'acme-corp',
    );
    expect(await harness.call('owner', 'PATCH', `${PATH}/${id}`, { enforced: true })).toEqual({
      status: 409,
      body: { error: 'sso_connection_unproven' },
    });
    // Until the principal carries its authenticating pair (D1), no actor can
    // pass the lockout guard, so even a proven connection stays unenforced.
    harness.sqlite.run(
      'UPDATE organization_sso_connection SET proven_at = 5, proven_by = ? WHERE id = ?',
      [harness.userId('owner'), id],
    );
    expect(await harness.call('owner', 'PATCH', `${PATH}/${id}`, { enforced: true })).toEqual({
      status: 409,
      body: { error: 'enforcement_would_lock_out_actor' },
    });
    for (const body of [{}, { enforced: true, loginSlug: 'both' }])
      expect(await harness.call('owner', 'PATCH', `${PATH}/${id}`, body)).toEqual({
        status: 400,
        body: { error: 'invalid_body' },
      });
    expect(audits().map(({ action }) => action)).toEqual([
      'sso_connection_created',
      'sso_connection_updated',
    ]);
  });

  it('refuses deleting the connection while a provisioning token is live, then deletes', async () => {
    harness.activate();
    const created = await harness.call('owner', 'POST', PATH, draft);
    const { id } = (created.body as { connection: { id: string } }).connection;
    harness.sqlite.run(
      "INSERT INTO organization_scim_token (id, organization_id, digest, created_at) VALUES ('token-a', 'org-a', ?, 1)",
      [DIGEST],
    );
    expect(await harness.call('owner', 'DELETE', `${PATH}/${id}`)).toEqual({
      status: 409,
      body: { error: 'provisioning_active' },
    });
    expect(connections()).toHaveLength(1);
    harness.sqlite.run("UPDATE organization_scim_token SET revoked_at = 2 WHERE id = 'token-a'");
    expect(await harness.call('owner', 'DELETE', `${PATH}/${id}`)).toEqual({
      status: 204,
      body: null,
    });
    expect(connections()).toEqual([]);
    expect(audits().map(({ action }) => action)).toEqual([
      'sso_connection_created',
      'sso_connection_deleted',
    ]);
  });

  it('refuses releasing a domain while a connection names it', async () => {
    harness.activate();
    const created = await harness.call('owner', 'POST', PATH, draft);
    const { id } = (created.body as { connection: { id: string } }).connection;
    expect(await harness.call('owner', 'DELETE', '/api/organization/domains/claim-a')).toEqual({
      status: 409,
      body: { error: 'sso_connection_exists' },
    });
    expect(
      harness.sqlite
        .query("SELECT status FROM organization_domain_claim WHERE id = 'claim-a'")
        .get(),
    ).toEqual({ status: 'verified' });
    expect((await harness.call('owner', 'DELETE', `${PATH}/${id}`)).status).toBe(204);
    expect(
      (await harness.call('owner', 'DELETE', '/api/organization/domains/claim-a')).status,
    ).toBe(204);
  });
});
