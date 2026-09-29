import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The member list for administrators, over be-01's production composition and
 * real SQLite; see {@link OrganizationHarness.openComposed}.
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
  h.sqlite.run("UPDATE users SET email = 'ada@acme.test' WHERE id = ?", [h.userId('ada')]);
});

afterEach(() => {
  h.close();
});

const forbidden = { status: 403, body: { error: 'forbidden' } };

describe('the member list', () => {
  it('has no organization to list before activation', async () => {
    expect(await h.call('sam', 'GET', '/api/organization/members')).toEqual({
      status: 403,
      body: { error: 'no_active_organization' },
    });
  });

  it('lists the active organization to an admin and a super-admin', async () => {
    h.activate();
    for (const actor of ['sam', 'adam']) {
      const answer = await h.call(actor, 'GET', '/api/organization/members');
      expect(answer.status).toBe(200);
      const members = (answer.body as { members: { username: string; email: unknown }[] }).members;
      expect(members.map((member) => member.username).sort()).toEqual([
        'ada',
        'adam',
        'sam',
        'vic',
      ]);
      expect(members.find((member) => member.username === 'ada')).toMatchObject({
        userId: h.userId('ada'),
        email: 'ada@acme.test',
        role: 'member',
      });
      expect(members.find((member) => member.username === 'vic')).toMatchObject({
        email: null,
        role: 'viewer',
      });
    }
  });

  it('refuses a member and a viewer the member list', async () => {
    h.activate();
    expect(await h.call('ada', 'GET', '/api/organization/members')).toEqual(forbidden);
    expect(await h.call('vic', 'GET', '/api/organization/members')).toEqual(forbidden);
  });

  it("lists only the active organization's members", async () => {
    h.activate();
    const answer = await h.call('grace', 'GET', '/api/organization/members');
    expect(answer.status).toBe(200);
    expect(
      (answer.body as { members: { username: string }[] }).members.map((member) => member.username),
    ).toEqual(['grace']);
  });

  it('refuses a removed administrator', async () => {
    h.activate();
    h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('adam')]);
    expect((await h.call('adam', 'GET', '/api/organization/members')).status).toBe(403);
  });
});
