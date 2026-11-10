import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AccessAct, GrantDraft, GrantScope, GrantSubject } from '@wbs/core';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { sql } from 'drizzle-orm';

import {
  AccessGrantRepository,
  directSuperAdminCount,
  operatorSubjectRefusal,
} from './access-grant';
import { AgentPoolRepository } from './agent-pool';
import { ConsentCredentialRepository } from './consent-credential';
import { type Connection, openConnection } from './db';
import { DirectoryRepository } from './directory';
import { OPEN, WriteCoordinator } from './gate';
import { MachineCredentialAdministrationRepository } from './machine-credential-administration';
import { runMigrations } from './migrate';
import { OrganizationRepository } from './organization';
import { ScimUserRepository } from './scim-user';
import { LastSuperAdmin } from './super-admin';
import { TrustedIssuerAdministrationRepository } from './trusted-issuer-administration';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const ORGANIZATION: GrantScope = { kind: 'organization' };
const createAdaAct = (): AccessAct => ({
  actor: { kind: 'user', userId: 'ada' },
  at: 10,
  auditId: crypto.randomUUID(),
});
const createBenAct = (): AccessAct => ({
  actor: { kind: 'user', userId: 'ben' },
  at: 10,
  auditId: crypto.randomUUID(),
});
const LIVE_KEY = '00000000-0000-4000-8000-000000000001';
const REVOKED_KEY = '00000000-0000-4000-8000-000000000002';
const FOREIGN_KEY = '00000000-0000-4000-8000-000000000003';
const CONSENT = '00000000-0000-4000-8000-000000000004';

let dir: string;
let path: string;
let connection: Connection;
let grants: AccessGrantRepository;
let sequence = 0;

/**
 * Organization A with Ada (super-admin), Ben (super-admin) and Cy (member);
 * organization B with Dee (super-admin) and Cy (member); Out, who is in
 * neither. Work package `wp-a` is A's, `wp-b` B's. Agent `bot` of A is bound
 * to Ada and holds a live key, a revoked key and an MCP consent; B's agent
 * holds `FOREIGN_KEY`. A group `ops-b` belongs to B. Nothing is granted yet:
 * the backfill ran on an empty store.
 */
function seed(): void {
  const run = (statement: string) => connection.db.run(sql.raw(statement));
  for (const id of ['ada', 'ben', 'cy', 'dee', 'out'])
    run(`INSERT INTO users (id, username, created_at) VALUES ('${id}', '${id}', 1)`);
  for (const id of ['org-a', 'org-b'])
    run(`INSERT INTO organization (id, name, created_at) VALUES ('${id}', '${id}', 1)`);
  for (const [organizationId, userId, role] of [
    ['org-a', 'ada', 'super_admin'],
    ['org-a', 'ben', 'super_admin'],
    ['org-a', 'cy', 'member'],
    ['org-b', 'dee', 'super_admin'],
    ['org-b', 'cy', 'member'],
  ])
    run(
      `INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('${organizationId}', '${userId}', '${role}', 1)`,
    );
  for (const [projectId, organizationId] of [
    ['wp-a', 'org-a'],
    ['wp-b', 'org-b'],
  ]) {
    run(
      `INSERT INTO project (id, name, owner_id, created_at) VALUES ('${projectId}', '${projectId}', 'ada', 1)`,
    );
    run(
      `INSERT INTO project_organization (resource_id, organization_id) VALUES ('${projectId}', '${organizationId}')`,
    );
  }
  for (const [personId, organizationId, accountId] of [
    ['bot', 'org-a', 'ada'],
    ['bot-b', 'org-b', 'dee'],
  ]) {
    run(
      `INSERT INTO person (id, name, kind, account_id) VALUES ('${personId}', '${personId}', 'agent', '${accountId}')`,
    );
    run(
      `INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('${personId}', '${organizationId}', '${personId}')`,
    );
  }
  for (const [id, organizationId, personId, issuedBy, source, revokedAt, family] of [
    [LIVE_KEY, 'org-a', 'bot', 'ada', 'api_key', 'NULL', 'NULL'],
    [REVOKED_KEY, 'org-a', 'bot', 'ada', 'api_key', '5', 'NULL'],
    [CONSENT, 'org-a', 'bot', 'ada', 'mcp_consent', 'NULL', "'family-1'"],
    [FOREIGN_KEY, 'org-b', 'bot-b', 'dee', 'api_key', 'NULL', 'NULL'],
  ])
    run(
      `INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, name, mcp_family_id, revoked_at, created_at, created_by) VALUES ('${id}', '${organizationId}', '${personId}', '${issuedBy}', '${source}', '${id}', ${family}, ${revokedAt}, 1, '${issuedBy}')`,
    );
  run(
    `INSERT INTO access_group (id, organization_id, name, created_at) VALUES ('ops-b', 'org-b', 'Ops', 1)`,
  );
}

function draft(scope: GrantScope, subject: GrantSubject, roleId: string): GrantDraft {
  sequence += 1;
  return { id: `grant-${String(sequence)}`, scope, subject, roleId, origin: 'route' };
}

/** Grants `roleId` at organization scope of A to `userId`, failing the test on any refusal. */
async function grantInA(userId: string, roleId: string): Promise<string> {
  const outcome = await grants.grant(
    'org-a',
    draft(ORGANIZATION, { kind: 'user', userId }, roleId),
    createAdaAct(),
  );
  if (typeof outcome === 'string')
    throw new Error(`granting ${roleId} to ${userId} answered ${outcome}`);
  return outcome.grant.id;
}

function grantCount(): number {
  const row = connection.db.get<{ n: number } | undefined>(
    sql`SELECT COUNT(*) AS n FROM access_grant`,
  );
  if (row === undefined) throw new Error('COUNT(*) answered no row');
  return row.n;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-access-grant-store-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  connection = openConnection(path);
  grants = new AccessGrantRepository(connection.db, OPEN);
  seed();
});

afterEach(() => {
  connection.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('granting', () => {
  it('grants a user, a group, the organization members and a credential, and lists them', async () => {
    const group = await grants.createGroup('org-a', { id: 'ops', name: 'Ops' }, createAdaAct());
    expect(group).toMatchObject({ kind: 'created' });
    const subjects: GrantSubject[] = [
      { kind: 'user', userId: 'cy' },
      { kind: 'group', groupId: 'ops' },
      { kind: 'organization_members' },
      { kind: 'machine_credential', credentialId: LIVE_KEY },
    ];
    for (const subject of subjects)
      expect(
        await grants.grant(
          'org-a',
          draft({ kind: 'work_package', workPackageId: 'wp-a' }, subject, 'package-viewer'),
          createAdaAct(),
        ),
      ).toMatchObject({ kind: 'granted', grant: { subject, createdBy: 'ada', origin: 'route' } });

    const listed = await grants.list('org-a', {
      scope: { kind: 'work_package', workPackageId: 'wp-a' },
    });
    expect(listed.map((each) => each.subject)).toEqual(subjects);
    expect(await grants.list('org-a', { subject: { kind: 'organization_members' } })).toMatchObject(
      [{ subject: { kind: 'organization_members' }, roleId: 'package-viewer' }],
    );
    expect(await grants.list('org-b', {})).toEqual([]);
    const stored = connection.db.all<{ subject_id: string }>(
      sql`SELECT subject_id FROM access_grant WHERE subject_kind = 'organization_members'`,
    );
    expect(stored).toEqual([{ subject_id: 'org-a' }]);
  });

  it('tells the operator CLI an unknown organization and a credential’s id apart from a member', () => {
    expect(operatorSubjectRefusal(connection.db, 'org-x', 'cy')).toBe('unknown_organization');
    expect(operatorSubjectRefusal(connection.db, 'org-a', LIVE_KEY)).toBe('machine_credential');
    expect(operatorSubjectRefusal(connection.db, 'org-a', FOREIGN_KEY)).toBe('machine_credential');
    expect(operatorSubjectRefusal(connection.db, 'org-a', 'cy')).toBeNull();
    // Membership is the write's check, not this read's.
    expect(operatorSubjectRefusal(connection.db, 'org-a', 'out')).toBeNull();
  });

  it('writes an operator’s grant with no creator', async () => {
    const outcome = await grants.grant(
      'org-a',
      {
        ...draft(ORGANIZATION, { kind: 'user', userId: 'cy' }, 'org-super-admin'),
        origin: 'operator',
      },
      { actor: { kind: 'operator', login: 'df' }, at: 20, auditId: crypto.randomUUID() },
    );
    expect(outcome).toMatchObject({
      kind: 'granted',
      grant: { createdBy: null, createdAt: 20, origin: 'operator' },
    });
  });

  it('refuses an origin its actor does not pair with, writing nothing', async () => {
    const cy: GrantSubject = { kind: 'user', userId: 'cy' };
    /** The message the grant was refused with, or `resolved`. */
    const refusalOf = (written: Promise<unknown>) =>
      written.then(
        () => 'resolved',
        (error: unknown) => (error instanceof Error ? error.message : 'a non-Error'),
      );
    expect(
      await refusalOf(
        grants.grant(
          'org-a',
          { ...draft(ORGANIZATION, cy, 'org-viewer'), origin: 'operator' },
          createAdaAct(),
        ),
      ),
    ).toBe('user actors may not write a grant of origin operator');
    expect(
      await refusalOf(
        grants.grant('org-a', draft(ORGANIZATION, cy, 'org-viewer'), {
          actor: { kind: 'operator', login: 'df' },
          at: 20,
          auditId: crypto.randomUUID(),
        }),
      ),
    ).toBe('operator actors may not write a grant of origin route');
    expect(grantCount()).toBe(0);
  });

  it('refuses an unknown role and another organization’s custom role', async () => {
    connection.db.run(
      sql`INSERT INTO access_role (id, name, object_kind, organization_id, created_at) VALUES ('custom-b', 'Auditor', 'organization', 'org-b', 1)`,
    );
    const cy: GrantSubject = { kind: 'user', userId: 'cy' };
    expect(await grants.grant('org-a', draft(ORGANIZATION, cy, 'org-owner'), createAdaAct())).toBe(
      'unknown_role',
    );
    expect(await grants.grant('org-a', draft(ORGANIZATION, cy, 'custom-b'), createAdaAct())).toBe(
      'unknown_role',
    );
    expect(
      await grants.grant('org-b', draft(ORGANIZATION, cy, 'custom-b'), createAdaAct()),
    ).toMatchObject({
      kind: 'granted',
    });
    expect(grantCount()).toBe(1);
  });

  it('refuses org-admin at a work package and project-manager there, and allows package-viewer at the organization', async () => {
    const cy: GrantSubject = { kind: 'user', userId: 'cy' };
    const wpA: GrantScope = { kind: 'work_package', workPackageId: 'wp-a' };
    expect(await grants.grant('org-a', draft(wpA, cy, 'org-admin'), createAdaAct())).toBe(
      'role_scope_mismatch',
    );
    expect(await grants.grant('org-a', draft(wpA, cy, 'project-manager'), createAdaAct())).toBe(
      'role_scope_mismatch',
    );
    expect(grantCount()).toBe(0);
    expect(
      await grants.grant('org-a', draft(ORGANIZATION, cy, 'package-viewer'), createAdaAct()),
    ).toMatchObject({ kind: 'granted' });
  });

  it('refuses another organization’s work package, an absent one and a project scope as not_found', async () => {
    const cy: GrantSubject = { kind: 'user', userId: 'cy' };
    expect(
      await grants.grant(
        'org-a',
        draft({ kind: 'work_package', workPackageId: 'wp-b' }, cy, 'package-viewer'),
        createAdaAct(),
      ),
    ).toBe('not_found');
    expect(
      await grants.grant(
        'org-a',
        draft({ kind: 'work_package', workPackageId: 'wp-none' }, cy, 'package-viewer'),
        createAdaAct(),
      ),
    ).toBe('not_found');
    expect(
      await grants.grant(
        'org-a',
        draft({ kind: 'project', projectId: 'wp-a' }, cy, 'project-viewer'),
        createAdaAct(),
      ),
    ).toBe('not_found');
    expect(
      await grants.grant('org-none', draft(ORGANIZATION, cy, 'org-viewer'), createAdaAct()),
    ).toBe('not_found');
    expect(grantCount()).toBe(0);
  });

  it('refuses a user who is no member, a member of another organization included', async () => {
    expect(
      await grants.grant(
        'org-a',
        draft(ORGANIZATION, { kind: 'user', userId: 'out' }, 'org-viewer'),
        createAdaAct(),
      ),
    ).toBe('not_a_member');
    expect(
      await grants.grant(
        'org-a',
        draft(ORGANIZATION, { kind: 'user', userId: 'dee' }, 'org-viewer'),
        createAdaAct(),
      ),
    ).toBe('not_a_member');
    expect(grantCount()).toBe(0);
  });

  it('refuses an absent group and another organization’s group', async () => {
    for (const groupId of ['ops-none', 'ops-b'])
      expect(
        await grants.grant(
          'org-a',
          draft(ORGANIZATION, { kind: 'group', groupId }, 'org-viewer'),
          createAdaAct(),
        ),
      ).toBe('unknown_group');
    expect(grantCount()).toBe(0);
  });

  it('refuses a revoked, absent or foreign credential', async () => {
    for (const credentialId of [REVOKED_KEY, '00000000-0000-4000-8000-00000000ffff', FOREIGN_KEY])
      expect(
        await grants.grant(
          'org-a',
          draft(ORGANIZATION, { kind: 'machine_credential', credentialId }, 'project-contributor'),
          createAdaAct(),
        ),
      ).toBe('unknown_credential');
    expect(grantCount()).toBe(0);
  });

  it('refuses a duplicate as already_granted and writes nothing', async () => {
    await grantInA('cy', 'org-viewer');
    expect(
      await grants.grant(
        'org-a',
        draft(ORGANIZATION, { kind: 'user', userId: 'cy' }, 'org-viewer'),
        createBenAct(),
      ),
    ).toBe('already_granted');
    expect(grantCount()).toBe(1);
  });
});

/** Explicit surviving direct holder for positive authority-removal fixtures only. */
function seedDirectHolder(): void {
  connection.db.run(
    sql`INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('cp14-fixture-holder','org-a','organization','org-a','user','ben','org-super-admin','backfill',0)`,
  );
}

describe('revoking', () => {
  it('revokes a grant of its own organization only', async () => {
    seedDirectHolder();
    const id = await grantInA('cy', 'org-viewer');
    expect(await grants.revoke('org-b', id, createAdaAct())).toBe('not_found');
    expect(await grants.revoke('org-a', id, createAdaAct())).toMatchObject({
      kind: 'revoked',
      grant: { id },
    });
    expect(await grants.revoke('org-a', id, createAdaAct())).toBe('not_found');
  });

  it('refuses revoking the last direct super-admin grant, even while a group of members holds the role', async () => {
    const ada = await grantInA('ada', 'org-super-admin');
    await grants.createGroup('org-a', { id: 'admins', name: 'Admins' }, createAdaAct());
    expect(await grants.addGroupMember('org-a', 'admins', 'cy', createAdaAct())).toBe('added');
    expect(
      await grants.grant(
        'org-a',
        draft(ORGANIZATION, { kind: 'group', groupId: 'admins' }, 'org-super-admin'),
        createAdaAct(),
      ),
    ).toMatchObject({ kind: 'granted' });

    expect(await grants.revoke('org-a', ada, createAdaAct())).toBe('last_super_admin');
    expect(directSuperAdminCount(connection.db, 'org-a', { besides: null })).toBe(1);

    // The hand-over (P21): grant first, then revoke.
    const ben = await grantInA('ben', 'org-super-admin');
    expect(await grants.revoke('org-a', ada, createAdaAct())).toMatchObject({ kind: 'revoked' });
    expect(await grants.revoke('org-a', ben, createAdaAct())).toBe('last_super_admin');
    expect(directSuperAdminCount(connection.db, 'org-a', { besides: null })).toBe(1);
  });

  it('lets exactly one of two super-admins revoke their own grant across two connections', async () => {
    // What this proves: the CP14 count is read inside the revoking
    // transaction, so the second revocation counts after the first commits.
    // Computing the count before `write` makes it fail (both revoke; seen by
    // the #891 review). It does not prove cross-process `BEGIN IMMEDIATE`
    // serialization, which is SQLite's documented contract: bun:sqlite runs
    // each transaction to completion, so the two serialize either way.
    const ada = await grantInA('ada', 'org-super-admin');
    const ben = await grantInA('ben', 'org-super-admin');
    const other = openConnection(path);
    try {
      const outcomes = await Promise.all([
        grants.revoke('org-a', ada, createAdaAct()),
        new AccessGrantRepository(other.db, OPEN).revoke('org-a', ben, createAdaAct()),
      ]);
      expect(outcomes.map((each) => (typeof each === 'string' ? each : each.kind)).sort()).toEqual([
        'last_super_admin',
        'revoked',
      ]);
      expect(directSuperAdminCount(connection.db, 'org-a', { besides: null })).toBe(1);
    } finally {
      other.close();
    }
  });
});

describe('access groups', () => {
  it('creates, renames and lists groups, refusing a taken name', async () => {
    expect(
      await grants.createGroup('org-a', { id: 'ops', name: 'Ops' }, createAdaAct()),
    ).toMatchObject({
      kind: 'created',
      group: { id: 'ops', name: 'Ops', memberIds: [] },
    });
    expect(await grants.createGroup('org-a', { id: 'ops-2', name: 'Ops' }, createAdaAct())).toBe(
      'name_taken',
    );
    await grants.createGroup('org-a', { id: 'dev', name: 'Dev' }, createAdaAct());
    expect(await grants.renameGroup('org-a', 'dev', 'Ops', createAdaAct())).toBe('name_taken');
    expect(await grants.renameGroup('org-a', 'ops', 'Ops', createAdaAct())).toBe('renamed');
    expect(await grants.renameGroup('org-a', 'ops', 'Operations', createAdaAct())).toBe('renamed');
    expect(await grants.renameGroup('org-a', 'ops-b', 'Mine', createAdaAct())).toBe(
      'unknown_group',
    );
    // B's group named Ops does not take the name in A.
    expect((await grants.listGroups('org-a')).map((group) => group.name)).toEqual([
      'Dev',
      'Operations',
    ]);
  });

  it('adds only current members, once, and removes them', async () => {
    seedDirectHolder();
    await grants.createGroup('org-a', { id: 'ops', name: 'Ops' }, createAdaAct());
    expect(await grants.addGroupMember('org-a', 'ops', 'out', createAdaAct())).toBe('not_a_member');
    expect(await grants.addGroupMember('org-a', 'ops', 'dee', createAdaAct())).toBe('not_a_member');
    expect(await grants.addGroupMember('org-a', 'ops-b', 'cy', createAdaAct())).toBe(
      'unknown_group',
    );
    expect(await grants.addGroupMember('org-a', 'ops', 'cy', createAdaAct())).toBe('added');
    expect(await grants.addGroupMember('org-a', 'ops', 'cy', createAdaAct())).toBe(
      'already_in_group',
    );
    expect(await grants.listGroups('org-a')).toMatchObject([{ id: 'ops', memberIds: ['cy'] }]);
    expect(await grants.removeGroupMember('org-a', 'ops', 'ben', createAdaAct())).toBe(
      'not_in_group',
    );
    expect(await grants.removeGroupMember('org-a', 'ops-b', 'cy', createAdaAct())).toBe(
      'unknown_group',
    );
    expect(await grants.removeGroupMember('org-a', 'ops', 'cy', createAdaAct())).toBe('removed');
    expect(await grants.listGroups('org-a')).toMatchObject([{ id: 'ops', memberIds: [] }]);
  });

  it('deletes a group with its grants and members, and nothing of another group', async () => {
    seedDirectHolder();
    await grants.createGroup('org-a', { id: 'ops', name: 'Ops' }, createAdaAct());
    await grants.createGroup('org-a', { id: 'dev', name: 'Dev' }, createAdaAct());
    for (const groupId of ['ops', 'dev']) {
      await grants.addGroupMember('org-a', groupId, 'cy', createAdaAct());
      await grants.grant(
        'org-a',
        draft(ORGANIZATION, { kind: 'group', groupId }, 'org-viewer'),
        createAdaAct(),
      );
    }
    expect(await grants.deleteGroup('org-a', 'ops-b', createAdaAct())).toBe('unknown_group');
    expect(await grants.deleteGroup('org-a', 'ops', createAdaAct())).toEqual({
      kind: 'deleted',
      grantsDeleted: 1,
      membersRemoved: 1,
    });
    expect(await grants.listGroups('org-a')).toMatchObject([{ id: 'dev', memberIds: ['cy'] }]);
    expect((await grants.list('org-a', {})).map((grant) => grant.subject)).toEqual([
      { kind: 'user', userId: 'ben' },
      { kind: 'group', groupId: 'dev' },
    ]);
  });
});

describe('a revoked credential’s grants', () => {
  const act = { stamp: { at: 30, by: 'ada' }, actor: 'ada', auditId: 'audit-1' };

  function activate(): void {
    connection.db.run(
      sql`UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1`,
    );
  }

  async function grantTo(credentialId: string): Promise<void> {
    const outcome = await grants.grant(
      'org-a',
      draft(
        { kind: 'work_package', workPackageId: 'wp-a' },
        { kind: 'machine_credential', credentialId },
        'package-contributor',
      ),
      createAdaAct(),
    );
    if (typeof outcome === 'string')
      throw new Error(`granting ${credentialId} answered ${outcome}`);
  }

  for (const operation of ['machine-revoke', 'consent-end']) {
    it(
      'rolls the credential and grant cascade back when its access audit fails at ' + operation,
      async () => {
        seedDirectHolder();
        activate();
        const credentialId = operation === 'machine-revoke' ? LIVE_KEY : CONSENT;
        await grantTo(credentialId);
        const snapshot = () =>
          [
            'machine_credential',
            'machine_credential_secret',
            'access_grant',
            'organization_audit',
            'person',
            'claim',
          ].map((table) =>
            connection.db.all(sql.raw('SELECT * FROM ' + table + ' ORDER BY rowid')),
          );
        const before = snapshot();
        connection.db.run(
          sql.raw(
            "CREATE TRIGGER fail_access_audit BEFORE INSERT ON organization_audit WHEN NEW.action='access_revoked' BEGIN SELECT RAISE(ABORT,'cascade audit unavailable'); END",
          ),
        );
        const pending =
          operation === 'machine-revoke'
            ? new MachineCredentialAdministrationRepository(connection.db, OPEN).revoke(
                'org-a',
                { id: 'ada' },
                credentialId,
                act,
              )
            : new ConsentCredentialRepository(connection.db, OPEN).end(credentialId, 'family-1', {
                ...act,
                actor: 'mcp-01',
                stamp: { ...act.stamp, by: 'mcp-01' },
              });
        expect((await rejectionOf(pending)).message).toContain(
          'Failed query: insert into "organization_audit"',
        );
        expect(snapshot()).toEqual(before);
      },
    );
  }

  it('are deleted with an administrator’s revocation, and no other credential’s', async () => {
    seedDirectHolder();
    activate();
    await grantTo(LIVE_KEY);
    await grantTo(CONSENT);
    const credentials = new MachineCredentialAdministrationRepository(connection.db, OPEN);
    expect(await credentials.revoke('org-a', { id: 'ada' }, LIVE_KEY, act)).toBe('revoked');
    expect(
      connection.db.all(
        sql`SELECT actor_id,subject_id,json_extract(detail,'$.subjectId') AS credential_id,json_extract(detail,'$.origin') AS origin FROM organization_audit WHERE action='access_revoked'`,
      ),
    ).toMatchObject([{ actor_id: 'ada', credential_id: LIVE_KEY, origin: 'cascade' }]);
    expect((await grants.list('org-a', {})).map((grant) => grant.subject)).toEqual([
      { kind: 'user', userId: 'ben' },
      { kind: 'machine_credential', credentialId: CONSENT },
    ]);
  });

  it('are deleted when an MCP consent ends', async () => {
    seedDirectHolder();
    await grantTo(CONSENT);
    const consents = new ConsentCredentialRepository(connection.db, OPEN);
    expect(
      await consents.end(CONSENT, 'family-1', {
        ...act,
        actor: 'mcp-01',
        stamp: { at: act.stamp.at, by: 'mcp-01' },
      }),
    ).toBe('revoked');
    expect(
      connection.db.all(
        sql`SELECT actor_id,json_extract(detail,'$.subjectId') AS credential_id,json_extract(detail,'$.origin') AS origin FROM organization_audit WHERE action='access_revoked'`,
      ),
    ).toMatchObject([{ actor_id: 'mcp-01', credential_id: CONSENT, origin: 'cascade' }]);
    expect(
      (await grants.list('org-a', {})).map((grant) => ({
        roleId: grant.roleId,
        subject: grant.subject,
      })),
    ).toEqual([{ roleId: 'org-super-admin', subject: { kind: 'user', userId: 'ben' } }]);
  });

  for (const operation of ['machine-revoke', 'consent-end']) {
    it('retains actual queued cascade audit provenance at ' + operation, async () => {
      seedDirectHolder();
      activate();
      const credentialId = operation === 'machine-revoke' ? LIVE_KEY : CONSENT;
      await grantTo(credentialId);
      const gate = new WriteCoordinator();
      const held = Promise.withResolvers<undefined>();
      const entered = Promise.withResolvers<undefined>();
      const blocker = gate.enter(async () => {
        entered.resolve(undefined);
        await held.promise;
      });
      await entered.promise;
      const actor = operation === 'machine-revoke' ? 'ada' : 'mcp-01';
      const performed = { stamp: { at: 30, by: actor }, actor, auditId: 'queued-cascade' };
      const pending =
        operation === 'machine-revoke'
          ? new MachineCredentialAdministrationRepository(connection.db, gate).revoke(
              'org-a',
              { id: 'ada' },
              credentialId,
              performed,
            )
          : new ConsentCredentialRepository(connection.db, gate).end(
              credentialId,
              'family-1',
              performed,
            );
      performed.actor = 'ben';
      performed.stamp.by = 'ben';
      performed.stamp.at = 999;
      performed.auditId = 'replacement';
      held.resolve(undefined);
      await blocker;
      expect(await pending).toBe('revoked');
      const rows = connection.db.all<{ actor_id: string; created_at: number; action: string }>(
        sql`SELECT actor_id,created_at,action FROM organization_audit WHERE created_at=30 ORDER BY rowid`,
      );
      expect(rows).toHaveLength(2);
      expect(rows.every(({ actor_id }) => actor_id === actor)).toBe(true);
      expect(rows.map(({ action }) => action).sort()).toEqual([
        'access_revoked',
        'machine_credential_revoked',
      ]);
    });
  }

  for (const mismatch of ['actor', 'stamp']) {
    it('rejects a machine-revoke audit ' + mismatch + ' mismatch before owner entry', () => {
      const repository = new MachineCredentialAdministrationRepository(connection.db, {
        enter: () => {
          throw new Error('unexpected credential owner entry');
        },
      });
      const before = connection.db.all(sql`SELECT * FROM machine_credential ORDER BY id`);
      expect(() =>
        repository.revoke('org-a', { id: 'ada' }, LIVE_KEY, {
          actor: mismatch === 'actor' ? 'ben' : 'ada',
          stamp: { at: 30, by: mismatch === 'stamp' ? 'ben' : 'ada' },
          auditId: 'mismatched',
        }),
      ).toThrow('credential audit identity differs from its actor');
      expect(connection.db.all(sql`SELECT * FROM machine_credential ORDER BY id`)).toEqual(before);
    });
  }

  it('retains raw directory stamp and reach before the queued removal owner', async () => {
    seedDirectHolder();
    activate();
    await grantTo(LIVE_KEY);
    const gate = new WriteCoordinator();
    const repository = new DirectoryRepository(connection.db, gate);
    const held = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const blocker = gate.enter(async () => {
      entered.resolve(undefined);
      await held.promise;
    });
    await entered.promise;
    const stamp = { at: 30, by: 'ada' };
    const reach = { kind: 'own' as const, accountId: 'ada' };
    const pending = repository.removePerson('bot', true, stamp, reach);
    stamp.by = 'ben';
    stamp.at = 999;
    reach.accountId = 'ben';
    held.resolve(undefined);
    await blocker;
    expect(await pending).toMatchObject({ ok: true });
    expect(
      connection.db.all(
        sql`SELECT actor_id,created_at FROM organization_audit WHERE action='access_revoked'`,
      ),
    ).toEqual([{ actor_id: 'ada', created_at: 30 }]);
  });

  it('refuses raw directory reach escalation while its removal waits for the owner', async () => {
    activate();
    await grantTo(LIVE_KEY);
    const gate = new WriteCoordinator();
    const repository = new DirectoryRepository(connection.db, gate);
    const held = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const blocker = gate.enter(async () => {
      entered.resolve(undefined);
      await held.promise;
    });
    await entered.promise;
    const reach = { kind: 'own' as const, accountId: 'ben' };
    const before = connection.db.all(sql`SELECT * FROM access_grant ORDER BY id`);
    const pending = repository.removePerson('bot', true, { at: 30, by: 'ben' }, reach);
    Object.assign(reach, { kind: 'every' });
    held.resolve(undefined);
    await blocker;
    expect(await pending).toEqual({ ok: false, reason: 'forbidden' });
    expect(connection.db.all(sql`SELECT * FROM access_grant ORDER BY id`)).toEqual(before);
    expect(
      connection.db.all(sql`SELECT id FROM organization_audit WHERE action='access_revoked'`),
    ).toEqual([]);
  });
});

async function rejectionOf(pending: Promise<unknown>): Promise<Error> {
  const failure: unknown = await pending.then(
    () => null,
    (failure: unknown) => failure,
  );
  if (!(failure instanceof Error))
    throw new Error('expected the production operation to reject', { cause: failure });
  return failure;
}

for (const operation of ['revoke', 'group-delete', 'group-member-remove'] as const) {
  it(
    'rolls back a nonlowering access removal without a direct built-in holder at ' + operation,
    async () => {
      const created = await grants.createGroup('org-a', { id: 'ops', name: 'Ops' }, createAdaAct());
      expect(created).toMatchObject({ kind: 'created' });
      expect(await grants.addGroupMember('org-a', 'ops', 'cy', createAdaAct())).toBe('added');
      const granted = await grants.grant(
        'org-a',
        draft(ORGANIZATION, { kind: 'group', groupId: 'ops' }, 'org-super-admin'),
        createAdaAct(),
      );
      if (typeof granted === 'string') throw new Error(granted);
      const before = {
        grants: connection.db.all(sql`SELECT * FROM access_grant ORDER BY id`),
        groups: connection.db.all(sql`SELECT * FROM access_group ORDER BY id`),
        members: connection.db.all(
          sql`SELECT * FROM access_group_member ORDER BY group_id,user_id`,
        ),
        audits: connection.db.all(sql`SELECT * FROM organization_audit ORDER BY rowid`),
      };
      const answer =
        operation === 'revoke'
          ? await grants.revoke('org-a', granted.grant.id, createAdaAct())
          : operation === 'group-delete'
            ? await grants.deleteGroup('org-a', 'ops', createAdaAct())
            : await grants.removeGroupMember('org-a', 'ops', 'cy', createAdaAct());
      expect(answer).toBe('last_super_admin');
      expect({
        grants: connection.db.all(sql`SELECT * FROM access_grant ORDER BY id`),
        groups: connection.db.all(sql`SELECT * FROM access_group ORDER BY id`),
        members: connection.db.all(
          sql`SELECT * FROM access_group_member ORDER BY group_id,user_id`,
        ),
        audits: connection.db.all(sql`SELECT * FROM organization_audit ORDER BY rowid`),
      }).toEqual(before);
    },
  );
}

for (const operation of ['machine-revoke', 'consent-end'] as const) {
  it(
    'rolls back a zero-grant credential revocation without a direct human holder at ' + operation,
    async () => {
      connection.db.run(
        sql`UPDATE organization_activation SET state='activated',activated_at=5 WHERE singleton=1`,
      );
      const before = {
        credentials: connection.db.all(sql`SELECT * FROM machine_credential ORDER BY id`),
        audits: connection.db.all(sql`SELECT * FROM organization_audit ORDER BY rowid`),
      };
      const performed = {
        actor: 'ada',
        stamp: { at: 40, by: 'ada' },
        auditId: 'nonlowering-credential',
      };
      const answer =
        operation === 'machine-revoke'
          ? await new MachineCredentialAdministrationRepository(connection.db, OPEN).revoke(
              'org-a',
              { id: 'ada' },
              LIVE_KEY,
              performed,
            )
          : await new ConsentCredentialRepository(connection.db, OPEN).end(CONSENT, 'family-1', {
              ...performed,
              actor: 'mcp-01',
              stamp: { at: 40, by: 'mcp-01' },
            });
      expect(answer).toBe('last_super_admin');
      expect({
        credentials: connection.db.all(sql`SELECT * FROM machine_credential ORDER BY id`),
        audits: connection.db.all(sql`SELECT * FROM organization_audit ORDER BY rowid`),
      }).toEqual(before);
    },
  );
}

for (const state of ['live', 'revoked'] as const) {
  it(
    'checks every affected credential organization during raw person cleanup at ' + state,
    async () => {
      await grantInA('ada', 'org-super-admin');
      connection.db.run(
        sql`UPDATE machine_credential SET person_id='bot',revoked_at=${state === 'revoked' ? 5 : null} WHERE id=${FOREIGN_KEY}`,
      );
      const before = [
        'person',
        'person_organization',
        'machine_credential',
        'machine_credential_secret',
        'access_grant',
        'organization_audit',
      ].map((table) => connection.db.all(sql.raw('SELECT * FROM ' + table + ' ORDER BY rowid')));
      expect(
        await new DirectoryRepository(connection.db, OPEN).removePerson(
          'bot',
          true,
          { at: 50, by: 'ada' },
          { kind: 'every' },
        ),
      ).toEqual({ ok: false, reason: 'last_super_admin' });
      expect(
        [
          'person',
          'person_organization',
          'machine_credential',
          'machine_credential_secret',
          'access_grant',
          'organization_audit',
        ].map((table) => connection.db.all(sql.raw('SELECT * FROM ' + table + ' ORDER BY rowid'))),
      ).toEqual(before);
    },
  );
}

for (const operation of [
  'grant-revoke',
  'group-delete',
  'group-member-remove',
  'member-remove',
  'member-raw',
  'scim-update',
  'scim-remove',
  'machine-revoke',
  'consent-end',
  'pool-rekey',
  'pool-revoke',
  'issuer-remove',
  'directory-remove',
] as const) {
  it(
    'preserves an unexpected aggregate from the actual owner dependency at ' + operation,
    async () => {
      const failure = new AggregateError(
        [new LastSuperAdmin(), new Error('injected rollback failure')],
        'owner and rollback unavailable',
      );
      let turns = 0;
      const broken = {
        enter: () => {
          turns++;
          return Promise.reject(failure);
        },
      };
      const performed = { actor: 'ada', stamp: { at: 40, by: 'ada' }, auditId: 'aggregate-owner' };
      const scimAct = {
        actor: 'scim:token',
        stamp: { at: 40, by: 'ada' },
        auditId: 'aggregate-scim',
      };
      const mcpAct = {
        actor: 'mcp-01',
        stamp: { at: 40, by: 'mcp-01' },
        auditId: 'aggregate-consent',
      };
      const snapshot = () =>
        ['organization_membership', 'access_grant', 'machine_credential', 'organization_audit'].map(
          (table) => connection.db.all(sql.raw('SELECT * FROM ' + table + ' ORDER BY rowid')),
        );
      const before = snapshot();
      const access = new AccessGrantRepository(connection.db, broken);
      const members = new OrganizationRepository(connection.db, broken);
      const scim = new ScimUserRepository(connection.db, broken);
      const pools = new AgentPoolRepository(connection.db, broken, {
        maxAgentPersons: 10,
        maxConcurrentClaims: 10,
        maxCapacityUnitsPerResource: 10,
      });
      const pending =
        operation === 'grant-revoke'
          ? access.revoke('org-a', 'unread-before-owner', createAdaAct())
          : operation === 'group-delete'
            ? access.deleteGroup('org-a', 'unread-before-owner', createAdaAct())
            : operation === 'group-member-remove'
              ? access.removeGroupMember('org-a', 'unread-before-owner', 'cy', createAdaAct())
              : operation === 'member-remove'
                ? members.administer('org-a', { id: 'ada' }, 'cy', performed, 'route')
                : operation === 'member-raw'
                  ? members.removeMember('org-a', 'cy', performed, 'route')
                  : operation === 'scim-update'
                    ? scim.update('org-a', 'unread-before-owner', { active: false }, scimAct)
                    : operation === 'scim-remove'
                      ? scim.remove('org-a', 'unread-before-owner', scimAct)
                      : operation === 'machine-revoke'
                        ? new MachineCredentialAdministrationRepository(
                            connection.db,
                            broken,
                          ).revoke('org-a', { id: 'ada' }, LIVE_KEY, performed)
                        : operation === 'consent-end'
                          ? new ConsentCredentialRepository(connection.db, broken).end(
                              CONSENT,
                              'family-1',
                              mcpAct,
                            )
                          : operation === 'pool-rekey'
                            ? pools.rekey(
                                'org-a',
                                { id: 'ada' },
                                'unread-before-owner',
                                { keys: [] },
                                performed,
                              )
                            : operation === 'pool-revoke'
                              ? pools.revoke(
                                  'org-a',
                                  { id: 'ada' },
                                  'unread-before-owner',
                                  performed,
                                )
                              : operation === 'issuer-remove'
                                ? new TrustedIssuerAdministrationRepository(
                                    connection.db,
                                    broken,
                                  ).remove('org-a', { id: 'ada' }, 'unread-before-owner', performed)
                                : new DirectoryRepository(connection.db, broken).removePerson(
                                    'bot',
                                    true,
                                    performed.stamp,
                                    { kind: 'every' },
                                  );
      expect(await rejectionOf(pending)).toBe(failure);
      expect(turns).toBe(1);
      expect(snapshot()).toEqual(before);
    },
  );
}

it('preserves actual CP14 and rollback failures before manual owner repair', async () => {
  connection.db.run(
    sql`UPDATE organization_activation SET state='activated',activated_at=5 WHERE singleton=1`,
  );
  const snapshot = () =>
    ['machine_credential', 'access_grant', 'organization_audit'].map((table) =>
      connection.db.all(sql.raw('SELECT * FROM ' + table + ' ORDER BY rowid')),
    );
  const before = snapshot();
  const original = connection.db.run.bind(connection.db);
  let controls = 0;
  const run = spyOn(connection.db, 'run').mockImplementation((query) => {
    controls++;
    if (controls === 2) throw new Error('injected actual CP14 rollback failure');
    return original(query);
  });
  try {
    const failure = await rejectionOf(
      new MachineCredentialAdministrationRepository(connection.db, OPEN).revoke(
        'org-a',
        { id: 'ada' },
        LIVE_KEY,
        { actor: 'ada', stamp: { at: 40, by: 'ada' }, auditId: 'paired-cp14' },
      ),
    );
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError))
      throw new Error('actual paired failure was not aggregate');
    expect(failure.errors[0]).toBeInstanceOf(LastSuperAdmin);
    expect(failure.errors[1]).toMatchObject({ message: 'injected actual CP14 rollback failure' });
    expect(controls).toBe(2);
  } finally {
    run.mockRestore();
    connection.db.run('ROLLBACK');
  }
  expect(snapshot()).toEqual(before);
});
