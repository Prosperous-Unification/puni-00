import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLogger } from '@wbs/observability';
import { openSqliteSource } from '@wbs/store-sqlite';
import { openConnection } from '@wbs/store-sqlite/db';
import { OPEN } from '@wbs/store-sqlite/gate';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { TypedDependencyRepository } from '@wbs/store-sqlite/typed-dependency';
import { afterEach, expect, it } from 'bun:test';

import { buildApp } from './app';
import { bootBe01, type BootOptions, type RunningBe } from './boot';
import { openDatabase } from './repository/db';
import { runMigrations } from './repository/migrate';
import { startDomainProofWorker } from './runtime/domain-proof-worker';
import { TEST_ORGANIZATION_DEFAULT_LIMITS } from './testing/organization-limits-fixture';

const FOLDER = new URL('../drizzle', import.meta.url).pathname;
const directories: string[] = [];
let running: RunningBe | undefined;
afterEach(async () => {
  await running?.stop();
  running = undefined;
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function database(migrate = true): string {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-dependency-boot-'));
  directories.push(directory);
  const path = join(directory, 'plan.db');
  if (migrate) runMigrations(path, FOLDER);
  return path;
}
function options(dbPath: string): BootOptions {
  return {
    appOrigin: 'http://localhost',
    dbPath,
    port: 0,
    logger: createLogger({ service: 'be-01' }),
    jwtKey: 'k'.repeat(32),
    gwUrl: 'http://gw.invalid',
    internalAuthSecret: 's'.repeat(32),
    browserSessionAuthority: 'disabled',
    organizationDnsResolvers: ['127.0.0.1'],
    organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
    optimizer: {
      solverVersion: '0.4.0',
      budgetMs: 60_000,
      spawn: () => {
        throw new Error('empty store must not spawn solver');
      },
    },
    localIdentity: { id: 'local-dev', username: 'local-dev', scopes: ['read', 'write'] },
  };
}
function snapshot(path: string): string {
  const sqlite = openDatabase(path);
  try {
    const schema = sqlite
      .query<{ type: string; name: string; tbl_name: string; sql: string | null }, []>(
        'SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name',
      )
      .all();
    return JSON.stringify({
      schema,
      tables: schema
        .filter((entry) => entry.type === 'table')
        .map((entry) => ({
          name: entry.name,
          rows: sqlite
            .query(`SELECT * FROM "${entry.name.replaceAll('"', '""')}"`)
            .all()
            .map((row) => JSON.stringify(row))
            .sort(),
        })),
    });
  } finally {
    sqlite.close();
  }
}
async function refuse(
  path: string,
  migrateOnStartup = false,
  migrationsFolder = FOLDER,
): Promise<void> {
  const before = snapshot(path);
  const starts: string[] = [];
  let closes = 0;
  let failed = false;
  try {
    running = await bootBe01(
      { ...options(path), migrateOnStartup, migrationsFolder },
      {
        openSource: (configuration) => {
          const source = openSqliteSource(configuration);
          return {
            ...source,
            get gate() {
              starts.push('browser');
              return source.gate;
            },
            get stores() {
              starts.push('services');
              return source.stores;
            },
            close: async () => {
              closes += 1;
              await source.close();
            },
          };
        },
        makeApp: (configuration) => {
          starts.push('app');
          return buildApp(configuration);
        },
        startListener: (app, port, ready) => {
          starts.push('listener');
          app.listen(port, ready);
        },
        startProofWorker: (schedule) => {
          starts.push('dns');
          return startDomainProofWorker(schedule);
        },
      },
    );
  } catch {
    failed = true;
  }
  if (running !== undefined) {
    if (running.services.retention.isRunning()) starts.push('retention');
    if (running.services.optimizer?.isRunning() === true) starts.push('optimizer');
    await running.stop();
    running = undefined;
  }
  expect(snapshot(path)).toBe(before);
  expect(starts).toEqual([]);
  expect(failed).toBe(true);
  expect(closes).toBe(1);
}
function refuseIncapable(path: string, migrate = false, migrationsFolder = FOLDER) {
  const before = snapshot(path);
  const execution = Bun.spawnSync([
    process.execPath,
    new URL('./testing/incapable-dependency-boot.ts', import.meta.url).pathname,
    path,
    String(migrate),
    migrationsFolder,
  ]);
  expect(execution.exitCode).toBe(0);
  const line = execution.stdout.toString().trim().split('\n').at(-1);
  if (line === undefined) throw new Error('incapable binary observation missing');
  const expectedCauses: unknown = expect.arrayContaining([
    'backend lacks cross-project dependency semantics',
  ]);
  expect(JSON.parse(line) as unknown).toMatchObject({
    failed: true,
    starts: [],
    closes: 1,
    causes: expectedCauses,
  });
  expect(snapshot(path)).toBe(before);
}

it('refuses enabled empty authority before service factories and writes on every restart', () => {
  const path = database();
  seedDependencyAuthority(path);
  refuseIncapable(path);
  refuseIncapable(path, true);
}, 30_000);
for (const fault of [
  'DELETE FROM cross_project_dependency_activation',
  'DROP TABLE cross_project_dependency_activation_receipt',
  "PRAGMA ignore_check_constraints=ON; UPDATE cross_project_dependency_activation SET state='UNKNOWN'",
  "INSERT INTO cross_project_dependency_activation_receipt VALUES (1,'{}')",
])
  it(`refuses broken authority before service factories: ${fault}`, async () => {
    const path = database();
    const sqlite = openDatabase(path);
    try {
      sqlite.run(fault);
    } finally {
      sqlite.close();
    }
    await refuse(path);
  });
it('admits dormant authority and serves health after dev migrations', async () => {
  const path = database(false);
  running = await bootBe01({
    ...options(path),
    organizationDomainProofScheduling: 'disabled',
    migrateOnStartup: true,
    migrationsFolder: FOLDER,
  });
  expect((await fetch(`http://localhost:${String(running.port)}/health`)).status).toBe(200);
});

it('refuses disabled authority retaining an external relationship before service factories', async () => {
  const path = database();
  seedDependencyAuthority(path);
  const connection = openConnection(path);
  try {
    connection.db.run(
      "INSERT INTO users(id,username,password_hash,created_at) VALUES ('u','owner','x',1)",
    );
    connection.db.run("INSERT INTO organization(id,name,created_at) VALUES ('org','Org',1)");
    for (const id of ['a', 'b']) {
      connection.db.run(
        `INSERT INTO project(id,name,owner_id,created_at) VALUES ('${id}','${id}','u',1)`,
      );
      connection.db.run(
        `INSERT INTO project_organization(resource_id,organization_id) VALUES ('${id}','org')`,
      );
      connection.db.run(
        `INSERT INTO work_item(id,project_id,name,position,revision) VALUES ('${id}','${id}','${id}',1,0)`,
      );
    }
    await new TypedDependencyRepository(connection.db, OPEN).add(
      {
        id: 'edge',
        projectId: 'b',
        type: 'FS',
        predecessor: { projectId: 'a', scope: 'whole', workItemId: 'a' },
        successor: { projectId: 'b', scope: 'whole', workItemId: 'b' },
      },
      { at: 2, by: 'u' },
    );
    connection.db.run("UPDATE cross_project_dependency_activation SET state='DISABLED'");
    connection.db.run('DELETE FROM cross_project_dependency_activation_receipt');
  } finally {
    connection.close();
  }
  await refuse(path);
});

it('closes storage when the authority read becomes unreadable before any service', async () => {
  const path = database();
  const before = snapshot(path);
  let closes = 0;
  let factories = 0;
  let caught: unknown;
  try {
    running = await bootBe01(
      {
        ...options(path),
        migrateOnStartup: true,
        migrationsFolder: migrations('CREATE TABLE startup_probe (id INTEGER);'),
      },
      {
        openSource: (configuration) => {
          const source = openSqliteSource(configuration);
          const read = source.db.all.bind(source.db);
          source.db.all = (...queries: Parameters<typeof source.db.all>) => {
            const query = queries[0];
            if (
              typeof query === 'string' &&
              query.includes('SELECT id,state FROM cross_project_dependency_activation')
            )
              throw new Error('injected dependency authority read failure');
            return read(...queries);
          };
          return {
            ...source,
            close: async () => {
              closes += 1;
              await source.close();
            },
          };
        },
        makeApp: (configuration) => {
          factories += 1;
          return buildApp(configuration);
        },
      },
    );
  } catch (failure) {
    caught = failure;
  }
  const causes: string[] = [];
  while (caught instanceof Error) {
    causes.push(caught.message);
    caught = caught.cause;
  }
  expect(causes.join(' | ')).toContain('injected dependency authority read failure');
  expect(closes).toBe(1);
  expect(factories).toBe(0);
  expect(snapshot(path)).toBe(before);
});

function migrations(statement: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-dependency-migrations-'));
  directories.push(directory);
  cpSync(FOLDER, directory, { recursive: true });
  const pending = join(directory, '20261023000000_boot_admission_probe');
  mkdirSync(pending);
  writeFileSync(join(pending, 'migration.sql'), statement);
  return directory;
}
it('refuses enabled empty authority before a pending migration changes schema or ledger', () => {
  const path = database();
  seedDependencyAuthority(path);
  refuseIncapable(path, true, migrations('CREATE TABLE startup_probe (id INTEGER);'));
});
for (const fault of [
  'DROP TABLE cross_project_dependency_activation_receipt',
  'DELETE FROM cross_project_dependency_activation',
  "DELETE FROM __drizzle_migrations WHERE name='20261022212000_add_cross_project_dependency_activation'; DROP TABLE cross_project_dependency_activation_receipt; DROP TABLE cross_project_dependency_activation",
])
  it(`refuses damaged authority before pending migration: ${fault}`, async () => {
    const path = database();
    const sqlite = openDatabase(path);
    try {
      sqlite.run(fault);
    } finally {
      sqlite.close();
    }
    await refuse(path, true, migrations('CREATE TABLE startup_probe (id INTEGER);'));
  });
it('rechecks authority after a pending migration corrupts dormant state', async () => {
  const path = database();
  const starts: string[] = [];
  let closes = 0;
  let failed = false;
  try {
    running = await bootBe01(
      {
        ...options(path),
        migrateOnStartup: true,
        migrationsFolder: migrations('DROP TABLE cross_project_dependency_activation_receipt;'),
      },
      {
        openSource: (configuration) => {
          const source = openSqliteSource(configuration);
          return {
            ...source,
            get stores() {
              starts.push('services');
              return source.stores;
            },
            close: async () => {
              closes += 1;
              await source.close();
            },
          };
        },
        startProofWorker: (schedule) => {
          starts.push('dns');
          return startDomainProofWorker(schedule);
        },
        makeApp: (configuration) => {
          starts.push('app');
          return buildApp(configuration);
        },
        startListener: (app, port, ready) => {
          starts.push('listener');
          app.listen(port, ready);
        },
      },
    );
  } catch {
    failed = true;
  }
  if (running !== undefined) {
    if (running.services.retention.isRunning()) starts.push('retention');
    if (running.services.optimizer?.isRunning() === true) starts.push('optimizer');
    await running.stop();
    running = undefined;
  }
  expect(starts).toEqual([]);
  expect(failed).toBe(true);
  expect(closes).toBe(1);
  const sqlite = openDatabase(path);
  try {
    expect(
      sqlite
        .query(
          "SELECT name FROM sqlite_master WHERE name='cross_project_dependency_activation_receipt'",
        )
        .all(),
    ).toEqual([]);
  } finally {
    sqlite.close();
  }
});
it('admits dormant authority with a pending migration', async () => {
  const path = database();
  running = await bootBe01({
    ...options(path),
    organizationDomainProofScheduling: 'disabled',
    migrateOnStartup: true,
    migrationsFolder: migrations('CREATE TABLE startup_probe (id INTEGER);'),
  });
  expect((await fetch(`http://localhost:${String(running.port)}/health`)).status).toBe(200);
  const sqlite = openDatabase(path);
  try {
    expect(
      sqlite.query("SELECT name FROM sqlite_master WHERE name='startup_probe'").all(),
    ).toHaveLength(1);
  } finally {
    sqlite.close();
  }
});
function historicalDatabase(): string {
  const path = database(false);
  const historical = mkdtempSync(join(tmpdir(), 'wbs-dependency-history-'));
  directories.push(historical);
  for (const name of readdirSync(FOLDER).filter(
    (name) => name < '20261022212000_add_cross_project_dependency_activation',
  ))
    cpSync(join(FOLDER, name), join(historical, name), { recursive: true });
  runMigrations(path, historical);
  return path;
}
it('admits a certified pre-authority historical schema and ledger', async () => {
  const path = historicalDatabase();
  running = await bootBe01({
    ...options(path),
    organizationDomainProofScheduling: 'disabled',
    migrateOnStartup: true,
    migrationsFolder: FOLDER,
  });
  expect((await fetch(`http://localhost:${String(running.port)}/health`)).status).toBe(200);
});
for (const fault of [
  "UPDATE __drizzle_migrations SET hash='altered' WHERE name='20261022211000_add_external_dependencies'",
  'DROP INDEX actual_by_step',
  'DROP TABLE __drizzle_migrations',
  "DELETE FROM __drizzle_migrations WHERE name='20261022210000_add_project_abbreviations'",
])
  it(`refuses uncertified historical storage before pending migration: ${fault}`, async () => {
    const path = historicalDatabase();
    const sqlite = openDatabase(path);
    try {
      sqlite.run(fault);
    } finally {
      sqlite.close();
    }
    await refuse(path, true, migrations('CREATE TABLE startup_probe (id INTEGER);'));
  });
it('refuses an unrecorded partial schema rather than treating it as fresh', async () => {
  const path = database(false);
  const sqlite = openDatabase(path);
  try {
    sqlite.run('CREATE TABLE unrelated (id INTEGER)');
  } finally {
    sqlite.close();
  }
  await refuse(path, true, migrations('CREATE TABLE startup_probe (id INTEGER);'));
});
