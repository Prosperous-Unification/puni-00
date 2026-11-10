import { openConnection } from '@wbs/store-sqlite/db';
import { WriteCoordinator } from '@wbs/store-sqlite/gate';
import { OrganizationRepository } from '@wbs/store-sqlite/organization';
import { SqliteOrganizationAccess } from '@wbs/store-sqlite/organization-access';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { LaneProcess } from '../testing/lane-process';
import {
  addAgentPerson,
  grantCredential,
  issueApiKey,
} from '../testing/machine-credential-fixture';
import { OrganizationHarness } from '../testing/organization-harness';

let h: OrganizationHarness;
beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  for (const username of ['owner', 'reader', 'plain', 'target']) await h.register(username);
  h.organization('org');
  h.member('org', 'owner', 'super_admin', ['org-super-admin']);
  h.member('org', 'reader', 'viewer');
  h.member('org', 'plain', 'super_admin');
  h.member('org', 'target', 'member');
  for (const username of ['owner', 'reader', 'plain', 'target']) h.bind(username, 'org');
  h.activate();
});
afterEach(async () => {
  await LaneProcess.stopAll();
  h.close();
});

describe('current grants on the membership API', () => {
  it('admits member listing by organization.read rather than membership role', async () => {
    h.grantPermissions('org', 'reader', ['organization.read']);
    const answer = await h.call('reader', 'GET', '/api/organization/members');
    expect(answer.status).toBe(200);
    expect(
      (answer.body as { members: { username: string }[] }).members
        .map((member) => member.username)
        .sort(),
    ).toEqual(['owner', 'plain', 'reader', 'target']);
  });

  it('names organization.read when a role-only super-admin lists members', async () => {
    expect(await h.call('plain', 'GET', '/api/organization/members')).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'organization.read' },
    });
  });

  it('reports organization-kind permission unions and distinct all-scope account grant counts', async () => {
    h.grantPermissions('org', 'reader', ['organization.read']);
    h.grant('org', 'target', 'org-viewer');
    h.grant('org', 'target', 'project-contributor');
    const answer = await h.call('reader', 'GET', '/api/organization/members');
    expect(answer.status).toBe(200);
    const members = (
      answer.body as {
        members: {
          username: string;
          role?: unknown;
          grantCount: number;
          effectiveRole: { permissions: string[]; via: { roleId: string }[] } | null;
        }[];
      }
    ).members;
    const target = members.find((member) => member.username === 'target');
    expect(target?.role).toBeUndefined();
    expect(target?.grantCount).toBe(2);
    expect(target?.effectiveRole?.via.map((grant) => grant.roleId)).toEqual(['org-viewer']);
    expect(target?.effectiveRole?.permissions).toContain('organization.read');
    expect(target?.effectiveRole?.permissions).not.toContain('package.write');
    expect(members.find((member) => member.username === 'plain')).toMatchObject({
      effectiveRole: null,
      grantCount: 0,
    });
  });

  it('names manage_members when a role-only super-admin removes a member', async () => {
    expect(
      await h.call('plain', 'DELETE', '/api/organization/members/' + h.userId('target')),
    ).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'organization.manage_members' },
    });
    expect(
      h.sqlite
        .query('SELECT count(*) AS n FROM organization_membership WHERE user_id = ?')
        .get(h.userId('target')),
    ).toEqual({ n: 1 });
  });

  it('requires organization-role permission to remove a direct org-viewer holder', async () => {
    h.grantPermissions('org', 'reader', ['organization.manage_members']);
    h.grant('org', 'target', 'org-viewer');
    expect(
      await h.call('reader', 'DELETE', '/api/organization/members/' + h.userId('target')),
    ).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'organization.manage_organization_roles' },
    });
    expect(
      h.sqlite
        .query('SELECT count(*) AS n FROM access_grant WHERE subject_id = ?')
        .get(h.userId('target')),
    ).toEqual({ n: 1 });
  });

  it('removes an ordinary member through a minimal effective manage_members grant', async () => {
    h.grantPermissions('org', 'reader', ['organization.manage_members']);
    expect(
      await h.call('reader', 'DELETE', '/api/organization/members/' + h.userId('target')),
    ).toEqual({ status: 204, body: null });
  });

  it('removes a legacy-role super-admin who holds no access grant', async () => {
    expect(
      await h.call('owner', 'DELETE', '/api/organization/members/' + h.userId('plain')),
    ).toEqual({ status: 204, body: null });
  });

  it('rolls back removal of the final direct built-in holder despite custom equivalent authority', async () => {
    h.sqlite.run('DELETE FROM access_grant WHERE subject_id = ?', [h.userId('owner')]);
    h.grantPermissions('org', 'owner', [
      'organization.manage_members',
      'organization.manage_organization_roles',
    ]);
    h.grant('org', 'target', 'org-super-admin');
    const before = h.sqlite.query('SELECT * FROM access_grant ORDER BY id').all();
    expect(
      await h.call('owner', 'DELETE', '/api/organization/members/' + h.userId('target')),
    ).toEqual({ status: 409, body: { error: 'last_super_admin' } });
    expect(h.sqlite.query('SELECT * FROM access_grant ORDER BY id').all()).toEqual(before);
    expect(
      h.sqlite
        .query('SELECT count(*) AS n FROM organization_membership WHERE user_id = ?')
        .get(h.userId('target')),
    ).toEqual({ n: 1 });
    expect(h.sqlite.query('SELECT count(*) AS n FROM organization_audit').get()).toEqual({ n: 0 });
  });

  it('does not expose changeMemberRole as a membership API operation', async () => {
    expect(
      (
        await h.call('owner', 'PATCH', '/api/organization/members/' + h.userId('target'), {
          role: 'admin',
        })
      ).status,
    ).toBe(404);
  });
});

for (const operation of ['list', 'remove'] as const) {
  it('rechecks queued membership permission revocation at ' + operation, async () => {
    h.grantPermissions('org', 'reader', ['organization.read', 'organization.manage_members']);
    const connection = openConnection(h.databasePath());
    const gate = new WriteCoordinator();
    const held = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const blocker = gate.enter(async () => {
      entered.resolve(undefined);
      await held.promise;
    });
    await entered.promise;
    const actor = { id: h.userId('reader') };
    const repository = new OrganizationRepository(connection.db, gate);
    const pending =
      operation === 'list'
        ? repository.listMembers('org', actor)
        : repository.administer(
            'org',
            actor,
            h.userId('target'),
            { actor: actor.id, stamp: { at: 10, by: actor.id }, auditId: 'queued-member' },
            'route',
          );
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Bun.sleep(0);
    expect(settled).toBe(false);
    h.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [actor.id]);
    held.resolve(undefined);
    await blocker;
    try {
      expect(await pending).toEqual({
        ok: false,
        refusal: 'forbidden',
        permission: operation === 'list' ? 'organization.read' : 'organization.manage_members',
      });
      expect(h.sqlite.query('SELECT count(*) AS n FROM organization_audit').get()).toEqual({
        n: 0,
      });
    } finally {
      connection.close();
    }
  });
  it('retains queued credential authentication for membership ' + operation, async () => {
    const id = h.userId('owner');
    addAgentPerson(h.sqlite, 'membership-agent', 'org', id);
    const credential = await issueApiKey(h.sqlite, {
      organizationId: 'org',
      personId: 'membership-agent',
      issuedBy: id,
    });
    grantCredential(h.sqlite, 'org', credential.id, 'org-super-admin', 'organization', 'org');
    const connection = openConnection(h.databasePath());
    const gate = new WriteCoordinator();
    const repository = new OrganizationRepository(connection.db, gate);
    const held = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const blocker = gate.enter(async () => {
      entered.resolve(undefined);
      await held.promise;
    });
    await entered.promise;
    const authentication = {
      kind: 'machine' as const,
      credentialId: credential.id,
      personId: 'membership-agent',
    };
    const actor = { id, authentication };
    const pending =
      operation === 'list'
        ? repository.listMembers('org', actor)
        : repository.administer(
            'org',
            actor,
            h.userId('target'),
            { actor: id, stamp: { at: 10, by: id }, auditId: 'capped-member' },
            'route',
          );
    Object.assign(authentication, { kind: 'first_party', issuedAt: 1 });
    held.resolve(undefined);
    await blocker;
    try {
      expect(await pending).toEqual({
        ok: false,
        refusal: 'forbidden',
        permission: operation === 'list' ? 'organization.read' : 'organization.manage_members',
      });
      expect(h.sqlite.query('SELECT count(*) AS n FROM organization_audit').get()).toEqual({
        n: 0,
      });
    } finally {
      connection.close();
    }
  });
  it(
    'retains the membership ' + operation + ' principal before resolver alias changes',
    async () => {
      h.grantPermissions('org', 'reader', ['organization.read', 'organization.manage_members']);
      const observer = spyOn(SqliteOrganizationAccess.prototype, 'resolve');
      const resolve = observer.getMockImplementation();
      if (resolve === undefined) throw new Error('resolver implementation missing');
      observer.mockImplementation(async function (this: SqliteOrganizationAccess, principal) {
        const admitted = await resolve.call(this, principal);
        Object.assign(principal, {
          id: h.userId('plain'),
          authentication: { kind: 'machine', credentialId: 'replacement', personId: 'replacement' },
        });
        return admitted;
      });
      try {
        const answer = await h.call(
          'reader',
          operation === 'list' ? 'GET' : 'DELETE',
          operation === 'list'
            ? '/api/organization/members'
            : '/api/organization/members/' + h.userId('target'),
        );
        expect(answer.status).toBe(operation === 'list' ? 200 : 204);
        if (operation === 'remove')
          expect(h.sqlite.query('SELECT actor_id FROM organization_audit').all()).toEqual([
            { actor_id: h.userId('reader') },
          ]);
      } finally {
        observer.mockRestore();
      }
    },
  );
}

it('does not require organization-role permission for authority held only through a group', async () => {
  h.grantPermissions('org', 'reader', ['organization.manage_members']);
  const groupId = h.userId('target');
  h.sqlite.run(
    "INSERT INTO access_group(id,organization_id,name,created_at) VALUES(?,'org','Group',1)",
    [groupId],
  );
  h.sqlite.run(
    "INSERT INTO access_group_member(organization_id,group_id,user_id,created_at) VALUES('org',?,?,1)",
    [groupId, h.userId('target')],
  );
  h.sqlite.run(
    "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('group-grant','org','organization','org','group',?,'org-admin','route',1)",
    [groupId],
  );
  expect(
    (await h.call('reader', 'DELETE', '/api/organization/members/' + h.userId('target'))).status,
  ).toBe(204);
});

it('counts group and member-wide grants once and omits package-only organization roles', async () => {
  const created = await h.call('owner', 'POST', '/api/projects', { name: 'Private address' });
  expect(created.status).toBe(200);
  const packageId = (created.body as { project: { id: string } }).project.id;
  h.grant('org', 'target', 'package-viewer', 'work_package', packageId);
  h.sqlite.run(
    "INSERT INTO access_group(id,organization_id,name,created_at) VALUES('group','org','Group',1)",
  );
  h.sqlite.run(
    "INSERT INTO access_group_member(organization_id,group_id,user_id,created_at) VALUES('org','group',?,1)",
    [h.userId('target')],
  );
  h.sqlite.run(
    "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('group-grant','org','organization','org','group','group','project-contributor','route',1),('members-grant','org','organization','org','organization_members','org','project-viewer','route',1)",
  );
  const answer = await h.call('owner', 'GET', '/api/organization/members');
  expect(answer.status).toBe(200);
  const target = (
    answer.body as { members: { userId: string; grantCount: number; effectiveRole: unknown }[] }
  ).members.find((member) => member.userId === h.userId('target'));
  expect(target).toMatchObject({ grantCount: 3, effectiveRole: null });
  expect(JSON.stringify(answer.body)).not.toContain(packageId);
});

it('rolls admitted membership removal back on a late aggregate audit failure', async () => {
  const before = {
    members: h.sqlite.query('SELECT * FROM organization_membership ORDER BY user_id').all(),
    grants: h.sqlite.query('SELECT * FROM access_grant ORDER BY id').all(),
  };
  h.sqlite.run(
    "CREATE TRIGGER late_member_audit BEFORE INSERT ON organization_audit WHEN NEW.action='organization_member_removed' BEGIN SELECT RAISE(ABORT,'late aggregate audit fault');END",
  );
  expect(
    (await h.call('owner', 'DELETE', '/api/organization/members/' + h.userId('target'))).status,
  ).toBe(500);
  expect({
    members: h.sqlite.query('SELECT * FROM organization_membership ORDER BY user_id').all(),
    grants: h.sqlite.query('SELECT * FROM access_grant ORDER BY id').all(),
  }).toEqual(before);
  expect(h.sqlite.query('SELECT count(*) AS n FROM organization_audit').get()).toEqual({ n: 0 });
});

it('throws on corrupt nonorganization role rows before projecting member access', async () => {
  h.grant('org', 'target', 'project-contributor');
  h.sqlite.run('PRAGMA ignore_check_constraints=ON');
  h.sqlite.run(
    "INSERT INTO access_role_permission(role_id,permission) VALUES('project-contributor','unknown.permission')",
  );
  expect((await h.call('owner', 'GET', '/api/organization/members')).status).toBe(500);
});

it('returns a named CP14 conflict on the actual machine credential revoke route', async () => {
  const actor = h.userId('owner');
  addAgentPerson(h.sqlite, 'cp14-agent', 'org', actor);
  const credential = await issueApiKey(h.sqlite, {
    organizationId: 'org',
    personId: 'cp14-agent',
    issuedBy: actor,
  });
  h.sqlite.run(
    "DELETE FROM access_grant WHERE organization_id='org' AND role_id='org-super-admin'",
  );
  const before = h.sqlite.query('SELECT * FROM machine_credential ORDER BY id').all();
  expect(
    await h.call('owner', 'DELETE', '/api/organization/machine-credentials/' + credential.id),
  ).toEqual({ status: 409, body: { error: 'last_super_admin' } });
  expect(h.sqlite.query('SELECT * FROM machine_credential ORDER BY id').all()).toEqual(before);
  expect(h.sqlite.query('SELECT * FROM organization_audit').all()).toEqual([]);
});

for (const state of ['live', 'revoked'] as const) {
  it(
    'rolls a directory batch back on zero-grant credential CP14 conflict at ' + state,
    async () => {
      const actor = h.userId('owner');
      addAgentPerson(h.sqlite, 'cp14-person', 'org', actor);
      const credential = await issueApiKey(h.sqlite, {
        organizationId: 'org',
        personId: 'cp14-person',
        issuedBy: actor,
      });
      if (state === 'revoked')
        h.sqlite.run('UPDATE machine_credential SET revoked_at=5 WHERE id=?', [credential.id]);
      h.sqlite.run(
        "DELETE FROM access_grant WHERE organization_id='org' AND role_id='org-super-admin'",
      );
      h.grantPermissions('org', 'owner', ['organization.manage_directory']);
      const snapshot = () =>
        [
          'person',
          'person_organization',
          'tag',
          'tag_organization',
          'machine_credential',
          'machine_credential_secret',
          'access_grant',
          'organization_audit',
          'event_log',
          'command_journal',
        ].map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());
      const before = snapshot();
      expect(
        await h.call('owner', 'POST', '/api/directory/commands', {
          commands: [
            { kind: 'createTag', name: 'Must roll back' },
            { kind: 'deletePerson', personId: 'cp14-person', cascade: true },
          ],
        }),
      ).toEqual({ status: 409, body: { error: 'last_super_admin', at: 1, kind: 'deletePerson' } });
      expect(snapshot()).toEqual(before);
    },
  );
}

it('rolls standalone person cleanup and publications back on a CP14 refusal', async () => {
  const actor = h.userId('owner');
  addAgentPerson(h.sqlite, 'cp14-standalone', 'org', actor);
  await issueApiKey(h.sqlite, {
    organizationId: 'org',
    personId: 'cp14-standalone',
    issuedBy: actor,
  });
  h.sqlite.run(
    "DELETE FROM access_grant WHERE organization_id='org' AND role_id='org-super-admin'",
  );
  h.grantPermissions('org', 'owner', ['organization.manage_directory']);
  const access = {
    kind: 'scoped' as const,
    principal: { id: actor },
    scope: { organizationId: 'org', userId: actor, role: 'super_admin' as const, cap: null },
  };
  const snapshot = () =>
    [
      'person',
      'person_organization',
      'machine_credential',
      'machine_credential_secret',
      'access_grant',
      'organization_audit',
      'event_log',
      'event_sequencer',
      'command_journal',
    ].map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());
  const before = snapshot();
  const announcements = spyOn(h.publicWrites().announcements, 'publish').mockResolvedValue();
  try {
    expect(
      await h
        .publicDirectoryService()
        .removeWithin('people', 'cp14-standalone', actor, true, access),
    ).toEqual({ ok: false, reason: 'last_super_admin' });
    expect(snapshot()).toEqual(before);
    expect(announcements).not.toHaveBeenCalled();
  } finally {
    announcements.mockRestore();
  }
});

it('reaches the post-delete counter before rejecting an unreadable trusted scope column', async () => {
  const statements: string[] = [];
  const connection = openConnection(h.databasePath(), {
    logQuery(query) {
      statements.push(query);
    },
  });
  const snapshot = () =>
    ['organization_membership', 'access_grant', 'organization_audit'].map((table) =>
      h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
    );
  const before = snapshot();
  h.sqlite.run('ALTER TABLE access_grant RENAME COLUMN scope_id TO unavailable_scope_id');
  try {
    let failure: unknown;
    try {
      await new OrganizationRepository(connection.db, new WriteCoordinator()).removeMember(
        'org',
        h.userId('target'),
        {
          actor: h.userId('owner'),
          stamp: { at: 10, by: h.userId('owner') },
          auditId: 'unreadable-counter',
        },
        'route',
      );
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error('expected native counter failure');
    expect(failure.cause).toBeInstanceOf(Error);
    if (!(failure.cause instanceof Error)) throw new Error('native cause missing');
    expect(failure.cause.message).toMatch(/no such column:.*scope_id/);
    expect(failure.stack).toContain('directSuperAdminCount');
    expect(statements.filter((query) => query.startsWith('delete')).length).toBe(3);
    expect(statements.every((query) => !query.includes('scope_id'))).toBe(true);
    process.stderr.write(
      'Expected trusted-column fault: ' +
        String(failure.stack) +
        '\nNative cause: ' +
        String(failure.cause.stack) +
        '\n',
    );
  } finally {
    h.sqlite.run('ALTER TABLE access_grant RENAME COLUMN unavailable_scope_id TO scope_id');
    connection.close();
  }
  expect(snapshot()).toEqual(before);
});

for (const source of ['self_leave', 'route'] as const) {
  it(
    'checks CP14 and fresh actor authority across independent membership processes at ' + source,
    async () => {
      h.grant('org', 'target', 'org-super-admin');
      const ids = [h.userId('owner'), h.userId('target')];
      const worker = new URL('../testing/membership-removal.worker.ts', import.meta.url).pathname;
      const workers = ids.map((id, index) =>
        LaneProcess.spawn([
          process.execPath,
          worker,
          h.databasePath(),
          id,
          source === 'self_leave' ? id : ids[1 - index],
          source,
        ]),
      );
      await Promise.all(workers.map((child) => child.expectLine('ready')));
      await Promise.all(workers.map((child) => child.send('release')));
      const outcomes = await Promise.all(
        workers.map(async (child) => {
          const exit = await child.finish();
          expect(exit.code, exit.errors).toBe(0);
          expect(exit.errors).toBe('');
          return JSON.parse(exit.answer) as { ok: boolean; refusal?: string };
        }),
      );
      expect(outcomes.map((outcome) => (outcome.ok ? 'removed' : outcome.refusal)).sort()).toEqual(
        source === 'self_leave' ? ['last_super_admin', 'removed'] : ['forbidden', 'removed'],
      );
      expect(
        h.sqlite
          .query(
            "SELECT count(*) AS n FROM access_grant g JOIN organization_membership m ON m.organization_id=g.organization_id AND m.user_id=g.subject_id WHERE g.subject_kind='user' AND g.role_id='org-super-admin'",
          )
          .get(),
      ).toEqual({ n: 1 });
      expect(h.sqlite.query('SELECT action FROM organization_audit').all()).toEqual([
        { action: 'organization_member_removed' },
      ]);
    },
    20000,
  );
}

for (const fault of ['missing', 'kind', 'permission', 'empty', 'flag', 'breadth'] as const) {
  it(
    'throws for target-only direct role catalogue ' + fault + ' before membership removal',
    async () => {
      h.grantPermissions('org', 'reader', ['organization.manage_members']);
      h.grant('org', 'target', 'project-viewer');
      h.grant('org', 'target', 'org-viewer');
      h.sqlite.run('PRAGMA foreign_keys=OFF');
      h.sqlite.run('PRAGMA ignore_check_constraints=ON');
      if (fault === 'missing') h.sqlite.run("DELETE FROM access_role WHERE id='org-viewer'");
      if (fault === 'kind')
        h.sqlite.run("UPDATE access_role SET object_kind='unknown' WHERE id='org-viewer'");
      if (fault === 'permission')
        h.sqlite.run(
          "INSERT INTO access_role_permission(role_id,permission) VALUES('org-viewer','unknown.permission')",
        );
      if (fault === 'empty')
        h.sqlite.run("DELETE FROM access_role_permission WHERE role_id='org-viewer'");
      if (fault === 'flag')
        h.sqlite.run("UPDATE access_role SET reaches_restricted=2 WHERE id='org-viewer'");
      if (fault === 'breadth')
        h.sqlite.run("UPDATE access_role SET object_kind='project' WHERE id='org-viewer'");
      h.sqlite.run('PRAGMA foreign_keys=ON');
      h.sqlite.run('PRAGMA ignore_check_constraints=OFF');
      const snapshot = () =>
        [
          'organization_membership',
          'access_grant',
          'access_group_member',
          'organization_audit',
        ].map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());
      const before = snapshot();
      expect(
        (await h.call('reader', 'DELETE', '/api/organization/members/' + h.userId('target')))
          .status,
      ).toBe(500);
      expect(snapshot()).toEqual(before);
    },
  );
}
it('throws for an orphan target account grant before member summary projection', async () => {
  h.grant('org', 'target', 'project-viewer');
  h.sqlite.run('PRAGMA foreign_keys=OFF');
  h.sqlite.run("DELETE FROM access_role WHERE id='project-viewer'");
  h.sqlite.run('PRAGMA foreign_keys=ON');
  expect(h.sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  const before = h.sqlite.query('SELECT * FROM access_grant ORDER BY id').all();
  expect((await h.call('owner', 'GET', '/api/organization/members')).status).toBe(500);
  expect(h.sqlite.query('SELECT * FROM access_grant ORDER BY id').all()).toEqual(before);
  expect(h.sqlite.query('SELECT * FROM organization_audit').all()).toEqual([]);
});

it('rolls final direct-holder removal back through the actual complete counter', async () => {
  const statements: string[] = [];
  const connection = openConnection(h.databasePath(), {
    logQuery(query) {
      statements.push(query);
    },
  });
  const snapshot = () =>
    ['organization_membership', 'access_grant', 'organization_audit'].map((table) =>
      h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
    );
  const before = snapshot();
  try {
    expect(
      await new OrganizationRepository(connection.db, new WriteCoordinator()).removeMember(
        'org',
        h.userId('owner'),
        {
          actor: h.userId('owner'),
          stamp: { at: 10, by: h.userId('owner') },
          auditId: 'raw-final-holder',
        },
        'self_leave',
      ),
    ).toBe('last-super-admin');
    const count = statements.findIndex((query) => query.startsWith('select count('));
    expect(count).toBeGreaterThan(0);
    expect(statements.slice(0, count).every((query) => !query.includes('scope_id'))).toBe(true);
    expect(snapshot()).toEqual(before);
  } finally {
    connection.close();
  }
});
it('reports missing catalogue state through the actual direct-target writer', async () => {
  h.grantPermissions('org', 'reader', ['organization.manage_members']);
  h.grant('org', 'target', 'org-viewer');
  h.sqlite.run('PRAGMA foreign_keys=OFF');
  h.sqlite.run("DELETE FROM access_role WHERE id='org-viewer'");
  h.sqlite.run('PRAGMA foreign_keys=ON');
  const connection = openConnection(h.databasePath());
  const actor = h.userId('reader');
  const before = h.sqlite.query('SELECT * FROM organization_membership ORDER BY rowid').all();
  try {
    expect(
      (
        await readRejection(
          new OrganizationRepository(connection.db, new WriteCoordinator()).administer(
            'org',
            { id: actor },
            h.userId('target'),
            { actor, stamp: { at: 1, by: actor }, auditId: 'orphan-target' },
            'route',
          ),
        )
      ).message,
    ).toContain('references missing access role');
    expect(h.sqlite.query('SELECT * FROM organization_membership ORDER BY rowid').all()).toEqual(
      before,
    );
    expect(h.sqlite.query('SELECT * FROM organization_audit').all()).toEqual([]);
  } finally {
    connection.close();
  }
});

async function readRejection(pending: Promise<unknown>): Promise<Error> {
  const failure: unknown = await pending.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  if (!(failure instanceof Error))
    throw new Error('Expected the production operation to reject', { cause: failure });
  return failure;
}
