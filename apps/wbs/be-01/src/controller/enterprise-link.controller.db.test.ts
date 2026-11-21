import { AuthService } from '@wbs/core/service/auth.service';
import { ExternalIdentityRepository } from '@wbs/store-sqlite/external-identity';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { FakeOidcProvider } from '../testing/fake-oidc-provider';
import { OrganizationHarness } from '../testing/organization-harness';

const DIGEST = 'a'.repeat(64);
const ISSUER = 'https://idp.test';

let harness: OrganizationHarness;
let provider: FakeOidcProvider;
let duringExchange: (() => void) | undefined;

/** Inserts a verified claim and an unproven `samlp` connection on it. */
function connection(
  id: string,
  organizationId: string,
  domain: string,
  auth0Connection: string,
  slug: string,
): void {
  harness.sqlite.run(
    "INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, created_at) VALUES (?, ?, ?, 'verified', ?, 1, 1)",
    [`claim-${id}`, organizationId, domain, DIGEST],
  );
  harness.sqlite.run(
    "INSERT INTO organization_sso_connection (id, organization_id, domain_claim_id, auth0_connection, strategy, login_slug, enforced, created_at) VALUES (?, ?, ?, ?, 'samlp', ?, 0, 1)",
    [id, organizationId, `claim-${id}`, auth0Connection, slug],
  );
}

/**
 * Completes one explicit link for `username`, routed through `slug`, whose
 * provider answers `sub` and `email`; answers the `?auth_link=` outcome.
 */
async function routedLink(username: string, slug: string, sub: string, email: string) {
  const session = harness.token(username);
  const start = await harness.request('/api/auth/link/auth0', {
    method: 'POST',
    headers: {
      cookie: `__Host-wbs_access=${session}`,
      origin: 'http://localhost',
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.7',
    },
    body: JSON.stringify({ password: 'correct-horse', organization: slug }),
  });
  expect(start.status).toBe(200);
  const binding = /__Host-wbs_link=([^;]+)/.exec(start.headers.get('set-cookie') ?? '')?.[1];
  if (binding === undefined) throw new Error('link start set no binding cookie');
  const { state } = provider.lastAuthorization();
  provider.idTokenClaims = { iss: ISSUER, sub, email, email_verified: true };
  const callback = await harness.request(`/api/auth/link/auth0/callback?code=c&state=${state}`, {
    headers: { cookie: `__Host-wbs_link=${binding}; __Host-wbs_access=${session}` },
  });
  expect(callback.status).toBe(302);
  return new URL(callback.headers.get('location') ?? '', 'http://localhost').searchParams.get(
    'auth_link',
  );
}

const connectionRow = (id: string) =>
  harness.sqlite
    .query<
      {
        proven_at: number | null;
        proven_by: string | null;
        last_prefix_mismatch_at: number | null;
      },
      [string]
    >(
      'SELECT proven_at, proven_by, last_prefix_mismatch_at FROM organization_sso_connection WHERE id = ?',
    )
    .get(id);
const mappedUser = (subject: string) =>
  harness.sqlite
    .query<{ user_id: string }, [string]>('SELECT user_id FROM external_identity WHERE subject = ?')
    .get(subject)?.user_id ?? null;
const userEmail = (username: string) =>
  harness.sqlite
    .query<{ email: string | null; email_verified: number }, [string]>(
      'SELECT email, email_verified FROM users WHERE id = ?',
    )
    .get(harness.userId(username));
const audits = () =>
  harness.sqlite
    .query<{ action: string; actor_id: string; subject_id: string; detail: string }, []>(
      'SELECT action, actor_id, subject_id, detail FROM organization_audit',
    )
    .all();

beforeEach(async () => {
  duringExchange = undefined;
  provider = new FakeOidcProvider();
  const routeOptions = provider.routeOptions.bind(provider);
  provider.routeOptions = (origin) => {
    const options = routeOptions(origin);
    const exchange = options.client.exchange.bind(options.client);
    return {
      ...options,
      client: {
        ...options.client,
        exchange: async (...arguments_) => {
          await Promise.resolve();
          duringExchange?.();
          return exchange(...arguments_);
        },
      },
    };
  };
  harness = OrganizationHarness.open({ provider });
  await harness.register('sam');
  await harness.register('mem');
  await harness.register('bea');
  harness.organization('org-a');
  harness.organization('org-b');
  harness.member('org-a', 'sam', 'super_admin');
  harness.grantPermissions('org-a', 'sam', ['organization.manage_security']);
  harness.member('org-a', 'mem', 'member');
  harness.member('org-b', 'bea', 'super_admin');
  harness.grantPermissions('org-b', 'bea', ['organization.manage_security']);
  connection('conn-a', 'org-a', 'acme.test', 'acme-saml', 'acme');
  harness.activate();
});
afterEach(() => {
  harness.close();
});

/** `organization-sso` "A connection is proven by a routed link before it can be enforced" (D5). */
describe('proof through the routed link', () => {
  it('sends the routed connection to the provider', async () => {
    await routedLink('sam', 'acme', 'google-oauth2|1', 'sam@acme.test');
    expect(provider.lastAuthorization()).toMatchObject({
      connection: 'acme-saml',
      prompt: 'login',
    });
  });

  it('proves the connection with the fixture subject, in one audited transaction', async () => {
    const subject = 'samlp|acme-saml|alice@acme.test';
    expect(await routedLink('sam', 'acme', subject, 'alice@acme.test')).toBe('linked');
    expect(mappedUser(subject)).toBe(harness.userId('sam'));
    expect(connectionRow('conn-a')).toMatchObject({ proven_by: harness.userId('sam') });
    expect(connectionRow('conn-a')?.proven_at).toBeNumber();
    const rows = audits();
    expect(rows.map(({ action, actor_id, subject_id }) => [action, actor_id, subject_id])).toEqual([
      ['sso_connection_proven', harness.userId('sam'), 'conn-a'],
    ]);
    expect(rows[0]?.detail).not.toContain('alice');
    // The prefix is proven on its domain, so the address is attested.
    expect(userEmail('sam')).toEqual({ email: 'alice@acme.test', email_verified: 1 });
  });

  for (const subject of [
    'samlp|other|alice@acme.test',
    'samlp|acme-saml-2|alice@acme.test',
    'samlp|alice@acme.test',
    'google-oauth2|1',
  ])
    it(`leaves the connection unproven and links nothing for ${subject}`, async () => {
      expect(await routedLink('sam', 'acme', subject, 'alice@acme.test')).toBe(
        'sso_prefix_mismatch',
      );
      expect(connectionRow('conn-a')).toMatchObject({ proven_at: null, proven_by: null });
      expect(connectionRow('conn-a')?.last_prefix_mismatch_at).toBeNumber();
      expect(mappedUser(subject)).toBeNull();
      expect(audits()).toEqual([]);
    });

  it('uses the addressed connection organization for its current proof grant', async () => {
    harness.member('org-a', 'bea', 'super_admin');
    const subject = 'samlp|acme-saml|bea@acme.test';
    expect(await routedLink('bea', 'acme', subject, 'bea@acme.test')).toBe('linked');
    expect(mappedUser(subject)).toBe(harness.userId('bea'));
    expect(connectionRow('conn-a')).toMatchObject({ proven_at: null, proven_by: null });
    expect(userEmail('bea')).toEqual({ email: null, email_verified: 0 });
    expect(audits()).toEqual([]);
  });

  it('uses the borrowed identity writer for audited enterprise proof', async () => {
    const publicWriter = spyOn(
      ExternalIdentityRepository.prototype,
      'linkIdentity',
    ).mockImplementation(() => {
      throw new Error('public identity writer must not run');
    });
    try {
      const subject = 'samlp|acme-saml|sam@acme.test';
      expect(await routedLink('sam', 'acme', subject, 'sam@acme.test')).toBe('linked');
      expect(mappedUser(subject)).toBe(harness.userId('sam'));
      expect(connectionRow('conn-a')).toMatchObject({ proven_by: harness.userId('sam') });
      expect(audits()).toHaveLength(1);
    } finally {
      publicWriter.mockRestore();
    }
  });

  it('proves through the authenticated account security grant despite a member role', async () => {
    harness.grantPermissions('org-a', 'mem', ['organization.manage_security']);
    const subject = 'samlp|acme-saml|mem@acme.test';
    expect(await routedLink('mem', 'acme', subject, 'mem@acme.test')).toBe('linked');
    expect(mappedUser(subject)).toBe(harness.userId('mem'));
    expect(connectionRow('conn-a')).toMatchObject({ proven_by: harness.userId('mem') });
    expect(userEmail('mem')).toEqual({ email: 'mem@acme.test', email_verified: 1 });
    expect(audits()).toHaveLength(1);
  });

  it('keeps a role-only super-admin link ordinary when its security grant is absent', async () => {
    harness.sqlite.run('DELETE FROM access_grant WHERE subject_id = ?', [harness.userId('sam')]);
    const subject = 'samlp|acme-saml|sam@acme.test';
    expect(await routedLink('sam', 'acme', subject, 'sam@acme.test')).toBe('linked');
    expect(mappedUser(subject)).toBe(harness.userId('sam'));
    expect(connectionRow('conn-a')).toMatchObject({ proven_at: null, proven_by: null });
    expect(userEmail('sam')).toEqual({ email: null, email_verified: 0 });
    expect(audits()).toEqual([]);
  });

  it('links a non-super-admin matching pair without proving or trusting its email', async () => {
    const subject = 'samlp|acme-saml|mem@acme.test';
    expect(await routedLink('mem', 'acme', subject, 'mem@acme.test')).toBe('linked');
    expect(mappedUser(subject)).toBe(harness.userId('mem'));
    expect(connectionRow('conn-a')).toMatchObject({ proven_at: null, proven_by: null });
    expect(audits()).toEqual([]);
    expect(userEmail('mem')).toEqual({ email: null, email_verified: 0 });
  });

  it('rolls the proof back with a link refused as a collision', async () => {
    const subject = 'samlp|acme-saml|alice@acme.test';
    harness.sqlite.run(
      "INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES ('held', ?, ?, ?, 1)",
      [harness.userId('mem'), ISSUER, subject],
    );
    expect(await routedLink('sam', 'acme', subject, 'alice@acme.test')).toBe('collision');
    expect(connectionRow('conn-a')).toMatchObject({ proven_at: null, proven_by: null });
    expect(mappedUser(subject)).toBe(harness.userId('mem'));
    expect(audits()).toEqual([]);
  });

  it('does not prove through an address off the connection domain', async () => {
    const subject = 'samlp|acme-saml|sam';
    expect(await routedLink('sam', 'acme', subject, 'sam@elsewhere.test')).toBe('linked');
    expect(connectionRow('conn-a')).toMatchObject({ proven_at: null });
    expect(userEmail('sam')).toEqual({ email: null, email_verified: 0 });
  });

  it('lets one of two organizations prove the same Auth0 connection', async () => {
    connection('conn-b', 'org-b', 'b.test', 'acme-saml', 'bee');
    expect(
      await routedLink('sam', 'acme', 'samlp|acme-saml|alice@acme.test', 'alice@acme.test'),
    ).toBe('linked');
    const subject = 'samlp|acme-saml|bea@b.test';
    expect(await routedLink('bea', 'bee', subject, 'bea@b.test')).toBe('sso_connection_taken');
    expect(connectionRow('conn-b')).toMatchObject({ proven_at: null, proven_by: null });
    expect(mappedUser(subject)).toBeNull();
    expect(audits().map(({ subject_id }) => subject_id)).toEqual(['conn-a']);
  });

  it('refuses a link start naming an unknown slug or both a method and a slug', async () => {
    const session = harness.token('sam');
    const start = (body: unknown) =>
      harness.request('/api/auth/link/auth0', {
        method: 'POST',
        headers: {
          cookie: `__Host-wbs_access=${session}`,
          origin: 'http://localhost',
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.7',
        },
        body: JSON.stringify({ password: 'correct-horse', ...(body as object) }),
      });
    const unknown = await start({ organization: 'nope' });
    expect(unknown.status).toBe(404);
    expect((await unknown.json()) as unknown).toEqual({ error: 'sso_connection_not_found' });
    const both = await start({ organization: 'acme', method: 'google' });
    expect(both.status).toBe(400);
    expect((await both.json()) as unknown).toEqual({ error: 'invalid_body' });
    expect(provider.authorizations).toEqual([]);
  });
});

for (const mutate of ['id', 'authentication', 'delegation']) {
  it('retains the verified OIDC link principal across provider exchange: ' + mutate, async () => {
    const observer = spyOn(AuthService.prototype, 'sessionUser');
    const sessionUser = observer.getMockImplementation();
    if (sessionUser === undefined)
      throw new Error('session account spy lost its real implementation');
    let replace: (() => void) | undefined;
    let substitutions = 0;
    observer.mockImplementation(async function (this: AuthService, token) {
      const current = await sessionUser.call(this, token);
      if (current !== null)
        replace = () => {
          if (mutate === 'id') Object.assign(current.user, { id: harness.userId('bea') });
          if (mutate === 'authentication')
            Object.assign(current.user, {
              authentication: { kind: 'machine', credentialId: 'replacement', personId: 'agent' },
            });
          if (mutate === 'delegation')
            Object.assign(current.user, { delegation: { organizationId: 'org-a' } });
        };
      return current;
    });
    duringExchange = () => {
      if (replace === undefined)
        throw new Error('provider exchange did not receive an authenticated account');
      replace();
      substitutions += 1;
    };
    const subject = 'samlp|acme-saml|retained@acme.test';
    try {
      expect(await routedLink('sam', 'acme', subject, 'retained@acme.test')).toBe('linked');
      expect(substitutions).toBe(1);
      expect(mappedUser(subject)).toBe(harness.userId('sam'));
      expect(connectionRow('conn-a')).toMatchObject({ proven_by: harness.userId('sam') });
      expect(audits()).toMatchObject([
        { actor_id: harness.userId('sam'), action: 'sso_connection_proven' },
      ]);
    } finally {
      duringExchange = undefined;
      observer.mockRestore();
    }
  });
}
