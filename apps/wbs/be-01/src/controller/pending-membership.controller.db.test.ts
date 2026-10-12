import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { FakeOidcProvider } from '../testing/fake-oidc-provider';
import { OrganizationHarness } from '../testing/organization-harness';

const DIGEST = 'a'.repeat(64);
const ISSUER = 'https://idp.test';

let harness: OrganizationHarness;
let provider: FakeOidcProvider;

/** A pending SCIM record for `userName` in org-a. */
const pending = (id: string, userName: string) =>
  harness.sqlite.run(
    "INSERT INTO organization_scim_user (id, organization_id, user_name, active, created_at, updated_at) VALUES (?, 'org-a', ?, 1, 1, 1)",
    [id, userName],
  );

/** Signs in through the browser OIDC callback; answers the redirect location. */
async function signIn(sub: string, email: string, verified: boolean): Promise<string | null> {
  const start = await harness.request('/api/auth/login');
  const binding = start.headers.getSetCookie().find((line) => line.startsWith('__Host-wbs_'));
  if (binding === undefined) throw new Error('login start set no binding cookie');
  const { state } = provider.lastAuthorization();
  provider.idTokenClaims = { iss: ISSUER, sub, email, email_verified: verified };
  const callback = await harness.request(`/api/auth/okta/callback?code=c&state=${state}`, {
    headers: { cookie: binding.split(';')[0] ?? '' },
  });
  expect(callback.status).toBe(302);
  return callback.headers.get('location');
}

/** Links `sub` to `username`'s password session through the plain explicit link. */
async function link(username: string, sub: string, email: string): Promise<string | null> {
  const session = harness.token(username);
  const start = await harness.request('/api/auth/link/auth0', {
    method: 'POST',
    headers: {
      cookie: `__Host-wbs_access=${session}`,
      origin: 'http://localhost',
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.7',
    },
    body: JSON.stringify({ password: 'correct-horse' }),
  });
  expect(start.status).toBe(200);
  const binding = /__Host-wbs_link=([^;]+)/.exec(start.headers.get('set-cookie') ?? '')?.[1];
  if (binding === undefined) throw new Error('link start set no binding cookie');
  const { state } = provider.lastAuthorization();
  provider.idTokenClaims = { iss: ISSUER, sub, email, email_verified: true };
  const callback = await harness.request(`/api/auth/link/auth0/callback?code=c&state=${state}`, {
    headers: { cookie: `__Host-wbs_link=${binding}; __Host-wbs_access=${session}` },
  });
  return new URL(callback.headers.get('location') ?? '', 'http://localhost').searchParams.get(
    'auth_link',
  );
}

const membershipsOf = (subject: string) =>
  harness.sqlite
    .query<{ organization_id: string; role: string }, [string]>(
      'SELECT m.organization_id, m.role FROM organization_membership m JOIN external_identity e ON e.user_id = m.user_id WHERE e.subject = ?',
    )
    .all(subject);
const record = (id: string) =>
  harness.sqlite
    .query<{ user_id: string | null; subject: string | null }, [string]>(
      'SELECT user_id, subject FROM organization_scim_user WHERE id = ?',
    )
    .get(id);
const activations = () =>
  harness.sqlite
    .query<{ actor_id: string; subject_id: string }, []>(
      "SELECT actor_id, subject_id FROM organization_audit WHERE action = 'pending_membership_activated'",
    )
    .all();

beforeEach(async () => {
  provider = new FakeOidcProvider();
  harness = OrganizationHarness.open({ provider });
  await harness.register('sam');
  harness.organization('org-a');
  harness.sqlite.run(
    "INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, created_at) VALUES ('claim-a', 'org-a', 'acme.test', 'verified', ?, 1, 1)",
    [DIGEST],
  );
  harness.sqlite.run(
    "INSERT INTO organization_sso_connection (id, organization_id, domain_claim_id, auth0_connection, strategy, login_slug, enforced, proven_at, proven_by, created_at) VALUES ('conn-a', 'org-a', 'claim-a', 'acme-saml', 'samlp', 'acme', 0, 2, ?, 1)",
    [harness.userId('sam')],
  );
  harness.activate();
});
afterEach(() => {
  harness.close();
});

/**
 * `organization-scim` "SCIM Users subset with pending membership", activation
 * half (task 4.4), through the real login and link callbacks.
 */
describe('pending membership activation', () => {
  it('activates a pending membership at the first SSO sign-in, even unverified', async () => {
    pending('u-1', 'carol@acme.test');
    expect(await signIn('samlp|acme-saml|carol', 'Carol@ACME.test', false)).toBe('/');
    expect(membershipsOf('samlp|acme-saml|carol')).toEqual([
      { organization_id: 'org-a', role: 'member' },
    ]);
    expect(record('u-1')).toMatchObject({ subject: 'samlp|acme-saml|carol' });
    expect(activations()).toHaveLength(1);
  });

  // Proof: activating on the email alone (skipping the proven-prefix lookup in
  // `ScimUserRepository.activate`) made this create a membership; watched
  // 2026-10-12.
  it('does not activate through a social sign-in with the same email', async () => {
    pending('u-1', 'carol@acme.test');
    expect(await signIn('google-oauth2|5', 'carol@acme.test', true)).toBe('/');
    expect(membershipsOf('google-oauth2|5')).toEqual([]);
    expect(record('u-1')).toEqual({ user_id: null, subject: null });
  });

  it('binds an existing member without changing the role', async () => {
    pending('u-1', 'sam@acme.test');
    harness.member('org-a', 'sam', 'admin');
    expect(await link('sam', 'samlp|acme-saml|sam', 'sam@acme.test')).toBe('linked');
    expect(record('u-1')).toEqual({
      user_id: harness.userId('sam'),
      subject: 'samlp|acme-saml|sam',
    });
    expect(
      harness.sqlite
        .query("SELECT role FROM organization_membership WHERE organization_id = 'org-a'")
        .all(),
    ).toEqual([{ role: 'admin' }]);
  });

  it('activates through the link that follows account_exists', async () => {
    harness.sqlite.run(
      "UPDATE users SET email = 'sam@acme.test', email_verified = 1 WHERE id = ?",
      [harness.userId('sam')],
    );
    pending('u-1', 'sam@acme.test');
    expect(await signIn('samlp|acme-saml|sam', 'sam@acme.test', true)).toBe(
      '/?auth_error=account_exists',
    );
    expect(record('u-1')).toEqual({ user_id: null, subject: null });
    expect(await link('sam', 'samlp|acme-saml|sam', 'sam@acme.test')).toBe('linked');
    expect(membershipsOf('samlp|acme-saml|sam')).toEqual([
      { organization_id: 'org-a', role: 'member' },
    ]);
  });
});
