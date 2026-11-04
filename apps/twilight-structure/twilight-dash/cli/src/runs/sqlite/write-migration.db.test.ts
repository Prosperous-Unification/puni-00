import { deepStrictEqual } from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { organizationId } from '../record-codecs';
import { settleFixture } from '../testing/construct-fixture';
import { FixtureClock } from '../testing/fixtures';
import { createFormat3Fixture } from '../testing/format3-fixture';
import { createFormat4Fixture } from '../testing/format4-fixture';
import { createFormat5Fixture } from '../testing/format5-fixture';
import { createStoreDirectory } from '../testing/store-directory';
import { FORMAT5_IDENTITY, FORMAT6_IDENTITY, MIGRATIONS } from './format';
import { downgradeUnusedSqliteWrites, upgradeSqliteWrites } from './migrate-writes';
import { openSqliteStores, SqliteOpenError, type SqliteOptions } from './open-stores';
async function predecessor() {
  const directory = mkdtempSync(join(tmpdir(), 'write-migration-'));
  const options = {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
    maxBusyAttempts: 20,
    busyDelayMilliseconds: 1,
  };
  const owner = createStoreDirectory(directory, { recursive: true });
  const old = await createFormat5Fixture(options.path);
  owner.retainStore(old);
  const database = new Database(options.path);
  let isProbeClosed = false;
  function closeProbe() {
    if (isProbeClosed) return;
    database.close();
    isProbeClosed = true;
  }
  owner.retainProbe({ close: closeProbe });
  return { old, options, database, owner, closeProbe };
}
test('genuine format5 populated rows upgrade and unused down restores every original byte', async () => {
  const fixture = await predecessor();
  await fixture.owner.runTest(async () => {
    await fixture.old.populate('receipt_settled');
    const before = await fixture.old.capture();
    expect(await upgradeSqliteWrites(fixture.options)).toEqual({
      kind: 'upgraded',
      before: FORMAT5_IDENTITY,
      after: FORMAT6_IDENTITY,
    });
    expect(fixture.database.query('SELECT schema_version FROM run_meta').get()).toEqual({
      schema_version: 6,
    });
    const current = fixture.owner.retainStore(await openSqliteStores(fixture.options));
    expect(
      (await current.runs.readRun('run' as Parameters<typeof current.runs.readRun>[0])).version,
    ).toBe(4);
    await current.close();
    expect(await downgradeUnusedSqliteWrites(fixture.options)).toEqual({
      kind: 'downgraded',
      before: FORMAT6_IDENTITY,
      after: FORMAT5_IDENTITY,
    });
    expect(await fixture.old.capture()).toEqual(before);
  });
}, 60000);
import { rejects } from 'node:assert/strict';
import { chmodSync, existsSync, readFileSync } from 'node:fs';

import { runId } from '../record-codecs';
import { decodeRun } from '../record-codecs';
import { createManifest, unwrapReply } from '../testing/fixtures';
import { SqliteFormatTransitionError } from './format-transition';

for (const population of [
  'queued',
  'receipt_settled',
  'decision_consumed',
  'outbox_pending',
  'authority_pending',
  'authority_accepted',
  'claim_pending',
  'claim_accepted',
  'authority_recovery_active',
  'authority_recovery_closed',
  'claim_recovery_active',
  'claim_recovery_accepted',
  'claim_recovery_nonaccepted',
] as const)
  test(
    'preserving write transition retains genuine ' + population,
    async () => {
      const fixture = await predecessor();
      await fixture.owner.runTest(async () => {
        await fixture.old.populate(population);
        const before = await fixture.old.capture();
        const transition = await upgradeSqliteWrites(fixture.options).then(
          (value) => ({ kind: 'completed' as const, value }),
          (cause: unknown) => ({ kind: 'thrown' as const, cause }),
        );
        expect(transition.kind).toBe('completed');
        if (transition.kind !== 'completed')
          throw Error('preserving transition refused valid predecessor', {
            cause: transition.cause,
          });
        const after = await fixture.old.capture();
        for (const table of before.tables)
          if (table.name !== 'run_meta' && table.name !== 'run_format')
            expect(after.tables.find((candidate) => candidate.name === table.name)).toEqual(table);
        for (const table of before.tables.filter(
          (table) => table.name.startsWith('run5_') && table.name !== 'run5_usage',
        ))
          expect(
            after.tables.find(
              (candidate) => candidate.name === table.name.replace('run5_', 'run6_'),
            ),
          ).toEqual({ ...table, name: table.name.replace('run5_', 'run6_') });
        const current = fixture.owner.retainStore(await openSqliteStores(fixture.options));
        if (population.startsWith('claim') || population === 'outbox_pending')
          expect((await current.runs.readRun(runId('run'))).version).toBe(4);
        await current.close();
        await downgradeUnusedSqliteWrites(fixture.options);
        expect(await fixture.old.capture()).toEqual(before);
      });
      expect(await fixture.old.worker.exited).toEqual({ code: 0, signal: null });
      expect(fixture.old.worker.stdoutClosed).toBe(true);
      expect(fixture.old.worker.stderrClosed).toBe(true);
    },
    60000,
  );

async function observeStaticRefusal(options: SqliteOptions) {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Preserve the exact native close and observe the source connection before receiver-bound disposal; private inspection connections use another filename.
  const nativeClose = Database.prototype.close;
  const sourceCloses: { wal: boolean; shm: boolean }[] = [];
  Database.prototype.close = function (...parameters) {
    if (this.filename === options.path)
      sourceCloses.push({
        wal: existsSync(options.path + '-wal'),
        shm: existsSync(options.path + '-shm'),
      });
    nativeClose.apply(this, parameters);
  };
  await settleFixture(
    () => rejects(openSqliteStores(options), /incompatible/),
    [
      () => {
        Database.prototype.close = nativeClose;
      },
      () => {
        console.log(
          JSON.stringify({
            event: 'static-predecessor-source-connections',
            path: options.path,
            sourceCloses,
          }),
        );
        expect(sourceCloses).toEqual([]);
      },
    ],
  );
}

test('ordinary opener refuses genuine format5 before creating sidecars or changing bytes', async () => {
  const fixture = await predecessor();
  await fixture.old.populate('queued');
  fixture.closeProbe();
  await fixture.old.close();
  await fixture.owner.runTest(async () => {
    const before = readFileSync(fixture.options.path);
    expect(existsSync(fixture.options.path + '-wal')).toBe(false);
    expect(existsSync(fixture.options.path + '-shm')).toBe(false);
    await observeStaticRefusal(fixture.options);
    expect(readFileSync(fixture.options.path)).toEqual(before);
    expect(existsSync(fixture.options.path + '-wal')).toBe(false);
    expect(existsSync(fixture.options.path + '-shm')).toBe(false);
  });
}, 60000);

for (const [version, create] of [
  [3, createFormat3Fixture],
  [4, createFormat4Fixture],
] as const)
  test(
    'ordinary opener refuses closed genuine format' +
      String(version) +
      ' without creating source sidecars',
    async () => {
      const directory = mkdtempSync(join(tmpdir(), 'write-preflight-' + String(version) + '-'));
      const owner = createStoreDirectory(directory, { recursive: true });
      const path = join(directory, 'runs.sqlite');
      const old = owner.retainStore(await create(path));
      await old.populate('queued');
      await old.close();
      expect(await old.worker.exited).toEqual({ code: 0, signal: null });
      expect(old.worker.stdoutClosed).toBe(true);
      expect(old.worker.stderrClosed).toBe(true);
      await owner.runTest(async () => {
        const before = readFileSync(path);
        expect(existsSync(path + '-wal')).toBe(false);
        expect(existsSync(path + '-shm')).toBe(false);
        await observeStaticRefusal({
          path,
          organizationId: organizationId('organization'),
          capacity: 1,
          leaseMilliseconds: 100,
          clock: new FixtureClock(),
          maxBusyAttempts: 3,
          busyDelayMilliseconds: 1,
        });
        expect(readFileSync(path)).toEqual(before);
        expect(existsSync(path + '-wal')).toBe(false);
        expect(existsSync(path + '-shm')).toBe(false);
      });
    },
    60000,
  );

test('used successor refuses down and preserves the complete committed format', async () => {
  const fixture = await predecessor();
  await fixture.owner.runTest(async () => {
    const ownership = await fixture.old.populate('queued');
    await upgradeSqliteWrites(fixture.options);
    const current = fixture.owner.retainStore(await openSqliteStores(fixture.options));
    unwrapReply(await current.runs.renewOwnership(ownership));
    const before = await fixture.old.capture();
    await rejects(
      downgradeUnusedSqliteWrites(fixture.options),
      (cause) => cause instanceof SqliteFormatTransitionError && cause.failure === 'used_history',
    );
    expect(await fixture.old.capture()).toEqual(before);
  });
}, 60000);

test('compiled format6 down independently refuses semantic use before destructive SQL', async () => {
  const fixture = await predecessor();
  await fixture.owner.runTest(async () => {
    const ownership = await fixture.old.populate('queued');
    await upgradeSqliteWrites(fixture.options);
    const current = fixture.owner.retainStore(await openSqliteStores(fixture.options));
    unwrapReply(await current.runs.renewOwnership(ownership));
    const before = await fixture.old.capture();
    await settleFixture(() => {
      fixture.database.run('BEGIN IMMEDIATE');
      expect(() => {
        for (const statement of MIGRATIONS[5].down
          .split('--> statement-breakpoint')
          .map((statement) => statement.trim())
          .filter((statement) => statement.length > 0))
          fixture.database.run(statement);
      }).toThrow(/CHECK constraint failed/);
    }, [
      () => {
        expect(fixture.database.inTransaction).toBe(true);
        fixture.database.run('ROLLBACK');
        expect(fixture.database.inTransaction).toBe(false);
      },
    ]);
    expect(await fixture.old.capture()).toEqual(before);
  });
  expect(await fixture.old.worker.exited).toEqual({ code: 0, signal: null });
  expect(fixture.old.worker.stdoutClosed).toBe(true);
  expect(fixture.old.worker.stderrClosed).toBe(true);
}, 60000);

for (const fault of ['empty table', 'empty index'] as const)
  test(
    'partial known format6 ' + fault + ' refuses before transition DDL',
    async () => {
      const fixture = await predecessor();
      await fixture.owner.runTest(async () => {
        if (fault === 'empty table') fixture.database.run('CREATE TABLE run6_record(marker TEXT)');
        else {
          fixture.database.run('CREATE TABLE run6_record(run_id TEXT)');
          fixture.database.run('CREATE INDEX partial_run6 ON run6_record(run_id)');
        }
        const before = await fixture.old.capture();
        await rejects(
          upgradeSqliteWrites(fixture.options),
          (cause) => cause instanceof SqliteFormatTransitionError && cause.failure === 'corrupt',
        );
        expect(await fixture.old.capture()).toEqual(before);
      });
    },
    60000,
  );

for (const phase of ['copy', 'metadata'] as const)
  test(
    'late write migration ' + phase + ' abort restores complete predecessor',
    async () => {
      const fixture = await predecessor();
      await fixture.owner.runTest(async () => {
        await fixture.old.populate('receipt_settled');
        const before = await fixture.old.capture();
        // eslint-disable-next-line @typescript-eslint/unbound-method -- Save the exact native function; the fault wrapper calls and restores it with its original receiver.
        const nativeRun = Database.prototype.run;
        if (phase === 'metadata')
          fixture.database.run(
            "CREATE TRIGGER fail_write_publication BEFORE UPDATE OF schema_version ON run_meta WHEN NEW.schema_version=6 BEGIN SELECT RAISE(ABORT,'late write metadata'); END",
          );
        Database.prototype.run = function (sql, ...parameters) {
          const applied = nativeRun.call(this, sql, ...parameters);
          if (
            phase === 'copy' &&
            this.filename === fixture.options.path &&
            sql.startsWith('CREATE TABLE run6_attempt')
          )
            nativeRun.call(
              this,
              "CREATE TRIGGER fail_write_copy BEFORE INSERT ON run6_attempt BEGIN SELECT RAISE(ABORT,'late write copy'); END",
            );
          return applied;
        };
        try {
          await rejects(
            upgradeSqliteWrites(fixture.options),
            (cause) =>
              cause instanceof SqliteFormatTransitionError &&
              cause.failure === 'transition_failed' &&
              cause.phase === 'transaction',
          );
        } finally {
          Database.prototype.run = nativeRun;
        }
        if (phase === 'metadata') fixture.database.run('DROP TRIGGER fail_write_publication');
        expect(await fixture.old.capture()).toEqual(before);
      });
    },
    60000,
  );

test('genuine already-open format5 semantic writer is fenced by published6', async () => {
  const fixture = await predecessor();
  await fixture.owner.runTest(async () => {
    const ownership = await fixture.old.populate('queued');
    await upgradeSqliteWrites(fixture.options);
    const before = await fixture.old.capture();
    await rejects(
      fixture.old
        .retainManifest(ownership, createManifest({ credentialReferences: ['after-format6'] }))
        .then((value) => {
          console.log(JSON.stringify({ event: 'already-open-format5-writer-resolved', value }));
          return value;
        }),
      /incompatible/,
    );
    expect(await fixture.old.capture()).toEqual(before);
  });
}, 60000);
for (const queued of [1, 2] as const)
  test(
    'genuine format5 ' +
      (queued === 1 ? 'BUSY' : 'queued') +
      ' writer observes6 after its original lock wait',
    async () => {
      const fixture = await predecessor();
      const pending: Promise<
        { kind: 'resolved'; value: unknown } | { kind: 'rejected'; cause: unknown }
      >[] = [];
      try {
        await fixture.owner.runTest(async () => {
          const ownership = await fixture.old.populate('queued');
          await fixture.old.armBusy(queued);
          fixture.database.run('BEGIN IMMEDIATE');
          try {
            for (let index = 0; index < queued; index++)
              pending.push(
                fixture.old
                  .retainManifest(
                    ownership,
                    createManifest({ credentialReferences: ['queued-' + String(index)] }),
                  )
                  .then(
                    (value) => ({ kind: 'resolved' as const, value }),
                    (cause: unknown) => ({ kind: 'rejected' as const, cause }),
                  ),
              );
            await fixture.old.waitForEvent('busy_paused');
            fixture.database.run('ROLLBACK');
            await upgradeSqliteWrites(fixture.options);
            const before = fixture.database
              .query('SELECT * FROM run_manifest ORDER BY digest')
              .all();
            fixture.old.releaseBusy();
            for (const completion of await Promise.all(pending)) {
              expect(completion.kind).toBe('rejected');
              if (completion.kind !== 'rejected')
                throw new Error('old writer unexpectedly resolved');
              expect(String(completion.cause)).toMatch(/incompatible/);
            }
            expect(
              fixture.database.query('SELECT * FROM run_manifest ORDER BY digest').all(),
            ).toEqual(before);
          } finally {
            fixture.old.releaseBusy();
            if (fixture.database.inTransaction) fixture.database.run('ROLLBACK');
            await Promise.all(pending);
          }
        });
      } finally {
        /* The inner finally releases and drains before the owner closes its archive. */
      }
    },
    60000,
  );

test('admitted format5 callback commits before6 copy while later writes refuse', async () => {
  const fixture = await predecessor();
  let writing: Promise<unknown> | undefined;
  let upgrading: Promise<unknown> | undefined;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Save the exact native function; the fault wrapper calls and restores it with its original receiver.
  const nativeRun = Database.prototype.run;
  await fixture.owner.runTest(() =>
    settleFixture(async () => {
      const command = await fixture.old.prepareMutation('createRun');
      if (command.method !== 'createRun') throw new Error('old callback command differs');
      await fixture.old.armCallback();
      writing = fixture.old.invoke(command);
      await fixture.old.waitForEvent('callback_entered');
      let busy = 0;
      let prior: unknown;
      Database.prototype.run = function (sql, ...parameters) {
        try {
          const value = nativeRun.call(this, sql, ...parameters);
          if (sql === 'BEGIN IMMEDIATE' && this.filename === fixture.options.path)
            prior = this.query('SELECT * FROM run5_record ORDER BY run_id').all();
          return value;
        } catch (cause) {
          if (
            sql === 'BEGIN IMMEDIATE' &&
            cause instanceof Error &&
            'code' in cause &&
            cause.code === 'SQLITE_BUSY'
          )
            busy++;
          throw cause;
        }
      };
      upgrading = upgradeSqliteWrites({ ...fixture.options, maxBusyAttempts: 15000 });
      const deadline = Date.now() + 15000;
      while (busy === 0) {
        if (Date.now() >= deadline) throw new Error('write upgrade did not reach actual BUSY');
        await Bun.sleep(2);
      }
      expect(prior).toBeUndefined();
      expect(fixture.database.query('SELECT schema_version FROM run_meta').get()).toEqual({
        schema_version: 5,
      });
      expect(
        fixture.database.query("SELECT name FROM sqlite_schema WHERE name='run6_record'").all(),
      ).toEqual([]);
      fixture.old.releaseCallback();
      expect(await writing).toMatchObject({ kind: 'applied', value: command.parameters[1] });
      await upgrading;
      expect(prior).toBeDefined();
      deepStrictEqual(
        fixture.database.query('SELECT * FROM run6_record ORDER BY run_id').all(),
        prior,
      );
      const before = await fixture.old.capture();
      await rejects(
        fixture.old.retainManifest(
          command.parameters[0],
          createManifest({ credentialReferences: ['late-callback'] }),
        ),
        /incompatible/,
      );
      expect(await fixture.old.capture()).toEqual(before);
    }, [
      () => {
        Database.prototype.run = nativeRun;
      },
      () => {
        fixture.old.releaseCallback();
      },
      async () => {
        const completions = await Promise.allSettled(
          [writing, upgrading].filter(
            (pending): pending is Promise<unknown> => pending !== undefined,
          ),
        );
        const failures: unknown[] = [];
        for (const completion of completions)
          if (completion.status === 'rejected') failures.push(completion.reason);
        if (failures.length > 0)
          throw new AggregateError(failures, 'callback and transition cleanup failed');
      },
    ]),
  );
}, 60000);

test('unused6 down preserves genuine5 refusal clock and compatible immutable artifacts', async () => {
  const fixture = await predecessor();
  await fixture.owner.runTest(async () => {
    const ownership = await fixture.old.populate('queued');
    await upgradeSqliteWrites(fixture.options);
    const current = fixture.owner.retainStore(await openSqliteStores(fixture.options));
    fixture.options.clock.advance(100);
    expect(await current.runs.renewOwnership(ownership)).toEqual({
      kind: 'refused',
      reason: 'owner_stale',
    });
    const bytes = new Uint8Array([0, 255, 128, 10, 13]);
    const retained = await fixture.old.retainArtifact(bytes, 'application/octet-stream');
    expect(retained.kind).toBe('retained');
    expect(await fixture.old.retainArtifact(bytes, 'application/octet-stream')).toEqual(retained);
    expect(await fixture.old.retainArtifact(bytes, 'text/plain')).toEqual({
      kind: 'refused',
      reason: 'metadata_conflict',
    });
    expect(fixture.database.query('SELECT used FROM run6_usage').get()).toEqual({ used: 0 });
    await current.close();
    await downgradeUnusedSqliteWrites(fixture.options);
    expect(fixture.database.query('SELECT last_observed_at FROM run_meta').get()).toEqual({
      last_observed_at: 1100,
    });
  });
}, 60000);

test('preserving write copy retains genuine5 opaque Unicode and NUL keys without reencoding payloads', async () => {
  const fixture = await predecessor();
  await fixture.owner.runTest(async () => {
    const ownership = await fixture.old.populate('queued');
    const original = fixture.database
      .query<{ record: string }, []>('SELECT initial_record AS record FROM run5_record')
      .get();
    if (original === null) throw Error('old run missing');
    const run = decodeRun(JSON.parse(original.record));
    for (const identity of ['\ud800', '\ud801', '\ufffd', '\0', '🪁'])
      expect(
        await fixture.old.invoke({
          method: 'createRun',
          parameters: [ownership, { ...run, runId: runId(identity) }],
        }),
      ).toMatchObject({ kind: 'applied' });
    const before = await fixture.old.capture();
    await upgradeSqliteWrites(fixture.options);
    expect(fixture.database.query('SELECT * FROM run6_record ORDER BY run_id').all()).toEqual(
      fixture.database.query('SELECT * FROM run5_record ORDER BY run_id').all(),
    );
    await downgradeUnusedSqliteWrites(fixture.options);
    expect(await fixture.old.capture()).toEqual(before);
  });
}, 60000);

for (const fault of ['absent', 'unreadable', 'changed bundle'] as const)
  test(
    'write transition ' + fault + ' refusal preserves original predecessor',
    async () => {
      const fixture = await predecessor();
      await fixture.owner.runTest(async () => {
        await fixture.old.populate('queued');
        if (fault === 'changed bundle')
          fixture.database.run(
            "UPDATE run_format SET bundle_hash='changed applied artifact identity'",
          );
        const before = await fixture.old.capture();
        if (fault === 'unreadable') chmodSync(fixture.options.path, 0);
        try {
          await rejects(
            upgradeSqliteWrites({
              ...fixture.options,
              ...(fault === 'absent'
                ? { path: join(fixture.options.path, '..', 'missing.sqlite') }
                : {}),
            }),
            (cause) =>
              cause instanceof SqliteFormatTransitionError &&
              cause.failure === (fault === 'changed bundle' ? 'incompatible' : fault) &&
              cause.phase === (fault === 'changed bundle' ? 'transaction' : 'preflight'),
          );
        } finally {
          if (fault === 'unreadable') chmodSync(fixture.options.path, 0o600);
        }
        expect(await fixture.old.capture()).toEqual(before);
      });
    },
    60000,
  );

for (const direction of ['up', 'down'] as const)
  test(
    'late write ' + direction + ' DDL abort rolls back the complete declaration set',
    async () => {
      const fixture = await predecessor();
      // eslint-disable-next-line @typescript-eslint/unbound-method -- Save the exact native function; the fault wrapper calls and restores it with its original receiver.
      const original = Database.prototype.run;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- Save the exact native close; observe its own transaction state before receiver-bound disposal and restore it independently.
      const nativeClose = Database.prototype.close;
      const sentinel = new Error('late write DDL fault');
      let isFaultInjected = false;
      const closingTransactions: boolean[] = [];
      await fixture.owner.runTest(async () => {
        await fixture.old.populate('receipt_settled');
        if (direction === 'down') await upgradeSqliteWrites(fixture.options);
        const before = await fixture.old.capture();
        Database.prototype.close = function (...parameters) {
          if (isFaultInjected && this.filename === fixture.options.path)
            closingTransactions.push(this.inTransaction);
          nativeClose.apply(this, parameters);
        };
        Database.prototype.run = function (sql, ...parameters) {
          const value = original.call(this, sql, ...parameters);
          if (
            this.filename === fixture.options.path &&
            sql.startsWith(
              direction === 'up' ? 'CREATE TABLE run6_write_receipt' : 'DROP TABLE run6_attempt',
            )
          ) {
            isFaultInjected = true;
            throw sentinel;
          }
          return value;
        };
        let failure: { readonly cause: unknown } | undefined;
        try {
          await (direction === 'up'
            ? upgradeSqliteWrites(fixture.options)
            : downgradeUnusedSqliteWrites(fixture.options));
        } catch (cause) {
          failure = { cause };
          console.error(cause);
        } finally {
          Database.prototype.run = original;
          Database.prototype.close = nativeClose;
        }
        console.log(
          JSON.stringify({
            event: 'write-transition-native-close',
            direction,
            closingTransactions,
          }),
        );
        expect(closingTransactions).toEqual([false]);
        expect(failure).toBeDefined();
        if (failure === undefined) throw Error('late DDL fault did not refuse the transition');
        const cause = failure.cause;
        expect(cause).toBeInstanceOf(SqliteFormatTransitionError);
        if (!(cause instanceof SqliteFormatTransitionError))
          throw Error('transition failure type differs', { cause });
        expect(cause.failure).toBe('transition_failed');
        expect(cause.phase).toBe('transaction');
        expect(cause.cause).toBe(sentinel);
        expect(await fixture.old.capture()).toEqual(before);
      });
    },
    60000,
  );

test('write transition committed native cleanup fault preserves exact phase and original cause', async () => {
  const fixture = await predecessor();
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Save the exact native function; the fault wrapper calls and restores it with its original receiver.
  const original = Database.prototype.close;
  const sentinel = new Error('committed write native close fault');
  let nativeClosed = false;
  await fixture.owner.runTest(async () => {
    await fixture.old.populate('queued');
    Database.prototype.close = function (...parameters) {
      const version = this.query<{ schema_version: number }, []>(
        'SELECT schema_version FROM run_meta',
      ).get()?.schema_version;
      original.apply(this, parameters);
      if (this.filename === fixture.options.path && version === 6) {
        nativeClosed = true;
        throw sentinel;
      }
    };
    try {
      await rejects(
        upgradeSqliteWrites(fixture.options),
        (cause) =>
          cause instanceof SqliteFormatTransitionError &&
          cause.failure === 'cleanup_failed' &&
          cause.phase === 'committed' &&
          cause.cause === sentinel,
      );
    } finally {
      Database.prototype.close = original;
    }
    expect(nativeClosed).toBe(true);
    const current = fixture.owner.retainStore(await openSqliteStores(fixture.options));
    expect((await current.runs.readRun(runId('run'))).version).toBe(4);
    await current.close();
  });
}, 60000);

function captureAdmission(database: Database) {
  const schema = database
    .query<{ name: string; type: string; sql: string | null }, []>(
      'SELECT name,type,sql FROM sqlite_schema ORDER BY name',
    )
    .all();
  return {
    schema,
    tables: schema
      .filter((entry) => entry.type === 'table' && !entry.name.startsWith('sqlite_'))
      .map((entry) => ({
        name: entry.name,
        rows: database
          .query('SELECT * FROM "' + entry.name.replaceAll('"', '""') + '"')
          .all()
          .map((row) => JSON.stringify(row))
          .sort(),
      })),
    journal: database.query('PRAGMA journal_mode').get(),
  };
}
test('raced incompatible DELETE admission preserves logical state and persistent settings', async () => {
  const fixture = await predecessor();
  await fixture.old.populate('queued');
  await upgradeSqliteWrites(fixture.options);
  fixture.closeProbe();
  await fixture.old.close();
  expect(await fixture.old.worker.exited).toEqual({ code: 0, signal: null });
  expect(fixture.old.worker.stdoutClosed && fixture.old.worker.stderrClosed).toBe(true);
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Controlled native close cut; exact receiver-bound method is restored before owned cleanup.
  const close = Database.prototype.close;
  let raced = false;
  let pending: ReturnType<typeof downgradeUnusedSqliteWrites> | undefined;
  let before: ReturnType<typeof captureAdmission> | undefined;
  let unexpected: Awaited<ReturnType<typeof openSqliteStores>> | undefined;
  let downgradeClosed = false;
  await fixture.owner.runTest(() =>
    settleFixture(async () => {
      Database.prototype.close = function (...parameters) {
        const filename = this.filename;
        let version: number | undefined;
        if (filename === fixture.options.path) {
          const meta = this.query<{ schema_version: number }, []>(
            'SELECT schema_version FROM run_meta',
          ).get();
          if (meta === null) throw Error('race metadata absent');
          version = meta.schema_version;
        }
        close.apply(this, parameters);
        if (filename === fixture.options.path && version === 5) downgradeClosed = true;
        if (filename.endsWith('/inspection.sqlite') && !raced) {
          raced = true;
          pending = downgradeUnusedSqliteWrites(fixture.options);
          if (!downgradeClosed) throw Error('downgrade did not positively close at controlled cut');
          const native = new Database(fixture.options.path);
          try {
            expect(native.query('PRAGMA journal_mode=DELETE').get()).toEqual({
              journal_mode: 'delete',
            });
            before = captureAdmission(native);
          } finally {
            close.call(native);
          }
        }
      };
      await rejects(
        openSqliteStores(fixture.options).then((stores) => {
          unexpected = stores;
          return stores;
        }),
        (cause) => cause instanceof SqliteOpenError,
      );
      if (pending === undefined || before === undefined) throw Error('race cut absent');
      expect(await pending).toEqual({
        kind: 'downgraded',
        before: FORMAT6_IDENTITY,
        after: FORMAT5_IDENTITY,
      });
      const after = new Database(fixture.options.path);
      try {
        expect(captureAdmission(after)).toEqual(before);
      } finally {
        close.call(after);
      }
      expect(raced).toBe(true);
    }, [
      () => {
        Database.prototype.close = close;
      },
      async () => {
        if (unexpected !== undefined) await unexpected.close();
      },
      async () => {
        if (pending !== undefined) await pending;
      },
    ]),
  );
}, 60000);

test('supported DELETE configuration retains exclusion then fresh normal admission refuses a later down', async () => {
  const fixture = await predecessor();
  await fixture.old.populate('queued');
  await upgradeSqliteWrites(fixture.options);
  fixture.closeProbe();
  await fixture.old.close();
  expect(await fixture.old.worker.exited).toEqual({ code: 0, signal: null });
  expect(fixture.old.worker.stdoutClosed && fixture.old.worker.stderrClosed).toBe(true);
  const native = new Database(fixture.options.path);
  try {
    expect(native.query('PRAGMA journal_mode=DELETE').get()).toEqual({ journal_mode: 'delete' });
  } finally {
    native.close();
  }
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Exact receiver-bound native hooks define the owned conversion and positively closed configuration cuts.
  const close = Database.prototype.close;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Preserve the exact native operation for controlled exclusion probes and restoration.
  const run = Database.prototype.run;
  let converted = false,
    closed = false,
    downgradeClosed = false;
  let pending: ReturnType<typeof downgradeUnusedSqliteWrites> | undefined;
  let before: ReturnType<typeof captureAdmission> | undefined;
  let unexpected: Awaited<ReturnType<typeof openSqliteStores>> | undefined;
  await fixture.owner.runTest(() =>
    settleFixture(async () => {
      Database.prototype.run = function (sql, ...parameters) {
        if (
          this.filename === fixture.options.path &&
          sql === 'PRAGMA journal_mode=WAL' &&
          !converted
        ) {
          const competing = new Database(fixture.options.path);
          try {
            expect(() => run.call(competing, 'BEGIN IMMEDIATE')).toThrow('database is locked');
          } finally {
            close.call(competing);
          }
          converted = true;
        }
        return run.call(this, sql, ...parameters);
      };
      Database.prototype.close = function (...parameters) {
        const source = this.filename === fixture.options.path;
        const exclusive =
          source &&
          this.query<{ locking_mode: string }, []>('PRAGMA locking_mode').get()?.locking_mode ===
            'exclusive';
        const version = source
          ? this.query<{ schema_version: number }, []>('SELECT schema_version FROM run_meta').get()
              ?.schema_version
          : undefined;
        close.apply(this, parameters);
        if (source && version === 5) downgradeClosed = true;
        if (exclusive && converted && !closed) {
          closed = true;
          pending = downgradeUnusedSqliteWrites(fixture.options);
          if (!downgradeClosed) throw Error('post-conversion downgrade closure unobserved');
          const probe = new Database(fixture.options.path);
          try {
            before = captureAdmission(probe);
            expect(before.journal).toEqual({ journal_mode: 'wal' });
          } finally {
            close.call(probe);
          }
        }
      };
      await rejects(
        openSqliteStores(fixture.options).then((stores) => {
          unexpected = stores;
          return stores;
        }),
        (cause) => cause instanceof SqliteOpenError && cause.failure === 'incompatible',
      );
      if (pending === undefined || before === undefined)
        throw Error('configuration phase cut absent');
      expect(await pending).toEqual({
        kind: 'downgraded',
        before: FORMAT6_IDENTITY,
        after: FORMAT5_IDENTITY,
      });
      const after = new Database(fixture.options.path);
      try {
        expect(captureAdmission(after)).toEqual(before);
      } finally {
        close.call(after);
      }
      expect(converted && closed).toBe(true);
    }, [
      () => {
        Database.prototype.run = run;
        Database.prototype.close = close;
      },
      async () => {
        if (unexpected !== undefined) await unexpected.close();
      },
      async () => {
        if (pending !== undefined) await pending;
      },
    ]),
  );
}, 60000);
