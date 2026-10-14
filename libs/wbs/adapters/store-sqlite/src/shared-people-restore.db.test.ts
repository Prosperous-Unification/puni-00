import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SUPPORTED_CAPACITY_MODES } from '@wbs/domain';
import { afterEach, beforeEach, expect, it, spyOn } from 'bun:test';

import { openConnection, openDatabase } from './db';
import { DrizzleEventLogStore } from './event-log';
import { OPEN } from './gate';
import { rollbackTo } from './migrate-down';
import { digestSharedPeople } from './shared-people-backup';
import { restoreApprovedSharedPeople } from './shared-people-restore';
import { SharedPeopleRestoreApprovalRepository } from './shared-people-restore-approval';
import { restoreSharedPeople } from './shared-people-rollback';
import { MIGRATIONS_FOLDER, openSpaceDatabase } from './testing/space-database';

let directory: string;
let path: string;
const backup = {
  format: 'shared-people-save',
  version: 1,
  organizations: [
    { organizationId: 'org-a', mode: 'shared' },
    { organizationId: 'org-b', mode: 'isolated' },
  ],
  ranks: [
    {
      projectId: 'a1',
      organizationId: 'org-a',
      position: 7,
      createdAt: 2,
      updatedAt: 3,
      createdBy: 'ada',
    },
  ],
};
function execute(statement: string) {
  const sqlite = openDatabase(path);
  try {
    return sqlite.query(statement).all();
  } finally {
    sqlite.close();
  }
}
function prepare(saved: unknown = backup) {
  execute('DELETE FROM shared_people_restore_approval');
  execute('DELETE FROM shared_people_restore_operation');
  execute(
    `INSERT INTO shared_people_restore_operation VALUES ('restore-1', '${digestSharedPeople(saved)}', 1)`,
  );
  execute(
    "INSERT INTO shared_people_restore_approval VALUES ('approval-a', 'restore-1', 'org-a', 'ada', 1)",
  );
}
function invoke(
  saved: unknown = backup,
  approvalIds: readonly string[] = ['approval-a'],
  operationId = 'restore-1',
  at = 20,
) {
  const connection = openConnection(path);
  try {
    return restoreApprovedSharedPeople(connection.db, saved, { operationId, approvalIds }, at);
  } finally {
    connection.close();
  }
}
function snapshot() {
  return [
    'organization',
    'project_rank',
    'shared_people_audit',
    'event_log',
    'event_sequencer',
    'shared_people_restore_operation',
    'shared_people_restore_approval',
    'shared_people_restore_receipt',
    'shared_people_restore_consumption',
  ].map((table) => ({ table, rows: execute(`SELECT * FROM ${table} ORDER BY rowid`) }));
}
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-approved-restore-'));
  path = await openSpaceDatabase(directory);
  execute("UPDATE organization_activation SET state = 'activated', activated_at = 1");
  for (const organizationId of ['org-a', 'org-b'])
    execute(
      `INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('${organizationId}', 'ada', 'super_admin', 1)`,
    );
  prepare();
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

it('commits historical ranks, personal mode audit, every owned project event and bound receipt together', () => {
  const restored = invoke();
  expect(restored).toEqual({
    operationId: 'restore-1',
    backupDigest: digestSharedPeople(backup),
    completedAt: 20,
    organizations: 2,
    ranks: 1,
    modeChanges: 1,
    events: 4,
    approvalIds: ['approval-a'],
  });
  expect(
    execute(
      'SELECT project_id, organization_id, position, created_at, updated_at, created_by FROM project_rank',
    ),
  ).toEqual([
    {
      project_id: 'a1',
      organization_id: 'org-a',
      position: 7,
      created_at: 2,
      updated_at: 3,
      created_by: 'ada',
    },
  ]);
  expect(execute('SELECT id, shared_people, updated_at FROM organization ORDER BY id')).toEqual([
    { id: 'org-a', shared_people: 1, updated_at: 20 },
    { id: 'org-b', shared_people: 0, updated_at: null },
  ]);
  expect(
    execute('SELECT organization_id, actor_id, shared_people, created_at FROM shared_people_audit'),
  ).toEqual([{ organization_id: 'org-a', actor_id: 'ada', shared_people: 1, created_at: 20 }]);
  expect(
    execute('SELECT subscription, seq, message, created_at FROM event_log ORDER BY subscription'),
  ).toEqual(
    ['a1', 'a2', 'a3', 'a4'].map((projectId) => ({
      subscription: 'project:' + projectId,
      seq: 0,
      message: JSON.stringify({ type: 'elsewhere_changed', projectId, causeProjectId: null }),
      created_at: 20,
    })),
  );
  expect(
    execute('SELECT subscription, next_seq FROM event_sequencer ORDER BY subscription'),
  ).toEqual(
    ['a1', 'a2', 'a3', 'a4'].map((projectId) => ({
      subscription: 'project:' + projectId,
      next_seq: 1,
    })),
  );
  expect(execute('SELECT * FROM shared_people_restore_consumption')).toEqual([
    { approval_id: 'approval-a', operation_id: 'restore-1', organization_id: 'org-a' },
  ]);
  expect(execute('SELECT * FROM shared_people_restore_receipt')).toEqual([
    {
      operation_id: 'restore-1',
      backup_digest: digestSharedPeople(backup),
      completed_at: 20,
      organizations: 2,
      ranks: 1,
      mode_changes: 1,
      events: 4,
    },
  ]);
});
it('restores isolated ranks with consumption and receipt but no mode audit or event', () => {
  const isolated = {
    ...backup,
    organizations: backup.organizations.map((organization) => ({
      ...organization,
      mode: 'isolated',
    })),
  };
  prepare(isolated);
  expect(invoke(isolated)).toMatchObject({
    organizations: 2,
    ranks: 1,
    modeChanges: 0,
    events: 0,
    approvalIds: ['approval-a'],
  });
  expect(execute('SELECT * FROM shared_people_audit')).toEqual([]);
  expect(execute('SELECT * FROM event_log')).toEqual([]);
  expect(execute('SELECT * FROM event_sequencer')).toEqual([]);
  expect(execute('SELECT updated_at FROM organization')).toEqual([
    { updated_at: null },
    { updated_at: null },
  ]);
  expect(execute('SELECT approval_id FROM shared_people_restore_consumption')).toEqual([
    { approval_id: 'approval-a' },
  ]);
});
it('preserves extra isolated organizations and records shared changes for each independently approved organization', () => {
  const saved = {
    ...backup,
    organizations: backup.organizations.map((organization) => ({
      ...organization,
      mode: 'shared',
    })),
  };
  prepare(saved);
  execute("INSERT INTO organization (id, name, created_at) VALUES ('org-extra', 'Extra', 1)");
  execute(
    "INSERT INTO shared_people_restore_approval VALUES ('approval-b', 'restore-1', 'org-b', 'ada', 1)",
  );
  expect(invoke(saved, ['approval-b', 'approval-a'])).toMatchObject({
    organizations: 2,
    modeChanges: 2,
    events: 5,
    approvalIds: ['approval-a', 'approval-b'],
  });
  expect(
    execute("SELECT shared_people, updated_at FROM organization WHERE id='org-extra'"),
  ).toEqual([{ shared_people: 0, updated_at: null }]);
  expect(execute('SELECT subscription FROM event_log ORDER BY subscription')).toEqual(
    ['a1', 'a2', 'a3', 'a4', 'b1'].map((id) => ({ subscription: 'project:' + id })),
  );
});
it('returns the cold durable receipt after later edits without replay or membership rechecks', () => {
  const receipt = invoke();
  execute("UPDATE organization SET shared_people=0, updated_at=50 WHERE id='org-a'");
  execute('UPDATE project_rank SET position=999');
  execute("DELETE FROM organization_membership WHERE organization_id='org-a'");
  const before = snapshot();
  expect(invoke(backup, ['approval-a'], 'restore-1', 100)).toEqual(receipt);
  expect(snapshot()).toEqual(before);
});
it('refuses changed backup or approval IDs on a completed operation without replay', () => {
  invoke();
  const before = snapshot();
  expect(() => invoke({ ...backup, ranks: [] })).toThrow('operation binding');
  expect(() => invoke(backup, ['different-approval'])).toThrow('receipt approval set');
  expect(() => invoke(backup, [])).toThrow('receipt approval set');
  expect(snapshot()).toEqual(before);
});
it('requires exact personal approval sets bound to the original operation digest', () => {
  execute(`INSERT INTO shared_people_restore_operation VALUES ('foreign', '${'b'.repeat(64)}', 1)`);
  execute(
    "INSERT INTO shared_people_restore_approval VALUES ('foreign-approval', 'foreign', 'org-a', 'ada', 1)",
  );
  execute(
    "INSERT INTO shared_people_restore_approval VALUES ('extra-approval', 'restore-1', 'org-b', 'ada', 1)",
  );
  const before = snapshot();
  for (const ids of [
    [],
    ['missing'],
    ['approval-a', 'approval-a'],
    ['foreign-approval'],
    ['extra-approval'],
    ['approval-a', 'extra-approval'],
  ])
    expect(() => invoke(backup, ids)).toThrow('approval');
  expect(() => invoke({ ...backup, ranks: [] })).toThrow('operation binding');
  expect(() => invoke(backup, ['approval-a'], 'missing-operation')).toThrow('operation binding');
  expect(snapshot()).toEqual(before);
});
it('requires current super-admin membership for the recorded actor in that exact organization', () => {
  execute("UPDATE organization_membership SET role='admin' WHERE organization_id='org-a'");
  const before = snapshot();
  expect(() => invoke()).toThrow('super-admin');
  expect(snapshot()).toEqual(before);
  execute("DELETE FROM organization_membership WHERE organization_id='org-a'");
  const removed = snapshot();
  expect(() => invoke()).toThrow('super-admin');
  expect(snapshot()).toEqual(removed);
  execute(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES ('other', 'other', 'hash', 1)",
  );
  execute(
    "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'other', 'super_admin', 1)",
  );
  const foreignActor = snapshot();
  expect(() => invoke()).toThrow('super-admin');
  expect(snapshot()).toEqual(foreignActor);
});
it('requires activated state, present saved organizations, all isolated modes and globally empty ranks', () => {
  // Fixture fault removes marker permanence to exercise a valid pre-activation state after setup.
  execute('DROP TRIGGER organization_activation_no_revert');
  execute("UPDATE organization_activation SET state='pre_activation', activated_at=NULL");
  const before = snapshot();
  expect(() => invoke()).toThrow('activated');
  expect(snapshot()).toEqual(before);
  execute("UPDATE organization_activation SET state='activated', activated_at=1");
  execute(
    "INSERT INTO organization (id, name, created_at, shared_people) VALUES ('extra', 'Extra', 1, 1)",
  );
  const shared = snapshot();
  expect(() => invoke()).toThrow('isolated modes and no ranks');
  expect(snapshot()).toEqual(shared);
  execute("UPDATE organization SET shared_people=0 WHERE id='extra'");
  execute("INSERT INTO project_rank VALUES ('b1', 'org-b', 0, 1, NULL, 'ada')");
  const ranked = snapshot();
  expect(() => invoke()).toThrow('isolated modes and no ranks');
  expect(snapshot()).toEqual(ranked);
});
it('refuses a missing saved organization and invalid historical rank ownership or author atomically', () => {
  for (const saved of [
    {
      ...backup,
      organizations: [...backup.organizations, { organizationId: 'missing', mode: 'isolated' }],
    },
    { ...backup, ranks: [{ ...backup.ranks[0], projectId: 'b1' }] },
    { ...backup, ranks: [{ ...backup.ranks[0], createdBy: 'missing-author' }] },
  ]) {
    prepare(saved);
    const before = snapshot();
    expect(() => invoke(saved)).toThrow();
    expect(snapshot()).toEqual(before);
  }
});
for (const table of [
  'event_log',
  'shared_people_restore_receipt',
  'shared_people_restore_consumption',
]) {
  it(`rolls back modes, ranks, audit, sequences and evidence on late ${table} insertion failure`, () => {
    execute(
      `CREATE TRIGGER fail_restore BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'injected restore fault'); END`,
    );
    const before = snapshot();
    expect(() => invoke()).toThrow();
    expect(snapshot()).toEqual(before);
  });
}
it('does not add approvals to a completed operation while preserving an identical issuance retry', async () => {
  invoke();
  const before = snapshot();
  const connection = openConnection(path);
  try {
    const repository = new SharedPeopleRestoreApprovalRepository(connection.db, OPEN);
    expect(
      await repository.approve('org-b', 'restore-1', digestSharedPeople(backup), 'new-approval', {
        by: 'ada',
        at: 100,
      }),
    ).toEqual({ ok: false, refusal: 'restore_approval_conflict' });
    expect(
      await repository.approve('org-a', 'restore-1', digestSharedPeople(backup), 'new-id', {
        by: 'ada',
        at: 100,
      }),
    ).toMatchObject({ ok: true, approval: { id: 'approval-a' } });
  } finally {
    connection.close();
  }
  expect(snapshot()).toEqual(before);
});
it('refuses rollback over receipt/consumption evidence without removing its ledger entry', () => {
  invoke();
  // Scope the snapshot to receipts; newer empty admission down commits independently.
  rollbackTo(path, MIGRATIONS_FOLDER, '20261014130000_add_shared_people_restore_receipts');
  const before = snapshot();
  const ledger = execute('SELECT * FROM __drizzle_migrations');
  expect(() =>
    rollbackTo(path, MIGRATIONS_FOLDER, '20261014120000_add_shared_people_restore_approvals'),
  ).toThrow('restore completion evidence');
  expect(snapshot()).toEqual(before);
  expect(execute('SELECT * FROM __drizzle_migrations')).toEqual(ledger);
});
it('keeps legacy shared restore refused even if a test release supports shared', () => {
  const modes = SUPPORTED_CAPACITY_MODES as string[];
  modes.push('shared');
  const connection = openConnection(path);
  try {
    expect(() => restoreSharedPeople(connection.db, backup, 20)).toThrow(
      'unsupported capacity mode shared',
    );
  } finally {
    connection.close();
    modes.pop();
  }
  expect(execute('SELECT * FROM project_rank')).toEqual([]);
  expect(execute('SELECT * FROM shared_people_audit')).toEqual([]);
});

it('holds one immediate writer before reading current roles and borrows rank savepoints', () => {
  const rival = openDatabase(path);
  rival.run('PRAGMA busy_timeout = 0');
  let observed = false;
  let transactions = 0;
  const connection = openConnection(
    path,
    {
      logQuery(query) {
        if (!query.includes('from "organization_membership"')) return;
        observed = true;
        expect(() =>
          rival.run(
            "UPDATE organization_membership SET role='admin' WHERE organization_id='org-a'",
          ),
        ).toThrow('database is locked');
      },
    },
    () => {
      transactions += 1;
    },
  );
  try {
    expect(
      restoreApprovedSharedPeople(
        connection.db,
        backup,
        { operationId: 'restore-1', approvalIds: ['approval-a'] },
        20,
      ),
    ).toMatchObject({ ranks: 1, events: 4 });
    expect(observed).toBe(true);
    expect(transactions).toBe(1);
  } finally {
    connection.close();
    rival.close();
  }
});
it('refuses an incomplete durable consumption set on cold retry instead of replaying writes', () => {
  invoke();
  execute('DELETE FROM shared_people_restore_consumption');
  const before = snapshot();
  expect(() => invoke()).toThrow('receipt approval set');
  expect(snapshot()).toEqual(before);
});
it('enforces durable receipt digest and consumption operation/organization bindings', () => {
  expect(() =>
    execute(
      "INSERT INTO shared_people_restore_consumption VALUES ('approval-a', 'restore-1', 'org-a')",
    ),
  ).toThrow();
  expect(() =>
    execute(
      `INSERT INTO shared_people_restore_receipt VALUES ('restore-1', '${'b'.repeat(64)}', 20, 2, 1, 1, 4)`,
    ),
  ).toThrow();
  invoke();
  execute(
    `INSERT INTO shared_people_restore_operation VALUES ('other', '${digestSharedPeople(backup)}', 1)`,
  );
  execute(
    `INSERT INTO shared_people_restore_receipt VALUES ('other', '${digestSharedPeople(backup)}', 20, 0, 0, 0, 0)`,
  );
  execute(
    "INSERT INTO shared_people_restore_approval VALUES ('other-approval', 'other', 'org-a', 'ada', 1)",
  );
  execute(
    "INSERT INTO shared_people_restore_approval VALUES ('other-b', 'other', 'org-b', 'ada', 1)",
  );
  expect(() =>
    execute(
      "INSERT INTO shared_people_restore_consumption VALUES ('other-b', 'restore-1', 'org-b')",
    ),
  ).toThrow();
  expect(() =>
    execute(
      "INSERT INTO shared_people_restore_consumption VALUES ('other-approval', 'other', 'org-b')",
    ),
  ).toThrow();
  expect(() =>
    execute(
      `UPDATE shared_people_restore_operation SET backup_digest='${'b'.repeat(64)}' WHERE id='restore-1'`,
    ),
  ).toThrow();
});
it('rejects noninteger or negative receipt counts and noninteger completion times at storage', () => {
  for (const column of ['organizations', 'ranks', 'mode_changes', 'events', 'completed_at']) {
    const values: Record<string, string> = {
      organizations: '2',
      ranks: '1',
      mode_changes: '1',
      events: '4',
      completed_at: '20',
    };
    for (const invalid of column === 'completed_at'
      ? ['1.5', "'invalid'"]
      : ['-1', '1.5', "'invalid'"]) {
      values[column] = invalid;
      expect(() =>
        execute(
          `INSERT INTO shared_people_restore_receipt VALUES ('restore-1', '${digestSharedPeople(backup)}', ${values['completed_at']}, ${values['organizations']}, ${values['ranks']}, ${values['mode_changes']}, ${values['events']})`,
        ),
      ).toThrow();
    }
  }
  expect(execute('SELECT * FROM shared_people_restore_receipt')).toEqual([]);
});
it('enforces receipt/approval consumption uniqueness even when approval uniqueness is broken', () => {
  invoke();
  execute('DROP INDEX shared_people_restore_approval_operation_organization');
  execute(
    "INSERT INTO shared_people_restore_approval VALUES ('duplicate-org', 'restore-1', 'org-a', 'ada', 1)",
  );
  expect(() =>
    execute(
      "INSERT INTO shared_people_restore_consumption VALUES ('duplicate-org', 'restore-1', 'org-a')",
    ),
  ).toThrow();
  expect(execute('SELECT approval_id FROM shared_people_restore_consumption')).toEqual([
    { approval_id: 'approval-a' },
  ]);
});

it('requires an approval for rank-only changes in a second isolated organization', () => {
  const saved = {
    ...backup,
    ranks: [{ ...backup.ranks[0], projectId: 'b1', organizationId: 'org-b' }],
  };
  prepare(saved);
  const before = snapshot();
  expect(() => invoke(saved)).toThrow('exact personal approval set');
  expect(snapshot()).toEqual(before);
  execute(
    "INSERT INTO shared_people_restore_approval VALUES ('approval-b', 'restore-1', 'org-b', 'ada', 1)",
  );
  expect(invoke(saved, ['approval-b', 'approval-a'])).toMatchObject({
    ranks: 1,
    modeChanges: 1,
    events: 4,
    approvalIds: ['approval-a', 'approval-b'],
  });
  expect(execute("SELECT subscription FROM event_log WHERE subscription='project:b1'")).toEqual([]);
});
it('rejects duplicate or empty external references at their named boundary', () => {
  for (const ids of [['approval-a', 'approval-a'], ['']])
    expect(() => invoke(backup, ids)).toThrow('invalid restore operation/approval references');
  expect(() => invoke(backup, ['approval-a'], '')).toThrow(
    'invalid restore operation/approval references',
  );
});
it('records durable events on the borrowed writer even when public async event writing is broken', () => {
  const publicWriter = spyOn(DrizzleEventLogStore.prototype, 'recordEvent').mockImplementation(
    () => {
      throw new Error('public async event writer must not run');
    },
  );
  try {
    expect(invoke()).toMatchObject({ events: 4 });
    expect(execute('SELECT subscription FROM event_log')).toHaveLength(4);
  } finally {
    publicWriter.mockRestore();
  }
});
it('enforces completion receipt uniqueness independently of consumption foreign keys', () => {
  const insert = `INSERT INTO shared_people_restore_receipt VALUES ('restore-1', '${digestSharedPeople(backup)}', 20, 2, 1, 1, 4)`;
  execute(insert);
  expect(() => execute(insert)).toThrow();
});
it('enforces approval consumption uniqueness when its other constraint is broken', () => {
  invoke();
  execute('DROP INDEX shared_people_restore_consumption_organization');
  expect(() =>
    execute(
      "INSERT INTO shared_people_restore_consumption VALUES ('approval-a', 'restore-1', 'org-a')",
    ),
  ).toThrow();
});
