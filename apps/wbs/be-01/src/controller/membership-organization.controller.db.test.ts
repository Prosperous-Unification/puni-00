import { SqliteOrganizationAccess } from '@wbs/store-sqlite/organization-access';
import { afterEach, beforeEach, expect, it, spyOn } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/**
 * Membership removal under current grants, over be-01's
 * production composition and real SQLite; see
 * {@link OrganizationHarness.openComposed}.
 */
let h: OrganizationHarness;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  for (const username of ['sam', 'adam', 'ada', 'vic', 'grace']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'sam', 'super_admin', ['org-super-admin']);
  h.member('org-a', 'adam', 'admin');
  h.member('org-a', 'ada', 'member');
  h.member('org-a', 'vic', 'viewer');
  h.member('org-b', 'grace', 'super_admin', ['org-super-admin']);
  for (const username of ['sam', 'adam', 'ada', 'vic']) h.bind(username, 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
});

afterEach(() => {
  h.close();
});

function remove(actor: string, target: string): Promise<Answer> {
  return h.call(actor, 'DELETE', '/api/organization/members/' + h.userId(target));
}
function memberships(): unknown {
  return h.sqlite
    .query('SELECT organization_id,user_id,role FROM organization_membership ORDER BY rowid')
    .all();
}
it('retires membership role changes for every caller', async () => {
  const before = memberships();
  for (const actor of ['sam', 'adam', 'ada', 'vic'])
    expect(
      (
        await h.call(actor, 'PATCH', '/api/organization/members/' + h.userId('vic'), {
          role: 'member',
        })
      ).status,
    ).toBe(404);
  expect(memberships()).toEqual(before);
});
it('requires current grants even for a legacy admin', async () => {
  expect(await remove('adam', 'vic')).toEqual({
    status: 403,
    body: { error: 'forbidden', permission: 'organization.manage_members' },
  });
  h.grantPermissions('org-a', 'adam', ['organization.manage_members']);
  expect(await remove('adam', 'vic')).toEqual({ status: 204, body: null });
});
it('preserves foreign and missing member concealment', async () => {
  const absent = await h.call('sam', 'DELETE', '/api/organization/members/nobody');
  expect(absent).toEqual({ status: 404, body: { error: 'not_found' } });
  expect(await remove('sam', 'grace')).toEqual(absent);
});
it('refuses removing the final direct super-admin holder', async () => {
  const before = memberships();
  expect(await remove('sam', 'sam')).toEqual({ status: 409, body: { error: 'last_super_admin' } });
  expect(memberships()).toEqual(before);
});
it('refuses an unbound session and a removed member before target lookup', async () => {
  h.unbind('ada');
  expect(await remove('ada', 'vic')).toEqual({
    status: 403,
    body: { error: 'no_active_organization' },
  });
  h.sqlite.run('DELETE FROM organization_membership WHERE user_id=?', [h.userId('adam')]);
  expect(await remove('adam', 'vic')).toEqual({ status: 403, body: { error: 'not_a_member' } });
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
it('audits a zero-direct-grant admin-route self removal as route rather than self_leave', async () => {
  h.sqlite.run(
    "UPDATE organization_membership SET role='super_admin' WHERE organization_id='org-a' AND user_id=?",
    [h.userId('ada')],
  );
  h.grant('org-a', 'ada', 'org-super-admin');
  h.sqlite.run("DELETE FROM access_grant WHERE subject_kind='user' AND subject_id=?", [
    h.userId('sam'),
  ]);
  h.sqlite.run(
    "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('member-admin','org-a','organization','org-a','organization_members','org-a','org-admin','route',1)",
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
