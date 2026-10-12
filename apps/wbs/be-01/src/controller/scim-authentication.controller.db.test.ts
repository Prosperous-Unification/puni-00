import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';
import {
  issueToken,
  openScimWorld,
  replace,
  scim,
  scimUser,
  type ScimWorld,
  seedConnection,
  sha256Hex,
} from '../testing/scim-fixture';

/**
 * SCIM authentication and admission (`organization-scim` task 4.2), mounted
 * over real SQLite: the provisioning token alone selects the organization;
 * every bad token gets the same bytes; each token is admitted 300 requests
 * per rolling minute.
 */
const DAY = 24 * 60 * 60 * 1000;
const UNKNOWN = `wbs_scim_${'A'.repeat(43)}`;
let world: ScimWorld;

beforeEach(async () => {
  world = await openScimWorld();
});

afterEach(() => {
  world.h.close();
});

/** Everything a SCIM request could change. */
const snapshot = () => ({
  users: world.h.sqlite.query('SELECT * FROM organization_scim_user ORDER BY id').all(),
  memberships: world.h.sqlite
    .query('SELECT * FROM organization_membership ORDER BY organization_id, user_id')
    .all(),
  audits: world.h.sqlite.query('SELECT * FROM organization_audit ORDER BY id').all(),
});

describe('SCIM authentication', () => {
  it('answers a missing, malformed or unknown token with one byte-identical 401 naming no organization', async () => {
    const { h } = world;
    await issueToken(h, 'ada');
    const unknown = await scim(h, UNKNOWN, 'GET', '/scim/v2/Users');
    expect(unknown.status).toBe(401);
    expect(unknown.headers.get('content-type')).toBe('application/scim+json');
    expect(unknown.body).toEqual({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '401',
      detail: 'unauthenticated',
    });
    expect(unknown.text).not.toContain('org-');
    const answers = [
      await scim(h, null, 'GET', '/scim/v2/Users'),
      await scim(h, 'not-a-token', 'GET', '/scim/v2/Users'),
      await scim(h, `${UNKNOWN}x`, 'GET', '/scim/v2/Users'),
      await scim(h, `wbs_scim_${'A'.repeat(42)}`, 'GET', '/scim/v2/Users'),
      await scim(h, '', 'GET', '/scim/v2/Users'),
      await scim(h, UNKNOWN, 'PUT', '/scim/v2/Users/x', scimUser('carol@acme.test')),
      await scim(h, UNKNOWN, 'GET', '/scim/v2/Groups'),
    ];
    for (const answer of answers) {
      expect(answer.status).toBe(401);
      expect(answer.text).toBe(unknown.text);
    }
    const basic = await h.app.handle(
      new Request('http://localhost/scim/v2/Users', {
        headers: { authorization: `Basic ${btoa('ada:correct-horse')}` },
      }),
    );
    expect(basic.status).toBe(401);
    expect(await basic.text()).toBe(unknown.text);
    // A WBS session token is not a provisioning token.
    const session = await scim(h, h.token('ada'), 'GET', '/scim/v2/Users');
    expect(session.text).toBe(unknown.text);
  });

  it('replays a revoked token on every verb with the unknown-token 401, changing nothing', async () => {
    const { h } = world;
    const { id, token } = await issueToken(h, 'ada');
    const created = await scim(h, token, 'POST', '/scim/v2/Users', scimUser('carol@acme.test'));
    expect(created.status).toBe(201);
    const userId = (created.body as { id: string }).id;
    expect(
      (await h.call('ada', 'DELETE', `/api/organization/provisioning-tokens/${id}`)).status,
    ).toBe(204);
    const unknown = await scim(h, UNKNOWN, 'GET', '/scim/v2/Users');
    const before = snapshot();

    for (const [method, path, body] of [
      ['GET', '/scim/v2/Users', undefined],
      ['GET', `/scim/v2/Users/${userId}`, undefined],
      ['POST', '/scim/v2/Users', scimUser('dave@acme.test')],
      ['PATCH', `/scim/v2/Users/${userId}`, replace({ path: 'active', value: false })],
      ['DELETE', `/scim/v2/Users/${userId}`, undefined],
    ] as const) {
      const replayed = await scim(h, token, method, path, body);
      expect(replayed.status).toBe(401);
      expect(replayed.text).toBe(unknown.text);
    }
    expect(snapshot()).toEqual(before);
  });

  it('keeps a rotated token authenticating for 24 hours, then answers it 401', async () => {
    const { h, clock } = world;
    const first = await issueToken(h, 'ada');
    const rotated = await h.call(
      'ada',
      'POST',
      `/api/organization/provisioning-tokens/${first.id}/rotate`,
    );
    const successor = (rotated.body as { token: string }).token;
    const rotatedAt = clock.at;
    const unknown = await scim(h, UNKNOWN, 'GET', '/scim/v2/Users');

    clock.at = rotatedAt + DAY - 1;
    expect((await scim(h, first.token, 'GET', '/scim/v2/Users')).status).toBe(200);
    expect((await scim(h, successor, 'GET', '/scim/v2/Users')).status).toBe(200);
    clock.at = rotatedAt + DAY;
    const expired = await scim(h, first.token, 'GET', '/scim/v2/Users');
    expect(expired.status).toBe(401);
    expect(expired.text).toBe(unknown.text);
    expect((await scim(h, successor, 'GET', '/scim/v2/Users')).status).toBe(200);
  });

  it('selects the organization by the token alone, whatever the request names', async () => {
    const { h } = world;
    const a = await issueToken(h, 'ada');
    const b = await issueToken(h, 'bob');
    const inB = await scim(h, b.token, 'POST', '/scim/v2/Users', scimUser('erin@b.test'));
    expect(inB.status).toBe(201);
    const response = await h.app.handle(
      new Request('http://localhost/scim/v2/Users', {
        headers: {
          authorization: `Bearer ${a.token}`,
          'x-wbs-organization': 'org-b',
          cookie: `__Host-wbs_access=${h.token('bob')}`,
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ totalResults: 0, Resources: [] });
    // A body naming B's domain is still judged in A: no connection there.
    expect(
      (await scim(h, a.token, 'POST', '/scim/v2/Users', scimUser('frank@b.test'))).status,
    ).toBe(400);
  });

  it('answers a token stored before activation with the same 401', async () => {
    const inert = OrganizationHarness.open();
    try {
      await inert.register('ada');
      inert.organization('org-a');
      inert.member('org-a', 'ada', 'super_admin');
      seedConnection(inert, {
        organizationId: 'org-a',
        domain: 'acme.test',
        auth0Connection: 'acme-saml',
        loginSlug: 'acme',
        provenBy: 'ada',
      });
      const token = `wbs_scim_${'B'.repeat(43)}`;
      inert.sqlite.run(
        'INSERT INTO organization_scim_token (id, organization_id, digest, created_at, created_by) VALUES (?, ?, ?, 1, ?)',
        ['t', 'org-a', await sha256Hex(token), inert.userId('ada')],
      );
      const answer = await scim(inert, token, 'GET', '/scim/v2/Users');
      const unknown = await scim(inert, UNKNOWN, 'GET', '/scim/v2/Users');
      expect(answer.status).toBe(401);
      expect(answer.text).toBe(unknown.text);
    } finally {
      inert.close();
    }
  });
});

describe('SCIM admission', () => {
  it('answers the 301st request in a rolling minute 429 with Retry-After and applies nothing', async () => {
    const { h, clock } = world;
    const { token } = await issueToken(h, 'ada');
    const other = await issueToken(h, 'ada');
    const created = await scim(h, token, 'POST', '/scim/v2/Users', scimUser('carol@acme.test'));
    const userId = (created.body as { id: string }).id;
    const start = clock.at;
    for (let request = 1; request < 300; request++) {
      clock.at = start + request * 100;
      expect((await scim(h, token, 'GET', `/scim/v2/Users/${userId}`)).status).toBe(200);
    }
    const before = snapshot();

    const refused = await scim(
      h,
      token,
      'PATCH',
      `/scim/v2/Users/${userId}`,
      replace({ path: 'active', value: false }),
    );
    expect(refused.status).toBe(429);
    // The first admitted request (the POST at `start`) leaves the window at
    // start + 60 s; now is start + 29.9 s, so 31 whole seconds remain.
    expect(refused.headers.get('retry-after')).toBe('31');
    expect(refused.body).toMatchObject({ status: '429' });
    expect(snapshot()).toEqual(before);
    // Another token of the same organization has its own window.
    expect((await scim(h, other.token, 'GET', '/scim/v2/Users')).status).toBe(200);

    clock.at = start + 60_000;
    const admitted = await scim(
      h,
      token,
      'PATCH',
      `/scim/v2/Users/${userId}`,
      replace({ path: 'active', value: false }),
    );
    expect(admitted.status).toBe(200);
    expect(admitted.body).toMatchObject({ active: false });
  });
});
