import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { type Connection, openConnection, openDatabase } from './db';
import { DrizzleEventLogStore } from './event-log';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { activateLegacyOrganization } from './organization-legacy-activation';
import { copyRecoveryPrefix } from './testing/recovery-state';

let dir: string;
let connection: Connection;

/**
 * Actual immutable migration111 follows the package rename but precedes required project
 * parents. Populated owner_id rows with no organization are this legacy
 * activation operator's input; current empty-catalogue birth cannot model it.
 */
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-legacy-activation-'));
  const path = join(dir, 'test.db');
  runMigrations(path, copyRecoveryPrefix(dir, '20261110100000_rename_project_to_work_package'));
  const raw = openDatabase(path);
  try {
    raw.run("INSERT INTO users (id, username, created_at) VALUES ('u1', 'dany', 1)");
    for (const id of ['p-live', 'p-gone'])
      raw.run(
        `INSERT INTO work_package (id, name, owner_id, created_at) VALUES ('${id}', '${id}', 'u1', 1)`,
      );
  } finally {
    raw.close();
  }
  connection = openConnection(path);
});

afterEach(() => {
  connection.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Records both streams before deleting `p-gone` from the pre-catalogue schema. */
async function deleteWorkPackageWithEvents(): Promise<void> {
  const events = new DrizzleEventLogStore(connection.db, OPEN);
  await events.recordEvent('work-package:p-live', { kind: 'renamed' }, 1);
  await events.recordEvent('work-package:p-gone', { kind: 'renamed' }, 1);
  expect(connection.db.all("DELETE FROM work_package WHERE id='p-gone' RETURNING id")).toEqual([
    { id: 'p-gone' },
  ]);
}

function subscriptions(table: 'event_sequencer' | 'event_log'): unknown[] {
  return connection.db.all(`SELECT DISTINCT subscription FROM ${table} ORDER BY subscription`);
}

describe('activateLegacyOrganization over a deleted work package', () => {
  it('refuses the stream work package deletion leaves behind', async () => {
    await deleteWorkPackageWithEvents();

    const outcome = await activateLegacyOrganization(connection.db, {
      name: 'default',
      superAdmin: 'dany',
      at: 5,
      isApplied: true,
      isPruningRetainedStreams: false,
    });

    expect(outcome).toEqual({
      ok: false,
      refused: {
        refusal: 'reconciliation_failed',
        unmappedRoots: [],
        catalogNameDrift: [],
        ownershipConflicts: [{ kind: 'event_stream', id: 'work-package:p-gone' }],
      },
    });
    expect(connection.db.all('SELECT * FROM organization')).toEqual([]);
  });

  it('prunes only streams whose work package is gone, then activates', async () => {
    await deleteWorkPackageWithEvents();

    const outcome = await activateLegacyOrganization(connection.db, {
      name: 'default',
      superAdmin: 'dany',
      at: 5,
      isApplied: true,
      isPruningRetainedStreams: true,
    });

    expect(outcome).toMatchObject({
      ok: true,
      activation: { prunedStreams: ['work-package:p-gone'] },
    });
    expect(subscriptions('event_sequencer')).toEqual([{ subscription: 'work-package:p-live' }]);
    expect(subscriptions('event_log')).toEqual([{ subscription: 'work-package:p-live' }]);
  });
});

function captureLogicalStore() {
  const schema = connection.db.all<{ type: string; name: string; sql: string | null }>(
    'SELECT type, name, sql FROM sqlite_schema ORDER BY type, name',
  );
  const tables = schema
    .filter(({ type }) => type === 'table')
    .map(({ name }) => {
      const quote = (identifier: string) => '"' + identifier.replaceAll('"', '""') + '"';
      const columns = connection.db.all<{ name: string }>(`PRAGMA table_info(${quote(name)})`);
      if (columns.length === 0) throw new Error('fixture table has no columns: ' + name);
      return {
        name,
        rows: connection.db.all(
          `SELECT * FROM ${quote(name)} ORDER BY ${columns.map(({ name }) => quote(name)).join(', ')}`,
        ),
      };
    });
  return { schema, tables };
}

function seedStream(subscription: string, shape: 'log' | 'sequencer' | 'both', ordinal: number) {
  if (shape !== 'sequencer')
    connection.db.run(sql`INSERT INTO event_log (subscription, seq, message, created_at)
      VALUES (${subscription}, ${ordinal}, ${'{ "projectId" : "old-value", "opaque" : [3, 1] }'}, ${ordinal + 100})`);
  if (shape !== 'log')
    connection.db.run(sql`INSERT INTO event_sequencer (subscription, next_seq)
      VALUES (${subscription}, ${ordinal + 7})`);
}

function activate(isApplied: boolean, isPruningRetainedStreams: boolean) {
  return activateLegacyOrganization(connection.db, {
    name: 'default',
    superAdmin: 'dany',
    at: 5,
    isApplied,
    isPruningRetainedStreams,
  });
}

function captureLiveHistory() {
  return {
    log: connection.db.all(`SELECT * FROM event_log
      WHERE subscription IN ('project:p-live', 'work-package:p-live') ORDER BY subscription, seq`),
    sequencer: connection.db.all(`SELECT * FROM event_sequencer
      WHERE subscription IN ('project:p-live', 'work-package:p-live') ORDER BY subscription`),
    plans: connection.db.all('SELECT * FROM plan_event ORDER BY id'),
  };
}

it('explicit activation prunes sorted unique known orphans and preserves both live histories', async () => {
  await deleteWorkPackageWithEvents();
  seedStream('project:p-live', 'both', 34);
  connection.db
    .run(sql`UPDATE event_log SET message = ${'{ "workPackageId" : "p-live", "text" : "projectId stays raw" }'},
    created_at = 217 WHERE subscription = 'work-package:p-live'`);
  connection.db.run(sql`INSERT INTO plan_event
    (id, work_package_id, user_id, kind, label, before, after, created_at)
    VALUES ('history-live', 'p-live', 'u1', 'renamed', 'History',
      ${'{ "projectId" : "p-live", "name" : "before" }'},
      ${'{ "projectId" : "p-live", "name" : "after" }'}, 219)`);
  seedStream('project:p-gone', 'both', 5);
  for (const prefix of ['project:', 'work-package:']) {
    seedStream(prefix + 'gone-log', 'log', 7);
    seedStream(prefix + 'gone-seq', 'sequencer', 11);
  }
  const orphans = [
    'project:gone-log',
    'project:gone-seq',
    'project:p-gone',
    'work-package:gone-log',
    'work-package:gone-seq',
    'work-package:p-gone',
  ];
  const before = captureLogicalStore();
  const live = captureLiveHistory();
  expect(await activate(true, false)).toEqual({
    ok: false,
    refused: {
      refusal: 'reconciliation_failed',
      unmappedRoots: [],
      catalogNameDrift: [],
      ownershipConflicts: orphans.map((id) => ({ kind: 'event_stream', id })),
    },
  });
  expect(captureLogicalStore()).toEqual(before);

  expect(await activate(false, true)).toMatchObject({
    ok: true,
    activation: { mode: 'dry_run', activatedAt: null, prunedStreams: orphans },
  });
  expect(captureLogicalStore()).toEqual(before);

  expect(await activate(true, true)).toMatchObject({
    ok: true,
    activation: { mode: 'applied', activatedAt: 5, prunedStreams: orphans },
  });
  expect(connection.db.all('SELECT * FROM organization_activation')).toEqual([
    { singleton: 1, state: 'activated', activated_at: 5 },
  ]);
  const surviving = [{ subscription: 'project:p-live' }, { subscription: 'work-package:p-live' }];
  expect(subscriptions('event_log')).toEqual(surviving);
  expect(subscriptions('event_sequencer')).toEqual(surviving);
  expect(captureLiveHistory()).toEqual(live);
});

for (const unknown of [
  'work_package:unknown',
  'workPackage:unknown',
  'work-package-lookalike:unknown',
]) {
  it('activation rolls back cleanup for unknown key ' + unknown, async () => {
    await deleteWorkPackageWithEvents();
    seedStream(unknown, 'both', 17);
    const before = captureLogicalStore();
    expect(await activate(true, true)).toEqual({
      ok: false,
      refused: {
        refusal: 'reconciliation_failed',
        unmappedRoots: [],
        catalogNameDrift: [],
        ownershipConflicts: [{ kind: 'event_stream', id: unknown }],
      },
    });
    expect(captureLogicalStore()).toEqual(before);
  });
}

it('a late live unmapped owner is never an orphan', async () => {
  await deleteWorkPackageWithEvents();
  connection.db.run('DROP TRIGGER work_package_organization_bridge');
  connection.db.run(`CREATE TRIGGER plant_late_live AFTER INSERT ON organization_membership
    WHEN NEW.role = 'super_admin' BEGIN
      INSERT INTO work_package (id, name, owner_id, created_at) VALUES ('late-live', 'Late', 'u1', 3);
    END`);
  seedStream('project:late-live', 'both', 19);
  seedStream('work-package:late-live', 'both', 23);
  const before = captureLogicalStore();
  expect(await activate(true, true)).toEqual({
    ok: false,
    refused: {
      refusal: 'reconciliation_failed',
      unmappedRoots: [{ kind: 'work_package', id: 'late-live' }],
      catalogNameDrift: [],
      ownershipConflicts: [
        { kind: 'event_stream', id: 'project:late-live' },
        { kind: 'event_stream', id: 'work-package:late-live' },
      ],
    },
  });
  expect(captureLogicalStore()).toEqual(before);
});
