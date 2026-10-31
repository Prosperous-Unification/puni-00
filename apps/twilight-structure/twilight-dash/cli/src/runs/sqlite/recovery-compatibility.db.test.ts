import { rejects } from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { decodeOwnership, organizationId, runId } from '../record-codecs';
import { constructFixture } from '../testing/construct-fixture';
import { createManifest, FixtureClock } from '../testing/fixtures';
import {
  createFormat3Fixture,
  type Format3Capture,
  type Format3Command,
  settleFixture,
} from '../testing/format3-fixture';
import { bootstrapFormat4Stores, openFormat4Stores } from '../testing/format4-fixture';
import { downgradeUnusedSqliteStores, upgradeSqliteStores } from './migrate-recovery';
import type { openSqliteStores } from './open-stores';
test('loaded original BB14 writer refuses fresh manifest on physically version4 successor', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'recovery-old-writer-'));
  const path = join(directory, 'runs.sqlite');
  const old = await constructFixture(
    () => createFormat3Fixture(path),
    [
      () => {
        rmSync(directory, { recursive: true });
      },
    ],
  );
  await settleFixture(async () => {
    const ownership = decodeOwnership(await old.populate('authority_pending'));
    await upgradeSqliteStores({
      path,
      organizationId: organizationId('organization'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock: new FixtureClock(),
      maxBusyAttempts: 20,
      busyDelayMilliseconds: 1,
    });
    const before = await old.capture();
    const meta = before.tables.find((table) => table.name === 'run_meta');
    if (meta === undefined) throw new Error('missing captured metadata');
    expect(meta.rows[0]?.[meta.columns.indexOf('schema_version')]).toBe(4n);
    expect(before.schema.some((entry) => entry.name === 'run_recovery_journal')).toBe(true);
    let mutation: unknown;
    try {
      mutation = await old.retainManifest(
        ownership,
        createManifest({ executorVersions: { fresh: '2' } }),
      );
    } catch (cause) {
      mutation = cause;
    }
    const after = await old.capture();
    expect(after.tables.find((table) => table.name === 'run_manifest')).toEqual(
      before.tables.find((table) => table.name === 'run_manifest'),
    );
    expect(mutation).toBeInstanceOf(Error);
    expect(String(mutation)).toContain('incompatible sqlite format bundle hash');
    expect(after).toEqual(before);
  }, [
    async () => {
      await old.close();
    },
    () => {
      rmSync(directory, { recursive: true, force: true });
    },
  ]);
});
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';

import { Database } from 'bun:sqlite';

import { FORMAT4_IDENTITY } from './format';
import type { bootstrapSqliteStores } from './open-stores';
const workspaceRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: import.meta.dirname,
  encoding: 'utf8',
}).trim();
for (const artifact of ['migration.sql', 'down.sql'] as const)
  test(`fresh source with edited 0004 ${artifact} refuses ordinary open and unused down despite identical statements`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'recovery-artifact-identity-'));
    const cli = 'apps/twilight-structure/twilight-dash/cli';
    const options = {
      path: join(directory, 'runs.sqlite'),
      organizationId: organizationId('organization'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock: new FixtureClock(),
      maxBusyAttempts: 2,
      busyDelayMilliseconds: 1,
    };
    let stores: Awaited<ReturnType<typeof bootstrapSqliteStores>> | undefined;
    let observer: Database | undefined;
    let child: ReturnType<typeof Bun.spawn> | undefined;
    let output: Promise<string> | undefined;
    let diagnostic: Promise<string> | undefined;
    await settleFixture(async () => {
      stores = await bootstrapFormat4Stores(options);
      await stores.close();
      observer = new Database(options.path);
      const before = observer.query('SELECT * FROM run_format').all();
      const source = join(directory, 'source');
      mkdirSync(source);
      const archive = execFileSync(
        'git',
        ['archive', '--format=tar', 'b3b594dab4f0153d2ef00a2989bbeb02ea0cbbda'],
        { cwd: workspaceRoot, maxBuffer: 256 * 1024 * 1024 },
      );
      execFileSync('tar', ['-xf', '-', '-C', source], { input: archive });
      symlinkSync(join(workspaceRoot, 'node_modules'), join(source, 'node_modules'), 'dir');
      const path = join(source, cli, 'src/runs/sqlite/migrations/0004-runtime-recovery', artifact);
      const original = readFileSync(path, 'utf8');
      const edited = '\n' + original;
      expect(edited.split('--> statement-breakpoint').map((statement) => statement.trim())).toEqual(
        original.split('--> statement-breakpoint').map((statement) => statement.trim()),
      );
      expect(new Bun.CryptoHasher('sha256').update(edited).digest('hex')).not.toBe(
        new Bun.CryptoHasher('sha256').update(original).digest('hex'),
      );
      writeFileSync(path, edited);
      const worker = join(source, cli, 'src/runs/testing/edited-artifact-probe.ts');
      writeFileSync(
        worker,
        `
import { openSqliteStores } from '../sqlite/open-stores';
import { downgradeUnusedSqliteStores } from '../sqlite/migrate-recovery';
import { FORMAT4_IDENTITY } from '../sqlite/format';
import { organizationId } from '../record-codecs';
const options = { path: ${JSON.stringify(options.path)}, organizationId: organizationId('organization'), capacity: 1, leaseMilliseconds: 100, clock: { read: () => 1000 }, maxBusyAttempts: 2, busyDelayMilliseconds: 1 };
const failures = [];
for (const operation of [openSqliteStores, downgradeUnusedSqliteStores]) {
  try {
    const response = await operation(options);
    if ('close' in response) await response.close();
    throw new Error('edited artifact was admitted');
  } catch (cause) {
    if (!(cause instanceof Error) || !('failure' in cause)) throw cause;
    failures.push({ failure: cause.failure, cause: String(cause.cause) });
  }
}
process.stdout.write(JSON.stringify({ identity: FORMAT4_IDENTITY, failures }));
`,
      );
      const workerProcess = Bun.spawn([process.execPath, worker], {
        cwd: source,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 15000,
      });
      child = workerProcess;
      output = new Response(workerProcess.stdout).text();
      diagnostic = new Response(workerProcess.stderr).text();
      const exit = await workerProcess.exited;
      expect(await diagnostic).toBe('');
      expect(exit).toBe(0);
      const observed: unknown = JSON.parse(await output);
      expect(observed).toMatchObject({
        failures: [
          { failure: 'incompatible', cause: 'Error: incompatible sqlite format bundle hash' },
          { failure: 'incompatible', cause: 'Error: incompatible sqlite format bundle hash' },
        ],
      });
      expect(observed).not.toMatchObject({ identity: { bundleHash: FORMAT4_IDENTITY.bundleHash } });
      expect(observer.query('SELECT * FROM run_format').all()).toEqual(before);
      expect(
        observer
          .query<
            {
              schema_version: number;
            },
            []
          >('SELECT schema_version FROM run_meta')
          .get()?.schema_version,
      ).toBe(4);
    }, [
      async () => {
        if (child !== undefined) {
          if (child.exitCode === null) child.kill('SIGKILL');
          await child.exited;
          await Promise.all([output, diagnostic]);
        }
      },
      async () => {
        await settleFixture(() => {
          observer?.close();
        }, [
          async () => {
            await settleFixture(async () => {
              await stores?.close();
            }, [
              () => {
                rmSync(directory, { recursive: true, force: true });
              },
            ]);
          },
        ]);
      },
    ]);
  });
const legacyMutations = [
  'acquireOwnership',
  'renewOwnership',
  'retainManifest',
  'createRun',
  'admitAttempt',
  'pinRuntimeScope',
  'stageRuntimeRequest',
  'recordRuntimeAcceptance',
  'recordExecution',
  'stageClaim',
  'recordClaimAcceptance',
  'stageTurn',
  'receiveDecision',
  'consumeDecision',
  'commitOutcome',
  'reconcileReceipt',
] as const;
for (const method of legacyMutations)
  test(`pinned old ${method} is fresh and eligible before upgrade and fenced after publication`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'old-mutation-'));
    const path = join(directory, 'runs.sqlite');
    const old = await constructFixture(
      () => createFormat3Fixture(path),
      [
        () => {
          rmSync(directory, { recursive: true });
        },
      ],
    );
    const options = {
      path,
      organizationId: organizationId('organization'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock: { read: () => 1000 },
      maxBusyAttempts: 20,
      busyDelayMilliseconds: 1,
    };
    await settleFixture(async () => {
      const invocation = await old.prepareMutation(method);
      const baseline = join(directory, 'baseline.sqlite');
      const observer = new Database(path);
      await settleFixture(() => {
        observer.query('VACUUM INTO ?').run(baseline);
      }, [
        () => {
          observer.close();
        },
      ]);
      const control = await createFormat3Fixture(baseline, 'open');
      await settleFixture(async () => {
        expect(await control.invoke(invocation)).toMatchObject({ kind: 'applied' });
      }, [
        async () => {
          await control.close();
        },
      ]);
      const predecessor = await old.capture();
      await upgradeSqliteStores(options);
      const before = await old.capture();
      await rejects(old.invoke(invocation), /incompatible/);
      expect(await old.capture()).toEqual(before);
      const stale = staleInvocation(invocation);
      await old.advanceClock(101);
      if (method === 'acquireOwnership') {
        await rejects(old.invoke(stale), /incompatible/);
        expect(await old.capture()).toEqual(before);
      } else {
        expect(await old.invoke(stale)).toEqual({ kind: 'refused', reason: 'owner_stale' });
        expect(await old.capture()).toEqual(withObservedClock(before, 1101n));
        await old.advanceClock(-1);
        await rejects(old.invoke(stale), /clock/);
        expect(await old.capture()).toEqual(withObservedClock(before, 1101n));
        await old.advanceClock(1);
      }
      await downgradeUnusedSqliteStores(options);
      expect(await old.capture()).toEqual(
        method === 'acquireOwnership' ? predecessor : withObservedClock(predecessor, 1101n),
      );
      expect(await old.invoke(invocation)).toMatchObject(
        method === 'acquireOwnership'
          ? { kind: 'applied' }
          : { kind: 'refused', reason: 'owner_stale' },
      );
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
  });
function staleInvocation(invocation: Format3Command): Format3Command {
  const stale = structuredClone(invocation);
  if (stale.method === 'acquireOwnership')
    return { ...stale, parameters: [stale.parameters[0], 999] };
  // Ownership is the actual issued token; advancing the worker clock beyond its lease makes it stale.
  return stale;
}
function withObservedClock(capture: Format3Capture, clock: bigint): Format3Capture {
  return {
    ...capture,
    tables: capture.tables.map((table) =>
      table.name !== 'run_meta'
        ? table
        : {
            ...table,
            rows: table.rows.map((row) =>
              row.map((cell, index) =>
                table.columns[index] === 'last_observed_at' ? clock : cell,
              ),
            ),
          },
    ),
  };
}
function legacyOptions(path: string) {
  return {
    path,
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
    maxBusyAttempts: 15000,
    busyDelayMilliseconds: 1,
  };
}
function throwRejected(settlements: readonly PromiseSettledResult<unknown>[]) {
  const failures: unknown[] = [];
  for (const settlement of settlements)
    if (settlement.status === 'rejected') failures.push(settlement.reason);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'pending compatibility requests failed');
}
async function drainRequests(requests: readonly (Promise<unknown> | undefined)[]) {
  // Proof: T8C2 discarded settled rejections; a real old write refusal disappeared beside independent body/cleanup errors. Restored draining preserves every cause and still closes/removes all resources.
  throwRejected(await Promise.allSettled(requests.filter((request) => request !== undefined)));
}
for (const count of [1, 2] as const)
  test(
    'actual old ' +
      (count === 1 ? 'BUSY writer' : 'same-instance queue') +
      ' resumes only after complete upgrade publication',
    async () => {
      const directory = mkdtempSync(join(tmpdir(), 'old-contention-'));
      const path = join(directory, 'runs.sqlite');
      const old = await constructFixture(
        () => createFormat3Fixture(path),
        [
          () => {
            rmSync(directory, { recursive: true });
          },
        ],
      );
      let lockOwner: Awaited<ReturnType<typeof createFormat3Fixture>> | undefined;
      const calls: Promise<void>[] = [];
      let settledCalls: Promise<PromiseSettledResult<void>[]> | undefined;
      await settleFixture(async () => {
        const invocation = await old.prepareMutation('retainManifest');
        if (invocation.method !== 'retainManifest') throw new Error('manifest invocation required');
        lockOwner = await createFormat3Fixture(path, 'open');
        expect(await lockOwner.holdWrite()).toBe('locked');
        await old.armBusy(count);
        calls.push(rejects(old.invoke(invocation), /incompatible sqlite format bundle hash/));
        if (count === 2)
          calls.push(
            rejects(
              old.invoke({
                ...invocation,
                parameters: [
                  invocation.parameters[0],
                  createManifest({ executorVersions: { queued: '2' } }),
                ],
              }),
              /incompatible sqlite format bundle hash/,
            ),
          );
        settledCalls = Promise.allSettled(calls);
        await old.waitForEvent('busy_paused');
        expect(old.eventCount('invoked')).toBe(count);
        expect(old.eventCount('busy')).toBeGreaterThan(0);
        expect(await lockOwner.releaseWrite()).toBe('released');
        await upgradeSqliteStores(legacyOptions(path));
        const observer = new Database(path, { safeIntegers: true });
        let published: Format3Capture | undefined;
        await settleFixture(() => {
          expect(observer.query('SELECT schema_version FROM run_meta').get()).toEqual({
            schema_version: 4n,
          });
          published = capturePublished(observer);
        }, [
          () => {
            observer.close();
          },
        ]);
        // The old process is parked after a real SQLITE_BUSY, with its provider's retry and all inherited guards installed.
        old.releaseBusy();
        throwRejected(await settledCalls);
        const captured = await old.capture();
        if (published === undefined)
          throw new Error('settled observer did not publish its capture');
        expect(captured).toEqual(published);
        expect(captured.tables.find((table) => table.name === 'run_manifest')?.rows).toEqual([]);
        expect(await downgradeUnusedSqliteStores(legacyOptions(path))).toMatchObject({
          kind: 'downgraded',
        });
        expect(await old.invoke(invocation)).toMatchObject({ kind: 'applied' });
      }, [
        () => {
          old.releaseBusy();
        },
        async () => {
          await lockOwner?.close();
        },
        async () => {
          if (settledCalls !== undefined) throwRejected(await settledCalls);
        },
        () => old.close(),
        () => {
          rmSync(directory, { recursive: true, force: true });
        },
      ]);
    },
  );
test('actual old production callback holds its write lock before upgrade can publish', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'old-callback-'));
  const path = join(directory, 'runs.sqlite');
  const old = await constructFixture(
    () => createFormat3Fixture(path),
    [
      () => {
        rmSync(directory, { recursive: true });
      },
    ],
  );
  let writing: Promise<unknown> | undefined;
  let upgrading: Promise<unknown> | undefined;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Exact native receiver and function restored after observing real SQLite contention.
  const nativeRun = Database.prototype.run;
  await settleFixture(async () => {
    const invocation = await old.prepareMutation('retainManifest');
    await old.armCallback();
    writing = old.invoke(invocation);
    await old.waitForEvent('callback_entered');
    let busy = 0;
    Database.prototype.run = function (sql, ...parameters) {
      try {
        return nativeRun.call(this, sql, ...parameters);
      } catch (cause) {
        if (
          sql === 'BEGIN IMMEDIATE' &&
          cause instanceof Error &&
          'code' in cause &&
          cause.code === 'SQLITE_BUSY'
        )
          busy += 1;
        throw cause;
      }
    };
    upgrading = upgradeSqliteStores(legacyOptions(path));
    const deadline = Date.now() + 15000;
    while (busy === 0) {
      if (Date.now() >= deadline) throw new Error('upgrade contention timed out');
      await Bun.sleep(2);
    }
    expect(busy).toBeGreaterThan(0);
    old.releaseCallback();
    expect(await writing).toMatchObject({ kind: 'applied' });
    expect(await upgrading).toMatchObject({ kind: 'upgraded' });
    const captured = await old.capture();
    expect(captured.tables.find((table) => table.name === 'run_manifest')?.rows.length).toBe(1);
  }, [
    () => {
      Database.prototype.run = nativeRun;
      old.releaseCallback();
    },
    async () => {
      await drainRequests([writing, upgrading]);
    },
    () => old.close(),
    () => {
      rmSync(directory, { recursive: true, force: true });
    },
  ]);
});
test('old artifact insertion duplicate and metadata conflict preserve successor integrity and exact bytes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'old-artifact-'));
  const path = join(directory, 'runs.sqlite');
  const old = await constructFixture(
    () => createFormat3Fixture(path),
    [
      () => {
        rmSync(directory, { recursive: true });
      },
    ],
  );
  let current: Awaited<ReturnType<typeof openSqliteStores>> | undefined;
  await settleFixture(async () => {
    await old.populate('prepared');
    await upgradeSqliteStores(legacyOptions(path));
    const before = await old.capture();
    const bytes = new Uint8Array([0, 255, 128, 10, 13]);
    const retained = await old.retainArtifact(bytes, 'application/octet-stream');
    expect(retained).toMatchObject({ kind: 'retained' });
    expect(await old.retainArtifact(bytes, 'application/octet-stream')).toEqual(retained);
    expect(await old.retainArtifact(bytes, 'text/plain')).toEqual({
      kind: 'refused',
      reason: 'metadata_conflict',
    });
    const after = await old.capture();
    expect(after.schema).toEqual(before.schema);
    for (const table of before.tables)
      if (table.name !== 'run_artifact')
        expect(after.tables.find((candidate) => candidate.name === table.name)).toEqual(table);
    const artifacts = after.tables.find((table) => table.name === 'run_artifact');
    expect(artifacts?.rows.length).toBe(
      (before.tables.find((table) => table.name === 'run_artifact')?.rows.length ?? 0) + 1,
    );
    expect(artifacts?.rows.at(-1)?.at(-1)).toEqual(bytes);
    current = await openFormat4Stores(legacyOptions(path));
    await current.runs.readRun(runId('run'));
    await current.close();
    current = undefined;
    await downgradeUnusedSqliteStores(legacyOptions(path));
    const reopened = await createFormat3Fixture(path, 'open');
    await reopened.close();
  }, [
    async () => {
      await current?.close();
    },
    () => old.close(),
    () => {
      rmSync(directory, { recursive: true, force: true });
    },
  ]);
});
test('genuine new old-open refuses physical4 before mode configuration', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'old-new-open-'));
  const path = join(directory, 'runs.sqlite');
  const old = await constructFixture(
    () => createFormat3Fixture(path),
    [
      () => {
        rmSync(directory, { recursive: true });
      },
    ],
  );
  await settleFixture(async () => {
    await old.populate('prepared');
    await upgradeSqliteStores(legacyOptions(path));
    const before = await old.capture();
    await rejects(createFormat3Fixture(path, 'open'), /incompatible/);
    expect(await old.capture()).toEqual(before);
  }, [
    () => old.close(),
    () => {
      rmSync(directory, { recursive: true, force: true });
    },
  ]);
});
function capturePublished(database: Database): Format3Capture {
  const schema = (['main', 'temp'] as const).flatMap((namespace) =>
    database
      .query<
        {
          type: string;
          name: string;
          tbl_name: string;
          sql: string | null;
        },
        []
      >('SELECT type,name,tbl_name,sql FROM ' + namespace + '.sqlite_schema ORDER BY type,name')
      .all()
      .map((entry) => ({
        database: namespace,
        type: entry.type,
        name: entry.name,
        table: entry.tbl_name,
        sql: entry.sql,
      })),
  );
  const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
  return {
    schema,
    tables: schema
      .filter((entry) => entry.database === 'main' && entry.type === 'table')
      .map((entry) => ({
        name: entry.name,
        columns: database
          .query<
            {
              name: string;
            },
            []
          >('PRAGMA table_info(' + quote(entry.name) + ')')
          .all()
          .map((column) => column.name),
        rows: database
          .query<never, []>('SELECT * FROM ' + quote(entry.name) + ' ORDER BY rowid')
          .values() as Format3Capture['tables'][number]['rows'],
      })),
  };
}
test('old close checkpoints native WAL locally while preserving all logical rows for a new old reader', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'old-close-wal-'));
  const path = join(directory, 'runs.sqlite');
  const old = await constructFixture(
    () => createFormat3Fixture(path),
    [
      () => {
        rmSync(directory, { recursive: true });
      },
    ],
  );
  await settleFixture(async () => {
    await old.populate('prepared');
    const before = await old.capture();
    expect(existsSync(path + '-wal')).toBe(true);
    expect(existsSync(path + '-shm')).toBe(true);
    await old.close();
    expect(await old.worker.exited).toEqual({ code: 0, signal: null });
    expect(existsSync(path + '-wal')).toBe(false);
    expect(existsSync(path + '-shm')).toBe(false);
    const reopened = await createFormat3Fixture(path, 'open');
    await settleFixture(async () => {
      expect(await reopened.capture()).toEqual(before);
    }, [
      async () => {
        await reopened.close();
      },
    ]);
  }, [
    () => old.close(),
    () => {
      rmSync(directory, { recursive: true, force: true });
    },
  ]);
});
test('old fixture cleanup releases a real admitted callback and settles its request before process disposal', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'old-cleanup-callback-'));
  const path = join(directory, 'runs.sqlite');
  const old = await constructFixture(
    () => createFormat3Fixture(path),
    [
      () => {
        rmSync(directory, { recursive: true });
      },
    ],
  );
  let writing: Promise<unknown> | undefined;
  await settleFixture(async () => {
    const invocation = await old.prepareMutation('retainManifest');
    await old.armCallback();
    writing = old.invoke(invocation);
    await old.waitForEvent('callback_entered');
    await old.close();
    expect(await writing).toMatchObject({ kind: 'applied' });
    expect(await old.worker.exited).toEqual({ code: 0, signal: null });
  }, [
    async () => {
      await drainRequests([writing]);
    },
    () => old.close(),
    () => {
      rmSync(directory, { recursive: true, force: true });
    },
  ]);
});
test('cleanup preserves real unvalidated request rejection alongside body and cleanup failures', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'old-cleanup-causes-'));
  const old = await constructFixture(
    () => createFormat3Fixture(join(directory, 'runs.sqlite')),
    [
      () => {
        rmSync(directory, { recursive: true });
      },
    ],
  );
  const bodyFailure = new Error('body failed before observing pending write');
  const cleanupFailure = new Error('independent cleanup failed');
  let writing: Promise<unknown> | undefined;
  let observed: unknown;
  try {
    await settleFixture(async () => {
      const invocation = await old.prepareMutation('retainManifest');
      await upgradeSqliteStores(legacyOptions(join(directory, 'runs.sqlite')));
      writing = old.invoke(invocation);
      throw bodyFailure;
    }, [
      () => drainRequests([writing]),
      () => {
        throw cleanupFailure;
      },
      () => old.close(),
      () => {
        rmSync(directory, { recursive: true, force: true });
      },
    ]);
  } catch (cause) {
    observed = cause;
  }
  expect(observed).toBeInstanceOf(AggregateError);
  if (!(observed instanceof AggregateError)) throw new Error('expected aggregate');
  expect(observed.errors).toContain(bodyFailure);
  expect(observed.errors).toContain(cleanupFailure);
  expect(observed.errors.map(String).join(' ')).toContain('incompatible');
  expect(await old.worker.exited).toEqual({ code: 0, signal: null });
  expect(existsSync(directory)).toBe(false);
});
