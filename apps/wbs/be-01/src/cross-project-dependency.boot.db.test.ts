import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLogger } from '@wbs/observability';
import { inspectDependencyBootstrap, openSqliteSource } from '@wbs/store-sqlite';
import { openConnection } from '@wbs/store-sqlite/db';
import { HISTORICAL_DEPENDENCY_MIGRATION } from '@wbs/store-sqlite/dependency-bootstrap-history';
import { OPEN } from '@wbs/store-sqlite/gate';
import { readMigrationFolders } from '@wbs/store-sqlite/migrate-down';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { TypedDependencyRepository } from '@wbs/store-sqlite/typed-dependency';
import { afterEach, expect, it } from 'bun:test';

import { buildApp } from './app';
import { bootBe01 as bootBackend, type BootOptions, type RunningBe } from './boot';
import { openDatabase } from './repository/db';
import { runMigrations } from './repository/migrate';
import { startDomainProofWorker } from './runtime/domain-proof-worker';
import { TEST_ORGANIZATION_DEFAULT_LIMITS } from './testing/organization-limits-fixture';

/** Binds this fixture's owned loopback socket while preserving in-process listener injection. */
const bootBe01: typeof bootBackend = (options, dependencies) => {
  const supplied = dependencies ?? { openSource: openSqliteSource };
  return bootBackend(options, {
    ...supplied,
    startListener:
      supplied.startListener ??
      ((app, port, ready) => {
        app.listen({ hostname: '127.0.0.1', port }, ready);
      }),
  });
};

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
          app.listen({ hostname: '127.0.0.1', port }, ready);
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
  expect((await fetch(`http://127.0.0.1:${String(running.port)}/health`)).status).toBe(200);
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
          app.listen({ hostname: '127.0.0.1', port }, ready);
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
  expect((await fetch(`http://127.0.0.1:${String(running.port)}/health`)).status).toBe(200);
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
  expect((await fetch(`http://127.0.0.1:${String(running.port)}/health`)).status).toBe(200);
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

const DELAYED_DEPENDENCY_MIGRATIONS = [
  '20261022210000_add_project_abbreviations',
  '20261022211000_add_external_dependencies',
  '20261022212000_add_cross_project_dependency_activation',
  '20261022213000_add_optimization_boundary_certificates',
];

/** Reads fixture identities independently of the production Drizzle migration reader. */
function readMigrationIdentities(folder: string): { name: string; hash: string }[] {
  return readdirSync(folder)
    .sort()
    .map((name) => ({
      name,
      hash: createHash('sha256')
        .update(readFileSync(join(folder, name, 'migration.sql')))
        .digest('hex'),
    }));
}

/** Last migration of main acfdc02c; later folders are forward migrations main never applied. */
const MAIN_LEDGER_END = '20261101120000_add_host_job_projection';
/** Live forward migrations after main, so later additions need no edit to these expectations. */
const FORWARD_MIGRATIONS = readMigrationFolders(FOLDER)
  .map(({ name }) => name)
  .filter((name) => !DELAYED_DEPENDENCY_MIGRATIONS.includes(name) && name > MAIN_LEDGER_END);

/** Replays the exact 103 migration.sql blobs from main acfdc02c, without Git at test runtime. */
function currentMainDatabase(usesHistoricalDependency = false): string {
  const path = database(false);
  const historical = mkdtempSync(join(tmpdir(), 'wbs-current-main-history-'));
  directories.push(historical);
  const known = readMigrationIdentities(FOLDER).filter(
    (migration) =>
      !DELAYED_DEPENDENCY_MIGRATIONS.includes(migration.name) && migration.name <= MAIN_LEDGER_END,
  );
  const identities = known.map(({ name, hash }) => ({ name, hash }));
  expect(identities).toHaveLength(103);
  expect(createHash('sha256').update(JSON.stringify(identities)).digest('hex')).toBe(
    '68eb1ad31c377b493d20da473c6d3d18d842914f8d9179c4888f1f2b1e0123b1',
  );
  for (const migration of known)
    cpSync(join(FOLDER, migration.name), join(historical, migration.name), { recursive: true });
  if (usesHistoricalDependency) {
    expect(createHash('sha256').update(HISTORICAL_DEPENDENCY_MIGRATION.sql).digest('hex')).toBe(
      'b9b22317105b8562d53f9547a1401a28409c4a4735b591de8c04f0e02e7a9aba',
    );
    writeFileSync(
      join(historical, HISTORICAL_DEPENDENCY_MIGRATION.name, 'migration.sql'),
      HISTORICAL_DEPENDENCY_MIGRATION.sql,
    );
  }
  runMigrations(path, historical);
  return path;
}

for (const usesHistoricalDependency of [false, true])
  it(`boots the exact current-main store and applies the four delayed dependency migrations and every pending forward migration (historical dependency=${String(usesHistoricalDependency)})`, async () => {
    const path = currentMainDatabase(usesHistoricalDependency);
    const sqlite = openDatabase(path);
    const before = sqlite
      .query<{ name: string; hash: string }, []>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      )
      .all();
    const dependencySchema = sqlite
      .query("SELECT sql FROM sqlite_master WHERE type='table' AND name='dependency'")
      .get();
    try {
      sqlite.run(
        "INSERT INTO users(id,username,password_hash,created_at) VALUES ('main-user','main-owner','x',1)",
      );
      sqlite.run(
        "INSERT INTO project(id,name,owner_id,created_at) VALUES ('main-project','Main project','main-user',1)",
      );
    } finally {
      sqlite.close();
    }
    running = await bootBe01({
      ...options(path),
      organizationDomainProofScheduling: 'disabled',
      migrateOnStartup: true,
      migrationsFolder: FOLDER,
    });
    expect((await fetch(`http://127.0.0.1:${String(running.port)}/health`)).status).toBe(200);
    const migrated = openDatabase(path);
    try {
      const after = migrated
        .query<{ name: string; hash: string }, []>(
          'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
        )
        .all();
      expect(after).toHaveLength(
        103 + DELAYED_DEPENDENCY_MIGRATIONS.length + FORWARD_MIGRATIONS.length,
      );
      expect(
        migrated
          .query("SELECT sql FROM sqlite_master WHERE type='table' AND name='dependency'")
          .get(),
      ).toEqual(dependencySchema);
      expect(
        after.filter(
          ({ name }) =>
            !DELAYED_DEPENDENCY_MIGRATIONS.includes(name) && !FORWARD_MIGRATIONS.includes(name),
        ),
      ).toEqual(before);
      expect(after.filter(({ name }) => FORWARD_MIGRATIONS.includes(name))).toEqual(
        readMigrationIdentities(FOLDER).filter(({ name }) => FORWARD_MIGRATIONS.includes(name)),
      );
      expect(after.filter(({ name }) => DELAYED_DEPENDENCY_MIGRATIONS.includes(name))).toEqual(
        readMigrationIdentities(FOLDER)
          .filter(({ name }) => DELAYED_DEPENDENCY_MIGRATIONS.includes(name))
          .map(({ name, hash }) => ({ name, hash })),
      );
      expect(
        migrated.query("SELECT name,owner_id FROM project WHERE id='main-project'").get(),
      ).toEqual({ name: 'Main project', owner_id: 'main-user' });
      expect(migrated.query('SELECT state FROM cross_project_dependency_activation').all()).toEqual(
        [{ state: 'DISABLED' }],
      );
      expect(migrated.query('SELECT id FROM external_dependency').all()).toEqual([]);
    } finally {
      migrated.close();
    }
  }, 30_000);

for (const fault of [
  "UPDATE __drizzle_migrations SET hash='altered' WHERE name='20261101120000_add_host_job_projection'",
  "DELETE FROM __drizzle_migrations WHERE name='20261101120000_add_host_job_projection'",
  "UPDATE __drizzle_migrations SET name='20261101120001_unknown' WHERE name='20261101120000_add_host_job_projection'",
  'DROP INDEX actual_by_step',
  'DROP TABLE __drizzle_migrations',
  'ALTER TABLE __drizzle_migrations RENAME COLUMN hash TO unreadable_hash',
  "UPDATE __drizzle_migrations SET name=X'41' WHERE name='20261101120000_add_host_job_projection'",
  "UPDATE __drizzle_migrations SET name=NULL WHERE name='20261101120000_add_host_job_projection'",
  "UPDATE __drizzle_migrations SET name=41 WHERE name='20261101120000_add_host_job_projection'",
])
  it(`refuses uncertified current-main storage before startup migration: ${fault}`, async () => {
    const path = currentMainDatabase();
    const sqlite = openDatabase(path);
    try {
      sqlite.run(fault);
    } finally {
      sqlite.close();
    }
    await refuse(path, true);
  }, 30_000);

for (const name of DELAYED_DEPENDENCY_MIGRATIONS)
  it(`refuses partial delayed migration authority before startup migration: ${name}`, async () => {
    const path = currentMainDatabase();
    const migration = readMigrationIdentities(FOLDER).find((migration) => migration.name === name);
    if (migration === undefined) throw new Error(`missing fixture migration ${name}`);
    const sqlite = openDatabase(path);
    try {
      sqlite
        .query('INSERT INTO __drizzle_migrations(name,hash,created_at) VALUES (?,?,?)')
        .run(name, migration.hash, 1);
    } finally {
      sqlite.close();
    }
    await refuse(path, true);
  }, 30_000);

it('refuses matching altered disk and ledger identities outside the pinned main profile', async () => {
  const path = currentMainDatabase();
  const staged = migrations('CREATE TABLE startup_probe (id INTEGER);');
  rmSync(join(staged, '20261023000000_boot_admission_probe'), { recursive: true });
  const name = '20261101120000_add_host_job_projection';
  const sql = await Bun.file(join(staged, name, 'migration.sql')).text();
  writeFileSync(
    join(staged, name, 'migration.sql'),
    `${sql}\n-- unrecognized historical identity\n`,
  );
  const hash = createHash('sha256')
    .update(`${sql}\n-- unrecognized historical identity\n`)
    .digest('hex');
  const sqlite = openDatabase(path);
  try {
    sqlite.query('UPDATE __drizzle_migrations SET hash=? WHERE name=?').run(hash, name);
  } finally {
    sqlite.close();
  }
  await refuse(path, true, staged);
}, 30_000);

for (const usesHistoricalDependency of [false, true])
  it(`refuses unknown historical dependency hash (historical dependency=${String(usesHistoricalDependency)})`, async () => {
    const path = currentMainDatabase(usesHistoricalDependency);
    const sqlite = openDatabase(path);
    try {
      sqlite
        .query('UPDATE __drizzle_migrations SET hash=? WHERE name=?')
        .run('unknown', HISTORICAL_DEPENDENCY_MIGRATION.name);
    } finally {
      sqlite.close();
    }
    await refuse(path, true);
  }, 30_000);

it('refuses historical dependency identity paired with the canonical cascading schema', async () => {
  const path = currentMainDatabase();
  const sqlite = openDatabase(path);
  try {
    sqlite
      .query('UPDATE __drizzle_migrations SET hash=? WHERE name=?')
      .run(HISTORICAL_DEPENDENCY_MIGRATION.hash, HISTORICAL_DEPENDENCY_MIGRATION.name);
  } finally {
    sqlite.close();
  }
  await refuse(path, true);
}, 30_000);

it('refuses an unknown pending migration on the known main profile', async () => {
  // The probe 20261023000000 sorts inside the main ledger range, so it is out of order.
  await refuse(currentMainDatabase(), true, migrations('CREATE TABLE startup_probe (id INTEGER);'));
}, 30_000);

/** Sorts after every real forward migration on disk; the test asserts that. */
const TRAILING_MIGRATION = '20261231000000_probe_forward';

/** Copies the live folder plus one pending forward migration named after every main entry. */
function stageTrailingMigration(): string {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-dependency-trailing-'));
  directories.push(directory);
  cpSync(FOLDER, directory, { recursive: true });
  const trailing = join(directory, TRAILING_MIGRATION);
  mkdirSync(trailing);
  writeFileSync(join(trailing, 'migration.sql'), 'CREATE TABLE probe_forward(id INTEGER);');
  writeFileSync(join(trailing, 'down.sql'), 'DROP TABLE probe_forward;');
  return directory;
}

// Proof: dropping the ledger-end bound in inspectDependencyBootstrap made this boot throw
// "uncertified dependency authority migration set" (0 pass/1 fail); restored it passed (2026-11-08).
it('boots the exact current-main store with a trailing pending forward migration', async () => {
  const path = currentMainDatabase();
  const staged = stageTrailingMigration();
  const sqlite = openDatabase(path);
  let before: { name: string; hash: string }[];
  try {
    before = sqlite
      .query<{ name: string; hash: string }, []>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      )
      .all();
  } finally {
    sqlite.close();
  }
  const db = openConnection(path);
  try {
    expect(inspectDependencyBootstrap(db.db, staged)).toBe('historical');
  } finally {
    db.close();
  }
  running = await bootBe01({
    ...options(path),
    organizationDomainProofScheduling: 'disabled',
    migrateOnStartup: true,
    migrationsFolder: staged,
  });
  expect((await fetch(`http://127.0.0.1:${String(running.port)}/health`)).status).toBe(200);
  const migrated = openDatabase(path);
  try {
    // Application order: the delayed four, then forward migrations, then the trailing probe.
    const after = migrated
      .query<{ name: string; hash: string }, []>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY id',
      )
      .all();
    const added = after.filter(({ name }) => !before.some((row) => row.name === name));
    expect(FORWARD_MIGRATIONS.every((name) => name < TRAILING_MIGRATION)).toBe(true);
    expect(added.map(({ name }) => name)).toEqual([
      ...DELAYED_DEPENDENCY_MIGRATIONS,
      ...FORWARD_MIGRATIONS,
      TRAILING_MIGRATION,
    ]);
    expect(
      migrated
        .query("SELECT name FROM sqlite_master WHERE type='table' AND name='probe_forward'")
        .get(),
    ).toEqual({ name: 'probe_forward' });
  } finally {
    migrated.close();
  }
}, 30_000);
