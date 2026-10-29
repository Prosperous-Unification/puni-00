import { rejects } from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { readExecutionHistory } from '../claim-history';
import { attemptId, organizationId, runId } from '../record-codecs';
import { readRuntimeHistory } from '../runtime-history';
import { FixtureClock } from '../testing/fixtures';
import { createFormat3Fixture, settleFixture } from '../testing/format3-fixture';
import {
  createRecoveryFenceCall,
  createRecoveryObservationCall,
} from '../testing/recovery-contract';
import { FORMAT3_IDENTITY, FORMAT4_IDENTITY } from './format';
import { downgradeUnusedSqliteStores, upgradeSqliteStores } from './migrate-recovery';
import { openSqliteStores, type SqliteOptions } from './open-stores';
for (const population of [
  'queued',
  'prepared',
  'authority_pending',
  'authority_accepted',
  'claim_pending',
  'claim_accepted',
  'decision_consumed',
  'outbox_pending',
  'receipt_settled',
  'ownership_takeover',
] as const)
  test(`explicit upgrade and unused down preserve genuine format3 ${population} rows and declarations`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'recovery-migration-'));
    const path = join(directory, 'runs.sqlite');
    const options: SqliteOptions = {
      path,
      organizationId: organizationId('organization'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock: new FixtureClock(),
      maxBusyAttempts: 20,
      busyDelayMilliseconds: 1,
    };
    const old = await createFormat3Fixture(path);
    await settleFixture(async () => {
      await old.populate(population);
      const before = await old.capture();
      await rejects(openSqliteStores(options), (cause: unknown) => {
        expect(cause).toMatchObject({ failure: 'incompatible' });
        return true;
      });
      expect(await old.capture()).toEqual(before);
      const upgradedIdentity = await upgradeSqliteStores(options);
      expect(upgradedIdentity.before).toEqual(FORMAT3_IDENTITY);
      expect(upgradedIdentity.after).toEqual(FORMAT4_IDENTITY);
      expect(upgradedIdentity.before.bundleHash).toBe(
        'd11130ee5ca84e51cb843daf8fbfc5695b704e3aecea1fb6d7c00234b2f43aed',
      );
      expect<typeof upgradedIdentity.before.migrations>(
        upgradedIdentity.after.migrations.slice(0, 3),
      ).toEqual(upgradedIdentity.before.migrations);
      const upgraded = await old.capture();
      for (const table of before.tables) {
        const expected = {
          ...table,
          rows: table.rows.map((row) =>
            row.map((cell, index) =>
              table.name === 'run_meta' && table.columns[index] === 'schema_version'
                ? 4n
                : table.name === 'run_format' && table.columns[index] === 'bundle_hash'
                  ? FORMAT4_IDENTITY.bundleHash
                  : cell,
            ),
          ),
        };
        expect(upgraded.tables.find((entry) => entry.name === table.name)).toEqual(expected);
      }
      expect(
        upgraded.tables
          .filter((table) => !before.tables.some((previous) => previous.name === table.name))
          .map((table) => ({ name: table.name, rows: table.rows })),
      ).toEqual([
        { name: 'run_recovery_active', rows: [] },
        { name: 'run_recovery_barrier', rows: [] },
        { name: 'run_recovery_closure', rows: [] },
        { name: 'run_recovery_fence', rows: [] },
        { name: 'run_recovery_format', rows: [[1n, 0n, 0n, 0n, 0n, 0n, 0n]] },
        { name: 'run_recovery_journal', rows: [] },
        { name: 'run_recovery_observation', rows: [] },
      ]);
      for (const declaration of before.schema) expect(upgraded.schema).toContainEqual(declaration);
      const current = await openSqliteStores(options);
      await settleFixture(async () => {
        await readRuntimeHistory(current.runs, current.artifacts, {
          organizationId: 'organization',
          projectId: 'project',
          personId: 'person',
        });
        if (before.tables.find((table) => table.name === 'run_attempt')?.rows.length)
          await readExecutionHistory(
            current.runs,
            current.artifacts,
            runId('run'),
            attemptId('attempt'),
          );
      }, [
        async () => {
          await current.close();
        },
      ]);
      expect(await old.capture()).toEqual(upgraded);
      expect(await downgradeUnusedSqliteStores(options)).toEqual({
        kind: 'downgraded',
        before: FORMAT4_IDENTITY,
        after: FORMAT3_IDENTITY,
      });
      expect(await old.capture()).toEqual(before);
      const reopened = await createFormat3Fixture(path, 'open');
      await settleFixture(async () => {
        expect(await reopened.capture()).toEqual(before);
      }, [
        async () => {
          await reopened.close();
        },
      ]);
    }, [
      async () => {
        await old.close();
      },
      () => {
        rmSync(directory, { recursive: true, force: true });
      },
    ]);
  });
import { chmodSync } from 'node:fs';

import { Database } from 'bun:sqlite';

import { ownerId } from '../record-codecs';
import { unwrapReply } from '../testing/fixtures';
import { authorityRequest, runtimePin, runtimeScope } from '../testing/runtime-history-contract';
import { bootstrapSqliteStores } from './open-stores';
function createOptions(path: string) {
  return {
    path,
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
    maxBusyAttempts: 2,
    busyDelayMilliseconds: 1,
  };
}
function captureTransition(database: Database) {
  return {
    schema: database
      .query(
        'SELECT type,name,tbl_name,sql FROM sqlite_schema UNION ALL SELECT type,name,tbl_name,sql FROM sqlite_temp_schema ORDER BY type,name',
      )
      .all(),
    tables: database
      .query<
        {
          name: string;
        },
        []
      >("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")
      .all()
      .map(({ name }) => ({
        name,
        rows: database.query(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all(),
      })),
  };
}
for (const failure of [
  'absent',
  'unreadable_file',
  'unreadable_directory',
  'configuration',
  'incompatible',
  'corrupt',
  'contention',
] as const)
  test(`upgrade preserves exact ${failure} category cause and intended identities`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'recovery-transition-error-'));
    const path = join(directory, 'runs.sqlite');
    const options = createOptions(path);
    let old: Awaited<ReturnType<typeof createFormat3Fixture>> | undefined;
    let blocker: Database | undefined;
    await settleFixture(async () => {
      if (failure !== 'absent') old = await createFormat3Fixture(path);
      if (failure === 'unreadable_file' || failure === 'unreadable_directory') {
        if (process.getuid?.() === 0)
          throw new Error('unreadability proofs require a non-root uid');
        chmodSync(failure === 'unreadable_file' ? path : directory, 0);
      }
      if (failure === 'corrupt') {
        const connection = new Database(path);
        connection.run('DELETE FROM run_format');
        connection.close();
      }
      if (failure === 'incompatible') await upgradeSqliteStores(options);
      if (failure === 'contention') {
        blocker = new Database(path);
        blocker.run('BEGIN IMMEDIATE');
      }
      const input = failure === 'configuration' ? { ...options, capacity: 2 } : options;
      let caught: unknown;
      try {
        await upgradeSqliteStores(input);
      } catch (cause) {
        caught = cause;
      }
      expect(caught).toMatchObject({
        name: 'SqliteFormatTransitionError',
        failure: failure.startsWith('unreadable_') ? 'unreadable' : failure,
        path,
        before: FORMAT3_IDENTITY,
        after: FORMAT4_IDENTITY,
      });
      expect(caught).toBeInstanceOf(Error);
      if (!(caught instanceof Error)) throw new Error('missing transition error');
      expect(caught.cause).toBeInstanceOf(Error);
    }, [
      () => {
        if (failure === 'unreadable_file') chmodSync(path, 0o600);
      },
      () => {
        if (failure === 'unreadable_directory') chmodSync(directory, 0o700);
      },
      () => {
        if (blocker !== undefined) {
          blocker.run('ROLLBACK');
        }
      },
      () => {
        if (blocker !== undefined) {
          blocker.close();
        }
      },
      async () => {
        await old?.close();
      },
      () => {
        rmSync(directory, { recursive: true, force: true });
      },
    ]);
  });
for (const direction of ['upgrade', 'down'] as const)
  test(`${direction} late SQL abort rolls back all rows declarations metadata and temporary guards before cleanup`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'recovery-transition-rollback-'));
    const path = join(directory, 'runs.sqlite');
    const options = createOptions(path);
    const old = await createFormat3Fixture(path);
    const inspected: ReturnType<typeof captureTransition>[] = [];
    const transactions: boolean[] = [];
    let observer: Database | undefined;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- The test restores the exact native function and invokes it with its original receiver.
    const originalClose = Database.prototype.close;
    await settleFixture(async () => {
      await old.populate('prepared');
      if (direction === 'down') await upgradeSqliteStores(options);
      observer = new Database(path);
      observer.run(
        direction === 'upgrade'
          ? "CREATE TRIGGER late_transition_abort BEFORE UPDATE OF bundle_hash ON run_format BEGIN SELECT CASE WHEN (SELECT count(*) FROM sqlite_schema WHERE name='run_recovery_journal')=1 THEN RAISE(ABORT,'late upgrade injected') END; END"
          : "CREATE TRIGGER late_transition_abort BEFORE UPDATE OF schema_version ON run_meta WHEN NEW.schema_version=3 BEGIN SELECT CASE WHEN (SELECT count(*) FROM sqlite_schema WHERE name='run_recovery_journal')=0 THEN RAISE(ABORT,'late down injected') END; END",
      );
      const before = captureTransition(observer);
      Database.prototype.close = function (...parameters) {
        if (this.filename === path) {
          inspected.push(captureTransition(this));
          transactions.push(this.inTransaction);
        }
        originalClose.apply(this, parameters);
      };
      let transitionFailure: unknown;
      try {
        await (direction === 'upgrade'
          ? upgradeSqliteStores(options)
          : downgradeUnusedSqliteStores(options));
      } catch (cause) {
        transitionFailure = cause;
      }
      Database.prototype.close = originalClose;
      expect(inspected.length).toBe(2);
      expect({ transactions, snapshots: inspected }).toEqual({
        transactions: [false, false],
        snapshots: [before, before],
      });
      expect(transitionFailure).toMatchObject({
        failure: 'transition_failed',
        phase: 'transaction',
        cause: {
          message: direction === 'upgrade' ? 'late upgrade injected' : 'late down injected',
        },
      });
      expect(captureTransition(observer)).toEqual(before);
    }, [
      () => {
        Database.prototype.close = originalClose;
      },
      () => {
        observer?.close();
      },
      async () => {
        await old.close();
      },
      () => {
        rmSync(directory, { recursive: true, force: true });
      },
    ]);
  });
test('committed cleanup failure preserves committed phase and successor identity', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'recovery-cleanup-'));
  const path = join(directory, 'runs.sqlite');
  const old = await createFormat3Fixture(path);
  // eslint-disable-next-line @typescript-eslint/unbound-method -- The test restores the exact native function and invokes it with its original receiver.
  const originalClose = Database.prototype.close;
  const injected = new Error('injected committed close failure');
  await settleFixture(async () => {
    Database.prototype.close = function (...parameters) {
      const committed =
        this.filename === path &&
        this.query<
          {
            schema_version: number;
          },
          []
        >('SELECT schema_version FROM run_meta').get()?.schema_version === 4;
      originalClose.apply(this, parameters);
      if (committed) throw injected;
    };
    await rejects(upgradeSqliteStores(createOptions(path)), (cause: unknown) => {
      expect(cause).toMatchObject({
        failure: 'cleanup_failed',
        phase: 'committed',
        before: FORMAT3_IDENTITY,
        after: FORMAT4_IDENTITY,
        cause: injected,
      });
      return true;
    });
    Database.prototype.close = originalClose;
    const current = await openSqliteStores(createOptions(path));
    await current.close();
  }, [
    () => {
      Database.prototype.close = originalClose;
    },
    async () => {
      await old.close();
    },
    () => {
      rmSync(directory, { recursive: true, force: true });
    },
  ]);
});
for (const stage of ['journal', 'fence', 'observation'] as const)
  test(
    'down refuses valid used ' + stage + ' and corrupt successor state without erasing evidence',
    async () => {
      const directory = mkdtempSync(join(tmpdir(), 'recovery-used-down-'));
      const path = join(directory, 'runs.sqlite');
      const options = createOptions(path);
      const stores = await bootstrapSqliteStores(options);
      const database = new Database(path);
      await settleFixture(async () => {
        const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('owner'), 0));
        unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
        const original = unwrapReply(
          await stores.runs.stageRuntimeRequest(
            { ownership, scope: runtimeScope, expectedRevision: 0 },
            authorityRequest(),
          ),
        );
        unwrapReply(
          await stores.runs.beginRecovery({
            kind: 'authority',
            guard: {
              ownership,
              scope: runtimeScope,
              expectedRevision: 1,
              expectedRecoveryRevision: 0,
            },
            intent: {
              version: 1,
              recoveryId: 'recovery',
              target: { kind: 'authority', original },
              begunScopeRevision: 1,
              resolver: { ownerId: ownership.ownerId, epoch: ownership.epoch },
            },
          }),
        );
        if (stage !== 'journal') {
          const scope = await stores.runs.readRuntimeScope(runtimeScope);
          if (scope.kind !== 'pinned' || scope.version !== 2)
            throw new Error('expected current pinned scope');
          const history = scope.recoveries.at(0);
          if (history?.intent.target.kind !== 'authority')
            throw new Error('authority journal required');
          const begin = {
            kind: 'authority' as const,
            guard: {
              ownership,
              scope: runtimeScope,
              expectedRevision: 1,
              expectedRecoveryRevision: 0,
            },
            intent: { ...history.intent, target: history.intent.target },
          };
          const fence = await createRecoveryFenceCall(stores.artifacts, begin, 2);
          unwrapReply(await stores.runs.stageRecoveryFence(fence));
          if (stage === 'observation')
            unwrapReply(
              await stores.runs.recordRecoveryFence(
                await createRecoveryObservationCall(stores.artifacts, fence),
              ),
            );
        }
        const before = captureTransition(database);
        await rejects(downgradeUnusedSqliteStores(options), (cause: unknown) => {
          expect(cause).toMatchObject({ failure: 'used_history', phase: 'transaction' });
          return true;
        });
        expect(captureTransition(database)).toEqual(before);
        database.run('DELETE FROM run_recovery_active');
        const corrupt = captureTransition(database);
        await rejects(downgradeUnusedSqliteStores(options), (cause: unknown) => {
          expect(cause).toMatchObject({ failure: 'corrupt', phase: 'transaction' });
          return true;
        });
        expect(captureTransition(database)).toEqual(corrupt);
      }, [
        () => {
          database.close();
        },
        async () => {
          await stores.close();
        },
        () => {
          rmSync(directory, { recursive: true, force: true });
        },
      ]);
    },
  );
test('readonly inspection cleanup failure is classified before any transition', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'recovery-inspection-close-'));
  const path = join(directory, 'runs.sqlite');
  const old = await createFormat3Fixture(path);
  // eslint-disable-next-line @typescript-eslint/unbound-method -- The test restores the exact native function and invokes it with its original receiver.
  const originalClose = Database.prototype.close;
  const injected = new Error('injected inspection close failure');
  await settleFixture(async () => {
    const before = await old.capture();
    Database.prototype.close = function (...parameters) {
      originalClose.apply(this, parameters);
      if (this.filename === path) throw injected;
    };
    await rejects(upgradeSqliteStores(createOptions(path)), (cause: unknown) => {
      expect(cause).toMatchObject({
        failure: 'cleanup_failed',
        phase: 'preflight',
        cause: injected,
      });
      return true;
    });
    Database.prototype.close = originalClose;
    expect(await old.capture()).toEqual(before);
  }, [
    () => {
      Database.prototype.close = originalClose;
    },
    async () => {
      await old.close();
    },
    () => {
      rmSync(directory, { recursive: true, force: true });
    },
  ]);
});
test('upgrade rejects a partial successor declaration as corrupt before executing migration statements', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'recovery-partial-successor-'));
  const path = join(directory, 'runs.sqlite');
  const old = await createFormat3Fixture(path);
  let observer: Database | undefined;
  await settleFixture(async () => {
    observer = new Database(path);
    observer.run('CREATE TABLE run_recovery_journal (unexpected TEXT)');
    const before = captureTransition(observer);
    await rejects(upgradeSqliteStores(createOptions(path)), (cause: unknown) => {
      expect(cause).toMatchObject({
        failure: 'corrupt',
        phase: 'transaction',
        cause: { message: 'corrupt sqlite physical schema' },
      });
      return true;
    });
    expect(captureTransition(observer)).toEqual(before);
  }, [
    () => {
      observer?.close();
    },
    async () => {
      await old.close();
    },
    () => {
      rmSync(directory, { recursive: true, force: true });
    },
  ]);
});
test('successor audit rolls back a new marker corrupted by the publication dependency', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'recovery-successor-audit-'));
  const path = join(directory, 'runs.sqlite');
  const old = await createFormat3Fixture(path);
  let observer: Database | undefined;
  await settleFixture(async () => {
    observer = new Database(path);
    observer.run(
      'CREATE TRIGGER corrupt_published_marker AFTER UPDATE OF bundle_hash ON run_format BEGIN UPDATE run_recovery_format SET journal_count=1; END',
    );
    const before = captureTransition(observer);
    await rejects(upgradeSqliteStores(createOptions(path)), (cause: unknown) => {
      expect(cause).toMatchObject({
        failure: 'transition_failed',
        phase: 'transaction',
        cause: { message: 'corrupt recovery physical counts' },
      });
      return true;
    });
    expect(captureTransition(observer)).toEqual(before);
  }, [
    () => {
      observer?.close();
    },
    async () => {
      await old.close();
    },
    () => {
      rmSync(directory, { recursive: true, force: true });
    },
  ]);
});
for (const direction of ['upgrade', 'down'] as const)
  test(
    direction + ' abort retains both original SQL failure and independent native close failure',
    async () => {
      const directory = mkdtempSync(join(tmpdir(), 'transition-dual-failure-'));
      const path = join(directory, 'runs.sqlite');
      const old = await createFormat3Fixture(path);
      const options = createOptions(path);
      let observer: Database | undefined;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- Restore the exact native receiver-preserving close after injecting its independent post-close failure.
      const nativeClose = Database.prototype.close;
      const cleanup = new Error('injected native transition close');
      await settleFixture(async () => {
        await old.populate('prepared');
        if (direction === 'down') await upgradeSqliteStores(options);
        observer = new Database(path);
        observer.run(
          direction === 'upgrade'
            ? "CREATE TRIGGER late_abort BEFORE UPDATE OF bundle_hash ON run_format BEGIN SELECT RAISE(ABORT,'injected transition failure'); END"
            : "CREATE TRIGGER late_abort BEFORE UPDATE OF schema_version ON run_meta WHEN NEW.schema_version=3 BEGIN SELECT RAISE(ABORT,'injected transition failure'); END",
        );
        const before = captureTransition(observer);
        let closes = 0;
        Database.prototype.close = function (...parameters) {
          nativeClose.apply(this, parameters);
          if (this.filename === path && ++closes === 2) throw cleanup;
        };
        await rejects(
          (direction === 'upgrade' ? upgradeSqliteStores : downgradeUnusedSqliteStores)(options),
          (cause: unknown) => {
            expect(cause).toMatchObject({ failure: 'cleanup_failed', phase: 'transaction' });
            if (!(cause instanceof Error) || !(cause.cause instanceof AggregateError))
              throw new Error('missing combined transition causes', { cause });
            expect(cause.cause.errors).toHaveLength(2);
            expect(cause.cause.errors[0]).toMatchObject({
              failure: 'transition_failed',
              cause: { message: 'injected transition failure' },
            });
            expect(cause.cause.errors[1]).toBe(cleanup);
            return true;
          },
        );
        Database.prototype.close = nativeClose;
        expect(captureTransition(observer)).toEqual(before);
      }, [
        () => {
          Database.prototype.close = nativeClose;
        },
        async () => {
          await settleFixture(() => {
            observer?.close();
          }, [
            async () => {
              await settleFixture(async () => {
                await old.close();
              }, [
                () => {
                  rmSync(directory, { recursive: true, force: true });
                },
              ]);
            },
          ]);
        },
      ]);
    },
  );
