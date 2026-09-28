import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/**
 * Membership administration under the role matrix (task 3.7), over be-01's
 * production composition and real SQLite; see
 * {@link OrganizationHarness.openComposed}.
 */
let h: OrganizationHarness;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  for (const username of ['sam', 'adam', 'ada', 'vic', 'grace']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'sam', 'super_admin');
  h.member('org-a', 'adam', 'admin');
  h.member('org-a', 'ada', 'member');
  h.member('org-a', 'vic', 'viewer');
  h.member('org-b', 'grace', 'super_admin');
  for (const username of ['sam', 'adam', 'ada', 'vic']) h.bind(username, 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
});

afterEach(() => {
  h.close();
});

function change(actor: string, target: string, role: string): Promise<Answer> {
  return h.call(actor, 'PATCH', `/api/organization/members/${h.userId(target)}`, { role });
}

function remove(actor: string, target: string): Promise<Answer> {
  return h.call(actor, 'DELETE', `/api/organization/members/${h.userId(target)}`);
}

/** Every membership, to show a refusal changed none. */
function memberships(): unknown {
  return h.sqlite
    .query('SELECT organization_id, user_id, role FROM organization_membership ORDER BY rowid')
    .all();
}

const forbidden = { status: 403, body: { error: 'forbidden' } };

describe('before activation', () => {
  it('has no organization to administer', async () => {
    h.close();
    h = OrganizationHarness.openComposed();
    for (const username of ['sam', 'vic']) await h.register(username);
    h.organization('org-a');
    h.member('org-a', 'sam', 'super_admin');
    h.member('org-a', 'vic', 'viewer');
    h.bind('sam', 'org-a');
    const before = memberships();
    expect(await change('sam', 'vic', 'member')).toEqual({
      status: 403,
      body: { error: 'no_active_organization' },
    });
    expect(memberships()).toEqual(before);
  });
});

describe('after activation', () => {
  it('refuses a member and a viewer every membership change', async () => {
    const before = memberships();
    for (const actor of ['ada', 'vic']) {
      expect(await change(actor, 'vic', 'member')).toEqual(forbidden);
      expect(await change(actor, 'ada', 'viewer')).toEqual(forbidden);
      expect(await remove(actor, 'vic')).toEqual(forbidden);
    }
    expect(memberships()).toEqual(before);
  });

  it('refuses an admin promoting a member to admin, or changing or removing an admin', async () => {
    const before = memberships();
    expect(await change('adam', 'ada', 'admin')).toEqual(forbidden);
    expect(await change('adam', 'ada', 'super_admin')).toEqual(forbidden);
    expect(await change('adam', 'sam', 'member')).toEqual(forbidden);
    expect(await change('adam', 'adam', 'member')).toEqual(forbidden);
    expect(await remove('adam', 'sam')).toEqual(forbidden);
    expect(memberships()).toEqual(before);
  });

  it('lets an admin move viewers and members, and remove them', async () => {
    expect(await change('adam', 'vic', 'member')).toEqual({
      status: 200,
      body: { membership: { userId: h.userId('vic'), role: 'member' } },
    });
    expect((await change('adam', 'ada', 'viewer')).status).toBe(200);
    expect(await remove('adam', 'ada')).toEqual({ status: 204, body: null });
  });

  it('lets a super-admin grant and revoke admin and super-admin', async () => {
    expect((await change('sam', 'ada', 'admin')).status).toBe(200);
    expect((await change('sam', 'adam', 'member')).status).toBe(200);
    expect((await change('sam', 'ada', 'super_admin')).status).toBe(200);
    expect(await remove('sam', 'sam')).toEqual({ status: 204, body: null });
  });

  it('refuses demoting or removing the last super-admin', async () => {
    const before = memberships();
    expect(await change('sam', 'sam', 'admin')).toEqual({
      status: 409,
      body: { error: 'last_super_admin' },
    });
    expect(await remove('sam', 'sam')).toEqual({
      status: 409,
      body: { error: 'last_super_admin' },
    });
    expect(memberships()).toEqual(before);
  });

  it('answers a foreign or absent member as not found, changing nothing', async () => {
    const before = memberships();
    const absent = await h.call('sam', 'PATCH', '/api/organization/members/nobody', {
      role: 'member',
    });
    expect(absent).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(await change('sam', 'grace', 'member')).toEqual(absent);
    expect(await remove('sam', 'grace')).toEqual(absent);
    expect(memberships()).toEqual(before);
  });

  it('refuses an unbound session and a removed member', async () => {
    const before = memberships();
    h.unbind('ada');
    expect(await change('ada', 'vic', 'member')).toEqual({
      status: 403,
      body: { error: 'no_active_organization' },
    });
    h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('adam')]);
    expect(await change('adam', 'vic', 'member')).toEqual({
      status: 403,
      body: { error: 'not_a_member' },
    });
    expect(memberships()).toEqual(
      (before as { user_id: string }[]).filter((row) => row.user_id !== h.userId('adam')),
    );
  });
});
