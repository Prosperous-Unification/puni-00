import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { clockOf } from '@wbs/core';
import { EventLogService } from '@wbs/core/module/event-log/event-log.resource';
import { GatewayBroadcaster } from '@wbs/core/module/realtime/gateway-broadcaster';
import { ReplayBuffer } from '@wbs/core/module/realtime/replay-buffer';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { openConnection, openDatabase } from './db';
import { DrizzleEventLogStore } from './event-log';
import { WriteCoordinator } from './gate';
import { runMigrations } from './migrate';
import { readMigrationFolders, rollbackTo } from './migrate-down';

interface RenameFixture {
  baseline: string;
  migration: string;
  beforeSql: string[];
  tables: [string, string][];
  beforeTreeSql: string;
  afterTreeSql: string;
  beforeCodeSql: string;
  afterCodeSql: string;
  unmappedSql: string;
  allocatorSql: string;
}

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
// The scenario fixture pins the outgoing SQL vocabulary and identities; the mechanical pass never edits it.
const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../openspec/changes/wbs-work-packages/fixtures/rename-before.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as RenameFixture;

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'work-package-rename-'));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function prepareStore(): { path: string; migrations: string } {
  const migrations = join(directory, 'migrations');
  mkdirSync(migrations);
  const preceding = readMigrationFolders(FOLDER).filter(({ name }) => name <= fixture.baseline);
  expect(preceding).toHaveLength(110);
  for (const migration of preceding)
    cpSync(join(FOLDER, migration.name), join(migrations, migration.name), { recursive: true });
  const path = join(directory, 'store.db');
  runMigrations(path, migrations);
  withinStore(path, (sqlite) => {
    for (const statement of fixture.beforeSql) sqlite.run(statement);
  });
  return { path, migrations };
}

function withinStore<T>(path: string, use: (sqlite: Database) => T): T {
  const sqlite = openDatabase(path);
  try {
    return use(sqlite);
  } finally {
    sqlite.close();
  }
}

function installRename(store: { path: string; migrations: string }): void {
  const selected = readMigrationFolders(FOLDER).find(({ name }) => name === fixture.migration);
  expect(selected, 'the explicit window migration must exist').toBeDefined();
  if (selected === undefined) throw new Error('required window migration is absent');
  cpSync(join(FOLDER, selected.name), join(store.migrations, selected.name), { recursive: true });
  runMigrations(store.path, store.migrations);
}

function snapshotStore(path: string) {
  return withinStore(path, (sqlite) => ({
    schema: sqlite
      .query('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name')
      .all(),
    rows: sqlite
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map(({ name }) => ({
        name,
        rows: sqlite
          .query('SELECT * FROM "' + name.replaceAll('"', '""') + '" ORDER BY rowid')
          .all(),
      })),
  }));
}

it('the pinned outgoing store contains a tree, direct authority, budget and allocated codes', () => {
  const store = prepareStore();
  withinStore(store.path, (sqlite) => {
    expect(sqlite.query(fixture.beforeTreeSql).all('rename-p')).toHaveLength(2);
    expect(sqlite.query(fixture.beforeCodeSql).all()).toHaveLength(2);
    expect(sqlite.query('SELECT role_id FROM access_grant WHERE id=?').get('rename-grant')).toEqual(
      { role_id: 'org-super-admin' },
    );
    expect(
      sqlite.query('SELECT COUNT(*) AS n FROM work_item_budget WHERE measure_id IS NOT NULL').get(),
    ).toEqual({ n: 1 });
    expect(sqlite.query('SELECT cap,policy FROM work_item_budget').get()).toEqual({
      cap: 100,
      policy: 'strict',
    });
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});

it('the actual window migration keeps rooted rows and authority while renaming every planned table', () => {
  const store = prepareStore();
  const before = withinStore(store.path, (sqlite) => ({
    tree: sqlite.query(fixture.beforeTreeSql).all('rename-p'),
    codes: sqlite.query(fixture.beforeCodeSql).all(),
    grants: sqlite.query('SELECT * FROM access_grant ORDER BY id').all(),
    audit: sqlite.query('SELECT * FROM organization_audit ORDER BY id').all(),
  }));
  installRename(store);
  withinStore(store.path, (sqlite) => {
    for (const [oldName, newName] of fixture.tables) {
      expect(
        sqlite
          .query('SELECT name FROM sqlite_master WHERE type=? AND name=?')
          .get('table', oldName),
        oldName,
      ).toBeNull();
      expect(
        sqlite
          .query('SELECT name FROM sqlite_master WHERE type=? AND name=?')
          .get('table', newName),
        newName,
      ).toEqual({ name: newName });
    }
    expect(sqlite.query(fixture.afterTreeSql).all('rename-p')).toEqual(before.tree);
    expect(sqlite.query(fixture.afterCodeSql).all()).toEqual(before.codes);
    expect(sqlite.query('SELECT * FROM access_grant ORDER BY id').all()).toEqual(before.grants);
    expect(sqlite.query('SELECT * FROM organization_audit ORDER BY id').all()).toEqual(
      before.audit,
    );
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});

it('an unmapped outgoing root refuses before any schema, row or complete-ledger effect', () => {
  const store = prepareStore();
  withinStore(store.path, (sqlite) => {
    sqlite.run(fixture.unmappedSql);
  });
  const before = snapshotStore(store.path);
  expectMigrationRefusal(() => {
    installRename(store);
  }, 'unmapped work packages: 1');
  expect(snapshotStore(store.path)).toEqual(before);
});

it('rollback refuses the renamed store without changing its rows, schema or ledger', () => {
  const store = prepareStore();
  installRename(store);
  const before = snapshotStore(store.path);
  expectMigrationRefusal(() => {
    rollbackTo(store.path, store.migrations, fixture.baseline);
  }, 'verified window snapshot');
  expect(snapshotStore(store.path)).toEqual(before);
});

interface CapturedStore {
  format: 1;
  compression: 'gzip';
  encoding: 'base64';
  uncompressedSha256: string;
  uncompressedBytes: number;
  gzipSha256: string;
  gzipBytes: number;
  gzipBase64: string;
  workPackageId: string;
  workItemId: string;
  duplicateId: string;
  principalId: string;
  savedPlanId: string;
  savedInputSchemaVersion: number;
  journalRows: number;
  historyRows: number;
  commandKinds: string[];
}

const captured = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../openspec/changes/wbs-work-packages/fixtures/outgoing-store.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as CapturedStore;

function prepareCapturedStore(): { path: string; migrations: string } {
  expect({
    format: captured.format,
    compression: captured.compression,
    encoding: captured.encoding,
  }).toEqual({ format: 1, compression: 'gzip', encoding: 'base64' });
  const compressed = Buffer.from(captured.gzipBase64, 'base64');
  expect(compressed.length).toBe(captured.gzipBytes);
  expect(createHash('sha256').update(compressed).digest('hex')).toBe(captured.gzipSha256);
  const bytes = Bun.gunzipSync(compressed);
  expect(bytes.length).toBe(captured.uncompressedBytes);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(captured.uncompressedSha256);
  const path = join(directory, 'captured.db');
  writeFileSync(path, bytes, { flag: 'wx' });
  const migrations = join(directory, 'captured-migrations');
  mkdirSync(migrations);
  for (const migration of readMigrationFolders(FOLDER).filter(
    ({ name }) => name <= fixture.baseline,
  ))
    cpSync(join(FOLDER, migration.name), join(migrations, migration.name), { recursive: true });
  return { path, migrations };
}

it('the genuine outgoing owner capture retains saved body ten and every package-bearing command family', () => {
  const store = prepareCapturedStore();
  withinStore(store.path, (sqlite) => {
    expect(sqlite.query('SELECT COUNT(*) AS n FROM __drizzle_migrations').get()).toEqual({
      n: 110,
    });
    expect(sqlite.query('SELECT COUNT(*) AS n FROM command_journal').get()).toEqual({
      n: captured.journalRows,
    });
    expect(sqlite.query('SELECT COUNT(*) AS n FROM plan_event').get()).toEqual({
      n: captured.historyRows,
    });
    expect(
      sqlite
        .query('SELECT input_schema_version FROM saved_plan WHERE id=?')
        .get(captured.savedPlanId),
    ).toEqual({ input_schema_version: 10 });
    expect(sqlite.query('SELECT COUNT(*) AS n FROM work_item_budget').get()).toEqual({ n: 2 });
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
    for (const kind of [
      'batch',
      'transition_incident_nodes',
      'restore_subtree',
      'add_typed_dependency',
      'remove_typed_dependency',
      'update_typed_dependency',
      'move',
      'set_budget',
      'set_estimate',
      'set_actual',
    ])
      expect(captured.commandKinds).toContain(kind);
  });
});

it('the window migration preserves genuine saved body bytes and replay requirements', () => {
  const store = prepareCapturedStore();
  const before = withinStore(store.path, (sqlite) => ({
    headers: sqlite
      .query(
        'SELECT id,name,created_by,created_at,input_schema_version,input_bytes,input_sha256,schedule_schema_version,schedule_bytes,schedule_sha256,schedule_input_sha256,scheduler_algorithm_id,schedule_absent_reason,created_by_id FROM saved_plan ORDER BY id',
      )
      .all(),
    bodies: sqlite.query('SELECT * FROM saved_plan_body ORDER BY saved_plan_id,kind').all(),
    grants: sqlite.query('SELECT * FROM access_grant ORDER BY id').all(),
    authorization: sqlite
      .query(
        "SELECT id,json_extract(payload,'$.authorization') AS authorization FROM command_journal ORDER BY id",
      )
      .all(),
  }));
  installRename(store);
  withinStore(store.path, (sqlite) => {
    expect(
      sqlite
        .query(
          'SELECT id,name,created_by,created_at,input_schema_version,input_bytes,input_sha256,schedule_schema_version,schedule_bytes,schedule_sha256,schedule_input_sha256,scheduler_algorithm_id,schedule_absent_reason,created_by_id FROM saved_plan ORDER BY id',
        )
        .all(),
    ).toEqual(before.headers);
    expect(sqlite.query('SELECT * FROM saved_plan_body ORDER BY saved_plan_id,kind').all()).toEqual(
      before.bodies,
    );
    expect(sqlite.query('SELECT * FROM access_grant ORDER BY id').all()).toEqual(before.grants);
    expect(
      sqlite
        .query('SELECT COUNT(*) AS n FROM saved_plan WHERE work_package_id=?')
        .get(captured.workPackageId),
    ).toEqual({ n: 1 });
    expect(
      sqlite
        .query(
          "SELECT id,json_extract(payload,'$.authorization') AS authorization FROM command_journal ORDER BY id",
        )
        .all(),
    ).toEqual(before.authorization);
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});

interface CommandFixture {
  cases: { name: string; before: unknown; after: unknown }[];
  corruptions: { name: string; command: unknown }[];
  preconditions: { before: unknown; after: unknown };
}
const commands = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../openspec/changes/wbs-work-packages/fixtures/command-json.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as CommandFixture;

for (const scenario of commands.cases)
  it('owned command migration: ' + scenario.name, () => {
    const store = prepareCapturedStore();
    const selected = withinStore(store.path, (sqlite) => {
      const row = sqlite
        .query<{ id: string; payload: string }, []>(
          'SELECT id,payload FROM command_journal ORDER BY seq LIMIT 1',
        )
        .get();
      expect(row).not.toBeNull();
      if (row === null) throw new Error('captured command missing');
      const payload = JSON.parse(row.payload) as {
        label: string;
        authorization: unknown;
        forward: unknown;
      };
      sqlite
        .query('UPDATE command_journal SET payload=?,inverse=?,preconditions=? WHERE id=?')
        .run(
          JSON.stringify({ ...payload, forward: scenario.before }),
          JSON.stringify(scenario.before),
          JSON.stringify(commands.preconditions.before),
          row.id,
        );
      return { id: row.id, payload };
    });
    installRename(store);
    withinStore(store.path, (sqlite) => {
      const row = sqlite
        .query<{ payload: string; inverse: string; preconditions: string }, [string]>(
          'SELECT payload,inverse,preconditions FROM command_journal WHERE id=?',
        )
        .get(selected.id);
      expect(row).not.toBeNull();
      if (row === null) throw new Error('migrated command missing');
      expect(JSON.parse(row.payload)).toEqual({ ...selected.payload, forward: scenario.after });
      expect(JSON.parse(row.inverse)).toEqual(scenario.after);
      expect(JSON.parse(row.preconditions)).toEqual(commands.preconditions.after);
    });
  });

for (const scenario of commands.corruptions)
  it('malformed command migration rolls back: ' + scenario.name, () => {
    const store = prepareCapturedStore();
    const id = withinStore(store.path, (sqlite) => {
      const row = sqlite
        .query<{ id: string; payload: string }, []>(
          'SELECT id,payload FROM command_journal ORDER BY seq LIMIT 1',
        )
        .get();
      if (row === null) throw new Error('captured command missing');
      const payload = JSON.parse(row.payload) as {
        label: string;
        authorization: unknown;
        forward: unknown;
      };
      sqlite
        .query('UPDATE command_journal SET payload=? WHERE id=?')
        .run(JSON.stringify({ ...payload, forward: scenario.command }), row.id);
      return row.id;
    });
    const before = snapshotStore(store.path);
    expectMigrationRefusal(
      () => {
        installRename(store);
      },
      'malformed rename history: command_journal/' + id + '/payload',
    );
    expect(snapshotStore(store.path)).toEqual(before);
  });

/** Drizzle retains native migration refusals in cause; inspect that native error, never its SQL excerpt. */
function expectMigrationRefusal(invoke: () => void, diagnostic: string): void {
  let failure: unknown;
  try {
    invoke();
  } catch (error: unknown) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  while (failure instanceof Error && failure.cause !== undefined) {
    expect(failure).not.toBeInstanceOf(AggregateError);
    failure = failure.cause;
  }
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw new Error('native migration refusal absent');
  expect(failure.message).toContain(diagnostic);
}
interface SchemaException {
  constraintLabels: { object: string; name: string }[];
  comments: { object: string; text: string }[];
  literals: { object: string; text: string }[];
}
const schemaExceptions = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../openspec/changes/wbs-work-packages/fixtures/schema-exceptions.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as SchemaException;
function readSchema(sqlite: Database) {
  return sqlite
    .query<{ type: string; name: string; tbl_name: string; sql: string }, []>(
      "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name",
    )
    .all();
}
/** Exact historical constraint names do not exempt the rest of their SQL statement. */
function findSchemaResiduals(name: string, statement: string): string[] {
  let sql = statement;
  for (const label of schemaExceptions.constraintLabels.filter((label) => label.object === name)) {
    sql = sql
      .replace('CONSTRAINT `' + label.name + '`', 'CONSTRAINT retained_label')
      .replace('CONSTRAINT ' + label.name + ' ', 'CONSTRAINT retained_label ');
  }
  for (const comment of schemaExceptions.comments.filter((comment) => comment.object === name))
    sql = sql.replace(comment.text, '');
  for (const literal of schemaExceptions.literals.filter((literal) => literal.object === name))
    sql = sql.replaceAll(literal.text, 'retained_literal');
  if (name === 'access_role' || name === 'access_grant')
    sql = sql.replaceAll("'project'", "'new_parent_namespace'");
  return sql.match(/\b(?:project|[a-z_]*project_[a-z_]+|[a-z_]+_project)\b/gi) ?? [];
}
it('the window migration renames every schema object and column while preserving exact historical label exceptions', () => {
  const store = prepareStore();
  const before = withinStore(store.path, (sqlite) =>
    readSchema(sqlite).map((row) => ({
      type: row.type,
      name: row.name,
      columns:
        row.type === 'table'
          ? sqlite
              .query<{ name: string }, []>('PRAGMA table_info("' + row.name + '")')
              .all()
              .map((column) => column.name)
          : [],
    })),
  );
  installRename(store);
  withinStore(store.path, (sqlite) => {
    const after = readSchema(sqlite);
    expect(
      after
        .map((row) => ({ type: row.type, name: row.name }))
        .sort((a, b) => (a.type + a.name).localeCompare(b.type + b.name)),
    ).toEqual(
      before
        .map((row) => ({
          type: row.type,
          name: row.name.replaceAll('project', 'work_package'),
        }))
        .sort((a, b) => (a.type + a.name).localeCompare(b.type + b.name)),
    );
    for (const row of before.filter((row) => row.type === 'table')) {
      const renamed = row.name.replaceAll('project', 'work_package');
      expect(
        sqlite
          .query<{ name: string }, []>('PRAGMA table_info("' + renamed + '")')
          .all()
          .map((column) => column.name),
      ).toEqual(row.columns.map((column) => column.replaceAll('project', 'work_package')));
    }
    expect(
      after.flatMap((row) =>
        findSchemaResiduals(row.name, row.sql).map((token) => row.name + ':' + token),
      ),
    ).toEqual([]);
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
it('a retained historical constraint label cannot hide an old schema reference', () => {
  const label = schemaExceptions.constraintLabels.at(0);
  if (label === undefined) throw new Error('required historical label absent');
  const statement =
    'CREATE TABLE example (CONSTRAINT `' +
    label.name +
    '` FOREIGN KEY (project_id) REFERENCES project(id))';
  expect(findSchemaResiduals(label.object, statement)).toEqual(['project_id', 'project']);
});
it('the renamed allocator view and insert trigger allocate the next unique code', () => {
  const store = prepareStore();
  installRename(store);
  withinStore(store.path, (sqlite) => {
    const before = sqlite
      .query('SELECT abbreviation FROM work_package_abbreviation ORDER BY abbreviation')
      .all();
    sqlite.run(fixture.allocatorSql);
    const next = sqlite
      .query<{ abbreviation: string }, []>(
        "SELECT abbreviation FROM work_package_abbreviation WHERE work_package_id='rename-next'",
      )
      .get();
    expect(next).not.toBeNull();
    expect(before).not.toContainEqual(next);
    expect(
      sqlite.query('SELECT ordinal FROM work_package_abbreviation_candidate').all(),
    ).toHaveLength(1);
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
it('all four retained blockage and parallel triggers enforce actual work package equality', () => {
  const store = prepareStore();
  installRename(store);
  withinStore(store.path, (sqlite) =>
    sqlite.run("UPDATE step_blockage_activation SET state='ENABLED' WHERE id=1"),
  );
  withinStore(store.path, (sqlite) => {
    for (const [table, column] of [
      ['step_blockage', 'blocked_at'],
      ['step_parallel', 'max_parallel'],
    ]) {
      expect(() =>
        sqlite.run(
          'INSERT INTO ' +
            table +
            '(work_item_id,step_id,' +
            column +
            ") VALUES('rename-remote','rename-step',2)",
        ),
      ).toThrow('work package mismatch');
      sqlite.run(
        'INSERT INTO ' +
          table +
          '(work_item_id,step_id,' +
          column +
          ") VALUES('rename-child','rename-step',2)",
      );
      expect(() => sqlite.run('UPDATE ' + table + " SET work_item_id='rename-remote'")).toThrow(
        'work package mismatch',
      );
      expect(sqlite.query('SELECT work_item_id FROM ' + table).all()).toEqual([
        { work_item_id: 'rename-child' },
      ]);
    }
  });
});
it('the rebuilt audit keeps all existing rows and append-only protection with current recovery vocabulary', () => {
  const store = prepareStore();
  installRename(store);
  withinStore(store.path, (sqlite) => {
    expect(() => sqlite.run('DELETE FROM organization_audit')).toThrow('append-only');
    expect(() => sqlite.run("UPDATE organization_audit SET actor_id='other'")).toThrow(
      'append-only',
    );
    sqlite.run(
      "INSERT INTO organization_audit(id,organization_id,actor_id,action,subject_kind,subject_id,detail,created_at) VALUES('new-recovery','rename-org','rename-owner','restricted_work_package_recovery','work_package','rename-p','{}',2)",
    );
    expect(sqlite.query('SELECT COUNT(*) AS n FROM organization_audit').get()).toEqual({ n: 2 });
    expect(
      sqlite
        .query(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='organization_audit' AND name NOT LIKE 'sqlite_%'",
        )
        .all(),
    ).toHaveLength(3);
    expect(
      sqlite
        .query(
          "SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='organization_audit'",
        )
        .all(),
    ).toHaveLength(2);
  });
});
interface DuplicateFixture {
  name: string;
  column: 'payload' | 'inverse' | 'preconditions';
  json: string;
}
const duplicates = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../openspec/changes/wbs-work-packages/fixtures/command-json-duplicates.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as DuplicateFixture[];
for (const scenario of duplicates)
  it('duplicate owned key migration rolls back: ' + scenario.name, () => {
    const store = prepareCapturedStore();
    const id = withinStore(store.path, (sqlite) => {
      const row = sqlite
        .query<{ id: string }, []>('SELECT id FROM command_journal ORDER BY seq LIMIT 1')
        .get();
      if (row === null) throw new Error('captured command missing');
      sqlite
        .query('UPDATE command_journal SET ' + scenario.column + '=? WHERE id=?')
        .run(scenario.json, row.id);
      return row.id;
    });
    const before = snapshotStore(store.path);
    expectMigrationRefusal(
      () => {
        installRename(store);
      },
      'malformed rename history: command_journal/' + id + '/' + scenario.column,
    );
    expect(snapshotStore(store.path)).toEqual(before);
  });

const integrity = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../openspec/changes/wbs-work-packages/fixtures/rename-integrity.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { corruptSql: string; recoverySql: string; recoveryAfter: unknown };
it('the final migration FK guard rolls back schema and ledger for a trusted dangling reference', () => {
  const store = prepareStore();
  withinStore(store.path, (sqlite) => {
    sqlite.run('PRAGMA foreign_keys=OFF');
    try {
      sqlite.run(integrity.corruptSql);
    } finally {
      sqlite.run('PRAGMA foreign_keys=ON');
    }
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toHaveLength(1);
  });
  const before = snapshotStore(store.path);
  expectMigrationRefusal(() => {
    installRename(store);
  }, 'rename foreign key violations: 1');
  expect(snapshotStore(store.path)).toEqual(before);
});
it('the historical recovery audit remaps only its vocabulary and preserves provenance and detail', () => {
  const store = prepareStore();
  withinStore(store.path, (sqlite) => {
    sqlite.run(integrity.recoverySql);
  });
  installRename(store);
  withinStore(store.path, (sqlite) => {
    expect(
      sqlite.query('SELECT * FROM organization_audit WHERE id=?').get('historical-recovery'),
    ).toEqual(integrity.recoveryAfter);
  });
});

it('real rename retains old transport frames while current publisher starts independent zero and one', async () => {
  const store = prepareCapturedStore(),
    oldKey = 'project:' + captured.workPackageId,
    currentKey = 'work-package:' + captured.workPackageId;
  const before = withinStore(store.path, (sqlite) => ({
    frames: sqlite.query('SELECT * FROM event_log ORDER BY id').all(),
    sequencers: sqlite.query('SELECT * FROM event_sequencer ORDER BY subscription').all(),
    history: sqlite.query('SELECT id FROM plan_event ORDER BY id').all(),
    old: sqlite
      .query<{ subscription: string; seq: number; message: string; created_at: number }, [string]>(
        'SELECT subscription,seq,message,created_at FROM event_log WHERE subscription=? ORDER BY seq',
      )
      .all(oldKey),
  }));
  expect(before.old.length).toBeGreaterThan(0);
  expect(before.old[0]?.seq).toBe(0);
  expect(before.sequencers).toContainEqual({ subscription: oldKey, next_seq: before.old.length });
  expect(before.history.length).toBe(captured.historyRows);
  installRename(store);
  expect(
    withinStore(store.path, (sqlite) => ({
      frames: sqlite.query('SELECT * FROM event_log ORDER BY id').all(),
      sequencers: sqlite.query('SELECT * FROM event_sequencer ORDER BY subscription').all(),
      history: sqlite.query('SELECT id FROM plan_event ORDER BY id').all(),
    })),
  ).toEqual({ frames: before.frames, sequencers: before.sequencers, history: before.history });
  const connection = openConnection(store.path),
    events = new DrizzleEventLogStore(connection.db, new WriteCoordinator());
  const pushed: { subscription: string; seq?: number; message: unknown }[] = [];
  const publisher = new GatewayBroadcaster({
    eventLog: new EventLogService(events),
    clock: clockOf({ now: () => 12345, newId: () => crypto.randomUUID() }),
    buffer: new ReplayBuffer({ maxPerSubscription: 100, maxAgeMs: 100000, now: () => 12345 }),
    push: {
      push: (payload) => {
        pushed.push(structuredClone(payload));
        return Promise.resolve({ delivered: 1 });
      },
    },
  });
  const oldRange = before.old.map((row) => ({
    subscription: row.subscription,
    seq: row.seq,
    message: JSON.parse(row.message) as unknown,
    createdAt: row.created_at,
  }));
  try {
    expect(await events.latestSeq(currentKey)).toBe(-1);
    expect(await events.rangeSince(currentKey, -1)).toEqual([]);
    expect(await events.rangeSince(oldKey, -1)).toEqual(oldRange);
    await publisher.publish(captured.workPackageId, { type: 'tree_replaced', workItems: [] });
    await publisher.publish(captured.workPackageId, { type: 'calendar_markers_changed' });
    expect(pushed).toEqual([
      { subscription: currentKey, seq: 0, message: { type: 'tree_replaced', workItems: [] } },
      { subscription: currentKey, seq: 1, message: { type: 'calendar_markers_changed' } },
    ]);
    expect(await publisher.latestSeq(captured.workPackageId)).toBe(1);
    expect(await events.rangeSince(currentKey, -1)).toEqual([
      {
        subscription: currentKey,
        seq: 0,
        message: { type: 'tree_replaced', workItems: [] },
        createdAt: 12345,
      },
      {
        subscription: currentKey,
        seq: 1,
        message: { type: 'calendar_markers_changed' },
        createdAt: 12345,
      },
    ]);
    expect(await events.rangeSince(oldKey, -1)).toEqual(oldRange);
    expect(
      withinStore(store.path, (sqlite) => ({
        frames: sqlite
          .query("SELECT * FROM event_log WHERE subscription LIKE 'project:%' ORDER BY id")
          .all(),
        sequencers: sqlite
          .query(
            "SELECT * FROM event_sequencer WHERE subscription LIKE 'project:%' ORDER BY subscription",
          )
          .all(),
        history: sqlite.query('SELECT id FROM plan_event ORDER BY id').all(),
      })),
    ).toEqual({ frames: before.frames, sequencers: before.sequencers, history: before.history });
  } finally {
    connection.close();
  }
});
