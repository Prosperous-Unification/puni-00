import { rejects } from 'node:assert/strict';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { decodeAdmission, organizationId, ownerId } from '../record-codecs';
import { createManifest, createRun, FixtureClock, unwrapReply } from '../testing/fixtures';
import { bootstrapSqliteStores, openSqliteStores } from './open-stores';
import { DOWN, MIGRATION } from './schema';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function options() {
  const directory = mkdtempSync(join(tmpdir(), 'runs-open-'));
  directories.push(directory);
  return {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
    maxBusyAttempts: 3,
    busyDelayMilliseconds: 1,
  };
}
test('open absent store creates neither file nor parent', async () => {
  const configuration = options();
  expect(existsSync(configuration.path)).toBe(false);
  await rejects(openSqliteStores(configuration), new RegExp('absent'));
  expect(existsSync(configuration.path)).toBe(false);
  const missing = { ...configuration, path: join(configuration.path, 'parent', 'runs.sqlite') };
  await rejects(openSqliteStores(missing), new RegExp('absent'));
  expect(existsSync(configuration.path)).toBe(false);
});
test('bootstrap refuses existing bytes and open retains organization capacity lease and ownership', async () => {
  const configuration = options();
  const stores = await bootstrapSqliteStores(configuration);
  const owner = unwrapReply(await stores.runs.acquireOwnership(ownerId('owner'), 0));
  unwrapReply(await stores.runs.retainManifest(owner, createManifest()));
  unwrapReply(await stores.runs.createRun(owner, createRun()));
  stores.close();
  const before = readFileSync(configuration.path);
  await rejects(bootstrapSqliteStores(configuration), new RegExp('exists'));
  expect(readFileSync(configuration.path)).toEqual(before);
  for (const changed of [
    { capacity: 2 },
    { leaseMilliseconds: 101 },
    { organizationId: organizationId('other') },
  ])
    await rejects(openSqliteStores({ ...configuration, ...changed }), new RegExp('configuration'));
  const reopened = await openSqliteStores(configuration);
  expect(reopened.ownership.owner).toEqual(owner);
  expect((await reopened.runs.readRun(createRun().runId)).run).toEqual(createRun());
  reopened.close();
});
test('open refuses corrupt unknown missing and malformed trusted state', async () => {
  for (const fault of [
    'bytes',
    'version',
    'table',
    'record',
    'hash',
    'down',
    'owner',
    'reservation',
  ]) {
    const configuration = options();
    const stores = await bootstrapSqliteStores(configuration);
    expect(stores.ownership.epoch).toBe(0);
    const owner = unwrapReply(await stores.runs.acquireOwnership(ownerId('owner'), 0));
    unwrapReply(await stores.runs.retainManifest(owner, createManifest()));
    unwrapReply(await stores.runs.createRun(owner, createRun()));
    stores.close();
    if (fault === 'bytes') writeFileSync(configuration.path, 'broken sqlite');
    else {
      const database = new Database(configuration.path);
      if (fault === 'version') database.run('UPDATE run_meta SET schema_version=99');
      if (fault === 'table') database.run('DROP TABLE run_reservation');
      if (fault === 'record') database.run(`UPDATE run_record SET record='{"version":99}'`);
      if (fault === 'hash') database.run(`UPDATE run_meta SET migration_hash='bad'`);
      if (fault === 'down') database.run(`UPDATE run_meta SET down_hash='bad'`);
      if (fault === 'owner') database.run(`UPDATE run_meta SET ownership='{}'`);
      if (fault === 'reservation') {
        database.run('PRAGMA foreign_keys=OFF');
        database.run("INSERT INTO run_reservation(attempt_id) VALUES ('orphan')");
      }
      database.close();
    }
    await rejects(openSqliteStores(configuration));
  }
});
test('open reports unreadable database and parent under a non-root uid', async () => {
  if (process.getuid?.() === 0) throw new Error('unreadability proofs require a non-root uid');
  for (const parent of [false, true]) {
    const configuration = options();
    (await bootstrapSqliteStores(configuration)).close();
    const path = parent ? join(configuration.path, '..') : configuration.path;
    expect(existsSync(configuration.path)).toBe(true);
    chmodSync(path, 0);
    try {
      await rejects(openSqliteStores(configuration), new RegExp('unreadable'));
    } finally {
      chmodSync(path, parent ? 0o700 : 0o600);
    }
  }
});
for (const [field, invalid, message] of [
  ['capacity', 0, 'invalid run store integer'],
  ['leaseMilliseconds', 0, 'invalid run store integer'],
  ['maxBusyAttempts', 0, 'invalid run store integer'],
  ['busyDelayMilliseconds', -1, 'invalid run store integer'],
  ['clock', {}, 'Validation failed'],
  ['path', '', 'run store path is required'],
] as const)
  test(`bootstrap and open validate required ${field}`, async () => {
    const configuration = options();
    expect(existsSync(configuration.path)).toBe(false);
    await rejects(
      bootstrapSqliteStores({ ...configuration, [field]: invalid }),
      new RegExp(message),
    );
    await rejects(openSqliteStores({ ...configuration, [field]: invalid }), new RegExp(message));
    expect(existsSync(configuration.path)).toBe(false);
  });

const corruptions: Record<string, string> = {
  'metadata owner epoch': `UPDATE run_meta SET ownership=json_set(ownership,'$.epoch',2)`,
  'metadata absent owner': `UPDATE run_meta SET ownership=json_set(ownership,'$.owner',json('null'))`,
  'metadata owner store': `UPDATE run_meta SET ownership=json_set(ownership,'$.owner.storeId','other')`,
  'metadata owner organization': `UPDATE run_meta SET ownership=json_set(ownership,'$.owner.organizationId','other')`,
  'manifest key': `UPDATE run_manifest SET digest='${'a'.repeat(64)}'`,
  'run key': `UPDATE run_record SET record=json_set(record,'$.runId','other'),initial_record=json_set(initial_record,'$.runId','other')`,
  'run manifest key': `UPDATE run_record SET record=json_set(record,'$.manifestDigest','${'a'.repeat(64)}'),initial_record=json_set(initial_record,'$.manifestDigest','${'a'.repeat(64)}')`,
  'run initial revision': `UPDATE run_record SET initial_record=json_set(initial_record,'$.revision',1)`,
  'run immutable identity': `UPDATE run_record SET initial_record=json_set(initial_record,'$.maxAttempts',4)`,
  'attempt key': `UPDATE run_attempt SET record=json_set(record,'$.attemptId','other'),admission=json_set(admission,'$.attemptId','other')`,
  'attempt run key': `UPDATE run_attempt SET record=json_set(record,'$.identity.runId','other'),admission=json_set(admission,'$.identity.runId','other')`,
  'attempt occurrence key': `UPDATE run_attempt SET occurrence_id='other'`,
  'attempt ordinal key': `UPDATE run_attempt SET ordinal=2`,
  'admission attempt identity': `UPDATE run_attempt SET admission=json_set(admission,'$.attemptId','other')`,
  'admission ordinal identity': `UPDATE run_attempt SET admission=json_set(admission,'$.ordinal',2)`,
  'admission operation identity': `UPDATE run_attempt SET admission=json_set(admission,'$.identity.operationKey','other')`,
  'missing reservation': `DELETE FROM run_reservation`,
};
for (const [fault, sql] of Object.entries(corruptions))
  test(`open rejects valid-shaped corrupt ${fault}`, async () => {
    const configuration = options();
    const stores = await bootstrapSqliteStores(configuration);
    expect(stores.ownership.epoch).toBe(0);
    const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('owner'), 0));
    unwrapReply(await stores.runs.retainManifest(ownership, createManifest()));
    const run = unwrapReply(await stores.runs.createRun(ownership, createRun()));
    const admission = {
      attemptId: 'attempt',
      identity: {
        version: 1,
        runId: run.runId,
        occurrenceId: 'occurrence',
        operationKey: 'operation',
      },
      ordinal: 1,
    };
    unwrapReply(
      await stores.runs.admitAttempt(
        { ownership, runId: run.runId, expectedRevision: 0 },
        decodeAdmission(admission),
      ),
    );
    expect((await stores.runs.readRun(run.runId)).capacity.reserved).toBe(1);
    stores.close();
    const database = new Database(configuration.path);
    try {
      database.run('PRAGMA foreign_keys=OFF');
      if (fault === 'manifest key')
        database
          .query('UPDATE run_manifest SET record=?')
          .run(JSON.stringify(createManifest({ credentialReferences: ['other'] })));
      else database.run(sql);
    } finally {
      database.close();
    }
    await rejects(openSqliteStores(configuration));
  });
for (const setting of ['foreign_keys', 'journal_mode', 'synchronous'])
  test(`open verifies selected ${setting} durability setting`, async () => {
    const configuration = options();
    (await bootstrapSqliteStores(configuration)).close();
    const descriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'run');
    if (descriptor === undefined) throw new Error('Database.run descriptor absent');
    const original = descriptor.value as Database['run'];
    function run(
      this: Database,
      sql: string,
      ...parameters: Parameters<Database['run']> extends [string, ...infer Rest] ? Rest : never
    ) {
      const fault =
        setting === 'foreign_keys'
          ? 'PRAGMA foreign_keys=OFF'
          : setting === 'journal_mode'
            ? 'PRAGMA journal_mode=DELETE'
            : 'PRAGMA synchronous=OFF';
      return original.call(this, sql.startsWith(`PRAGMA ${setting}=`) ? fault : sql, ...parameters);
    }
    Object.defineProperty(Database.prototype, 'run', { ...descriptor, value: run });
    try {
      expect(setting.length).toBeGreaterThan(0);
      await rejects(
        openSqliteStores(configuration),
        (cause: unknown) =>
          cause instanceof Error &&
          cause.cause instanceof Error &&
          cause.cause.message.includes('required foreign_keys WAL FULL'),
      );
    } finally {
      Object.defineProperty(Database.prototype, 'run', descriptor);
    }
  });
test('migration down pair removes exactly the provider schema', async () => {
  const configuration = options();
  (await bootstrapSqliteStores(configuration)).close();
  const database = new Database(configuration.path);
  try {
    database.run(DOWN);
    expect(database.query("SELECT name FROM sqlite_master WHERE name LIKE 'run_%'").all()).toEqual(
      [],
    );
    database.run(MIGRATION);
    expect(
      database
        .query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'run_%'")
        .all(),
    ).toHaveLength(5);
  } finally {
    database.close();
  }
});

for (const [column, sql] of Object.entries({
  capacity: '1.5',
  lease_milliseconds: '1.5',
  last_observed_at: '0.5',
}))
  test(`open rejects unsafe persisted ${column} before configuration matching`, async () => {
    const configuration = options();
    (await bootstrapSqliteStores(configuration)).close();
    const database = new Database(configuration.path);
    try {
      database.run(`UPDATE run_meta SET ${column}=${sql}`);
      expect(database.query('SELECT * FROM run_meta').all()).toHaveLength(1);
    } finally {
      database.close();
    }
    await rejects(
      openSqliteStores(configuration),
      (cause: unknown) =>
        cause instanceof Error &&
        cause.cause instanceof Error &&
        cause.cause.message === 'invalid run store integer',
    );
  });
test('open requires a successful SQLite integrity diagnostic', async () => {
  const configuration = options();
  (await bootstrapSqliteStores(configuration)).close();
  const descriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'query');
  if (descriptor === undefined) throw new Error('Database.query descriptor absent');
  const original = descriptor.value as Database['query'];
  function query(this: Database, sql: string) {
    return original.call(
      this,
      sql === 'PRAGMA quick_check' ? "SELECT 'injected corruption' AS quick_check" : sql,
    );
  }
  Object.defineProperty(Database.prototype, 'query', { ...descriptor, value: query });
  try {
    expect(existsSync(configuration.path)).toBe(true);
    await rejects(
      openSqliteStores(configuration),
      (cause: unknown) =>
        cause instanceof Error &&
        cause.cause instanceof Error &&
        cause.cause.message === 'corrupt sqlite database',
    );
  } finally {
    Object.defineProperty(Database.prototype, 'query', descriptor);
  }
});

test('bootstrap publication preserves an independently initialized winner', async () => {
  const configuration = options();
  const peer = options();
  (await bootstrapSqliteStores(peer)).close();
  const expected = readFileSync(peer.path);
  const descriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'run');
  if (descriptor === undefined) throw new Error('Database.run descriptor absent');
  const original = descriptor.value as Database['run'];
  let published = false;
  function run(
    this: Database,
    sql: string,
    ...parameters: Parameters<Database['run']> extends [string, ...infer Rest] ? Rest : never
  ) {
    const reply = original.call(this, sql, ...parameters);
    if (sql === 'PRAGMA wal_checkpoint(TRUNCATE)') {
      copyFileSync(peer.path, configuration.path);
      published = true;
    }
    return reply;
  }
  Object.defineProperty(Database.prototype, 'run', { ...descriptor, value: run });
  try {
    expect(existsSync(configuration.path)).toBe(false);
    await rejects(bootstrapSqliteStores(configuration), /exists/);
    expect(published).toBe(true);
    expect(readFileSync(configuration.path)).toEqual(expected);
  } finally {
    Object.defineProperty(Database.prototype, 'run', descriptor);
  }
});

test('bootstrap refuses inaccessible and absent parents without creating directories', async () => {
  if (process.getuid?.() === 0) throw new Error('unreadability proofs require a non-root uid');
  const configuration = options();
  const parent = join(configuration.path, '..');
  expect(existsSync(configuration.path)).toBe(false);
  chmodSync(parent, 0);
  try {
    await rejects(bootstrapSqliteStores(configuration), /unreadable/);
  } finally {
    chmodSync(parent, 0o700);
  }
  const missing = { ...configuration, path: join(parent, 'missing', 'runs.sqlite') };
  await rejects(bootstrapSqliteStores(missing), /absent/);
  expect(existsSync(join(parent, 'missing'))).toBe(false);
});
