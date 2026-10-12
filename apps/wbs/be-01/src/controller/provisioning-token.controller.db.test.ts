import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { generateKeyPair } from 'jose';

import { OrganizationHarness } from '../testing/organization-harness';
import { delegationFor, mapUpstream, seedConnection, sha256Hex } from '../testing/scim-fixture';

/**
 * Provisioning-token administration (`organization-scim` task 4.1), mounted
 * over real SQLite: a current super-admin of the session's organization
 * issues, rotates, revokes and lists; the secret appears once; storage and
 * audit hold only the digest's absence of the secret.
 */
const DAY = 24 * 60 * 60 * 1000;
const PATH = '/api/organization/provisioning-tokens';
let h: OrganizationHarness;
let at: number;
let keys: CryptoKeyPair;

beforeEach(async () => {
  at = 1_800_000_000_000;
  keys = await generateKeyPair('RS256');
  h = OrganizationHarness.open({ delegationKey: keys.publicKey, now: () => at });
  for (const username of ['ada', 'sam', 'bob']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'super_admin');
  h.member('org-a', 'sam', 'admin');
  h.member('org-b', 'bob', 'super_admin');
  h.bind('ada', 'org-a');
  h.bind('sam', 'org-a');
  h.bind('bob', 'org-b');
  h.activate();
});

afterEach(() => {
  h.close();
});

const proveA = () => {
  seedConnection(h, {
    organizationId: 'org-a',
    domain: 'acme.test',
    auth0Connection: 'acme-saml',
    loginSlug: 'acme',
    provenBy: 'ada',
  });
};
const tokenRows = () =>
  h.sqlite.query('SELECT * FROM organization_scim_token ORDER BY created_at, id').all() as Record<
    string,
    unknown
  >[];
const auditRows = () =>
  h.sqlite.query('SELECT * FROM organization_audit ORDER BY created_at, id').all() as Record<
    string,
    unknown
  >[];

interface Issued {
  readonly id: string;
  readonly token: string;
  readonly createdAt: number;
}

async function issue(username = 'ada'): Promise<Issued> {
  const answer = await h.call(username, 'POST', PATH);
  if (answer.status !== 201) throw new Error(`issue refused: ${JSON.stringify(answer)}`);
  return answer.body as Issued;
}

describe('provisioning-token administration', () => {
  it('shows the secret once, stores only its digest and lists no secret', async () => {
    proveA();
    const issued = await issue();

    expect(issued.token).toMatch(/^wbs_scim_[A-Za-z0-9_-]{43}$/);
    expect(issued.createdAt).toBe(at);
    const stored = tokenRows();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.['digest']).toBe(await sha256Hex(issued.token));
    for (const row of [...stored, ...auditRows()])
      for (const value of Object.values(row)) {
        expect(String(value)).not.toContain(issued.token);
        expect(String(value)).not.toContain(issued.token.slice('wbs_scim_'.length));
      }
    const audits = auditRows();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'provisioning_token_issued',
      actor_id: h.userId('ada'),
      subject_kind: 'provisioning_token',
      subject_id: issued.id,
    });
    expect(JSON.stringify(audits)).not.toContain(await sha256Hex(issued.token));

    const listed = await h.call('ada', 'GET', PATH);
    expect(listed).toEqual({
      status: 200,
      body: { tokens: [{ id: issued.id, createdAt: at, expiresAt: null, revokedAt: null }] },
    });
    expect(JSON.stringify(listed)).not.toContain(await sha256Hex(issued.token));
  });

  it('refuses a token without a connection, or with only an unproven one, storing nothing', async () => {
    expect(await h.call('ada', 'POST', PATH)).toEqual({
      status: 409,
      body: { error: 'sso_connection_unproven' },
    });
    seedConnection(h, {
      organizationId: 'org-a',
      domain: 'acme.test',
      auth0Connection: 'acme-saml',
      loginSlug: 'acme',
      provenBy: null,
    });
    expect(await h.call('ada', 'POST', PATH)).toEqual({
      status: 409,
      body: { error: 'sso_connection_unproven' },
    });
    expect(tokenRows()).toEqual([]);
    expect(auditRows()).toEqual([]);
  });

  it('refuses a third live token and stores nothing', async () => {
    proveA();
    await issue();
    await issue();

    // Proof: raising `MOST_LIVE_PROVISIONING_TOKENS` to 3 made this mounted
    // test fail, the third issue answering 201; watched 2026-10-12.
    expect(await h.call('ada', 'POST', PATH)).toEqual({
      status: 409,
      body: { error: 'token_limit' },
    });
    expect(tokenRows()).toHaveLength(2);
    expect(auditRows()).toHaveLength(2);
  });

  it('rotates with a 24-hour overlap and returns the successor once', async () => {
    proveA();
    const first = await issue();
    at += 1_000;

    const rotated = await h.call('ada', 'POST', `${PATH}/${first.id}/rotate`);
    expect(rotated.status).toBe(201);
    const successor = rotated.body as Issued & { previousExpiresAt: number };
    expect(successor.token).toMatch(/^wbs_scim_[A-Za-z0-9_-]{43}$/);
    expect(successor.token).not.toBe(first.token);
    expect(successor.previousExpiresAt).toBe(at + DAY);
    expect(await h.call('ada', 'GET', PATH)).toEqual({
      status: 200,
      body: {
        tokens: [
          { id: first.id, createdAt: at - 1_000, expiresAt: at + DAY, revokedAt: null },
          { id: successor.id, createdAt: at, expiresAt: null, revokedAt: null },
        ],
      },
    });
    expect(auditRows().map((row) => row['action'])).toEqual([
      'provisioning_token_issued',
      'provisioning_token_rotated',
    ]);
    // A token already in its overlap is not rotatable again.
    expect(await h.call('ada', 'POST', `${PATH}/${first.id}/rotate`)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
  });

  it('revokes at once, and answers a revoked, absent or foreign token as not found', async () => {
    proveA();
    seedConnection(h, {
      organizationId: 'org-b',
      domain: 'b.test',
      auth0Connection: 'b-saml',
      loginSlug: 'bee',
      provenBy: 'bob',
    });
    const mine = await issue();
    const foreign = await issue('bob');

    expect(await h.call('ada', 'DELETE', `${PATH}/${mine.id}`)).toEqual({
      status: 204,
      body: null,
    });
    expect(await h.call('ada', 'GET', PATH)).toEqual({
      status: 200,
      body: { tokens: [{ id: mine.id, createdAt: at, expiresAt: null, revokedAt: at }] },
    });
    for (const id of [mine.id, foreign.id, 'absent'])
      expect(await h.call('ada', 'DELETE', `${PATH}/${id}`)).toEqual({
        status: 404,
        body: { error: 'not_found' },
      });
    for (const id of [foreign.id, 'absent'])
      expect(await h.call('ada', 'POST', `${PATH}/${id}/rotate`)).toEqual({
        status: 404,
        body: { error: 'not_found' },
      });
    expect(tokenRows().find((row) => row['id'] === foreign.id)?.['revoked_at']).toBeNull();
  });

  it('refuses an admin who is not a super-admin every act, changing nothing', async () => {
    proveA();
    const live = await issue();
    const before = { tokens: tokenRows(), audits: auditRows() };

    for (const [method, path] of [
      ['GET', PATH],
      ['POST', PATH],
      ['POST', `${PATH}/${live.id}/rotate`],
      ['DELETE', `${PATH}/${live.id}`],
    ] as const)
      expect(await h.call('sam', method, path)).toEqual({
        status: 403,
        body: { error: 'forbidden' },
      });
    expect({ tokens: tokenRows(), audits: auditRows() }).toEqual(before);
  });

  it('refuses a delegated caller even with current super-admin membership', async () => {
    proveA();
    const live = await issue();
    mapUpstream(h, 'ada', 'sub-ada');
    const before = { tokens: tokenRows(), audits: auditRows() };

    for (const [method, path] of [
      ['GET', PATH],
      ['POST', PATH],
      ['POST', `${PATH}/${live.id}/rotate`],
      ['DELETE', `${PATH}/${live.id}`],
    ] as const)
      expect(
        await h.callWith(
          await delegationFor(h, keys.privateKey, 'ada', 'org-a', 'sub-ada'),
          method,
          path,
        ),
      ).toEqual({ status: 403, body: { error: 'insufficient_scope' } });
    expect({ tokens: tokenRows(), audits: auditRows() }).toEqual(before);
  });

  it('refuses outside an organization, storing nothing', async () => {
    proveA();
    h.unbind('ada');
    expect(await h.call('ada', 'POST', PATH)).toEqual({
      status: 403,
      body: { error: 'no_active_organization' },
    });
    expect(tokenRows()).toEqual([]);
  });
});

it('refuses provisioning-token administration before activation', async () => {
  const inert = OrganizationHarness.open();
  try {
    await inert.register('ada');
    inert.organization('org-a');
    inert.member('org-a', 'ada', 'super_admin');
    inert.bind('ada', 'org-a');
    seedConnection(inert, {
      organizationId: 'org-a',
      domain: 'acme.test',
      auth0Connection: 'acme-saml',
      loginSlug: 'acme',
      provenBy: 'ada',
    });
    for (const method of ['GET', 'POST'])
      expect(await inert.call('ada', method, PATH)).toEqual({
        status: 403,
        body: { error: 'no_active_organization' },
      });
    expect(inert.sqlite.query('SELECT id FROM organization_scim_token').all()).toEqual([]);
  } finally {
    inert.close();
  }
});
