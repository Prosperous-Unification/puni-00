import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { FakeOidcProvider } from '../testing/fake-oidc-provider';
import { OrganizationHarness } from '../testing/organization-harness';

const DIGEST = 'a'.repeat(64);

let harness: OrganizationHarness;
let provider: FakeOidcProvider;

/** Inserts a claim of `organizationId` on `domain` in `status`. */
function claim(id: string, organizationId: string, domain: string, status: string): void {
  harness.sqlite.run(
    'INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, created_at) VALUES (?, ?, ?, ?, ?, 1, 1)',
    [id, organizationId, domain, status, DIGEST],
  );
}

/** Records `auth0Connection` with `slug` on claim `claimId`, unproven. */
function connection(id: string, claimId: string, auth0Connection: string, slug: string): void {
  harness.sqlite.run(
    "INSERT INTO organization_sso_connection (id, organization_id, domain_claim_id, auth0_connection, strategy, login_slug, enforced, created_at) SELECT ?, organization_id, id, ?, 'samlp', ?, 0, 1 FROM organization_domain_claim WHERE id = ?",
    [id, auth0Connection, slug, claimId],
  );
}

/** Starts a login with `query` and answers the response and what reached `/authorize`. */
async function login(query: string) {
  const before = provider.authorizations.length;
  const response = await harness.request(`/api/auth/login?${query}`);
  const authorization =
    provider.authorizations.length > before ? provider.lastAuthorization() : null;
  return { response, authorization };
}

beforeEach(() => {
  provider = new FakeOidcProvider();
  harness = OrganizationHarness.open({ provider });
  harness.organization('org-a');
  harness.organization('org-s');
  claim('claim-a', 'org-a', 'acme.test', 'verified');
  claim('claim-s', 'org-s', 'susp.test', 'suspended');
  connection('conn-a', 'claim-a', 'acme-saml', 'acme');
  connection('conn-s', 'claim-s', 'susp-saml', 'susp');
});
afterEach(() => {
  harness.close();
});

/** `organization-sso` "Login is routed to the enterprise connection" (D3). */
describe('enterprise login routing', () => {
  it('routes a slug to its connection', async () => {
    const { response, authorization } = await login('organization=acme');
    expect(response.status).toBe(302);
    expect(authorization?.connection).toBe('acme-saml');
    expect(authorization?.prompt).toBeUndefined();
    expect(authorization?.maxAge).toBeUndefined();
  });

  it('routes a verified-domain email by its canonical domain', async () => {
    const { response, authorization } = await login('email=Bob%40ACME.test');
    expect(response.status).toBe(302);
    expect(authorization?.connection).toBe('acme-saml');
  });

  it('sends no connection for an unrouted domain or a suspended claim', async () => {
    for (const email of ['bob@other.test', 'bob@susp.test']) {
      const { response, authorization } = await login(`email=${encodeURIComponent(email)}`);
      expect(response.status).toBe(302);
      expect(authorization).not.toBeNull();
      expect(authorization?.connection).toBeUndefined();
    }
  });

  it('keeps routing a suspended claim by slug', async () => {
    const { authorization } = await login('organization=susp');
    expect(authorization?.connection).toBe('susp-saml');
  });

  it("sends prompt=login and max_age under the organization's session policy", async () => {
    harness.sqlite.run(
      "INSERT INTO organization_session_policy (organization_id, max_session_seconds, reauthenticate_after_seconds, created_at) VALUES ('org-a', 86400, 3600, 1)",
    );
    const bySlug = await login('organization=acme');
    expect(bySlug.authorization).toMatchObject({
      connection: 'acme-saml',
      prompt: 'login',
      maxAge: 3600,
    });
    const byEmail = await login('email=bob%40acme.test');
    expect(byEmail.authorization).toMatchObject({ prompt: 'login', maxAge: 3600 });
    harness.sqlite.run(
      "UPDATE organization_session_policy SET reauthenticate_after_seconds = NULL WHERE organization_id = 'org-a'",
    );
    const sessionOnly = await login('organization=acme');
    expect(sessionOnly.authorization?.prompt).toBe('login');
    expect(sessionOnly.authorization?.maxAge).toBeUndefined();
  });

  it('refuses two hints, a malformed email or slug, and saves no transaction', async () => {
    for (const query of [
      'organization=acme&method=google',
      'email=bob%40acme.test&organization=acme',
      'email=bob%40acme.test&method=google',
      'email=not-an-address',
      'email=bob%40',
      'email=bob%40exa%2Fmple.test',
      'organization=AC',
      'organization=acme_corp',
    ]) {
      const { response, authorization } = await login(query);
      expect({ query, status: response.status, body: (await response.json()) as unknown }).toEqual({
        query,
        status: 400,
        body: { error: 'invalid_query' },
      });
      expect(authorization).toBeNull();
    }
    expect(provider.savedTransactions).toBe(0);
  });

  it('answers an unknown slug 404 and saves no transaction', async () => {
    const { response, authorization } = await login('organization=nope');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'sso_connection_not_found' });
    expect(authorization).toBeNull();
    expect(provider.savedTransactions).toBe(0);
  });

  it('keeps the unhinted and method logins', async () => {
    expect((await login('')).authorization?.connection).toBeUndefined();
    expect((await login('method=google')).authorization?.connection).toBe('google-oauth2');
    expect(provider.savedTransactions).toBe(2);
  });
});
