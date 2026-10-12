import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { FakeOidcProvider } from '../testing/fake-oidc-provider';
import { OrganizationHarness } from '../testing/organization-harness';

const DIGEST = 'a'.repeat(64);
const ISSUER = 'https://idp.test';

let harness: OrganizationHarness;
let provider: FakeOidcProvider;

/** A verified claim on `domain` with a `samlp` connection, proven when `proven`. */
function connection(organizationId: string, domain: string, name: string, proven: boolean) {
  harness.organization(organizationId);
  harness.sqlite.run(
    "INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, created_at) VALUES (?, ?, ?, 'verified', ?, 1, 1)",
    [`claim-${name}`, organizationId, domain, DIGEST],
  );
  harness.sqlite.run(
    "INSERT INTO organization_sso_connection (id, organization_id, domain_claim_id, auth0_connection, strategy, login_slug, enforced, proven_at, proven_by, created_at) VALUES (?, ?, ?, ?, 'samlp', ?, 0, ?, ?, 1)",
    [
      `conn-${name}`,
      organizationId,
      `claim-${name}`,
      name,
      `${name}-slug`,
      proven ? 5 : null,
      proven ? harness.userId('alice') : null,
    ],
  );
}

/** Signs in through the browser OIDC callback as `sub` with a verified `email`. */
async function signIn(sub: string, email: string): Promise<string | null> {
  const start = await harness.request('/api/auth/login');
  const binding = start.headers.getSetCookie().find((line) => line.startsWith('__Host-wbs_'));
  if (binding === undefined) throw new Error('login start set no binding cookie');
  const { state } = provider.lastAuthorization();
  provider.idTokenClaims = { iss: ISSUER, sub, email, email_verified: true };
  const callback = await harness.request(`/api/auth/okta/callback?code=c&state=${state}`, {
    headers: { cookie: binding.split(';')[0] ?? '' },
  });
  expect(callback.status).toBe(302);
  return callback.headers.get('location');
}

/** The account a pair maps to, with its address. */
const accountOf = (subject: string) =>
  harness.sqlite
    .query<{ email: string | null; email_verified: number }, [string]>(
      'SELECT users.email, users.email_verified FROM external_identity JOIN users ON users.id = external_identity.user_id WHERE external_identity.subject = ?',
    )
    .get(subject);
const verifiedHolders = (email: string) =>
  harness.sqlite
    .query<{ id: string }, [string]>(
      'SELECT id FROM users WHERE lower(email) = ? AND email_verified = 1',
    )
    .all(email);

beforeEach(async () => {
  provider = new FakeOidcProvider();
  harness = OrganizationHarness.open({ provider });
  await harness.register('alice');
  harness.sqlite.run("UPDATE users SET email = 'alice@a.test', email_verified = 1 WHERE id = ?", [
    harness.userId('alice'),
  ]);
  connection('org-b', 'b.test', 'b-saml', true);
  harness.activate();
});
afterEach(() => {
  harness.close();
});

/**
 * `organization-sso` "Enterprise identities have their email trusted only on
 * their connection's verified domain" (D4), through the login callback.
 */
describe('enterprise email trust', () => {
  it('trusts no foreign-domain email from a proven connection, and answers no account_exists', async () => {
    expect(await signIn('samlp|b-saml|x', 'alice@a.test')).toBe('/');
    expect(verifiedHolders('alice@a.test').map(({ id }) => id)).toEqual([harness.userId('alice')]);
    expect(accountOf('samlp|b-saml|x')).toMatchObject({ email_verified: 0 });
  });

  it("treats an unproven connection's email as unverified", async () => {
    connection('org-a', 'acme.test', 'acme-saml', false);
    expect(await signIn('samlp|acme-saml|bob@acme.test', 'bob@acme.test')).toBe('/');
    expect(accountOf('samlp|acme-saml|bob@acme.test')).toEqual({
      email: 'bob@acme.test',
      email_verified: 0,
    });
  });

  it("trusts a proven connection's email on its domain by canonical comparison", async () => {
    connection('org-a', 'acme.test', 'acme-saml', true);
    expect(await signIn('samlp|acme-saml|c', 'Carol@ACME.test')).toBe('/');
    expect(accountOf('samlp|acme-saml|c')).toEqual({
      email: 'carol@acme.test',
      email_verified: 1,
    });
  });

  it('still answers account_exists for a social identity with a held verified email', async () => {
    expect(await signIn('google-oauth2|1', 'alice@a.test')).toBe('/?auth_error=account_exists');
  });

  it('links a foreign-domain enterprise pair without claiming the held address', async () => {
    await harness.register('sam');
    const session = harness.token('sam');
    const start = await harness.request('/api/auth/link/auth0', {
      method: 'POST',
      headers: {
        cookie: `__Host-wbs_access=${session}`,
        origin: 'http://localhost',
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.9',
      },
      body: JSON.stringify({ password: 'correct-horse' }),
    });
    expect(start.status).toBe(200);
    const binding = /__Host-wbs_link=([^;]+)/.exec(start.headers.get('set-cookie') ?? '')?.[1];
    const { state } = provider.lastAuthorization();
    provider.idTokenClaims = {
      iss: ISSUER,
      sub: 'samlp|b-saml|y',
      email: 'alice@a.test',
      email_verified: true,
    };
    const callback = await harness.request(`/api/auth/link/auth0/callback?code=c&state=${state}`, {
      headers: { cookie: `__Host-wbs_link=${binding ?? ''}; __Host-wbs_access=${session}` },
    });
    expect(callback.headers.get('location')).toBe('/?auth_link=linked');
    expect(accountOf('samlp|b-saml|y')).toEqual({ email: null, email_verified: 0 });
    expect(verifiedHolders('alice@a.test').map(({ id }) => id)).toEqual([harness.userId('alice')]);
  });
});

/** The same rule through be-01's production service composition (`buildServices`). */
describe('enterprise email trust, composed', () => {
  it("trusts a proven connection's email on its domain", async () => {
    harness.close();
    provider = new FakeOidcProvider();
    harness = OrganizationHarness.openComposedWith({ provider });
    await harness.register('alice');
    connection('org-a', 'acme.test', 'acme-saml', true);
    harness.activate();
    expect(await signIn('samlp|acme-saml|c', 'Carol@ACME.test')).toBe('/');
    expect(accountOf('samlp|acme-saml|c')).toEqual({
      email: 'carol@acme.test',
      email_verified: 1,
    });
    expect(await signIn('samlp|acme-saml|d', 'dan@elsewhere.test')).toBe('/');
    expect(accountOf('samlp|acme-saml|d')).toMatchObject({ email_verified: 0 });
  });
});
