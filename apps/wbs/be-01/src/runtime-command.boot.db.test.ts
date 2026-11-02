import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RetentionTimer } from '@wbs/core/module/bounded-replay-sweep/retention-timer';
import { ClaimLeaseSweep } from '@wbs/core/module/plan-commands/claim-lease-sweep';
import { createLogger } from '@wbs/observability';
import { openSqliteSource } from '@wbs/store-sqlite';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { buildApp } from './app';
import { bootBe01, type BootOptions, type RunningBe } from './boot';
import { OptimizationCoordinator } from './module/optimization/optimization.feature';
import { openDatabase, refuseToWaitForWriteLock, SQLiteError } from './repository/db';
import { runMigrations } from './repository/migrate';
import { TEST_ORGANIZATION_DEFAULT_LIMITS } from './testing/organization-limits-fixture';

const folder = new URL('../drizzle', import.meta.url).pathname;
const directories: string[] = [];
let running: RunningBe | undefined;
afterEach(async () => {
  await running?.stop();
  running = undefined;
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});
function createOptions(): BootOptions {
  const directory = mkdtempSync(join(tmpdir(), 'runtime-boot-'));
  directories.push(directory);
  return {
    dbPath: join(directory, 'plan.db'),
    port: 0,
    appOrigin: 'http://localhost',
    logger: createLogger({ service: 'be-01', level: 'error' }),
    jwtKey: 'k'.repeat(32),
    gwUrl: 'http://gw.invalid',
    internalAuthSecret: 's'.repeat(32),
    browserSessionAuthority: 'disabled',
    organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
    organizationDnsResolvers: ['10.0.0.53'],
    optimizer: {
      solverVersion: '0.3.0',
      budgetMs: 60000,
      spawn: () => {
        throw new Error('boot must not spawn a solver');
      },
    },
  };
}
function makeApp(composition: Parameters<typeof buildApp>[0]) {
  const app = buildApp(composition);
  app.stop = () => Promise.resolve(app);
  return app;
}
test('boot audit excludes a second connection commit between marker and history reads', async () => {
  const configured = { ...createOptions(), organizationDnsResolvers: undefined };
  runMigrations(configured.dbPath, folder);
  const writer = openSqliteSource({ dbPath: configured.dbPath });
  refuseToWaitForWriteLock(writer.db);
  const observation: { admission: 'unattempted' | 'committed' | 'busy' } = {
    admission: 'unattempted',
  };
  let listeners = 0;
  const commitAuthority = () => {
    writer.db.transaction((transaction) => {
      transaction.run(
        "INSERT INTO runtime_authority (organization_id,project_id,person_id,owner_id,generation) VALUES ('org','project','person','owner',1)",
      );
      transaction.run('UPDATE runtime_ledger SET authority_count=authority_count+1 WHERE id=1');
    });
  };
  try {
    expect(await writer.stores.runtimeCommands.inspectLedger()).toMatchObject({
      authorityCount: 0,
      bindingCount: 0,
      receiptCount: 0,
    });
    running = await bootBe01(configured, {
      openSource: (settings) => {
        const source = openSqliteSource(settings);
        const read = source.db.all.bind(source.db);
        source.db.all = <T>(query: Parameters<typeof source.db.all>[0]) => {
          const rows = read<T>(query);
          // The real marker SELECT has completed before the other connection attempts its commit.
          if (
            observation.admission === 'unattempted' &&
            typeof query === 'string' &&
            query.startsWith('SELECT id,schema_version AS schemaVersion')
          ) {
            try {
              commitAuthority();
              observation.admission = 'committed';
            } catch (cause) {
              const refusal =
                cause instanceof Error && cause.cause instanceof SQLiteError ? cause.cause : cause;
              if (!(refusal instanceof SQLiteError) || refusal.code !== 'SQLITE_BUSY') throw cause;
              expect(refusal.message).toContain('database is locked');
              observation.admission = 'busy';
            }
          }
          return rows;
        };
        return source;
      },
      makeApp,
      startListener: (_app, _port, ready) => {
        listeners += 1;
        ready();
      },
    });
    expect(listeners).toBe(1);
    expect(observation.admission).toBe('busy');
    expect(await writer.stores.runtimeCommands.inspectLedger()).toMatchObject({
      authorityCount: 0,
      bindingCount: 0,
      receiptCount: 0,
    });
    expect(writer.db.all('SELECT * FROM runtime_authority')).toEqual([]);
    commitAuthority();
    expect(await writer.stores.runtimeCommands.inspectLedger()).toMatchObject({
      authorityCount: 1,
      bindingCount: 0,
      receiptCount: 0,
    });
    expect(
      await writer.stores.runtimeCommands.readAuthority({
        organizationId: 'org',
        projectId: 'project',
        personId: 'person',
      }),
    ).toEqual({ ownerId: 'owner', generation: 1 });
  } finally {
    await writer.close();
  }
});

test('holds listener, retention, claim sweep and proof workers until actual ledger inspection settles', async () => {
  const configured = createOptions();
  runMigrations(configured.dbPath, folder);
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  let listeners = 0;
  let workers = 0;
  const retention = spyOn(RetentionTimer.prototype, 'start');
  const optimizer = spyOn(OptimizationCoordinator.prototype, 'start');
  const claimSweep = spyOn(ClaimLeaseSweep.prototype, 'start');
  const booting = bootBe01(configured, {
    openSource: (settings) => {
      const source = openSqliteSource(settings);
      const run = source.uow.run.bind(source.uow);
      source.uow.run = (act) =>
        run(async (scope) => {
          const inspect = scope.stores.runtimeCommands.inspectLedger.bind(
            scope.stores.runtimeCommands,
          );
          scope.stores.runtimeCommands.inspectLedger = async () => {
            entered.resolve(undefined);
            await release.promise;
            return inspect();
          };
          try {
            return await act(scope);
          } finally {
            scope.stores.runtimeCommands.inspectLedger = inspect;
          }
        });
      return source;
    },
    makeApp,
    startListener: (_app, _port, ready) => {
      listeners += 1;
      ready();
    },
    startProofWorker: () => {
      workers += 1;
      const completed = Promise.withResolvers<undefined>();
      return {
        completed: completed.promise,
        stop: () => {
          completed.resolve(undefined);
          return Promise.resolve(undefined);
        },
      };
    },
  });
  try {
    // A missing inspection must fail deterministically instead of hanging the test.
    expect(
      await Promise.race([
        entered.promise.then(() => 'inspection'),
        booting.then(() => 'listening'),
      ]),
    ).toBe('inspection');
    expect(retention).not.toHaveBeenCalled();
    expect(listeners).toBe(0);
    expect(workers).toBe(0);
    expect(optimizer).not.toHaveBeenCalled();
    expect(claimSweep).not.toHaveBeenCalled();
  } finally {
    release.resolve(undefined);
    try {
      running = await booting;
      try {
        expect(optimizer).toHaveBeenCalledTimes(1);
        expect(claimSweep).toHaveBeenCalledTimes(1);
        expect(running.services.claimLeases.isRunning()).toBe(true);
      } finally {
        await running.stop();
      }
      expect(running.services.claimLeases.isRunning()).toBe(false);
      running = undefined;
    } finally {
      optimizer.mockRestore();
      retention.mockRestore();
      claimSweep.mockRestore();
    }
  }
  expect(listeners).toBe(1);
  expect(workers).toBe(1);
});
for (const fault of ['missing', 'corrupt'] as const) {
  test(`rejects ${fault} ledger before acquiring listener or retention and closes source`, async () => {
    const configured = createOptions();
    runMigrations(configured.dbPath, folder);
    const sqlite = openDatabase(configured.dbPath);
    sqlite.run(
      fault === 'missing'
        ? 'DROP TABLE runtime_ledger'
        : 'UPDATE runtime_ledger SET receipt_count = 1',
    );
    sqlite.close();
    let listeners = 0;
    let closes = 0;
    let workers = 0;
    const optimizer = spyOn(OptimizationCoordinator.prototype, 'start');
    const retention = spyOn(RetentionTimer.prototype, 'start');
    const claimSweep = spyOn(ClaimLeaseSweep.prototype, 'start');
    try {
      await expectBootFailure(
        bootBe01(configured, {
          openSource: (settings) => {
            const source = openSqliteSource(settings);
            return {
              ...source,
              close: async () => {
                closes += 1;
                await source.close();
              },
            };
          },
          makeApp,
          startProofWorker: () => {
            workers += 1;
            throw new Error('unready worker started');
          },
          startListener: () => {
            listeners += 1;
          },
        }),
      );
      expect(listeners).toBe(0);
      expect(retention).not.toHaveBeenCalled();
      expect(closes).toBe(1);
      expect(workers).toBe(0);
      expect(optimizer).not.toHaveBeenCalled();
      expect(claimSweep).not.toHaveBeenCalled();
    } finally {
      retention.mockRestore();
      optimizer.mockRestore();
      claimSweep.mockRestore();
    }
  });
}
test('explicit pending migrations create the ledger before awaited inspection', async () => {
  const configured = createOptions();
  let inspected = false;
  running = await bootBe01(
    {
      ...configured,
      organizationDnsResolvers: undefined,
      migrateOnStartup: true,
      migrationsFolder: folder,
    },
    {
      openSource: (settings) => {
        const source = openSqliteSource(settings);
        const run = source.uow.run.bind(source.uow);
        source.uow.run = (act) =>
          run(async (scope) => {
            const inspect = scope.stores.runtimeCommands.inspectLedger.bind(
              scope.stores.runtimeCommands,
            );
            scope.stores.runtimeCommands.inspectLedger = async () => {
              const ledger = await inspect();
              inspected = true;
              return ledger;
            };
            try {
              return await act(scope);
            } finally {
              scope.stores.runtimeCommands.inspectLedger = inspect;
            }
          });
        return source;
      },
      makeApp,
      startListener: (_app, _port, ready) => {
        expect(inspected).toBe(true);
        ready();
      },
    },
  );
  expect(inspected).toBe(true);
});

test('failure after acquiring our listener releases that socket and the source', async () => {
  const configured = { ...createOptions(), organizationDnsResolvers: undefined };
  runMigrations(configured.dbPath, folder);
  let port: number | undefined;
  let closes = 0;
  await expectBootFailure(
    bootBe01(configured, {
      openSource: (settings) => {
        const source = openSqliteSource(settings);
        return {
          ...source,
          close: async () => {
            closes += 1;
            await source.close();
          },
        };
      },
      startListener: (app, requested, ready) => {
        app.listen(requested, ready);
        port = app.server?.port;
        throw new Error('failure after owned listener acquisition');
      },
    }),
  );
  expect(closes).toBe(1);
  expect(port).toBeDefined();
  const response = await fetch(`http://localhost:${String(port)}/health`).catch(
    (cause: unknown) => cause,
  );
  expect(response).toBeInstanceOf(Error);
});

async function expectBootFailure(booting: Promise<RunningBe>): Promise<void> {
  const failure = await booting.then(
    (started) => {
      running = started;
      throw new Error('boot unexpectedly succeeded');
    },
    (cause: unknown) => cause,
  );
  expect(failure).toBeInstanceOf(Error);
}
