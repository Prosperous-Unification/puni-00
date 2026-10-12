import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { FakeOidcProvider } from '../testing/fake-oidc-provider';
import { OrganizationHarness } from '../testing/organization-harness';
import { replace, scim, scimUser } from '../testing/scim-fixture';

const ISSUER = 'https://idp.test';
const CONNECTIONS = '/api/organization/sso-connections';
const TOKENS = '/api/organization/provisioning-tokens';

let harness: OrganizationHarness;
let provider: FakeOidcProvider;
let clock: number;

interface AuditRow {
  readonly actor_id: string;
  readonly action: string;
  readonly subject_kind: string;
  readonly subject_id: string;
  readonly detail: string;
}

const audits = () =>
  harness.sqlite
    .query<AuditRow, []>(
      "SELECT actor_id, action, subject_kind, subject_id, detail FROM organization_audit WHERE organization_id = 'org-a' ORDER BY created_at, rowid",
    )
    .all();

beforeEach(async () => {
  clock = Date.now();
  provider = new FakeOidcProvider(() => clock);
  harness = OrganizationHarness.open({ provider, now: () => clock });
  await harness.register('ada');
  await harness.register('sam');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'super_admin');
  harness.member('org-a', 'sam', 'admin');
  harness.bind('ada', 'org-a');
  harness.bind('sam', 'org-a');
  harness.sqlite.run(
    "INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, created_at) VALUES ('claim-a', 'org-a', 'acme.test', 'verified', ?, 1, 1)",
    ['a'.repeat(64)],
  );
  harness.activate();
});
afterEach(() => {
  harness.close();
});

/** Advances the clock so every act's row sorts after the previous one. */
const tick = () => {
  clock += 1_000;
};

/** A routed link through slug `acme` for `username`, returning `sub`. */
async function routedLink(username: string, sub: string, email: string) {
  const session = harness.token(username);
  const start = await harness.request('/api/auth/link/auth0', {
    method: 'POST',
    headers: {
      cookie: `__Host-wbs_access=${session}`,
      origin: 'http://localhost',
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.7',
    },
    body: JSON.stringify({ password: 'correct-horse', organization: 'acme' }),
  });
  expect(start.status).toBe(200);
  const binding = /__Host-wbs_link=([^;]+)/.exec(start.headers.get('set-cookie') ?? '')?.[1];
  const { state } = provider.lastAuthorization();
  provider.idTokenClaims = { iss: ISSUER, sub, email, email_verified: true };
  const callback = await harness.request(`/api/auth/link/auth0/callback?code=c&state=${state}`, {
    headers: { cookie: `__Host-wbs_link=${binding ?? ''}; __Host-wbs_access=${session}` },
  });
  return new URL(callback.headers.get('location') ?? '', 'http://localhost').searchParams.get(
    'auth_link',
  );
}

/** A browser SSO sign-in as `sub` through the login callback. */
async function signIn(sub: string, email: string) {
  const start = await harness.request('/api/auth/login');
  const binding = start.headers.getSetCookie().find((line) => line.startsWith('__Host-wbs_'));
  const { state } = provider.lastAuthorization();
  provider.idTokenClaims = { iss: ISSUER, sub, email, email_verified: false };
  const callback = await harness.request(`/api/auth/okta/callback?code=c&state=${state}`, {
    headers: { cookie: (binding ?? '').split(';')[0] ?? '' },
  });
  expect(callback.status).toBe(302);
}

/**
 * `organization-audit` "Every enterprise SSO, provisioning and policy act
 * writes one audit row in its own transaction" (task 5.3): every act the
 * mounted app offers writes exactly one row naming its actor, a refused act
 * writes none, and no detail holds a token, a digest or a full subject.
 * `sso_enforcement_changed` needs an SSO-authenticated super-admin and is
 * asserted in `organization-credential-rules.controller.db.test.ts`.
 *
 * Proof: skipping the `sso_connection_proven` audit write in
 * `EnterpriseConnectionRepository.linkThroughConnection` made this miss that
 * row; watched 2026-10-12.
 */
describe('the organization audit is complete', () => {
  it('writes one row per act and none per refusal, holding no secret', async () => {
    const ada = harness.userId('ada');
    const expected: string[][] = [];
    const act = (actor: string, action: string, kind: string) => {
      expected.push([actor, action, kind]);
      tick();
    };

    expect(
      (
        await harness.call('sam', 'POST', CONNECTIONS, {
          domainClaimId: 'claim-a',
          auth0Connection: 'acme-saml',
          strategy: 'samlp',
          loginSlug: 'acme',
        })
      ).status,
    ).toBe(403);
    tick();
    const created = await harness.call('ada', 'POST', CONNECTIONS, {
      domainClaimId: 'claim-a',
      auth0Connection: 'acme-saml',
      strategy: 'samlp',
      loginSlug: 'acme',
    });
    expect(created.status).toBe(201);
    const connectionId = (created.body as { connection: { id: string } }).connection.id;
    act(ada, 'sso_connection_created', 'sso_connection');
    expect(
      (await harness.call('ada', 'PATCH', `${CONNECTIONS}/${connectionId}`, { loginSlug: 'acme' }))
        .status,
    ).toBe(200);
    // An unchanged slug is no change, and writes nothing.
    tick();
    expect(
      (await harness.call('ada', 'PATCH', `${CONNECTIONS}/${connectionId}`, { enforced: true }))
        .status,
    ).toBe(409);
    tick();
    expect(await routedLink('ada', 'samlp|acme-saml|ada@acme.test', 'ada@acme.test')).toBe(
      'linked',
    );
    act(ada, 'sso_connection_proven', 'sso_connection');

    const issued = await harness.call('ada', 'POST', TOKENS);
    expect(issued.status).toBe(201);
    const first = issued.body as { id: string; token: string };
    act(ada, 'provisioning_token_issued', 'provisioning_token');
    const rotated = await harness.call('ada', 'POST', `${TOKENS}/${first.id}/rotate`);
    expect(rotated.status).toBe(201);
    const second = rotated.body as { id: string; token: string };
    act(ada, 'provisioning_token_rotated', 'provisioning_token');

    const scimActor = `scim:${second.id}`;
    const provisioned = await scim(
      harness,
      second.token,
      'POST',
      '/scim/v2/Users',
      scimUser('carol@acme.test'),
    );
    expect(provisioned.status).toBe(201);
    const carolRecord = (provisioned.body as { id: string }).id;
    act(scimActor, 'scim_user_provisioned', 'scim_user');
    expect(
      (await scim(harness, second.token, 'POST', '/scim/v2/Users', scimUser('carol@acme.test')))
        .status,
    ).toBe(409);
    tick();
    await signIn('samlp|acme-saml|carol', 'carol@acme.test');
    const carol = harness.sqlite
      .query<{ user_id: string }, []>(
        "SELECT user_id FROM external_identity WHERE subject = 'samlp|acme-saml|carol'",
      )
      .get()?.user_id;
    if (carol === undefined) throw new Error('the SSO sign-in mapped no account');
    act(carol, 'pending_membership_activated', 'scim_user');
    expect(
      (
        await scim(
          harness,
          second.token,
          'PATCH',
          `/scim/v2/Users/${carolRecord}`,
          replace({ path: 'externalId', value: 'ext-carol' }),
        )
      ).status,
    ).toBe(200);
    act(scimActor, 'scim_user_updated', 'scim_user');
    expect(
      (
        await scim(
          harness,
          second.token,
          'PATCH',
          `/scim/v2/Users/${carolRecord}`,
          replace({ path: 'active', value: false }),
        )
      ).status,
    ).toBe(200);
    act(scimActor, 'scim_user_deprovisioned', 'scim_user');

    expect(
      (
        await harness.call('ada', 'PUT', '/api/organization/session-policy', {
          maxSessionSeconds: 2_592_000,
          reauthenticateAfterSeconds: null,
        })
      ).status,
    ).toBe(200);
    act(ada, 'session_policy_changed', 'session_policy');
    expect(
      (
        await harness.call('sam', 'PUT', '/api/organization/session-policy', {
          maxSessionSeconds: 3_600,
          reauthenticateAfterSeconds: null,
        })
      ).status,
    ).toBe(403);
    tick();

    expect((await harness.call('ada', 'DELETE', `${CONNECTIONS}/${connectionId}`)).status).toBe(
      409,
    );
    tick();
    expect((await harness.call('ada', 'DELETE', `${TOKENS}/${second.id}`)).status).toBe(204);
    act(ada, 'provisioning_token_revoked', 'provisioning_token');
    // The rotated token is live through its overlap; revoking it is a second act.
    expect((await harness.call('ada', 'DELETE', `${TOKENS}/${first.id}`)).status).toBe(204);
    act(ada, 'provisioning_token_revoked', 'provisioning_token');
    expect((await harness.call('ada', 'DELETE', `${CONNECTIONS}/${connectionId}`)).status).toBe(
      204,
    );
    act(ada, 'sso_connection_deleted', 'sso_connection');

    const rows = audits();
    // Routes stamp from two clocks (the app's and the harness's), so the rows
    // are compared as a set: exactly one per act, nothing else.
    const sorted = (list: string[][]) => list.map((row) => row.join(' ')).sort();
    expect(
      sorted(rows.map(({ actor_id, action, subject_kind }) => [actor_id, action, subject_kind])),
    ).toEqual(sorted(expected));
    for (const { detail } of rows) {
      expect(detail).not.toContain('wbs_scim_');
      expect(detail).not.toContain(first.token);
      expect(detail).not.toMatch(/[0-9a-f]{64}/);
      expect(detail).not.toMatch(/"[^"|]+\|[^"|]+\|[^"]+"/);
      expect(detail).not.toContain('google-oauth2|');
    }
  });
});
