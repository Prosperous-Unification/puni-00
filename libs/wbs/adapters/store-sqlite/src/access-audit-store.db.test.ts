import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { GrantDraft, OrganizationAuditDetail } from '@wbs/core';
import { afterEach, beforeEach, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { AccessGrantRepository, writeGrantIn } from './access-grant';
import { type Connection, openConnection } from './db';
import { OPEN, WriteCoordinator } from './gate';
import { runMigrations } from './migrate';
import { removeMembershipIn } from './organization';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
let directory: string;
let connection: Connection;
let grants: AccessGrantRepository;
let sequence: number;
const createAct = (userId = 'ada', at = 10) => ({
  actor: { kind: 'user' as const, userId },
  at,
  auditId: 'audit-' + String(sequence++),
});
const createDraft = (
  roleId = 'org-viewer',
  origin: GrantDraft['origin'] = 'route',
): GrantDraft => ({
  id: 'grant-' + String(sequence++),
  scope: { kind: 'organization' },
  subject: { kind: 'user', userId: 'cy' },
  roleId,
  origin,
});
function readAuditRows() {
  return connection.db
    .all<{
      id: string;
      organization_id: string;
      actor_id: string;
      action: string;
      subject_kind: string;
      subject_id: string;
      detail: string;
      created_at: number;
    }>(sql`SELECT * FROM organization_audit ORDER BY created_at,id`)
    .map((row) => ({
      ...row,
      detail: JSON.parse(row.detail) as OrganizationAuditDetail,
    }));
}
function readState() {
  return ['access_grant', 'access_group', 'access_group_member', 'organization_audit'].map(
    (table) => connection.db.all(sql.raw('SELECT * FROM ' + table + ' ORDER BY rowid')),
  );
}
async function rejectionOf(pending: Promise<unknown>): Promise<Error> {
  try {
    await pending;
  } catch (failure) {
    if (failure instanceof Error) return failure;
    throw new Error('access owner threw a non-Error', { cause: failure });
  }
  throw new Error('expected the access owner to reject');
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-access-audit-store-'));
  const path = join(directory, 'plan.db');
  runMigrations(path, FOLDER);
  connection = openConnection(path);
  sequence = 0;
  grants = new AccessGrantRepository(connection.db, OPEN);
  for (const id of ['ada', 'ben', 'cy']) {
    connection.db.run(
      sql`INSERT INTO users(id,username,email,created_at) VALUES (${id},${id},${id + '@private.test'},1)`,
    );
  }
  for (const organizationId of ['org-a', 'org-b']) {
    connection.db.run(
      sql`INSERT INTO organization(id,name,created_at) VALUES (${organizationId},${organizationId},1)`,
    );
    for (const userId of ['ada', 'ben', 'cy'])
      connection.db.run(
        sql`INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES (${organizationId},${userId},'member',1)`,
      );
  }
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

it('audits an actual grant with its authenticated actor, addressed scope, subject and origin', async () => {
  const change = createDraft('project-contributor', 'invitation');
  const performed = createAct();
  expect(await grants.grant('org-a', change, performed)).toMatchObject({ kind: 'granted' });
  expect(readAuditRows()).toEqual([
    {
      id: performed.auditId,
      organization_id: 'org-a',
      actor_id: 'ada',
      action: 'access_granted',
      subject_kind: 'access_grant',
      subject_id: change.id,
      created_at: 10,
      detail: {
        roleId: 'project-contributor',
        scopeKind: 'organization',
        scopeId: 'org-a',
        subjectKind: 'user',
        subjectId: 'cy',
        origin: 'invitation',
      },
    },
  ]);
  expect(JSON.stringify(readAuditRows())).not.toContain('@private.test');
});

it('audits revoke provenance from the current actor rather than the grant creator or stored origin', async () => {
  const change = createDraft('org-viewer', 'creation');
  await grants.grant('org-a', change, createAct());
  const performed = createAct('ben', 30);
  expect(await grants.revoke('org-a', change.id, performed)).toMatchObject({ kind: 'revoked' });
  expect(readAuditRows().filter(({ created_at }) => created_at === 30)).toEqual([
    {
      id: performed.auditId,
      organization_id: 'org-a',
      actor_id: 'ben',
      action: 'access_revoked',
      subject_kind: 'access_grant',
      subject_id: change.id,
      created_at: 30,
      detail: {
        roleId: 'org-viewer',
        scopeKind: 'organization',
        scopeId: 'org-a',
        subjectKind: 'user',
        subjectId: 'cy',
        origin: 'route',
      },
    },
  ]);
});

it('audits group creation on its actual owning connection', async () => {
  const performed = createAct();
  expect(await grants.createGroup('org-a', { id: 'ops', name: 'Ops' }, performed)).toMatchObject({
    kind: 'created',
  });
  expect(readAuditRows()).toMatchObject([
    {
      id: performed.auditId,
      actor_id: 'ada',
      action: 'access_group_created',
      subject_kind: 'access_group',
      subject_id: 'ops',
      detail: { name: 'Ops', origin: 'route' },
    },
  ]);
});

for (const name of ['Ops', 'Operations']) {
  it('audits a successful group rename even when the accepted name is ' + name, async () => {
    await grants.createGroup('org-a', { id: 'ops', name: 'Ops' }, createAct());
    const performed = createAct('ben', 30);
    expect(await grants.renameGroup('org-a', 'ops', name, performed)).toBe('renamed');
    expect(readAuditRows().filter(({ created_at }) => created_at === 30)).toMatchObject([
      {
        id: performed.auditId,
        actor_id: 'ben',
        action: 'access_group_renamed',
        subject_kind: 'access_group',
        subject_id: 'ops',
        detail: { oldName: 'Ops', newName: name, origin: 'route' },
      },
    ]);
  });
}

it('audits actual group-member addition and removal without duplicating refused acts', async () => {
  await grants.createGroup('org-a', { id: 'ops', name: 'Ops' }, createAct());
  const added = createAct('ada', 20);
  const removed = createAct('ben', 30);
  expect(await grants.addGroupMember('org-a', 'ops', 'cy', added)).toBe('added');
  expect(await grants.addGroupMember('org-a', 'ops', 'cy', createAct())).toBe('already_in_group');
  expect(await grants.removeGroupMember('org-a', 'ops', 'cy', removed)).toBe('removed');
  expect(await grants.removeGroupMember('org-a', 'ops', 'cy', createAct())).toBe('not_in_group');
  expect(readAuditRows()).toHaveLength(3);
  expect(
    readAuditRows().filter(({ action }) => action === 'access_group_member_added'),
  ).toMatchObject([
    {
      id: added.auditId,
      actor_id: 'ada',
      subject_kind: 'access_group',
      subject_id: 'ops',
      detail: { name: 'Ops', userId: 'cy', origin: 'route' },
    },
  ]);
  expect(
    readAuditRows().filter(({ action }) => action === 'access_group_member_removed'),
  ).toMatchObject([
    {
      id: removed.auditId,
      actor_id: 'ben',
      subject_kind: 'access_group',
      subject_id: 'ops',
      detail: { name: 'Ops', userId: 'cy', origin: 'route' },
    },
  ]);
});

async function populateGroup(): Promise<void> {
  await grants.createGroup('org-a', { id: 'ops', name: 'Ops' }, createAct());
  await grants.createGroup('org-b', { id: 'foreign', name: 'Ops' }, createAct());
  for (const userId of ['ada', 'ben', 'cy'])
    await grants.addGroupMember('org-a', 'ops', userId, createAct());
  await grants.addGroupMember('org-b', 'foreign', 'cy', createAct());
  for (const roleId of ['org-viewer', 'project-contributor']) {
    await grants.grant(
      'org-a',
      { ...createDraft(roleId), subject: { kind: 'group', groupId: 'ops' } },
      createAct(),
    );
    await grants.grant(
      'org-b',
      { ...createDraft(roleId), subject: { kind: 'group', groupId: 'foreign' } },
      createAct(),
    );
  }
}

it('audits group deletion as exactly N grant revokes plus M member removals plus one group deletion', async () => {
  await populateGroup();
  const deletedGrantIds = new Set((await grants.list('org-a', {})).map(({ id }) => id));
  const performed = createAct('ben', 30);
  expect(await grants.deleteGroup('org-a', 'ops', performed)).toEqual({
    kind: 'deleted',
    grantsDeleted: 2,
    membersRemoved: 3,
  });
  const rows = readAuditRows().filter(({ created_at }) => created_at === 30);
  expect(rows.map(({ action }) => action).sort()).toEqual(
    [
      'access_revoked',
      'access_revoked',
      'access_group_member_removed',
      'access_group_member_removed',
      'access_group_member_removed',
      'access_group_deleted',
    ].sort(),
  );
  expect(new Set(rows.map(({ id }) => id)).size).toBe(6);
  expect(
    rows
      .filter(({ action }) => action === 'access_revoked')
      .every(({ id }) => !deletedGrantIds.has(id)),
  ).toBe(true);
  expect(
    rows.every(
      ({ actor_id, organization_id }) => actor_id === 'ben' && organization_id === 'org-a',
    ),
  ).toBe(true);
  expect(
    rows
      .filter(({ action }) => action !== 'access_group_deleted')
      .every(({ detail }) => detail['origin'] === 'cascade'),
  ).toBe(true);
  expect(rows.find(({ action }) => action === 'access_group_deleted')).toMatchObject({
    id: performed.auditId,
    subject_id: 'ops',
    detail: { name: 'Ops' },
  });
  expect(await grants.listGroups('org-b')).toMatchObject([{ id: 'foreign', memberIds: ['cy'] }]);
  expect(await grants.list('org-b', {})).toHaveLength(2);
});

it('rolls every group cascade mutation and earlier audit row back when a later member audit fails', async () => {
  await populateGroup();
  const before = readState();
  connection.db.run(
    sql.raw(
      "CREATE TRIGGER reject_member_audit BEFORE INSERT ON organization_audit WHEN NEW.action='access_group_member_removed' BEGIN SELECT RAISE(ABORT,'injected later member audit failure'); END",
    ),
  );
  const failure = await rejectionOf(grants.deleteGroup('org-a', 'ops', createAct('ben', 30)));
  expect(String(failure.cause)).toContain('injected later member audit failure');
  expect(readState()).toEqual(before);
});

it('rolls a grant back when its required audit storage is missing', async () => {
  connection.db.run(sql`DROP TABLE organization_audit`);
  const change = createDraft();
  const failure = await rejectionOf(grants.grant('org-a', change, createAct()));
  expect(String(failure.cause)).toContain('no such table: organization_audit');
  expect(await grants.list('org-a', {})).toEqual([]);
});

for (const fault of ['event-id', 'user-id', 'operator-login', 'actor-kind']) {
  it('refuses missing trusted access identity before its owner at ' + fault, async () => {
    const performed = createAct();
    if (fault === 'event-id') Reflect.deleteProperty(performed, 'auditId');
    if (fault === 'user-id') Reflect.deleteProperty(performed.actor, 'userId');
    if (fault === 'operator-login') Object.assign(performed.actor, { kind: 'operator', login: '' });
    if (fault === 'actor-kind') Object.assign(performed.actor, { kind: 'unknown' });
    const repository = new AccessGrantRepository(connection.db, {
      enter: () => {
        throw new Error('unexpected access owner entry');
      },
    });
    const before = readState();
    const change = createDraft();
    if (fault === 'operator-login' || fault === 'actor-kind')
      Object.assign(change, { origin: 'operator' });
    const failure = await rejectionOf(repository.grant('org-a', change, performed));
    expect(failure.message).toContain(
      fault === 'event-id' ? 'access audit ID is missing' : 'access actor identity is malformed',
    );
    expect(readState()).toEqual(before);
  });
}

for (const operation of [
  'grant',
  'revoke',
  'group-create',
  'group-rename',
  'group-delete',
  'member-add',
  'member-remove',
]) {
  it('retains the actual audit act before the queued access owner at ' + operation, async () => {
    const gate = new WriteCoordinator();
    const repository = new AccessGrantRepository(connection.db, gate);
    const change = createDraft();
    if (operation === 'revoke') await grants.grant('org-a', change, createAct());
    if (operation !== 'grant' && operation !== 'revoke' && operation !== 'group-create')
      await grants.createGroup('org-a', { id: 'ops', name: 'Ops' }, createAct());
    if (operation === 'member-remove')
      await grants.addGroupMember('org-a', 'ops', 'cy', createAct());
    const held = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const blocker = gate.enter(async () => {
      entered.resolve(undefined);
      await held.promise;
    });
    await entered.promise;
    const performed = createAct('ada', 30);
    const auditId = performed.auditId;
    const pending =
      operation === 'grant'
        ? repository.grant('org-a', change, performed)
        : operation === 'revoke'
          ? repository.revoke('org-a', change.id, performed)
          : operation === 'group-create'
            ? repository.createGroup('org-a', { id: 'ops', name: 'Ops' }, performed)
            : operation === 'group-rename'
              ? repository.renameGroup('org-a', 'ops', 'Operations', performed)
              : operation === 'group-delete'
                ? repository.deleteGroup('org-a', 'ops', performed)
                : operation === 'member-add'
                  ? repository.addGroupMember('org-a', 'ops', 'cy', performed)
                  : repository.removeGroupMember('org-a', 'ops', 'cy', performed);
    Object.assign(performed.actor, { userId: 'ben' });
    performed.auditId = 'replacement';
    performed.at = 999;
    held.resolve(undefined);
    await blocker;
    await pending;
    expect(readAuditRows().filter(({ created_at }) => created_at === 30)).toMatchObject([
      { id: auditId, actor_id: 'ada' },
    ]);
    expect(
      readAuditRows().some(({ id, created_at }) => id === 'replacement' || created_at === 999),
    ).toBe(false);
  });
}

for (const operation of ['grant', 'group-create']) {
  it('retains the detached queued access draft at ' + operation, async () => {
    const gate = new WriteCoordinator();
    const repository = new AccessGrantRepository(connection.db, gate);
    const held = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const blocker = gate.enter(async () => {
      entered.resolve(undefined);
      await held.promise;
    });
    await entered.promise;
    const change = createDraft();
    const grantId = change.id;
    const group = { id: 'ops', name: 'Ops' };
    const pending =
      operation === 'grant'
        ? repository.grant('org-a', change, createAct())
        : repository.createGroup('org-a', group, createAct());
    Object.assign(change, { id: 'replacement-grant' });
    Object.assign(change.subject, { userId: 'ben' });
    Object.assign(group, { id: 'replacement-group', name: 'Replacement' });
    held.resolve(undefined);
    await blocker;
    await pending;
    if (operation === 'grant')
      expect(await grants.list('org-a', {})).toMatchObject([
        { id: grantId, subject: { kind: 'user', userId: 'cy' } },
      ]);
    else expect(await grants.listGroups('org-a')).toMatchObject([{ id: 'ops', name: 'Ops' }]);
  });
}

for (const operation of [
  'grant',
  'revoke',
  'group-create',
  'group-rename',
  'group-delete',
  'member-add',
  'member-remove',
]) {
  it(
    'rolls the complete access act back when required audit storage refuses at ' + operation,
    async () => {
      const change = createDraft();
      if (operation === 'revoke') await grants.grant('org-a', change, createAct());
      if (!['grant', 'revoke', 'group-create'].includes(operation))
        await grants.createGroup('org-a', { id: 'ops', name: 'Ops' }, createAct());
      if (operation === 'member-remove')
        await grants.addGroupMember('org-a', 'ops', 'cy', createAct());
      const before = readState();
      connection.db.run(
        sql.raw(
          "CREATE TRIGGER refuse_access_audit BEFORE INSERT ON organization_audit BEGIN SELECT RAISE(ABORT,'required access audit unavailable'); END",
        ),
      );
      const performed = createAct();
      const pending =
        operation === 'grant'
          ? grants.grant('org-a', change, performed)
          : operation === 'revoke'
            ? grants.revoke('org-a', change.id, performed)
            : operation === 'group-create'
              ? grants.createGroup('org-a', { id: 'ops', name: 'Ops' }, performed)
              : operation === 'group-rename'
                ? grants.renameGroup('org-a', 'ops', 'Renamed', performed)
                : operation === 'group-delete'
                  ? grants.deleteGroup('org-a', 'ops', performed)
                  : operation === 'member-add'
                    ? grants.addGroupMember('org-a', 'ops', 'cy', performed)
                    : grants.removeGroupMember('org-a', 'ops', 'cy', performed);
      const failure = await rejectionOf(pending);
      expect(String(failure.cause)).toContain('required access audit unavailable');
      expect(readState()).toEqual(before);
    },
  );
}

it('borrows grant and membership writes from an already-owned plain connection without audit or nested owners', () => {
  let nativeOwners = 0;
  connection.close();
  connection = openConnection(join(directory, 'plan.db'), undefined, () => {
    nativeOwners += 1;
  });
  const before = readState();
  const members = connection.db.all(
    sql`SELECT * FROM organization_membership ORDER BY organization_id,user_id`,
  );
  connection.db.run(sql`BEGIN IMMEDIATE`);
  try {
    expect(writeGrantIn(connection.db, 'org-a', createDraft(), createAct())).toMatchObject({
      kind: 'granted',
    });
    expect(removeMembershipIn(connection.db, 'org-a', 'cy')).toEqual({
      kind: 'removed',
      evidence: {
        membershipRemoved: true,
        removedUserGrantCount: 1,
        removedGroupMembershipCount: 0,
      },
    });
    expect(readAuditRows()).toEqual([]);
  } finally {
    connection.db.run(sql`ROLLBACK`);
  }
  expect(nativeOwners).toBe(0);
  expect(readState()).toEqual(before);
  expect(
    connection.db.all(sql`SELECT * FROM organization_membership ORDER BY organization_id,user_id`),
  ).toEqual(members);
});
