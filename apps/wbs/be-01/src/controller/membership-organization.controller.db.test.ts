import { SqliteOrganizationAccess } from '@wbs/store-sqlite/organization-access';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

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

function seedMemberAuthority(organizationId: string, userId: string): void {
  for (let index = 0; index < 2; index++)
    h.sqlite.run(
      "INSERT INTO access_grant (id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at,created_by) VALUES (?,?, 'organization',?,'user',?,?,'route',1,NULL)",
      [
        crypto.randomUUID(),
        organizationId,
        organizationId,
        userId,
        index === 0 ? 'org-viewer' : 'project-contributor',
      ],
    );
  for (let index = 0; index < 3; index++) {
    const id = crypto.randomUUID();
    h.sqlite.run('INSERT INTO access_group (id,organization_id,name,created_at) VALUES (?,?,?,1)', [
      id,
      organizationId,
      id,
    ]);
    h.sqlite.run(
      'INSERT INTO access_group_member (organization_id,group_id,user_id,created_at) VALUES (?,?,?,1)',
      [organizationId, id, userId],
    );
  }
}
function memberAuditRows() {
  return h.sqlite
    .query<{ actor_id: string; subject_kind: string; subject_id: string; detail: string }, []>(
      "SELECT actor_id,subject_kind,subject_id,detail FROM organization_audit WHERE action='organization_member_removed'",
    )
    .all();
}
function authoritySnapshot() {
  return {
    members: memberships(),
    grants: h.sqlite.query('SELECT * FROM access_grant ORDER BY id').all(),
    groups: h.sqlite.query('SELECT * FROM access_group_member ORDER BY group_id,user_id').all(),
    audits: h.sqlite.query('SELECT * FROM organization_audit ORDER BY rowid').all(),
  };
}

it('removes user grants and group memberships with one aggregate route audit, fencing other organizations', async () => {
  const target = h.userId('ada');
  h.member('org-b', 'ada', 'member');
  seedMemberAuthority('org-a', target);
  seedMemberAuthority('org-b', target);
  expect(await remove('sam', 'ada')).toEqual({ status: 204, body: null });
  expect(
    h.sqlite.query('SELECT organization_id FROM access_grant WHERE subject_id=?').all(target),
  ).toEqual([{ organization_id: 'org-b' }, { organization_id: 'org-b' }]);
  expect(
    h.sqlite.query('SELECT organization_id FROM access_group_member WHERE user_id=?').all(target),
  ).toEqual([
    { organization_id: 'org-b' },
    { organization_id: 'org-b' },
    { organization_id: 'org-b' },
  ]);
  expect(memberAuditRows()).toEqual([
    {
      actor_id: h.userId('sam'),
      subject_kind: 'organization_member',
      subject_id: target,
      detail: JSON.stringify({
        source: 'route',
        removedUserGrantCount: 2,
        removedGroupMembershipCount: 3,
      }),
    },
  ]);
  expect(h.sqlite.query('SELECT action FROM organization_audit').all()).toEqual([
    { action: 'organization_member_removed' },
  ]);
});
it('audits a zero-grant admin-route self removal as route rather than self_leave', async () => {
  h.sqlite.run(
    "UPDATE organization_membership SET role='super_admin' WHERE organization_id='org-a' AND user_id=?",
    [h.userId('ada')],
  );
  expect((await remove('sam', 'sam')).status).toBe(204);
  const row = memberAuditRows().at(0);
  if (row === undefined) throw new Error('aggregate member audit missing');
  expect(row.actor_id).toBe(h.userId('sam'));
  expect(row.subject_id).toBe(h.userId('sam'));
  expect(JSON.parse(row.detail)).toEqual({
    source: 'route',
    removedUserGrantCount: 0,
    removedGroupMembershipCount: 0,
  });
});
it('rolls direct member authority cleanup back when its aggregate audit is unavailable', async () => {
  seedMemberAuthority('org-a', h.userId('ada'));
  const before = authoritySnapshot();
  h.sqlite.run(
    "CREATE TRIGGER member_audit_fault BEFORE INSERT ON organization_audit WHEN NEW.action='organization_member_removed' BEGIN SELECT RAISE(ABORT,'member audit unavailable'); END",
  );
  expect((await remove('sam', 'ada')).status).toBe(500);
  expect(authoritySnapshot()).toEqual(before);
});
it('retains the authenticated membership removal actor before organization resolution', async () => {
  const observer = spyOn(SqliteOrganizationAccess.prototype, 'resolve');
  const resolve = observer.getMockImplementation();
  if (resolve === undefined) throw new Error('member resolver lost implementation');
  observer.mockImplementation(async function (this: SqliteOrganizationAccess, principal) {
    const admitted = await resolve.call(this, principal);
    Object.assign(principal, { id: h.userId('adam') });
    return admitted;
  });
  try {
    expect((await remove('sam', 'ada')).status).toBe(204);
    expect(memberAuditRows().map((row) => row.actor_id)).toEqual([h.userId('sam')]);
  } finally {
    observer.mockRestore();
  }
});

it('retains other users and polymorphic group grants during account membership cleanup', async () => {
  const target = h.userId('ada');
  const other = h.userId('vic');
  seedMemberAuthority('org-a', target);
  seedMemberAuthority('org-a', other);
  h.sqlite.run(
    "INSERT INTO access_group (id,organization_id,name,created_at) VALUES (?,'org-a','Account-ID group',1)",
    [target],
  );
  h.sqlite.run(
    "INSERT INTO access_grant (id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES ('same-id-group-grant','org-a','organization','org-a','group',?,'org-viewer','backfill',1)",
    [target],
  );
  expect((await remove('sam', 'ada')).status).toBe(204);
  expect(h.sqlite.query("SELECT id FROM access_grant WHERE subject_kind='group'").all()).toEqual([
    { id: 'same-id-group-grant' },
  ]);
  expect(
    h.sqlite
      .query("SELECT id FROM access_grant WHERE subject_kind='user' AND subject_id=?")
      .all(other),
  ).toHaveLength(2);
  expect(
    h.sqlite.query('SELECT user_id FROM access_group_member WHERE user_id=?').all(other),
  ).toHaveLength(3);
  expect(
    h.sqlite
      .query(
        "SELECT user_id FROM organization_membership WHERE organization_id='org-a' AND user_id=?",
      )
      .get(target),
  ).toBeNull();
});
