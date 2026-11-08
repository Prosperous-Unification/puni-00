import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AccessAct, GrantDraft, GrantScope, GrantSubject } from '@wbs/core';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { AccessGrantRepository, directSuperAdminCount } from './access-grant';
import { ConsentCredentialRepository } from './consent-credential';
import { type Connection, openConnection } from './db';
import { OPEN } from './gate';
import { MachineCredentialAdministrationRepository } from './machine-credential-administration';
import { runMigrations } from './migrate';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const ORGANIZATION: GrantScope = { kind: 'organization' };
const byAda: AccessAct = { actor: { kind: 'user', userId: 'ada' }, at: 10 };
const byBen: AccessAct = { actor: { kind: 'user', userId: 'ben' }, at: 10 };
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
    byAda,
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
    const group = await grants.createGroup('org-a', { id: 'ops', name: 'Ops' }, byAda);
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
          byAda,
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

  it('writes an operator’s grant with no creator', async () => {
    const outcome = await grants.grant(
      'org-a',
      draft(ORGANIZATION, { kind: 'user', userId: 'cy' }, 'org-super-admin'),
      { actor: { kind: 'operator', login: 'df' }, at: 20 },
    );
    expect(outcome).toMatchObject({ kind: 'granted', grant: { createdBy: null, createdAt: 20 } });
  });

  it('refuses an unknown role and another organization’s custom role', async () => {
    connection.db.run(
      sql`INSERT INTO access_role (id, name, object_kind, organization_id, created_at) VALUES ('custom-b', 'Auditor', 'organization', 'org-b', 1)`,
    );
    const cy: GrantSubject = { kind: 'user', userId: 'cy' };
    expect(await grants.grant('org-a', draft(ORGANIZATION, cy, 'org-owner'), byAda)).toBe(
      'unknown_role',
    );
    expect(await grants.grant('org-a', draft(ORGANIZATION, cy, 'custom-b'), byAda)).toBe(
      'unknown_role',
    );
    expect(await grants.grant('org-b', draft(ORGANIZATION, cy, 'custom-b'), byAda)).toMatchObject({
      kind: 'granted',
    });
    expect(grantCount()).toBe(1);
  });

  it('refuses org-admin at a work package and project-manager there, and allows package-viewer at the organization', async () => {
    const cy: GrantSubject = { kind: 'user', userId: 'cy' };
    const wpA: GrantScope = { kind: 'work_package', workPackageId: 'wp-a' };
    expect(await grants.grant('org-a', draft(wpA, cy, 'org-admin'), byAda)).toBe(
      'role_scope_mismatch',
    );
    expect(await grants.grant('org-a', draft(wpA, cy, 'project-manager'), byAda)).toBe(
      'role_scope_mismatch',
    );
    expect(grantCount()).toBe(0);
    expect(
      await grants.grant('org-a', draft(ORGANIZATION, cy, 'package-viewer'), byAda),
    ).toMatchObject({ kind: 'granted' });
  });

  it('refuses another organization’s work package, an absent one and a project scope as not_found', async () => {
    const cy: GrantSubject = { kind: 'user', userId: 'cy' };
    expect(
      await grants.grant(
        'org-a',
        draft({ kind: 'work_package', workPackageId: 'wp-b' }, cy, 'package-viewer'),
        byAda,
      ),
    ).toBe('not_found');
    expect(
      await grants.grant(
        'org-a',
        draft({ kind: 'work_package', workPackageId: 'wp-none' }, cy, 'package-viewer'),
        byAda,
      ),
    ).toBe('not_found');
    expect(
      await grants.grant(
        'org-a',
        draft({ kind: 'project', projectId: 'wp-a' }, cy, 'project-viewer'),
        byAda,
      ),
    ).toBe('not_found');
    expect(await grants.grant('org-none', draft(ORGANIZATION, cy, 'org-viewer'), byAda)).toBe(
      'not_found',
    );
    expect(grantCount()).toBe(0);
  });

  it('refuses a user who is no member, a member of another organization included', async () => {
    expect(
      await grants.grant(
        'org-a',
        draft(ORGANIZATION, { kind: 'user', userId: 'out' }, 'org-viewer'),
        byAda,
      ),
    ).toBe('not_a_member');
    expect(
      await grants.grant(
        'org-a',
        draft(ORGANIZATION, { kind: 'user', userId: 'dee' }, 'org-viewer'),
        byAda,
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
          byAda,
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
          byAda,
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
        byBen,
      ),
    ).toBe('already_granted');
    expect(grantCount()).toBe(1);
  });
});

describe('revoking', () => {
  it('revokes a grant of its own organization only', async () => {
    const id = await grantInA('cy', 'org-viewer');
    expect(await grants.revoke('org-b', id)).toBe('not_found');
    expect(await grants.revoke('org-a', id)).toMatchObject({ kind: 'revoked', grant: { id } });
    expect(await grants.revoke('org-a', id)).toBe('not_found');
  });

  it('refuses revoking the last direct super-admin grant, even while a group of members holds the role', async () => {
    const ada = await grantInA('ada', 'org-super-admin');
    await grants.createGroup('org-a', { id: 'admins', name: 'Admins' }, byAda);
    expect(await grants.addGroupMember('org-a', 'admins', 'cy', byAda)).toBe('added');
    expect(
      await grants.grant(
        'org-a',
        draft(ORGANIZATION, { kind: 'group', groupId: 'admins' }, 'org-super-admin'),
        byAda,
      ),
    ).toMatchObject({ kind: 'granted' });

    expect(await grants.revoke('org-a', ada)).toBe('last_super_admin');
    expect(directSuperAdminCount(connection.db, 'org-a', { besides: null })).toBe(1);

    // The hand-over (P21): grant first, then revoke.
    const ben = await grantInA('ben', 'org-super-admin');
    expect(await grants.revoke('org-a', ada)).toMatchObject({ kind: 'revoked' });
    expect(await grants.revoke('org-a', ben)).toBe('last_super_admin');
    expect(directSuperAdminCount(connection.db, 'org-a', { besides: null })).toBe(1);
  });

  it('lets exactly one of two super-admins revoke their own grant across two connections', async () => {
    // bun:sqlite runs each immediate transaction to completion, so these
    // serialize: this watches the count read inside the transaction, which
    // is what refuses the second revocation.
    const ada = await grantInA('ada', 'org-super-admin');
    const ben = await grantInA('ben', 'org-super-admin');
    const other = openConnection(path);
    try {
      const outcomes = await Promise.all([
        grants.revoke('org-a', ada),
        new AccessGrantRepository(other.db, OPEN).revoke('org-a', ben),
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
    expect(await grants.createGroup('org-a', { id: 'ops', name: 'Ops' }, byAda)).toMatchObject({
      kind: 'created',
      group: { id: 'ops', name: 'Ops', memberIds: [] },
    });
    expect(await grants.createGroup('org-a', { id: 'ops-2', name: 'Ops' }, byAda)).toBe(
      'name_taken',
    );
    await grants.createGroup('org-a', { id: 'dev', name: 'Dev' }, byAda);
    expect(await grants.renameGroup('org-a', 'dev', 'Ops', byAda)).toBe('name_taken');
    expect(await grants.renameGroup('org-a', 'ops', 'Ops', byAda)).toBe('renamed');
    expect(await grants.renameGroup('org-a', 'ops', 'Operations', byAda)).toBe('renamed');
    expect(await grants.renameGroup('org-a', 'ops-b', 'Mine', byAda)).toBe('unknown_group');
    // B's group named Ops does not take the name in A.
    expect((await grants.listGroups('org-a')).map((group) => group.name)).toEqual([
      'Dev',
      'Operations',
    ]);
  });

  it('adds only current members, once, and removes them', async () => {
    await grants.createGroup('org-a', { id: 'ops', name: 'Ops' }, byAda);
    expect(await grants.addGroupMember('org-a', 'ops', 'out', byAda)).toBe('not_a_member');
    expect(await grants.addGroupMember('org-a', 'ops', 'dee', byAda)).toBe('not_a_member');
    expect(await grants.addGroupMember('org-a', 'ops-b', 'cy', byAda)).toBe('unknown_group');
    expect(await grants.addGroupMember('org-a', 'ops', 'cy', byAda)).toBe('added');
    expect(await grants.addGroupMember('org-a', 'ops', 'cy', byAda)).toBe('already_in_group');
    expect(await grants.listGroups('org-a')).toMatchObject([{ id: 'ops', memberIds: ['cy'] }]);
    expect(await grants.removeGroupMember('org-a', 'ops', 'ben')).toBe('not_in_group');
    expect(await grants.removeGroupMember('org-a', 'ops-b', 'cy')).toBe('unknown_group');
    expect(await grants.removeGroupMember('org-a', 'ops', 'cy')).toBe('removed');
    expect(await grants.listGroups('org-a')).toMatchObject([{ id: 'ops', memberIds: [] }]);
  });

  it('deletes a group with its grants and members, and nothing of another group', async () => {
    await grants.createGroup('org-a', { id: 'ops', name: 'Ops' }, byAda);
    await grants.createGroup('org-a', { id: 'dev', name: 'Dev' }, byAda);
    for (const groupId of ['ops', 'dev']) {
      await grants.addGroupMember('org-a', groupId, 'cy', byAda);
      await grants.grant(
        'org-a',
        draft(ORGANIZATION, { kind: 'group', groupId }, 'org-viewer'),
        byAda,
      );
    }
    expect(await grants.deleteGroup('org-a', 'ops-b')).toBe('unknown_group');
    expect(await grants.deleteGroup('org-a', 'ops')).toEqual({
      kind: 'deleted',
      grantsDeleted: 1,
      membersRemoved: 1,
    });
    expect(await grants.listGroups('org-a')).toMatchObject([{ id: 'dev', memberIds: ['cy'] }]);
    expect((await grants.list('org-a', {})).map((grant) => grant.subject)).toEqual([
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
      byAda,
    );
    if (typeof outcome === 'string')
      throw new Error(`granting ${credentialId} answered ${outcome}`);
  }

  it('are deleted with an administrator’s revocation, and no other credential’s', async () => {
    activate();
    await grantTo(LIVE_KEY);
    await grantTo(CONSENT);
    const credentials = new MachineCredentialAdministrationRepository(connection.db, OPEN);
    expect(await credentials.revoke('org-a', 'ada', LIVE_KEY, act)).toBe('revoked');
    expect((await grants.list('org-a', {})).map((grant) => grant.subject)).toEqual([
      { kind: 'machine_credential', credentialId: CONSENT },
    ]);
  });

  it('are deleted when an MCP consent ends', async () => {
    await grantTo(CONSENT);
    const consents = new ConsentCredentialRepository(connection.db, OPEN);
    expect(await consents.end(CONSENT, 'family-1', act)).toBe('revoked');
    expect(await grants.list('org-a', {})).toEqual([]);
  });
});
