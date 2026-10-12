import { ScimUserRepository } from '@wbs/store-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDrizzle } from '../repository/db';
import { OPEN } from '../repository/gate';
import {
  delegationFor,
  issueToken,
  mapUpstream,
  openScimWorld,
  replace,
  scim,
  scimUser,
  type ScimWorld,
  sha256Hex,
} from '../testing/scim-fixture';

/**
 * SCIM deprovisioning (`organization-scim` task 4.5), mounted over real
 * SQLite: `active=false` and DELETE of a bound user delete that user's
 * membership in the token's organization and write the audit row in one
 * transaction, which ends browser, gateway and MCP access there at once;
 * the user's other organizations are untouched; the last super-admin is
 * refused; reactivation creates a pending membership only.
 */
const SECRET = 'x'.repeat(32);
let world: ScimWorld;
let token: { id: string; token: string };
let aProject: string;
let bProject: string;

beforeEach(async () => {
  world = await openScimWorld();
  const { h } = world;
  token = await issueToken(h, 'ada');
  await h.register('carol');
  h.member('org-a', 'carol', 'admin');
  h.member('org-b', 'carol', 'member');
  h.bind('carol', 'org-a');
  mapUpstream(h, 'carol', 'sub-carol');
  aProject = await project('carol', 'A plan');
  bProject = await project('bob', 'B plan');
});

afterEach(() => {
  world.h.close();
});

async function project(username: string, name: string): Promise<string> {
  const answer = await world.h.call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

/** Provisions `userName` in org-a and binds it to `username`, as an SSO activation would. */
async function bound(username: string, userName: string): Promise<string> {
  const { h } = world;
  const created = await scim(h, token.token, 'POST', '/scim/v2/Users', scimUser(userName));
  if (created.status !== 201) throw new Error(`provision refused: ${created.text}`);
  const id = (created.body as { id: string }).id;
  h.sqlite.run(
    "UPDATE organization_scim_user SET user_id = ?, issuer = 'https://idp.test', subject = ? WHERE id = ?",
    [h.userId(username), `samlp|acme-saml|${userName}`, id],
  );
  return id;
}

const roleIn = (organizationId: string, username: string) =>
  (
    world.h.sqlite
      .query('SELECT role FROM organization_membership WHERE organization_id = ? AND user_id = ?')
      .get(organizationId, world.h.userId(username)) as { role: string } | null
  )?.role ?? null;

const snapshot = () => ({
  users: world.h.sqlite.query('SELECT * FROM organization_scim_user ORDER BY id').all(),
  memberships: world.h.sqlite
    .query('SELECT * FROM organization_membership ORDER BY organization_id, user_id')
    .all(),
  audits: world.h.sqlite.query('SELECT * FROM organization_audit ORDER BY rowid').all(),
});

/** Every way carol reaches a project: browser, gateway lease and MCP delegation, per organization. */
async function carolAccess() {
  const { h, keys } = world;
  const gateway = await h.app.handle(
    new Request(`http://localhost/internal/gateway/projects/${aProject}/browser-access`, {
      method: 'POST',
      headers: { 'x-internal-auth': SECRET, cookie: `__Host-wbs_access=${h.token('carol')}` },
    }),
  );
  const mcp = async (organizationId: string, projectId: string) =>
    (
      await h.callWith(
        await delegationFor(h, keys.privateKey, 'carol', organizationId, 'sub-carol'),
        'GET',
        `/api/projects/${projectId}`,
      )
    ).status;
  return {
    browserA: (await h.call('carol', 'GET', '/api/projects')).status,
    gatewayA: gateway.status,
    mcpA: await mcp('org-a', aProject),
    mcpB: await mcp('org-b', bProject),
  };
}

/** Every audit insert fails from now on, as a full disk or a broken table would. */
const breakAudit = () => {
  world.h.sqlite.run(
    "CREATE TRIGGER audit_unavailable BEFORE INSERT ON organization_audit BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END",
  );
};

describe('SCIM deprovisioning', () => {
  it('ends browser, gateway and MCP access to A at once, leaving B unchanged', async () => {
    const { h } = world;
    const id = await bound('carol', 'carol@acme.test');
    expect(await carolAccess()).toEqual({ browserA: 200, gatewayA: 204, mcpA: 200, mcpB: 200 });
    const audits = snapshot().audits.length;

    const deactivated = await scim(
      h,
      token.token,
      'PATCH',
      `/scim/v2/Users/${id}`,
      replace({ path: 'active', value: false }),
    );

    expect(deactivated.status).toBe(200);
    expect(deactivated.body).toMatchObject({ active: false });
    expect(roleIn('org-a', 'carol')).toBeNull();
    expect(roleIn('org-b', 'carol')).toBe('member');
    const written = snapshot().audits as Record<string, unknown>[];
    expect(written).toHaveLength(audits + 1);
    expect(written.at(-1)).toMatchObject({
      action: 'scim_user_deprovisioned',
      actor_id: `scim:${token.id}`,
      subject_id: id,
    });
    expect(await carolAccess()).toEqual({ browserA: 403, gatewayA: 403, mcpA: 403, mcpB: 200 });
    expect(await h.call('carol', 'GET', '/api/projects')).toEqual({
      status: 403,
      body: { error: 'not_a_member' },
    });
    expect(h.sqlite.query('SELECT user_id FROM external_identity').all()).toEqual([
      { user_id: h.userId('carol') },
    ]);
  });

  it('deletes a bound user with the same effect, after which GET answers 404', async () => {
    const { h } = world;
    const id = await bound('carol', 'carol@acme.test');

    expect((await scim(h, token.token, 'DELETE', `/scim/v2/Users/${id}`)).status).toBe(204);

    expect(roleIn('org-a', 'carol')).toBeNull();
    expect(roleIn('org-b', 'carol')).toBe('member');
    expect(await carolAccess()).toEqual({ browserA: 403, gatewayA: 403, mcpA: 403, mcpB: 200 });
    expect((await scim(h, token.token, 'GET', `/scim/v2/Users/${id}`)).status).toBe(404);
  });

  it('removes only the pending record of a user never bound', async () => {
    const { h } = world;
    const created = await scim(
      h,
      token.token,
      'POST',
      '/scim/v2/Users',
      scimUser('carol@acme.test'),
    );
    const id = (created.body as { id: string }).id;

    const deactivated = await scim(
      h,
      token.token,
      'PATCH',
      `/scim/v2/Users/${id}`,
      replace({ path: 'active', value: false }),
    );

    expect(deactivated.body).toMatchObject({ active: false });
    // carol's own membership is not the record's: nothing bound it to her.
    expect(roleIn('org-a', 'carol')).toBe('admin');
  });

  it('rolls a deprovision back and answers 500 when its audit row cannot be written', async () => {
    const { h } = world;
    const id = await bound('carol', 'carol@acme.test');
    breakAudit();
    const before = snapshot();

    for (const [method, body] of [
      ['PATCH', replace({ path: 'active', value: false })],
      ['DELETE', undefined],
    ] as const) {
      const failed = await scim(h, token.token, method, `/scim/v2/Users/${id}`, body);
      expect(failed.status).toBe(500);
      expect(failed.body).toEqual({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '500',
        detail: 'internal_error',
      });
    }
    expect(snapshot()).toEqual(before);
    expect(await carolAccess()).toEqual({ browserA: 200, gatewayA: 204, mcpA: 200, mcpB: 200 });
    const provisioned = await scim(
      h,
      token.token,
      'POST',
      '/scim/v2/Users',
      scimUser('dave@acme.test'),
    );
    expect(provisioned.status).toBe(500);
    expect(snapshot()).toEqual(before);
  });

  it('refuses to deprovision the last super-admin with 409 mutability, changing nothing', async () => {
    const { h } = world;
    const id = await bound('ada', 'ada@acme.test');
    const before = snapshot();

    for (const [method, body] of [
      ['PATCH', replace({ path: 'active', value: false })],
      ['DELETE', undefined],
    ] as const) {
      const refused = await scim(h, token.token, method, `/scim/v2/Users/${id}`, body);
      expect(refused.status).toBe(409);
      const error = refused.body as { scimType: string; detail: string };
      expect(error.scimType).toBe('mutability');
      expect(error.detail).toStartWith('last_super_admin');
      expect(error.detail).toContain('organization-ownership-and-access');
      expect(error.detail).toContain('Ownership and roles');
    }
    expect(snapshot()).toEqual(before);
    expect(roleIn('org-a', 'ada')).toBe('super_admin');

    // With a second super-admin the same act succeeds.
    h.sqlite.run(
      "UPDATE organization_membership SET role = 'super_admin' WHERE organization_id = 'org-a' AND user_id = ?",
      [h.userId('carol')],
    );
    expect((await scim(h, token.token, 'DELETE', `/scim/v2/Users/${id}`)).status).toBe(204);
    expect(roleIn('org-a', 'ada')).toBeNull();
  });

  it('reactivates a former admin as a pending membership only, and her next SSO sign-in makes a member', async () => {
    const { h, clock } = world;
    const id = await bound('carol', 'carol@acme.test');
    const path = `/scim/v2/Users/${id}`;
    await scim(h, token.token, 'PATCH', path, replace({ path: 'active', value: false }));

    const reactivated = await scim(
      h,
      token.token,
      'PATCH',
      path,
      replace({ path: 'active', value: true }),
    );

    expect(reactivated.status).toBe(200);
    expect(reactivated.body).toMatchObject({ active: true });
    expect(roleIn('org-a', 'carol')).toBeNull();
    expect(
      h.sqlite.query('SELECT active, user_id FROM organization_scim_user WHERE id = ?').get(id),
    ).toEqual({ active: 1, user_id: null });
    expect(await carolAccess()).toMatchObject({ browserA: 403, mcpA: 403 });

    // The login callback's activation (task 4.4) over the same store.
    const activated = await new ScimUserRepository(openDrizzle(h.databasePath()), OPEN).activate(
      h.userId('carol'),
      { issuer: 'https://idp.test', subject: 'samlp|acme-saml|carol@acme.test' },
      'carol@acme.test',
      {
        stamp: { at: clock.at, by: h.userId('carol') },
        actor: h.userId('carol'),
        auditIds: () => crypto.randomUUID(),
      },
    );
    expect(activated).toEqual([{ organizationId: 'org-a', scimUserId: id }]);
    expect(roleIn('org-a', 'carol')).toBe('member');
  });
});

it('ends a real selected-organization cookie’s browser and gateway access at once', async () => {
  const cookieWorld = await openScimWorld(true);
  const { h } = cookieWorld;
  try {
    // Issued as ada would through her own selected session.
    const secret = `wbs_scim_${'E'.repeat(43)}`;
    h.sqlite.run(
      'INSERT INTO organization_scim_token (id, organization_id, digest, created_at, created_by) VALUES (?, ?, ?, 1, ?)',
      ['t-cookie', 'org-a', await sha256Hex(secret), h.userId('ada')],
    );
    await h.register('carol');
    h.member('org-a', 'carol', 'member');
    const selected = await h.app.handle(
      new Request('http://localhost/api/organization/active', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${h.token('carol')}`,
          origin: 'http://localhost',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ organizationId: 'org-a' }),
      }),
    );
    const pair = selected.headers.get('set-cookie')?.split(';')[0];
    if (selected.status !== 200 || pair === undefined) throw new Error('selection refused');
    const cookie = `__Host-wbs_access=${h.token('carol')}; ${pair}`;
    const browser = async (path: string, method: string, headers: Record<string, string> = {}) => {
      const response = await h.app.handle(
        new Request(`http://localhost${path}`, {
          method,
          headers: { cookie, origin: 'http://localhost', ...headers },
        }),
      );
      return { status: response.status, body: await response.text() };
    };
    const created = await h.app.handle(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { cookie, origin: 'http://localhost', 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'A plan' }),
      }),
    );
    const projectId = ((await created.json()) as { project: { id: string } }).project.id;
    const gatewayPath = `/internal/gateway/projects/${projectId}/browser-access`;
    expect((await browser('/api/projects', 'GET')).status).toBe(200);
    expect((await browser(gatewayPath, 'POST', { 'x-internal-auth': SECRET })).status).toBe(204);
    const provisioned = await scim(
      h,
      secret,
      'POST',
      '/scim/v2/Users',
      scimUser('carol@acme.test'),
    );
    const id = (provisioned.body as { id: string }).id;
    h.sqlite.run(
      "UPDATE organization_scim_user SET user_id = ?, issuer = 'https://idp.test', subject = 'samlp|acme-saml|carol@acme.test' WHERE id = ?",
      [h.userId('carol'), id],
    );

    expect(
      (
        await scim(
          h,
          secret,
          'PATCH',
          `/scim/v2/Users/${id}`,
          replace({ path: 'active', value: false }),
        )
      ).status,
    ).toBe(200);

    const notMember = JSON.stringify({ error: 'not_a_member' });
    expect(await browser('/api/projects', 'GET')).toEqual({ status: 403, body: notMember });
    expect(await browser(gatewayPath, 'POST', { 'x-internal-auth': SECRET })).toEqual({
      status: 403,
      body: notMember,
    });
  } finally {
    cookieWorld.h.close();
  }
});
