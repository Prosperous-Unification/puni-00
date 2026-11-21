import { afterEach, beforeEach, expect, it, spyOn } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';
let harness: OrganizationHarness;
let projectId: string;
beforeEach(async () => {
  harness = OrganizationHarness.openComposed();
  await harness.register('actor');
  harness.organization('org');
  harness.member('org', 'actor', 'viewer', ['org-admin']);
  harness.bind('actor', 'org');
  harness.activate();
  const created = await harness.call('actor', 'POST', '/api/projects', { name: 'Catalogue proof' });
  expect(created.status).toBe(200);
  projectId = (created.body as { project: { id: string } }).project.id;
  harness.grant('org', 'actor', 'package-manager', 'work_package', projectId);
  harness.sqlite.run(
    "DELETE FROM access_grant WHERE organization_id='org' AND scope_kind='organization' AND subject_kind='user' AND subject_id=? AND role_id='org-admin'",
    [harness.userId('actor')],
  );
  expect(
    (
      await harness.call('actor', 'PATCH', '/api/projects/' + projectId, {
        name: 'Sufficient package grant',
      })
    ).status,
  ).toBe(200);
});
afterEach(() => {
  harness.close();
});
for (const fault of [
  'orphan-role',
  'unknown-kind',
  'unknown-permission',
  'empty-set',
  'invalid-flag',
] as const) {
  it(
    'refuses a mounted project mutation on selected ' +
      fault +
      ' beside sufficient package authority',
    async () => {
      harness.sqlite.run(
        "INSERT INTO access_role(id,name,object_kind,level,reaches_restricted,organization_id,created_at) VALUES('selected-corrupt','Selected corrupt','organization',NULL,0,'org',1)",
      );
      harness.sqlite.run(
        "INSERT INTO access_role_permission(role_id,permission) VALUES('selected-corrupt','organization.read')",
      );
      harness.grant('org', 'actor', 'selected-corrupt');
      if (fault === 'orphan-role') {
        harness.sqlite.run('PRAGMA foreign_keys=OFF');
        try {
          harness.sqlite.run("DELETE FROM access_role WHERE id='selected-corrupt'");
        } finally {
          harness.sqlite.run('PRAGMA foreign_keys=ON');
        }
        expect(
          harness.sqlite.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get()
            ?.foreign_keys,
        ).toBe(1);
      } else if (fault === 'unknown-kind' || fault === 'invalid-flag') {
        harness.sqlite.run('PRAGMA ignore_check_constraints=ON');
        try {
          harness.sqlite.run(
            fault === 'unknown-kind'
              ? "UPDATE access_role SET object_kind='space' WHERE id='selected-corrupt'"
              : "UPDATE access_role SET reaches_restricted=2 WHERE id='selected-corrupt'",
          );
        } finally {
          harness.sqlite.run('PRAGMA ignore_check_constraints=OFF');
        }
      } else if (fault === 'unknown-permission')
        harness.sqlite.run(
          "INSERT INTO access_role_permission(role_id,permission) VALUES('selected-corrupt','package.teleport')",
        );
      else
        harness.sqlite.run("DELETE FROM access_role_permission WHERE role_id='selected-corrupt'");
      const snapshot = () =>
        [
          'project',
          'step',
          'work_item',
          'access_role',
          'access_role_permission',
          'access_grant',
          'organization_membership',
          'event_log',
          'event_sequencer',
          'command_journal',
          'organization_audit',
        ].map((table) => harness.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());
      const before = snapshot();
      const publication = spyOn(harness.publicWrites().announcements, 'publish').mockResolvedValue(
        undefined,
      );
      try {
        const answer = await harness.call('actor', 'PATCH', '/api/projects/' + projectId, {
          name: 'Must not write',
        });
        expect(answer.status).toBe(500);
        expect(snapshot()).toEqual(before);
        expect(publication).not.toHaveBeenCalled();
      } finally {
        publication.mockRestore();
      }
    },
  );
}
