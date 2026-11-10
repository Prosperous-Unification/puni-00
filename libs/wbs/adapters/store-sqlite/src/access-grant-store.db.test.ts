import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AccessAct, GrantDraft, GrantScope, GrantSubject } from '@wbs/core';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import {
  AccessGrantRepository,
  directSuperAdminCount,
  operatorSubjectRefusal,
} from './access-grant';
import { ConsentCredentialRepository } from './consent-credential';
import { type Connection, openConnection } from './db';
import { DirectoryRepository } from './directory';
import { OPEN, WriteCoordinator } from './gate';
import { MachineCredentialAdministrationRepository } from './machine-credential-administration';
import { runMigrations } from './migrate';

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

describe('revoking', () => {
  it('revokes a grant of its own organization only', async () => {
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
      { kind: 'machine_credential', credentialId: CONSENT },
    ]);
  });

  it('are deleted when an MCP consent ends', async () => {
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
    expect(await grants.list('org-a', {})).toEqual([]);
  });

  for (const operation of ['machine-revoke', 'consent-end']) {
    it('retains actual queued cascade audit provenance at ' + operation, async () => {
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
