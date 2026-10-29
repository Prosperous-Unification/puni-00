import { rejects } from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { organizationId, ownerId, storeId } from '../record-codecs';
import { acceptRuntimeReceipt, readRuntimeHistory } from '../runtime-history';
import { FixtureClock, unwrapReply } from '../testing/fixtures';
import { authorityReceipt } from '../testing/runtime-history-contract';
import {
  authorityRequest,
  runtimeHistoryContract,
  runtimePin,
  runtimeScope,
} from '../testing/runtime-history-contract';
import { bootstrapSqliteStores, openSqliteStores } from './open-stores';
import { DOWN_HASH, MIGRATION, MIGRATION_HASH, validateDatabase } from './schema';

export async function createRuntimeDatabaseFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'runtime-history-'));
  const clock = new FixtureClock();
  const options = {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock,
    maxBusyAttempts: 20,
    busyDelayMilliseconds: 1,
  };
  const stores = await bootstrapSqliteStores(options);
  let closing: Promise<void> | undefined;
  return {
    ...stores,
    options,
    directory,
    clock,
    disconnect: (): Promise<void> => stores.close(),
    close(): Promise<void> {
      if (closing !== undefined) return closing;
      closing = (async () => {
        await stores.close();
        rmSync(directory, { recursive: true, force: true });
      })();
      return closing;
    },
  };
}
runtimeHistoryContract('sqlite runtime history', createRuntimeDatabaseFixture);

test('genuine format1 is incompatible before journal mode changes and leaves complete bytes unchanged', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'runtime-format1-'));
  const path = join(directory, 'runs.sqlite');
  const clock = new FixtureClock();
  const database = new Database(path);
  try {
    database.run(MIGRATION);
    database.query('INSERT INTO run_meta VALUES (1,1,?,?,?,?,?,?)').run(
      MIGRATION_HASH,
      DOWN_HASH,
      JSON.stringify({
        storeId: storeId('original'),
        organizationId: organizationId('organization'),
        epoch: 0,
        owner: null,
      }),
      1,
      100,
      1000,
    );
    const content = new Uint8Array([1, 2]);
    const digest = createHash('sha256').update(content).digest('hex');
    database.query('INSERT INTO run_artifact VALUES (?,?,?)').run(
      digest,
      JSON.stringify({
        version: 1,
        digest,
        byteLength: 2,
        mediaType: 'application/octet-stream',
        retention: 'retain',
      }),
      content,
    );
    const schema = database.query('SELECT * FROM sqlite_schema ORDER BY name').all();
    const records = database.query('SELECT * FROM run_artifact').all();
    database.close();
    const before = readFileSync(path);
    await rejects(
      openSqliteStores({
        path,
        organizationId: organizationId('organization'),
        capacity: 1,
        leaseMilliseconds: 100,
        clock,
        maxBusyAttempts: 1,
        busyDelayMilliseconds: 0,
      }),
      (cause: unknown) => {
        expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(
          createHash('sha256').update(before).digest('hex'),
        );
        expect(cause).toMatchObject({ failure: 'incompatible' });
        return true;
      },
    );
    expect(readFileSync(path)).toEqual(before);
    const inspected = new Database(path, { readonly: true });
    try {
      expect(inspected.query('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'delete' });
      expect(inspected.query('SELECT * FROM sqlite_schema ORDER BY name').all()).toEqual(schema);
      expect(inspected.query('SELECT * FROM run_artifact').all()).toEqual(records);
    } finally {
      inspected.close();
    }
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('runtime transaction abort preserves scope revision rows and retained marker counts', async () => {
  const stores = await createRuntimeDatabaseFixture();
  const database = new Database(stores.options.path);
  try {
    const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
    unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
    const before = await stores.runs.readRuntimeScope(runtimeScope);
    database.run(
      "CREATE TRIGGER fail_runtime_marker BEFORE UPDATE ON run_format BEGIN SELECT RAISE(ABORT,'injected runtime marker fault'); END",
    );
    await rejects(
      stores.runs.stageRuntimeRequest(
        { ownership, scope: runtimeScope, expectedRevision: 0 },
        authorityRequest(),
      ),
      /injected runtime marker fault/,
    );
    expect(await stores.runs.readRuntimeScope(runtimeScope)).toEqual(before);
    expect(database.query('SELECT * FROM run_runtime_intent').all()).toEqual([]);
    expect(
      database.query('SELECT scope_count,intent_count,acceptance_count FROM run_format').get(),
    ).toEqual({ scope_count: 1, intent_count: 0, acceptance_count: 0 });
    await stores.disconnect();
    const reopened = await openSqliteStores(stores.options);
    try {
      expect(await reopened.runs.readRuntimeScope(runtimeScope)).toEqual(before);
    } finally {
      await reopened.close();
    }
  } finally {
    database.close();
    await stores.close();
  }
});

import { createHash } from 'node:crypto';

import { createManifest, createRun } from '../testing/fixtures';
import { runtimeEvidence } from '../testing/runtime-history-contract';
import { MIGRATIONS } from './format';

const runtimeFaults = {
  'missing marker': 'DELETE FROM run_format',
  'extra marker':
    'PRAGMA ignore_check_constraints=ON; INSERT INTO run_format SELECT 2,bundle_hash,scope_count,intent_count,acceptance_count FROM run_format; PRAGMA ignore_check_constraints=OFF',
  'malformed marker count': 'UPDATE run_format SET intent_count=0.5',
  'lost scope concealed': 'DELETE FROM run_runtime_scope; UPDATE run_format SET scope_count=0',
  'lost whole runtime family':
    'DELETE FROM run_runtime_acceptance; DELETE FROM run_runtime_intent; DELETE FROM run_runtime_scope',
  'lost acceptance counted': 'DELETE FROM run_runtime_acceptance',
  'lost acceptance concealed':
    'DELETE FROM run_runtime_acceptance; UPDATE run_format SET acceptance_count=0',
  'lost intent concealed': 'DELETE FROM run_runtime_intent; UPDATE run_format SET intent_count=0',
  'scope physical key': "UPDATE run_runtime_scope SET scope_key='borrowed'",
  'intent physical command': "UPDATE run_runtime_intent SET command_id='borrowed'",
  'intent physical scope': "UPDATE run_runtime_intent SET scope_key='borrowed'",
  'acceptance physical command': "UPDATE run_runtime_acceptance SET command_id='borrowed'",
  'acceptance physical scope': "UPDATE run_runtime_acceptance SET scope_key='borrowed'",
  'scope ledger': "UPDATE run_runtime_scope SET pin=json_set(pin,'$.ledgerId','borrowed')",
  'scope organization':
    "UPDATE run_runtime_scope SET pin=json_set(pin,'$.scope.organizationId','borrowed')",
  'scope malformed': "UPDATE run_runtime_scope SET pin='{'",
  'scope unknown field': "UPDATE run_runtime_scope SET pin=json_set(pin,'$.ignored',true)",
  'final revision': 'UPDATE run_runtime_scope SET revision=3',
  'intent revision gap':
    "UPDATE run_runtime_intent SET record=json_set(record,'$.stagedRevision',2)",
  'acceptance revision gap':
    "UPDATE run_runtime_acceptance SET record=json_set(record,'$.acceptedRevision',3)",
  'intent digest':
    "UPDATE run_runtime_intent SET record=json_set(record,'$.requestDigest','" +
    'b'.repeat(64) +
    "')",
  'consistent false digest':
    "UPDATE run_runtime_intent SET record=json_set(record,'$.requestDigest','" +
    'b'.repeat(64) +
    "'); UPDATE run_runtime_acceptance SET record=json_set(record,'$.requestDigest','" +
    'b'.repeat(64) +
    "')",
  'acceptance digest':
    "UPDATE run_runtime_acceptance SET record=json_set(record,'$.requestDigest','" +
    'b'.repeat(64) +
    "')",
  'current local label':
    "UPDATE run_runtime_intent SET record=json_set(record,'$.localOwner.ownerId','borrowed-local')",
  'future local epoch':
    "UPDATE run_runtime_intent SET record=json_set(record,'$.localOwner.epoch',5)",
  'intent canonical whitespace':
    "UPDATE run_runtime_intent SET record=json_set(record,'$.canonicalRequest',' ' || json_extract(record,'$.canonicalRequest'))",
};
for (const [fault, mutation] of Object.entries(runtimeFaults))
  test(`trusted runtime ${fault} throws before absence or mutation and reopen`, async () => {
    const stores = await createRuntimeDatabaseFixture();
    const database = new Database(stores.options.path);
    try {
      const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
      unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
      const intent = unwrapReply(
        await stores.runs.stageRuntimeRequest(
          { ownership, scope: runtimeScope, expectedRevision: 0 },
          authorityRequest(),
        ),
      );
      unwrapReply(
        await stores.runs.recordRuntimeAcceptance(
          { ownership, scope: runtimeScope, expectedRevision: 1 },
          { intent, evidence: runtimeEvidence },
        ),
      );
      database.run('PRAGMA foreign_keys=OFF');
      database.run(mutation);
      await rejects(stores.runs.readRuntimeScope({ ...runtimeScope, personId: 'never-pinned' }));
      await rejects(
        stores.runs.stageRuntimeRequest(
          { ownership, scope: runtimeScope, expectedRevision: 2 },
          authorityRequest('next', 1),
        ),
      );
      await stores.disconnect();
      await rejects(openSqliteStores(stores.options));
    } finally {
      database.close();
      await stores.close();
    }
  });

for (const table of [
  'run_format',
  'run_runtime_scope',
  'run_runtime_intent',
  'run_runtime_acceptance',
])
  test(`empty ${table} declaration is validated before it contains rows`, async () => {
    const stores = await createRuntimeDatabaseFixture();
    const database = new Database(stores.options.path);
    try {
      database.run(`ALTER TABLE ${table} ADD COLUMN ignored TEXT`);
      await stores.disconnect();
      await rejects(openSqliteStores(stores.options), { failure: 'corrupt' });
    } finally {
      database.close();
      await stores.close();
    }
  });

for (const fault of ['first forward hash', 'first down hash', 'complete bundle hash'] as const)
  test(`current format ${fault} retains incompatible failure`, async () => {
    const stores = await createRuntimeDatabaseFixture();
    const database = new Database(stores.options.path);
    try {
      database.run(
        fault === 'complete bundle hash'
          ? "UPDATE run_format SET bundle_hash='changed'"
          : `UPDATE run_meta SET ${fault === 'first forward hash' ? 'migration_hash' : 'down_hash'}='changed'`,
      );
      await stores.disconnect();
      await rejects(openSqliteStores(stores.options), { failure: 'incompatible' });
    } finally {
      database.close();
      await stores.close();
    }
  });

test('retained generation progression validates canonical bytes with their independent digest', async () => {
  const stores = await createRuntimeDatabaseFixture();
  const database = new Database(stores.options.path);
  try {
    const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
    unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
    const first = unwrapReply(
      await stores.runs.stageRuntimeRequest(
        { ownership, scope: runtimeScope, expectedRevision: 0 },
        authorityRequest(),
      ),
    );
    unwrapReply(
      await stores.runs.recordRuntimeAcceptance(
        { ownership, scope: runtimeScope, expectedRevision: 1 },
        { intent: first, evidence: runtimeEvidence },
      ),
    );
    const second = unwrapReply(
      await stores.runs.stageRuntimeRequest(
        { ownership, scope: runtimeScope, expectedRevision: 2 },
        authorityRequest('next', 1),
      ),
    );
    const canonicalRequest = authorityRequest('next', null);
    database.query('UPDATE run_runtime_intent SET record=? WHERE command_id=?').run(
      JSON.stringify({
        ...second,
        canonicalRequest,
        requestDigest: createHash('sha256').update(canonicalRequest).digest('hex'),
      }),
      second.commandId,
    );
    await rejects(stores.runs.readRuntimeScope(runtimeScope), /runtime generation progression/);
  } finally {
    database.close();
    await stores.close();
  }
});

test('current owner fencing precedes corrupt retained runtime rows for all mutations', async () => {
  const stores = await createRuntimeDatabaseFixture();
  const database = new Database(stores.options.path);
  try {
    const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
    unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
    const intent = unwrapReply(
      await stores.runs.stageRuntimeRequest(
        { ownership, scope: runtimeScope, expectedRevision: 0 },
        authorityRequest(),
      ),
    );
    database.run('CREATE TEMP TABLE restored_format AS SELECT * FROM run_format');
    database.run('DELETE FROM run_format');
    stores.clock.advance(100);
    const guard = { ownership, scope: runtimeScope, expectedRevision: 1 };
    expect(await stores.runs.pinRuntimeScope(ownership, runtimePin)).toEqual({
      kind: 'refused',
      reason: 'owner_stale',
    });
    expect(await stores.runs.stageRuntimeRequest(guard, authorityRequest('next'))).toEqual({
      kind: 'refused',
      reason: 'owner_stale',
    });
    expect(
      await stores.runs.recordRuntimeAcceptance(guard, { intent, evidence: runtimeEvidence }),
    ).toEqual({ kind: 'refused', reason: 'owner_stale' });
    await rejects(
      stores.runs.acquireOwnership(ownerId('local-B'), 1),
      /corrupt runtime format marker/,
    );
    database.query('INSERT INTO run_format SELECT * FROM restored_format').run();
    const current = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-B'), 1));
    database.run('DELETE FROM run_format');
    await rejects(stores.runs.pinRuntimeScope(current, runtimePin));
  } finally {
    database.close();
    await stores.close();
  }
});

test('unused new down restores exact original physical schema and old records', async () => {
  const stores = await createRuntimeDatabaseFixture();
  const database = new Database(stores.options.path);
  const reference = new Database(':memory:');
  try {
    reference.run(MIGRATION);
    const originalSchema = reference
      .query(
        "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index') ORDER BY type,name",
      )
      .all();
    const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
    unwrapReply(await stores.runs.retainManifest(ownership, createManifest()));
    unwrapReply(await stores.runs.createRun(ownership, createRun()));
    const retained = database.query('SELECT * FROM run_record').all();
    const meta = database
      .query<
        {
          singleton: number;
          schema_version: number;
          migration_hash: string;
          down_hash: string;
          ownership: string;
          capacity: number;
          lease_milliseconds: number;
          last_observed_at: number;
        },
        []
      >('SELECT * FROM run_meta')
      .get();
    if (meta === null) throw new Error('fixture meta missing');
    executeExecutionDown(database);
    executeRuntimeDown(database);
    expect(
      database
        .query(
          "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index') ORDER BY type,name",
        )
        .all(),
    ).toEqual(originalSchema);
    expect(database.query('SELECT * FROM run_record').all()).toEqual(retained);
    expect(database.query('SELECT * FROM run_meta').get()).toEqual({ ...meta, schema_version: 1 });
  } finally {
    reference.close();
    database.close();
    await stores.close();
  }
});

for (const fault of [
  'pin',
  'intent',
  'acceptance',
  'scope counter',
  'intent counter',
  'acceptance counter',
  'missing marker',
  'partial loss',
  'missing metadata',
  'old metadata',
  'malformed counter',
] as const)
  test(`new down refuses ${fault} without deleting runtime tables`, async () => {
    const stores = await createRuntimeDatabaseFixture();
    const database = new Database(stores.options.path);
    try {
      const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
      if (['pin', 'intent', 'acceptance', 'partial loss'].includes(fault))
        unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
      if (fault === 'intent' || fault === 'acceptance') {
        const intent = unwrapReply(
          await stores.runs.stageRuntimeRequest(
            { ownership, scope: runtimeScope, expectedRevision: 0 },
            authorityRequest(),
          ),
        );
        if (fault === 'acceptance')
          unwrapReply(
            await stores.runs.recordRuntimeAcceptance(
              { ownership, scope: runtimeScope, expectedRevision: 1 },
              { intent, evidence: runtimeEvidence },
            ),
          );
      }
      executeExecutionDown(database);
      if (['scope counter', 'intent counter', 'acceptance counter'].includes(fault))
        database.run(`UPDATE run_format SET ${fault.split(' ')[0]}_count=1`);
      if (fault === 'missing marker') database.run('DELETE FROM run_format');
      if (fault === 'partial loss') database.run('DELETE FROM run_runtime_scope');
      if (fault === 'missing metadata') database.run('DELETE FROM run_meta');
      if (fault === 'old metadata') database.run('UPDATE run_meta SET schema_version=1');
      if (fault === 'malformed counter') database.run('UPDATE run_format SET scope_count=0.5');
      const capture = () => ({
        schema: database
          .query('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name')
          .all(),
        tables: database
          .query<{ name: string }, []>(
            "SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'run_%' ORDER BY name",
          )
          .all()
          .map((table) => ({
            name: table.name,
            rows: database
              .query<Record<string, unknown>, []>(`SELECT * FROM ${table.name} ORDER BY rowid`)
              .all(),
          })),
      });
      const before = capture();
      expect(() => {
        executeRuntimeDown(database);
      }).toThrow();
      expect(capture()).toEqual(before);
      expect(
        database
          .query(
            "SELECT name FROM sqlite_schema WHERE name IN ('run_format','run_runtime_scope','run_runtime_intent','run_runtime_acceptance')",
          )
          .all(),
      ).toHaveLength(4);
    } finally {
      database.close();
      await stores.close();
    }
  });

/** Produces genuine format2 before injecting faults into the unchanged 0002 rollback guard. */
function executeExecutionDown(database: Database): void {
  database.run('BEGIN IMMEDIATE');
  try {
    validateDatabase(database);
    for (const statement of [
      ...MIGRATIONS[3].down.split('--> statement-breakpoint'),
      ...MIGRATIONS[2].down.split('--> statement-breakpoint'),
    ])
      if (statement.trim().length > 0) database.run(statement.trim());
    database.run('COMMIT');
  } catch (cause) {
    database.run('ROLLBACK');
    throw cause;
  }
}

/** Isolated raw SQL guard fixture: complete trimmed statements stop and roll back on the first error. This intentionally omits the full-format prevalidation required by a supported caller. */
function executeRuntimeDown(database: Database): void {
  database.run('BEGIN IMMEDIATE');
  try {
    for (const statement of MIGRATIONS[1].down.split('--> statement-breakpoint'))
      if (statement.trim().length > 0) database.run(statement.trim());
    database.run('COMMIT');
  } catch (cause) {
    database.run('ROLLBACK');
    throw cause;
  }
}

test('intermediate required migration SQL failure refuses bootstrap before publication', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'runtime-bootstrap-fault-'));
  const options = {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
    maxBusyAttempts: 1,
    busyDelayMilliseconds: 0,
  };
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Preserve and restore the prototype method; the fixture invokes it with its original receiver.
  const original = Database.prototype.run;
  const declaration = MIGRATIONS[1].forwardStatements.find((statement) =>
    statement.startsWith('CREATE TABLE run_runtime_intent'),
  );
  if (declaration === undefined) throw new Error('fixture intent declaration absent');
  Database.prototype.run = function (sql, ...parameters) {
    return original.call(
      this,
      sql.replace(declaration, "INSERT INTO run_format VALUES (1,'injected',-1,0,0);"),
      ...parameters,
    );
  };
  try {
    await rejects(bootstrapSqliteStores(options));
    expect(existsSync(options.path)).toBe(false);
    expect(readdirSync(directory)).toEqual([]);
  } finally {
    Database.prototype.run = original;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('trusted runtime second pending event refuses complete otherwise valid rows', async () => {
  const stores = await createRuntimeDatabaseFixture();
  const database = new Database(stores.options.path);
  try {
    const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
    unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
    const first = unwrapReply(
      await stores.runs.stageRuntimeRequest(
        { ownership, scope: runtimeScope, expectedRevision: 0 },
        authorityRequest(),
      ),
    );
    const canonicalRequest = authorityRequest('second');
    const second = {
      ...first,
      commandId: 'second',
      canonicalRequest,
      requestDigest: createHash('sha256').update(canonicalRequest).digest('hex'),
      stagedRevision: 2,
    };
    database
      .query(
        'INSERT INTO run_runtime_intent(command_id,scope_key,record) SELECT ?,scope_key,? FROM run_runtime_scope',
      )
      .run('second', JSON.stringify(second));
    database.run('UPDATE run_runtime_scope SET revision=2');
    database.run('UPDATE run_format SET intent_count=2');
    await rejects(stores.runs.readRuntimeScope(runtimeScope), /runtime pending command/);
  } finally {
    database.close();
    await stores.close();
  }
});

test('physical reference refuses an intermediate required declaration CHECK failure', () => {
  const driver = `
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { Database } from 'bun:sqlite';
const forward = readFileSync(${JSON.stringify(new URL('./migrations/0002-runtime-authority/migration.sql', import.meta.url).pathname)}, 'utf8');
const declaration = forward.split('--> statement-breakpoint').map(statement => statement.trim()).find(statement => statement.startsWith('CREATE TABLE run_runtime_intent'));
if (declaration === undefined) throw new Error('fixture declaration absent');
const original = Database.prototype.run;
Database.prototype.run = function(sql, ...parameters) {
 return original.call(this, sql.replace(declaration, "INSERT INTO run_format VALUES (1,'injected',-1,0,0);"), ...parameters);
};
let rejected = false;
try { await import(${JSON.stringify(new URL('./schema.ts', import.meta.url).pathname)}); }
catch (cause) { if (!(cause instanceof Error) || !cause.message.includes('CHECK constraint')) throw cause; rejected = true; }
finally { Database.prototype.run = original; }
assert.equal(rejected, true, 'physical reference must reject the intermediate required SQL failure');
`;
  const child = Bun.spawnSync([process.execPath, '-e', driver], {
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 15000,
  });
  expect(new TextDecoder().decode(child.stderr)).toBe('');
  expect(child.exitCode).toBe(0);
}, 20000);

test('verified SQLite receipt reads actual JSON artifacts before acceptance SQL and verifies history after reopen', async () => {
  const stores = await createRuntimeDatabaseFixture();
  const database = new Database(stores.options.path, { readonly: true });
  try {
    const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
    unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
    const guard = { ownership, scope: runtimeScope, expectedRevision: 0 };
    const intent = unwrapReply(await stores.runs.stageRuntimeRequest(guard, authorityRequest()));
    const wrong = await stores.artifacts.retainArtifact(
      new TextEncoder().encode(JSON.stringify({ ...authorityReceipt(intent), schemaVersion: 2 })),
      'application/json',
    );
    if (wrong.kind !== 'retained') throw new Error('fixture artifact refused');
    await rejects(
      acceptRuntimeReceipt(
        stores.runs,
        stores.artifacts,
        { ...guard, expectedRevision: 1 },
        intent,
        wrong.reference,
      ),
      /runtime receipt schema/,
    );
    expect(database.query('SELECT * FROM run_runtime_acceptance').all()).toEqual([]);
    const retained = await stores.artifacts.retainArtifact(
      new TextEncoder().encode(JSON.stringify(authorityReceipt(intent))),
      'application/json',
    );
    if (retained.kind !== 'retained') throw new Error('fixture artifact refused');
    expect(
      (
        await acceptRuntimeReceipt(
          stores.runs,
          stores.artifacts,
          { ...guard, expectedRevision: 1 },
          intent,
          retained.reference,
        )
      ).kind,
    ).toBe('applied');
    await stores.disconnect();
    const reopened = await openSqliteStores(stores.options);
    try {
      expect(
        await readRuntimeHistory(reopened.runs, reopened.artifacts, runtimeScope),
      ).toMatchObject({ revision: 2, acceptances: [{ evidence: retained.reference }] });
    } finally {
      await reopened.close();
    }
  } finally {
    database.close();
    await stores.close();
  }
});

test('bootstrap retains the complete named forward and down bundle identity', async () => {
  const stores = await createRuntimeDatabaseFixture();
  const database = new Database(stores.options.path, { readonly: true });
  try {
    const identities = [
      '0001-run-store',
      '0002-runtime-authority',
      '0003-execution-history',
      '0004-runtime-recovery',
    ].map((name) => [
      name,
      ...['migration.sql', 'down.sql'].map((file) =>
        createHash('sha256')
          .update(readFileSync(new URL(`./migrations/${name}/${file}`, import.meta.url)))
          .digest('hex'),
      ),
    ]);
    const expected = createHash('sha256')
      .update(JSON.stringify(['run-store-format', 4, identities]), 'utf8')
      .digest('hex');
    expect(database.query('SELECT bundle_hash FROM run_format').get()).toEqual({
      bundle_hash: expected,
    });
  } finally {
    database.close();
    await stores.close();
  }
});

for (const surface of ['read', 'mutation', 'reopen'] as const)
  test(`retained decreasing local epochs refuse ${surface} without changing complete history`, async () => {
    const stores = await createRuntimeDatabaseFixture();
    const database = new Database(stores.options.path);
    try {
      unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
      stores.clock.advance(100);
      const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-B'), 1));
      unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
      for (const [commandId, expectedGeneration, expectedRevision] of [
        ['request-0', null, 0],
        ['request-1', 1, 2],
      ] as const) {
        const intent = unwrapReply(
          await stores.runs.stageRuntimeRequest(
            { ownership, scope: runtimeScope, expectedRevision },
            authorityRequest(commandId, expectedGeneration),
          ),
        );
        const artifact = await stores.artifacts.retainArtifact(
          new TextEncoder().encode(JSON.stringify(authorityReceipt(intent))),
          'application/json',
        );
        if (artifact.kind !== 'retained') throw new Error('fixture receipt refused');
        unwrapReply(
          await acceptRuntimeReceipt(
            stores.runs,
            stores.artifacts,
            { ownership, scope: runtimeScope, expectedRevision: expectedRevision + 1 },
            intent,
            artifact.reference,
          ),
        );
      }
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({
        revision: 4,
        grant: {
          localEpoch: 2,
          commandId: 'request-1',
          authority: { ownerId: 'receiver-owner', generation: 2 },
        },
      });
      database.run(
        "UPDATE run_runtime_intent SET record=json_set(record,'$.localOwner.epoch',1) WHERE command_id='request-1'",
      );
      const before = captureRuntimeDatabase(database);
      if (surface === 'read')
        await rejects(
          stores.runs.readRuntimeScope(runtimeScope),
          /corrupt runtime local epoch progression/,
        );
      if (surface === 'mutation')
        await rejects(
          stores.runs.stageRuntimeRequest(
            { ownership, scope: runtimeScope, expectedRevision: 4 },
            authorityRequest('request-2', 2),
          ),
          /corrupt runtime local epoch progression/,
        );
      if (surface === 'reopen') {
        await stores.disconnect();
        await rejects(
          async () => {
            const reopened = await openSqliteStores(stores.options);
            await reopened.close();
          },
          (cause: unknown) => {
            expect(cause).toMatchObject({
              failure: 'corrupt',
              cause: { message: 'corrupt runtime local epoch progression' },
            });
            return true;
          },
        );
      }
      expect(captureRuntimeDatabase(database)).toEqual(before);
    } finally {
      database.close();
      await stores.close();
    }
  });

function captureRuntimeDatabase(database: Database) {
  return {
    schema: database
      .query(
        'SELECT type,name,tbl_name,sql FROM sqlite_schema UNION ALL SELECT type,name,tbl_name,sql FROM sqlite_temp_schema ORDER BY type,name',
      )
      .all(),
    tables: database
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'run_%' ORDER BY name",
      )
      .all()
      .map((table) => ({
        name: table.name,
        rows: database
          .query<Record<string, unknown>, []>(`SELECT * FROM ${table.name} ORDER BY rowid`)
          .all(),
      })),
  };
}

/** Private demonstration of complete-format validation and fail-fast down in one write transaction; this is not an operator-facing rollback API. */
function executeValidatedRuntimeDown(database: Database): void {
  database.run('BEGIN IMMEDIATE');
  try {
    // Proof: R1F02 removing this actual validation call let wrong-bundle and altered-empty-schema callers delete tables; both missing-rejection tests failed, and exact restoration passed.
    validateDatabase(database);
    for (const statement of [
      ...MIGRATIONS[3].down.split('--> statement-breakpoint'),
      ...MIGRATIONS[2].down.split('--> statement-breakpoint'),
      ...MIGRATIONS[1].down.split('--> statement-breakpoint'),
    ])
      if (statement.trim().length > 0) database.run(statement.trim());
    database.run('COMMIT');
  } catch (cause) {
    database.run('ROLLBACK');
    throw cause;
  }
}

for (const fault of ['wrong bundle', 'altered empty schema'] as const)
  test(`validated down caller refuses ${fault} before deleting schema or records`, async () => {
    const stores = await createRuntimeDatabaseFixture();
    const database = new Database(stores.options.path);
    try {
      const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
      unwrapReply(await stores.runs.retainManifest(ownership, createManifest()));
      unwrapReply(await stores.runs.createRun(ownership, createRun()));
      if (fault === 'wrong bundle') database.run("UPDATE run_format SET bundle_hash='changed'");
      else database.run('ALTER TABLE run_runtime_scope ADD COLUMN ignored TEXT');
      const before = captureRuntimeDatabase(database);
      expect(() => {
        executeValidatedRuntimeDown(database);
      }).toThrow(
        fault === 'wrong bundle'
          ? /incompatible sqlite format bundle hash/
          : /corrupt sqlite physical schema/,
      );
      expect(captureRuntimeDatabase(database)).toEqual(before);
    } finally {
      database.close();
      await stores.close();
    }
  });

test('validated down caller restores unused format1 declarations and all old records', async () => {
  const stores = await createRuntimeDatabaseFixture();
  const database = new Database(stores.options.path);
  const reference = new Database(':memory:');
  try {
    const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
    unwrapReply(await stores.runs.retainManifest(ownership, createManifest()));
    unwrapReply(await stores.runs.createRun(ownership, createRun()));
    for (const statement of MIGRATIONS[0].forwardStatements) reference.run(statement);
    const before = captureRuntimeDatabase(database);
    executeValidatedRuntimeDown(database);
    const after = captureRuntimeDatabase(database);
    expect(after.schema).toEqual(captureRuntimeDatabase(reference).schema);
    expect(after.tables).toEqual(
      before.tables
        .filter(
          (table) =>
            !table.name.startsWith('run_recovery_') &&
            ![
              'run_format',
              'run_runtime_scope',
              'run_runtime_intent',
              'run_runtime_acceptance',
            ].includes(table.name),
        )
        .map((table) =>
          table.name === 'run_meta'
            ? { ...table, rows: table.rows.map((metadata) => ({ ...metadata, schema_version: 1 })) }
            : table,
        ),
    );
  } finally {
    reference.close();
    database.close();
    await stores.close();
  }
});

test('validated down caller rolls back its guard when retained runtime use forbids down', async () => {
  const stores = await createRuntimeDatabaseFixture();
  const database = new Database(stores.options.path);
  try {
    const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
    unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
    const before = captureRuntimeDatabase(database);
    expect(() => {
      executeValidatedRuntimeDown(database);
    }).toThrow(/CHECK constraint/);
    expect(captureRuntimeDatabase(database)).toEqual(before);
  } finally {
    database.close();
    await stores.close();
  }
});

const EXECUTION_PREVIOUS_FORMAT_HASH =
  'b5b2b877ebe8b0e33765d2bb6d464e7d3ac0bcebc773807706e40ca5747f93b6';
test('genuine format2 is incompatible before journal changes and preserves every original byte', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'execution-format2-'));
  const path = join(directory, 'runs.sqlite');
  const database = new Database(path);
  const clock = new FixtureClock();
  try {
    for (const migration of MIGRATIONS.slice(0, 2))
      for (const statement of migration.forwardStatements) database.run(statement);
    database.query('INSERT INTO run_meta VALUES (1,2,?,?,?,?,?,?)').run(
      MIGRATION_HASH,
      DOWN_HASH,
      JSON.stringify({
        storeId: storeId('format2'),
        organizationId: organizationId('organization'),
        epoch: 0,
        owner: null,
      }),
      1,
      100,
      1000,
    );
    database.query('INSERT INTO run_format VALUES (1,?,0,0,0)').run(EXECUTION_PREVIOUS_FORMAT_HASH);
    expect(database.query('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'delete' });
    database.close();
    const before = readFileSync(path),
      names = readdirSync(directory).sort();
    await rejects(
      async () => {
        const opened = await openSqliteStores({
          path,
          organizationId: organizationId('organization'),
          capacity: 1,
          leaseMilliseconds: 100,
          clock,
          maxBusyAttempts: 1,
          busyDelayMilliseconds: 0,
        });
        await opened.close();
      },
      (cause: unknown) => {
        expect(cause).toMatchObject({ failure: 'incompatible' });
        return true;
      },
    );
    expect(readFileSync(path)).toEqual(before);
    expect(readdirSync(directory).sort()).toEqual(names);
    const inspected = new Database(path, { readonly: true });
    try {
      expect(inspected.query('SELECT schema_version FROM run_meta').get()).toEqual({
        schema_version: 2,
      });
      expect(inspected.query('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'delete' });
    } finally {
      inspected.close();
    }
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const history of ['generic run', 'authority pending', 'authority accepted'] as const)
  test(
    'format3 down preserves compatible ' + history + ' and restores exact format2 identity',
    async () => {
      const stores = await createRuntimeDatabaseFixture();
      const database = new Database(stores.options.path);
      try {
        const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('down-owner'), 0));
        unwrapReply(await stores.runs.retainManifest(ownership, createManifest()));
        unwrapReply(await stores.runs.createRun(ownership, createRun()));
        if (history !== 'generic run') {
          unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
          const intent = unwrapReply(
            await stores.runs.stageRuntimeRequest(
              { ownership, scope: runtimeScope, expectedRevision: 0 },
              authorityRequest(),
            ),
          );
          if (history === 'authority accepted')
            unwrapReply(
              await stores.runs.recordRuntimeAcceptance(
                { ownership, scope: runtimeScope, expectedRevision: 1 },
                { intent, evidence: runtimeEvidence },
              ),
            );
        }
        const before = captureRuntimeDatabase(database);
        executeExecutionDown(database);
        const after = captureRuntimeDatabase(database);
        expect(after.schema).toEqual(
          before.schema.filter(
            (entry) =>
              !(
                typeof entry === 'object' &&
                entry !== null &&
                'tbl_name' in entry &&
                String(entry.tbl_name).startsWith('run_recovery_')
              ),
          ),
        );
        expect(after.tables).toEqual(
          before.tables
            .filter((table) => !table.name.startsWith('run_recovery_'))
            .map((table) =>
              table.name === 'run_meta'
                ? { ...table, rows: table.rows.map((row) => ({ ...row, schema_version: 2 })) }
                : table.name === 'run_format'
                  ? {
                      ...table,
                      rows: table.rows.map((row) => ({
                        ...row,
                        bundle_hash: EXECUTION_PREVIOUS_FORMAT_HASH,
                      })),
                    }
                  : table,
            ),
        );
        expect(database.inTransaction).toBe(false);
      } finally {
        database.close();
        await stores.close();
      }
    },
  );

import {
  admitExecution as admitExecutionForDown,
  prepareClaimed as prepareClaimedForDown,
  prepareSession as prepareSessionForDown,
} from '../testing/fixtures';
for (const history of ['queued attempt', 'prepared execution', 'accepted claim'] as const)
  test(
    'format3 down refuses retained ' + history + ' and rolls back the first guard error',
    async () => {
      const stores = await createRuntimeDatabaseFixture();
      const database = new Database(stores.options.path);
      try {
        if (history === 'queued attempt') await admitExecutionForDown(stores);
        else if (history === 'prepared execution') await prepareSessionForDown(stores);
        else await prepareClaimedForDown(stores);
        validateDatabase(database);
        const before = captureRuntimeDatabase(database);
        expect(() => {
          executeExecutionDown(database);
        }).toThrow(/CHECK constraint/);
        expect(captureRuntimeDatabase(database)).toEqual(before);
        expect(database.inTransaction).toBe(false);
      } finally {
        database.close();
        await stores.close();
      }
    },
  );

for (const fault of [
  'missing marker',
  'missing metadata',
  'malformed counter',
  'wrong bundle',
] as const)
  test(
    'format3 down prevalidation refuses ' + fault + ' without changing retained state',
    async () => {
      const stores = await createRuntimeDatabaseFixture();
      const database = new Database(stores.options.path);
      try {
        if (fault === 'missing marker') database.run('DELETE FROM run_format');
        if (fault === 'missing metadata') database.run('DELETE FROM run_meta');
        if (fault === 'malformed counter') database.run('UPDATE run_format SET intent_count=0.5');
        if (fault === 'wrong bundle') database.run("UPDATE run_format SET bundle_hash='wrong'");
        const before = captureRuntimeDatabase(database);
        expect(() => {
          executeExecutionDown(database);
        }).toThrow(
          fault === 'missing metadata'
            ? 'Validation failed: must be an object (was null)'
            : fault === 'malformed counter'
              ? 'Validation failed: intent_count must be an integer (was 0.5)'
              : /corrupt|incompatible/,
        );
        expect(captureRuntimeDatabase(database)).toEqual(before);
        expect(database.inTransaction).toBe(false);
      } finally {
        database.close();
        await stores.close();
      }
    },
  );

test('format3 down stops on metadata write failure and rolls back its already-created guard', async () => {
  const stores = await createRuntimeDatabaseFixture();
  const database = new Database(stores.options.path);
  // eslint-disable-next-line @typescript-eslint/unbound-method -- This test intercepts and restores the exact prototype receiver; retaining the original function/receiver is intentional.
  const original = Database.prototype.run;
  try {
    const before = captureRuntimeDatabase(database);
    let observed = 0;
    Database.prototype.run = function (sql, ...parameters) {
      if (
        this === database &&
        sql.trim() === 'UPDATE run_meta SET schema_version = 2 WHERE singleton = 1;'
      ) {
        observed++;
        throw new Error('injected format3 metadata write failure');
      }
      return original.call(this, sql, ...parameters);
    };
    expect(() => {
      executeExecutionDown(database);
    }).toThrow('injected format3 metadata write failure');
    expect(observed).toBe(1);
    expect(captureRuntimeDatabase(database)).toEqual(before);
    expect(database.inTransaction).toBe(false);
  } finally {
    Database.prototype.run = original;
    database.close();
    await stores.close();
  }
});

for (const fault of ['version', 'physical'] as const)
  test('predecessor recovery conversion rejects after-open ' + fault + ' corruption', async () => {
    const stores = await createRuntimeDatabaseFixture();
    const database = new Database(stores.options.path);
    try {
      await stores.runs.readRuntimeScope(runtimeScope);
      if (fault === 'version') database.run('UPDATE run_meta SET schema_version=3');
      else database.run('ALTER TABLE run_runtime_scope ADD COLUMN unexpected TEXT');
      await rejects(stores.runs.readRuntimeScope(runtimeScope));
    } finally {
      database.close();
      await stores.close();
    }
  });
