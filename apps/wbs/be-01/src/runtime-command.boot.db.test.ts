import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RetentionTimer } from '@wbs/core/module/bounded-replay-sweep/retention-timer';
import { createLogger } from '@wbs/observability';
import { openSqliteSource } from '@wbs/store-sqlite';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { buildApp } from './app';
import { bootBe01, type BootOptions, type RunningBe } from './boot';
import { OptimizationCoordinator } from './module/optimization/optimization.feature';
import { openDatabase } from './repository/db';
import { runMigrations } from './repository/migrate';

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
test('holds listener, retention and proof workers until actual ledger inspection settles', async () => {
  const configured = createOptions();
  runMigrations(configured.dbPath, folder);
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  let listeners = 0;
  let workers = 0;
  const retention = spyOn(RetentionTimer.prototype, 'start');
  const optimizer = spyOn(OptimizationCoordinator.prototype, 'start');
  const booting = bootBe01(configured, {
    openSource: (settings) => {
      const source = openSqliteSource(settings);
      const inspect = source.stores.runtimeCommands.inspectLedger.bind(
        source.stores.runtimeCommands,
      );
      source.stores.runtimeCommands.inspectLedger = async () => {
        entered.resolve(undefined);
        await release.promise;
        return inspect();
      };
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
  } finally {
    release.resolve(undefined);
    running = await booting;
    expect(optimizer).toHaveBeenCalledTimes(1);
    optimizer.mockRestore();
    retention.mockRestore();
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
    } finally {
      retention.mockRestore();
      optimizer.mockRestore();
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
        const inspect = source.stores.runtimeCommands.inspectLedger.bind(
          source.stores.runtimeCommands,
        );
        source.stores.runtimeCommands.inspectLedger = async () => {
          const ledger = await inspect();
          inspected = true;
          return ledger;
        };
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
