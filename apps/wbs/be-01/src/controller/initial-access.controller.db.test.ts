import type { AuthenticatedUser } from '@wbs/contracts';
import { AuthService } from '@wbs/core/service/auth.service';
import { selectInitialAccess } from '@wbs/domain';
import { AccessDecisionRepository } from '@wbs/store-sqlite/access-decisions';
import { openConnection } from '@wbs/store-sqlite/db';
import { OPEN, WriteCoordinator } from '@wbs/store-sqlite/gate';
import { InvitationRepository } from '@wbs/store-sqlite/invitation';
import { JoinRequestRepository } from '@wbs/store-sqlite/join-request';
import { SqliteOrganizationAccess } from '@wbs/store-sqlite/organization-access';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { nodeDigest } from '../runtime/bun-runtime';
import {
  addAgentPerson,
  grantCredential,
  issueApiKey,
} from '../testing/machine-credential-fixture';
import { OrganizationHarness } from '../testing/organization-harness';

let h: OrganizationHarness;
beforeEach(async () => {
  h = OrganizationHarness.open();
  for (const name of ['owner', 'clerk', 'recipient', 'existing']) await h.register(name);
  h.organization('org');
  h.member('org', 'owner', 'viewer', ['org-super-admin']);
  h.member('org', 'clerk', 'admin');
  h.member('org', 'existing', 'member');
  h.bind('owner', 'org');
  h.bind('clerk', 'org');
  for (const name of ['recipient', 'existing'])
    h.sqlite.run('UPDATE users SET email=?,email_verified=1 WHERE id=?', [
      name + '@example.org',
      h.userId(name),
    ]);
  h.activate();
});
afterEach(() => {
  h.close();
});
const offer = (actor: string, email = 'recipient@example.org', initialRoleId?: string | null) =>
  h.call(actor, 'POST', '/api/organization/invitations', {
    email,
    ...(initialRoleId === undefined ? {} : { initialRoleId }),
  });
const accept = (recipient = 'recipient') =>
  h.call(recipient, 'POST', '/api/onboarding/invitations/accept', {
    token: h.deliveredEmailToken(recipient + '@example.org'),
  });

describe('initial access through personally issued offers', () => {
  it.each(['org-admin', 'org-viewer', 'project-contributor', 'project-viewer'] as const)(
    'grants %s as the durable personal issuer inside new-member acceptance',
    async (roleId) => {
      const issued = await offer('owner', 'recipient@example.org', roleId);
      expect(issued.status).toBe(201);
      expect(issued.body).toMatchObject({ invitation: { initialRoleId: roleId } });
      expect(JSON.stringify(issued.body)).not.toContain('"role":');
      expect(await accept()).toEqual({
        status: 200,
        body: { membership: { organizationId: 'org' } },
      });
      expect(
        h.sqlite
          .query(
            "SELECT role_id,origin,created_by FROM access_grant WHERE subject_kind='user' AND subject_id=?",
          )
          .all(h.userId('recipient')),
      ).toEqual([{ role_id: roleId, origin: 'invitation', created_by: h.userId('owner') }]);
      expect(
        h.sqlite
          .query(
            "SELECT actor_id,action,json_extract(detail,'$.origin') AS origin,json_extract(detail,'$.subjectId') AS member_id FROM organization_audit WHERE action='access_granted'",
          )
          .all(),
      ).toEqual([
        {
          actor_id: h.userId('owner'),
          action: 'access_granted',
          origin: 'invitation',
          member_id: h.userId('recipient'),
        },
      ]);
      expect(
        h.sqlite.query('SELECT consumed_by,created_by FROM organization_invitation').get(),
      ).toEqual({ consumed_by: h.userId('recipient'), created_by: h.userId('owner') });
      expect(
        h.sqlite
          .query('SELECT created_by FROM organization_membership WHERE user_id=?')
          .get(h.userId('recipient')),
      ).toEqual({ created_by: h.userId('recipient') });
    },
  );

  it('accepts omitted initial access as membership with no grant', async () => {
    expect((await offer('owner')).status).toBe(201);
    expect(await accept()).toEqual({
      status: 200,
      body: { membership: { organizationId: 'org' } },
    });
    expect(
      h.sqlite.query('SELECT id FROM access_grant WHERE subject_id=?').all(h.userId('recipient')),
    ).toEqual([]);
    expect(
      h.sqlite.query("SELECT id FROM organization_audit WHERE action='access_granted'").all(),
    ).toEqual([]);
    h.bind('recipient', 'org');
    expect(await h.call('recipient', 'GET', '/api/projects')).toEqual({
      status: 200,
      body: { projects: [], nextCursor: null },
    });
  });

  it('consumes an existing member offer without upgrading membership or grants', async () => {
    const before = h.sqlite
      .query('SELECT * FROM organization_membership WHERE user_id=?')
      .get(h.userId('existing'));
    expect((await offer('owner', 'existing@example.org', 'org-admin')).status).toBe(201);
    expect((await accept('existing')).status).toBe(200);
    expect(
      h.sqlite
        .query('SELECT * FROM organization_membership WHERE user_id=?')
        .get(h.userId('existing')),
    ).toEqual(before);
    expect(
      h.sqlite.query('SELECT id FROM access_grant WHERE subject_id=?').all(h.userId('existing')),
    ).toEqual([]);
    expect(
      h.sqlite.query("SELECT id FROM organization_audit WHERE action='access_granted'").all(),
    ).toEqual([]);
  });

  it('requires manage_members even when a legacy admin issues no initial access', async () => {
    expect(await offer('clerk')).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'organization.manage_members' },
    });
    expect(h.sqlite.query('SELECT * FROM organization_invitation').all()).toEqual([]);
  });

  it.each([
    ['org-viewer', 'organization.manage_organization_roles'],
    ['project-viewer', 'organization.manage_access'],
  ] as const)('requires the grant permission for initial %s', async (roleId, permission) => {
    h.grantPermissions('org', 'clerk', ['organization.manage_members']);
    expect(await offer('clerk', 'recipient@example.org', roleId)).toEqual({
      status: 403,
      body: { error: 'forbidden', permission },
    });
    expect(h.sqlite.query('SELECT * FROM organization_invitation').all()).toEqual([]);
  });

  it('refuses the first permission missing from the full initial-role comparison set', async () => {
    h.grantPermissions('org', 'clerk', [
      'organization.manage_members',
      'organization.manage_access',
    ]);
    h.grant('org', 'clerk', 'project-viewer');
    expect(await offer('clerk', 'recipient@example.org', 'project-contributor')).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'package.write' },
    });
    expect(h.sqlite.query('SELECT * FROM organization_invitation').all()).toEqual([]);
  });

  it('compares full ancestor grant sets before organization-target permission filtering', async () => {
    h.grantPermissions('org', 'clerk', [
      'organization.manage_members',
      'organization.manage_access',
    ]);
    h.grant('org', 'clerk', 'project-contributor');
    expect((await offer('clerk', 'recipient@example.org', 'project-contributor')).status).toBe(201);
    expect((await accept()).status).toBe(200);
    expect(
      h.sqlite
        .query('SELECT role_id FROM access_grant WHERE subject_id=?')
        .all(h.userId('recipient')),
    ).toEqual([{ role_id: 'project-contributor' }]);
  });

  it('rechecks current issuer authority before consuming and granting initial access', async () => {
    expect((await offer('owner', 'recipient@example.org', 'project-viewer')).status).toBe(201);
    h.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [h.userId('owner')]);
    expect(await accept()).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'organization.manage_members' },
    });
    expect(h.sqlite.query('SELECT consumed_at FROM organization_invitation').get()).toEqual({
      consumed_at: null,
    });
    expect(
      h.sqlite
        .query('SELECT * FROM organization_membership WHERE user_id=?')
        .all(h.userId('recipient')),
    ).toEqual([]);
    expect(h.sqlite.query('SELECT * FROM organization_audit').all()).toEqual([]);
  });
});

it('lets a minimal membership clerk cancel an org-admin offer without touching grants', async () => {
  h.grantPermissions('org', 'clerk', ['organization.manage_members']);
  const issued = await offer('owner', 'recipient@example.org', 'org-admin');
  expect(issued.status).toBe(201);
  const invitationId = (issued.body as { invitation: { id: string } }).invitation.id;
  const grants = h.sqlite.query('SELECT * FROM access_grant ORDER BY id').all();
  expect(await h.call('clerk', 'DELETE', '/api/organization/invitations/' + invitationId)).toEqual({
    status: 204,
    body: null,
  });
  expect(h.sqlite.query('SELECT * FROM access_grant ORDER BY id').all()).toEqual(grants);
  expect(
    h.sqlite.query('SELECT consumed_at,revoked_at FROM organization_invitation').get(),
  ).toMatchObject({ consumed_at: null, revoked_at: expect.any(Number) as unknown });
  h.grant('org', 'existing', 'org-admin');
  expect(
    await h.call('clerk', 'DELETE', '/api/organization/members/' + h.userId('existing')),
  ).toEqual({
    status: 403,
    body: { error: 'forbidden', permission: 'organization.manage_organization_roles' },
  });
});

it.each(['org-super-admin', 'package-viewer', 'custom-role'])(
  'rejects initial role %s at the HTTP boundary',
  async (initialRoleId) => {
    expect(await offer('owner', 'recipient@example.org', initialRoleId)).toEqual({
      status: 400,
      body: { error: 'invalid_body' },
    });
    expect(h.sqlite.query('SELECT * FROM organization_invitation').all()).toEqual([]);
  },
);

it('rejects the retired membership-role offer body', async () => {
  expect(
    await h.call('owner', 'POST', '/api/organization/invitations', {
      email: 'recipient@example.org',
      role: 'viewer',
    }),
  ).toEqual({ status: 400, body: { error: 'invalid_body' } });
  expect(h.sqlite.query('SELECT * FROM organization_invitation').all()).toEqual([]);
});

async function submitJoinRequest(): Promise<string> {
  h.sqlite.run(
    "INSERT INTO organization_domain_claim(id,organization_id,domain,status,proof_digest,last_success_at,created_at) VALUES('initial-claim','org','example.org','verified','proof',1,1)",
  );
  const submitted = await h.call('recipient', 'POST', '/api/onboarding/join-requests', {
    organizationId: 'org',
  });
  expect(submitted.status).toBe(201);
  return (submitted.body as { request: { id: string } }).request.id;
}

it.each(['org-admin', 'org-viewer', 'project-contributor', 'project-viewer'] as const)(
  'approves join initial access %s without granting until acceptance',
  async (initialRoleId) => {
    const id = await submitJoinRequest();
    expect(
      (
        await h.call('owner', 'POST', '/api/organization/join-requests/' + id + '/approve', {
          initialRoleId,
        })
      ).status,
    ).toBe(200);
    expect(
      h.sqlite.query('SELECT id FROM access_grant WHERE subject_id=?').all(h.userId('recipient')),
    ).toEqual([]);
    expect(
      h.sqlite
        .query('SELECT user_id FROM organization_membership WHERE user_id=?')
        .all(h.userId('recipient')),
    ).toEqual([]);
    expect((await accept()).status).toBe(200);
    expect(
      h.sqlite
        .query('SELECT role_id,origin,created_by FROM access_grant WHERE subject_id=?')
        .all(h.userId('recipient')),
    ).toEqual([{ role_id: initialRoleId, origin: 'invitation', created_by: h.userId('owner') }]);
  },
);

it('approves a join request with no initial access under a minimal membership grant', async () => {
  const id = await submitJoinRequest();
  h.grantPermissions('org', 'clerk', ['organization.manage_members']);
  expect(
    (await h.call('clerk', 'POST', '/api/organization/join-requests/' + id + '/approve', {}))
      .status,
  ).toBe(200);
  expect((await accept()).status).toBe(200);
  expect(
    h.sqlite.query('SELECT id FROM access_grant WHERE subject_id=?').all(h.userId('recipient')),
  ).toEqual([]);
});

it.each([
  ['org-viewer', 'organization.manage_organization_roles'],
  ['project-viewer', 'organization.manage_access'],
] as const)(
  'checks the actual join approval grant permission for %s',
  async (initialRoleId, permission) => {
    const id = await submitJoinRequest();
    h.grantPermissions('org', 'clerk', ['organization.manage_members']);
    expect(
      await h.call('clerk', 'POST', '/api/organization/join-requests/' + id + '/approve', {
        initialRoleId,
      }),
    ).toEqual({ status: 403, body: { error: 'forbidden', permission } });
    expect(h.sqlite.query('SELECT status FROM organization_join_request').get()).toEqual({
      status: 'pending',
    });
    expect(h.sqlite.query('SELECT * FROM organization_invitation').all()).toEqual([]);
  },
);

it('requires current manage_members for join listing and denial despite a legacy admin role', async () => {
  const id = await submitJoinRequest();
  expect(await h.call('clerk', 'GET', '/api/organization/join-requests')).toEqual({
    status: 403,
    body: { error: 'forbidden', permission: 'organization.manage_members' },
  });
  expect(await h.call('clerk', 'POST', '/api/organization/join-requests/' + id + '/deny')).toEqual({
    status: 403,
    body: { error: 'forbidden', permission: 'organization.manage_members' },
  });
  expect(h.sqlite.query('SELECT status FROM organization_join_request').get()).toEqual({
    status: 'pending',
  });
});

for (const [name, encoded] of [
  ['missing', null],
  ['invalid-json', '{'],
  ['array', '[]'],
  ['empty', '{}'],
  ['unknown-kind', '{"kind":"unknown"}'],
  ['unknown-role', '{"kind":"role","roleId":"org-super-admin"}'],
  ['none-extra', '{"kind":"none","roleId":"org-admin"}'],
  ['role-extra', '{"kind":"role","roleId":"project-viewer","extra":1}'],
  ['role-missing', '{"kind":"role"}'],
  ['role-number', '{"kind":"role","roleId":1}'],
] as const) {
  it('throws on stored initial selection ' + name + ' without consuming or granting', async () => {
    expect((await offer('owner', 'recipient@example.org', 'project-viewer')).status).toBe(201);
    h.sqlite.run('UPDATE organization_invitation SET initial_access=?', [encoded]);
    const before = {
      offers: h.sqlite.query('SELECT * FROM organization_invitation').all(),
      members: h.sqlite.query('SELECT * FROM organization_membership ORDER BY user_id').all(),
      grants: h.sqlite.query('SELECT * FROM access_grant ORDER BY id').all(),
    };
    expect((await h.call('owner', 'GET', '/api/organization/invitations')).status).toBe(500);
    expect((await accept()).status).toBe(500);
    expect({
      offers: h.sqlite.query('SELECT * FROM organization_invitation').all(),
      members: h.sqlite.query('SELECT * FROM organization_membership ORDER BY user_id').all(),
      grants: h.sqlite.query('SELECT * FROM access_grant ORDER BY id').all(),
    }).toEqual(before);
    expect(h.sqlite.query('SELECT * FROM organization_audit').all()).toEqual([]);
  });
}

for (const fault of [
  'missing',
  'empty',
  'unknown-permission',
  'wrong-kind',
  'invalid-flag',
] as const) {
  it(
    'throws on offered initial role metadata ' + fault + ' before persisting an offer',
    async () => {
      h.sqlite.run('PRAGMA ignore_check_constraints=ON');
      if (fault === 'missing') {
        h.sqlite.run("DELETE FROM access_role_permission WHERE role_id='project-viewer'");
        h.sqlite.run("DELETE FROM access_role WHERE id='project-viewer'");
      }
      if (fault === 'empty')
        h.sqlite.run("DELETE FROM access_role_permission WHERE role_id='project-viewer'");
      if (fault === 'unknown-permission')
        h.sqlite.run(
          "INSERT INTO access_role_permission(role_id,permission) VALUES('project-viewer','unrecognized.permission')",
        );
      if (fault === 'wrong-kind')
        h.sqlite.run("UPDATE access_role SET object_kind='organization' WHERE id='project-viewer'");
      if (fault === 'invalid-flag')
        h.sqlite.run("UPDATE access_role SET reaches_restricted=2 WHERE id='project-viewer'");
      const expected =
        fault === 'missing'
          ? 'initial access role is missing'
          : fault === 'empty'
            ? 'initial access role has no permissions'
            : fault === 'unknown-permission'
              ? 'which is not in the permission vocabulary'
              : fault === 'wrong-kind'
                ? 'initial access role has an unexpected kind'
                : 'initial access role has an invalid restricted flag';
      const connection = openConnection(h.databasePath());
      try {
        expect(
          (
            await readRejection(
              new InvitationRepository(connection.db, OPEN).issue(
                'org',
                { id: h.userId('owner') },
                'recipient@example.org',
                selectInitialAccess('project-viewer'),
                'metadata-fault',
                1000,
                { at: 1, by: h.userId('owner') },
              ),
            )
          ).message,
        ).toContain(expected);
      } finally {
        connection.close();
      }
      expect((await offer('owner', 'recipient@example.org', 'project-viewer')).status).toBe(500);
      expect(h.sqlite.query('SELECT * FROM organization_invitation').all()).toEqual([]);
    },
  );
}

it('rolls consumption membership and initial access back when its grant audit fails', async () => {
  expect((await offer('owner', 'recipient@example.org', 'project-viewer')).status).toBe(201);
  const snapshot = () =>
    [
      'organization_invitation',
      'organization_membership',
      'access_grant',
      'organization_audit',
    ].map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());
  const before = snapshot();
  h.sqlite.run(
    "CREATE TRIGGER fail_invitation_grant_audit BEFORE INSERT ON organization_audit WHEN NEW.action='access_granted' BEGIN SELECT RAISE(ABORT,'invitation grant audit unavailable');END",
  );
  expect((await accept()).status).toBe(500);
  expect(snapshot()).toEqual(before);
});

for (const expiresAt of [200, 500]) {
  it(
    'owns acceptance completion clock after awaited issuer checks with expiry ' + String(expiresAt),
    async () => {
      const connection = openConnection(h.databasePath());
      const repository = new InvitationRepository(connection.db, OPEN);
      const digest = 'completion-clock';
      expect(
        (
          await repository.issue(
            'org',
            { id: h.userId('owner') },
            'recipient@example.org',
            selectInitialAccess('project-viewer'),
            digest,
            expiresAt,
            { at: 1, by: h.userId('owner') },
          )
        ).ok,
      ).toBe(true);
      let now = 100;
      const observer = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt');
      const decide = observer.getMockImplementation();
      if (decide === undefined) throw new Error('effective role reader missing');
      observer.mockImplementation(async function (
        this: AccessDecisionRepository,
        principal,
        target,
      ) {
        const effective = await decide.call(this, principal, target);
        now = 300;
        return effective;
      });
      try {
        const answer = await new InvitationRepository(connection.db, OPEN).accept(
          { id: h.userId('recipient') },
          digest,
          () => now,
        );
        expect(answer).toEqual(
          expiresAt === 200
            ? { ok: false, refusal: 'invitation_invalid' }
            : { ok: true, value: { organizationId: 'org' } },
        );
        expect(
          h.sqlite
            .query('SELECT created_at,consumed_at,updated_at FROM organization_invitation')
            .get(),
        ).toEqual(
          expiresAt === 200
            ? { created_at: 1, consumed_at: null, updated_at: 1 }
            : { created_at: 1, consumed_at: 300, updated_at: 300 },
        );
        expect(
          h.sqlite
            .query('SELECT created_at,created_by FROM access_grant WHERE subject_id=?')
            .all(h.userId('recipient')),
        ).toEqual(expiresAt === 200 ? [] : [{ created_at: 300, created_by: h.userId('owner') }]);
        expect(h.sqlite.query('SELECT created_at FROM organization_audit').all()).toEqual(
          expiresAt === 200 ? [] : [{ created_at: 300 }],
        );
      } finally {
        observer.mockRestore();
        connection.close();
      }
    },
  );
}

it('does not use descendant grants outside the organization comparison scope', async () => {
  h.grantPermissions('org', 'clerk', [
    'organization.navigate',
    'project.read',
    'organization.manage_members',
    'organization.manage_access',
  ]);
  const created = await h.call('owner', 'POST', '/api/projects', { name: 'Descendant comparison' });
  expect(created.status).toBe(200);
  const packageId = (created.body as { project: { id: string } }).project.id;
  h.grant('org', 'clerk', 'package-viewer', 'work_package', packageId);
  expect(await offer('clerk', 'recipient@example.org', 'project-viewer')).toEqual({
    status: 403,
    body: { error: 'forbidden', permission: 'package.read' },
  });
  expect(h.sqlite.query('SELECT * FROM organization_invitation').all()).toEqual([]);
});

const administrationOperations = [
  'invitation-list',
  'invitation-issue',
  'invitation-revoke',
  'join-list',
  'join-approve',
  'join-deny',
] as const;
type AdministrationOperation = (typeof administrationOperations)[number];
async function prepareAdministration(operation: AdministrationOperation) {
  let invitationId = 'unused';
  let requestId = 'unused';
  if (operation === 'invitation-revoke') {
    const issued = await offer('owner');
    expect(issued.status).toBe(201);
    invitationId = (issued.body as { invitation: { id: string } }).invitation.id;
  }
  if (operation.startsWith('join-')) requestId = await submitJoinRequest();
  return { invitationId, requestId };
}
function callAdministration(
  operation: AdministrationOperation,
  invitation: InvitationRepository,
  requests: JoinRequestRepository,
  principal: Parameters<InvitationRepository['list']>[1],
  invitationId: string,
  requestId: string,
  selection = selectInitialAccess('project-viewer'),
  stamp = { at: 10, by: principal.id },
) {
  switch (operation) {
    case 'invitation-list':
      return invitation.list('org', principal);
    case 'invitation-issue':
      return invitation.issue(
        'org',
        principal,
        'recipient@example.org',
        selection,
        'queued-digest',
        10000,
        stamp,
      );
    case 'invitation-revoke':
      return invitation.revoke('org', principal, invitationId, stamp);
    case 'join-list':
      return requests.list('org', principal);
    case 'join-approve':
      return requests.approve('org', principal, requestId, selection, 'queued-join', 10000, stamp);
    case 'join-deny':
      return requests.deny('org', principal, requestId, stamp);
  }
}
const offerSnapshot = () =>
  [
    'organization_invitation',
    'organization_join_request',
    'organization_membership',
    'access_grant',
    'organization_audit',
  ].map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());
for (const operation of administrationOperations) {
  it('rechecks queued current offer authority at ' + operation, async () => {
    const { invitationId, requestId } = await prepareAdministration(operation);
    const connection = openConnection(h.databasePath());
    const gate = new WriteCoordinator();
    const release = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const blocker = gate.enter(async () => {
      entered.resolve(undefined);
      await release.promise;
    });
    await entered.promise;
    const pending = callAdministration(
      operation,
      new InvitationRepository(connection.db, gate),
      new JoinRequestRepository(connection.db, gate),
      { id: h.userId('owner') },
      invitationId,
      requestId,
    );
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Bun.sleep(0);
    expect(settled).toBe(false);
    h.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [h.userId('owner')]);
    const before = offerSnapshot();
    release.resolve(undefined);
    await blocker;
    try {
      expect(await pending).toEqual({
        ok: false,
        refusal: 'forbidden',
        permission: 'organization.manage_members',
      });
      expect(offerSnapshot()).toEqual(before);
    } finally {
      connection.close();
    }
  });
  it('retains queued credential authentication at ' + operation, async () => {
    const { invitationId, requestId } = await prepareAdministration(operation);
    const id = h.userId('owner');
    addAgentPerson(h.sqlite, 'offer-agent', 'org', id);
    const credential = await issueApiKey(h.sqlite, {
      organizationId: 'org',
      personId: 'offer-agent',
      issuedBy: id,
    });
    grantCredential(h.sqlite, 'org', credential.id, 'org-super-admin', 'organization', 'org');
    const connection = openConnection(h.databasePath());
    const gate = new WriteCoordinator();
    const release = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const blocker = gate.enter(async () => {
      entered.resolve(undefined);
      await release.promise;
    });
    await entered.promise;
    const authentication = {
      kind: 'machine' as const,
      credentialId: credential.id,
      personId: 'offer-agent',
    };
    const principal = { id, authentication };
    const before = offerSnapshot();
    const pending = callAdministration(
      operation,
      new InvitationRepository(connection.db, gate),
      new JoinRequestRepository(connection.db, gate),
      principal,
      invitationId,
      requestId,
    );
    Object.assign(authentication, { kind: 'first_party', issuedAt: 1 });
    release.resolve(undefined);
    await blocker;
    const permission =
      operation === 'invitation-issue' || operation === 'join-approve'
        ? 'organization.manage_access'
        : 'organization.manage_members';
    try {
      expect(await pending).toEqual({ ok: false, refusal: 'forbidden', permission });
      expect(offerSnapshot()).toEqual(before);
    } finally {
      connection.close();
    }
  });
  it('retains the HTTP offer actor before resolver mutation at ' + operation, async () => {
    const { invitationId, requestId } = await prepareAdministration(operation);
    const observer = spyOn(SqliteOrganizationAccess.prototype, 'resolve');
    const resolve = observer.getMockImplementation();
    if (resolve === undefined) throw new Error('missing actual resolver');
    observer.mockImplementation(async function (this: SqliteOrganizationAccess, principal) {
      const admitted = await resolve.call(this, principal);
      Object.assign(principal, {
        id: h.userId('clerk'),
        authentication: { kind: 'machine', credentialId: 'substitute', personId: 'substitute' },
        delegation: {
          organizationId: 'org',
          audience: 'substitute',
          clientId: 'substitute',
          grantId: 'substitute',
        },
      });
      return admitted;
    });
    try {
      const answer =
        operation === 'invitation-list'
          ? await h.call('owner', 'GET', '/api/organization/invitations')
          : operation === 'invitation-issue'
            ? await offer('owner', 'recipient@example.org', 'project-viewer')
            : operation === 'invitation-revoke'
              ? await h.call('owner', 'DELETE', '/api/organization/invitations/' + invitationId)
              : operation === 'join-list'
                ? await h.call('owner', 'GET', '/api/organization/join-requests')
                : operation === 'join-approve'
                  ? await h.call(
                      'owner',
                      'POST',
                      '/api/organization/join-requests/' + requestId + '/approve',
                      { initialRoleId: 'project-viewer' },
                    )
                  : await h.call(
                      'owner',
                      'POST',
                      '/api/organization/join-requests/' + requestId + '/deny',
                    );
      expect(answer.status).toBe(
        operation === 'invitation-issue'
          ? 201
          : operation === 'invitation-revoke' || operation === 'join-deny'
            ? 204
            : 200,
      );
      if (operation === 'invitation-issue' || operation === 'join-approve')
        expect(h.sqlite.query('SELECT created_by FROM organization_invitation').all()).toEqual([
          { created_by: h.userId('owner') },
        ]);
      if (operation === 'invitation-revoke')
        expect(h.sqlite.query('SELECT created_by FROM organization_invitation').get()).toEqual({
          created_by: h.userId('owner'),
        });
      if (operation === 'join-deny')
        expect(h.sqlite.query('SELECT resolved_by FROM organization_join_request').get()).toEqual({
          resolved_by: h.userId('owner'),
        });
    } finally {
      observer.mockRestore();
    }
  });
}

for (const operation of ['invitation-issue', 'join-approve'] as const) {
  it('retains the queued initial selection at ' + operation, async () => {
    const { invitationId, requestId } = await prepareAdministration(operation);
    h.grantPermissions('org', 'clerk', ['organization.manage_members']);
    const connection = openConnection(h.databasePath());
    const gate = new WriteCoordinator();
    const release = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const blocker = gate.enter(async () => {
      entered.resolve(undefined);
      await release.promise;
    });
    await entered.promise;
    const selection = selectInitialAccess(null);
    const pending = callAdministration(
      operation,
      new InvitationRepository(connection.db, gate),
      new JoinRequestRepository(connection.db, gate),
      { id: h.userId('clerk') },
      invitationId,
      requestId,
      selection,
    );
    Object.assign(selection, { kind: 'role', roleId: 'org-admin' });
    release.resolve(undefined);
    await blocker;
    try {
      expect((await pending).ok).toBe(true);
      expect(h.sqlite.query('SELECT initial_access FROM organization_invitation').all()).toEqual([
        { initial_access: '{"kind":"none"}' },
      ]);
    } finally {
      connection.close();
    }
  });
}
for (const operation of [
  'invitation-issue',
  'invitation-revoke',
  'join-approve',
  'join-deny',
] as const) {
  it('retains the queued request stamp at ' + operation, async () => {
    const { invitationId, requestId } = await prepareAdministration(operation);
    const connection = openConnection(h.databasePath());
    const gate = new WriteCoordinator();
    const release = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const blocker = gate.enter(async () => {
      entered.resolve(undefined);
      await release.promise;
    });
    await entered.promise;
    const stamp = { at: 10, by: h.userId('owner') };
    const pending = callAdministration(
      operation,
      new InvitationRepository(connection.db, gate),
      new JoinRequestRepository(connection.db, gate),
      { id: h.userId('owner') },
      invitationId,
      requestId,
      selectInitialAccess('project-viewer'),
      stamp,
    );
    Object.assign(stamp, { at: 999, by: h.userId('clerk') });
    release.resolve(undefined);
    await blocker;
    try {
      expect((await pending).ok).toBe(true);
      if (operation === 'invitation-revoke')
        expect(
          h.sqlite.query('SELECT revoked_at,updated_at FROM organization_invitation').get(),
        ).toEqual({ revoked_at: 10, updated_at: 10 });
      else if (operation === 'join-deny')
        expect(
          h.sqlite.query('SELECT resolved_at,resolved_by FROM organization_join_request').get(),
        ).toEqual({ resolved_at: 10, resolved_by: h.userId('owner') });
      else
        expect(
          h.sqlite.query('SELECT created_at,created_by FROM organization_invitation').get(),
        ).toEqual({ created_at: 10, created_by: h.userId('owner') });
    } finally {
      connection.close();
    }
  });
}
for (const fault of ['id', 'issuer-revoked'] as const) {
  it('retains acceptance authority before the queued owner at ' + fault, async () => {
    const connection = openConnection(h.databasePath());
    expect(
      (
        await new InvitationRepository(connection.db, OPEN).issue(
          'org',
          { id: h.userId('owner') },
          'recipient@example.org',
          selectInitialAccess('project-viewer'),
          'accept-queue',
          10000,
          { at: 1, by: h.userId('owner') },
        )
      ).ok,
    ).toBe(true);
    const gate = new WriteCoordinator();
    const release = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const blocker = gate.enter(async () => {
      entered.resolve(undefined);
      await release.promise;
    });
    await entered.promise;
    const actor = { id: h.userId('recipient') };
    const pending = new InvitationRepository(connection.db, gate).accept(
      actor,
      'accept-queue',
      () => 10,
    );
    if (fault === 'id') actor.id = h.userId('existing');
    else h.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [h.userId('owner')]);
    const before = offerSnapshot();
    release.resolve(undefined);
    await blocker;
    try {
      expect(await pending).toEqual(
        fault === 'id'
          ? { ok: true, value: { organizationId: 'org' } }
          : { ok: false, refusal: 'forbidden', permission: 'organization.manage_members' },
      );
      if (fault === 'id')
        expect(h.sqlite.query('SELECT consumed_by FROM organization_invitation').get()).toEqual({
          consumed_by: h.userId('recipient'),
        });
      else expect(offerSnapshot()).toEqual(before);
    } finally {
      connection.close();
    }
  });
}
it('retains the HTTP acceptance principal across the real awaited token digest', async () => {
  expect((await offer('owner', 'recipient@example.org', 'project-viewer')).status).toBe(201);
  const token = h.deliveredEmailToken('recipient@example.org');
  let captured: AuthenticatedUser | undefined;
  const authenticate = spyOn(AuthService.prototype, 'authenticateOrRefuse');
  const admit = authenticate.getMockImplementation();
  if (admit === undefined) throw new Error('actual authentication implementation missing');
  authenticate.mockImplementation(async function (this: AuthService, presented) {
    const answer = await admit.call(this, presented);
    if (answer !== null && typeof answer === 'object') captured = answer;
    return answer;
  });
  const digest = spyOn(nodeDigest, 'sha256');
  const hash = digest.getMockImplementation();
  if (hash === undefined) throw new Error('actual digest missing');
  let mutated = false;
  digest.mockImplementation(async (bytes) => {
    const encoded = await hash(bytes);
    if (bytes === token) {
      if (captured === undefined) throw new Error('actual authenticated alias not captured');
      Object.assign(captured, {
        id: h.userId('existing'),
        authentication: { kind: 'machine', credentialId: 'replacement', personId: 'replacement' },
        delegation: { organizationId: 'org', audience: 'replacement' },
      });
      mutated = true;
    }
    return encoded;
  });
  try {
    expect(await accept()).toEqual({
      status: 200,
      body: { membership: { organizationId: 'org' } },
    });
    expect(mutated).toBe(true);
    expect(h.sqlite.query('SELECT consumed_by FROM organization_invitation').get()).toEqual({
      consumed_by: h.userId('recipient'),
    });
    expect(
      h.sqlite.query("SELECT subject_id FROM access_grant WHERE role_id='project-viewer'").all(),
    ).toEqual([{ subject_id: h.userId('recipient') }]);
  } finally {
    digest.mockRestore();
    authenticate.mockRestore();
  }
});
for (const missing of [null, ''] as const) {
  it(
    'rejects missing durable issuer provenance ' + String(missing) + ' before consuming',
    async () => {
      expect((await offer('owner', 'recipient@example.org', 'project-viewer')).status).toBe(201);
      h.sqlite.run('PRAGMA foreign_keys=OFF');
      h.sqlite.run('UPDATE organization_invitation SET created_by=?', [missing]);
      const before = offerSnapshot();
      expect((await accept()).status).toBe(500);
      expect(offerSnapshot()).toEqual(before);
    },
  );
}

for (const revoked of ['membership', 'grant'] as const) {
  it('rechecks a none-offer issuer current ' + revoked + ' before new membership', async () => {
    expect((await offer('owner', 'recipient@example.org', null)).status).toBe(201);
    h.sqlite.run(
      revoked === 'membership'
        ? 'DELETE FROM organization_membership WHERE user_id=?'
        : 'DELETE FROM access_grant WHERE subject_id=?',
      [h.userId('owner')],
    );
    const before = offerSnapshot();
    expect(await accept()).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'organization.manage_members' },
    });
    expect(offerSnapshot()).toEqual(before);
  });
}
it('consumes an existing-member none offer without resurrecting issuer authority', async () => {
  expect((await offer('owner', 'existing@example.org', null)).status).toBe(201);
  h.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [h.userId('owner')]);
  const before = h.sqlite.query('SELECT * FROM organization_membership ORDER BY rowid').all();
  expect(await accept('existing')).toEqual({
    status: 200,
    body: { membership: { organizationId: 'org' } },
  });
  expect(h.sqlite.query('SELECT * FROM organization_membership ORDER BY rowid').all()).toEqual(
    before,
  );
  expect(h.sqlite.query('SELECT * FROM organization_audit').all()).toEqual([]);
});
it('throws for an orphan issuer grant even when valid current authority suffices', async () => {
  h.grant('org', 'owner', 'org-viewer');
  h.sqlite.run('PRAGMA foreign_keys=OFF');
  h.sqlite.run("DELETE FROM access_role WHERE id='org-viewer'");
  h.sqlite.run('PRAGMA foreign_keys=ON');
  expect(h.sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  const before = offerSnapshot();
  expect((await offer('owner', 'recipient@example.org', 'project-viewer')).status).toBe(500);
  expect(offerSnapshot()).toEqual(before);
});

it('reports a missing stored initial selection through its actual reader', async () => {
  expect((await offer('owner')).status).toBe(201);
  h.sqlite.run('UPDATE organization_invitation SET initial_access=NULL');
  const connection = openConnection(h.databasePath());
  try {
    expect(
      (
        await readRejection(
          new InvitationRepository(connection.db, OPEN).list('org', { id: h.userId('owner') }),
        )
      ).message,
    ).toContain('initial access selection is missing');
  } finally {
    connection.close();
  }
});
it('rejects a permission outside the offered role catalogue kind', async () => {
  h.sqlite.run(
    "INSERT INTO access_role_permission(role_id,permission) VALUES('project-viewer','organization.manage_members')",
  );
  const before = offerSnapshot();
  const connection = openConnection(h.databasePath());
  try {
    expect(
      (
        await readRejection(
          new InvitationRepository(connection.db, OPEN).issue(
            'org',
            { id: h.userId('owner') },
            'recipient@example.org',
            selectInitialAccess('project-viewer'),
            'kind-fault',
            1000,
            { at: 1, by: h.userId('owner') },
          ),
        )
      ).message,
    ).toContain('which that kind may not hold');
  } finally {
    connection.close();
  }
  expect(offerSnapshot()).toEqual(before);
});
for (const operation of administrationOperations) {
  for (const authenticationKind of ['machine', 'consent', 'delegated'] as const) {
    it(
      'refuses ' + authenticationKind + ' before an unreadable grant dependency at ' + operation,
      async () => {
        const { invitationId, requestId } = await prepareAdministration(operation);
        const id = h.userId('owner');
        addAgentPerson(h.sqlite, 'early-agent', 'org', id);
        const credential = await issueApiKey(h.sqlite, {
          organizationId: 'org',
          personId: 'early-agent',
          issuedBy: id,
        });
        grantCredential(h.sqlite, 'org', credential.id, 'org-super-admin', 'organization', 'org');
        if (authenticationKind === 'consent')
          h.sqlite.run(
            "UPDATE machine_credential SET source='mcp_consent',mcp_family_id='early-cap-family' WHERE id=?",
            [credential.id],
          );
        const principal =
          authenticationKind === 'delegated'
            ? { id, delegation: { organizationId: 'org', audience: 'wbs-be-01/direct' as const } }
            : authenticationKind === 'machine'
              ? {
                  id,
                  authentication: {
                    kind: 'machine' as const,
                    credentialId: credential.id,
                    personId: 'early-agent',
                  },
                }
              : {
                  id,
                  authentication: {
                    kind: 'consent' as const,
                    credentialId: credential.id,
                    personId: 'early-agent',
                    issuer: 'https://issuer.test',
                    subject: 'subject',
                  },
                };
        const before = offerSnapshot();
        const connection = openConnection(h.databasePath());
        const dependency = spyOn(
          AccessDecisionRepository.prototype,
          'effectiveRoleAt',
        ).mockImplementation(() => {
          throw new Error('unexpected grant read before personal or cap admission');
        });
        try {
          const answer = await callAdministration(
            operation,
            new InvitationRepository(connection.db, OPEN),
            new JoinRequestRepository(connection.db, OPEN),
            principal,
            invitationId,
            requestId,
          );
          const permission =
            operation === 'invitation-issue' || operation === 'join-approve'
              ? 'organization.manage_access'
              : 'organization.manage_members';
          expect(answer).toEqual(
            authenticationKind === 'delegated'
              ? { ok: false, refusal: 'insufficient_scope' }
              : { ok: false, refusal: 'forbidden', permission },
          );
          expect(dependency).not.toHaveBeenCalled();
          expect(offerSnapshot()).toEqual(before);
        } finally {
          dependency.mockRestore();
          connection.close();
        }
      },
    );
  }
}

for (const kind of ['delegated', 'machine', 'consent'] as const) {
  it('enforces personal acceptance before acquiring its owner for ' + kind, async () => {
    expect((await offer('owner', 'recipient@example.org', 'project-viewer')).status).toBe(201);
    const id = h.userId('recipient');
    const principal =
      kind === 'delegated'
        ? { id, delegation: { organizationId: 'org', audience: 'wbs-be-01/direct' as const } }
        : kind === 'machine'
          ? {
              id,
              authentication: {
                kind: 'machine' as const,
                credentialId: 'unsupported-key',
                personId: 'agent',
              },
            }
          : {
              id,
              authentication: {
                kind: 'consent' as const,
                credentialId: 'unsupported-consent',
                personId: 'agent',
                issuer: 'https://issuer.test',
                subject: 'subject',
              },
            };
    let turns = 0;
    const gate = {
      enter: () => {
        turns++;
        return Promise.reject(new Error('unexpected personal acceptance owner'));
      },
    };
    const before = offerSnapshot();
    const connection = openConnection(h.databasePath());
    try {
      expect(
        await new InvitationRepository(connection.db, gate).accept(
          principal,
          'unread-before-personal',
          () => 1,
        ),
      ).toEqual({ ok: false, refusal: 'insufficient_scope' });
      expect(turns).toBe(0);
      expect(offerSnapshot()).toEqual(before);
    } finally {
      connection.close();
    }
  });
}
it('throws and rolls all acceptance effects back on an impossible borrowed initial grant refusal', async () => {
  expect((await offer('owner', 'recipient@example.org', 'project-viewer')).status).toBe(201);
  const digest = await nodeDigest.sha256(h.deliveredEmailToken('recipient@example.org'));
  h.sqlite.run(
    "CREATE TRIGGER lose_accepted_role AFTER INSERT ON organization_membership WHEN NEW.organization_id='org' BEGIN DELETE FROM access_role WHERE id='project-viewer';END",
  );
  const snapshot = () =>
    [
      'organization_invitation',
      'organization_membership',
      'access_role',
      'access_role_permission',
      'access_grant',
      'organization_audit',
    ].map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());
  const before = snapshot();
  const connection = openConnection(h.databasePath());
  try {
    expect(
      (
        await readRejection(
          new InvitationRepository(connection.db, OPEN).accept(
            { id: h.userId('recipient') },
            digest,
            Date.now,
          ),
        )
      ).message,
    ).toContain('accepted initial grant refused: unknown_role');
    expect(snapshot()).toEqual(before);
    expect((await accept()).status).toBe(500);
    expect(snapshot()).toEqual(before);
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
