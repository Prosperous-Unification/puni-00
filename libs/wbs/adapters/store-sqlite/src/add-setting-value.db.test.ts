import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { servicesOver } from '@wbs/core/compose';
import { LEGACY_EDIT_ADMISSION } from '@wbs/core/ports/edit-admission';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import {
  type AppliedMigration,
  migrationsToRollback,
  readMigrationFolders,
  rollbackAppliedRows,
} from './migrate-down';
import { openSqliteSource } from './source';
import { isSqliteCleanupUnknown } from './sqlite-cleanup';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import { applyHistoricalCatalogueFixture } from './testing/historical-catalogue';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const BASELINE = '20261110110100_widen_organization_audit_projects';
const LIFT_SUFFIX = '_add_setting_value';
const SPACE_SUFFIX = '_space_holds_projects_people_teams';
let directory: string | undefined;
let hasUnknownOwner = false;

beforeEach(() => {
  if (directory !== undefined) throw Error('Previous settings migration fixture is unsettled');
  directory = mkdtempSync(join(tmpdir(), 'wbs-setting-lift-'));
  hasUnknownOwner = false;
});
afterEach(() => {
  if (directory === undefined) return;
  if (hasUnknownOwner)
    throw Error('Uncertain settings migration owner; fixture retained at ' + directory);
  rmSync(directory, { recursive: true });
  directory = undefined;
});

/** The existing add-project migration fixture's owned native read, retaining unknown close failures. */
function withinStore<T>(path: string, use: (sqlite: Database) => T): T {
  let sqlite: Database;
  try {
    sqlite = openDatabase(path);
  } catch (cause: unknown) {
    if (isSqliteCleanupUnknown(cause)) hasUnknownOwner = true;
    throw cause;
  }
  let outcome: { ok: true; value: T } | { ok: false; cause: unknown };
  try {
    outcome = { ok: true, value: use(sqlite) };
  } catch (cause: unknown) {
    outcome = { ok: false, cause };
  }
  let closeFailure: { cause: unknown } | undefined;
  try {
    sqlite.close(true);
  } catch (cause: unknown) {
    hasUnknownOwner = true;
    closeFailure = { cause };
  }
  if (closeFailure !== undefined) {
    if (!outcome.ok)
      throw new AggregateError(
        [outcome.cause, closeFailure.cause],
        'Settings fixture operation and close failed',
        { cause: outcome.cause },
      );
    throw closeFailure.cause;
  }
  if (!outcome.ok) throw outcome.cause;
  return outcome.value;
}

function applyMigrations(path: string, folder: string) {
  try {
    runMigrations(path, folder);
  } catch (cause: unknown) {
    if (isSqliteCleanupUnknown(cause)) hasUnknownOwner = true;
    throw cause;
  }
}

/** Stages the actual predecessor folders, not an independently reproduced schema. */
function prepareStore() {
  if (directory === undefined) throw Error('Settings migration directory was not acquired');
  const migrations = join(directory, 'migrations');
  mkdirSync(migrations);
  const predecessors = readMigrationFolders(FOLDER).filter(({ name }) => name <= BASELINE);
  expect(predecessors.at(-1)?.name).toBe(BASELINE);
  for (const predecessor of predecessors)
    cpSync(join(FOLDER, predecessor.name), join(migrations, predecessor.name), { recursive: true });
  const path = join(directory, 'store.db');
  applyMigrations(path, migrations);
  withinStore(path, (sqlite) => {
    expect(
      sqlite
        .query<{ name: string }, []>('SELECT name FROM __drizzle_migrations ORDER BY created_at')
        .all()
        .map((row) => row.name),
    ).toEqual(predecessors.map((row) => row.name));
    sqlite.run(
      "INSERT INTO users(id,username,created_at) VALUES('settings-author','Settings Author',10)",
    );
    sqlite.run(
      "INSERT INTO organization(id,name,created_at) VALUES('settings-org','Settings Organization',10)",
    );
    sqlite.run(
      "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES('settings-agreed-project','settings-org','Agreed',10,'settings-author'),('settings-default-project','settings-org','Defaults',10,'settings-author'),('settings-empty-project','settings-org','Empty',10,'settings-author')",
    );
    sqlite.run(
      "INSERT INTO work_package(id,project_id,name,restricted,created_at,updated_at,created_by,revision,timezone,pert_weight_optimistic,pert_weight_realistic,pert_weight_pessimistic,budget_factor) VALUES('settings-override','settings-agreed-project','Override',1,10,11,'settings-author',7,'Asia/Tokyo',2,5,2,1.5),('settings-inherited','settings-agreed-project','Inherited',0,10,11,'settings-author',3,'UTC',1,4,1,1.5),('settings-default','settings-default-project','Default',0,10,11,'settings-author',1,'UTC',1,4,1,1)",
    );
    sqlite.run(
      "INSERT INTO work_package_organization(resource_id,organization_id) VALUES('settings-override','settings-org'),('settings-inherited','settings-org'),('settings-default','settings-org')",
    );
    sqlite.run(
      "INSERT INTO step(id,work_package_id,name,code,position) VALUES('settings-step','settings-override','Develop','DEV',10)",
    );
    sqlite.run(
      "INSERT INTO work_item(id,work_package_id,parent_id,position,name) VALUES('settings-leaf','settings-override',NULL,1,'Leaf')",
    );
    sqlite.run(
      "INSERT INTO measure_estimate(work_item_id,step_id,measure_key,measure_id,optimistic,realistic,pessimistic) SELECT 'settings-leaf','settings-step','tokens',id,40,60,100 FROM measure WHERE organization_id='settings-org' AND key='tokens'",
    );
    expect(
      sqlite.query('SELECT optimistic,realistic,pessimistic FROM measure_estimate').all(),
    ).toEqual([{ optimistic: 40, realistic: 60, pessimistic: 100 }]);
    sqlite.run(
      "INSERT INTO step_measure(work_item_id,step_id,metric,value,recorded_at) VALUES('settings-leaf','settings-step','token_actual',20,10)",
    );
    sqlite.run(
      "INSERT INTO calendar_marker(id,work_package_id,date,name,color,created_at) VALUES('settings-marker','settings-override','2030-01-02','Stored holiday','#5d6afe',10)",
    );
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  return { path, migrations };
}

/** Available-folder selection lets the first RED reach the existing migrator and missing feature table. */
function installLift(store: { path: string; migrations: string }) {
  const selected = readMigrationFolders(FOLDER).filter(({ name }) => name.endsWith(LIFT_SUFFIX));
  if (selected.length > 1) throw Error('More than one settings lift migration exists');
  for (const migration of selected) {
    if (migration.name <= BASELINE)
      throw Error('Settings lift must follow the actual predecessor ledger');
    cpSync(join(FOLDER, migration.name), join(store.migrations, migration.name), {
      recursive: true,
    });
  }
  applyMigrations(store.path, store.migrations);
}

/** The runnable cohort starts only after the actual project-space transition. */
function installSpaceTransition(store: { path: string; migrations: string }) {
  const selected = readMigrationFolders(FOLDER).filter(({ name }) => name.endsWith(SPACE_SUFFIX));
  if (selected.length !== 1) throw Error('Expected exactly one project-space transition');
  const migration = selected.at(0);
  if (migration === undefined) throw Error('Project-space transition disappeared');
  cpSync(join(FOLDER, migration.name), join(store.migrations, migration.name), { recursive: true });
  applyMigrations(store.path, store.migrations);
}

/** Borrows the actual rollback engine under this fixture's explicit native owner, preserving its operation/close causes. */
function refuseRollback(store: { path: string; migrations: string }) {
  return withinStore(store.path, (sqlite) => {
    const folders = new Map(
      readMigrationFolders(store.migrations).map((folder) => [folder.name, folder]),
    );
    const applied = sqlite
      .query<AppliedMigration, []>('SELECT id,hash,created_at,name FROM __drizzle_migrations')
      .all();
    return rollbackAppliedRows(sqlite, folders, migrationsToRollback(applied, BASELINE));
  });
}

/** Uses real SQLite stores and the production headroom service; no settings or budget calculation is restated. */
async function readConsumers(path: string) {
  let source: ReturnType<typeof openSqliteSource>;
  try {
    source = openSqliteSource({
      dbPath: path,
      dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    });
  } catch (cause: unknown) {
    if (isSqliteCleanupUnknown(cause)) hasUnknownOwner = true;
    throw cause;
  }
  let outcome:
    | {
        ok: true;
        value: {
          packages: {
            id: string;
            timezone: string | null;
            pertWeights: { optimistic: number; realistic: number; pessimistic: number };
            budgetFactor: number;
          }[];
          headroom: Awaited<
            ReturnType<ReturnType<typeof servicesOver>['workItems']['budgetHeadroomWithin']>
          >;
        };
      }
    | { ok: false; cause: unknown };
  try {
    const packages = [];
    for (const id of ['settings-override', 'settings-inherited', 'settings-default']) {
      const found = await source.stores.workPackages.findById(id);
      if (found === null) throw Error('Persisted settings package absent: ' + id);
      packages.push({
        id,
        timezone: await source.stores.workPackages.timezoneOf(id),
        pertWeights: found.pertWeights,
        budgetFactor: found.budgetFactor,
      });
    }
    const graph = servicesOver(source.stores, {
      dependencyContext: createLocalDependencyContext(source.stores),
      admission: LEGACY_EDIT_ADMISSION,
      clock: testClock,
      broadcast: recordingBroadcaster(),
      scheduler: fastScheduler,
    });
    outcome = {
      ok: true,
      value: {
        packages,
        headroom: await graph.workItems.budgetHeadroomWithin(
          'settings-override',
          { kind: 'legacy' },
          null,
        ),
      },
    };
  } catch (cause: unknown) {
    outcome = { ok: false, cause };
  }
  let closeFailure: { cause: unknown } | undefined;
  try {
    await source.close();
  } catch (cause: unknown) {
    hasUnknownOwner = true;
    closeFailure = { cause };
  }
  if (closeFailure !== undefined) {
    if (!outcome.ok)
      throw new AggregateError(
        [outcome.cause, closeFailure.cause],
        'Settings consumer and source close failed',
        { cause: outcome.cause },
      );
    throw closeFailure.cause;
  }
  if (!outcome.ok) throw outcome.cause;
  return outcome.value;
}

function captureStore(path: string) {
  return withinStore(path, (sqlite) => ({
    schema: sqlite
      .query('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name')
      .all(),
    tables: sqlite
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map(({ name }) => ({
        name,
        rows: sqlite
          .query('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
          .all()
          .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
      })),
  }));
}

function expectRefusal(invoke: () => void, diagnostic: string) {
  let outcome: { rejected: true; cause: unknown } | { rejected: false } = { rejected: false };
  try {
    invoke();
  } catch (cause: unknown) {
    outcome = { rejected: true, cause };
  }
  if (outcome.rejected && isSqliteCleanupUnknown(outcome.cause)) {
    hasUnknownOwner = true;
    throw outcome.cause;
  }
  expect(outcome.rejected).toBe(true);
  if (!outcome.rejected) throw Error('Settings migration unexpectedly succeeded');
  let cause = outcome.cause;
  while (cause instanceof Error && cause.cause !== undefined) cause = cause.cause;
  expect(cause).toBeInstanceOf(Error);
  if (!(cause instanceof Error))
    throw new Error('Settings migration refusal was not an Error', { cause });
  expect(cause.message).toContain(diagnostic);
}

it('lifts persisted non-default settings and agreed project factors while real readers and budget headroom keep their values', async () => {
  const store = prepareStore();
  const expected: Awaited<ReturnType<typeof readConsumers>> = {
    packages: [
      {
        id: 'settings-override',
        timezone: 'Asia/Tokyo',
        pertWeights: { optimistic: 2, realistic: 5, pessimistic: 2 },
        budgetFactor: 1.5,
      },
      {
        id: 'settings-inherited',
        timezone: 'UTC',
        pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
        budgetFactor: 1.5,
      },
      {
        id: 'settings-default',
        timezone: 'UTC',
        pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
        budgetFactor: 1,
      },
    ],
    headroom: {
      steps: [
        {
          workItemId: 'settings-leaf',
          stepId: 'settings-step',
          state: 'startable',
          budgets: {
            tokens: {
              advisory: {
                workItemId: 'settings-leaf',
                cap: 150,
                policy: 'advisory',
                source: 'derived',
                spent: 20,
                remaining: 130,
                exceeded: false,
              },
            },
          },
        },
      ],
    },
  };
  const preceding = withinStore(store.path, (sqlite) => ({
    packages: sqlite
      .query(
        'SELECT id,project_id,timezone,pert_weight_optimistic,pert_weight_realistic,pert_weight_pessimistic,budget_factor FROM work_package ORDER BY id',
      )
      .all(),
    markers: sqlite
      .query('SELECT id,work_package_id,date,name,color,created_at FROM calendar_marker')
      .all(),
    trios: sqlite.query('SELECT optimistic,realistic,pessimistic FROM measure_estimate').all(),
    facts: sqlite.query('SELECT metric,value FROM step_measure').all(),
  }));
  expect(preceding).toEqual({
    packages: [
      {
        id: 'settings-default',
        project_id: 'settings-default-project',
        timezone: 'UTC',
        pert_weight_optimistic: 1,
        pert_weight_realistic: 4,
        pert_weight_pessimistic: 1,
        budget_factor: 1,
      },
      {
        id: 'settings-inherited',
        project_id: 'settings-agreed-project',
        timezone: 'UTC',
        pert_weight_optimistic: 1,
        pert_weight_realistic: 4,
        pert_weight_pessimistic: 1,
        budget_factor: 1.5,
      },
      {
        id: 'settings-override',
        project_id: 'settings-agreed-project',
        timezone: 'Asia/Tokyo',
        pert_weight_optimistic: 2,
        pert_weight_realistic: 5,
        pert_weight_pessimistic: 2,
        budget_factor: 1.5,
      },
    ],
    markers: [
      {
        id: 'settings-marker',
        work_package_id: 'settings-override',
        date: '2030-01-02',
        name: 'Stored holiday',
        color: '#5d6afe',
        created_at: 10,
      },
    ],
    trios: [{ optimistic: 40, realistic: 60, pessimistic: 100 }],
    facts: [{ metric: 'token_actual', value: 20 }],
  });
  const packagesBefore = withinStore(store.path, (sqlite) =>
    sqlite
      .query(
        'SELECT id,project_id,name,restricted,revision,created_at,updated_at,created_by FROM work_package ORDER BY id',
      )
      .all(),
  );
  const migrationStarted = Math.floor(Date.now() / 1000) * 1000;
  installLift(store);
  const migrationFinished = Date.now();
  withinStore(store.path, (sqlite) => {
    expect(
      sqlite
        .query("SELECT name FROM sqlite_master WHERE type='table' AND name='setting_value'")
        .get(),
    ).toEqual({ name: 'setting_value' });
    const lifted = sqlite
      .query<{ scope_kind: string; scope_id: string; key: string; value_json: string }, []>(
        'SELECT scope_kind,scope_id,key,value_json FROM setting_value ORDER BY scope_kind,scope_id,key',
      )
      .all()
      .map((row) => {
        const value: unknown = JSON.parse(row.value_json);
        return { scope_kind: row.scope_kind, scope_id: row.scope_id, key: row.key, value };
      });
    expect(lifted).toEqual([
      {
        scope_kind: 'project',
        scope_id: 'settings-agreed-project',
        key: 'budgetFactor',
        value: 1.5,
      },
      {
        scope_kind: 'work_package',
        scope_id: 'settings-override',
        key: 'pertWeights',
        value: { optimistic: 2, realistic: 5, pessimistic: 2 },
      },
      {
        scope_kind: 'work_package',
        scope_id: 'settings-override',
        key: 'timezone',
        value: 'Asia/Tokyo',
      },
    ]);
    const columns = sqlite
      .query<{ name: string }, []>('PRAGMA table_info(work_package)')
      .all()
      .map((row) => row.name);
    for (const column of [
      'timezone',
      'pert_weight_optimistic',
      'pert_weight_realistic',
      'pert_weight_pessimistic',
      'budget_factor',
    ])
      expect(columns).not.toContain(column);
    expect(
      sqlite
        .query(
          'SELECT id,project_id,name,restricted,revision,created_at,updated_at,created_by FROM work_package ORDER BY id',
        )
        .all(),
    ).toEqual(packagesBefore);
    expect(
      sqlite
        .query('SELECT id,scope_kind,scope_id,date,name,color,created_at FROM calendar_marker')
        .all(),
    ).toEqual([
      {
        id: 'settings-marker',
        scope_kind: 'work_package',
        scope_id: 'settings-override',
        date: '2030-01-02',
        name: 'Stored holiday',
        color: '#5d6afe',
        created_at: 10,
      },
    ]);
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
    const audit = sqlite
      .query<
        { created_at: number; updated_at: number; created_by: string | null; revision: number },
        []
      >(
        'SELECT created_at,updated_at,created_by,revision FROM setting_value ORDER BY scope_kind,scope_id,key',
      )
      .all();
    expect(audit).toHaveLength(3);
    expect(new Set(audit.map((row) => row.created_at)).size).toBe(1);
    for (const row of audit) {
      expect(row.created_at).toBeGreaterThanOrEqual(migrationStarted);
      expect(row.created_at).toBeLessThanOrEqual(migrationFinished);
      expect(row.updated_at).toBe(row.created_at);
      expect(row.created_by).toBeNull();
      expect(row.revision).toBe(0);
    }
    const sources = sqlite
      .query<
        {
          scope_kind: string;
          scope_id: string;
          key: string;
          source_work_package_id: string;
          source_project_id: string;
          source_value_json: string;
          source_created_at: number;
          source_updated_at: number | null;
          source_created_by: string | null;
          source_revision: number;
          recorded_at: number;
        },
        []
      >(
        'SELECT scope_kind,scope_id,key,source_work_package_id,source_project_id,source_value_json,source_created_at,source_updated_at,source_created_by,source_revision,recorded_at FROM setting_value_lift_source ORDER BY scope_kind,scope_id,key,source_work_package_id',
      )
      .all()
      .map(({ source_value_json, ...row }) => {
        const sourceValue: unknown = JSON.parse(source_value_json);
        return { ...row, sourceValue };
      });
    const recordedAt = audit.at(0)?.created_at;
    if (recordedAt === undefined) throw Error('Settings insertion event is absent');
    expect(sources).toEqual([
      {
        scope_kind: 'project',
        scope_id: 'settings-agreed-project',
        key: 'budgetFactor',
        sourceValue: 1.5,
        source_work_package_id: 'settings-inherited',
        source_project_id: 'settings-agreed-project',
        source_created_at: 10,
        source_updated_at: 11,
        source_created_by: 'settings-author',
        source_revision: 3,
        recorded_at: recordedAt,
      },
      {
        scope_kind: 'project',
        scope_id: 'settings-agreed-project',
        key: 'budgetFactor',
        sourceValue: 1.5,
        source_work_package_id: 'settings-override',
        source_project_id: 'settings-agreed-project',
        source_created_at: 10,
        source_updated_at: 11,
        source_created_by: 'settings-author',
        source_revision: 7,
        recorded_at: recordedAt,
      },
      {
        scope_kind: 'work_package',
        scope_id: 'settings-override',
        key: 'pertWeights',
        sourceValue: { optimistic: 2, realistic: 5, pessimistic: 2 },
        source_work_package_id: 'settings-override',
        source_project_id: 'settings-agreed-project',
        source_created_at: 10,
        source_updated_at: 11,
        source_created_by: 'settings-author',
        source_revision: 7,
        recorded_at: recordedAt,
      },
      {
        scope_kind: 'work_package',
        scope_id: 'settings-override',
        key: 'timezone',
        sourceValue: 'Asia/Tokyo',
        source_work_package_id: 'settings-override',
        source_project_id: 'settings-agreed-project',
        source_created_at: 10,
        source_updated_at: 11,
        source_created_by: 'settings-author',
        source_revision: 7,
        recorded_at: recordedAt,
      },
    ]);
  });
  const liftedBeforeDown = captureStore(store.path);
  expectRefusal(() => refuseRollback(store), 'snapshot');
  expect(captureStore(store.path)).toEqual(liftedBeforeDown);
  installSpaceTransition(store);
  const retained = captureStore(store.path);
  const consumerDirectory = mkdtempSync(join(dirname(store.path), 'current-consumer-'));
  const consumerPath = join(consumerDirectory, 'store.db');
  withinStore(store.path, (sqlite) => sqlite.run('VACUUM INTO ?', [consumerPath]));
  withinStore(consumerPath, (sqlite) => {
    // Catalogue conversion requires one common workflow for the two packages under Agreed.
    const copied = sqlite.run(
      "INSERT INTO step(id,work_package_id,name,code,position,estimate_unit,allowance_bps,created_at) SELECT 'settings-step-inherited','settings-inherited',name,code,position,estimate_unit,allowance_bps,created_at FROM step WHERE id='settings-step'",
    );
    expect(copied.changes).toBe(1);
  });
  try {
    applyHistoricalCatalogueFixture(consumerPath, consumerDirectory, {});
  } catch (cause: unknown) {
    if (isSqliteCleanupUnknown(cause)) hasUnknownOwner = true;
    throw cause;
  }
  applyMigrations(consumerPath, FOLDER);
  expect(await readConsumers(consumerPath)).toEqual(expected);
  withinStore(consumerPath, (sqlite) =>
    sqlite.run(
      "UPDATE setting_value SET value_json='2' WHERE scope_kind='project' AND scope_id='settings-agreed-project' AND key='budgetFactor'",
    ),
  );
  const changed = await readConsumers(consumerPath);
  expect(changed.packages.map(({ id, budgetFactor }) => ({ id, budgetFactor }))).toEqual([
    { id: 'settings-override', budgetFactor: 2 },
    { id: 'settings-inherited', budgetFactor: 2 },
    { id: 'settings-default', budgetFactor: 1 },
  ]);
  expect(changed.headroom).toEqual({
    steps: [
      {
        workItemId: 'settings-leaf',
        stepId: 'settings-step',
        state: 'startable',
        budgets: {
          tokens: {
            advisory: {
              workItemId: 'settings-leaf',
              cap: 200,
              policy: 'advisory',
              source: 'derived',
              spent: 20,
              remaining: 180,
              exceeded: false,
            },
          },
        },
      },
    ],
  });
  expect(captureStore(store.path)).toEqual(retained);
  expectRefusal(() => refuseRollback(store), 'snapshot');
  expect(captureStore(store.path)).toEqual(retained);
});

it('refuses disagreeing persisted package budget factors naming their project without changing schema rows or ledger', () => {
  const store = prepareStore();
  withinStore(store.path, (sqlite) =>
    sqlite.run("UPDATE work_package SET budget_factor=2 WHERE id='settings-inherited'"),
  );
  const before = captureStore(store.path);
  expectRefusal(() => {
    installLift(store);
  }, 'settings-agreed-project');
  expect(captureStore(store.path)).toEqual(before);
});
