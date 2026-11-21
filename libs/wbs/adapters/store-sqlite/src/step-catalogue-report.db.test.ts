import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { captureConnectedHistory } from '@wbs/core/module/saved-plans/connected-history';
import { SavedPlanResource } from '@wbs/core/module/saved-plans/saved-plan.resource';
import { summarizeSavedComparisonSide } from '@wbs/core/module/saved-plans/saved-plan-comparison';
import { SavedPlanService } from '@wbs/core/module/saved-plans/saved-plans.feature';
import {
  assembleConnectedCapture,
  connectedRead,
  connectedReads,
} from '@wbs/core/testing/connected-plan-fixture';
import * as domain from '@wbs/domain';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { type Drizzle, openConnection } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { readMigrationFolders } from './migrate-down';
import { isSqliteCleanupUnknown } from './sqlite-cleanup';
import { StepRepository } from './step';
import type { StepCatalogueApplyRequest } from './step-catalogue-apply';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const BASELINE = '20261110110100_widen_organization_audit_projects';
const REPORT_SUFFIX = '_add_step_migration_report';
let directory: string | undefined;
let hasUnknownOwner = false;

beforeEach(() => {
  if (directory !== undefined) throw Error('Previous step-report fixture is unsettled');
  directory = mkdtempSync(join(tmpdir(), 'wbs-step-report-'));
  hasUnknownOwner = false;
});
afterEach(() => {
  if (directory === undefined) return;
  if (hasUnknownOwner) throw Error('Uncertain step-report owner; retained at ' + directory);
  rmSync(directory, { recursive: true });
  directory = undefined;
});

/** Reuses the migration fixture's acquired connection, retaining primary and uncertain close. */
function withinStore<T>(path: string, use: (db: Drizzle) => T): T {
  let connection: ReturnType<typeof openConnection>;
  try {
    connection = openConnection(path);
  } catch (cause: unknown) {
    if (isSqliteCleanupUnknown(cause)) hasUnknownOwner = true;
    throw cause;
  }
  let outcome: { ok: true; value: T } | { ok: false; cause: unknown };
  try {
    outcome = { ok: true, value: use(connection.db) };
  } catch (cause: unknown) {
    outcome = { ok: false, cause };
  }
  try {
    connection.close();
  } catch (cause: unknown) {
    hasUnknownOwner = true;
    if (!outcome.ok)
      throw new AggregateError([outcome.cause, cause], 'Step-report operation and close failed', {
        cause,
      });
    throw cause;
  }
  if (!outcome.ok) throw outcome.cause;
  return outcome.value;
}

function applyMigrations(path: string, folder: string): void {
  try {
    runMigrations(path, folder);
  } catch (cause: unknown) {
    if (isSqliteCleanupUnknown(cause)) hasUnknownOwner = true;
    throw cause;
  }
}

/** Replays the actual predecessor ledger; neither settings nor E46 is reproduced by this test. */
function prepareStore() {
  if (directory === undefined) throw Error('Step-report directory was not acquired');
  const migrations = join(directory, 'migrations');
  mkdirSync(migrations);
  const predecessors = readMigrationFolders(FOLDER).filter(({ name }) => name <= BASELINE);
  expect(predecessors.at(-1)?.name).toBe(BASELINE);
  for (const predecessor of predecessors)
    cpSync(join(FOLDER, predecessor.name), join(migrations, predecessor.name), { recursive: true });
  const path = join(directory, 'store.db');
  applyMigrations(path, migrations);
  withinStore(path, (db) => {
    expect(
      db
        .all<{ name: string }>('SELECT name FROM __drizzle_migrations ORDER BY created_at,name')
        .map((row) => row.name),
    ).toEqual(predecessors.map((row) => row.name));
    db.run(
      "INSERT INTO users(id,username,created_at) VALUES('catalogue-author','Catalogue Author',1)",
    );
    db.run("INSERT INTO organization(id,name,created_at) VALUES('org-a','A',1),('org-b','B',1)");
    db.run(
      "INSERT INTO project(id,organization_id,name,created_at) VALUES('p-one','org-a','One',1),('p-two','org-a','Two',1),('p-foreign','org-b','Foreign',1)",
    );
    db.run(
      "INSERT INTO work_package(id,project_id,name,restricted,created_at,created_by) VALUES('w-one','p-one','One',0,1,'catalogue-author'),('w-two','p-two','Two',0,1,'catalogue-author'),('w-foreign','p-foreign','Foreign',0,1,'catalogue-author')",
    );
    db.run(
      "INSERT INTO work_package_organization(resource_id,organization_id) VALUES('w-one','org-a'),('w-two','org-a'),('w-foreign','org-b')",
    );
    db.run(
      "INSERT INTO step(id,work_package_id,name,code,position,estimate_unit,allowance_bps,allowance_revision,created_at) VALUES('z-dev','w-one','Develop','dev',10,'workdays',500,7,10),('a-dev','w-two','Develop','dev',10,'workdays',500,3,10),('z-qa','w-one','Test','qa',20,'minutes',100,2,1),('a-qa','w-two','Test','qa',20,'minutes',200,8,2),('foreign-dev','w-foreign','Other Meaning','dev',10,'minutes',900,4,1)",
    );
    db.run(
      "INSERT INTO work_item(id,work_package_id,parent_id,position,name) VALUES('leaf-one','w-one',NULL,10,'Leaf One'),('leaf-two','w-two',NULL,10,'Leaf Two')",
    );
    db.run(
      "INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES('leaf-one','z-dev',1,2,3),('leaf-two','a-dev',4,5,6)",
    );
    expect(db.all('SELECT id,project_id FROM work_package ORDER BY id')).toEqual([
      { id: 'w-foreign', project_id: 'p-foreign' },
      { id: 'w-one', project_id: 'p-one' },
      { id: 'w-two', project_id: 'p-two' },
    ]);
    expect(db.all('SELECT id,allowance_bps,allowance_revision FROM step ORDER BY id')).toEqual([
      { id: 'a-dev', allowance_bps: 500, allowance_revision: 3 },
      { id: 'a-qa', allowance_bps: 200, allowance_revision: 8 },
      { id: 'foreign-dev', allowance_bps: 900, allowance_revision: 4 },
      { id: 'z-dev', allowance_bps: 500, allowance_revision: 7 },
      { id: 'z-qa', allowance_bps: 100, allowance_revision: 2 },
    ]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  return { path, migrations };
}

/** Available folders let the first RED reach the real migrator and the missing persistence contract. */
function installReport(store: { path: string; migrations: string }): void {
  const additions = readMigrationFolders(FOLDER).filter(({ name }) => name.endsWith(REPORT_SUFFIX));
  if (additions.length > 1) throw Error('More than one step-report migration exists');
  for (const addition of additions) {
    if (addition.name <= BASELINE) throw Error('Step report must follow its actual predecessor');
    cpSync(join(FOLDER, addition.name), join(store.migrations, addition.name), { recursive: true });
  }
  applyMigrations(store.path, store.migrations);
  expect(
    withinStore(store.path, (db) =>
      db.get<{ name: string } | undefined>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='step_migration_report'",
      ),
    ),
  ).toEqual({ name: 'step_migration_report' });
}

/** Checks only the public returned report; the future module is loaded after the schema-owning oracle. */
async function readReporter() {
  const url = new URL('./step-catalogue-report.ts', import.meta.url).href;
  const exports: unknown = await import(url);
  if (typeof exports !== 'object' || exports === null)
    throw Error('Step-report module has no exports');
  const report: unknown = Reflect.get(exports, 'reportStepCatalogue');
  if (typeof report !== 'function') throw Error('Step-report entry is absent');
  return (db: Drizzle, at: number): unknown => Reflect.apply(report, undefined, [db, at]);
}

function captureExistingStore(path: string) {
  return withinStore(path, (db) => ({
    schema: db.all('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name'),
    tables: db
      .all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'step_migration_report' ORDER BY name",
      )
      .map(({ name }) => ({
        name,
        rows: db.all('SELECT * FROM "' + name.replaceAll('"', '""') + '"').sort((left, right) => {
          const a = JSON.stringify(left),
            b = JSON.stringify(right);
          return a < b ? -1 : a > b ? 1 : 0;
        }),
      })),
  }));
}

function fingerprintOf(report: unknown): string {
  if (typeof report !== 'object' || report === null) throw Error('Step report is not a record');
  const fingerprint: unknown = Reflect.get(report, 'fingerprint');
  expect(typeof fingerprint).toBe('string');
  if (typeof fingerprint !== 'string') throw Error('Step-report fingerprint is not a string');
  expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
  return fingerprint;
}

const IDENTICAL = {
  kind: 'shared_code_identical',
  organizationId: 'org-a',
  code: 'dev',
  survivorStepId: 'a-dev',
  stepIds: ['a-dev', 'z-dev'],
};
const DIVERGENT = {
  kind: 'shared_code',
  organizationId: 'org-a',
  code: 'qa',
  differingFields: ['allowanceBps'],
  steps: [
    { id: 'z-qa', name: 'Test', estimateUnit: 'minutes', allowanceBps: 100 },
    { id: 'a-qa', name: 'Test', estimateUnit: 'minutes', allowanceBps: 200 },
  ],
};

test('reports identical and allowance-divergent organization codes without changing existing stored state', async () => {
  const store = prepareStore();
  installReport(store);
  const reportStepCatalogue = await readReporter();
  const before = captureExistingStore(store.path);
  const report: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
  const fingerprint = fingerprintOf(report);
  expect(report).toEqual({ fingerprint, rows: [IDENTICAL, DIVERGENT] });
  expect(
    withinStore(store.path, (db) =>
      db.all(
        'SELECT kind,organization_id FROM step_migration_report ORDER BY kind,organization_id',
      ),
    ),
  ).toEqual([
    { kind: 'shared_code', organization_id: 'org-a' },
    { kind: 'shared_code_identical', organization_id: 'org-a' },
  ]);
  expect(captureExistingStore(store.path)).toEqual(before);
  expect(withinStore(store.path, (db) => reportStepCatalogue(db, 101))).toEqual(report);
  expect(
    withinStore(store.path, (db) =>
      db.all(
        'SELECT kind,organization_id FROM step_migration_report ORDER BY kind,organization_id',
      ),
    ),
  ).toEqual([
    { kind: 'shared_code', organization_id: 'org-a' },
    { kind: 'shared_code_identical', organization_id: 'org-a' },
  ]);
  expect(captureExistingStore(store.path)).toEqual(before);
});

test('changes the report fingerprint and identical classification when only persisted allowance changes', async () => {
  const store = prepareStore();
  installReport(store);
  const reportStepCatalogue = await readReporter();
  const original: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
  const originalFingerprint = fingerprintOf(original);
  withinStore(store.path, (db) => db.run("UPDATE step SET allowance_bps=100 WHERE id='a-qa'"));
  const before = captureExistingStore(store.path);
  const changed: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 101));
  const fingerprint = fingerprintOf(changed);
  expect(fingerprint).not.toBe(originalFingerprint);
  expect(changed).toEqual({
    fingerprint,
    rows: [
      IDENTICAL,
      {
        kind: 'shared_code_identical',
        organizationId: 'org-a',
        code: 'qa',
        survivorStepId: 'z-qa',
        stepIds: ['a-qa', 'z-qa'],
      },
    ],
  });
  expect(captureExistingStore(store.path)).toEqual(before);
});

function captureReportStore(path: string) {
  return {
    existing: captureExistingStore(path),
    reports: withinStore(path, (db) =>
      db.all('SELECT * FROM step_migration_report ORDER BY organization_id,kind,subject_id'),
    ),
  };
}

function expectReportRefusal(invoke: () => unknown, diagnostic: string): void {
  let outcome: { rejected: false } | { rejected: true; cause: unknown } = { rejected: false };
  try {
    invoke();
  } catch (cause: unknown) {
    outcome = { rejected: true, cause };
  }
  expect(outcome.rejected).toBe(true);
  if (!outcome.rejected) throw Error('Step report unexpectedly accepted the controlled failure');
  expect(outcome.cause).toBeInstanceOf(Error);
  if (!(outcome.cause instanceof Error))
    throw new Error('Step report rejected without an Error', { cause: outcome.cause });
  expect(outcome.cause.message).toContain(diagnostic);
}

for (const shape of ['empty', 'no-shared-code'] as const) {
  test('replaces its stale shared rows with an explicit empty report for ' + shape, async () => {
    const store = prepareStore();
    installReport(store);
    const reportStepCatalogue = await readReporter();
    const original: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
    fingerprintOf(original);
    withinStore(store.path, (db) => {
      if (shape === 'empty') {
        db.run('DELETE FROM estimate');
        db.run('DELETE FROM step');
      } else {
        db.run("UPDATE step SET code='build',name='Build' WHERE id='a-dev'");
        db.run("UPDATE step SET code='review',name='Review' WHERE id='a-qa'");
      }
      expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    });
    const before = captureExistingStore(store.path);
    const report: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 101));
    expect(report).toEqual({ fingerprint: fingerprintOf(report), rows: [] });
    expect(withinStore(store.path, (db) => db.all('SELECT * FROM step_migration_report'))).toEqual(
      [],
    );
    expect(captureExistingStore(store.path)).toEqual(before);
  });
}

test('places a null pre-audit creation time after the actual timestamp when selecting a shared survivor', async () => {
  const store = prepareStore();
  installReport(store);
  const reportStepCatalogue = await readReporter();
  withinStore(store.path, (db) => {
    db.run("UPDATE step SET created_at=NULL WHERE id='a-dev'");
    expect(
      db.all(
        "SELECT id,created_at FROM step WHERE code='dev' AND work_package_id IN ('w-one','w-two') ORDER BY id",
      ),
    ).toEqual([
      { id: 'a-dev', created_at: null },
      { id: 'z-dev', created_at: 10 },
    ]);
  });
  const before = captureExistingStore(store.path);
  const report: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
  expect(report).toEqual({
    fingerprint: fingerprintOf(report),
    rows: [{ ...IDENTICAL, survivorStepId: 'z-dev' }, DIVERGENT],
  });
  expect(captureExistingStore(store.path)).toEqual(before);
});

test('refreshes a stale uncoded report from the same complete capture without applying its suggestion', async () => {
  const store = prepareStore();
  installReport(store);
  const reportStepCatalogue = await readReporter();
  const first: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
  const fingerprint = fingerprintOf(first);
  withinStore(store.path, (db) => {
    db.run(
      "INSERT INTO step(id,work_package_id,name,code,position) VALUES('uncoded-deploy','w-one','Deploy!',NULL,30)",
    );
    const detail = JSON.stringify({
      kind: 'uncoded',
      organizationId: 'org-a',
      stepId: 'uncoded-deploy',
      suggestedCode: 'deploy',
    });
    const escaped = detail.replaceAll("'", "''");
    db.run(
      "INSERT INTO step_migration_report(fingerprint,organization_id,kind,subject_id,detail,reported_at) VALUES('" +
        fingerprint +
        "','org-a','uncoded','uncoded-deploy','" +
        escaped +
        "',90)",
    );
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const retained = withinStore(store.path, (db) =>
    db.all("SELECT * FROM step_migration_report WHERE kind='uncoded'"),
  );
  expect(retained).toHaveLength(1);
  const before = captureExistingStore(store.path);
  const report: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 101));
  const refreshedFingerprint = fingerprintOf(report);
  expect(readReportIssues(report, 'shared_code_identical')).toEqual([IDENTICAL]);
  expect(readReportIssues(report, 'shared_code')).toEqual([DIVERGENT]);
  expect(readReportIssues(report, 'uncoded')).toEqual([UNCODED_DEPLOY]);
  expect(readReportRows(report)).toHaveLength(3);
  const refreshed = withinStore(store.path, (db) =>
    db.all<{ fingerprint: string; reported_at: number; detail: string }>(
      "SELECT fingerprint,reported_at,detail FROM step_migration_report WHERE kind='uncoded'",
    ),
  );
  expect(refreshed).toHaveLength(1);
  const selected = refreshed.at(0);
  if (selected === undefined) throw Error('Complete report lost its uncoded row');
  expect(selected.fingerprint).toBe(refreshedFingerprint);
  expect(selected.reported_at).toBe(101);
  const detail: unknown = JSON.parse(selected.detail);
  expect(detail).toEqual(UNCODED_DEPLOY);
  expect(
    withinStore(store.path, (db) =>
      db.get<{ code: string | null } | undefined>(
        "SELECT code FROM step WHERE id='uncoded-deploy'",
      ),
    ),
  ).toEqual({ code: null });
  expect(captureExistingStore(store.path)).toEqual(before);
});

/** Changes only this disposable trusted-state fixture, restoring original constraints before the read. */
function corruptReportStore(
  path: string,
  change: { sql: string; triggers: readonly string[]; ignoresChecks?: true },
): void {
  withinStore(path, (db) => {
    expect(db.get<{ foreign_keys: number } | undefined>('PRAGMA foreign_keys')).toEqual({
      foreign_keys: 1,
    });
    expect(
      db.get<{ ignore_check_constraints: number } | undefined>('PRAGMA ignore_check_constraints'),
    ).toEqual({ ignore_check_constraints: 0 });
    const triggers = change.triggers.map((name) => {
      const selected = db.get<{ name: string; sql: string } | undefined>(
        "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name='" +
          name.replaceAll("'", "''") +
          "'",
      );
      if (selected === undefined) throw Error('Corruption fixture trigger is absent: ' + name);
      return selected;
    });
    let hasTransaction = false;
    let primary: { cause: unknown } | undefined;
    const cleanup: unknown[] = [];
    try {
      db.run('PRAGMA foreign_keys=OFF');
      db.run('PRAGMA ignore_check_constraints=' + (change.ignoresChecks === true ? 'ON' : 'OFF'));
      db.run('BEGIN');
      hasTransaction = true;
      for (const trigger of triggers)
        db.run('DROP TRIGGER "' + trigger.name.replaceAll('"', '""') + '"');
      db.run(change.sql);
      for (const trigger of triggers) db.run(trigger.sql);
      db.run('COMMIT');
      hasTransaction = false;
    } catch (cause: unknown) {
      primary = { cause };
    }
    if (hasTransaction) {
      try {
        db.run('ROLLBACK');
      } catch (cause: unknown) {
        hasUnknownOwner = true;
        cleanup.push(cause);
      }
    }
    try {
      db.run('PRAGMA ignore_check_constraints=OFF');
    } catch (cause: unknown) {
      hasUnknownOwner = true;
      cleanup.push(cause);
    }
    try {
      db.run('PRAGMA foreign_keys=ON');
    } catch (cause: unknown) {
      hasUnknownOwner = true;
      cleanup.push(cause);
    }
    if (primary !== undefined) {
      if (cleanup.length !== 0)
        throw new AggregateError(
          [primary.cause, ...cleanup],
          'Report corruption fixture and restoration failed',
          { cause: primary.cause },
        );
      throw primary.cause;
    }
    if (cleanup.length !== 0)
      throw new AggregateError(cleanup, 'Report corruption fixture restoration failed', {
        cause: cleanup[0],
      });
    expect(db.get<{ foreign_keys: number } | undefined>('PRAGMA foreign_keys')).toEqual({
      foreign_keys: 1,
    });
    expect(
      db.get<{ ignore_check_constraints: number } | undefined>('PRAGMA ignore_check_constraints'),
    ).toEqual({ ignore_check_constraints: 0 });
    for (const trigger of triggers)
      expect(
        db.get<{ name: string; sql: string | null } | undefined>(
          "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name='" +
            trigger.name.replaceAll("'", "''") +
            "'",
        ),
      ).toEqual(trigger);
  });
}

const REPORT_CORRUPTIONS = [
  {
    name: 'missing package',
    sql: "UPDATE step SET work_package_id='absent-package' WHERE id='z-dev'",
    triggers: [],
    foreign: [{ table: 'step', parent: 'work_package' }],
    diagnostic: 'organization mapping',
  },
  {
    name: 'missing parent',
    sql: "UPDATE work_package SET project_id='absent-project' WHERE id='w-one'",
    triggers: [],
    foreign: [{ table: 'work_package', parent: 'project' }],
    diagnostic: 'missing package or parent',
  },
  {
    name: 'missing map',
    sql: "DELETE FROM work_package_organization WHERE resource_id='w-one'",
    triggers: ['work_package_organization_frozen_delete'],
    foreign: [],
    diagnostic: 'organization mapping',
  },
  {
    name: 'missing organization',
    sql: "UPDATE work_package_organization SET organization_id='absent-org' WHERE resource_id='w-one'",
    triggers: ['work_package_organization_frozen_update'],
    foreign: [{ table: 'work_package_organization', parent: 'organization' }],
    diagnostic: 'inconsistent organization',
  },
  {
    name: 'valid foreign organization with an owned parent',
    sql: "UPDATE work_package_organization SET organization_id='org-b' WHERE resource_id='w-one'",
    triggers: ['work_package_organization_frozen_update'],
    foreign: [],
    diagnostic: 'inconsistent organization',
  },
  {
    name: 'BLOB name',
    sql: "UPDATE step SET name=X'01' WHERE id='z-dev'",
    triggers: [],
    foreign: [],
    diagnostic: 'name is not nonempty text',
  },
  {
    name: 'fractional trusted position',
    sql: "UPDATE step SET position=0.5 WHERE id='z-dev'",
    triggers: [],
    foreign: [],
    diagnostic: 'position is not an integer',
  },
  {
    name: 'unknown unit',
    sql: "UPDATE step SET estimate_unit='seconds' WHERE id='z-dev'",
    triggers: [],
    foreign: [],
    ignoresChecks: true,
    diagnostic: 'malformed estimate unit',
  },
  {
    name: 'allowance outside its stored range',
    sql: "UPDATE step SET allowance_bps=100001 WHERE id='z-dev'",
    triggers: [],
    foreign: [],
    ignoresChecks: true,
    diagnostic: 'malformed allowance',
  },
] as const;

for (const corruption of REPORT_CORRUPTIONS) {
  test(
    'refuses ' + corruption.name + ' before replacing any existing report or other stored row',
    async () => {
      const store = prepareStore();
      installReport(store);
      const reportStepCatalogue = await readReporter();
      const healthy: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
      expect(healthy).toEqual({
        fingerprint: fingerprintOf(healthy),
        rows: [IDENTICAL, DIVERGENT],
      });
      corruptReportStore(store.path, corruption);
      withinStore(store.path, (db) => {
        const foreign = db
          .all<{ table: string; parent: string }>('PRAGMA foreign_key_check')
          .map((row) => ({ table: row.table, parent: row.parent }))
          .sort((left, right) =>
            (left.table + left.parent).localeCompare(right.table + right.parent),
          );
        expect(foreign).toEqual([...corruption.foreign]);
      });
      const before = captureReportStore(store.path);
      expectReportRefusal(
        () => withinStore(store.path, (db) => reportStepCatalogue(db, 101)),
        corruption.diagnostic,
      );
      expect(captureReportStore(store.path)).toEqual(before);
    },
  );
}

test('rolls back the report delete and first replacement when a later actual row insert fails', async () => {
  const store = prepareStore();
  installReport(store);
  const reportStepCatalogue = await readReporter();
  const healthy: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
  expect(healthy).toEqual({ fingerprint: fingerprintOf(healthy), rows: [IDENTICAL, DIVERGENT] });
  withinStore(store.path, (db) => {
    expect(
      db.all('SELECT subject_id,reported_at FROM step_migration_report ORDER BY subject_id'),
    ).toEqual([
      { subject_id: 'dev', reported_at: 100 },
      { subject_id: 'qa', reported_at: 100 },
    ]);
    db.run(
      "CREATE TRIGGER report_replacement_fail BEFORE INSERT ON step_migration_report WHEN NEW.subject_id='qa' BEGIN SELECT RAISE(ABORT,'controlled report replacement failure'); END",
    );
  });
  const before = captureReportStore(store.path);
  const { DrizzleQueryError } = await import('drizzle-orm');
  let refusal: { rejected: false } | { rejected: true; cause: unknown } = { rejected: false };
  try {
    withinStore(store.path, (db) => reportStepCatalogue(db, 101));
  } catch (cause: unknown) {
    refusal = { rejected: true, cause };
  }
  expect(refusal.rejected).toBe(true);
  if (!refusal.rejected) throw Error('Report replacement unexpectedly succeeded');
  expect(refusal.cause).toBeInstanceOf(DrizzleQueryError);
  if (!(refusal.cause instanceof DrizzleQueryError))
    throw new Error('Report replacement did not retain its query failure', {
      cause: refusal.cause,
    });
  expect(refusal.cause.query).toContain('INSERT INTO step_migration_report');
  const subject: unknown = refusal.cause.params[3];
  expect(subject).toBe('qa');
  const nativeCause: unknown = refusal.cause.cause;
  expect(nativeCause).toBeInstanceOf(Error);
  if (!(nativeCause instanceof Error))
    throw new Error('Report query lost its native cause', { cause: nativeCause });
  expect(nativeCause.message).toBe('controlled report replacement failure');
  expect(captureReportStore(store.path)).toEqual(before);
});

test('reverses only the report migration through the actual down runner and reapplies its empty table', async () => {
  const store = prepareStore();
  const before = captureExistingStore(store.path);
  installReport(store);
  const reportStepCatalogue = await readReporter();
  const report: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
  expect(report).toEqual({ fingerprint: fingerprintOf(report), rows: [IDENTICAL, DIVERGENT] });
  const { openDatabase } = await import('./db');
  const { rollbackAppliedRows } = await import('./migrate-down');
  let sqlite: ReturnType<typeof openDatabase>;
  try {
    sqlite = openDatabase(store.path);
  } catch (cause: unknown) {
    if (isSqliteCleanupUnknown(cause)) hasUnknownOwner = true;
    throw cause;
  }
  let outcome: { ok: true; value: string[] } | { ok: false; cause: unknown };
  try {
    const folders = new Map(
      readMigrationFolders(store.migrations).map((folder) => [folder.name, folder]),
    );
    const applied = sqlite
      .query<{ id: number; hash: string; created_at: number; name: string | null }, []>(
        'SELECT id,hash,created_at,name FROM __drizzle_migrations ORDER BY created_at,name',
      )
      .all();
    const selected = applied.filter((row) => row.name?.endsWith(REPORT_SUFFIX));
    expect(selected).toHaveLength(1);
    outcome = { ok: true, value: rollbackAppliedRows(sqlite, folders, selected) };
  } catch (cause: unknown) {
    outcome = { ok: false, cause };
  }
  try {
    sqlite.close(true);
  } catch (cause: unknown) {
    hasUnknownOwner = true;
    if (!outcome.ok)
      throw new AggregateError([outcome.cause, cause], 'Report down operation and close failed', {
        cause,
      });
    throw cause;
  }
  if (!outcome.ok) throw outcome.cause;
  expect(outcome.value).toHaveLength(1);
  expect(outcome.value[0]?.endsWith(REPORT_SUFFIX)).toBe(true);
  expect(captureExistingStore(store.path)).toEqual(before);
  installReport(store);
  expect(withinStore(store.path, (db) => db.all('SELECT * FROM step_migration_report'))).toEqual(
    [],
  );
});

function readReportRows(report: unknown): readonly unknown[] {
  if (typeof report !== 'object' || report === null)
    throw Error('Complete step report is not a record');
  const rows: unknown = Reflect.get(report, 'rows');
  if (!Array.isArray(rows)) throw Error('Complete step report has no row array');
  return rows;
}

function readReportIssues(report: unknown, kind: string): readonly unknown[] {
  return readReportRows(report).filter((row: unknown) => {
    if (typeof row !== 'object' || row === null)
      throw Error('Complete step report has a non-record row');
    const observedKind: unknown = Reflect.get(row, 'kind');
    if (typeof observedKind !== 'string') throw Error('Complete step report row has no kind');
    return observedKind === kind;
  });
}

async function readRulePreflight() {
  const url = new URL('./step-catalogue-report.ts', import.meta.url).href;
  const exported: unknown = await import(url);
  if (typeof exported !== 'object' || exported === null) throw Error('Step report has no exports');
  const read: unknown = Reflect.get(exported, 'readStepMergeRules');
  expect(typeof read).toBe('function');
  if (typeof read !== 'function') throw Error('Step merge-rule preflight is absent');
  return (db: Drizzle, path: string): unknown => Reflect.apply(read, undefined, [db, path]);
}

/** JSON stringification can omit undefined, symbol and function roots. */
function serializeRuleInput(rules: unknown): string | undefined {
  return JSON.stringify(rules);
}

async function writeRuleFile(rules: unknown): Promise<string> {
  if (directory === undefined) throw Error('Step rule fixture directory is absent');
  const path = join(directory, 'merge-rules.json');
  const { writeFileSync } = await import('node:fs');
  const text = serializeRuleInput(rules);
  if (text === undefined) throw Error('Step rules are not serializable');
  writeFileSync(path, text, { mode: 0o600 });
  return path;
}

const UNCODED_DEPLOY = {
  kind: 'uncoded',
  organizationId: 'org-a',
  stepId: 'uncoded-deploy',
  name: 'Deploy!',
  suggestedCode: 'deploy',
};

function seedUncodedDeploy(path: string): void {
  withinStore(path, (db) => {
    db.run(
      "INSERT INTO step(id,work_package_id,name,code,position) VALUES('uncoded-deploy','w-one','Deploy!',NULL,30)",
    );
    expect(
      db.get<{ id: string; name: string; code: string | null } | undefined>(
        "SELECT id,name,code FROM step WHERE id='uncoded-deploy'",
      ),
    ).toEqual({ id: 'uncoded-deploy', name: 'Deploy!', code: null });
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
}

function createConfirmedRules(fingerprint: string) {
  return {
    version: 1,
    fingerprint,
    organizations: {
      'org-a': {
        codes: { qa: { survivorStepId: 'z-qa' } },
        uncoded: { 'uncoded-deploy': { code: 'deploy' } },
      },
    },
  };
}

test('reports the real uncoded suggestion and accepts only an explicit matching confirmation without applying it', async () => {
  const store = prepareStore();
  installReport(store);
  seedUncodedDeploy(store.path);
  const reportStepCatalogue = await readReporter();
  const before = captureExistingStore(store.path);
  const report: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
  expect(readReportIssues(report, 'uncoded')).toEqual([UNCODED_DEPLOY]);
  expect(captureExistingStore(store.path)).toEqual(before);
  const rules = createConfirmedRules(fingerprintOf(report));
  const file = await writeRuleFile(rules);
  const readStepMergeRules = await readRulePreflight();
  const retained = captureReportStore(store.path);
  expect(withinStore(store.path, (db) => readStepMergeRules(db, file))).toEqual(rules);
  expect(captureReportStore(store.path)).toEqual(retained);
  expect(
    withinStore(store.path, (db) =>
      db.get<{ code: string | null } | undefined>(
        "SELECT code FROM step WHERE id='uncoded-deploy'",
      ),
    ),
  ).toEqual({ code: null });
});

for (const confirmation of ['missing', 'different'] as const) {
  test(
    'refuses an uncoded ' + confirmation + ' confirmation before changing any stored state',
    async () => {
      const store = prepareStore();
      installReport(store);
      seedUncodedDeploy(store.path);
      const reportStepCatalogue = await readReporter();
      const report: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
      expect(readReportIssues(report, 'uncoded')).toEqual([UNCODED_DEPLOY]);
      const complete = createConfirmedRules(fingerprintOf(report));
      const rules = {
        ...complete,
        organizations: {
          'org-a': {
            codes: complete.organizations['org-a'].codes,
            uncoded: confirmation === 'missing' ? {} : { 'uncoded-deploy': { code: 'other-code' } },
          },
        },
      };
      const file = await writeRuleFile(rules);
      const readStepMergeRules = await readRulePreflight();
      const before = captureReportStore(store.path);
      expectReportRefusal(
        () => withinStore(store.path, (db) => readStepMergeRules(db, file)),
        'uncoded',
      );
      expect(captureReportStore(store.path)).toEqual(before);
    },
  );
}

test('reports a same-organization name clash across different codes without conflating a foreign name', async () => {
  const store = prepareStore();
  installReport(store);
  withinStore(store.path, (db) => {
    db.run(
      "INSERT INTO step(id,work_package_id,name,code,position) VALUES('inspect','w-two','Review','inspect',30),('review','w-one','Review','review',30),('foreign-review','w-foreign','Review','foreign-review',30)",
    );
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const reportStepCatalogue = await readReporter();
  const before = captureExistingStore(store.path);
  const report: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
  expect(readReportIssues(report, 'name_clash')).toEqual([
    {
      kind: 'name_clash',
      organizationId: 'org-a',
      name: 'Review',
      stepIds: ['inspect', 'review'],
      codes: ['inspect', 'review'],
    },
  ]);
  expect(captureExistingStore(store.path)).toEqual(before);
});

test('reports divergent package code sets at one real project and clears the report after actual regrouping without expanding steps', async () => {
  const store = prepareStore();
  installReport(store);
  withinStore(store.path, (db) => {
    db.run("DELETE FROM estimate WHERE work_item_id='leaf-two'");
    db.run("DELETE FROM step WHERE id='a-dev'");
    db.run("UPDATE work_package SET project_id='p-one' WHERE id='w-two'");
    expect(
      db.all("SELECT id,project_id FROM work_package WHERE id IN ('w-one','w-two') ORDER BY id"),
    ).toEqual([
      { id: 'w-one', project_id: 'p-one' },
      { id: 'w-two', project_id: 'p-one' },
    ]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const reportStepCatalogue = await readReporter();
  const before = captureExistingStore(store.path);
  const report: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
  expect(readReportIssues(report, 'divergent_project_set')).toEqual([
    {
      kind: 'divergent_project_set',
      organizationId: 'org-a',
      projectId: 'p-one',
      packages: [
        { workPackageId: 'w-one', codes: ['dev', 'qa'] },
        { workPackageId: 'w-two', codes: ['qa'] },
      ],
    },
  ]);
  expect(captureExistingStore(store.path)).toEqual(before);
  withinStore(store.path, (db) =>
    db.run("UPDATE work_package SET project_id='p-two' WHERE id='w-two'"),
  );
  const regrouped = captureExistingStore(store.path);
  const after: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 101));
  expect(readReportIssues(after, 'divergent_project_set')).toEqual([]);
  expect(captureExistingStore(store.path)).toEqual(regrouped);
  expect(
    withinStore(store.path, (db) =>
      db.all('SELECT work_package_id,code FROM step ORDER BY work_package_id,code'),
    ),
  ).toEqual([
    { work_package_id: 'w-foreign', code: 'dev' },
    { work_package_id: 'w-one', code: 'dev' },
    { work_package_id: 'w-one', code: 'qa' },
    { work_package_id: 'w-two', code: 'qa' },
  ]);
});

test('reports only a conflicting leaf that actually holds protected facts rather than an unprotected leaf or its typed parent', async () => {
  const store = prepareStore();
  installReport(store);
  withinStore(store.path, (db) => {
    db.run(
      "INSERT INTO work_item_type(id,name) VALUES('catalogue-story','Catalogue Story'),('catalogue-spike','Catalogue Spike')",
    );
    db.run(
      "INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES('catalogue-story','org-a','Catalogue Story'),('catalogue-spike','org-a','Catalogue Spike')",
    );
    db.run(
      "INSERT INTO work_item(id,work_package_id,parent_id,position,name) VALUES('typed-parent','w-one',NULL,0,'Typed Parent')",
    );
    db.run("UPDATE work_item SET parent_id='typed-parent' WHERE id='leaf-one'");
    db.run("DELETE FROM estimate WHERE work_item_id='leaf-two'");
    db.run(
      "INSERT INTO work_item_work_item_type(work_item_id,type_id) VALUES('typed-parent','catalogue-story'),('typed-parent','catalogue-spike'),('leaf-one','catalogue-story'),('leaf-one','catalogue-spike'),('leaf-two','catalogue-story'),('leaf-two','catalogue-spike')",
    );
    expect(
      db.all('SELECT work_item_id,step_id FROM estimate ORDER BY work_item_id,step_id'),
    ).toEqual([{ work_item_id: 'leaf-one', step_id: 'z-dev' }]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const reportStepCatalogue = await readReporter();
  const before = captureExistingStore(store.path);
  const report: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
  expect(readReportIssues(report, 'type_conflict_leaf')).toEqual([
    {
      kind: 'type_conflict_leaf',
      organizationId: 'org-a',
      workPackageId: 'w-one',
      workItemId: 'leaf-one',
      typeIds: ['catalogue-spike', 'catalogue-story'],
    },
  ]);
  expect(captureExistingStore(store.path)).toEqual(before);
});

test('reports an actual cross-package estimate even though both foreign keys and both organization mappings are valid', async () => {
  const store = prepareStore();
  installReport(store);
  withinStore(store.path, (db) => {
    db.run(
      "INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES('leaf-one','a-dev',2,3,4)",
    );
    expect(
      db.get<{ factPackage: string; stepPackage: string } | undefined>(
        "SELECT wi.work_package_id AS factPackage,s.work_package_id AS stepPackage FROM estimate e JOIN work_item wi ON wi.id=e.work_item_id JOIN step s ON s.id=e.step_id WHERE e.work_item_id='leaf-one' AND e.step_id='a-dev'",
      ),
    ).toEqual({ factPackage: 'w-one', stepPackage: 'w-two' });
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const reportStepCatalogue = await readReporter();
  const before = captureExistingStore(store.path);
  const report: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
  expect(readReportIssues(report, 'foreign_package_fact')).toEqual([
    {
      kind: 'foreign_package_fact',
      organizationId: 'org-a',
      table: 'estimate',
      column: 'step_id',
      workItemId: 'leaf-one',
      stepId: 'a-dev',
      workPackageId: 'w-one',
      stepWorkPackageId: 'w-two',
    },
  ]);
  expect(captureExistingStore(store.path)).toEqual(before);
});

test('selects the binary identity survivor from reversed equal-time pure input without relying on SQL row order', async () => {
  const url = new URL(
    '../../../domain/domain/src/step-catalogue/classify-shared-step-codes.ts',
    import.meta.url,
  ).href;
  const exported: unknown = await import(url);
  if (typeof exported !== 'object' || exported === null)
    throw Error('Shared classifier has no exports');
  const classify: unknown = Reflect.get(exported, 'classifySharedStepCodes');
  if (typeof classify !== 'function') throw Error('Shared classifier entry is absent');
  const captured = Object.freeze([
    Object.freeze({
      id: 'é',
      organizationId: 'org-a',
      code: 'dev',
      name: 'Develop',
      estimateUnit: 'workdays',
      allowanceBps: 500,
      createdAt: 10,
    }),
    Object.freeze({
      id: 'z',
      organizationId: 'org-a',
      code: 'dev',
      name: 'Develop',
      estimateUnit: 'workdays',
      allowanceBps: 500,
      createdAt: 10,
    }),
  ]);
  const expected = [
    {
      kind: 'shared_code_identical',
      organizationId: 'org-a',
      code: 'dev',
      survivorStepId: 'z',
      stepIds: ['z', 'é'],
    },
  ];
  const reversed: unknown = Reflect.apply(classify, undefined, [captured]);
  expect(reversed).toEqual(expected);
  const ordered: unknown = Reflect.apply(classify, undefined, [[...captured].reverse()]);
  expect(ordered).toEqual(expected);
  expect(captured.map((step) => step.id)).toEqual(['é', 'z']);
});

for (const fault of ['missing', 'directory', 'invalid-json'] as const) {
  test('refuses a merge-rules file that is ' + fault + ' without writing the store', async () => {
    const store = prepareStore();
    installReport(store);
    const reportStepCatalogue = await readReporter();
    withinStore(store.path, (db) => reportStepCatalogue(db, 100));
    const readStepMergeRules = await readRulePreflight();
    if (directory === undefined) throw Error('Rule fixture directory is absent');
    const file = join(directory, 'unreadable-rules');
    if (fault === 'directory') mkdirSync(file);
    if (fault === 'invalid-json') {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(file, '{');
    }
    const before = captureReportStore(store.path);
    expectReportRefusal(
      () => withinStore(store.path, (db) => readStepMergeRules(db, file)),
      fault === 'missing' ? 'ENOENT' : fault === 'directory' ? 'EISDIR' : 'JSON',
    );
    expect(captureReportStore(store.path)).toEqual(before);
  });
}

const MALFORMED_RULES = [
  { name: 'unknown root projects', change: { projects: {} } },
  { name: 'unsupported version', change: { version: 2 } },
  { name: 'malformed fingerprint', change: { fingerprint: 'not-a-digest' } },
  {
    name: 'unknown organization projects',
    change: {
      organizations: {
        'org-a': { codes: { qa: { survivorStepId: 'z-qa' } }, uncoded: {}, projects: {} },
      },
    },
  },
  {
    name: 'unknown survivor field',
    change: {
      organizations: {
        'org-a': { codes: { qa: { survivorStepId: 'z-qa', merge: true } }, uncoded: {} },
      },
    },
  },
  {
    name: 'unknown confirmation field',
    change: {
      organizations: {
        'org-a': {
          codes: { qa: { survivorStepId: 'z-qa' } },
          uncoded: { 'uncoded-deploy': { code: 'deploy', apply: true } },
        },
      },
    },
  },
  {
    name: 'missing uncoded map',
    change: { organizations: { 'org-a': { codes: { qa: { survivorStepId: 'z-qa' } } } } },
  },
] as const;

for (const fault of MALFORMED_RULES) {
  test(
    'refuses malformed merge rules with ' + fault.name + ' without writing the store',
    async () => {
      const store = prepareStore();
      installReport(store);
      if (fault.name === 'unknown confirmation field') seedUncodedDeploy(store.path);
      const reportStepCatalogue = await readReporter();
      const report = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
      const rules = {
        version: 1,
        fingerprint: fingerprintOf(report),
        organizations: { 'org-a': { codes: { qa: { survivorStepId: 'z-qa' } }, uncoded: {} } },
        ...fault.change,
      };
      const file = await writeRuleFile(rules);
      const readStepMergeRules = await readRulePreflight();
      const before = captureReportStore(store.path);
      expectReportRefusal(
        () => withinStore(store.path, (db) => readStepMergeRules(db, file)),
        'Validation failed',
      );
      expect(captureReportStore(store.path)).toEqual(before);
    },
  );
}

test('refuses a stale merge-rules fingerprint after an actual step write without refreshing report rows', async () => {
  const store = prepareStore();
  installReport(store);
  const reportStepCatalogue = await readReporter();
  const report = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
  const file = await writeRuleFile({
    version: 1,
    fingerprint: fingerprintOf(report),
    organizations: { 'org-a': { codes: { qa: { survivorStepId: 'z-qa' } }, uncoded: {} } },
  });
  withinStore(store.path, (db) => db.run("UPDATE step SET allowance_bps=201 WHERE id='a-qa'"));
  const readStepMergeRules = await readRulePreflight();
  const before = captureReportStore(store.path);
  expectReportRefusal(
    () => withinStore(store.path, (db) => readStepMergeRules(db, file)),
    'fingerprint',
  );
  expect(captureReportStore(store.path)).toEqual(before);
});

const INVALID_RULE_SELECTIONS = [
  {
    name: 'missing divergent survivor',
    organizations: { 'org-a': { codes: {}, uncoded: {} } },
    diagnostic: 'shared_code',
  },
  {
    name: 'survivor from another code',
    organizations: { 'org-a': { codes: { qa: { survivorStepId: 'z-dev' } }, uncoded: {} } },
    diagnostic: 'survivor',
  },
  {
    name: 'survivor from another organization',
    organizations: { 'org-a': { codes: { qa: { survivorStepId: 'foreign-dev' } }, uncoded: {} } },
    diagnostic: 'survivor',
  },
  {
    name: 'unknown organization',
    organizations: {
      'org-a': { codes: { qa: { survivorStepId: 'z-qa' } }, uncoded: {} },
      absent: { codes: {}, uncoded: {} },
    },
    diagnostic: 'organization',
  },
  {
    name: 'unknown code',
    organizations: {
      'org-a': {
        codes: { qa: { survivorStepId: 'z-qa' }, absent: { survivorStepId: 'z-dev' } },
        uncoded: {},
      },
    },
    diagnostic: 'code',
  },
  {
    name: 'unknown uncoded step',
    organizations: {
      'org-a': {
        codes: { qa: { survivorStepId: 'z-qa' } },
        uncoded: { absent: { code: 'absent' } },
      },
    },
    diagnostic: 'uncoded',
  },
] as const;

for (const fault of INVALID_RULE_SELECTIONS) {
  test('refuses merge rules selecting ' + fault.name + ' without writing the store', async () => {
    const store = prepareStore();
    installReport(store);
    const reportStepCatalogue = await readReporter();
    const report = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
    const file = await writeRuleFile({
      version: 1,
      fingerprint: fingerprintOf(report),
      organizations: fault.organizations,
    });
    const readStepMergeRules = await readRulePreflight();
    const before = captureReportStore(store.path);
    expectReportRefusal(
      () => withinStore(store.path, (db) => readStepMergeRules(db, file)),
      fault.diagnostic,
    );
    expect(captureReportStore(store.path)).toEqual(before);
  });
}

test('accepts complete divergent rules without modifying either report or source rows', async () => {
  const store = prepareStore();
  installReport(store);
  const reportStepCatalogue = await readReporter();
  const report = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
  const rules = {
    version: 1,
    fingerprint: fingerprintOf(report),
    organizations: { 'org-a': { codes: { qa: { survivorStepId: 'a-qa' } }, uncoded: {} } },
  };
  const file = await writeRuleFile(rules);
  const readStepMergeRules = await readRulePreflight();
  const before = captureReportStore(store.path);
  expect(withinStore(store.path, (db) => readStepMergeRules(db, file))).toEqual(rules);
  expect(captureReportStore(store.path)).toEqual(before);
});

/** Literal current FK columns, independent of the reporter's registry. Opposite link ends are whole/null. */
const REPORT_FACT_CASES = [
  {
    table: 'estimate',
    column: 'step_id',
    sql: "INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES('leaf-one','z-dev',1,2,3)",
  },
  {
    table: 'actual',
    column: 'step_id',
    sql: "INSERT INTO actual(work_item_id,step_id,days,recorded_at) VALUES('leaf-one','z-dev',2,20)",
  },
  {
    table: 'step_progress',
    column: 'step_id',
    sql: "INSERT INTO step_progress(work_item_id,step_id,state,stated_at) VALUES('leaf-one','z-dev','in_progress',20)",
  },
  {
    table: 'step_measure',
    column: 'step_id',
    sql: "INSERT INTO step_measure(work_item_id,step_id,metric,value,recorded_at) VALUES('leaf-one','z-dev','hours_actual',2,20)",
  },
  {
    table: 'measure_estimate',
    column: 'step_id',
    sql: "INSERT INTO measure_estimate(work_item_id,step_id,measure_key,measure_id,optimistic,realistic,pessimistic) SELECT 'leaf-one','z-dev','tokens',id,1,2,3 FROM measure WHERE organization_id='org-a' AND key='tokens'",
  },
  {
    table: 'step_node_attempt',
    column: 'step_id',
    sql: "INSERT INTO step_node_attempt(work_item_id,step_id,attempt_number,started_at) VALUES('leaf-one','z-dev',1,20)",
  },
  {
    table: 'step_node_attempt_issued',
    column: 'step_id',
    sql: "INSERT INTO step_node_attempt_issued(work_item_id,step_id,issued) VALUES('leaf-one','z-dev',1)",
  },
  {
    table: 'assignment',
    column: 'step_id',
    sql: "INSERT INTO assignment(work_item_id,step_id,person_id) VALUES('leaf-one','z-dev','fact-person')",
  },
  {
    table: 'claim',
    column: 'step_id',
    sql: "INSERT INTO claim(id,work_item_id,step_id,person_id,lease_expires_at) VALUES('fact-claim','leaf-one','z-dev','fact-person',300)",
  },
  {
    table: 'step_blockage',
    column: 'step_id',
    sql: "INSERT INTO step_blockage(work_item_id,step_id,blocked_at) VALUES('leaf-one','z-dev',20)",
  },
  {
    table: 'step_parallel',
    column: 'step_id',
    sql: "INSERT INTO step_parallel(work_item_id,step_id,max_parallel) VALUES('leaf-one','z-dev',2)",
  },
  {
    table: 'typed_dependency',
    column: 'predecessor_step_id',
    sql: "INSERT INTO typed_dependency(id,work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,successor_step_id,type) VALUES('fact-link','w-one','leaf-one','node','z-dev','peer-one','whole',NULL,'FS')",
  },
  {
    table: 'typed_dependency',
    column: 'successor_step_id',
    sql: "INSERT INTO typed_dependency(id,work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,successor_step_id,type) VALUES('fact-link','w-one','peer-one','whole',NULL,'leaf-one','node','z-dev','FS')",
  },
  {
    table: 'external_dependency',
    column: 'predecessor_step_id',
    sql: "INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,successor_step_id,type) VALUES('fact-link','org-a','w-one','w-two','leaf-one','node','z-dev','leaf-two','whole',NULL,'FS')",
  },
  {
    table: 'external_dependency',
    column: 'successor_step_id',
    sql: "INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,successor_step_id,type) VALUES('fact-link','org-a','w-two','w-one','leaf-two','whole',NULL,'leaf-one','node','z-dev','FS')",
  },
] as const;
const REPORT_FACT_TABLES = [...new Set(REPORT_FACT_CASES.map(({ table }) => table))];
const FACT_CONFLICT = {
  kind: 'type_conflict_leaf',
  organizationId: 'org-a',
  workPackageId: 'w-one',
  workItemId: 'leaf-one',
  typeIds: ['fact-spike', 'fact-story'],
};

/** Writes synthetic storage-fixture admission on the existing connection; no activation/participant claim. */
function seedReportFactAdmission(db: Drizzle): void {
  expect(db.all('SELECT id,state FROM step_blockage_activation')).toEqual([
    { id: 1, state: 'DISABLED' },
  ]);
  db.run("UPDATE step_blockage_activation SET state='ENABLED' WHERE id=1");
  expect(db.all('SELECT id,state FROM step_blockage_activation')).toEqual([
    { id: 1, state: 'ENABLED' },
  ]);
  expect(db.all('SELECT id,state FROM cross_work_package_dependency_activation')).toEqual([
    { id: 1, state: 'DISABLED' },
  ]);
  expect(db.all('SELECT * FROM cross_work_package_dependency_activation_receipt')).toEqual([]);
  const receipt = JSON.stringify({
    protocol: 'wbs-dependency-activation',
    version: 1,
    activationId: 'synthetic-storage-fixture',
    databaseIdentity: 'isolated-test-database',
    candidateImage: 'fixture@sha256:' + 'a'.repeat(64),
    rollbackImage: 'fixture@sha256:' + 'b'.repeat(64),
    participantProofSha256: 'c'.repeat(64),
    migrationCaptureSha256: 'd'.repeat(64),
    activatedAt: 1,
  });
  db.run(
    "INSERT INTO cross_work_package_dependency_activation_receipt(id,receipt) VALUES(1,'" +
      receipt.replaceAll("'", "''") +
      "')",
  );
  db.run("UPDATE cross_work_package_dependency_activation SET state='ENABLED' WHERE id=1");
  expect(db.all('SELECT id,state FROM cross_work_package_dependency_activation')).toEqual([
    { id: 1, state: 'ENABLED' },
  ]);
  expect(db.all('SELECT id,receipt FROM cross_work_package_dependency_activation_receipt')).toEqual(
    [{ id: 1, receipt }],
  );
}

/** Clears the baseline estimates so every selected fact column is an independent protection witness. */
function seedReportFactWorld(path: string): void {
  withinStore(path, (db) => {
    db.run('DELETE FROM estimate');
    db.run("INSERT INTO person(id,name) VALUES('fact-person','Fact Person')");
    db.run(
      "INSERT INTO person_organization(resource_id,organization_id,name) VALUES('fact-person','org-a','Fact Person')",
    );
    db.run(
      "INSERT INTO work_item(id,work_package_id,parent_id,position,name) VALUES('peer-one','w-one',NULL,30,'Peer'),('unprotected-one','w-one',NULL,40,'Unprotected'),('anchor-one','w-one',NULL,50,'Anchor')",
    );
    db.run(
      "INSERT INTO work_item_type(id,name) VALUES('fact-story','Fact Story'),('fact-spike','Fact Spike')",
    );
    db.run(
      "INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES('fact-story','org-a','Fact Story'),('fact-spike','org-a','Fact Spike')",
    );
    db.run(
      "INSERT INTO work_item_work_item_type(work_item_id,type_id) VALUES('leaf-one','fact-story'),('leaf-one','fact-spike'),('unprotected-one','fact-story'),('unprotected-one','fact-spike')",
    );
    seedReportFactAdmission(db);
    for (const table of REPORT_FACT_TABLES)
      expect(
        db.get<{ count: number } | undefined>('SELECT COUNT(*) AS count FROM "' + table + '"'),
      ).toEqual({ count: 0 });
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
}

test('covers the literal fifteen step foreign-key columns in thirteen actual predecessor tables', () => {
  const store = prepareStore();
  const observed = withinStore(store.path, (db) =>
    REPORT_FACT_TABLES.flatMap((table) =>
      db
        .all<{ table: string; from: string; to: string }>(
          'PRAGMA foreign_key_list("' + table + '")',
        )
        .filter((row) => row.table === 'step' && row.to === 'id')
        .map((row) => ({ table, column: row.from })),
    ).sort((left, right) => {
      const leftKey = left.table + '.' + left.column,
        rightKey = right.table + '.' + right.column;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    }),
  );
  expect(observed).toEqual([
    { table: 'actual', column: 'step_id' },
    { table: 'assignment', column: 'step_id' },
    { table: 'claim', column: 'step_id' },
    { table: 'estimate', column: 'step_id' },
    { table: 'external_dependency', column: 'predecessor_step_id' },
    { table: 'external_dependency', column: 'successor_step_id' },
    { table: 'measure_estimate', column: 'step_id' },
    { table: 'step_blockage', column: 'step_id' },
    { table: 'step_measure', column: 'step_id' },
    { table: 'step_node_attempt', column: 'step_id' },
    { table: 'step_node_attempt_issued', column: 'step_id' },
    { table: 'step_parallel', column: 'step_id' },
    { table: 'step_progress', column: 'step_id' },
    { table: 'typed_dependency', column: 'predecessor_step_id' },
    { table: 'typed_dependency', column: 'successor_step_id' },
  ]);
  expect(REPORT_FACT_CASES).toHaveLength(15);
  expect(REPORT_FACT_TABLES).toHaveLength(13);
});

for (const fact of REPORT_FACT_CASES) {
  test(
    'protects a typed-conflict leaf through actual ' + fact.table + '.' + fact.column + ' alone',
    async () => {
      const store = prepareStore();
      installReport(store);
      seedReportFactWorld(store.path);
      withinStore(store.path, (db) => {
        db.run(fact.sql);
        expect(
          db.get<{ selectedStep: string | null } | undefined>(
            'SELECT ' + fact.column + ' AS selectedStep FROM "' + fact.table + '"',
          ),
        ).toEqual({ selectedStep: 'z-dev' });
        for (const table of REPORT_FACT_TABLES)
          expect(
            db.get<{ count: number } | undefined>('SELECT COUNT(*) AS count FROM "' + table + '"'),
          ).toEqual({ count: table === fact.table ? 1 : 0 });
        expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
      });
      const reportStepCatalogue = await readReporter();
      const before = captureExistingStore(store.path);
      const report: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
      expect(report).toEqual({
        fingerprint: fingerprintOf(report),
        rows: [IDENTICAL, DIVERGENT, FACT_CONFLICT],
      });
      expect(captureExistingStore(store.path)).toEqual(before);
    },
  );
}

const REPORT_SCOPE_CASES = [
  {
    name: 'subtree claim with a null step',
    table: 'claim',
    sql: "INSERT INTO claim(id,work_item_id,step_id,person_id) VALUES('scope-claim','fact-parent',NULL,'fact-person')",
  },
  {
    name: 'internal whole parent with null endpoints',
    table: 'typed_dependency',
    sql: "INSERT INTO typed_dependency(id,work_package_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES('scope-link','w-one','fact-parent','whole','anchor-one','whole','FS')",
  },
  {
    name: 'internal descendant-step parent',
    table: 'typed_dependency',
    sql: "INSERT INTO typed_dependency(id,work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,type) VALUES('scope-link','w-one','fact-parent','descendant-step','z-dev','anchor-one','whole','FS')",
  },
  {
    name: 'external whole parent with null endpoints',
    table: 'external_dependency',
    sql: "INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES('scope-link','org-a','w-one','w-two','fact-parent','whole','leaf-two','whole','FS')",
  },
  {
    name: 'external descendant-step parent',
    table: 'external_dependency',
    sql: "INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,type) VALUES('scope-link','org-a','w-one','w-two','fact-parent','descendant-step','z-dev','leaf-two','whole','FS')",
  },
] as const;

for (const selector of REPORT_SCOPE_CASES) {
  test('protects only actual descendant leaves for ' + selector.name, async () => {
    const store = prepareStore();
    installReport(store);
    seedReportFactWorld(store.path);
    withinStore(store.path, (db) => {
      db.run(
        "INSERT INTO work_item(id,work_package_id,parent_id,position,name) VALUES('fact-parent','w-one',NULL,0,'Fact Parent')",
      );
      db.run("UPDATE work_item SET parent_id='fact-parent' WHERE id IN ('leaf-one','peer-one')");
      db.run(
        "INSERT INTO work_item_work_item_type(work_item_id,type_id) VALUES('fact-parent','fact-story'),('fact-parent','fact-spike'),('peer-one','fact-story'),('peer-one','fact-spike')",
      );
      db.run(selector.sql);
      expect(
        db.get<{ count: number } | undefined>(
          'SELECT COUNT(*) AS count FROM "' + selector.table + '"',
        ),
      ).toEqual({ count: 1 });
      expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    });
    const reportStepCatalogue = await readReporter(),
      before = captureExistingStore(store.path);
    const report: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
    expect(report).toEqual({
      fingerprint: fingerprintOf(report),
      rows: [
        IDENTICAL,
        DIVERGENT,
        FACT_CONFLICT,
        {
          kind: 'type_conflict_leaf',
          organizationId: 'org-a',
          workPackageId: 'w-one',
          workItemId: 'peer-one',
          typeIds: ['fact-spike', 'fact-story'],
        },
      ],
    });
    expect(readReportIssues(report, 'foreign_package_fact')).toEqual([]);
    expect(captureExistingStore(store.path)).toEqual(before);
  });
}

test('includes an actual empty package in project-set divergence without adding a step to it', async () => {
  const store = prepareStore();
  installReport(store);
  withinStore(store.path, (db) => {
    db.run(
      "INSERT INTO work_package(id,project_id,name,restricted,created_at,created_by) VALUES('w-empty','p-one','Empty',0,1,'catalogue-author')",
    );
    db.run(
      "INSERT INTO work_package_organization(resource_id,organization_id) VALUES('w-empty','org-a')",
    );
    expect(db.all("SELECT id FROM step WHERE work_package_id='w-empty'")).toEqual([]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const reportStepCatalogue = await readReporter(),
    before = captureExistingStore(store.path);
  const report: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
  expect(report).toEqual({
    fingerprint: fingerprintOf(report),
    rows: [
      IDENTICAL,
      DIVERGENT,
      {
        kind: 'divergent_project_set',
        organizationId: 'org-a',
        projectId: 'p-one',
        packages: [
          { workPackageId: 'w-empty', codes: [] },
          { workPackageId: 'w-one', codes: ['dev', 'qa'] },
        ],
      },
    ],
  });
  expect(captureExistingStore(store.path)).toEqual(before);
});

const REPORT_FINGERPRINT_CASES = [
  {
    name: 'actual work-item parent',
    seed: [
      "INSERT INTO work_item(id,work_package_id,parent_id,position,name) VALUES('fingerprint-parent','w-one',NULL,0,'Fingerprint Parent')",
    ],
    changes: ["UPDATE work_item SET parent_id='fingerprint-parent' WHERE id='leaf-one'"],
    rows: [IDENTICAL, DIVERGENT],
  },
  {
    name: 'actual type membership',
    seed: [
      "INSERT INTO work_item_type(id,name) VALUES('fp-story','FP Story'),('fp-spike','FP Spike')",
      "INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES('fp-story','org-a','FP Story'),('fp-spike','org-a','FP Spike')",
      "INSERT INTO work_item_work_item_type(work_item_id,type_id) VALUES('leaf-one','fp-story')",
    ],
    changes: [
      "INSERT INTO work_item_work_item_type(work_item_id,type_id) VALUES('leaf-one','fp-spike')",
    ],
    rows: [
      IDENTICAL,
      DIVERGENT,
      {
        kind: 'type_conflict_leaf',
        organizationId: 'org-a',
        workPackageId: 'w-one',
        workItemId: 'leaf-one',
        typeIds: ['fp-spike', 'fp-story'],
      },
    ],
  },
  {
    name: 'actual fact scalar',
    seed: [],
    changes: [
      "UPDATE estimate SET realistic=2.5 WHERE work_item_id='leaf-one' AND step_id='z-dev'",
    ],
    rows: [IDENTICAL, DIVERGENT],
  },
  {
    name: 'actual lease revocation and delegation metadata',
    seed: [
      "INSERT INTO person(id,name) VALUES('fp-person','FP Person')",
      "INSERT INTO person_organization(resource_id,organization_id,name) VALUES('fp-person','org-a','FP Person')",
      "INSERT INTO work_item(id,work_package_id,parent_id,position,name) VALUES('lease-parent','w-one',NULL,0,'Lease Parent')",
      "UPDATE work_item SET parent_id='lease-parent' WHERE id='leaf-one'",
      "INSERT INTO claim(id,work_item_id,step_id,person_id,lease_expires_at) VALUES('fp-parent','lease-parent',NULL,'fp-person',500),('fp-child','leaf-one','z-dev','fp-person',500)",
    ],
    changes: [
      "UPDATE claim SET lease_expires_at=600 WHERE id='fp-child'",
      "UPDATE claim SET lease_revoked_at=600 WHERE id='fp-child'",
      "UPDATE claim SET parent_claim_id='fp-parent' WHERE id='fp-child'",
    ],
    rows: [IDENTICAL, DIVERGENT],
  },
] as const;

for (const sensitivity of REPORT_FINGERPRINT_CASES) {
  test(
    'changes the report fingerprint for ' + sensitivity.name + ' without a step edit',
    async () => {
      const store = prepareStore();
      installReport(store);
      withinStore(store.path, (db) => {
        for (const statement of sensitivity.seed) db.run(statement);
        expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
      });
      const reportStepCatalogue = await readReporter();
      const original: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 100));
      let previous = fingerprintOf(original);
      const steps = withinStore(store.path, (db) => db.all('SELECT * FROM step ORDER BY id'));
      for (const [index, statement] of sensitivity.changes.entries()) {
        withinStore(store.path, (db) => {
          db.run(statement);
          expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
        });
        const before = captureExistingStore(store.path);
        const changed: unknown = withinStore(store.path, (db) =>
          reportStepCatalogue(db, 101 + index),
        );
        const fingerprint = fingerprintOf(changed);
        expect(fingerprint).not.toBe(previous);
        expect(changed).toEqual({ fingerprint, rows: sensitivity.rows });
        expect(withinStore(store.path, (db) => db.all('SELECT * FROM step ORDER BY id'))).toEqual(
          steps,
        );
        expect(captureExistingStore(store.path)).toEqual(before);
        previous = fingerprint;
      }
    },
  );
}

const REPORT_REFERENCE_CORRUPTIONS = [
  {
    name: 'missing fact step',
    seed: [],
    sql: "UPDATE estimate SET step_id='missing-step' WHERE work_item_id='leaf-one'",
    foreign: [{ table: 'estimate', parent: 'step' }],
    diagnostic: 'missing fact step',
  },
  {
    name: 'valid foreign work-item parent',
    seed: [],
    sql: "UPDATE work_item SET parent_id='leaf-two' WHERE id='leaf-one'",
    foreign: [],
    diagnostic: 'missing or foreign work-item parent',
  },
  {
    name: 'node endpoint on a real parent',
    seed: [
      "INSERT INTO work_item(id,work_package_id,parent_id,position,name) VALUES('shape-parent','w-one',NULL,0,'Shape Parent')",
      "UPDATE work_item SET parent_id='shape-parent' WHERE id='leaf-one'",
      "INSERT INTO typed_dependency(id,work_package_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES('shape-link','w-one','shape-parent','whole','leaf-one','whole','FS')",
    ],
    sql: "UPDATE typed_dependency SET predecessor_scope='node',predecessor_step_id='z-dev' WHERE id='shape-link'",
    foreign: [],
    diagnostic: 'inconsistent dependency endpoint shape',
  },
  {
    name: 'external paired work item',
    seed: [
      "INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,type) VALUES('corrupt-link','org-a','w-one','w-two','leaf-one','node','z-dev','leaf-two','whole','FS')",
    ],
    sql: "UPDATE external_dependency SET predecessor_work_item_id='leaf-two' WHERE id='corrupt-link'",
    foreign: [{ table: 'external_dependency', parent: 'work_item' }],
    diagnostic: 'inconsistent dependency ownership',
  },
  {
    name: 'external paired organization',
    seed: [
      "INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,type) VALUES('corrupt-link','org-a','w-one','w-two','leaf-one','node','z-dev','leaf-two','whole','FS')",
    ],
    sql: "UPDATE external_dependency SET organization_id='org-b' WHERE id='corrupt-link'",
    foreign: [
      { table: 'external_dependency', parent: 'work_package_organization' },
      { table: 'external_dependency', parent: 'work_package_organization' },
    ],
    diagnostic: 'inconsistent dependency ownership',
  },
] as const;

for (const corruption of REPORT_REFERENCE_CORRUPTIONS) {
  test(
    'refuses ' +
      corruption.name +
      ' with constraints restored and leaves the complete previous report atomic',
    async () => {
      const store = prepareStore();
      installReport(store);
      withinStore(store.path, (db) => {
        seedReportFactAdmission(db);
        for (const statement of corruption.seed) db.run(statement);
        expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
      });
      const reportStepCatalogue = await readReporter();
      fingerprintOf(withinStore(store.path, (db) => reportStepCatalogue(db, 100)));
      corruptReportStore(store.path, { sql: corruption.sql, triggers: [] });
      withinStore(store.path, (db) => {
        expect(
          db
            .all<{ table: string; parent: string }>('PRAGMA foreign_key_check')
            .map((row) => ({ table: row.table, parent: row.parent }))
            .sort((left, right) =>
              (left.table + left.parent).localeCompare(right.table + right.parent),
            ),
        ).toEqual([...corruption.foreign]);
      });
      const before = captureReportStore(store.path);
      expectReportRefusal(
        () => withinStore(store.path, (db) => reportStepCatalogue(db, 101)),
        corruption.diagnostic,
      );
      expect(captureReportStore(store.path)).toEqual(before);
    },
  );
}

/** Captures every persistent nonreport row, including sqlite_sequence, after the owned read closes. */
function captureNonReportStore(path: string) {
  return withinStore(path, (db) => ({
    schema: db.all('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name'),
    tables: db
      .all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name<>'step_migration_report' ORDER BY name",
      )
      .map(({ name }) => ({
        name,
        rows: db
          .all<Record<string, unknown>>('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
          .sort((left, right) => {
            const a = JSON.stringify(left),
              b = JSON.stringify(right);
            return a < b ? -1 : a > b ? 1 : 0;
          }),
      })),
  }));
}

test('reports unchanged catalogue issues after the actual settings and space predecessors without changing any other persisted state', async () => {
  const store = prepareStore();
  const currentNames = [
    '20261110120000_add_setting_value',
    '20261110120100_space_holds_projects_people_teams',
  ] as const;
  const predecessors = readMigrationFolders(FOLDER).filter(({ name }) => name <= currentNames[1]);
  const historical = predecessors.filter(({ name }) => name <= BASELINE);
  expect(historical).toHaveLength(113);
  expect(predecessors).toHaveLength(115);
  expect(predecessors.filter(({ name }) => name > BASELINE).map(({ name }) => name)).toEqual([
    ...currentNames,
  ]);
  const readLedger = () =>
    withinStore(store.path, (db) =>
      db.all<{ name: string; hash: string }>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      ),
    );
  expect(readLedger()).toEqual(historical.map(({ name, hash }) => ({ name, hash })));
  withinStore(store.path, (db) => {
    db.run(
      "UPDATE work_package SET timezone='Europe/Kyiv',pert_weight_optimistic=2,pert_weight_realistic=3,pert_weight_pessimistic=1,budget_factor=1.25 WHERE id='w-one'",
    );
    db.run(
      "INSERT INTO space(id,organization_id,name,revision,created_at,created_by) VALUES('catalogue-space','org-a','Catalogue Space',0,15,'catalogue-author')",
    );
    db.run(
      "INSERT INTO space_work_package(space_id,work_package_id,organization_id,position,created_at,created_by) VALUES('catalogue-space','w-one','org-a',27,16,'catalogue-author')",
    );
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  for (const addition of predecessors.filter(({ name }) => name > BASELINE)) {
    cpSync(join(FOLDER, addition.name), join(store.migrations, addition.name), { recursive: true });
    applyMigrations(store.path, store.migrations);
    expect(readLedger()).toEqual(
      predecessors
        .filter(({ name }) => name <= addition.name)
        .map(({ name, hash }) => ({ name, hash })),
    );
  }
  withinStore(store.path, (db) => {
    expect(
      db
        .all<{ scope_kind: string; scope_id: string; key: string; value_json: string }>(
          'SELECT scope_kind,scope_id,key,value_json FROM setting_value ORDER BY scope_kind,scope_id,key',
        )
        .map(({ value_json, ...row }) => {
          const value: unknown = JSON.parse(value_json);
          return { ...row, value };
        }),
    ).toEqual([
      { scope_kind: 'project', scope_id: 'p-one', key: 'budgetFactor', value: 1.25 },
      {
        scope_kind: 'work_package',
        scope_id: 'w-one',
        key: 'pertWeights',
        value: { optimistic: 2, realistic: 3, pessimistic: 1 },
      },
      { scope_kind: 'work_package', scope_id: 'w-one', key: 'timezone', value: 'Europe/Kyiv' },
    ]);
    expect(
      db
        .all<{ name: string }>('PRAGMA table_info(work_package)')
        .map(({ name }) => name)
        .filter((name) =>
          [
            'timezone',
            'pert_weight_optimistic',
            'pert_weight_realistic',
            'pert_weight_pessimistic',
            'budget_factor',
          ].includes(name),
        ),
    ).toEqual([]);
    expect(db.all('SELECT id,space_id,space_position FROM project ORDER BY id')).toEqual([
      { id: 'p-foreign', space_id: null, space_position: null },
      { id: 'p-one', space_id: 'catalogue-space', space_position: 10 },
      { id: 'p-two', space_id: null, space_position: null },
    ]);
    expect(
      db.get<{ name: string } | undefined>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='space_work_package'",
      ),
    ).toBeUndefined();
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const reports = readMigrationFolders(FOLDER).filter(({ name }) => name.endsWith(REPORT_SUFFIX));
  expect(reports.map(({ name }) => name)).toEqual(['20261115120000_add_step_migration_report']);
  installReport(store);
  const complete = [...predecessors, ...reports].map(({ name, hash }) => ({ name, hash }));
  expect(complete).toHaveLength(116);
  expect(readLedger()).toEqual(complete);
  const before = captureNonReportStore(store.path);
  const reportStepCatalogue = await readReporter();
  const report: unknown = withinStore(store.path, (db) => reportStepCatalogue(db, 900));
  const fingerprint = fingerprintOf(report);
  expect(report).toEqual({ fingerprint, rows: [IDENTICAL, DIVERGENT] });
  expect(
    withinStore(store.path, (db) =>
      db.all(
        'SELECT kind,organization_id FROM step_migration_report ORDER BY kind,organization_id',
      ),
    ),
  ).toEqual([
    { kind: 'shared_code', organization_id: 'org-a' },
    { kind: 'shared_code_identical', organization_id: 'org-a' },
  ]);
  expect(captureNonReportStore(store.path)).toEqual(before);
  expect(readLedger()).toEqual(complete);
});

test('keeps unmerged step identities, every persisted fact and historical bytes through the real catalogue migration', async () => {
  const store = prepareStore();
  const reportParent = '20261115120000_add_step_migration_report';
  const catalogueName = '20261115130000_add_step_catalogue';
  const parents = readMigrationFolders(FOLDER).filter(({ name }) => name <= reportParent);
  expect(parents).toHaveLength(116);
  expect(parents.at(-1)?.name).toBe(reportParent);
  for (const parent of parents)
    cpSync(join(FOLDER, parent.name), join(store.migrations, parent.name), { recursive: true });
  applyMigrations(store.path, store.migrations);
  expect(
    withinStore(store.path, (db) =>
      db.all<{ name: string; hash: string }>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      ),
    ),
  ).toEqual(parents.map(({ name, hash }) => ({ name, hash })));

  seedReportFactWorld(store.path);
  const { createHash } = await import('node:crypto');
  const { sql } = await import('drizzle-orm');
  const hashBytes = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
  const input = '{ "version":1, "stepId":"z-dev", "estimateUnits":{"z-dev":"workdays"} }\n';
  const schedule =
    '{ "version":1, "stepId":"z-dev", "slices":{"leaf-one:z-dev":{"start":0,"end":1}} }\n';
  const payload = '{ "version":1, "forward":{"kind":"setEstimate","stepId":"z-dev"} }\n';
  const inverse =
    '{ "kind":"setEstimate", "stepId":"z-dev", "estimateUnits":{"z-dev":"workdays"} }\n';
  const preconditions = '{ "step:z-dev":7, "moveProgress":{"z-dev":"in_progress"} }\n';
  const beforeEvent = '{ "stepId":"z-dev", "optimistic":1 }\n';
  const afterEvent = '{ "stepId":"z-dev", "optimistic":2 }\n';
  const replay = '{ "kind":"plan.changed", "workPackageId":"w-one", "stepId":"z-dev" }\n';
  withinStore(store.path, (db) => {
    db.run(
      "DELETE FROM work_item_work_item_type WHERE work_item_id IN ('leaf-one','unprotected-one')",
    );
    for (const [id, code, name] of [
      ['z-dev', 'dev-one', 'Develop One'],
      ['a-dev', 'dev-two', 'Develop Two'],
      ['z-qa', 'qa-one', 'Test One'],
      ['a-qa', 'qa-two', 'Test Two'],
      ['foreign-dev', 'foreign-dev', 'Foreign Develop'],
    ])
      db.run(sql`UPDATE step SET code=${code},name=${name} WHERE id=${id}`);
    for (const fact of REPORT_FACT_CASES) {
      const statement = fact.sql.replaceAll(
        "'fact-link'",
        "'catalogue-" + fact.table + '-' + fact.column + "'",
      );
      db.run(statement);
    }
    for (const fact of REPORT_FACT_CASES)
      expect(
        db.get<{ count: number }>(
          'SELECT COUNT(*) AS count FROM "' + fact.table + '" WHERE "' + fact.column + "\"='z-dev'",
        ),
      ).toEqual({ count: 1 });
    for (const table of REPORT_FACT_TABLES)
      expect(db.get<{ count: number }>('SELECT COUNT(*) AS count FROM "' + table + '"')).toEqual({
        count: table === 'typed_dependency' || table === 'external_dependency' ? 2 : 1,
      });
    db.run(sql`INSERT INTO saved_plan(id,work_package_id,name,created_by,created_by_id,created_at,input_schema_version,input_bytes,input_sha256,schedule_schema_version,schedule_bytes,schedule_sha256,schedule_input_sha256,scheduler_algorithm_id)
      VALUES('catalogue-history','w-one','Unmerged identity source','Catalogue Author','catalogue-author',30,1,${Buffer.byteLength(input)},${hashBytes(input)},1,${Buffer.byteLength(schedule)},${hashBytes(schedule)},${hashBytes(input)},'fixture-scheduler')`);
    db.run(
      "INSERT INTO saved_plan_organization(resource_id,organization_id) VALUES('catalogue-history','org-a')",
    );
    db.run(
      sql`INSERT INTO saved_plan_body(saved_plan_id,kind,bytes) VALUES('catalogue-history','input',${input}),('catalogue-history','schedule',${schedule})`,
    );
    db.run(sql`INSERT INTO command_journal(id,work_package_id,user_id,seq,kind,payload,inverse,preconditions,created_at)
      VALUES('catalogue-journal','w-one','catalogue-author',1,'setEstimate',${payload},${inverse},${preconditions},31)`);
    db.run(sql`INSERT INTO plan_event(id,work_package_id,user_id,kind,label,work_item_id,step_id,before,after,created_at)
      VALUES('catalogue-event','w-one','catalogue-author','setEstimate','Unmerged estimate','leaf-one','z-dev',${beforeEvent},${afterEvent},32)`);
    db.run(sql`INSERT INTO optimized_schedule_cache(work_package_id,input_hash,objective,contract_version,budget_ms,generation,status,result_json,created_at)
      VALUES('w-one',${hashBytes(input)},'pri','fixture-contract',1000,1,'ok',${schedule},33)`);
    db.run(
      sql`INSERT INTO event_log(subscription,seq,message,created_at) VALUES('work-package:w-one',1,${replay},34)`,
    );
    db.run("INSERT INTO event_sequencer(subscription,next_seq) VALUES('work-package:w-one',2)");
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    expect(db.all('SELECT id FROM step ORDER BY id')).toEqual([
      { id: 'a-dev' },
      { id: 'a-qa' },
      { id: 'foreign-dev' },
      { id: 'z-dev' },
      { id: 'z-qa' },
    ]);
    expect(db.all('SELECT kind,bytes FROM saved_plan_body ORDER BY kind')).toEqual([
      { kind: 'input', bytes: input },
      { kind: 'schedule', bytes: schedule },
    ]);
    expect(
      db.get<{
        input_bytes: number;
        input_sha256: string;
        schedule_bytes: number | null;
        schedule_sha256: string | null;
        schedule_input_sha256: string | null;
      }>(
        "SELECT input_bytes,input_sha256,schedule_bytes,schedule_sha256,schedule_input_sha256 FROM saved_plan WHERE id='catalogue-history'",
      ),
    ).toEqual({
      input_bytes: Buffer.byteLength(input),
      input_sha256: hashBytes(input),
      schedule_bytes: Buffer.byteLength(schedule),
      schedule_sha256: hashBytes(schedule),
      schedule_input_sha256: hashBytes(input),
    });
  });
  const reportStepCatalogue = await readReporter();
  const report = withinStore(store.path, (db) => reportStepCatalogue(db, 40));
  expect(readReportRows(report)).toEqual([]);
  const rules = { version: 1, fingerprint: fingerprintOf(report), organizations: {} };
  const ruleFile = await writeRuleFile(rules);
  const readStepMergeRules = await readRulePreflight();
  expect(withinStore(store.path, (db) => readStepMergeRules(db, ruleFile))).toEqual(rules);

  const additions = readMigrationFolders(FOLDER).filter(({ name }) => name === catalogueName);
  for (const addition of additions)
    cpSync(join(FOLDER, addition.name), join(store.migrations, addition.name), { recursive: true });
  if (directory === undefined) throw new Error('Catalogue migration directory was not acquired');
  const { createWindowBackup, assertWindowBackup } = await import('./window-backup');
  const windowRequest = {
    sourcePath: store.path,
    snapshotPath: join(directory, 'catalogue-window.db'),
    reportPath: join(directory, 'catalogue-window.json'),
    migrationsFolder: store.migrations,
  };
  // This is only an isolated synthetic maintenance fixture. E37 verification does not prove E36 host exclusion.
  let backup: ReturnType<typeof createWindowBackup>;
  let verified: ReturnType<typeof assertWindowBackup>;
  try {
    backup = createWindowBackup(windowRequest);
    verified = assertWindowBackup(windowRequest);
  } catch (cause: unknown) {
    // Retain this fixture on any failed window observation; do not infer that native/artifact custody settled.
    hasUnknownOwner = true;
    throw cause;
  }
  expect(verified).toEqual(backup.report);
  const before = captureNonReportStore(store.path);
  const unchangedTables = new Set(
    before.tables
      .map(({ name }) => name)
      .filter((name) => !['step', '__drizzle_migrations', 'sqlite_sequence'].includes(name)),
  );
  const ledger = withinStore(store.path, (db) =>
    db.all<Record<string, unknown>>('SELECT * FROM __drizzle_migrations ORDER BY name'),
  );
  const sequences = withinStore(store.path, (db) =>
    db.all("SELECT name,seq FROM sqlite_sequence WHERE name<>'__drizzle_migrations' ORDER BY name"),
  );
  const definitions = withinStore(store.path, (db) =>
    db.all(
      "SELECT s.id,wo.organization_id,s.code,s.name,s.estimate_unit,s.allowance_bps AS default_allowance_bps,s.position,s.created_at,s.created_by,'migration' AS origin,s.work_package_id AS legacy_work_package_id FROM step s JOIN work_package_organization wo ON wo.resource_id=s.work_package_id ORDER BY s.id",
    ),
  );
  const bindings = withinStore(store.path, (db) =>
    db.all(
      "SELECT wo.organization_id,'project' AS scope_kind,w.project_id AS scope_id,s.id AS step_id,NULL AS work_item_type_id,s.position,'migration' AS origin FROM step s JOIN work_package w ON w.id=s.work_package_id JOIN work_package_organization wo ON wo.resource_id=w.id ORDER BY s.id",
    ),
  );
  const packageSteps = withinStore(store.path, (db) =>
    db.all(
      'SELECT work_package_id,id AS step_id,estimate_unit,allowance_bps,allowance_revision FROM step ORDER BY id',
    ),
  );
  const tables = withinStore(store.path, (db) =>
    db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"),
  ).map(({ name }) => name);
  const { readFileSync } = await import('node:fs');
  await applyOwnedCatalogue({
    window: windowRequest,
    rulesJson: readFileSync(ruleFile, 'utf8'),
    appliedAt: '2026-11-15T12:00:00.000Z',
  });
  // Historical first RED owned missing SQL shape; this same preservation owner now requires the private writer.
  expect(
    withinStore(store.path, (db) =>
      db.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='step_definition'",
      ),
    ),
  ).toEqual({ name: 'step_definition' });

  expect(additions).toHaveLength(1);
  expect(
    withinStore(store.path, (db) =>
      db.all(
        'SELECT id,organization_id,code,name,estimate_unit,default_allowance_bps,position,created_at,created_by,origin,legacy_work_package_id FROM step_definition ORDER BY id',
      ),
    ),
  ).toEqual(definitions);
  expect(
    withinStore(store.path, (db) => db.all('SELECT id FROM step_definition ORDER BY id')),
  ).toEqual([
    { id: 'a-dev' },
    { id: 'a-qa' },
    { id: 'foreign-dev' },
    { id: 'z-dev' },
    { id: 'z-qa' },
  ]);
  expect(
    withinStore(store.path, (db) =>
      db.all(
        'SELECT organization_id,scope_kind,scope_id,step_id,work_item_type_id,position,origin FROM step_binding ORDER BY step_id',
      ),
    ),
  ).toEqual(bindings);
  expect(
    withinStore(store.path, (db) =>
      db.all(
        'SELECT work_package_id,step_id,estimate_unit,allowance_bps,allowance_revision FROM work_package_step ORDER BY step_id',
      ),
    ),
  ).toEqual(packageSteps);
  expect(withinStore(store.path, (db) => db.all('SELECT * FROM step_identity_history'))).toEqual(
    [],
  );
  const after = captureNonReportStore(store.path);
  expect(after.tables.filter(({ name }) => unchangedTables.has(name))).toEqual(
    before.tables.filter(({ name }) => unchangedTables.has(name)),
  );
  expect(
    withinStore(store.path, (db) =>
      db.all(
        "SELECT name,seq FROM sqlite_sequence WHERE name<>'__drizzle_migrations' ORDER BY name",
      ),
    ),
  ).toEqual(sequences);
  const finalLedger = withinStore(store.path, (db) =>
    db.all<Record<string, unknown>>('SELECT * FROM __drizzle_migrations ORDER BY name'),
  );
  expect(finalLedger).toHaveLength(117);
  expect(finalLedger.slice(0, 116)).toEqual(ledger);
  expect(
    withinStore(store.path, (db) =>
      db.all<{ name: string; hash: string }>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      ),
    ),
  ).toEqual([...parents, ...additions].map(({ name, hash }) => ({ name, hash })));
  expect(
    withinStore(store.path, (db) =>
      db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"),
    ).map(({ name }) => name),
  ).toEqual(
    [
      ...tables.filter((name) => name !== 'step'),
      'step_definition',
      'step_binding',
      'work_package_step',
      'step_identity_history',
    ].sort(),
  );
  withinStore(store.path, (db) => {
    for (const fact of REPORT_FACT_CASES) {
      const target = fact.table === 'external_dependency' ? 'work_package_step' : 'step_definition';
      const column = fact.table === 'external_dependency' ? 'step_id' : 'id';
      expect(
        db
          .all<{ table: string; from: string; to: string }>(
            'PRAGMA foreign_key_list("' + fact.table + '")',
          )
          .filter((row) => row.from === fact.column && row.to === column)
          .map((row) => row.table),
      ).toEqual([target]);
    }
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
});

test('refuses public catalogue rollback before erasing orphan binding and package metadata with restored foreign keys', async () => {
  const store = prepareStore();
  const reportParent = '20261115120000_add_step_migration_report';
  const catalogueName = '20261115130000_add_step_catalogue';
  const parents = readMigrationFolders(FOLDER).filter(({ name }) => name <= reportParent);
  expect(parents).toHaveLength(116);
  for (const parent of parents)
    cpSync(join(FOLDER, parent.name), join(store.migrations, parent.name), { recursive: true });
  applyMigrations(store.path, store.migrations);
  withinStore(store.path, (db) => {
    for (const [id, code, name] of [
      ['z-dev', 'dev-one', 'Develop One'],
      ['a-dev', 'dev-two', 'Develop Two'],
      ['z-qa', 'qa-one', 'Test One'],
      ['a-qa', 'qa-two', 'Test Two'],
      ['foreign-dev', 'foreign-dev', 'Foreign Develop'],
    ])
      db.run("UPDATE step SET code='" + code + "',name='" + name + "' WHERE id='" + id + "'");
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const additions = readMigrationFolders(FOLDER).filter(({ name }) => name === catalogueName);
  expect(additions).toHaveLength(1);
  for (const addition of additions)
    cpSync(join(FOLDER, addition.name), join(store.migrations, addition.name), { recursive: true });
  const { createWindowBackup, assertWindowBackup } = await import('./window-backup');
  const { readFileSync } = await import('node:fs');
  const reportStepCatalogue = await readReporter();
  const readStepMergeRules = await readRulePreflight();
  let invocation = 0;
  const applyCatalogue = async () => {
    const report = withinStore(store.path, (db) => reportStepCatalogue(db, 50 + invocation));
    expect(readReportRows(report)).toEqual([]);
    const rules = { version: 1, fingerprint: fingerprintOf(report), organizations: {} };
    const ruleFile = await writeRuleFile(rules);
    expect(withinStore(store.path, (db) => readStepMergeRules(db, ruleFile))).toEqual(rules);
    if (directory === undefined) throw new Error('Catalogue down fixture directory is absent');
    const window = {
      sourcePath: store.path,
      migrationsFolder: store.migrations,
      snapshotPath: join(directory, 'catalogue-down-' + String(invocation) + '.db'),
      reportPath: join(directory, 'catalogue-down-' + String(invocation) + '.json'),
    };
    invocation += 1;
    try {
      const backup = createWindowBackup(window);
      expect(assertWindowBackup(window)).toEqual(backup.report);
    } catch (cause: unknown) {
      hasUnknownOwner = true;
      throw cause;
    }
    await applyOwnedCatalogue({
      window,
      rulesJson: readFileSync(ruleFile, 'utf8'),
      appliedAt: '2026-11-15T12:00:00.000Z',
    });
  };
  await applyCatalogue();
  const { rollbackTo } = await import('./migrate-down');
  const readLedger = () =>
    withinStore(store.path, (db) =>
      db.all<{ name: string; hash: string }>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      ),
    );
  const complete = [...parents, ...additions].map(({ name, hash }) => ({ name, hash }));
  expect(readLedger()).toEqual(complete);
  // A healthy public down/reapply must work before corruption can own the expected refusal.
  let initialDown: ReturnType<typeof rollbackTo>;
  try {
    initialDown = rollbackTo(store.path, store.migrations, reportParent);
  } catch (cause: unknown) {
    hasUnknownOwner = true;
    throw cause;
  }
  expect(initialDown).toEqual([catalogueName]);
  expect(readLedger()).toEqual(parents.map(({ name, hash }) => ({ name, hash })));
  expect(withinStore(store.path, (db) => db.all('SELECT id FROM step ORDER BY id'))).toEqual([
    { id: 'a-dev' },
    { id: 'a-qa' },
    { id: 'foreign-dev' },
    { id: 'z-dev' },
    { id: 'z-qa' },
  ]);
  await applyCatalogue();
  expect(readLedger()).toEqual(complete);
  withinStore(store.path, (db) => {
    for (const fact of REPORT_FACT_CASES)
      expect(
        db.get<{ count: number }>(
          'SELECT COUNT(*) AS count FROM "' +
            fact.table +
            '" WHERE "' +
            fact.column +
            "\"='foreign-dev'",
        ),
      ).toEqual({ count: 0 });
    expect(
      db.all("SELECT step_id,scope_kind,scope_id FROM step_binding WHERE step_id='foreign-dev'"),
    ).toEqual([{ step_id: 'foreign-dev', scope_kind: 'project', scope_id: 'p-foreign' }]);
    expect(
      db.all("SELECT step_id,work_package_id FROM work_package_step WHERE step_id='foreign-dev'"),
    ).toEqual([{ step_id: 'foreign-dev', work_package_id: 'w-foreign' }]);
    let primary: { failed: false } | { failed: true; cause: unknown } = { failed: false };
    try {
      db.run('PRAGMA foreign_keys=OFF');
      expect(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')).toEqual({ foreign_keys: 0 });
      db.run("DELETE FROM step_definition WHERE id='foreign-dev'");
    } catch (cause: unknown) {
      primary = { failed: true, cause };
    }
    try {
      db.run('PRAGMA foreign_keys=ON');
    } catch (cause: unknown) {
      hasUnknownOwner = true;
      if (primary.failed)
        throw new AggregateError(
          [primary.cause, cause],
          'Catalogue orphan setup and FK restoration failed',
          { cause },
        );
      throw cause;
    }
    if (primary.failed) throw primary.cause;
    expect(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    expect(db.all("SELECT id FROM step_definition WHERE id='foreign-dev'")).toEqual([]);
    expect(db.all("SELECT step_id FROM step_binding WHERE step_id='foreign-dev'")).toEqual([
      { step_id: 'foreign-dev' },
    ]);
    expect(db.all("SELECT step_id FROM work_package_step WHERE step_id='foreign-dev'")).toEqual([
      { step_id: 'foreign-dev' },
    ]);
    expect(
      db
        .all<{ table: string; parent: string }>('PRAGMA foreign_key_check')
        .map(({ table, parent }) => ({ table, parent }))
        .sort((left, right) => (left.table < right.table ? -1 : left.table > right.table ? 1 : 0)),
    ).toEqual([
      { table: 'step_binding', parent: 'step_definition' },
      { table: 'work_package_step', parent: 'step_definition' },
    ]);
  });
  const captureState = () =>
    withinStore(store.path, (db) => ({
      foreignKeys: db.get('PRAGMA foreign_keys'),
      schema: db.all('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name'),
      tables: db
        .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .map(({ name }) => ({
          name,
          rows: db
            .all<Record<string, unknown>>('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
            .sort((left, right) => {
              const a = JSON.stringify(left),
                b = JSON.stringify(right);
              return a < b ? -1 : a > b ? 1 : 0;
            }),
        })),
    }));
  const before = captureState(),
    ledger = readLedger();
  let outcome: { rejected: false } | { rejected: true; cause: unknown } = { rejected: false };
  try {
    rollbackTo(store.path, store.migrations, reportParent);
  } catch (cause: unknown) {
    outcome = { rejected: true, cause };
  }
  if (
    outcome.rejected &&
    (!(outcome.cause instanceof Error) ||
      !outcome.cause.message.includes('step catalogue rollback requires valid foreign keys'))
  ) {
    // The inherited public finally-close has no tagged paired-failure contract; retain unexpected outcomes.
    hasUnknownOwner = true;
    throw new Error('Unexpected public catalogue rollback failure; fixture retained', {
      cause: outcome.cause,
    });
  }
  // First intended V2 failure is actual resolution instead of the modeled refusal, not a setup/import error.
  expect(outcome.rejected).toBe(true);
  if (!outcome.rejected)
    throw new Error('Public catalogue rollback erased orphan metadata instead of refusing');
  expect(outcome.cause).toBeInstanceOf(Error);
  if (!(outcome.cause instanceof Error))
    throw new Error('Catalogue rollback refusal is not an Error', { cause: outcome.cause });
  expect(outcome.cause.message).toContain('rolling back ' + catalogueName + ' failed:');
  expect(outcome.cause.message).toContain('step catalogue rollback requires valid foreign keys');
  expect(captureState()).toEqual(before);
  expect(readLedger()).toEqual(ledger);
});

test('refuses pending catalogue migration through the ordinary public migrator without an atomic apply owner', () => {
  const store = prepareStore();
  const reportParent = '20261115120000_add_step_migration_report';
  const catalogueName = '20261115130000_add_step_catalogue';
  const parents = readMigrationFolders(FOLDER).filter(({ name }) => name <= reportParent);
  expect(parents).toHaveLength(116);
  for (const parent of parents)
    cpSync(join(FOLDER, parent.name), join(store.migrations, parent.name), { recursive: true });
  // The public additive path is healthy before the maintenance-only folder becomes pending.
  applyMigrations(store.path, store.migrations);
  withinStore(store.path, (db) => {
    for (const [id, code, name] of [
      ['z-dev', 'dev-one', 'Develop One'],
      ['a-dev', 'dev-two', 'Develop Two'],
      ['z-qa', 'qa-one', 'Test One'],
      ['a-qa', 'qa-two', 'Test Two'],
      ['foreign-dev', 'foreign-dev', 'Foreign Develop'],
    ])
      db.run("UPDATE step SET code='" + code + "',name='" + name + "' WHERE id='" + id + "'");
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    expect(db.all('SELECT name,hash FROM __drizzle_migrations ORDER BY name')).toEqual(
      parents.map(({ name, hash }) => ({ name, hash })),
    );
    expect(
      db.get<{ name: string } | undefined>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='step_definition'",
      ),
    ).toBeUndefined();
    expect(db.all('SELECT id FROM step ORDER BY id')).toEqual([
      { id: 'a-dev' },
      { id: 'a-qa' },
      { id: 'foreign-dev' },
      { id: 'z-dev' },
      { id: 'z-qa' },
    ]);
  });
  const additions = readMigrationFolders(FOLDER).filter(({ name }) => name === catalogueName);
  expect(additions).toHaveLength(1);
  expect(additions.map(({ name, hash, downHash }) => ({ name, hash, downHash }))).toEqual([
    {
      name: catalogueName,
      hash: '8a0190da639e17eabc12ea2f4e8096b0a2085db5325ba76fe6cce1080b9994d6',
      downHash: '63ff1aa14f87be82fc6f30a5994ec79e4bc0d6fe9bb679c8a5b6541f2b8b0afd',
    },
  ]);
  for (const addition of additions)
    cpSync(join(FOLDER, addition.name), join(store.migrations, addition.name), { recursive: true });
  expect(readMigrationFolders(store.migrations).map(({ name }) => name)).toEqual(
    [...parents, ...additions].map(({ name }) => name),
  );
  const captureState = () =>
    withinStore(store.path, (db) => ({
      foreignKeys: db.get('PRAGMA foreign_keys'),
      schema: db.all('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name'),
      tables: db
        .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .map(({ name }) => ({
          name,
          rows: db
            .all<Record<string, unknown>>('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
            .sort((left, right) => {
              const a = JSON.stringify(left),
                b = JSON.stringify(right);
              return a < b ? -1 : a > b ? 1 : 0;
            }),
        })),
    }));
  const before = captureState();
  let outcome: { rejected: false } | { rejected: true; cause: unknown } = { rejected: false };
  // This exact public export is called by migrate-cli and migrate-on-startup; no permit is supplied.
  try {
    runMigrations(store.path, store.migrations);
  } catch (cause: unknown) {
    if (isSqliteCleanupUnknown(cause)) hasUnknownOwner = true;
    outcome = { rejected: true, cause };
  }
  if (
    outcome.rejected &&
    (!(outcome.cause instanceof Error) ||
      !outcome.cause.message.includes(
        'step catalogue migration requires the explicit atomic apply owner',
      ))
  ) {
    hasUnknownOwner = true;
    throw new Error('Unexpected ordinary migration failure; fixture retained', {
      cause: outcome.cause,
    });
  }
  // Current runMigrations applies the real private SQL117, so resolution is the intended first RED.
  expect(outcome.rejected).toBe(true);
  if (!outcome.rejected)
    throw new Error('Ordinary migrator applied the maintenance-only catalogue migration');
  expect(outcome.cause).toBeInstanceOf(Error);
  if (!(outcome.cause instanceof Error))
    throw new Error('Catalogue admission refusal is not an Error', { cause: outcome.cause });
  expect(outcome.cause.message).toContain(
    'step catalogue migration requires the explicit atomic apply owner',
  );
  expect(captureState()).toEqual(before);
});

test('refuses the pending catalogue set before applying its real additive report migration prefix', () => {
  const store = prepareStore();
  const reportParent = '20261110120100_space_holds_projects_people_teams';
  const catalogueName = '20261115130000_add_step_catalogue';
  const parents = readMigrationFolders(FOLDER).filter(({ name }) => name <= reportParent);
  expect(parents).toHaveLength(115);
  for (const parent of parents)
    cpSync(join(FOLDER, parent.name), join(store.migrations, parent.name), { recursive: true });
  // The public path first reaches healthy115; actual116 and private117 then become pending together.
  applyMigrations(store.path, store.migrations);
  withinStore(store.path, (db) => {
    for (const [id, code, name] of [
      ['z-dev', 'dev-one', 'Develop One'],
      ['a-dev', 'dev-two', 'Develop Two'],
      ['z-qa', 'qa-one', 'Test One'],
      ['a-qa', 'qa-two', 'Test Two'],
      ['foreign-dev', 'foreign-dev', 'Foreign Develop'],
    ])
      db.run("UPDATE step SET code='" + code + "',name='" + name + "' WHERE id='" + id + "'");
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    expect(db.all('SELECT name,hash FROM __drizzle_migrations ORDER BY name')).toEqual(
      parents.map(({ name, hash }) => ({ name, hash })),
    );
    expect(
      db.get<{ name: string } | undefined>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='step_definition'",
      ),
    ).toBeUndefined();
    expect(
      db.get<{ name: string } | undefined>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='step_migration_report'",
      ),
    ).toBeUndefined();
    expect(db.all('SELECT id FROM step ORDER BY id')).toEqual([
      { id: 'a-dev' },
      { id: 'a-qa' },
      { id: 'foreign-dev' },
      { id: 'z-dev' },
      { id: 'z-qa' },
    ]);
  });
  const additions = readMigrationFolders(FOLDER).filter(
    ({ name }) => name === '20261115120000_add_step_migration_report' || name === catalogueName,
  );
  expect(additions).toHaveLength(2);
  expect(additions.map(({ name, hash, downHash }) => ({ name, hash, downHash }))).toEqual([
    {
      name: '20261115120000_add_step_migration_report',
      hash: 'aed5faf489f5309267d185518e5d8c1bef80bec5c54e29ef023cafa35c547c9c',
      downHash: '09a031f9a46dc24a9e351f8f8905b40d12357965a165dc8a2eb1048a9547e459',
    },
    {
      name: catalogueName,
      hash: '8a0190da639e17eabc12ea2f4e8096b0a2085db5325ba76fe6cce1080b9994d6',
      downHash: '63ff1aa14f87be82fc6f30a5994ec79e4bc0d6fe9bb679c8a5b6541f2b8b0afd',
    },
  ]);
  for (const addition of additions)
    cpSync(join(FOLDER, addition.name), join(store.migrations, addition.name), { recursive: true });
  expect(readMigrationFolders(store.migrations).map(({ name }) => name)).toEqual(
    [...parents, ...additions].map(({ name }) => name),
  );
  const captureState = () =>
    withinStore(store.path, (db) => ({
      foreignKeys: db.get('PRAGMA foreign_keys'),
      schema: db.all('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name'),
      tables: db
        .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .map(({ name }) => ({
          name,
          rows: db
            .all<Record<string, unknown>>('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
            .sort((left, right) => {
              const a = JSON.stringify(left),
                b = JSON.stringify(right);
              return a < b ? -1 : a > b ? 1 : 0;
            }),
        })),
    }));
  const before = captureState();
  let outcome: { rejected: false } | { rejected: true; cause: unknown } = { rejected: false };
  // This exact public export is called by migrate-cli and migrate-on-startup; no permit is supplied.
  try {
    runMigrations(store.path, store.migrations);
  } catch (cause: unknown) {
    if (isSqliteCleanupUnknown(cause)) hasUnknownOwner = true;
    outcome = { rejected: true, cause };
  }
  if (
    outcome.rejected &&
    (!(outcome.cause instanceof Error) ||
      !outcome.cause.message.includes(
        'step catalogue migration requires the explicit atomic apply owner',
      ))
  ) {
    hasUnknownOwner = true;
    throw new Error('Unexpected ordinary migration failure; fixture retained', {
      cause: outcome.cause,
    });
  }
  // A late guard after the additive prefix is insufficient even if it returns the named refusal.
  // Old default first fails here because the actual pending116 report table was created.
  expect(
    withinStore(store.path, (db) =>
      db.get<{ name: string } | undefined>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='step_migration_report'",
      ),
    ),
  ).toBeUndefined();
  expect(outcome.rejected).toBe(true);
  if (!outcome.rejected)
    throw new Error('Ordinary migrator applied the maintenance-only catalogue migration');
  expect(outcome.cause).toBeInstanceOf(Error);
  if (!(outcome.cause instanceof Error))
    throw new Error('Catalogue admission refusal is not an Error', { cause: outcome.cause });
  expect(outcome.cause.message).toContain(
    'step catalogue migration requires the explicit atomic apply owner',
  );
  expect(captureState()).toEqual(before);
});

/** Real private persistence entry on this fixture's exclusively owned DB; no operator authority is synthesized. */
async function applyOwnedCatalogue(request: StepCatalogueApplyRequest): Promise<void> {
  const { applyStepCatalogue } = await import('./step-catalogue-apply');
  let outcome:
    | { applied: true; ledger: ReturnType<typeof applyStepCatalogue> }
    | { applied: false; cause: unknown };
  try {
    outcome = { applied: true, ledger: applyStepCatalogue(request) };
  } catch (cause: unknown) {
    if (
      !(cause instanceof Error) ||
      cause.message !== 'step catalogue atomic persistence writer is not implemented'
    ) {
      hasUnknownOwner = true;
      throw cause;
    }
    outcome = { applied: false, cause };
  }
  // First scaffold RED is unimplemented application after actual116/rules/E37 prerequisites, not guard proof.
  expect(outcome.applied).toBe(true);
  if (!outcome.applied)
    throw new Error('Private catalogue persistence operation is not implemented', {
      cause: outcome.cause,
    });
  expect(outcome.ledger).toEqual(
    withinStore(request.window.sourcePath, (db) =>
      db.all('SELECT name,hash FROM __drizzle_migrations ORDER BY name'),
    ),
  );
}

test('applies automatic identical and ruled divergent catalogue merges preserving project bindings, package settings, facts and historical bytes', async () => {
  const store = prepareStore();
  const reportParent = '20261115120000_add_step_migration_report';
  const catalogueName = '20261115130000_add_step_catalogue';
  const parents = readMigrationFolders(FOLDER).filter(({ name }) => name <= reportParent);
  expect(parents).toHaveLength(116);
  expect(parents.at(-1)?.name).toBe(reportParent);
  for (const parent of parents)
    cpSync(join(FOLDER, parent.name), join(store.migrations, parent.name), { recursive: true });
  applyMigrations(store.path, store.migrations);
  expect(
    withinStore(store.path, (db) =>
      db.all<{ name: string; hash: string }>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      ),
    ),
  ).toEqual(parents.map(({ name, hash }) => ({ name, hash })));

  seedReportFactWorld(store.path);
  const { createHash } = await import('node:crypto');
  const { sql } = await import('drizzle-orm');
  const hashBytes = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
  const input = '{ "version":1, "stepId":"z-dev", "estimateUnits":{"z-dev":"workdays"} }\n';
  const schedule =
    '{ "version":1, "stepId":"z-dev", "slices":{"leaf-one:z-dev":{"start":0,"end":1}} }\n';
  const payload = '{ "version":1, "forward":{"kind":"setEstimate","stepId":"z-dev"} }\n';
  const inverse =
    '{ "kind":"setEstimate", "stepId":"z-dev", "estimateUnits":{"z-dev":"workdays"} }\n';
  const preconditions = '{ "step:z-dev":7, "moveProgress":{"z-dev":"in_progress"} }\n';
  const beforeEvent = '{ "stepId":"z-dev", "optimistic":1 }\n';
  const afterEvent = '{ "stepId":"z-dev", "optimistic":2 }\n';
  const replay = '{ "kind":"plan.changed", "workPackageId":"w-one", "stepId":"z-dev" }\n';
  withinStore(store.path, (db) => {
    db.run(
      "DELETE FROM work_item_work_item_type WHERE work_item_id IN ('leaf-one','unprotected-one')",
    );
    db.run("UPDATE step SET estimate_unit='workdays' WHERE id='a-qa'");
    expect(
      db.get<{ estimate_unit: string }>("SELECT estimate_unit FROM step WHERE id='a-qa'"),
    ).toEqual({ estimate_unit: 'workdays' });
    db.run(
      "INSERT INTO work_package(id,project_id,name,restricted,created_at,created_by) VALUES('w-third','p-one','Third',0,30,'catalogue-author')",
    );
    db.run(
      "INSERT INTO work_package_organization(resource_id,organization_id) VALUES('w-third','org-a')",
    );
    db.run(
      "INSERT INTO step(id,work_package_id,name,code,position,estimate_unit,allowance_bps,allowance_revision,created_at) VALUES('third-dev','w-third','Develop','dev',10,'workdays',500,9,30),('third-qa','w-third','Test','qa',20,'minutes',100,5,30)",
    );
    expect(
      db.all(
        "SELECT id,project_id FROM work_package WHERE id IN ('w-one','w-two','w-third') ORDER BY id",
      ),
    ).toEqual([
      { id: 'w-one', project_id: 'p-one' },
      { id: 'w-third', project_id: 'p-one' },
      { id: 'w-two', project_id: 'p-two' },
    ]);
    expect(
      db.all("SELECT work_package_id,code FROM step WHERE work_package_id='w-third' ORDER BY code"),
    ).toEqual([
      { work_package_id: 'w-third', code: 'dev' },
      { work_package_id: 'w-third', code: 'qa' },
    ]);
    for (const fact of REPORT_FACT_CASES) {
      const statement = fact.sql.replaceAll(
        "'fact-link'",
        "'catalogue-" + fact.table + '-' + fact.column + "'",
      );
      db.run(statement);
    }
    for (const fact of REPORT_FACT_CASES)
      expect(
        db.get<{ count: number }>(
          'SELECT COUNT(*) AS count FROM "' + fact.table + '" WHERE "' + fact.column + "\"='z-dev'",
        ),
      ).toEqual({ count: 1 });
    for (const table of REPORT_FACT_TABLES)
      expect(db.get<{ count: number }>('SELECT COUNT(*) AS count FROM "' + table + '"')).toEqual({
        count: table === 'typed_dependency' || table === 'external_dependency' ? 2 : 1,
      });
    db.run(sql`INSERT INTO saved_plan(id,work_package_id,name,created_by,created_by_id,created_at,input_schema_version,input_bytes,input_sha256,schedule_schema_version,schedule_bytes,schedule_sha256,schedule_input_sha256,scheduler_algorithm_id)
      VALUES('catalogue-history','w-one','Unmerged identity source','Catalogue Author','catalogue-author',30,1,${Buffer.byteLength(input)},${hashBytes(input)},1,${Buffer.byteLength(schedule)},${hashBytes(schedule)},${hashBytes(input)},'fixture-scheduler')`);
    db.run(
      "INSERT INTO saved_plan_organization(resource_id,organization_id) VALUES('catalogue-history','org-a')",
    );
    db.run(
      sql`INSERT INTO saved_plan_body(saved_plan_id,kind,bytes) VALUES('catalogue-history','input',${input}),('catalogue-history','schedule',${schedule})`,
    );
    db.run(sql`INSERT INTO command_journal(id,work_package_id,user_id,seq,kind,payload,inverse,preconditions,created_at)
      VALUES('catalogue-journal','w-one','catalogue-author',1,'setEstimate',${payload},${inverse},${preconditions},31)`);
    db.run(sql`INSERT INTO plan_event(id,work_package_id,user_id,kind,label,work_item_id,step_id,before,after,created_at)
      VALUES('catalogue-event','w-one','catalogue-author','setEstimate','Unmerged estimate','leaf-one','z-dev',${beforeEvent},${afterEvent},32)`);
    db.run(sql`INSERT INTO optimized_schedule_cache(work_package_id,input_hash,objective,contract_version,budget_ms,generation,status,result_json,created_at)
      VALUES('w-one',${hashBytes(input)},'pri','fixture-contract',1000,1,'ok',${schedule},33)`);
    db.run(
      sql`INSERT INTO event_log(subscription,seq,message,created_at) VALUES('work-package:w-one',1,${replay},34)`,
    );
    db.run("INSERT INTO event_sequencer(subscription,next_seq) VALUES('work-package:w-one',2)");
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    expect(db.all('SELECT id FROM step ORDER BY id')).toEqual([
      { id: 'a-dev' },
      { id: 'a-qa' },
      { id: 'foreign-dev' },
      { id: 'third-dev' },
      { id: 'third-qa' },
      { id: 'z-dev' },
      { id: 'z-qa' },
    ]);
    expect(db.all('SELECT kind,bytes FROM saved_plan_body ORDER BY kind')).toEqual([
      { kind: 'input', bytes: input },
      { kind: 'schedule', bytes: schedule },
    ]);
    expect(
      db.get<{
        input_bytes: number;
        input_sha256: string;
        schedule_bytes: number | null;
        schedule_sha256: string | null;
        schedule_input_sha256: string | null;
      }>(
        "SELECT input_bytes,input_sha256,schedule_bytes,schedule_sha256,schedule_input_sha256 FROM saved_plan WHERE id='catalogue-history'",
      ),
    ).toEqual({
      input_bytes: Buffer.byteLength(input),
      input_sha256: hashBytes(input),
      schedule_bytes: Buffer.byteLength(schedule),
      schedule_sha256: hashBytes(schedule),
      schedule_input_sha256: hashBytes(input),
    });
  });
  const reportStepCatalogue = await readReporter();
  const report = withinStore(store.path, (db) => reportStepCatalogue(db, 40));
  expect(report).toEqual({
    fingerprint: fingerprintOf(report),
    rows: [
      {
        kind: 'shared_code_identical',
        organizationId: 'org-a',
        code: 'dev',
        survivorStepId: 'a-dev',
        stepIds: ['a-dev', 'third-dev', 'z-dev'],
      },
      {
        kind: 'shared_code',
        organizationId: 'org-a',
        code: 'qa',
        differingFields: ['estimateUnit', 'allowanceBps'],
        steps: [
          { id: 'z-qa', name: 'Test', estimateUnit: 'minutes', allowanceBps: 100 },
          { id: 'a-qa', name: 'Test', estimateUnit: 'workdays', allowanceBps: 200 },
          { id: 'third-qa', name: 'Test', estimateUnit: 'minutes', allowanceBps: 100 },
        ],
      },
    ],
  });
  const rules = {
    version: 1,
    fingerprint: fingerprintOf(report),
    organizations: { 'org-a': { codes: { qa: { survivorStepId: 'z-qa' } }, uncoded: {} } },
  };
  const ruleFile = await writeRuleFile(rules);
  const readStepMergeRules = await readRulePreflight();
  expect(withinStore(store.path, (db) => readStepMergeRules(db, ruleFile))).toEqual(rules);

  const additions = readMigrationFolders(FOLDER).filter(({ name }) => name === catalogueName);
  for (const addition of additions)
    cpSync(join(FOLDER, addition.name), join(store.migrations, addition.name), { recursive: true });
  if (directory === undefined) throw new Error('Catalogue migration directory was not acquired');
  const { createWindowBackup, assertWindowBackup } = await import('./window-backup');
  const windowRequest = {
    sourcePath: store.path,
    snapshotPath: join(directory, 'catalogue-window.db'),
    reportPath: join(directory, 'catalogue-window.json'),
    migrationsFolder: store.migrations,
  };
  // This is only an isolated synthetic maintenance fixture. E37 verification does not prove E36 host exclusion.
  let backup: ReturnType<typeof createWindowBackup>;
  let verified: ReturnType<typeof assertWindowBackup>;
  try {
    backup = createWindowBackup(windowRequest);
    verified = assertWindowBackup(windowRequest);
  } catch (cause: unknown) {
    // Retain this fixture on any failed window observation; do not infer that native/artifact custody settled.
    hasUnknownOwner = true;
    throw cause;
  }
  expect(verified).toEqual(backup.report);
  const before = captureNonReportStore(store.path);
  const unchangedTables = new Set(
    before.tables
      .map(({ name }) => name)
      .filter(
        (name) =>
          !['step', '__drizzle_migrations', 'sqlite_sequence', ...REPORT_FACT_TABLES].includes(
            name,
          ),
      ),
  );
  const capturedFacts = withinStore(store.path, (db) =>
    REPORT_FACT_TABLES.map((table) => ({
      table,
      rows: db.all<Record<string, unknown>>('SELECT * FROM "' + table + '"'),
    })),
  );
  const expectedFacts = capturedFacts.map(({ table, rows }) => ({
    table,
    rows: rows
      .map((row) => {
        const copied: Record<string, unknown> = { ...row };
        for (const fact of REPORT_FACT_CASES.filter((fact) => fact.table === table)) {
          const value = copied[fact.column];
          if (value === 'z-dev' || value === 'third-dev') copied[fact.column] = 'a-dev';
          if (value === 'a-qa' || value === 'third-qa') copied[fact.column] = 'z-qa';
        }
        return copied;
      })
      .sort((left, right) =>
        JSON.stringify(left) < JSON.stringify(right)
          ? -1
          : JSON.stringify(left) > JSON.stringify(right)
            ? 1
            : 0,
      ),
  }));
  const ledger = withinStore(store.path, (db) =>
    db.all<Record<string, unknown>>('SELECT * FROM __drizzle_migrations ORDER BY name'),
  );
  const sequences = withinStore(store.path, (db) =>
    db.all("SELECT name,seq FROM sqlite_sequence WHERE name<>'__drizzle_migrations' ORDER BY name"),
  );
  const definitions = withinStore(store.path, (db) =>
    db.all(
      "SELECT s.id,wo.organization_id,s.code,s.name,s.estimate_unit,s.allowance_bps AS default_allowance_bps,s.position,s.created_at,s.created_by,'migration' AS origin,s.work_package_id AS legacy_work_package_id FROM step s JOIN work_package_organization wo ON wo.resource_id=s.work_package_id WHERE s.id IN ('a-dev','foreign-dev','z-qa') ORDER BY s.id",
    ),
  );
  const bindings = [
    {
      organization_id: 'org-b',
      scope_kind: 'project',
      scope_id: 'p-foreign',
      step_id: 'foreign-dev',
      work_item_type_id: null,
      position: 10,
      origin: 'migration',
    },
    {
      organization_id: 'org-a',
      scope_kind: 'project',
      scope_id: 'p-one',
      step_id: 'a-dev',
      work_item_type_id: null,
      position: 10,
      origin: 'migration',
    },
    {
      organization_id: 'org-a',
      scope_kind: 'project',
      scope_id: 'p-one',
      step_id: 'z-qa',
      work_item_type_id: null,
      position: 20,
      origin: 'migration',
    },
    {
      organization_id: 'org-a',
      scope_kind: 'project',
      scope_id: 'p-two',
      step_id: 'a-dev',
      work_item_type_id: null,
      position: 10,
      origin: 'migration',
    },
    {
      organization_id: 'org-a',
      scope_kind: 'project',
      scope_id: 'p-two',
      step_id: 'z-qa',
      work_item_type_id: null,
      position: 20,
      origin: 'migration',
    },
  ];
  const packageSteps = [
    {
      work_package_id: 'w-foreign',
      step_id: 'foreign-dev',
      estimate_unit: 'minutes',
      allowance_bps: 900,
      allowance_revision: 4,
    },
    {
      work_package_id: 'w-one',
      step_id: 'a-dev',
      estimate_unit: 'workdays',
      allowance_bps: 500,
      allowance_revision: 7,
    },
    {
      work_package_id: 'w-one',
      step_id: 'z-qa',
      estimate_unit: 'minutes',
      allowance_bps: 100,
      allowance_revision: 2,
    },
    {
      work_package_id: 'w-third',
      step_id: 'a-dev',
      estimate_unit: 'workdays',
      allowance_bps: 500,
      allowance_revision: 9,
    },
    {
      work_package_id: 'w-third',
      step_id: 'z-qa',
      estimate_unit: 'minutes',
      allowance_bps: 100,
      allowance_revision: 5,
    },
    {
      work_package_id: 'w-two',
      step_id: 'a-dev',
      estimate_unit: 'workdays',
      allowance_bps: 500,
      allowance_revision: 3,
    },
    {
      work_package_id: 'w-two',
      step_id: 'z-qa',
      estimate_unit: 'workdays',
      allowance_bps: 200,
      allowance_revision: 8,
    },
  ];
  const tables = withinStore(store.path, (db) =>
    db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"),
  ).map(({ name }) => name);
  const { readFileSync } = await import('node:fs');
  const { applyStepCatalogue } = await import('./step-catalogue-apply');
  let application:
    | { applied: true; ledger: ReturnType<typeof applyStepCatalogue> }
    | { applied: false; cause: unknown };
  try {
    application = {
      applied: true,
      ledger: applyStepCatalogue({
        window: windowRequest,
        rulesJson: readFileSync(ruleFile, 'utf8'),
        appliedAt: '2026-11-15T12:00:00.000Z',
      }),
    };
  } catch (cause: unknown) {
    if (
      !(cause instanceof Error) ||
      cause.message !==
        'step catalogue unmerged persistence requires resolved report: shared_code_identical,shared_code'
    ) {
      hasUnknownOwner = true;
      throw cause;
    }
    application = { applied: false, cause };
  }
  // Intended first RED is the current private unmerged limitation after valid rules/E37, not fixture failure.
  expect(application.applied).toBe(true);
  if (!application.applied)
    throw new Error('Ruled catalogue merges are not implemented', { cause: application.cause });
  expect(application.ledger).toEqual(
    [...parents, ...additions].map(({ name, hash }) => ({ name, hash })),
  );

  expect(
    withinStore(store.path, (db) =>
      db.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='step_definition'",
      ),
    ),
  ).toEqual({ name: 'step_definition' });

  expect(additions).toHaveLength(1);
  expect(
    withinStore(store.path, (db) =>
      db.all(
        'SELECT id,organization_id,code,name,estimate_unit,default_allowance_bps,position,created_at,created_by,origin,legacy_work_package_id FROM step_definition ORDER BY id',
      ),
    ),
  ).toEqual(definitions);
  expect(
    withinStore(store.path, (db) => db.all('SELECT id FROM step_definition ORDER BY id')),
  ).toEqual([{ id: 'a-dev' }, { id: 'foreign-dev' }, { id: 'z-qa' }]);
  expect(
    withinStore(store.path, (db) =>
      db.all(
        'SELECT organization_id,scope_kind,scope_id,step_id,work_item_type_id,position,origin FROM step_binding ORDER BY scope_id,step_id',
      ),
    ),
  ).toEqual(bindings);
  expect(
    withinStore(store.path, (db) =>
      db.all(
        'SELECT work_package_id,step_id,estimate_unit,allowance_bps,allowance_revision FROM work_package_step ORDER BY work_package_id,step_id',
      ),
    ),
  ).toEqual(packageSteps);
  expect(
    withinStore(store.path, (db) =>
      db.all('SELECT old_step_id,step_id FROM step_identity_history ORDER BY old_step_id'),
    ),
  ).toEqual([
    { old_step_id: 'a-qa', step_id: 'z-qa' },
    { old_step_id: 'third-dev', step_id: 'a-dev' },
    { old_step_id: 'third-qa', step_id: 'z-qa' },
    { old_step_id: 'z-dev', step_id: 'a-dev' },
  ]);
  expect(
    withinStore(store.path, (db) => db.all('SELECT DISTINCT merged_at FROM step_identity_history')),
  ).toEqual([{ merged_at: 1794744000000 }]);
  expect(
    withinStore(store.path, (db) =>
      REPORT_FACT_TABLES.map((table) => ({
        table,
        rows: db
          .all<Record<string, unknown>>('SELECT * FROM "' + table + '"')
          .sort((left, right) =>
            JSON.stringify(left) < JSON.stringify(right)
              ? -1
              : JSON.stringify(left) > JSON.stringify(right)
                ? 1
                : 0,
          ),
      })),
    ),
  ).toEqual(expectedFacts);
  withinStore(store.path, (db) => {
    for (const fact of REPORT_FACT_CASES) {
      expect(
        db.get<{ count: number }>(
          sql`SELECT COUNT(*) AS count FROM ${sql.identifier(fact.table)} WHERE ${sql.identifier(fact.column)}='z-dev'`,
        ),
      ).toEqual({ count: 0 });
      expect(
        db.get<{ count: number }>(
          sql`SELECT COUNT(*) AS count FROM ${sql.identifier(fact.table)} WHERE ${sql.identifier(fact.column)}='a-dev'`,
        ),
      ).toEqual({ count: 1 });
    }
  });
  const after = captureNonReportStore(store.path);
  expect(after.tables.filter(({ name }) => unchangedTables.has(name))).toEqual(
    before.tables.filter(({ name }) => unchangedTables.has(name)),
  );
  expect(
    withinStore(store.path, (db) =>
      db.all(
        "SELECT name,seq FROM sqlite_sequence WHERE name<>'__drizzle_migrations' ORDER BY name",
      ),
    ),
  ).toEqual(sequences);
  const finalLedger = withinStore(store.path, (db) =>
    db.all<Record<string, unknown>>('SELECT * FROM __drizzle_migrations ORDER BY name'),
  );
  expect(finalLedger).toHaveLength(117);
  expect(finalLedger.slice(0, 116)).toEqual(ledger);
  expect(
    withinStore(store.path, (db) =>
      db.all<{ name: string; hash: string }>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      ),
    ),
  ).toEqual([...parents, ...additions].map(({ name, hash }) => ({ name, hash })));
  expect(
    withinStore(store.path, (db) =>
      db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"),
    ).map(({ name }) => name),
  ).toEqual(
    [
      ...tables.filter((name) => name !== 'step'),
      'step_definition',
      'step_binding',
      'work_package_step',
      'step_identity_history',
    ].sort(),
  );
  withinStore(store.path, (db) => {
    for (const fact of REPORT_FACT_CASES) {
      const target = fact.table === 'external_dependency' ? 'work_package_step' : 'step_definition';
      const column = fact.table === 'external_dependency' ? 'step_id' : 'id';
      expect(
        db
          .all<{ table: string; from: string; to: string }>(
            'PRAGMA foreign_key_list("' + fact.table + '")',
          )
          .filter((row) => row.from === fact.column && row.to === column)
          .map((row) => row.table),
      ).toEqual([target]);
    }
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
});

test('preserves actual token estimate mirror metadata and exact trigger SQL through ruled catalogue merges', async () => {
  const store = prepareStore();
  const reportParent = '20261115120000_add_step_migration_report';
  const catalogueName = '20261115130000_add_step_catalogue';
  const parents = readMigrationFolders(FOLDER).filter(({ name }) => name <= reportParent);
  expect(parents).toHaveLength(116);
  expect(parents.at(-1)?.name).toBe(reportParent);
  for (const parent of parents)
    cpSync(join(FOLDER, parent.name), join(store.migrations, parent.name), { recursive: true });
  applyMigrations(store.path, store.migrations);
  expect(
    withinStore(store.path, (db) =>
      db.all<{ name: string; hash: string }>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      ),
    ),
  ).toEqual(parents.map(({ name, hash }) => ({ name, hash })));

  seedReportFactWorld(store.path);
  const { createHash } = await import('node:crypto');
  const { sql } = await import('drizzle-orm');
  const hashBytes = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
  const input = '{ "version":1, "stepId":"z-dev", "estimateUnits":{"z-dev":"workdays"} }\n';
  const schedule =
    '{ "version":1, "stepId":"z-dev", "slices":{"leaf-one:z-dev":{"start":0,"end":1}} }\n';
  const payload = '{ "version":1, "forward":{"kind":"setEstimate","stepId":"z-dev"} }\n';
  const inverse =
    '{ "kind":"setEstimate", "stepId":"z-dev", "estimateUnits":{"z-dev":"workdays"} }\n';
  const preconditions = '{ "step:z-dev":7, "moveProgress":{"z-dev":"in_progress"} }\n';
  const beforeEvent = '{ "stepId":"z-dev", "optimistic":1 }\n';
  const afterEvent = '{ "stepId":"z-dev", "optimistic":2 }\n';
  const replay = '{ "kind":"plan.changed", "workPackageId":"w-one", "stepId":"z-dev" }\n';
  withinStore(store.path, (db) => {
    db.run(
      "DELETE FROM work_item_work_item_type WHERE work_item_id IN ('leaf-one','unprotected-one')",
    );
    db.run("UPDATE step SET estimate_unit='workdays' WHERE id='a-qa'");
    expect(
      db.get<{ estimate_unit: string }>("SELECT estimate_unit FROM step WHERE id='a-qa'"),
    ).toEqual({ estimate_unit: 'workdays' });
    db.run(
      "INSERT INTO work_package(id,project_id,name,restricted,created_at,created_by) VALUES('w-third','p-one','Third',0,30,'catalogue-author')",
    );
    db.run(
      "INSERT INTO work_package_organization(resource_id,organization_id) VALUES('w-third','org-a')",
    );
    db.run(
      "INSERT INTO step(id,work_package_id,name,code,position,estimate_unit,allowance_bps,allowance_revision,created_at) VALUES('third-dev','w-third','Develop','dev',10,'workdays',500,9,30),('third-qa','w-third','Test','qa',20,'minutes',100,5,30)",
    );
    expect(
      db.all(
        "SELECT id,project_id FROM work_package WHERE id IN ('w-one','w-two','w-third') ORDER BY id",
      ),
    ).toEqual([
      { id: 'w-one', project_id: 'p-one' },
      { id: 'w-third', project_id: 'p-one' },
      { id: 'w-two', project_id: 'p-two' },
    ]);
    expect(
      db.all("SELECT work_package_id,code FROM step WHERE work_package_id='w-third' ORDER BY code"),
    ).toEqual([
      { work_package_id: 'w-third', code: 'dev' },
      { work_package_id: 'w-third', code: 'qa' },
    ]);
    for (const fact of REPORT_FACT_CASES) {
      const statement = fact.sql.replaceAll(
        "'fact-link'",
        "'catalogue-" + fact.table + '-' + fact.column + "'",
      );
      if (fact.table === 'step_measure') {
        db.run(
          "INSERT INTO step_measure(work_item_id,step_id,metric,value,recorded_at,created_at,updated_at,created_by) VALUES('leaf-one','z-dev','token_estimate',7,20,10,11,'catalogue-author')",
        );
      } else if (fact.table === 'measure_estimate') {
        // Real mirror birth owns the matching trio; independently persisted audit metadata must survive identity retarget.
        db.run(
          "UPDATE measure_estimate SET created_at=101,updated_at=102,created_by='catalogue-author' WHERE work_item_id='leaf-one' AND step_id='z-dev' AND measure_key='tokens'",
        );
      } else db.run(statement);
    }
    for (const fact of REPORT_FACT_CASES)
      expect(
        db.get<{ count: number }>(
          'SELECT COUNT(*) AS count FROM "' + fact.table + '" WHERE "' + fact.column + "\"='z-dev'",
        ),
      ).toEqual({ count: 1 });
    for (const table of REPORT_FACT_TABLES)
      expect(db.get<{ count: number }>('SELECT COUNT(*) AS count FROM "' + table + '"')).toEqual({
        count: table === 'typed_dependency' || table === 'external_dependency' ? 2 : 1,
      });
    db.run(sql`INSERT INTO saved_plan(id,work_package_id,name,created_by,created_by_id,created_at,input_schema_version,input_bytes,input_sha256,schedule_schema_version,schedule_bytes,schedule_sha256,schedule_input_sha256,scheduler_algorithm_id)
      VALUES('catalogue-history','w-one','Unmerged identity source','Catalogue Author','catalogue-author',30,1,${Buffer.byteLength(input)},${hashBytes(input)},1,${Buffer.byteLength(schedule)},${hashBytes(schedule)},${hashBytes(input)},'fixture-scheduler')`);
    db.run(
      "INSERT INTO saved_plan_organization(resource_id,organization_id) VALUES('catalogue-history','org-a')",
    );
    db.run(
      sql`INSERT INTO saved_plan_body(saved_plan_id,kind,bytes) VALUES('catalogue-history','input',${input}),('catalogue-history','schedule',${schedule})`,
    );
    db.run(sql`INSERT INTO command_journal(id,work_package_id,user_id,seq,kind,payload,inverse,preconditions,created_at)
      VALUES('catalogue-journal','w-one','catalogue-author',1,'setEstimate',${payload},${inverse},${preconditions},31)`);
    db.run(sql`INSERT INTO plan_event(id,work_package_id,user_id,kind,label,work_item_id,step_id,before,after,created_at)
      VALUES('catalogue-event','w-one','catalogue-author','setEstimate','Unmerged estimate','leaf-one','z-dev',${beforeEvent},${afterEvent},32)`);
    db.run(sql`INSERT INTO optimized_schedule_cache(work_package_id,input_hash,objective,contract_version,budget_ms,generation,status,result_json,created_at)
      VALUES('w-one',${hashBytes(input)},'pri','fixture-contract',1000,1,'ok',${schedule},33)`);
    db.run(
      sql`INSERT INTO event_log(subscription,seq,message,created_at) VALUES('work-package:w-one',1,${replay},34)`,
    );
    db.run("INSERT INTO event_sequencer(subscription,next_seq) VALUES('work-package:w-one',2)");
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    expect(db.all('SELECT id FROM step ORDER BY id')).toEqual([
      { id: 'a-dev' },
      { id: 'a-qa' },
      { id: 'foreign-dev' },
      { id: 'third-dev' },
      { id: 'third-qa' },
      { id: 'z-dev' },
      { id: 'z-qa' },
    ]);
    expect(db.all('SELECT kind,bytes FROM saved_plan_body ORDER BY kind')).toEqual([
      { kind: 'input', bytes: input },
      { kind: 'schedule', bytes: schedule },
    ]);
    expect(
      db.get<{
        input_bytes: number;
        input_sha256: string;
        schedule_bytes: number | null;
        schedule_sha256: string | null;
        schedule_input_sha256: string | null;
      }>(
        "SELECT input_bytes,input_sha256,schedule_bytes,schedule_sha256,schedule_input_sha256 FROM saved_plan WHERE id='catalogue-history'",
      ),
    ).toEqual({
      input_bytes: Buffer.byteLength(input),
      input_sha256: hashBytes(input),
      schedule_bytes: Buffer.byteLength(schedule),
      schedule_sha256: hashBytes(schedule),
      schedule_input_sha256: hashBytes(input),
    });
  });
  expect(
    withinStore(store.path, (db) =>
      db.all(
        "SELECT optimistic,realistic,pessimistic,single_point,created_at,updated_at,created_by FROM measure_estimate WHERE work_item_id='leaf-one' AND step_id='z-dev' AND measure_key='tokens'",
      ),
    ),
  ).toEqual([
    {
      optimistic: 7,
      realistic: 7,
      pessimistic: 7,
      single_point: 1,
      created_at: 101,
      updated_at: 102,
      created_by: 'catalogue-author',
    },
  ]);
  const mirrorBefore = withinStore(store.path, (db) =>
    db.get<{ sql: string | null } | undefined>(
      "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='step_measure_mirrors_token_estimate_update'",
    ),
  );
  expect(mirrorBefore).toBeDefined();
  if (mirrorBefore === undefined || typeof mirrorBefore.sql !== 'string')
    throw new Error('Actual token mirror SQL is absent');
  const mirrorHash = hashBytes(mirrorBefore.sql);
  const reportStepCatalogue = await readReporter();
  const report = withinStore(store.path, (db) => reportStepCatalogue(db, 40));
  expect(report).toEqual({
    fingerprint: fingerprintOf(report),
    rows: [
      {
        kind: 'shared_code_identical',
        organizationId: 'org-a',
        code: 'dev',
        survivorStepId: 'a-dev',
        stepIds: ['a-dev', 'third-dev', 'z-dev'],
      },
      {
        kind: 'shared_code',
        organizationId: 'org-a',
        code: 'qa',
        differingFields: ['estimateUnit', 'allowanceBps'],
        steps: [
          { id: 'z-qa', name: 'Test', estimateUnit: 'minutes', allowanceBps: 100 },
          { id: 'a-qa', name: 'Test', estimateUnit: 'workdays', allowanceBps: 200 },
          { id: 'third-qa', name: 'Test', estimateUnit: 'minutes', allowanceBps: 100 },
        ],
      },
    ],
  });
  const rules = {
    version: 1,
    fingerprint: fingerprintOf(report),
    organizations: { 'org-a': { codes: { qa: { survivorStepId: 'z-qa' } }, uncoded: {} } },
  };
  const ruleFile = await writeRuleFile(rules);
  const readStepMergeRules = await readRulePreflight();
  expect(withinStore(store.path, (db) => readStepMergeRules(db, ruleFile))).toEqual(rules);

  const additions = readMigrationFolders(FOLDER).filter(({ name }) => name === catalogueName);
  for (const addition of additions)
    cpSync(join(FOLDER, addition.name), join(store.migrations, addition.name), { recursive: true });
  if (directory === undefined) throw new Error('Catalogue migration directory was not acquired');
  const { createWindowBackup, assertWindowBackup } = await import('./window-backup');
  const windowRequest = {
    sourcePath: store.path,
    snapshotPath: join(directory, 'catalogue-window.db'),
    reportPath: join(directory, 'catalogue-window.json'),
    migrationsFolder: store.migrations,
  };
  // This is only an isolated synthetic maintenance fixture. E37 verification does not prove E36 host exclusion.
  let backup: ReturnType<typeof createWindowBackup>;
  let verified: ReturnType<typeof assertWindowBackup>;
  try {
    backup = createWindowBackup(windowRequest);
    verified = assertWindowBackup(windowRequest);
  } catch (cause: unknown) {
    // Retain this fixture on any failed window observation; do not infer that native/artifact custody settled.
    hasUnknownOwner = true;
    throw cause;
  }
  expect(verified).toEqual(backup.report);
  const before = captureNonReportStore(store.path);
  const unchangedTables = new Set(
    before.tables
      .map(({ name }) => name)
      .filter(
        (name) =>
          !['step', '__drizzle_migrations', 'sqlite_sequence', ...REPORT_FACT_TABLES].includes(
            name,
          ),
      ),
  );
  const capturedFacts = withinStore(store.path, (db) =>
    REPORT_FACT_TABLES.map((table) => ({
      table,
      rows: db.all<Record<string, unknown>>('SELECT * FROM "' + table + '"'),
    })),
  );
  const expectedFacts = capturedFacts.map(({ table, rows }) => ({
    table,
    rows: rows
      .map((row) => {
        const copied: Record<string, unknown> = { ...row };
        for (const fact of REPORT_FACT_CASES.filter((fact) => fact.table === table)) {
          const value = copied[fact.column];
          if (value === 'z-dev' || value === 'third-dev') copied[fact.column] = 'a-dev';
          if (value === 'a-qa' || value === 'third-qa') copied[fact.column] = 'z-qa';
        }
        return copied;
      })
      .sort((left, right) =>
        JSON.stringify(left) < JSON.stringify(right)
          ? -1
          : JSON.stringify(left) > JSON.stringify(right)
            ? 1
            : 0,
      ),
  }));
  const ledger = withinStore(store.path, (db) =>
    db.all<Record<string, unknown>>('SELECT * FROM __drizzle_migrations ORDER BY name'),
  );
  const sequences = withinStore(store.path, (db) =>
    db.all("SELECT name,seq FROM sqlite_sequence WHERE name<>'__drizzle_migrations' ORDER BY name"),
  );
  const definitions = withinStore(store.path, (db) =>
    db.all(
      "SELECT s.id,wo.organization_id,s.code,s.name,s.estimate_unit,s.allowance_bps AS default_allowance_bps,s.position,s.created_at,s.created_by,'migration' AS origin,s.work_package_id AS legacy_work_package_id FROM step s JOIN work_package_organization wo ON wo.resource_id=s.work_package_id WHERE s.id IN ('a-dev','foreign-dev','z-qa') ORDER BY s.id",
    ),
  );
  const bindings = [
    {
      organization_id: 'org-b',
      scope_kind: 'project',
      scope_id: 'p-foreign',
      step_id: 'foreign-dev',
      work_item_type_id: null,
      position: 10,
      origin: 'migration',
    },
    {
      organization_id: 'org-a',
      scope_kind: 'project',
      scope_id: 'p-one',
      step_id: 'a-dev',
      work_item_type_id: null,
      position: 10,
      origin: 'migration',
    },
    {
      organization_id: 'org-a',
      scope_kind: 'project',
      scope_id: 'p-one',
      step_id: 'z-qa',
      work_item_type_id: null,
      position: 20,
      origin: 'migration',
    },
    {
      organization_id: 'org-a',
      scope_kind: 'project',
      scope_id: 'p-two',
      step_id: 'a-dev',
      work_item_type_id: null,
      position: 10,
      origin: 'migration',
    },
    {
      organization_id: 'org-a',
      scope_kind: 'project',
      scope_id: 'p-two',
      step_id: 'z-qa',
      work_item_type_id: null,
      position: 20,
      origin: 'migration',
    },
  ];
  const packageSteps = [
    {
      work_package_id: 'w-foreign',
      step_id: 'foreign-dev',
      estimate_unit: 'minutes',
      allowance_bps: 900,
      allowance_revision: 4,
    },
    {
      work_package_id: 'w-one',
      step_id: 'a-dev',
      estimate_unit: 'workdays',
      allowance_bps: 500,
      allowance_revision: 7,
    },
    {
      work_package_id: 'w-one',
      step_id: 'z-qa',
      estimate_unit: 'minutes',
      allowance_bps: 100,
      allowance_revision: 2,
    },
    {
      work_package_id: 'w-third',
      step_id: 'a-dev',
      estimate_unit: 'workdays',
      allowance_bps: 500,
      allowance_revision: 9,
    },
    {
      work_package_id: 'w-third',
      step_id: 'z-qa',
      estimate_unit: 'minutes',
      allowance_bps: 100,
      allowance_revision: 5,
    },
    {
      work_package_id: 'w-two',
      step_id: 'a-dev',
      estimate_unit: 'workdays',
      allowance_bps: 500,
      allowance_revision: 3,
    },
    {
      work_package_id: 'w-two',
      step_id: 'z-qa',
      estimate_unit: 'workdays',
      allowance_bps: 200,
      allowance_revision: 8,
    },
  ];
  const tables = withinStore(store.path, (db) =>
    db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"),
  ).map(({ name }) => name);
  const { readFileSync } = await import('node:fs');
  const { applyStepCatalogue } = await import('./step-catalogue-apply');
  let application:
    | { applied: true; ledger: ReturnType<typeof applyStepCatalogue> }
    | { applied: false; cause: unknown };
  try {
    application = {
      applied: true,
      ledger: applyStepCatalogue({
        window: windowRequest,
        rulesJson: readFileSync(ruleFile, 'utf8'),
        appliedAt: '2026-11-15T12:00:00.000Z',
      }),
    };
  } catch (cause: unknown) {
    if (
      !(cause instanceof Error) ||
      cause.message !==
        'step catalogue unmerged persistence requires resolved report: shared_code_identical,shared_code'
    ) {
      hasUnknownOwner = true;
      throw cause;
    }
    application = { applied: false, cause };
  }
  // Ordinary token-mirror baseline on the merged writer; setup must reach actual application.
  expect(application.applied).toBe(true);
  if (!application.applied)
    throw new Error('Ruled catalogue merges are not implemented', { cause: application.cause });
  expect(application.ledger).toEqual(
    [...parents, ...additions].map(({ name, hash }) => ({ name, hash })),
  );
  const mirrorAfter = withinStore(store.path, (db) =>
    db.get<{ sql: string | null } | undefined>(
      "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='step_measure_mirrors_token_estimate_update'",
    ),
  );
  expect(mirrorAfter).toEqual(mirrorBefore);
  if (mirrorAfter === undefined || typeof mirrorAfter.sql !== 'string')
    throw new Error('Token mirror SQL was not restored');
  expect(hashBytes(mirrorAfter.sql)).toBe(mirrorHash);

  expect(
    withinStore(store.path, (db) =>
      db.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='step_definition'",
      ),
    ),
  ).toEqual({ name: 'step_definition' });

  expect(additions).toHaveLength(1);
  expect(
    withinStore(store.path, (db) =>
      db.all(
        'SELECT id,organization_id,code,name,estimate_unit,default_allowance_bps,position,created_at,created_by,origin,legacy_work_package_id FROM step_definition ORDER BY id',
      ),
    ),
  ).toEqual(definitions);
  expect(
    withinStore(store.path, (db) => db.all('SELECT id FROM step_definition ORDER BY id')),
  ).toEqual([{ id: 'a-dev' }, { id: 'foreign-dev' }, { id: 'z-qa' }]);
  expect(
    withinStore(store.path, (db) =>
      db.all(
        'SELECT organization_id,scope_kind,scope_id,step_id,work_item_type_id,position,origin FROM step_binding ORDER BY scope_id,step_id',
      ),
    ),
  ).toEqual(bindings);
  expect(
    withinStore(store.path, (db) =>
      db.all(
        'SELECT work_package_id,step_id,estimate_unit,allowance_bps,allowance_revision FROM work_package_step ORDER BY work_package_id,step_id',
      ),
    ),
  ).toEqual(packageSteps);
  expect(
    withinStore(store.path, (db) =>
      db.all('SELECT old_step_id,step_id FROM step_identity_history ORDER BY old_step_id'),
    ),
  ).toEqual([
    { old_step_id: 'a-qa', step_id: 'z-qa' },
    { old_step_id: 'third-dev', step_id: 'a-dev' },
    { old_step_id: 'third-qa', step_id: 'z-qa' },
    { old_step_id: 'z-dev', step_id: 'a-dev' },
  ]);
  expect(
    withinStore(store.path, (db) => db.all('SELECT DISTINCT merged_at FROM step_identity_history')),
  ).toEqual([{ merged_at: 1794744000000 }]);
  expect(
    withinStore(store.path, (db) =>
      REPORT_FACT_TABLES.map((table) => ({
        table,
        rows: db
          .all<Record<string, unknown>>('SELECT * FROM "' + table + '"')
          .sort((left, right) =>
            JSON.stringify(left) < JSON.stringify(right)
              ? -1
              : JSON.stringify(left) > JSON.stringify(right)
                ? 1
                : 0,
          ),
      })),
    ),
  ).toEqual(expectedFacts);
  withinStore(store.path, (db) => {
    for (const fact of REPORT_FACT_CASES) {
      expect(
        db.get<{ count: number }>(
          sql`SELECT COUNT(*) AS count FROM ${sql.identifier(fact.table)} WHERE ${sql.identifier(fact.column)}='z-dev'`,
        ),
      ).toEqual({ count: 0 });
      expect(
        db.get<{ count: number }>(
          sql`SELECT COUNT(*) AS count FROM ${sql.identifier(fact.table)} WHERE ${sql.identifier(fact.column)}='a-dev'`,
        ),
      ).toEqual({ count: 1 });
    }
  });
  const after = captureNonReportStore(store.path);
  expect(after.tables.filter(({ name }) => unchangedTables.has(name))).toEqual(
    before.tables.filter(({ name }) => unchangedTables.has(name)),
  );
  expect(
    withinStore(store.path, (db) =>
      db.all(
        "SELECT name,seq FROM sqlite_sequence WHERE name<>'__drizzle_migrations' ORDER BY name",
      ),
    ),
  ).toEqual(sequences);
  const finalLedger = withinStore(store.path, (db) =>
    db.all<Record<string, unknown>>('SELECT * FROM __drizzle_migrations ORDER BY name'),
  );
  expect(finalLedger).toHaveLength(117);
  expect(finalLedger.slice(0, 116)).toEqual(ledger);
  expect(
    withinStore(store.path, (db) =>
      db.all<{ name: string; hash: string }>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      ),
    ),
  ).toEqual([...parents, ...additions].map(({ name, hash }) => ({ name, hash })));
  expect(
    withinStore(store.path, (db) =>
      db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"),
    ).map(({ name }) => name),
  ).toEqual(
    [
      ...tables.filter((name) => name !== 'step'),
      'step_definition',
      'step_binding',
      'work_package_step',
      'step_identity_history',
    ].sort(),
  );
  withinStore(store.path, (db) => {
    for (const fact of REPORT_FACT_CASES) {
      const target = fact.table === 'external_dependency' ? 'work_package_step' : 'step_definition';
      const column = fact.table === 'external_dependency' ? 'step_id' : 'id';
      expect(
        db
          .all<{ table: string; from: string; to: string }>(
            'PRAGMA foreign_key_list("' + fact.table + '")',
          )
          .filter((row) => row.from === fact.column && row.to === column)
          .map((row) => row.table),
      ).toEqual([target]);
    }
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
});

test('rolls back transformed catalogue rows and exact token mirror SQL after a real retarget persistence failure', async () => {
  const store = prepareStore();
  const reportParent = '20261115120000_add_step_migration_report';
  const catalogueName = '20261115130000_add_step_catalogue';
  const parents = readMigrationFolders(FOLDER).filter(({ name }) => name <= reportParent);
  expect(parents).toHaveLength(116);
  expect(parents.at(-1)?.name).toBe(reportParent);
  for (const parent of parents)
    cpSync(join(FOLDER, parent.name), join(store.migrations, parent.name), { recursive: true });
  applyMigrations(store.path, store.migrations);
  expect(
    withinStore(store.path, (db) =>
      db.all<{ name: string; hash: string }>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      ),
    ),
  ).toEqual(parents.map(({ name, hash }) => ({ name, hash })));

  seedReportFactWorld(store.path);
  const { createHash } = await import('node:crypto');
  const { sql } = await import('drizzle-orm');
  const hashBytes = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
  const input = '{ "version":1, "stepId":"z-dev", "estimateUnits":{"z-dev":"workdays"} }\n';
  const schedule =
    '{ "version":1, "stepId":"z-dev", "slices":{"leaf-one:z-dev":{"start":0,"end":1}} }\n';
  const payload = '{ "version":1, "forward":{"kind":"setEstimate","stepId":"z-dev"} }\n';
  const inverse =
    '{ "kind":"setEstimate", "stepId":"z-dev", "estimateUnits":{"z-dev":"workdays"} }\n';
  const preconditions = '{ "step:z-dev":7, "moveProgress":{"z-dev":"in_progress"} }\n';
  const beforeEvent = '{ "stepId":"z-dev", "optimistic":1 }\n';
  const afterEvent = '{ "stepId":"z-dev", "optimistic":2 }\n';
  const replay = '{ "kind":"plan.changed", "workPackageId":"w-one", "stepId":"z-dev" }\n';
  withinStore(store.path, (db) => {
    db.run(
      "DELETE FROM work_item_work_item_type WHERE work_item_id IN ('leaf-one','unprotected-one')",
    );
    db.run("UPDATE step SET estimate_unit='workdays' WHERE id='a-qa'");
    expect(
      db.get<{ estimate_unit: string }>("SELECT estimate_unit FROM step WHERE id='a-qa'"),
    ).toEqual({ estimate_unit: 'workdays' });
    db.run(
      "INSERT INTO work_package(id,project_id,name,restricted,created_at,created_by) VALUES('w-third','p-one','Third',0,30,'catalogue-author')",
    );
    db.run(
      "INSERT INTO work_package_organization(resource_id,organization_id) VALUES('w-third','org-a')",
    );
    db.run(
      "INSERT INTO step(id,work_package_id,name,code,position,estimate_unit,allowance_bps,allowance_revision,created_at) VALUES('third-dev','w-third','Develop','dev',10,'workdays',500,9,30),('third-qa','w-third','Test','qa',20,'minutes',100,5,30)",
    );
    expect(
      db.all(
        "SELECT id,project_id FROM work_package WHERE id IN ('w-one','w-two','w-third') ORDER BY id",
      ),
    ).toEqual([
      { id: 'w-one', project_id: 'p-one' },
      { id: 'w-third', project_id: 'p-one' },
      { id: 'w-two', project_id: 'p-two' },
    ]);
    expect(
      db.all("SELECT work_package_id,code FROM step WHERE work_package_id='w-third' ORDER BY code"),
    ).toEqual([
      { work_package_id: 'w-third', code: 'dev' },
      { work_package_id: 'w-third', code: 'qa' },
    ]);
    for (const fact of REPORT_FACT_CASES) {
      const statement = fact.sql.replaceAll(
        "'fact-link'",
        "'catalogue-" + fact.table + '-' + fact.column + "'",
      );
      if (fact.table === 'step_measure') {
        db.run(
          "INSERT INTO step_measure(work_item_id,step_id,metric,value,recorded_at,created_at,updated_at,created_by) VALUES('leaf-one','z-dev','token_estimate',7,20,10,11,'catalogue-author')",
        );
      } else if (fact.table === 'measure_estimate') {
        // Real mirror birth owns the matching trio; independently persisted audit metadata must survive identity retarget.
        db.run(
          "UPDATE measure_estimate SET created_at=101,updated_at=102,created_by='catalogue-author' WHERE work_item_id='leaf-one' AND step_id='z-dev' AND measure_key='tokens'",
        );
      } else db.run(statement);
    }
    for (const fact of REPORT_FACT_CASES)
      expect(
        db.get<{ count: number }>(
          'SELECT COUNT(*) AS count FROM "' + fact.table + '" WHERE "' + fact.column + "\"='z-dev'",
        ),
      ).toEqual({ count: 1 });
    for (const table of REPORT_FACT_TABLES)
      expect(db.get<{ count: number }>('SELECT COUNT(*) AS count FROM "' + table + '"')).toEqual({
        count: table === 'typed_dependency' || table === 'external_dependency' ? 2 : 1,
      });
    db.run(sql`INSERT INTO saved_plan(id,work_package_id,name,created_by,created_by_id,created_at,input_schema_version,input_bytes,input_sha256,schedule_schema_version,schedule_bytes,schedule_sha256,schedule_input_sha256,scheduler_algorithm_id)
      VALUES('catalogue-history','w-one','Unmerged identity source','Catalogue Author','catalogue-author',30,1,${Buffer.byteLength(input)},${hashBytes(input)},1,${Buffer.byteLength(schedule)},${hashBytes(schedule)},${hashBytes(input)},'fixture-scheduler')`);
    db.run(
      "INSERT INTO saved_plan_organization(resource_id,organization_id) VALUES('catalogue-history','org-a')",
    );
    db.run(
      sql`INSERT INTO saved_plan_body(saved_plan_id,kind,bytes) VALUES('catalogue-history','input',${input}),('catalogue-history','schedule',${schedule})`,
    );
    db.run(sql`INSERT INTO command_journal(id,work_package_id,user_id,seq,kind,payload,inverse,preconditions,created_at)
      VALUES('catalogue-journal','w-one','catalogue-author',1,'setEstimate',${payload},${inverse},${preconditions},31)`);
    db.run(sql`INSERT INTO plan_event(id,work_package_id,user_id,kind,label,work_item_id,step_id,before,after,created_at)
      VALUES('catalogue-event','w-one','catalogue-author','setEstimate','Unmerged estimate','leaf-one','z-dev',${beforeEvent},${afterEvent},32)`);
    db.run(sql`INSERT INTO optimized_schedule_cache(work_package_id,input_hash,objective,contract_version,budget_ms,generation,status,result_json,created_at)
      VALUES('w-one',${hashBytes(input)},'pri','fixture-contract',1000,1,'ok',${schedule},33)`);
    db.run(
      sql`INSERT INTO event_log(subscription,seq,message,created_at) VALUES('work-package:w-one',1,${replay},34)`,
    );
    db.run("INSERT INTO event_sequencer(subscription,next_seq) VALUES('work-package:w-one',2)");
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    expect(db.all('SELECT id FROM step ORDER BY id')).toEqual([
      { id: 'a-dev' },
      { id: 'a-qa' },
      { id: 'foreign-dev' },
      { id: 'third-dev' },
      { id: 'third-qa' },
      { id: 'z-dev' },
      { id: 'z-qa' },
    ]);
    expect(db.all('SELECT kind,bytes FROM saved_plan_body ORDER BY kind')).toEqual([
      { kind: 'input', bytes: input },
      { kind: 'schedule', bytes: schedule },
    ]);
    expect(
      db.get<{
        input_bytes: number;
        input_sha256: string;
        schedule_bytes: number | null;
        schedule_sha256: string | null;
        schedule_input_sha256: string | null;
      }>(
        "SELECT input_bytes,input_sha256,schedule_bytes,schedule_sha256,schedule_input_sha256 FROM saved_plan WHERE id='catalogue-history'",
      ),
    ).toEqual({
      input_bytes: Buffer.byteLength(input),
      input_sha256: hashBytes(input),
      schedule_bytes: Buffer.byteLength(schedule),
      schedule_sha256: hashBytes(schedule),
      schedule_input_sha256: hashBytes(input),
    });
  });
  expect(
    withinStore(store.path, (db) =>
      db.all(
        "SELECT optimistic,realistic,pessimistic,single_point,created_at,updated_at,created_by FROM measure_estimate WHERE work_item_id='leaf-one' AND step_id='z-dev' AND measure_key='tokens'",
      ),
    ),
  ).toEqual([
    {
      optimistic: 7,
      realistic: 7,
      pessimistic: 7,
      single_point: 1,
      created_at: 101,
      updated_at: 102,
      created_by: 'catalogue-author',
    },
  ]);
  const mirrorBefore = withinStore(store.path, (db) =>
    db.get<{ sql: string | null } | undefined>(
      "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='step_measure_mirrors_token_estimate_update'",
    ),
  );
  expect(mirrorBefore).toBeDefined();
  if (mirrorBefore === undefined || typeof mirrorBefore.sql !== 'string')
    throw new Error('Actual token mirror SQL is absent');
  const mirrorHash = hashBytes(mirrorBefore.sql);
  const reportStepCatalogue = await readReporter();
  const report = withinStore(store.path, (db) => reportStepCatalogue(db, 40));
  expect(report).toEqual({
    fingerprint: fingerprintOf(report),
    rows: [
      {
        kind: 'shared_code_identical',
        organizationId: 'org-a',
        code: 'dev',
        survivorStepId: 'a-dev',
        stepIds: ['a-dev', 'third-dev', 'z-dev'],
      },
      {
        kind: 'shared_code',
        organizationId: 'org-a',
        code: 'qa',
        differingFields: ['estimateUnit', 'allowanceBps'],
        steps: [
          { id: 'z-qa', name: 'Test', estimateUnit: 'minutes', allowanceBps: 100 },
          { id: 'a-qa', name: 'Test', estimateUnit: 'workdays', allowanceBps: 200 },
          { id: 'third-qa', name: 'Test', estimateUnit: 'minutes', allowanceBps: 100 },
        ],
      },
    ],
  });
  const rules = {
    version: 1,
    fingerprint: fingerprintOf(report),
    organizations: { 'org-a': { codes: { qa: { survivorStepId: 'z-qa' } }, uncoded: {} } },
  };
  const ruleFile = await writeRuleFile(rules);
  const readStepMergeRules = await readRulePreflight();
  expect(withinStore(store.path, (db) => readStepMergeRules(db, ruleFile))).toEqual(rules);

  const additions = readMigrationFolders(FOLDER).filter(({ name }) => name === catalogueName);
  expect(additions).toHaveLength(1);
  for (const addition of additions)
    cpSync(join(FOLDER, addition.name), join(store.migrations, addition.name), { recursive: true });
  if (directory === undefined) throw new Error('Catalogue migration directory was not acquired');
  const { createWindowBackup, assertWindowBackup } = await import('./window-backup');
  const windowRequest = {
    sourcePath: store.path,
    snapshotPath: join(directory, 'catalogue-window.db'),
    reportPath: join(directory, 'catalogue-window.json'),
    migrationsFolder: store.migrations,
  };
  withinStore(store.path, (db) =>
    db.run(
      "CREATE TRIGGER catalogue_retarget_injection BEFORE UPDATE OF step_id ON estimate WHEN OLD.step_id='z-dev' AND NEW.step_id='a-dev' BEGIN SELECT RAISE(ABORT,'catalogue retarget injection'); END",
    ),
  );
  // This is only an isolated synthetic maintenance fixture. E37 verification does not prove E36 host exclusion.
  let backup: ReturnType<typeof createWindowBackup>;
  let verified: ReturnType<typeof assertWindowBackup>;
  try {
    backup = createWindowBackup(windowRequest);
    verified = assertWindowBackup(windowRequest);
  } catch (cause: unknown) {
    // Retain this fixture on any failed window observation; do not infer that native/artifact custody settled.
    hasUnknownOwner = true;
    throw cause;
  }
  expect(verified).toEqual(backup.report);
  const captureState = () =>
    withinStore(store.path, (db) => ({
      schema: db.all('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name'),
      tables: db
        .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .map(({ name }) => ({
          name,
          rows: db
            .all<Record<string, unknown>>('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
            .sort((left, right) =>
              JSON.stringify(left) < JSON.stringify(right)
                ? -1
                : JSON.stringify(left) > JSON.stringify(right)
                  ? 1
                  : 0,
            ),
        })),
      foreignKeys: db.get<{ foreign_keys: number }>('PRAGMA foreign_keys'),
    }));
  const before = captureState();
  const { readFileSync } = await import('node:fs');
  const { applyStepCatalogue } = await import('./step-catalogue-apply');
  let refusal: { rejected: false } | { rejected: true; cause: Error } = { rejected: false };
  try {
    applyStepCatalogue({
      window: windowRequest,
      rulesJson: readFileSync(ruleFile, 'utf8'),
      appliedAt: '2026-11-15T12:00:00.000Z',
    });
  } catch (cause: unknown) {
    if (
      !(cause instanceof Error) ||
      !(cause.cause instanceof Error) ||
      !cause.cause.message.includes('catalogue retarget injection')
    ) {
      hasUnknownOwner = true;
      throw cause;
    }
    refusal = { rejected: true, cause };
  }
  expect(refusal.rejected).toBe(true);
  if (!refusal.rejected) throw new Error('Actual retarget injection was not reached');
  expect(refusal.cause.cause).toBeInstanceOf(Error);
  expect(captureState()).toEqual(before);
  const mirrorAfter = withinStore(store.path, (db) =>
    db.get<{ sql: string | null } | undefined>(
      "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='step_measure_mirrors_token_estimate_update'",
    ),
  );
  expect(mirrorAfter).toEqual(mirrorBefore);
  if (mirrorAfter === undefined || typeof mirrorAfter.sql !== 'string')
    throw new Error('Rollback lost actual token mirror SQL');
  expect(hashBytes(mirrorAfter.sql)).toBe(mirrorHash);
  expect(
    withinStore(store.path, (db) =>
      db.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='step_definition'",
      ),
    ),
  ).toBeUndefined();
});

test('applies only the explicitly confirmed uncoded suggestion without rekeying its identity or historical bytes', async () => {
  const store = prepareStore();
  const reportParent = '20261115120000_add_step_migration_report';
  const catalogueName = '20261115130000_add_step_catalogue';
  const parents = readMigrationFolders(FOLDER).filter(({ name }) => name <= reportParent);
  expect(parents).toHaveLength(116);
  expect(parents.at(-1)?.name).toBe(reportParent);
  for (const parent of parents)
    cpSync(join(FOLDER, parent.name), join(store.migrations, parent.name), { recursive: true });
  applyMigrations(store.path, store.migrations);
  expect(
    withinStore(store.path, (db) =>
      db.all<{ name: string; hash: string }>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      ),
    ),
  ).toEqual(parents.map(({ name, hash }) => ({ name, hash })));

  seedReportFactWorld(store.path);
  const { createHash } = await import('node:crypto');
  const { sql } = await import('drizzle-orm');
  const hashBytes = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
  const input =
    '{ "version":1, "stepId":"uncoded-deploy", "estimateUnits":{"uncoded-deploy":"minutes"} }\n';
  const schedule =
    '{ "version":1, "stepId":"uncoded-deploy", "slices":{"leaf-one:uncoded-deploy":{"start":0,"end":1}} }\n';
  const payload = '{ "version":1, "forward":{"kind":"setEstimate","stepId":"uncoded-deploy"} }\n';
  const inverse =
    '{ "kind":"setEstimate", "stepId":"uncoded-deploy", "estimateUnits":{"uncoded-deploy":"minutes"} }\n';
  const preconditions =
    '{ "step:uncoded-deploy":7, "moveProgress":{"uncoded-deploy":"in_progress"} }\n';
  const beforeEvent = '{ "stepId":"uncoded-deploy", "optimistic":1 }\n';
  const afterEvent = '{ "stepId":"uncoded-deploy", "optimistic":2 }\n';
  const replay = '{ "kind":"plan.changed", "workPackageId":"w-one", "stepId":"uncoded-deploy" }\n';
  withinStore(store.path, (db) => {
    db.run(
      "DELETE FROM work_item_work_item_type WHERE work_item_id IN ('leaf-one','unprotected-one')",
    );
    for (const [id, code, name] of [
      ['z-dev', 'dev-one', 'Develop One'],
      ['a-dev', 'dev-two', 'Develop Two'],
      ['z-qa', 'qa-one', 'Test One'],
      ['a-qa', 'qa-two', 'Test Two'],
      ['foreign-dev', 'foreign-dev', 'Foreign Develop'],
    ])
      db.run(sql`UPDATE step SET code=${code},name=${name} WHERE id=${id}`);
    db.run(
      "INSERT INTO step(id,work_package_id,name,code,position,estimate_unit,allowance_bps,allowance_revision,created_at,created_by) VALUES('uncoded-deploy','w-one','Deploy!',NULL,30,'minutes',700,9,4,'catalogue-author')",
    );
    expect(
      db.get<{
        id: string;
        code: string | null;
        estimate_unit: string;
        allowance_bps: number;
        allowance_revision: number;
      }>(
        "SELECT id,code,estimate_unit,allowance_bps,allowance_revision FROM step WHERE id='uncoded-deploy'",
      ),
    ).toEqual({
      id: 'uncoded-deploy',
      code: null,
      estimate_unit: 'minutes',
      allowance_bps: 700,
      allowance_revision: 9,
    });
    for (const fact of REPORT_FACT_CASES) {
      const statement = fact.sql.replaceAll(
        "'fact-link'",
        "'catalogue-" + fact.table + '-' + fact.column + "'",
      );
      db.run(statement);
    }
    for (const fact of REPORT_FACT_CASES)
      expect(
        db.get<{ count: number }>(
          'SELECT COUNT(*) AS count FROM "' + fact.table + '" WHERE "' + fact.column + "\"='z-dev'",
        ),
      ).toEqual({ count: 1 });
    for (const table of REPORT_FACT_TABLES)
      expect(db.get<{ count: number }>('SELECT COUNT(*) AS count FROM "' + table + '"')).toEqual({
        count: table === 'typed_dependency' || table === 'external_dependency' ? 2 : 1,
      });
    db.run(sql`INSERT INTO saved_plan(id,work_package_id,name,created_by,created_by_id,created_at,input_schema_version,input_bytes,input_sha256,schedule_schema_version,schedule_bytes,schedule_sha256,schedule_input_sha256,scheduler_algorithm_id)
      VALUES('catalogue-history','w-one','Unmerged identity source','Catalogue Author','catalogue-author',30,1,${Buffer.byteLength(input)},${hashBytes(input)},1,${Buffer.byteLength(schedule)},${hashBytes(schedule)},${hashBytes(input)},'fixture-scheduler')`);
    db.run(
      "INSERT INTO saved_plan_organization(resource_id,organization_id) VALUES('catalogue-history','org-a')",
    );
    db.run(
      sql`INSERT INTO saved_plan_body(saved_plan_id,kind,bytes) VALUES('catalogue-history','input',${input}),('catalogue-history','schedule',${schedule})`,
    );
    db.run(sql`INSERT INTO command_journal(id,work_package_id,user_id,seq,kind,payload,inverse,preconditions,created_at)
      VALUES('catalogue-journal','w-one','catalogue-author',1,'setEstimate',${payload},${inverse},${preconditions},31)`);
    db.run(sql`INSERT INTO plan_event(id,work_package_id,user_id,kind,label,work_item_id,step_id,before,after,created_at)
      VALUES('catalogue-event','w-one','catalogue-author','setEstimate','Unmerged estimate','leaf-one','uncoded-deploy',${beforeEvent},${afterEvent},32)`);
    db.run(sql`INSERT INTO optimized_schedule_cache(work_package_id,input_hash,objective,contract_version,budget_ms,generation,status,result_json,created_at)
      VALUES('w-one',${hashBytes(input)},'pri','fixture-contract',1000,1,'ok',${schedule},33)`);
    db.run(
      sql`INSERT INTO event_log(subscription,seq,message,created_at) VALUES('work-package:w-one',1,${replay},34)`,
    );
    db.run("INSERT INTO event_sequencer(subscription,next_seq) VALUES('work-package:w-one',2)");
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    expect(db.all('SELECT id FROM step ORDER BY id')).toEqual([
      { id: 'a-dev' },
      { id: 'a-qa' },
      { id: 'foreign-dev' },
      { id: 'uncoded-deploy' },
      { id: 'z-dev' },
      { id: 'z-qa' },
    ]);
    expect(db.all('SELECT kind,bytes FROM saved_plan_body ORDER BY kind')).toEqual([
      { kind: 'input', bytes: input },
      { kind: 'schedule', bytes: schedule },
    ]);
    expect(
      db.get<{
        input_bytes: number;
        input_sha256: string;
        schedule_bytes: number | null;
        schedule_sha256: string | null;
        schedule_input_sha256: string | null;
      }>(
        "SELECT input_bytes,input_sha256,schedule_bytes,schedule_sha256,schedule_input_sha256 FROM saved_plan WHERE id='catalogue-history'",
      ),
    ).toEqual({
      input_bytes: Buffer.byteLength(input),
      input_sha256: hashBytes(input),
      schedule_bytes: Buffer.byteLength(schedule),
      schedule_sha256: hashBytes(schedule),
      schedule_input_sha256: hashBytes(input),
    });
  });
  const reportStepCatalogue = await readReporter();
  const report = withinStore(store.path, (db) => reportStepCatalogue(db, 40));
  expect(report).toEqual({ fingerprint: fingerprintOf(report), rows: [UNCODED_DEPLOY] });
  const rules = {
    version: 1,
    fingerprint: fingerprintOf(report),
    organizations: { 'org-a': { codes: {}, uncoded: { 'uncoded-deploy': { code: 'deploy' } } } },
  };
  const ruleFile = await writeRuleFile(rules);
  const readStepMergeRules = await readRulePreflight();
  expect(withinStore(store.path, (db) => readStepMergeRules(db, ruleFile))).toEqual(rules);

  const additions = readMigrationFolders(FOLDER).filter(({ name }) => name === catalogueName);
  for (const addition of additions)
    cpSync(join(FOLDER, addition.name), join(store.migrations, addition.name), { recursive: true });
  if (directory === undefined) throw new Error('Catalogue migration directory was not acquired');
  const { createWindowBackup, assertWindowBackup } = await import('./window-backup');
  const windowRequest = {
    sourcePath: store.path,
    snapshotPath: join(directory, 'catalogue-window.db'),
    reportPath: join(directory, 'catalogue-window.json'),
    migrationsFolder: store.migrations,
  };
  // This is only an isolated synthetic maintenance fixture. E37 verification does not prove E36 host exclusion.
  let backup: ReturnType<typeof createWindowBackup>;
  let verified: ReturnType<typeof assertWindowBackup>;
  try {
    backup = createWindowBackup(windowRequest);
    verified = assertWindowBackup(windowRequest);
  } catch (cause: unknown) {
    // Retain this fixture on any failed window observation; do not infer that native/artifact custody settled.
    hasUnknownOwner = true;
    throw cause;
  }
  expect(verified).toEqual(backup.report);
  const before = captureNonReportStore(store.path);
  const unchangedTables = new Set(
    before.tables
      .map(({ name }) => name)
      .filter((name) => !['step', '__drizzle_migrations', 'sqlite_sequence'].includes(name)),
  );
  const ledger = withinStore(store.path, (db) =>
    db.all<Record<string, unknown>>('SELECT * FROM __drizzle_migrations ORDER BY name'),
  );
  const sequences = withinStore(store.path, (db) =>
    db.all("SELECT name,seq FROM sqlite_sequence WHERE name<>'__drizzle_migrations' ORDER BY name"),
  );
  const definitions = withinStore(store.path, (db) =>
    db.all(
      "SELECT s.id,wo.organization_id,CASE WHEN s.id='uncoded-deploy' THEN 'deploy' ELSE s.code END AS code,s.name,s.estimate_unit,s.allowance_bps AS default_allowance_bps,s.position,s.created_at,s.created_by,'migration' AS origin,s.work_package_id AS legacy_work_package_id FROM step s JOIN work_package_organization wo ON wo.resource_id=s.work_package_id ORDER BY s.id",
    ),
  );
  const bindings = withinStore(store.path, (db) =>
    db.all(
      "SELECT wo.organization_id,'project' AS scope_kind,w.project_id AS scope_id,s.id AS step_id,NULL AS work_item_type_id,s.position,'migration' AS origin FROM step s JOIN work_package w ON w.id=s.work_package_id JOIN work_package_organization wo ON wo.resource_id=w.id ORDER BY s.id",
    ),
  );
  const packageSteps = withinStore(store.path, (db) =>
    db.all(
      'SELECT work_package_id,id AS step_id,estimate_unit,allowance_bps,allowance_revision FROM step ORDER BY id',
    ),
  );
  const tables = withinStore(store.path, (db) =>
    db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"),
  ).map(({ name }) => name);
  const { readFileSync } = await import('node:fs');
  const { applyStepCatalogue } = await import('./step-catalogue-apply');
  let application:
    | { applied: true; ledger: ReturnType<typeof applyStepCatalogue> }
    | { applied: false; cause: unknown };
  try {
    application = {
      applied: true,
      ledger: applyStepCatalogue({
        window: windowRequest,
        rulesJson: readFileSync(ruleFile, 'utf8'),
        appliedAt: '2026-11-15T12:00:00.000Z',
      }),
    };
  } catch (cause: unknown) {
    if (
      !(cause instanceof Error) ||
      cause.message !== 'step catalogue unresolved apply issue: uncoded'
    ) {
      hasUnknownOwner = true;
      throw cause;
    }
    application = { applied: false, cause };
  }
  // Intended RED: current ruled-merge writer still rejects the actual confirmed uncoded purpose.
  expect(application.applied).toBe(true);
  if (!application.applied)
    throw new Error('Confirmed uncoded persistence is not implemented', {
      cause: application.cause,
    });
  expect(application.ledger).toEqual(
    [...parents, ...additions].map(({ name, hash }) => ({ name, hash })),
  );

  expect(
    withinStore(store.path, (db) =>
      db.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='step_definition'",
      ),
    ),
  ).toEqual({ name: 'step_definition' });

  expect(additions).toHaveLength(1);
  expect(
    withinStore(store.path, (db) =>
      db.all(
        'SELECT id,organization_id,code,name,estimate_unit,default_allowance_bps,position,created_at,created_by,origin,legacy_work_package_id FROM step_definition ORDER BY id',
      ),
    ),
  ).toEqual(definitions);
  expect(
    withinStore(store.path, (db) => db.all('SELECT id FROM step_definition ORDER BY id')),
  ).toEqual([
    { id: 'a-dev' },
    { id: 'a-qa' },
    { id: 'foreign-dev' },
    { id: 'uncoded-deploy' },
    { id: 'z-dev' },
    { id: 'z-qa' },
  ]);
  expect(
    withinStore(store.path, (db) =>
      db.all(
        'SELECT organization_id,scope_kind,scope_id,step_id,work_item_type_id,position,origin FROM step_binding ORDER BY step_id',
      ),
    ),
  ).toEqual(bindings);
  expect(
    withinStore(store.path, (db) =>
      db.all(
        'SELECT work_package_id,step_id,estimate_unit,allowance_bps,allowance_revision FROM work_package_step ORDER BY step_id',
      ),
    ),
  ).toEqual(packageSteps);
  expect(withinStore(store.path, (db) => db.all('SELECT * FROM step_identity_history'))).toEqual(
    [],
  );
  expect(
    withinStore(store.path, (db) =>
      db.get<{
        id: string;
        code: string;
        name: string;
        estimate_unit: string;
        default_allowance_bps: number;
        legacy_work_package_id: string;
      }>(
        "SELECT id,code,name,estimate_unit,default_allowance_bps,legacy_work_package_id FROM step_definition WHERE id='uncoded-deploy'",
      ),
    ),
  ).toEqual({
    id: 'uncoded-deploy',
    code: 'deploy',
    name: 'Deploy!',
    estimate_unit: 'minutes',
    default_allowance_bps: 700,
    legacy_work_package_id: 'w-one',
  });
  expect(
    withinStore(store.path, (db) =>
      db.get<{
        work_package_id: string;
        step_id: string;
        estimate_unit: string;
        allowance_bps: number;
        allowance_revision: number;
      }>(
        "SELECT work_package_id,step_id,estimate_unit,allowance_bps,allowance_revision FROM work_package_step WHERE step_id='uncoded-deploy'",
      ),
    ),
  ).toEqual({
    work_package_id: 'w-one',
    step_id: 'uncoded-deploy',
    estimate_unit: 'minutes',
    allowance_bps: 700,
    allowance_revision: 9,
  });
  const after = captureNonReportStore(store.path);
  expect(after.tables.filter(({ name }) => unchangedTables.has(name))).toEqual(
    before.tables.filter(({ name }) => unchangedTables.has(name)),
  );
  expect(
    withinStore(store.path, (db) =>
      db.all(
        "SELECT name,seq FROM sqlite_sequence WHERE name<>'__drizzle_migrations' ORDER BY name",
      ),
    ),
  ).toEqual(sequences);
  const finalLedger = withinStore(store.path, (db) =>
    db.all<Record<string, unknown>>('SELECT * FROM __drizzle_migrations ORDER BY name'),
  );
  expect(finalLedger).toHaveLength(117);
  expect(finalLedger.slice(0, 116)).toEqual(ledger);
  expect(
    withinStore(store.path, (db) =>
      db.all<{ name: string; hash: string }>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      ),
    ),
  ).toEqual([...parents, ...additions].map(({ name, hash }) => ({ name, hash })));
  expect(
    withinStore(store.path, (db) =>
      db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"),
    ).map(({ name }) => name),
  ).toEqual(
    [
      ...tables.filter((name) => name !== 'step'),
      'step_definition',
      'step_binding',
      'work_package_step',
      'step_identity_history',
    ].sort(),
  );
  withinStore(store.path, (db) => {
    for (const fact of REPORT_FACT_CASES) {
      const target = fact.table === 'external_dependency' ? 'work_package_step' : 'step_definition';
      const column = fact.table === 'external_dependency' ? 'step_id' : 'id';
      expect(
        db
          .all<{ table: string; from: string; to: string }>(
            'PRAGMA foreign_key_list("' + fact.table + '")',
          )
          .filter((row) => row.from === fact.column && row.to === column)
          .map((row) => row.table),
      ).toEqual([target]);
    }
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
});

test('restores original NULL step code and unmerged facts and history through public catalogue rollback', async () => {
  const store = prepareStore();
  const reportParent = '20261115120000_add_step_migration_report';
  const catalogueName = '20261115130000_add_step_catalogue';
  const parents = readMigrationFolders(FOLDER).filter(({ name }) => name <= reportParent);
  expect(parents).toHaveLength(116);
  expect(parents.at(-1)?.name).toBe(reportParent);
  for (const parent of parents)
    cpSync(join(FOLDER, parent.name), join(store.migrations, parent.name), { recursive: true });
  applyMigrations(store.path, store.migrations);
  expect(
    withinStore(store.path, (db) =>
      db.all<{ name: string; hash: string }>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      ),
    ),
  ).toEqual(parents.map(({ name, hash }) => ({ name, hash })));

  seedReportFactWorld(store.path);
  const { createHash } = await import('node:crypto');
  const { sql } = await import('drizzle-orm');
  const hashBytes = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
  const input =
    '{ "version":1, "stepId":"uncoded-deploy", "estimateUnits":{"uncoded-deploy":"minutes"} }\n';
  const schedule =
    '{ "version":1, "stepId":"uncoded-deploy", "slices":{"leaf-one:uncoded-deploy":{"start":0,"end":1}} }\n';
  const payload = '{ "version":1, "forward":{"kind":"setEstimate","stepId":"uncoded-deploy"} }\n';
  const inverse =
    '{ "kind":"setEstimate", "stepId":"uncoded-deploy", "estimateUnits":{"uncoded-deploy":"minutes"} }\n';
  const preconditions =
    '{ "step:uncoded-deploy":7, "moveProgress":{"uncoded-deploy":"in_progress"} }\n';
  const beforeEvent = '{ "stepId":"uncoded-deploy", "optimistic":1 }\n';
  const afterEvent = '{ "stepId":"uncoded-deploy", "optimistic":2 }\n';
  const replay = '{ "kind":"plan.changed", "workPackageId":"w-one", "stepId":"uncoded-deploy" }\n';
  withinStore(store.path, (db) => {
    db.run(
      "DELETE FROM work_item_work_item_type WHERE work_item_id IN ('leaf-one','unprotected-one')",
    );
    for (const [id, code, name] of [
      ['z-dev', 'dev-one', 'Develop One'],
      ['a-dev', 'dev-two', 'Develop Two'],
      ['z-qa', 'qa-one', 'Test One'],
      ['a-qa', 'qa-two', 'Test Two'],
      ['foreign-dev', 'foreign-dev', 'Foreign Develop'],
    ])
      db.run(sql`UPDATE step SET code=${code},name=${name} WHERE id=${id}`);
    db.run(
      "INSERT INTO step(id,work_package_id,name,code,position,estimate_unit,allowance_bps,allowance_revision,created_at,created_by) VALUES('uncoded-deploy','w-one','Deploy!',NULL,30,'minutes',700,9,4,'catalogue-author')",
    );
    expect(
      db.get<{
        id: string;
        code: string | null;
        estimate_unit: string;
        allowance_bps: number;
        allowance_revision: number;
      }>(
        "SELECT id,code,estimate_unit,allowance_bps,allowance_revision FROM step WHERE id='uncoded-deploy'",
      ),
    ).toEqual({
      id: 'uncoded-deploy',
      code: null,
      estimate_unit: 'minutes',
      allowance_bps: 700,
      allowance_revision: 9,
    });
    for (const fact of REPORT_FACT_CASES) {
      const statement = fact.sql.replaceAll(
        "'fact-link'",
        "'catalogue-" + fact.table + '-' + fact.column + "'",
      );
      db.run(statement);
    }
    for (const fact of REPORT_FACT_CASES)
      expect(
        db.get<{ count: number }>(
          'SELECT COUNT(*) AS count FROM "' + fact.table + '" WHERE "' + fact.column + "\"='z-dev'",
        ),
      ).toEqual({ count: 1 });
    for (const table of REPORT_FACT_TABLES)
      expect(db.get<{ count: number }>('SELECT COUNT(*) AS count FROM "' + table + '"')).toEqual({
        count: table === 'typed_dependency' || table === 'external_dependency' ? 2 : 1,
      });
    db.run(sql`INSERT INTO saved_plan(id,work_package_id,name,created_by,created_by_id,created_at,input_schema_version,input_bytes,input_sha256,schedule_schema_version,schedule_bytes,schedule_sha256,schedule_input_sha256,scheduler_algorithm_id)
      VALUES('catalogue-history','w-one','Unmerged identity source','Catalogue Author','catalogue-author',30,1,${Buffer.byteLength(input)},${hashBytes(input)},1,${Buffer.byteLength(schedule)},${hashBytes(schedule)},${hashBytes(input)},'fixture-scheduler')`);
    db.run(
      "INSERT INTO saved_plan_organization(resource_id,organization_id) VALUES('catalogue-history','org-a')",
    );
    db.run(
      sql`INSERT INTO saved_plan_body(saved_plan_id,kind,bytes) VALUES('catalogue-history','input',${input}),('catalogue-history','schedule',${schedule})`,
    );
    db.run(sql`INSERT INTO command_journal(id,work_package_id,user_id,seq,kind,payload,inverse,preconditions,created_at)
      VALUES('catalogue-journal','w-one','catalogue-author',1,'setEstimate',${payload},${inverse},${preconditions},31)`);
    db.run(sql`INSERT INTO plan_event(id,work_package_id,user_id,kind,label,work_item_id,step_id,before,after,created_at)
      VALUES('catalogue-event','w-one','catalogue-author','setEstimate','Unmerged estimate','leaf-one','uncoded-deploy',${beforeEvent},${afterEvent},32)`);
    db.run(sql`INSERT INTO optimized_schedule_cache(work_package_id,input_hash,objective,contract_version,budget_ms,generation,status,result_json,created_at)
      VALUES('w-one',${hashBytes(input)},'pri','fixture-contract',1000,1,'ok',${schedule},33)`);
    db.run(
      sql`INSERT INTO event_log(subscription,seq,message,created_at) VALUES('work-package:w-one',1,${replay},34)`,
    );
    db.run("INSERT INTO event_sequencer(subscription,next_seq) VALUES('work-package:w-one',2)");
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    expect(db.all('SELECT id FROM step ORDER BY id')).toEqual([
      { id: 'a-dev' },
      { id: 'a-qa' },
      { id: 'foreign-dev' },
      { id: 'uncoded-deploy' },
      { id: 'z-dev' },
      { id: 'z-qa' },
    ]);
    expect(db.all('SELECT kind,bytes FROM saved_plan_body ORDER BY kind')).toEqual([
      { kind: 'input', bytes: input },
      { kind: 'schedule', bytes: schedule },
    ]);
    expect(
      db.get<{
        input_bytes: number;
        input_sha256: string;
        schedule_bytes: number | null;
        schedule_sha256: string | null;
        schedule_input_sha256: string | null;
      }>(
        "SELECT input_bytes,input_sha256,schedule_bytes,schedule_sha256,schedule_input_sha256 FROM saved_plan WHERE id='catalogue-history'",
      ),
    ).toEqual({
      input_bytes: Buffer.byteLength(input),
      input_sha256: hashBytes(input),
      schedule_bytes: Buffer.byteLength(schedule),
      schedule_sha256: hashBytes(schedule),
      schedule_input_sha256: hashBytes(input),
    });
  });
  const reportStepCatalogue = await readReporter();
  const report = withinStore(store.path, (db) => reportStepCatalogue(db, 40));
  expect(report).toEqual({ fingerprint: fingerprintOf(report), rows: [UNCODED_DEPLOY] });
  const rules = {
    version: 1,
    fingerprint: fingerprintOf(report),
    organizations: { 'org-a': { codes: {}, uncoded: { 'uncoded-deploy': { code: 'deploy' } } } },
  };
  const ruleFile = await writeRuleFile(rules);
  const readStepMergeRules = await readRulePreflight();
  expect(withinStore(store.path, (db) => readStepMergeRules(db, ruleFile))).toEqual(rules);

  const additions = readMigrationFolders(FOLDER).filter(({ name }) => name === catalogueName);
  expect(additions).toHaveLength(1);
  for (const addition of additions)
    cpSync(join(FOLDER, addition.name), join(store.migrations, addition.name), { recursive: true });
  if (directory === undefined) throw new Error('Catalogue migration directory was not acquired');
  const { createWindowBackup, assertWindowBackup } = await import('./window-backup');
  const windowRequest = {
    sourcePath: store.path,
    snapshotPath: join(directory, 'catalogue-window.db'),
    reportPath: join(directory, 'catalogue-window.json'),
    migrationsFolder: store.migrations,
  };
  // This is only an isolated synthetic maintenance fixture. E37 verification does not prove E36 host exclusion.
  let backup: ReturnType<typeof createWindowBackup>;
  let verified: ReturnType<typeof assertWindowBackup>;
  try {
    backup = createWindowBackup(windowRequest);
    verified = assertWindowBackup(windowRequest);
  } catch (cause: unknown) {
    // Retain this fixture on any failed window observation; do not infer that native/artifact custody settled.
    hasUnknownOwner = true;
    throw cause;
  }
  expect(verified).toEqual(backup.report);
  const beforeRows = withinStore(store.path, (db) =>
    db.all<Record<string, unknown>>('SELECT * FROM step ORDER BY id COLLATE BINARY'),
  );
  expect(
    withinStore(store.path, (db) =>
      db.get<{ id: string; code: string | null }>(
        "SELECT id,code FROM step WHERE id='uncoded-deploy'",
      ),
    ),
  ).toEqual({ id: 'uncoded-deploy', code: null });
  const beforeTables = captureNonReportStore(store.path).tables.filter(
    ({ name }) => !['step', '__drizzle_migrations'].includes(name),
  );
  const beforeLedger = withinStore(store.path, (db) =>
    db.all<Record<string, unknown>>('SELECT * FROM __drizzle_migrations ORDER BY name'),
  );
  const { readFileSync } = await import('node:fs');
  const { applyStepCatalogue } = await import('./step-catalogue-apply');
  const applied = applyStepCatalogue({
    window: windowRequest,
    rulesJson: readFileSync(ruleFile, 'utf8'),
    appliedAt: '2026-11-15T12:00:00.000Z',
  });
  expect(applied).toEqual([...parents, ...additions].map(({ name, hash }) => ({ name, hash })));
  expect(
    withinStore(store.path, (db) =>
      db.get<{ id: string; code: string }>(
        "SELECT id,code FROM step_definition WHERE id='uncoded-deploy'",
      ),
    ),
  ).toEqual({ id: 'uncoded-deploy', code: 'deploy' });
  expect(withinStore(store.path, (db) => db.all('SELECT * FROM step_identity_history'))).toEqual(
    [],
  );
  expect(withinStore(store.path, (db) => db.all('PRAGMA foreign_key_check'))).toEqual([]);
  const { rollbackTo } = await import('./migrate-down');
  let removed: ReturnType<typeof rollbackTo>;
  try {
    removed = rollbackTo(store.path, store.migrations, reportParent);
  } catch (cause: unknown) {
    hasUnknownOwner = true;
    throw cause;
  }
  expect(removed).toEqual([catalogueName]);
  // First intended RED is the represented old code: current down retains deploy rather than original NULL.
  expect(
    withinStore(store.path, (db) =>
      db.get<{ id: string; code: string | null }>(
        "SELECT id,code FROM step WHERE id='uncoded-deploy'",
      ),
    ),
  ).toEqual({ id: 'uncoded-deploy', code: null });
  expect(
    withinStore(store.path, (db) =>
      db.all<Record<string, unknown>>('SELECT * FROM step ORDER BY id COLLATE BINARY'),
    ),
  ).toEqual(beforeRows);
  expect(
    captureNonReportStore(store.path).tables.filter(
      ({ name }) => !['step', '__drizzle_migrations'].includes(name),
    ),
  ).toEqual(beforeTables);
  expect(
    withinStore(store.path, (db) =>
      db.all<Record<string, unknown>>('SELECT * FROM __drizzle_migrations ORDER BY name'),
    ),
  ).toEqual(beforeLedger);
  expect(
    withinStore(store.path, (db) =>
      db.all<{ name: string; hash: string }>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      ),
    ),
  ).toEqual(parents.map(({ name, hash }) => ({ name, hash })));
  expect(
    withinStore(store.path, (db) =>
      db.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='step_definition'",
      ),
    ),
  ).toBeUndefined();
  withinStore(store.path, (db) => {
    for (const fact of REPORT_FACT_CASES)
      expect(
        db
          .all<{ table: string; from: string; to: string }>(
            'PRAGMA foreign_key_list("' + fact.table + '")',
          )
          .filter((row) => row.from === fact.column && row.to === 'id')
          .map((row) => row.table),
      ).toEqual(['step']);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
});

/** Uses the real report/rules/window writer, with a healthy public down/reapply before corruption. */
async function prepareCatalogueProvenanceRefusal() {
  const store = prepareStore();
  const reportParent = '20261115120000_add_step_migration_report';
  const catalogueName = '20261115130000_add_step_catalogue';
  const parents = readMigrationFolders(FOLDER).filter(({ name }) => name <= reportParent);
  expect(parents).toHaveLength(116);
  for (const parent of parents)
    cpSync(join(FOLDER, parent.name), join(store.migrations, parent.name), { recursive: true });
  applyMigrations(store.path, store.migrations);
  withinStore(store.path, (db) => {
    for (const [id, code, name] of [
      ['z-dev', 'dev-one', 'Develop One'],
      ['a-dev', 'dev-two', 'Develop Two'],
      ['z-qa', 'qa-one', 'Test One'],
      ['a-qa', 'qa-two', 'Test Two'],
      ['foreign-dev', 'foreign-dev', 'Foreign Develop'],
    ])
      db.run("UPDATE step SET code='" + code + "',name='" + name + "' WHERE id='" + id + "'");
    expect(
      db.get<{ id: string; code: string }>("SELECT id,code FROM step WHERE id='foreign-dev'"),
    ).toEqual({ id: 'foreign-dev', code: 'foreign-dev' });
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const additions = readMigrationFolders(FOLDER).filter(({ name }) => name === catalogueName);
  expect(additions).toHaveLength(1);
  for (const addition of additions)
    cpSync(join(FOLDER, addition.name), join(store.migrations, addition.name), { recursive: true });
  const reportStepCatalogue = await readReporter();
  const readStepMergeRules = await readRulePreflight();
  const { createWindowBackup, assertWindowBackup } = await import('./window-backup');
  const { readFileSync } = await import('node:fs');
  const { rollbackTo } = await import('./migrate-down');
  let invocation = 0;
  const applyCatalogue = async () => {
    const report = withinStore(store.path, (db) => reportStepCatalogue(db, 50 + invocation));
    expect(readReportRows(report)).toEqual([]);
    const rules = { version: 1, fingerprint: fingerprintOf(report), organizations: {} };
    const ruleFile = await writeRuleFile(rules);
    expect(withinStore(store.path, (db) => readStepMergeRules(db, ruleFile))).toEqual(rules);
    if (directory === undefined)
      throw new Error('Catalogue provenance fixture directory is absent');
    const window = {
      sourcePath: store.path,
      migrationsFolder: store.migrations,
      snapshotPath: join(directory, 'provenance-' + String(invocation) + '.db'),
      reportPath: join(directory, 'provenance-' + String(invocation) + '.json'),
    };
    invocation += 1;
    // Isolated evidence owners only: this is not E36 host or participant authority.
    try {
      const backup = createWindowBackup(window);
      expect(assertWindowBackup(window)).toEqual(backup.report);
    } catch (cause: unknown) {
      hasUnknownOwner = true;
      throw cause;
    }
    await applyOwnedCatalogue({
      window,
      rulesJson: readFileSync(ruleFile, 'utf8'),
      appliedAt: '2026-11-15T12:00:00.000Z',
    });
  };
  await applyCatalogue();
  let removed: ReturnType<typeof rollbackTo>;
  try {
    removed = rollbackTo(store.path, store.migrations, reportParent);
  } catch (cause: unknown) {
    hasUnknownOwner = true;
    throw cause;
  }
  expect(removed).toEqual([catalogueName]);
  expect(
    withinStore(store.path, (db) =>
      db.all<{ name: string; hash: string }>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      ),
    ),
  ).toEqual(parents.map(({ name, hash }) => ({ name, hash })));
  expect(
    withinStore(store.path, (db) =>
      db.get<{ id: string; code: string }>("SELECT id,code FROM step WHERE id='foreign-dev'"),
    ),
  ).toEqual({ id: 'foreign-dev', code: 'foreign-dev' });
  await applyCatalogue();
  expect(
    withinStore(store.path, (db) =>
      db.all<{ name: string; hash: string }>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      ),
    ),
  ).toEqual([...parents, ...additions].map(({ name, hash }) => ({ name, hash })));
  withinStore(store.path, (db) => {
    expect(
      db.get<{ id: string; code: string; legacy_code: string; legacy_code_captured: number }>(
        "SELECT id,code,legacy_code,legacy_code_captured FROM step_definition WHERE id='foreign-dev'",
      ),
    ).toEqual({
      id: 'foreign-dev',
      code: 'foreign-dev',
      legacy_code: 'foreign-dev',
      legacy_code_captured: 1,
    });
    expect(db.all('SELECT * FROM step_identity_history')).toEqual([]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  return { ...store, reportParent, catalogueName };
}

/** All persistent tables include the report, ledger and actual internal sequence rows. */
function captureCatalogueProvenanceState(path: string) {
  return withinStore(path, (db) => ({
    foreignKeys: db.get<{ foreign_keys: number }>('PRAGMA foreign_keys'),
    ignoreChecks: db.get<{ ignore_check_constraints: number }>('PRAGMA ignore_check_constraints'),
    schema: db.all('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name'),
    tables: db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .map(({ name }) => ({
        name,
        rows: db
          .all<Record<string, unknown>>('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
          .sort((left, right) => {
            const a = JSON.stringify(left),
              b = JSON.stringify(right);
            return a < b ? -1 : a > b ? 1 : 0;
          }),
      })),
  }));
}

const catalogueProvenanceCorruptions = [
  {
    title:
      'refuses public catalogue rollback with a cleared raw-code capture marker after CHECK enforcement is restored',
    corrupt(db: Drizzle) {
      expect(
        db.get<{ ignore_check_constraints: number }>('PRAGMA ignore_check_constraints'),
      ).toEqual({ ignore_check_constraints: 0 });
      let primary: { failed: false } | { failed: true; cause: unknown } = { failed: false };
      try {
        db.run('PRAGMA ignore_check_constraints=ON');
        expect(
          db.get<{ ignore_check_constraints: number }>('PRAGMA ignore_check_constraints'),
        ).toEqual({ ignore_check_constraints: 1 });
        db.run("UPDATE step_definition SET legacy_code_captured=0 WHERE id='foreign-dev'");
      } catch (cause: unknown) {
        primary = { failed: true, cause };
      }
      try {
        db.run('PRAGMA ignore_check_constraints=OFF');
      } catch (cause: unknown) {
        hasUnknownOwner = true;
        if (primary.failed)
          throw new AggregateError(
            [primary.cause, cause],
            'Catalogue provenance setup and CHECK restoration failed',
            { cause },
          );
        throw cause;
      }
      if (primary.failed) throw primary.cause;
      expect(
        db.get<{ ignore_check_constraints: number }>('PRAGMA ignore_check_constraints'),
      ).toEqual({ ignore_check_constraints: 0 });
      expect(
        db.get<{ id: string; code: string; legacy_code: string; legacy_code_captured: number }>(
          "SELECT id,code,legacy_code,legacy_code_captured FROM step_definition WHERE id='foreign-dev'",
        ),
      ).toEqual({
        id: 'foreign-dev',
        code: 'foreign-dev',
        legacy_code: 'foreign-dev',
        legacy_code_captured: 0,
      });
    },
  },
  {
    title:
      'refuses public catalogue rollback with non-NULL raw legacy code differing from its immutable catalogue code',
    corrupt(db: Drizzle) {
      expect(
        db.get<{ ignore_check_constraints: number }>('PRAGMA ignore_check_constraints'),
      ).toEqual({ ignore_check_constraints: 0 });
      db.run("UPDATE step_definition SET legacy_code='changed-legacy' WHERE id='foreign-dev'");
      expect(
        db.get<{ id: string; code: string; legacy_code: string; legacy_code_captured: number }>(
          "SELECT id,code,legacy_code,legacy_code_captured FROM step_definition WHERE id='foreign-dev'",
        ),
      ).toEqual({
        id: 'foreign-dev',
        code: 'foreign-dev',
        legacy_code: 'changed-legacy',
        legacy_code_captured: 1,
      });
    },
  },
] as const;

for (const corruption of catalogueProvenanceCorruptions)
  test(corruption.title, async () => {
    const store = await prepareCatalogueProvenanceRefusal();
    withinStore(store.path, (db) => {
      corruption.corrupt(db);
      expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    });
    const before = captureCatalogueProvenanceState(store.path);
    const ledger = withinStore(store.path, (db) =>
      db.all<Record<string, unknown>>('SELECT * FROM __drizzle_migrations ORDER BY name'),
    );
    expect(ledger).toHaveLength(117);
    const { rollbackTo } = await import('./migrate-down');
    let outcome: { rejected: false } | { rejected: true; cause: unknown } = { rejected: false };
    try {
      rollbackTo(store.path, store.migrations, store.reportParent);
    } catch (cause: unknown) {
      outcome = { rejected: true, cause };
    }
    if (
      outcome.rejected &&
      (!(outcome.cause instanceof Error) ||
        !outcome.cause.message.includes(
          "step catalogue rollback requires captured raw legacy code for 'foreign-dev'",
        ))
    ) {
      // The public wrapper's paired operation/close failure is not modeled; retain unexpected outcomes.
      hasUnknownOwner = true;
      throw new Error('Unexpected public provenance rollback failure; fixture retained', {
        cause: outcome.cause,
      });
    }
    expect(outcome.rejected).toBe(true);
    if (!outcome.rejected)
      throw new Error('Public catalogue rollback accepted incoherent raw-code provenance');
    expect(outcome.cause).toBeInstanceOf(Error);
    if (!(outcome.cause instanceof Error))
      throw new Error('Provenance refusal is not an Error', { cause: outcome.cause });
    expect(outcome.cause.message).toContain('rolling back ' + store.catalogueName + ' failed:');
    expect(outcome.cause.message).toContain(
      "step catalogue rollback requires captured raw legacy code for 'foreign-dev'",
    );
    expect(captureCatalogueProvenanceState(store.path)).toEqual(before);
    expect(
      withinStore(store.path, (db) =>
        db.all<Record<string, unknown>>('SELECT * FROM __drizzle_migrations ORDER BY name'),
      ),
    ).toEqual(ledger);
  });

test('compares valid loser and survivor saved snapshots through the real admitted reader after a catalogue merge without rewriting their bytes', async () => {
  const store = prepareStore();
  const reportParent = '20261115120000_add_step_migration_report';
  const catalogueName = '20261115130000_add_step_catalogue';
  const parents = readMigrationFolders(FOLDER).filter(({ name }) => name <= reportParent);
  expect(parents).toHaveLength(116);
  for (const parent of parents)
    cpSync(join(FOLDER, parent.name), join(store.migrations, parent.name), { recursive: true });
  applyMigrations(store.path, store.migrations);
  const { createHash } = await import('node:crypto');
  const { sql } = await import('drizzle-orm');
  const hashBytes = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
  const inputFor = (stepId: string) =>
    domain.canonicalisePlanInputV12(
      {
        workPackage: {
          id: 'w-one',
          projectId: 'p-one',
          name: 'One',
          restricted: false,
          solutionSlug: null,
          solutionUrl: null,
          estimateMethod: 'realistic',
          depReach: 'whole-item',
          estimateRounding: 'exact',
          startDate: null,
          pertWeightOptimistic: 1,
          pertWeightRealistic: 4,
          pertWeightPessimistic: 1,
          timezone: 'UTC',
          budgetFactor: 1,
        },
        workItems: [
          {
            id: 'leaf-one',
            parentId: null,
            position: 10,
            name: 'Leaf One',
            notes: '',
            typeIds: [],
            tagIds: [],
            externalRefs: [],
            priority: null,
            maxParallel: 1,
            frozenNumber: null,
            serviceTeamId: null,
            serviceId: null,
            startNoEarlierThan: null,
            startNoEarlierThanReason: null,
            readiness: null,
            hold: null,
          },
        ],
        steps: [
          {
            id: stepId,
            code: 'dev',
            name: 'Develop',
            position: 10,
            estimateUnit: 'workdays',
            allowancePercent: 5,
          },
        ],
        stepValues: [
          {
            workItemId: 'leaf-one',
            stepId,
            optimistic: 1,
            realistic: 2,
            pessimistic: 3,
            derived: 2,
            actual: null,
            progress: 'in_progress',
          },
        ],
        stepBlockages: [],
        stepParallels: [],
        measures: [],
        measureEstimates: [],
        budgets: [],
        dependencies: [],
        typedDependencies: [],
        assignments: [],
        people: [],
        teams: [],
        services: [],
        personTeams: [],
        teamServices: [],
        workItemTeams: [],
        workItemServices: [],
        priorityBands: [],
        capacity: [],
        tags: [],
        workItemTypes: [],
        externalSystems: [],
      },
      { kind: 'local' },
    );
  const timing = {
    duration: 2,
    estimated: true,
    earliestStart: 0,
    earliestFinish: 2,
    latestStart: 0,
    latestFinish: 2,
    float: 0,
    critical: true,
    startsOn: null,
    endsOn: null,
  };
  const scheduleFor = (stepId: string): ReturnType<typeof domain.readSavedPlainScheduleBody> => ({
    version: 3,
    algorithmId: domain.SCHEDULE_ALGORITHM_ID,
    workItems: { 'leaf-one': timing },
    slices: {
      [domain.sliceKey('leaf-one', stepId)]: {
        ...timing,
        workItemId: 'leaf-one',
        stepId,
        personId: null,
        resourcePredecessorId: null,
        capacityPredecessorIds: [],
        capacityTeamId: null,
        width: 1,
        effort: 2,
        boundBy: 'workPackageStart',
      },
    },
    waitingForPerson: 0,
    waitingForCapacity: 0,
  });
  const loserInput = JSON.stringify(inputFor('z-dev'));
  const survivorInput = JSON.stringify(inputFor('a-dev'));
  const loserSchedule = JSON.stringify(scheduleFor('z-dev'));
  const survivorSchedule = JSON.stringify(scheduleFor('a-dev'));
  const tamperedInput = loserInput + ' ';
  expect(loserInput).not.toBe(survivorInput);
  expect(loserSchedule).not.toBe(survivorSchedule);
  expect(domain.readSavedPlanInput(JSON.parse(loserInput), 12)).toEqual(inputFor('z-dev'));
  expect(domain.readSavedPlanInput(JSON.parse(survivorInput), 12)).toEqual(inputFor('a-dev'));
  expect(domain.readSavedPlainScheduleBody(JSON.parse(loserSchedule), 3)).toEqual(
    scheduleFor('z-dev'),
  );
  expect(domain.readSavedPlainScheduleBody(JSON.parse(survivorSchedule), 3)).toEqual(
    scheduleFor('a-dev'),
  );
  const seedSnapshot = (id: string, input: string, schedule: string, storedInput = input) => {
    withinStore(store.path, (db) => {
      db.run(sql`INSERT INTO saved_plan(id,work_package_id,name,created_by,created_by_id,created_at,input_schema_version,input_bytes,input_sha256,schedule_schema_version,schedule_bytes,schedule_sha256,schedule_input_sha256,scheduler_algorithm_id)
      VALUES(${id},'w-one',${id},'Catalogue Author','catalogue-author',60,12,${Buffer.byteLength(input)},${hashBytes(input)},3,${Buffer.byteLength(schedule)},${hashBytes(schedule)},${hashBytes(input)},${domain.SCHEDULE_ALGORITHM_ID})`);
      db.run(
        sql`INSERT INTO saved_plan_organization(resource_id,organization_id) VALUES(${id},'org-a')`,
      );
      db.run(
        sql`INSERT INTO saved_plan_body(saved_plan_id,kind,bytes) VALUES(${id},'input',${storedInput}),(${id},'schedule',${schedule})`,
      );
    });
  };
  const captureSaved = () =>
    withinStore(store.path, (db) => ({
      headers: db.all(
        "SELECT * FROM saved_plan WHERE id IN ('sc13-loser','sc13-survivor','sc13-tampered') ORDER BY id",
      ),
      bodies: db.all(
        "SELECT * FROM saved_plan_body WHERE saved_plan_id IN ('sc13-loser','sc13-survivor','sc13-tampered') ORDER BY saved_plan_id,kind",
      ),
    }));
  seedSnapshot('sc13-loser', loserInput, loserSchedule);
  seedSnapshot('sc13-tampered', loserInput, loserSchedule, tamperedInput);
  const savedBeforeMigration = captureSaved();
  withinStore(store.path, (db) => {
    // Equal QA metadata keeps both actual code groups automatically mergeable.
    db.run("UPDATE step SET allowance_bps=100 WHERE id='a-qa'");
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const reportStepCatalogue = await readReporter();
  const report = withinStore(store.path, (db) => reportStepCatalogue(db, 61));
  expect(readReportRows(report)).toEqual([
    IDENTICAL,
    {
      kind: 'shared_code_identical',
      organizationId: 'org-a',
      code: 'qa',
      survivorStepId: 'z-qa',
      stepIds: ['a-qa', 'z-qa'],
    },
  ]);
  const rules = { version: 1, fingerprint: fingerprintOf(report), organizations: {} };
  const ruleFile = await writeRuleFile(rules);
  const preflight = await readRulePreflight();
  expect(withinStore(store.path, (db) => preflight(db, ruleFile))).toEqual(rules);
  const additions = readMigrationFolders(FOLDER).filter(({ name }) => name === catalogueName);
  expect(additions).toHaveLength(1);
  for (const addition of additions)
    cpSync(join(FOLDER, addition.name), join(store.migrations, addition.name), { recursive: true });
  if (directory === undefined) throw new Error('SC13 fixture directory is absent');
  const { createWindowBackup, assertWindowBackup } = await import('./window-backup');
  const window = {
    sourcePath: store.path,
    migrationsFolder: store.migrations,
    snapshotPath: join(directory, 'sc13-backup.db'),
    reportPath: join(directory, 'sc13-backup.json'),
  };
  // This is exclusively fixture-owned persistence; E37 evidence is not an E36 host permit.
  try {
    const backup = createWindowBackup(window);
    expect(assertWindowBackup(window)).toEqual(backup.report);
  } catch (cause: unknown) {
    hasUnknownOwner = true;
    throw cause;
  }
  const { readFileSync } = await import('node:fs');
  await applyOwnedCatalogue({
    window,
    rulesJson: readFileSync(ruleFile, 'utf8'),
    appliedAt: '2026-11-15T12:00:00.000Z',
  });
  expect(captureSaved()).toEqual(savedBeforeMigration);
  withinStore(store.path, (db) => {
    expect(
      db.all('SELECT old_step_id,step_id FROM step_identity_history ORDER BY old_step_id'),
    ).toEqual([
      { old_step_id: 'a-qa', step_id: 'z-qa' },
      { old_step_id: 'z-dev', step_id: 'a-dev' },
    ]);
    expect(
      db.get<{ work_package_id: string; step_id: string }>(
        "SELECT work_package_id,step_id FROM work_package_step WHERE work_package_id='w-one' AND step_id='a-dev'",
      ),
    ).toEqual({ work_package_id: 'w-one', step_id: 'a-dev' });
    expect(db.all("SELECT id FROM step_definition WHERE id='z-dev'")).toEqual([]);
  });
  // The survivor snapshot is born after the real merge gives that ID to this same package.
  seedSnapshot('sc13-survivor', survivorInput, survivorSchedule);
  withinStore(store.path, (db) => {
    db.run(
      "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','catalogue-author','member',1)",
    );
    db.run(
      "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('sc13-viewer','org-a','organization','org-a','user','catalogue-author','org-viewer','route',1)",
    );
    db.run("UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1");
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const { SqliteWorkPackageObservation } = await import('./work-package-observation');
  const { refusingSavedCurrentCapture } = await import('./saved-current-capture');
  const { openReadOnlyConnection } = await import('./db');
  const observation = new SqliteWorkPackageObservation({
    openConnection: () => openReadOnlyConnection(store.path),
    now: () => 100,
    // Explicit external session selection; membership and package.read remain real SQL decisions.
    activeOrganizationOf: () => (principal) =>
      Promise.resolve(principal.id === 'catalogue-author' ? 'org-a' : null),
    currentCapture: refusingSavedCurrentCapture,
  });
  const caller: Parameters<typeof observation.readSaved>[0] = {
    kind: 'human',
    principal: {
      id: 'catalogue-author',
      username: 'Catalogue Author',
      scopes: ['read'],
      authentication: { kind: 'first_party', issuedAt: 1 },
    },
    expectedAccess: {
      kind: 'scoped',
      principal: { id: 'catalogue-author' },
      scope: { organizationId: 'org-a', userId: 'catalogue-author', cap: null },
    },
  };
  const storedOf = async (savedPlanId: string) => {
    let observed: Awaited<ReturnType<typeof observation.readSaved>>;
    try {
      observed = await observation.readSaved(caller, {
        kind: 'comparison',
        workPackageId: 'w-one',
        savedPlanId,
      });
    } catch (cause: unknown) {
      if (isSqliteCleanupUnknown(cause)) hasUnknownOwner = true;
      throw cause;
    }
    expect(observed.ok).toBe(true);
    if (!observed.ok) throw new Error('SC13 saved reader refused its actual viewer');
    expect(observed.value.kind).toBe('stored');
    if (observed.value.kind !== 'stored') throw new Error('SC13 saved side is absent');
    return observed.value.stored;
  };
  const { SavedPlanRepository } = await import('./saved-plan');
  let digests = 0;
  const digest: ConstructorParameters<typeof SavedPlanResource>[0]['digest'] = {
    sha256: (bytes) => {
      digests += 1;
      return Promise.resolve(hashBytes(bytes));
    },
  };
  const plans = new SavedPlanService({
    digest,
    newId: () => {
      throw new Error('SC13 read generated an ID');
    },
    now: () => {
      throw new Error('SC13 read consulted a clock');
    },
    scheduler: {
      supports: () => {
        throw new Error('SC13 read consulted scheduling');
      },
      readResolvedFast: () => {
        throw new Error('SC13 read scheduled Fast');
      },
      read: () => {
        throw new Error('SC13 read scheduled');
      },
    },
    resource: new SavedPlanResource({
      digest,
      capture: {
        readPlanInput: () => Promise.reject(new Error('SC13 read captured current input')),
      },
      plans: new SavedPlanRepository({ openConnection: () => openConnection(store.path) }),
    }),
  });
  const beforeRead = captureSaved();
  const ledger = withinStore(store.path, (db) =>
    db.all<Record<string, unknown>>('SELECT * FROM __drizzle_migrations ORDER BY name'),
  );
  expect(ledger).toHaveLength(117);
  const tampered = await storedOf('sc13-tampered');
  expect(tampered.bodies.input).toBe(tamperedInput);
  expect(await plans.readStoredSide(tampered)).toEqual({
    outcome: 'corrupt',
    savedPlanId: 'sc13-tampered',
    refusal: {
      reason: 'body_hash_mismatch',
      savedPlanId: 'sc13-tampered',
      body: 'input',
      stored: hashBytes(loserInput),
      recomputed: hashBytes(tamperedInput),
    },
  });
  const loser = await storedOf('sc13-loser');
  const survivor = await storedOf('sc13-survivor');
  expect(loser.bodies).toEqual({ input: loserInput, schedule: loserSchedule });
  expect(survivor.bodies).toEqual({ input: survivorInput, schedule: survivorSchedule });
  const left = await plans.readStoredSide(loser);
  const right = await plans.readStoredSide(survivor);
  expect(left.outcome).toBe('side');
  expect(right.outcome).toBe('side');
  if (left.outcome !== 'side' || right.outcome !== 'side')
    throw new Error('SC13 intact saved side failed verification');
  const compared = plans.compareSides(
    { kind: 'saved', savedPlanId: 'sc13-loser' },
    left.side,
    { kind: 'saved', savedPlanId: 'sc13-survivor' },
    right.side,
  );
  expect(captureSaved()).toEqual(beforeRead);
  expect(
    withinStore(store.path, (db) =>
      db.all<Record<string, unknown>>('SELECT * FROM __drizzle_migrations ORDER BY name'),
    ),
  ).toEqual(ledger);
  // First intended feature RED: real semantic comparison still reports the historical identity rename.
  expect(compared.diff).toEqual({ input: [], schedule: [] });
  const beforeDetail = digests;
  expect(await plans.readStoredPlan(loser)).toEqual({
    outcome: 'read',
    plan: {
      id: 'sc13-loser',
      workPackageId: 'w-one',
      name: 'sc13-loser',
      createdBy: 'Catalogue Author',
      createdAt: 60,
      input: { schemaVersion: 12, bytes: loserInput, sha256: hashBytes(loserInput) },
      schedule: {
        present: true,
        body: { schemaVersion: 3, bytes: loserSchedule, sha256: hashBytes(loserSchedule) },
        inputSha256: hashBytes(loserInput),
        algorithmId: domain.SCHEDULE_ALGORITHM_ID,
      },
    },
  });
  expect(digests - beforeDetail).toBe(2);
  const beforeLegacy = digests;
  const legacy = await plans.compare(
    'w-one',
    { kind: 'saved', savedPlanId: 'sc13-loser' },
    { kind: 'saved', savedPlanId: 'sc13-survivor' },
  );
  expect(legacy.outcome).toBe('compared');
  if (legacy.outcome !== 'compared')
    throw new Error('SC13 legacy saved comparison failed verification');
  expect(legacy.diff).toEqual({ input: [], schedule: [] });
  expect(digests - beforeLegacy).toBe(4);
  expect(captureSaved()).toEqual(beforeRead);
  expect(
    withinStore(store.path, (db) =>
      db.all<Record<string, unknown>>('SELECT * FROM __drizzle_migrations ORDER BY name'),
    ),
  ).toEqual(ledger);
});

/** A real unmerged117 store with one intact saved input and actual scoped read authority. */
async function prepareScopedCatalogueHistoryReader() {
  const store = await prepareCatalogueProvenanceRefusal();
  const { readFileSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const { sql } = await import('drizzle-orm');
  const raw: unknown = JSON.parse(
    readFileSync(
      new URL(
        '../../../domain/domain/src/saved-plan/fixtures/constructed-input11-local.txt',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const decoded = domain.readSavedPlanInput(raw, 11);
  if (decoded.schemaVersion !== 11)
    throw new Error('Historical11 fixture changed its recorded generation');
  const input = JSON.stringify({
    ...decoded,
    workPackage: { ...decoded.workPackage, id: 'w-one' },
  });
  expect(domain.readSavedPlanInput(JSON.parse(input), 11).workPackage.id).toBe('w-one');
  const sha256 = createHash('sha256').update(input).digest('hex');
  withinStore(store.path, (db) => {
    db.run(sql`INSERT INTO saved_plan(id,work_package_id,name,created_by,created_by_id,created_at,input_schema_version,input_bytes,input_sha256,schedule_absent_reason)
      VALUES('sc13-history','w-one','Historical input','Catalogue Author','catalogue-author',70,11,${Buffer.byteLength(input)},${sha256},'pending')`);
    db.run(
      sql`INSERT INTO saved_plan_body(saved_plan_id,kind,bytes) VALUES('sc13-history','input',${input})`,
    );
    db.run(
      "INSERT INTO saved_plan_organization(resource_id,organization_id) VALUES('sc13-history','org-a')",
    );
    db.run(
      "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','catalogue-author','member',1)",
    );
    db.run(
      "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('sc13-history-viewer','org-a','organization','org-a','user','catalogue-author','org-viewer','route',1)",
    );
    db.run("UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1");
    expect(db.all('SELECT * FROM step_identity_history')).toEqual([]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const { SqliteWorkPackageObservation } = await import('./work-package-observation');
  const { refusingSavedCurrentCapture } = await import('./saved-current-capture');
  const { openReadOnlyConnection } = await import('./db');
  const observation = new SqliteWorkPackageObservation({
    openConnection: () => openReadOnlyConnection(store.path),
    now: () => 100,
    activeOrganizationOf: () => (principal) =>
      Promise.resolve(principal.id === 'catalogue-author' ? 'org-a' : null),
    currentCapture: refusingSavedCurrentCapture,
  });
  const caller: Parameters<typeof observation.readSaved>[0] = {
    kind: 'human',
    principal: {
      id: 'catalogue-author',
      username: 'Catalogue Author',
      scopes: ['read'],
      authentication: { kind: 'first_party', issuedAt: 1 },
    },
    expectedAccess: {
      kind: 'scoped',
      principal: { id: 'catalogue-author' },
      scope: { organizationId: 'org-a', userId: 'catalogue-author', cap: null },
    },
  };
  const read = async () => {
    try {
      return await observation.readSaved(caller, {
        kind: 'comparison',
        workPackageId: 'w-one',
        savedPlanId: 'sc13-history',
      });
    } catch (cause: unknown) {
      if (isSqliteCleanupUnknown(cause)) hasUnknownOwner = true;
      throw cause;
    }
  };
  const healthy = await read();
  expect(healthy.ok).toBe(true);
  if (!healthy.ok) throw new Error('SC13 historical reader lost its actual viewer');
  expect(healthy.value.kind).toBe('stored');
  if (healthy.value.kind !== 'stored')
    throw new Error('SC13 historical reader lost its saved record');
  expect(healthy.value.stored.bodies).toEqual({ input, schedule: null });
  expect(healthy.value.stored.header.inputSha256).toBe(sha256);
  expect(healthy.value.stored.header.inputBytes).toBe(Buffer.byteLength(input));
  expect(healthy.value.stored.stepIdentity).toEqual({ kind: 'catalogue', aliases: [] });
  const captureRaw = () =>
    withinStore(store.path, (db) => ({
      header: db.all("SELECT * FROM saved_plan WHERE id='sc13-history'"),
      bodies: db.all(
        "SELECT * FROM saved_plan_body WHERE saved_plan_id='sc13-history' ORDER BY kind",
      ),
      ledger: db.all<Record<string, unknown>>('SELECT * FROM __drizzle_migrations ORDER BY name'),
    }));
  return { ...store, read, captureRaw };
}

const catalogueHistoryCorruptions = [
  {
    title:
      'refuses an admitted saved read when recorded catalogue117 has lost its required history table',
    diagnostic: 'saved step identity schema disagrees with its catalogue ledger',
    corrupt(db: Drizzle) {
      expect(
        db.all(
          "SELECT name FROM __drizzle_migrations WHERE name='20261115130000_add_step_catalogue'",
        ),
      ).toEqual([{ name: '20261115130000_add_step_catalogue' }]);
      db.run('DROP TABLE step_identity_history');
      expect(
        db.get<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='step_identity_history'",
        ),
      ).toBeUndefined();
      expect(
        db.get<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='step_definition'",
        ),
      ).toEqual({ name: 'step_definition' });
      expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    },
  },
  {
    title:
      'refuses an admitted saved read for a wholly unattributable orphan alias after foreign keys are restored',
    diagnostic: 'saved step identity history is inconsistent',
    corrupt(db: Drizzle) {
      let primary: { failed: false } | { failed: true; cause: unknown } = { failed: false };
      try {
        db.run('PRAGMA foreign_keys=OFF');
        expect(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')).toEqual({
          foreign_keys: 0,
        });
        db.run(
          "INSERT INTO step_identity_history(old_step_id,step_id,merged_at) VALUES('unattributable-old','absent-terminal',1763208000)",
        );
      } catch (cause: unknown) {
        primary = { failed: true, cause };
      }
      try {
        db.run('PRAGMA foreign_keys=ON');
      } catch (cause: unknown) {
        hasUnknownOwner = true;
        if (primary.failed)
          throw new AggregateError(
            [primary.cause, cause],
            'SC13 orphan setup and FK restoration failed',
            { cause },
          );
        throw cause;
      }
      if (primary.failed) throw primary.cause;
      expect(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
      expect(db.all('SELECT old_step_id,step_id FROM step_identity_history')).toEqual([
        { old_step_id: 'unattributable-old', step_id: 'absent-terminal' },
      ]);
      expect(
        db.all(
          "SELECT id FROM step_definition WHERE id IN ('unattributable-old','absent-terminal')",
        ),
      ).toEqual([]);
      expect(
        db.all("SELECT work_package_id FROM work_package_step WHERE step_id='absent-terminal'"),
      ).toEqual([]);
      expect(
        db
          .all<{ table: string; parent: string }>('PRAGMA foreign_key_check')
          .map(({ table, parent }) => ({ table, parent })),
      ).toEqual([{ table: 'step_identity_history', parent: 'step_definition' }]);
    },
  },
] as const;
for (const corruption of catalogueHistoryCorruptions)
  test(corruption.title, async () => {
    const fixture = await prepareScopedCatalogueHistoryReader();
    const raw = fixture.captureRaw();
    expect(raw.ledger).toHaveLength(117);
    withinStore(fixture.path, (db) => {
      corruption.corrupt(db);
    });
    expect(fixture.captureRaw()).toEqual(raw);
    const before = captureCatalogueProvenanceState(fixture.path);
    let outcome: { rejected: false } | { rejected: true; cause: unknown } = { rejected: false };
    try {
      await fixture.read();
    } catch (cause: unknown) {
      outcome = { rejected: true, cause };
    }
    if (
      outcome.rejected &&
      (!(outcome.cause instanceof Error) || outcome.cause.message !== corruption.diagnostic)
    ) {
      hasUnknownOwner = true;
      throw new Error('Unexpected SC13 history read failure; fixture retained', {
        cause: outcome.cause,
      });
    }
    expect(outcome.rejected).toBe(true);
    if (!outcome.rejected)
      throw new Error('Admitted saved read concealed missing trusted history as no aliases');
    expect(outcome.cause).toBeInstanceOf(Error);
    if (!(outcome.cause instanceof Error))
      throw new Error('SC13 history refusal is not an Error', { cause: outcome.cause });
    expect(outcome.cause.message).toBe(corruption.diagnostic);
    expect(fixture.captureRaw()).toEqual(raw);
    expect(captureCatalogueProvenanceState(fixture.path)).toEqual(before);
  });

test('refuses an admitted saved read when only the applied catalogue117 timestamp differs from its folder identity', async () => {
  const fixture = await prepareScopedCatalogueHistoryReader();
  const raw = fixture.captureRaw();
  const applied = raw.ledger.find((row) => row['name'] === '20261115130000_add_step_catalogue');
  if (applied === undefined || typeof applied['created_at'] !== 'number')
    throw new Error('SC13 applied catalogue identity is absent');
  const originalStamp = applied['created_at'];
  expect(Number.isSafeInteger(originalStamp)).toBe(true);
  const { sql } = await import('drizzle-orm');
  withinStore(fixture.path, (db) =>
    db.run(
      sql`UPDATE __drizzle_migrations SET created_at=${originalStamp + 1} WHERE name='20261115130000_add_step_catalogue'`,
    ),
  );
  const corrupted = {
    ...raw,
    ledger: raw.ledger.map((row) =>
      row['name'] === '20261115130000_add_step_catalogue'
        ? { ...row, created_at: originalStamp + 1 }
        : row,
    ),
  };
  expect(fixture.captureRaw()).toEqual(corrupted);
  const before = captureCatalogueProvenanceState(fixture.path);
  let outcome: { rejected: false } | { rejected: true; cause: unknown } = { rejected: false };
  try {
    await fixture.read();
  } catch (cause: unknown) {
    outcome = { rejected: true, cause };
  }
  const diagnostic = 'saved step identity schema disagrees with its catalogue ledger';
  if (
    outcome.rejected &&
    (!(outcome.cause instanceof Error) || outcome.cause.message !== diagnostic)
  ) {
    hasUnknownOwner = true;
    throw new Error('Unexpected SC13 catalogue timestamp refusal; fixture retained', {
      cause: outcome.cause,
    });
  }
  expect(outcome.rejected).toBe(true);
  if (!outcome.rejected)
    throw new Error('Admitted saved read accepted the wrong catalogue timestamp');
  expect(outcome.cause).toBeInstanceOf(Error);
  if (!(outcome.cause instanceof Error))
    throw new Error('SC13 timestamp refusal is not an Error', { cause: outcome.cause });
  expect(outcome.cause.message).toBe(diagnostic);
  expect(fixture.captureRaw()).toEqual(corrupted);
  expect(captureCatalogueProvenanceState(fixture.path)).toEqual(before);
});

test('resolves merged step identities only in connected saved comparison meaning while retaining original ready-stage evidence', async () => {
  const store = prepareStore();
  const reportParent = '20261115120000_add_step_migration_report';
  const catalogueName = '20261115130000_add_step_catalogue';
  const parents = readMigrationFolders(FOLDER).filter(({ name }) => name <= reportParent);
  expect(parents).toHaveLength(116);
  for (const parent of parents)
    cpSync(join(FOLDER, parent.name), join(store.migrations, parent.name), { recursive: true });
  applyMigrations(store.path, store.migrations);
  withinStore(store.path, (db) => {
    db.run("DELETE FROM step WHERE id IN ('z-qa','a-qa')");
    db.run("UPDATE step SET allowance_bps=0 WHERE id IN ('z-dev','a-dev')");
    db.run(
      "UPDATE work_package SET start_date='2026-10-05',estimate_method='realistic',estimate_rounding='exact',schedule_engine='optimized',schedule_objective='time',optimization_enabled=1 WHERE id IN ('w-one','w-two')",
    );
    seedReportFactAdmission(db);
    db.run(
      "INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,successor_step_id,type,created_at) VALUES('sc13-connected-edge','org-a','w-one','w-two','leaf-one','node','z-dev','leaf-two','node','a-dev','FS',1)",
    );
    expect(db.all('SELECT id,work_package_id,code,allowance_bps FROM step ORDER BY id')).toEqual([
      { id: 'a-dev', work_package_id: 'w-two', code: 'dev', allowance_bps: 0 },
      { id: 'foreign-dev', work_package_id: 'w-foreign', code: 'dev', allowance_bps: 900 },
      { id: 'z-dev', work_package_id: 'w-one', code: 'dev', allowance_bps: 0 },
    ]);
    expect(
      db.all(
        "SELECT id,project_id,start_date,estimate_method,estimate_rounding,schedule_engine,schedule_objective,optimization_enabled FROM work_package WHERE id IN ('w-one','w-two') ORDER BY id",
      ),
    ).toEqual([
      {
        id: 'w-one',
        project_id: 'p-one',
        start_date: '2026-10-05',
        estimate_method: 'realistic',
        estimate_rounding: 'exact',
        schedule_engine: 'optimized',
        schedule_objective: 'time',
        optimization_enabled: 1,
      },
      {
        id: 'w-two',
        project_id: 'p-two',
        start_date: '2026-10-05',
        estimate_method: 'realistic',
        estimate_rounding: 'exact',
        schedule_engine: 'optimized',
        schedule_objective: 'time',
        optimization_enabled: 1,
      },
    ]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const { createHash } = await import('node:crypto');
  const { sql } = await import('drizzle-orm');
  const { captureConnectedQuestion } = await import('./connected-question-identity');
  const hashBytes = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
  const readsFor = (
    workPackageId: string,
    projectId: string,
    workItemId: string,
    name: string,
    stepId: string,
    optimistic: number,
    realistic: number,
    pessimistic: number,
  ) => {
    const initial = connectedReads(workPackageId, '2026-10-05');
    return {
      ...initial,
      workPackage: {
        ...initial.workPackage,
        name,
        projectId,
        scheduleEngine: 'optimized' as const,
        scheduleObjective: 'time' as const,
        optimizationEnabled: true,
      },
      steps: [
        {
          id: stepId,
          name: 'Develop',
          code: 'dev',
          position: 10,
          allowancePercent: 0,
          estimateUnit: 'workdays' as const,
        },
      ],
      workItems: initial.workItems.map((row) => ({
        ...row,
        id: workItemId,
        name: workPackageId === 'w-one' ? 'Leaf One' : 'Leaf Two',
        position: 10,
        revision: 0,
      })),
      estimates: [{ workItemId, stepId, optimistic, realistic, pessimistic }],
    };
  };
  const buildPacket = (targetStepId: string, budgetMs: number) => {
    const a = readsFor('w-one', 'p-one', 'leaf-one', 'One', targetStepId, 1, 2, 3);
    const b = readsFor('w-two', 'p-two', 'leaf-two', 'Two', 'a-dev', 4, 5, 6);
    const capture = assembleConnectedCapture(
      'org-a',
      [
        { workPackageId: 'w-one', abbreviation: 'One', rank: 0, reads: a },
        { workPackageId: 'w-two', abbreviation: 'Two', rank: 1, reads: b },
      ],
      [
        {
          id: 'sc13-connected-edge',
          workPackageId: 'w-two',
          predecessor: {
            workPackageId: 'w-one',
            scope: 'node',
            workItemId: 'leaf-one',
            stepId: targetStepId,
          },
          successor: {
            workPackageId: 'w-two',
            scope: 'node',
            workItemId: 'leaf-two',
            stepId: 'a-dev',
          },
          type: 'FS',
        },
      ],
    );
    const optimizer: Parameters<typeof connectedRead>[3] = {
      readConnectedCaptured: ({ stage }) => {
        const question = captureConnectedQuestion(stage, 'time', {
          solverVersion: '0.4.0',
          budgetMs,
        });
        const order = stage.input.order;
        if (order.kind !== 'connected')
          throw new Error('Connected packet lost its actual ownership order');
        const starts = new Map<string, number>();
        for (const slice of stage.input.slices) {
          if (order.workPackageIdByWorkItem.get(slice.workItemId) !== stage.workPackageId) continue;
          const key = domain.sliceKey(slice.workItemId, slice.stepId),
            start = stage.starts.get(key);
          if (start === undefined)
            throw new Error('Connected ready fixture has no own baseline start');
          starts.set(key, start);
        }
        return {
          inputHash: question.inputHash,
          generation: 7,
          contractVersion: question.contractVersion,
          budgetMs: question.budgetMs,
          quantum: question.quantum,
          wireVersion: question.wireVersion,
          variants: { pri: { state: 'idle' }, time: { state: 'ready', proof: 'proven' } },
          candidates: { pri: null, time: { question, starts } },
        };
      },
    };
    const captured = connectedRead(
      capture,
      { supports: () => true },
      domain.scheduleResolved,
      optimizer,
    );
    const prepared = captureConnectedHistory(captured, 'w-one');
    if (!prepared.schedule.present)
      throw new Error('Actual connected ready fixture has no saved placement');
    expect(prepared.input.dependencyHistory.kind).toBe('connected');
    expect(
      prepared.schedule.body.connection.stages.some(
        (stage) => stage.variants?.time.state === 'ready',
      ),
    ).toBe(true);
    const targetStage = prepared.schedule.body.connection.stages.find(
      (stage) => stage.workPackageId === 'w-one',
    );
    if (targetStage === undefined || targetStage.variants?.time.state !== 'ready')
      throw new Error('Actual target ready stage is absent');
    expect(targetStage.variants.time.candidate.question.budgetMs).toBe(budgetMs);
    expect(targetStage.variants.time.candidate.question.stageBytes).toBe(targetStage.stageBytes);
    expect(targetStage.variants.time.candidate.question.inputHash).toBe(
      hashBytes(targetStage.stageBytes),
    );
    return {
      input: prepared.input,
      schedule: prepared.schedule,
      question: targetStage.variants.time.candidate.question,
    };
  };
  const loserPacket = buildPacket('z-dev', 100);
  const loserInput = JSON.stringify(loserPacket.input),
    loserSchedule = JSON.stringify(loserPacket.schedule.body);
  expect(domain.readSavedPlanInput(JSON.parse(loserInput), 12)).toEqual(loserPacket.input);
  expect(domain.readSavedConnectedScheduleBody(JSON.parse(loserSchedule))).toEqual(
    loserPacket.schedule.body,
  );
  const seedSnapshot = (
    id: string,
    input: string,
    schedule: string,
    algorithmId: string,
    storedInput = input,
  ) => {
    withinStore(store.path, (db) => {
      db.run(sql`INSERT INTO saved_plan(id,work_package_id,name,created_by,created_by_id,created_at,input_schema_version,input_bytes,input_sha256,schedule_schema_version,schedule_bytes,schedule_sha256,schedule_input_sha256,scheduler_algorithm_id)
      VALUES(${id},'w-one',${id},'Catalogue Author','catalogue-author',80,12,${Buffer.byteLength(input)},${hashBytes(input)},4,${Buffer.byteLength(schedule)},${hashBytes(schedule)},${hashBytes(input)},${algorithmId})`);
      db.run(
        sql`INSERT INTO saved_plan_organization(resource_id,organization_id) VALUES(${id},'org-a')`,
      );
      db.run(
        sql`INSERT INTO saved_plan_body(saved_plan_id,kind,bytes) VALUES(${id},'input',${storedInput}),(${id},'schedule',${schedule})`,
      );
    });
  };
  const captureSaved = () =>
    withinStore(store.path, (db) => ({
      headers: db.all("SELECT * FROM saved_plan WHERE id LIKE 'sc13-connected-%' ORDER BY id"),
      bodies: db.all(
        "SELECT * FROM saved_plan_body WHERE saved_plan_id LIKE 'sc13-connected-%' ORDER BY saved_plan_id,kind",
      ),
    }));
  const tamperedInput = loserInput + ' ';
  seedSnapshot(
    'sc13-connected-loser',
    loserInput,
    loserSchedule,
    loserPacket.schedule.body.algorithmId,
  );
  seedSnapshot(
    'sc13-connected-tampered',
    loserInput,
    loserSchedule,
    loserPacket.schedule.body.algorithmId,
    tamperedInput,
  );
  const beforeMigration = captureSaved();
  const reportStepCatalogue = await readReporter();
  const report = withinStore(store.path, (db) => reportStepCatalogue(db, 81));
  expect(readReportRows(report)).toEqual([IDENTICAL]);
  const rules = { version: 1, fingerprint: fingerprintOf(report), organizations: {} };
  const ruleFile = await writeRuleFile(rules),
    preflight = await readRulePreflight();
  expect(withinStore(store.path, (db) => preflight(db, ruleFile))).toEqual(rules);
  const additions = readMigrationFolders(FOLDER).filter(({ name }) => name === catalogueName);
  expect(additions).toHaveLength(1);
  for (const addition of additions)
    cpSync(join(FOLDER, addition.name), join(store.migrations, addition.name), { recursive: true });
  if (directory === undefined) throw new Error('Connected SC13 fixture directory is absent');
  const { createWindowBackup, assertWindowBackup } = await import('./window-backup');
  const window = {
    sourcePath: store.path,
    migrationsFolder: store.migrations,
    snapshotPath: join(directory, 'connected-sc13-backup.db'),
    reportPath: join(directory, 'connected-sc13-backup.json'),
  };
  // This actual E37 fixture is evidence of data closure, not real operator/host authority.
  try {
    const backup = createWindowBackup(window);
    expect(assertWindowBackup(window)).toEqual(backup.report);
  } catch (cause: unknown) {
    hasUnknownOwner = true;
    throw cause;
  }
  const { readFileSync } = await import('node:fs');
  await applyOwnedCatalogue({
    window,
    rulesJson: readFileSync(ruleFile, 'utf8'),
    appliedAt: '2026-11-15T12:00:00.000Z',
  });
  expect(captureSaved()).toEqual(beforeMigration);
  withinStore(store.path, (db) => {
    expect(db.all('SELECT old_step_id,step_id FROM step_identity_history')).toEqual([
      { old_step_id: 'z-dev', step_id: 'a-dev' },
    ]);
    expect(
      db.all(
        "SELECT predecessor_step_id,successor_step_id FROM external_dependency WHERE id='sc13-connected-edge'",
      ),
    ).toEqual([{ predecessor_step_id: 'a-dev', successor_step_id: 'a-dev' }]);
    expect(
      db.all(
        "SELECT work_package_id,step_id FROM work_package_step WHERE step_id='a-dev' ORDER BY work_package_id",
      ),
    ).toEqual([
      { work_package_id: 'w-one', step_id: 'a-dev' },
      { work_package_id: 'w-two', step_id: 'a-dev' },
    ]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const survivorPacket = buildPacket('a-dev', 100),
    changedPacket = buildPacket('a-dev', 200);
  const survivorInput = JSON.stringify(survivorPacket.input),
    survivorSchedule = JSON.stringify(survivorPacket.schedule.body);
  const changedInput = JSON.stringify(changedPacket.input),
    changedSchedule = JSON.stringify(changedPacket.schedule.body);
  expect(domain.readSavedPlanInput(JSON.parse(survivorInput), 12)).toEqual(survivorPacket.input);
  expect(domain.readSavedConnectedScheduleBody(JSON.parse(survivorSchedule))).toEqual(
    survivorPacket.schedule.body,
  );
  expect(loserSchedule).not.toBe(survivorSchedule);
  expect(loserPacket.question.inputHash).not.toBe(survivorPacket.question.inputHash);
  expect(loserPacket.question.questionHash).not.toBe(survivorPacket.question.questionHash);
  expect(changedPacket.question.questionHash).not.toBe(survivorPacket.question.questionHash);
  seedSnapshot(
    'sc13-connected-survivor',
    survivorInput,
    survivorSchedule,
    survivorPacket.schedule.body.algorithmId,
  );
  seedSnapshot(
    'sc13-connected-config',
    changedInput,
    changedSchedule,
    changedPacket.schedule.body.algorithmId,
  );
  withinStore(store.path, (db) => {
    db.run(
      "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','catalogue-author','member',1)",
    );
    db.run(
      "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('sc13-connected-viewer','org-a','organization','org-a','user','catalogue-author','org-viewer','route',1)",
    );
    db.run("UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1");
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const { SqliteWorkPackageObservation } = await import('./work-package-observation');
  const { refusingSavedCurrentCapture } = await import('./saved-current-capture');
  const { openReadOnlyConnection } = await import('./db');
  const observation = new SqliteWorkPackageObservation({
    openConnection: () => openReadOnlyConnection(store.path),
    now: () => 100,
    activeOrganizationOf: () => (principal) =>
      Promise.resolve(principal.id === 'catalogue-author' ? 'org-a' : null),
    currentCapture: refusingSavedCurrentCapture,
  });
  const caller: Parameters<typeof observation.readSaved>[0] = {
    kind: 'human',
    principal: {
      id: 'catalogue-author',
      username: 'Catalogue Author',
      scopes: ['read'],
      authentication: { kind: 'first_party', issuedAt: 1 },
    },
    expectedAccess: {
      kind: 'scoped',
      principal: { id: 'catalogue-author' },
      scope: { organizationId: 'org-a', userId: 'catalogue-author', cap: null },
    },
  };
  const storedOf = async (savedPlanId: string) => {
    let observed: Awaited<ReturnType<typeof observation.readSaved>>;
    try {
      observed = await observation.readSaved(caller, {
        kind: 'comparison',
        workPackageId: 'w-one',
        savedPlanId,
      });
    } catch (cause: unknown) {
      if (isSqliteCleanupUnknown(cause)) hasUnknownOwner = true;
      throw cause;
    }
    expect(observed.ok).toBe(true);
    if (!observed.ok || observed.value.kind !== 'stored')
      throw new Error('Connected SC13 fixture lost its admitted saved side');
    return observed.value.stored;
  };
  const { SavedPlanRepository } = await import('./saved-plan');
  let digests = 0;
  const digest: ConstructorParameters<typeof SavedPlanResource>[0]['digest'] = {
    sha256: (bytes) => {
      digests += 1;
      return Promise.resolve(hashBytes(bytes));
    },
  };
  const plans = new SavedPlanService({
    digest,
    newId: () => {
      throw new Error('Connected SC13 read generated an ID');
    },
    now: () => {
      throw new Error('Connected SC13 read consulted a clock');
    },
    scheduler: {
      supports: () => {
        throw new Error('Connected SC13 read consulted scheduling');
      },
      readResolvedFast: () => {
        throw new Error('Connected SC13 read scheduled Fast');
      },
      read: () => {
        throw new Error('Connected SC13 read scheduled');
      },
    },
    resource: new SavedPlanResource({
      digest,
      capture: {
        readPlanInput: () =>
          Promise.reject(new Error('Connected SC13 read captured current input')),
      },
      plans: new SavedPlanRepository({ openConnection: () => openConnection(store.path) }),
    }),
  });
  const loser = await storedOf('sc13-connected-loser'),
    survivor = await storedOf('sc13-connected-survivor');
  const tampered = await storedOf('sc13-connected-tampered'),
    changed = await storedOf('sc13-connected-config');
  expect(loser.bodies).toEqual({ input: loserInput, schedule: loserSchedule });
  expect(survivor.bodies).toEqual({ input: survivorInput, schedule: survivorSchedule });
  const beforeRead = captureCatalogueProvenanceState(store.path),
    savedBytes = captureSaved();
  const ledger = withinStore(store.path, (db) =>
    db.all<Record<string, unknown>>('SELECT * FROM __drizzle_migrations ORDER BY name'),
  );
  expect(ledger).toHaveLength(117);
  const rawOutcome = (
    id: string,
    input: string,
    schedule: string,
    algorithmId: string,
  ): Awaited<ReturnType<typeof plans.readStoredPlan>> => ({
    outcome: 'read',
    plan: {
      id,
      workPackageId: 'w-one',
      name: id,
      createdBy: 'Catalogue Author',
      createdAt: 80,
      input: { schemaVersion: 12, bytes: input, sha256: hashBytes(input) },
      schedule: {
        present: true,
        body: { schemaVersion: 4, bytes: schedule, sha256: hashBytes(schedule) },
        inputSha256: hashBytes(input),
        algorithmId,
      },
    },
  });
  const beforeRaw = digests;
  expect(await plans.readStoredPlan(loser)).toEqual(
    rawOutcome(
      'sc13-connected-loser',
      loserInput,
      loserSchedule,
      loserPacket.schedule.body.algorithmId,
    ),
  );
  expect(await plans.readStoredPlan(survivor)).toEqual(
    rawOutcome(
      'sc13-connected-survivor',
      survivorInput,
      survivorSchedule,
      survivorPacket.schedule.body.algorithmId,
    ),
  );
  expect(digests - beforeRaw).toBe(4);
  expect(await plans.readStoredSide(tampered)).toEqual({
    outcome: 'corrupt',
    savedPlanId: 'sc13-connected-tampered',
    refusal: {
      reason: 'body_hash_mismatch',
      savedPlanId: 'sc13-connected-tampered',
      body: 'input',
      stored: hashBytes(loserInput),
      recomputed: hashBytes(tamperedInput),
    },
  });
  const originalSide = (
    packet: ReturnType<typeof buildPacket>,
  ): Parameters<typeof summarizeSavedComparisonSide>[0] => ({
    comparison: { kind: 'captured' as const },
    ...domain.projectSavedPlanInput(packet.input, 12),
    schedule: {
      present: true,
      algorithmId: packet.schedule.body.algorithmId,
      // Boundary: captureConnectedHistory and the strict frozen reader validate finite JSON; this is only its opaque comparison-value type.
      body: packet.schedule.body as unknown as Extract<
        Parameters<typeof summarizeSavedComparisonSide>[0]['schedule'],
        { present: true }
      >['body'],
    },
  });
  const originalLeft = originalSide(loserPacket),
    originalRight = originalSide(survivorPacket);
  const leftRef = { kind: 'saved' as const, savedPlanId: 'sc13-connected-loser' },
    rightRef = { kind: 'saved' as const, savedPlanId: 'sc13-connected-survivor' };
  const expectedLeftSummary = summarizeSavedComparisonSide(originalLeft, leftRef),
    expectedRightSummary = summarizeSavedComparisonSide(originalRight, rightRef);
  const beforeProjection = digests;
  const left = await plans.readStoredSide(loser),
    right = await plans.readStoredSide(survivor);
  expect(digests - beforeProjection).toBe(4);
  expect(captureSaved()).toEqual(savedBytes);
  expect(captureCatalogueProvenanceState(store.path)).toEqual(beforeRead);
  // First intended RED is the current blanket connected-projection refusal, after real integrity/read preservation controls.
  expect(left.outcome).toBe('side');
  expect(right.outcome).toBe('side');
  if (left.outcome !== 'side' || right.outcome !== 'side')
    throw new Error('Valid merged connected history was refused');
  expect(left.side.inputEvidence).toEqual(originalLeft.inputEvidence);
  expect(right.side.inputEvidence).toEqual(originalRight.inputEvidence);
  expect(left.side.schedule).toEqual(originalLeft.schedule);
  expect(right.side.schedule).toEqual(originalRight.schedule);
  const compared = plans.compareSides(leftRef, left.side, rightRef, right.side);
  expect(compared.diff).toEqual({ input: [], schedule: [] });
  expect(compared.left).toEqual(expectedLeftSummary);
  expect(compared.right).toEqual(expectedRightSummary);
  const beforeLegacy = digests;
  const legacy = await plans.compare('w-one', leftRef, rightRef);
  expect(legacy.outcome).toBe('compared');
  if (legacy.outcome !== 'compared')
    throw new Error('Legacy connected saved comparison was refused');
  expect(legacy.diff).toEqual({ input: [], schedule: [] });
  expect(legacy.left).toEqual(expectedLeftSummary);
  expect(legacy.right).toEqual(expectedRightSummary);
  expect(digests - beforeLegacy).toBe(4);
  const changedSide = await plans.readStoredSide(changed);
  expect(changedSide.outcome).toBe('side');
  if (changedSide.outcome !== 'side')
    throw new Error('Valid changed-configuration packet was refused');
  const configured = plans.compareSides(
    rightRef,
    right.side,
    { kind: 'saved', savedPlanId: 'sc13-connected-config' },
    changedSide.side,
  );
  expect(domain.planDiffIsEmpty(configured.diff)).toBe(false);
  expect(
    configured.diff.schedule.some(
      (change) => change.path.endsWith('.budgetMs') && change.left === 100 && change.right === 200,
    ),
  ).toBe(true);
  expect(captureSaved()).toEqual(savedBytes);
  expect(captureCatalogueProvenanceState(store.path)).toEqual(beforeRead);
  expect(
    withinStore(store.path, (db) =>
      db.all<Record<string, unknown>>('SELECT * FROM __drizzle_migrations ORDER BY name'),
    ),
  ).toEqual(ledger);
});

/** Current-runtime owners upgrade the authentic117 fixture with ordinary118/119; frozen117/report owners above remain unchanged. */
async function prepareCurrentCatalogueProvenance() {
  const store = await prepareCatalogueProvenanceRefusal();
  applyMigrations(store.path, FOLDER);
  return store;
}

/** Same fixture custody as withinStore, awaiting repository thenables before the acquired connection closes. */
async function withinStoreRead<T>(path: string, use: (db: Drizzle) => Promise<T>): Promise<T> {
  let connection: ReturnType<typeof openConnection>;
  try {
    connection = openConnection(path);
  } catch (cause: unknown) {
    if (isSqliteCleanupUnknown(cause)) hasUnknownOwner = true;
    throw cause;
  }
  let outcome: { ok: true; value: T } | { ok: false; cause: unknown };
  try {
    outcome = { ok: true, value: await use(connection.db) };
  } catch (cause: unknown) {
    outcome = { ok: false, cause };
  }
  try {
    connection.close();
  } catch (cause: unknown) {
    hasUnknownOwner = true;
    if (!outcome.ok)
      throw new AggregateError([outcome.cause, cause], 'Step-report read and close failed', {
        cause,
      });
    throw cause;
  }
  if (!outcome.ok) throw outcome.cause;
  return outcome.value;
}

test('reads explicit per-package catalogue step values through the existing repository after real migration117', async () => {
  // The shared fixture runs actual116/report/rules/E37/atomic117, healthy public down and a fresh reapply.
  const store = await prepareCurrentCatalogueProvenance();
  withinStore(store.path, (db) => {
    expect(
      db.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('step','step_definition','step_binding','work_package_step') ORDER BY name",
      ),
    ).toEqual([
      { name: 'step_binding' },
      { name: 'step_definition' },
      { name: 'work_package_step' },
    ]);
    // SC21: later definition defaults do not replace existing explicit package values.
    db.run(
      "UPDATE step_definition SET estimate_unit='minutes',default_allowance_bps=900 WHERE id='z-dev'",
    );
    expect(
      db.get<{ id: string; estimate_unit: string; default_allowance_bps: number }>(
        "SELECT id,estimate_unit,default_allowance_bps FROM step_definition WHERE id='z-dev'",
      ),
    ).toEqual({ id: 'z-dev', estimate_unit: 'minutes', default_allowance_bps: 900 });
    expect(
      db.all<Record<string, unknown>>(
        "SELECT work_package_id,step_id,estimate_unit,allowance_bps,allowance_revision FROM work_package_step WHERE work_package_id IN ('w-one','w-two') ORDER BY work_package_id,step_id",
      ),
    ).toEqual([
      {
        work_package_id: 'w-one',
        step_id: 'z-dev',
        estimate_unit: 'workdays',
        allowance_bps: 500,
        allowance_revision: 7,
      },
      {
        work_package_id: 'w-one',
        step_id: 'z-qa',
        estimate_unit: 'minutes',
        allowance_bps: 100,
        allowance_revision: 2,
      },
      {
        work_package_id: 'w-two',
        step_id: 'a-dev',
        estimate_unit: 'workdays',
        allowance_bps: 500,
        allowance_revision: 3,
      },
      {
        work_package_id: 'w-two',
        step_id: 'a-qa',
        estimate_unit: 'minutes',
        allowance_bps: 200,
        allowance_revision: 8,
      },
    ]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const beforeRead = captureCatalogueProvenanceState(store.path);
  await withinStoreRead(store.path, async (db) => {
    // Read-only use of the existing repository on this exclusively fixture-owned file; no write admission is asserted.
    const steps = new StepRepository(db, OPEN);
    // Intended first RED is the actual old-step query, after the real117 schema and explicit package rows are proved.
    expect(await steps.listByWorkPackage('w-one')).toEqual([
      {
        id: 'z-dev',
        workPackageId: 'w-one',
        name: 'Develop One',
        position: 10,
        code: 'dev-one',
        estimateUnit: 'workdays',
        allowancePercent: 5,
      },
      {
        id: 'z-qa',
        workPackageId: 'w-one',
        name: 'Test One',
        position: 20,
        code: 'qa-one',
        estimateUnit: 'minutes',
        allowancePercent: 1,
      },
    ]);
    expect(await steps.listByWorkPackage('w-two')).toEqual([
      {
        id: 'a-dev',
        workPackageId: 'w-two',
        name: 'Develop Two',
        position: 10,
        code: 'dev-two',
        estimateUnit: 'workdays',
        allowancePercent: 5,
      },
      {
        id: 'a-qa',
        workPackageId: 'w-two',
        name: 'Test Two',
        position: 20,
        code: 'qa-two',
        estimateUnit: 'minutes',
        allowancePercent: 2,
      },
    ]);
  });
  expect(captureCatalogueProvenanceState(store.path)).toEqual(beforeRead);
});

test('catalogue package reads exclude retained rows after their last reaching binding is removed', async () => {
  const store = await prepareCurrentCatalogueProvenance();
  withinStore(store.path, (db) => {
    expect(
      db.all(
        "SELECT id,step_id FROM step_binding WHERE scope_kind='project' AND scope_id='p-one' ORDER BY position,id",
      ),
    ).toEqual([
      { id: 'migration:z-dev', step_id: 'z-dev' },
      { id: 'migration:z-qa', step_id: 'z-qa' },
    ]);
    db.run("DELETE FROM step_binding WHERE id='migration:z-qa'");
    expect(
      db.all(
        "SELECT step_id FROM work_package_step WHERE work_package_id='w-one' ORDER BY step_id",
      ),
    ).toEqual([{ step_id: 'z-dev' }, { step_id: 'z-qa' }]);
    expect(db.all("SELECT id FROM step_binding WHERE step_id='z-qa'")).toEqual([]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const beforeRead = captureCatalogueProvenanceState(store.path);
  const listed = await withinStoreRead(store.path, async (db) =>
    new StepRepository(db, OPEN).listByWorkPackage('w-one'),
  );
  expect(listed).toEqual([
    {
      id: 'z-dev',
      workPackageId: 'w-one',
      name: 'Develop One',
      position: 10,
      code: 'dev-one',
      estimateUnit: 'workdays',
      allowancePercent: 5,
    },
  ]);
  expect(captureCatalogueProvenanceState(store.path)).toEqual(beforeRead);
});

test('catalogue package reads follow organization space and project binding union with controlling order independently of leaf types', async () => {
  const store = await prepareCurrentCatalogueProvenance();
  withinStore(store.path, (db) => {
    db.run(
      "INSERT INTO space(id,organization_id,name,revision,created_at,created_by) VALUES('catalogue-space','org-a','Catalogue Space',0,1,'catalogue-author')",
    );
    db.run("UPDATE project SET space_id='catalogue-space',space_position=10 WHERE id='p-one'");
    expect(db.all('SELECT id,organization_id,space_id FROM project ORDER BY id')).toEqual([
      { id: 'p-foreign', organization_id: 'org-b', space_id: null },
      { id: 'p-one', organization_id: 'org-a', space_id: 'catalogue-space' },
      { id: 'p-two', organization_id: 'org-a', space_id: null },
    ]);
    db.run("INSERT INTO work_item_type(id,name) VALUES('catalogue-story','Catalogue Story')");
    db.run(
      "INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES('catalogue-story','org-a','Catalogue Story')",
    );
    expect(db.all('SELECT * FROM work_item_work_item_type')).toEqual([]);
    db.run(
      "INSERT INTO step_definition(id,organization_id,code,name,estimate_unit,default_allowance_bps,position,defined_at_scope_kind,defined_at_scope_id,origin) VALUES('org-before','org-a','aardvark','Organization First','minutes',900,600,'organization','org-a','authored'),('typed-project','org-a','project-only','Typed Project','minutes',400,0,'project','p-one','authored')",
    );
    db.run(
      "INSERT INTO step_binding(id,organization_id,scope_kind,scope_id,step_id,work_item_type_id,position,origin) VALUES('z-org-first','org-a','organization','org-a','org-before',NULL,30,'authored'),('a-org-dev','org-a','organization','org-a','z-dev',NULL,30,'authored'),('space-qa','org-a','space','catalogue-space','z-qa',NULL,5,'authored'),('project-typed','org-a','project','p-one','typed-project','catalogue-story',1,'authored')",
    );
    // SC21 materializes all reaching package rows, including the sibling project reached by organization bindings.
    db.run(
      "INSERT INTO work_package_step(work_package_id,step_id,estimate_unit,allowance_bps,allowance_revision) VALUES('w-one','org-before','minutes',900,0),('w-two','org-before','minutes',900,0),('w-two','z-dev','workdays',500,0),('w-one','typed-project','minutes',400,0)",
    );
    expect(
      db.all(
        "SELECT id,scope_kind,scope_id,step_id,work_item_type_id,position FROM step_binding WHERE id IN ('z-org-first','a-org-dev','space-qa','project-typed') ORDER BY id",
      ),
    ).toEqual([
      {
        id: 'a-org-dev',
        scope_kind: 'organization',
        scope_id: 'org-a',
        step_id: 'z-dev',
        work_item_type_id: null,
        position: 30,
      },
      {
        id: 'project-typed',
        scope_kind: 'project',
        scope_id: 'p-one',
        step_id: 'typed-project',
        work_item_type_id: 'catalogue-story',
        position: 1,
      },
      {
        id: 'space-qa',
        scope_kind: 'space',
        scope_id: 'catalogue-space',
        step_id: 'z-qa',
        work_item_type_id: null,
        position: 5,
      },
      {
        id: 'z-org-first',
        scope_kind: 'organization',
        scope_id: 'org-a',
        step_id: 'org-before',
        work_item_type_id: null,
        position: 30,
      },
    ]);
    expect(
      db.all(
        "SELECT step_id FROM work_package_step WHERE work_package_id='w-one' ORDER BY step_id",
      ),
    ).toEqual([
      { step_id: 'org-before' },
      { step_id: 'typed-project' },
      { step_id: 'z-dev' },
      { step_id: 'z-qa' },
    ]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const beforeRead = captureCatalogueProvenanceState(store.path);
  const listed = await withinStoreRead(store.path, async (db) =>
    new StepRepository(db, OPEN).listByWorkPackage('w-one'),
  );
  expect(listed).toEqual([
    {
      id: 'org-before',
      workPackageId: 'w-one',
      name: 'Organization First',
      position: 30,
      code: 'aardvark',
      estimateUnit: 'minutes',
      allowancePercent: 9,
    },
    {
      id: 'z-dev',
      workPackageId: 'w-one',
      name: 'Develop One',
      position: 30,
      code: 'dev-one',
      estimateUnit: 'workdays',
      allowancePercent: 5,
    },
    {
      id: 'z-qa',
      workPackageId: 'w-one',
      name: 'Test One',
      position: 5,
      code: 'qa-one',
      estimateUnit: 'minutes',
      allowancePercent: 1,
    },
    {
      id: 'typed-project',
      workPackageId: 'w-one',
      name: 'Typed Project',
      position: 1,
      code: 'project-only',
      estimateUnit: 'minutes',
      allowancePercent: 4,
    },
  ]);
  expect(captureCatalogueProvenanceState(store.path)).toEqual(beforeRead);
});

test('catalogue package reads refuse a selected missing explicit package row without mutation', async () => {
  const store = await prepareCurrentCatalogueProvenance();
  withinStore(store.path, (db) => {
    expect(
      db.all(
        "SELECT id FROM step_binding WHERE scope_kind='project' AND scope_id='p-one' AND step_id='z-dev'",
      ),
    ).toEqual([{ id: 'migration:z-dev' }]);
    db.run("DELETE FROM work_package_step WHERE work_package_id='w-one' AND step_id='z-dev'");
    expect(
      db.all(
        "SELECT step_id FROM work_package_step WHERE work_package_id='w-one' ORDER BY step_id",
      ),
    ).toEqual([{ step_id: 'z-qa' }]);
    expect(db.all("SELECT id FROM step_definition WHERE id='z-dev'")).toEqual([{ id: 'z-dev' }]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const beforeRead = captureCatalogueProvenanceState(store.path);
  let outcome: { rejected: false } | { rejected: true; cause: unknown };
  try {
    await withinStoreRead(store.path, async (db) =>
      new StepRepository(db, OPEN).listByWorkPackage('w-one'),
    );
    outcome = { rejected: false };
  } catch (cause: unknown) {
    outcome = { rejected: true, cause };
  }
  expect(outcome.rejected).toBe(true);
  if (!outcome.rejected) throw new Error('Selected missing package step row was silently omitted');
  expect(outcome.cause).toMatchObject({
    name: 'WorkPackageStepMissing',
    workPackageId: 'w-one',
    stepId: 'z-dev',
  });
  expect(captureCatalogueProvenanceState(store.path)).toEqual(beforeRead);
});

const catalogueReaderCorruptions: readonly {
  title: string;
  seed: readonly string[];
  healthyPosition: number;
  change: { sql: string; triggers: readonly string[]; ignoresChecks?: true };
  premise: string;
  expected: readonly Record<string, unknown>[];
  foreignKeys: readonly { table: string; parent: string }[];
  diagnostic: string;
}[] = [
  {
    title: 'an absent current parent',
    seed: [],
    healthyPosition: 10,
    change: {
      sql: "UPDATE work_package SET project_id='absent-project' WHERE id='w-one'",
      triggers: [],
    },
    premise: "SELECT id,project_id FROM work_package WHERE id='w-one'",
    expected: [
      {
        id: 'w-one',
        project_id: 'absent-project',
      },
    ],
    foreignKeys: [
      {
        table: 'work_package',
        parent: 'project',
      },
    ],
    diagnostic: 'has an absent, malformed or foreign parent',
  },
  {
    title: 'a selected definition attributed to another organization',
    seed: [],
    healthyPosition: 10,
    change: {
      sql: "UPDATE step_definition SET organization_id='org-b' WHERE id='z-dev'",
      triggers: [],
    },
    premise: "SELECT id,organization_id FROM step_definition WHERE id='z-dev'",
    expected: [
      {
        id: 'z-dev',
        organization_id: 'org-b',
      },
    ],
    foreignKeys: [],
    diagnostic: 'binding has an absent or inconsistent definition',
  },
  {
    title: 'a corrupt later duplicate provenance before deduplication',
    seed: [
      "INSERT INTO step_binding(id,organization_id,scope_kind,scope_id,step_id,position,origin) VALUES('guard-org-dev','org-a','organization','org-a','z-dev',1,'authored')",
      "INSERT INTO work_package_step(work_package_id,step_id,estimate_unit,allowance_bps,allowance_revision) VALUES('w-two','z-dev','workdays',500,0)",
    ],
    healthyPosition: 1,
    change: {
      sql: "UPDATE step_binding SET organization_id='org-b' WHERE id='migration:z-dev'",
      triggers: ['step_binding_scope_update'],
    },
    premise:
      "SELECT id,organization_id,scope_kind,position FROM step_binding WHERE step_id='z-dev' ORDER BY id",
    expected: [
      {
        id: 'guard-org-dev',
        organization_id: 'org-a',
        scope_kind: 'organization',
        position: 1,
      },
      {
        id: 'migration:z-dev',
        organization_id: 'org-b',
        scope_kind: 'project',
        position: 10,
      },
    ],
    foreignKeys: [],
    diagnostic: 'binding has an absent identity or inconsistent organization',
  },
  {
    title: 'a selected type with foreign attribution',
    seed: [
      "INSERT INTO work_item_type(id,name) VALUES('guard-story','Guard Story')",
      "INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES('guard-story','org-a','Guard Story')",
      "UPDATE step_binding SET work_item_type_id='guard-story' WHERE id='migration:z-dev'",
    ],
    healthyPosition: 10,
    change: {
      sql: "UPDATE work_item_type_organization SET organization_id='org-b' WHERE resource_id='guard-story'",
      triggers: ['work_item_type_organization_frozen_update'],
    },
    premise:
      "SELECT resource_id,organization_id FROM work_item_type_organization WHERE resource_id='guard-story'",
    expected: [
      {
        resource_id: 'guard-story',
        organization_id: 'org-b',
      },
    ],
    foreignKeys: [],
    diagnostic: 'binding has an absent or inconsistent type',
  },
  {
    title: 'a selected type without its attribution row',
    seed: [
      "INSERT INTO work_item_type(id,name) VALUES('guard-story','Guard Story')",
      "INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES('guard-story','org-a','Guard Story')",
      "UPDATE step_binding SET work_item_type_id='guard-story' WHERE id='migration:z-dev'",
    ],
    healthyPosition: 10,
    change: {
      sql: "DELETE FROM work_item_type_organization WHERE resource_id='guard-story'",
      triggers: ['work_item_type_organization_frozen_delete'],
    },
    premise:
      "SELECT t.id,m.organization_id FROM work_item_type t LEFT JOIN work_item_type_organization m ON m.resource_id=t.id WHERE t.id='guard-story'",
    expected: [
      {
        id: 'guard-story',
        organization_id: null,
      },
    ],
    foreignKeys: [],
    diagnostic: 'binding has an absent or inconsistent type',
  },
  {
    title: 'a finite fractional binding position',
    seed: [],
    healthyPosition: 10,
    change: {
      sql: "UPDATE step_binding SET position=1.5 WHERE id='migration:z-dev'",
      triggers: [],
      ignoresChecks: true,
    },
    premise:
      "SELECT id,typeof(position) AS storage,position FROM step_binding WHERE id='migration:z-dev'",
    expected: [
      {
        id: 'migration:z-dev',
        storage: 'real',
        position: 1.5,
      },
    ],
    foreignKeys: [],
    diagnostic: 'binding has a malformed position',
  },
  {
    title: 'a BLOB definition display name',
    seed: [],
    healthyPosition: 10,
    change: {
      sql: "UPDATE step_definition SET name=X'4e616d65' WHERE id='z-dev'",
      triggers: [],
    },
    premise:
      "SELECT id,typeof(name) AS storage,hex(name) AS encoded FROM step_definition WHERE id='z-dev'",
    expected: [
      {
        id: 'z-dev',
        storage: 'blob',
        encoded: '4E616D65',
      },
    ],
    foreignKeys: [],
    diagnostic: 'definition has malformed display fields',
  },
  {
    title: 'an unknown explicit package estimate unit',
    seed: [],
    healthyPosition: 10,
    change: {
      sql: "UPDATE work_package_step SET estimate_unit='hours' WHERE work_package_id='w-one' AND step_id='z-dev'",
      triggers: [],
      ignoresChecks: true,
    },
    premise:
      "SELECT work_package_id,step_id,estimate_unit FROM work_package_step WHERE work_package_id='w-one' AND step_id='z-dev'",
    expected: [
      {
        work_package_id: 'w-one',
        step_id: 'z-dev',
        estimate_unit: 'hours',
      },
    ],
    foreignKeys: [],
    diagnostic: 'package step has a malformed estimate unit',
  },
  {
    title: 'a BLOB explicit package allowance before numeric coercion',
    seed: [],
    healthyPosition: 10,
    change: {
      sql: "UPDATE work_package_step SET allowance_bps=X'353030' WHERE work_package_id='w-one' AND step_id='z-dev'",
      triggers: [],
      ignoresChecks: true,
    },
    premise:
      "SELECT work_package_id,step_id,typeof(allowance_bps) AS storage,hex(allowance_bps) AS encoded FROM work_package_step WHERE work_package_id='w-one' AND step_id='z-dev'",
    expected: [
      {
        work_package_id: 'w-one',
        step_id: 'z-dev',
        storage: 'blob',
        encoded: '353030',
      },
    ],
    foreignKeys: [],
    diagnostic: 'package step has a malformed allowance',
  },
  {
    title: 'an explicit package allowance beyond the supported range',
    seed: [],
    healthyPosition: 10,
    change: {
      sql: "UPDATE work_package_step SET allowance_bps=100001 WHERE work_package_id='w-one' AND step_id='z-dev'",
      triggers: [],
      ignoresChecks: true,
    },
    premise:
      "SELECT work_package_id,step_id,typeof(allowance_bps) AS storage,allowance_bps FROM work_package_step WHERE work_package_id='w-one' AND step_id='z-dev'",
    expected: [
      {
        work_package_id: 'w-one',
        step_id: 'z-dev',
        storage: 'integer',
        allowance_bps: 100001,
      },
    ],
    foreignKeys: [],
    diagnostic: 'package step has a malformed allowance',
  },
];

for (const corruption of catalogueReaderCorruptions) {
  test(
    'catalogue package reader rejects ' + corruption.title + ' without changing trusted state',
    async () => {
      const store = await prepareCurrentCatalogueProvenance();
      withinStore(store.path, (db) => {
        for (const statement of corruption.seed) db.run(statement);
        expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
      });
      const healthy = await withinStoreRead(store.path, async (db) =>
        new StepRepository(db, OPEN).listByWorkPackage('w-one'),
      );
      expect(healthy).toEqual([
        {
          id: 'z-dev',
          workPackageId: 'w-one',
          name: 'Develop One',
          position: corruption.healthyPosition,
          code: 'dev-one',
          estimateUnit: 'workdays',
          allowancePercent: 5,
        },
        {
          id: 'z-qa',
          workPackageId: 'w-one',
          name: 'Test One',
          position: 20,
          code: 'qa-one',
          estimateUnit: 'minutes',
          allowancePercent: 1,
        },
      ]);
      const healthyState = captureCatalogueProvenanceState(store.path);
      corruptReportStore(store.path, corruption.change);
      withinStore(store.path, (db) => {
        expect(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')).toEqual({
          foreign_keys: 1,
        });
        expect(
          db.get<{ ignore_check_constraints: number }>('PRAGMA ignore_check_constraints'),
        ).toEqual({ ignore_check_constraints: 0 });
        expect<readonly Record<string, unknown>[]>(
          db.all<Record<string, unknown>>(corruption.premise),
        ).toEqual(corruption.expected);
        expect<readonly { table: string; parent: string }[]>(
          db
            .all<{ table: string; parent: string }>('PRAGMA foreign_key_check')
            .map(({ table, parent }) => ({ table, parent })),
        ).toEqual(corruption.foreignKeys);
      });
      const beforeRead = captureCatalogueProvenanceState(store.path);
      expect(beforeRead.schema).toEqual(healthyState.schema);
      let outcome: { rejected: false } | { rejected: true; cause: unknown };
      try {
        await withinStoreRead(store.path, async (db) =>
          new StepRepository(db, OPEN).listByWorkPackage('w-one'),
        );
        outcome = { rejected: false };
      } catch (cause: unknown) {
        outcome = { rejected: true, cause };
      }
      expect(outcome.rejected).toBe(true);
      if (!outcome.rejected) throw new Error('Corrupt selected catalogue state was accepted');
      expect(outcome.cause).toBeInstanceOf(Error);
      if (!(outcome.cause instanceof Error))
        throw new Error('Catalogue refusal did not carry the expected trusted-state diagnostic');
      expect(outcome.cause.message).toContain(corruption.diagnostic);
      expect(captureCatalogueProvenanceState(store.path)).toEqual(beforeRead);
    },
  );
}

test('catalogue package reader excludes sibling project bindings even when every widened candidate has explicit values', async () => {
  const store = await prepareCurrentCatalogueProvenance();
  withinStore(store.path, (db) => {
    db.run("DELETE FROM step_binding WHERE id='migration:foreign-dev'");
    db.run(
      "INSERT INTO work_package_step(work_package_id,step_id,estimate_unit,allowance_bps,allowance_revision) VALUES('w-one','a-dev','workdays',500,0),('w-one','a-qa','minutes',200,0)",
    );
    expect(
      db.all('SELECT id,organization_id,scope_kind,scope_id,step_id FROM step_binding ORDER BY id'),
    ).toEqual([
      {
        id: 'migration:a-dev',
        organization_id: 'org-a',
        scope_kind: 'project',
        scope_id: 'p-two',
        step_id: 'a-dev',
      },
      {
        id: 'migration:a-qa',
        organization_id: 'org-a',
        scope_kind: 'project',
        scope_id: 'p-two',
        step_id: 'a-qa',
      },
      {
        id: 'migration:z-dev',
        organization_id: 'org-a',
        scope_kind: 'project',
        scope_id: 'p-one',
        step_id: 'z-dev',
      },
      {
        id: 'migration:z-qa',
        organization_id: 'org-a',
        scope_kind: 'project',
        scope_id: 'p-one',
        step_id: 'z-qa',
      },
    ]);
    expect(
      db.all(
        "SELECT step_id FROM work_package_step WHERE work_package_id='w-one' ORDER BY step_id",
      ),
    ).toEqual([
      { step_id: 'a-dev' },
      { step_id: 'a-qa' },
      { step_id: 'z-dev' },
      { step_id: 'z-qa' },
    ]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const beforeRead = captureCatalogueProvenanceState(store.path);
  const listed = await withinStoreRead(store.path, async (db) =>
    new StepRepository(db, OPEN).listByWorkPackage('w-one'),
  );
  expect(listed).toEqual([
    {
      id: 'z-dev',
      workPackageId: 'w-one',
      name: 'Develop One',
      position: 10,
      code: 'dev-one',
      estimateUnit: 'workdays',
      allowancePercent: 5,
    },
    {
      id: 'z-qa',
      workPackageId: 'w-one',
      name: 'Test One',
      position: 20,
      code: 'qa-one',
      estimateUnit: 'minutes',
      allowancePercent: 1,
    },
  ]);
  expect(captureCatalogueProvenanceState(store.path)).toEqual(beforeRead);
});

test('materializes the complete catalogue union for an empty package at actual scoped birth using current definition defaults', async () => {
  const store = await prepareCurrentCatalogueProvenance();
  withinStore(store.path, (db) => {
    db.run(
      "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','catalogue-author','member',1)",
    );
    db.run("UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1");
    db.run(
      "INSERT INTO space(id,organization_id,name,revision,created_at,created_by) VALUES('birth-space','org-a','Birth Space',0,1,'catalogue-author')",
    );
    db.run("UPDATE project SET space_id='birth-space',space_position=10 WHERE id='p-one'");
    db.run("INSERT INTO work_item_type(id,name) VALUES('birth-story','Birth Story')");
    db.run(
      "INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES('birth-story','org-a','Birth Story')",
    );
    db.run(
      "INSERT INTO step_definition(id,organization_id,code,name,estimate_unit,default_allowance_bps,position,defined_at_scope_kind,defined_at_scope_id,origin) VALUES('birth-org','org-a','org-work','Organization Work','minutes',1200,100,'organization','org-a','authored'),('birth-typed','org-a','typed-work','Typed Space Work','workdays',300,200,'space','birth-space','authored')",
    );
    db.run(
      "INSERT INTO step_binding(id,organization_id,scope_kind,scope_id,step_id,work_item_type_id,position,origin) VALUES('birth-org-binding','org-a','organization','org-a','birth-org',NULL,1,'authored'),('birth-typed-binding','org-a','space','birth-space','birth-typed','birth-story',2,'authored')",
    );
    // These existing packages predate this tested birth and already hold the reaching rows.
    db.run(
      "INSERT INTO work_package_step(work_package_id,step_id,estimate_unit,allowance_bps,allowance_revision) VALUES('w-one','birth-org','minutes',1200,0),('w-two','birth-org','minutes',1200,0),('w-one','birth-typed','workdays',300,0)",
    );
    db.run(
      "UPDATE step_definition SET estimate_unit='minutes',default_allowance_bps=900 WHERE id='z-dev'",
    );
    expect(db.all("SELECT id,organization_id,space_id FROM project WHERE id='p-one'")).toEqual([
      { id: 'p-one', organization_id: 'org-a', space_id: 'birth-space' },
    ]);
    expect(
      db.all(
        "SELECT id,work_item_type_id FROM step_binding WHERE scope_kind='space' AND scope_id='birth-space'",
      ),
    ).toEqual([{ id: 'birth-typed-binding', work_item_type_id: 'birth-story' }]);
    expect(
      db.all(
        "SELECT step_id,estimate_unit,allowance_bps,allowance_revision FROM work_package_step WHERE work_package_id='w-one' AND step_id='z-dev'",
      ),
    ).toEqual([
      { step_id: 'z-dev', estimate_unit: 'workdays', allowance_bps: 500, allowance_revision: 7 },
    ]);
    expect(
      db.all("SELECT id,estimate_unit,default_allowance_bps FROM step_definition WHERE id='z-dev'"),
    ).toEqual([{ id: 'z-dev', estimate_unit: 'minutes', default_allowance_bps: 900 }]);
    expect(db.all("SELECT id FROM work_package WHERE id='birth-empty'")).toEqual([]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const beforeBirth = captureCatalogueProvenanceState(store.path);
  const { WorkPackageRepository } = await import('./work-package');
  const created = await withinStoreRead(store.path, async (db) =>
    new WorkPackageRepository(db, OPEN).createInOrganization(
      {
        id: 'birth-empty',
        projectId: 'p-one',
        name: 'Empty catalogue package',
        abbreviation: 'CATAEMPTY',
        restricted: false,
        estimateMethod: 'pert',
        depReach: 'whole-item',
        estimateRounding: 'ceil',
        startDate: null,
        solutionRef: null,
        revision: 0,
        createdAt: 100,
      },
      [],
      { at: 100, by: 'catalogue-author' },
      'org-a',
      { id: 'birth-creator-grant', auditId: 'birth-creator-audit' },
    ),
  );
  expect(typeof created).toBe('object');
  if (typeof created === 'string')
    throw new Error('Actual scoped empty-package birth refused: ' + created);
  expect({ id: created.id, projectId: created.projectId }).toEqual({
    id: 'birth-empty',
    projectId: 'p-one',
  });
  withinStore(store.path, (db) => {
    expect(
      db.all(
        "SELECT resource_id,organization_id FROM work_package_organization WHERE resource_id='birth-empty'",
      ),
    ).toEqual([{ resource_id: 'birth-empty', organization_id: 'org-a' }]);
    expect(
      db.all(
        "SELECT id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin FROM access_grant WHERE id='birth-creator-grant'",
      ),
    ).toEqual([
      {
        id: 'birth-creator-grant',
        scope_kind: 'work_package',
        scope_id: 'birth-empty',
        subject_kind: 'user',
        subject_id: 'catalogue-author',
        role_id: 'package-manager',
        origin: 'creation',
      },
    ]);
    expect(db.all("SELECT id FROM work_item WHERE work_package_id='birth-empty'")).toEqual([]);
    // Intended first RED: known birth currently commits no explicit catalogue rows.
    expect(
      db.all(
        "SELECT step_id,estimate_unit,allowance_bps,allowance_revision FROM work_package_step WHERE work_package_id='birth-empty' ORDER BY step_id",
      ),
    ).toEqual([
      {
        step_id: 'birth-org',
        estimate_unit: 'minutes',
        allowance_bps: 1200,
        allowance_revision: 0,
      },
      {
        step_id: 'birth-typed',
        estimate_unit: 'workdays',
        allowance_bps: 300,
        allowance_revision: 0,
      },
      { step_id: 'z-dev', estimate_unit: 'minutes', allowance_bps: 900, allowance_revision: 0 },
      { step_id: 'z-qa', estimate_unit: 'minutes', allowance_bps: 100, allowance_revision: 0 },
    ]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const listed = await withinStoreRead(store.path, async (db) =>
    new StepRepository(db, OPEN).listByWorkPackage('birth-empty'),
  );
  expect(listed).toEqual([
    {
      id: 'birth-org',
      workPackageId: 'birth-empty',
      name: 'Organization Work',
      position: 1,
      code: 'org-work',
      estimateUnit: 'minutes',
      allowancePercent: 12,
    },
    {
      id: 'birth-typed',
      workPackageId: 'birth-empty',
      name: 'Typed Space Work',
      position: 2,
      code: 'typed-work',
      estimateUnit: 'workdays',
      allowancePercent: 3,
    },
    {
      id: 'z-dev',
      workPackageId: 'birth-empty',
      name: 'Develop One',
      position: 10,
      code: 'dev-one',
      estimateUnit: 'minutes',
      allowancePercent: 9,
    },
    {
      id: 'z-qa',
      workPackageId: 'birth-empty',
      name: 'Test One',
      position: 20,
      code: 'qa-one',
      estimateUnit: 'minutes',
      allowancePercent: 1,
    },
  ]);
  const afterBirth = captureCatalogueProvenanceState(store.path);
  expect(afterBirth.schema).toEqual(beforeBirth.schema);
  for (const name of [
    '__drizzle_migrations',
    'step_definition',
    'step_binding',
    'step_identity_history',
  ]) {
    const before = beforeBirth.tables.find((table) => table.name === name);
    const after = afterBirth.tables.find((table) => table.name === name);
    if (before === undefined || after === undefined)
      throw new Error('Required catalogue birth preservation table is absent: ' + name);
    expect(after).toEqual(before);
  }
  const oldValues = beforeBirth.tables.find((table) => table.name === 'work_package_step');
  const newValues = afterBirth.tables.find((table) => table.name === 'work_package_step');
  if (oldValues === undefined || newValues === undefined)
    throw new Error('Explicit package values table vanished');
  expect(newValues.rows.filter((row) => row['work_package_id'] !== 'birth-empty')).toEqual(
    oldValues.rows,
  );
});

async function prepareCatalogueBirthControl() {
  const store = await prepareCurrentCatalogueProvenance();
  withinStore(store.path, (db) => {
    db.run(
      "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','catalogue-author','member',1)",
    );
    db.run("UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1");
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  return store;
}

async function createCatalogueBirthControl(path: string, id: string, projectId: string) {
  const { WorkPackageRepository } = await import('./work-package');
  return await withinStoreRead(path, async (db) =>
    new WorkPackageRepository(db, OPEN).createInOrganization(
      {
        id,
        projectId,
        name: 'Catalogue birth ' + id,
        abbreviation: id === 'birth-healthy' ? 'BIRTHHEALTHY' : 'BIRTHREJECTED',
        restricted: false,
        estimateMethod: 'pert',
        depReach: 'whole-item',
        estimateRounding: 'ceil',
        startDate: null,
        solutionRef: null,
        revision: 0,
        createdAt: 200,
      },
      [],
      { at: 200, by: 'catalogue-author' },
      'org-a',
      { id: id + ':creator-grant', auditId: id + ':creator-audit' },
    ),
  );
}

const catalogueBirthCorruptions: readonly {
  title: string;
  seed: readonly string[];
  blockEarlyInserts: boolean;
  change: { sql: string; triggers: readonly string[]; ignoresChecks?: true };
  premise: string;
  expected: Record<string, unknown>[];
  foreignKeys: { table: string; parent: string }[];
  diagnostic: string;
}[] = [
  {
    title: 'a selected binding with BLOB identity',
    seed: [],
    blockEarlyInserts: false,
    change: {
      sql: "UPDATE step_binding SET id=X'626164' WHERE id='migration:z-qa'",
      triggers: [],
    },
    premise:
      "SELECT typeof(id) AS storage,hex(id) AS encoded,step_id FROM step_binding WHERE step_id='z-qa'",
    expected: [
      {
        storage: 'blob',
        encoded: '626164',
        step_id: 'z-qa',
      },
    ],
    foreignKeys: [],
    diagnostic: 'package step materialization has an absent binding or inconsistent organization',
  },
  {
    title: 'a late foreign binding organization before attempting any values insert',
    seed: [],
    blockEarlyInserts: true,
    change: {
      sql: "UPDATE step_binding SET organization_id='org-b' WHERE id='migration:z-qa'",
      triggers: ['step_binding_scope_update'],
    },
    premise:
      "SELECT id,organization_id,step_id FROM step_binding WHERE scope_kind='project' AND scope_id='p-one' ORDER BY id",
    expected: [
      {
        id: 'migration:z-dev',
        organization_id: 'org-a',
        step_id: 'z-dev',
      },
      {
        id: 'migration:z-qa',
        organization_id: 'org-b',
        step_id: 'z-qa',
      },
    ],
    foreignKeys: [],
    diagnostic: 'package step materialization has an absent binding or inconsistent organization',
  },
  {
    title: 'a selected missing definition',
    seed: [],
    blockEarlyInserts: false,
    change: {
      sql: "UPDATE step_binding SET step_id='absent-birth-definition' WHERE id='migration:z-qa'",
      triggers: ['step_binding_scope_update'],
    },
    premise:
      "SELECT binding.id,binding.step_id,definition.id AS definition_id FROM step_binding binding LEFT JOIN step_definition definition ON definition.id=binding.step_id WHERE binding.id='migration:z-qa'",
    expected: [
      {
        id: 'migration:z-qa',
        step_id: 'absent-birth-definition',
        definition_id: null,
      },
    ],
    foreignKeys: [
      {
        table: 'step_binding',
        parent: 'step_definition',
      },
    ],
    diagnostic: 'package step materialization has an absent or inconsistent definition',
  },
  {
    title: 'a selected foreign definition organization',
    seed: [],
    blockEarlyInserts: false,
    change: {
      sql: "UPDATE step_definition SET organization_id='org-b' WHERE id='z-qa'",
      triggers: [],
    },
    premise: "SELECT id,organization_id FROM step_definition WHERE id='z-qa'",
    expected: [
      {
        id: 'z-qa',
        organization_id: 'org-b',
      },
    ],
    foreignKeys: [],
    diagnostic: 'package step materialization has an absent or inconsistent definition',
  },
  {
    title: 'a selected missing type attribution',
    seed: [
      "INSERT INTO work_item_type(id,name) VALUES('birth-guard-story','Birth Guard Story')",
      "INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES('birth-guard-story','org-a','Birth Guard Story')",
      "UPDATE step_binding SET work_item_type_id='birth-guard-story' WHERE id='migration:z-qa'",
    ],
    blockEarlyInserts: false,
    change: {
      sql: "DELETE FROM work_item_type_organization WHERE resource_id='birth-guard-story'",
      triggers: ['work_item_type_organization_frozen_delete'],
    },
    premise:
      "SELECT actual.id,mapping.organization_id FROM work_item_type actual LEFT JOIN work_item_type_organization mapping ON mapping.resource_id=actual.id WHERE actual.id='birth-guard-story'",
    expected: [
      {
        id: 'birth-guard-story',
        organization_id: null,
      },
    ],
    foreignKeys: [],
    diagnostic: 'package step materialization has an absent or inconsistent type',
  },
  {
    title: 'a selected foreign type attribution',
    seed: [
      "INSERT INTO work_item_type(id,name) VALUES('birth-guard-story','Birth Guard Story')",
      "INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES('birth-guard-story','org-a','Birth Guard Story')",
      "UPDATE step_binding SET work_item_type_id='birth-guard-story' WHERE id='migration:z-qa'",
    ],
    blockEarlyInserts: false,
    change: {
      sql: "UPDATE work_item_type_organization SET organization_id='org-b' WHERE resource_id='birth-guard-story'",
      triggers: ['work_item_type_organization_frozen_update'],
    },
    premise:
      "SELECT resource_id,organization_id FROM work_item_type_organization WHERE resource_id='birth-guard-story'",
    expected: [
      {
        resource_id: 'birth-guard-story',
        organization_id: 'org-b',
      },
    ],
    foreignKeys: [],
    diagnostic: 'package step materialization has an absent or inconsistent type',
  },
  {
    title: 'an unknown definition default estimate unit',
    seed: [],
    blockEarlyInserts: false,
    change: {
      sql: "UPDATE step_definition SET estimate_unit='hours' WHERE id='z-qa'",
      triggers: [],
      ignoresChecks: true,
    },
    premise: "SELECT id,estimate_unit FROM step_definition WHERE id='z-qa'",
    expected: [
      {
        id: 'z-qa',
        estimate_unit: 'hours',
      },
    ],
    foreignKeys: [],
    diagnostic: 'package step materialization has a malformed default estimate unit',
  },
  {
    title: 'a BLOB definition default allowance before coercion',
    seed: [],
    blockEarlyInserts: false,
    change: {
      sql: "UPDATE step_definition SET default_allowance_bps=X'353030' WHERE id='z-qa'",
      triggers: [],
      ignoresChecks: true,
    },
    premise:
      "SELECT id,typeof(default_allowance_bps) AS storage,hex(default_allowance_bps) AS encoded FROM step_definition WHERE id='z-qa'",
    expected: [
      {
        id: 'z-qa',
        storage: 'blob',
        encoded: '353030',
      },
    ],
    foreignKeys: [],
    diagnostic: 'package step materialization has a malformed default allowance',
  },
  {
    title: 'a fractional definition default allowance',
    seed: [],
    blockEarlyInserts: false,
    change: {
      sql: "UPDATE step_definition SET default_allowance_bps=100.5 WHERE id='z-qa'",
      triggers: [],
      ignoresChecks: true,
    },
    premise:
      "SELECT id,typeof(default_allowance_bps) AS storage,default_allowance_bps FROM step_definition WHERE id='z-qa'",
    expected: [
      {
        id: 'z-qa',
        storage: 'real',
        default_allowance_bps: 100.5,
      },
    ],
    foreignKeys: [],
    diagnostic: 'package step materialization has a malformed default allowance',
  },
  {
    title: 'an out of range definition default allowance',
    seed: [],
    blockEarlyInserts: false,
    change: {
      sql: "UPDATE step_definition SET default_allowance_bps=100001 WHERE id='z-qa'",
      triggers: [],
      ignoresChecks: true,
    },
    premise:
      "SELECT id,typeof(default_allowance_bps) AS storage,default_allowance_bps FROM step_definition WHERE id='z-qa'",
    expected: [
      {
        id: 'z-qa',
        storage: 'integer',
        default_allowance_bps: 100001,
      },
    ],
    foreignKeys: [],
    diagnostic: 'package step materialization has a malformed default allowance',
  },
];

for (const corruption of catalogueBirthCorruptions) {
  test(
    'catalogue package birth refuses ' + corruption.title + ' and rolls back its complete store',
    async () => {
      const store = await prepareCatalogueBirthControl();
      withinStore(store.path, (db) => {
        for (const statement of corruption.seed) db.run(statement);
      });
      const healthy = await createCatalogueBirthControl(store.path, 'birth-healthy', 'p-one');
      expect(typeof healthy).toBe('object');
      if (typeof healthy === 'string')
        throw new Error('Healthy materialized birth refused: ' + healthy);
      expect(healthy.id).toBe('birth-healthy');
      withinStore(store.path, (db) => {
        expect(
          db.all(
            "SELECT step_id,estimate_unit,allowance_bps,allowance_revision FROM work_package_step WHERE work_package_id='birth-healthy' ORDER BY step_id",
          ),
        ).toEqual([
          {
            step_id: 'z-dev',
            estimate_unit: 'workdays',
            allowance_bps: 500,
            allowance_revision: 0,
          },
          { step_id: 'z-qa', estimate_unit: 'minutes', allowance_bps: 100, allowance_revision: 0 },
        ]);
        expect(db.all("SELECT id FROM work_package WHERE id='birth-rejected'")).toEqual([]);
        expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
        if (corruption.blockEarlyInserts)
          db.run(
            "CREATE TRIGGER catalogue_birth_no_early_values BEFORE INSERT ON work_package_step WHEN NEW.work_package_id='birth-rejected' BEGIN SELECT RAISE(ABORT,'birth inserted before complete catalogue validation'); END",
          );
      });
      const healthyState = captureCatalogueProvenanceState(store.path);
      corruptReportStore(store.path, corruption.change);
      withinStore(store.path, (db) => {
        expect(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')).toEqual({
          foreign_keys: 1,
        });
        expect(
          db.get<{ ignore_check_constraints: number }>('PRAGMA ignore_check_constraints'),
        ).toEqual({ ignore_check_constraints: 0 });
        expect(db.all<Record<string, unknown>>(corruption.premise)).toEqual(corruption.expected);
        expect(
          db
            .all<{ table: string; parent: string }>('PRAGMA foreign_key_check')
            .map(({ table, parent }) => ({ table, parent })),
        ).toEqual(corruption.foreignKeys);
      });
      const beforeBirth = captureCatalogueProvenanceState(store.path);
      expect(beforeBirth.schema).toEqual(healthyState.schema);
      let outcome: { rejected: false } | { rejected: true; cause: unknown };
      try {
        await createCatalogueBirthControl(store.path, 'birth-rejected', 'p-one');
        outcome = { rejected: false };
      } catch (cause: unknown) {
        outcome = { rejected: true, cause };
      }
      expect(outcome.rejected).toBe(true);
      if (!outcome.rejected) throw new Error('Corrupt materialization admitted package birth');
      expect(outcome.cause).toBeInstanceOf(Error);
      if (!(outcome.cause instanceof Error))
        throw new Error('Materialization refusal has no trusted-state diagnostic');
      expect(outcome.cause.message).toBe(corruption.diagnostic);
      expect(captureCatalogueProvenanceState(store.path)).toEqual(beforeBirth);
    },
  );
}

test('catalogue package birth rolls back package grants audit and allocator on an actual values insert failure', async () => {
  const store = await prepareCatalogueBirthControl();
  const healthy = await createCatalogueBirthControl(store.path, 'birth-healthy', 'p-one');
  expect(typeof healthy).toBe('object');
  if (typeof healthy === 'string')
    throw new Error('Healthy materialized birth refused: ' + healthy);
  withinStore(store.path, (db) => {
    expect(
      db.all(
        "SELECT step_id FROM work_package_step WHERE work_package_id='birth-healthy' ORDER BY step_id",
      ),
    ).toEqual([{ step_id: 'z-dev' }, { step_id: 'z-qa' }]);
    db.run(
      "CREATE TRIGGER catalogue_birth_injected_failure BEFORE INSERT ON work_package_step WHEN NEW.work_package_id='birth-rejected' BEGIN SELECT RAISE(ABORT,'birth materialization injected persistence refusal'); END",
    );
    expect(
      db.all(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name='catalogue_birth_injected_failure'",
      ),
    ).toEqual([{ name: 'catalogue_birth_injected_failure' }]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const beforeBirth = captureCatalogueProvenanceState(store.path);
  let outcome: { rejected: false } | { rejected: true; cause: unknown };
  try {
    await createCatalogueBirthControl(store.path, 'birth-rejected', 'p-one');
    outcome = { rejected: false };
  } catch (cause: unknown) {
    outcome = { rejected: true, cause };
  }
  expect(outcome.rejected).toBe(true);
  if (!outcome.rejected)
    throw new Error('Injected materialization persistence failure was swallowed');
  expect(outcome.cause).toBeInstanceOf(Error);
  if (!(outcome.cause instanceof Error))
    throw new Error('Persistence refusal has no outer query error');
  const native = outcome.cause.cause;
  expect(native).toBeInstanceOf(Error);
  if (!(native instanceof Error))
    throw new Error('Persistence refusal has no retained native cause');
  expect(native.message).toBe('birth materialization injected persistence refusal');
  expect(captureCatalogueProvenanceState(store.path)).toEqual(beforeBirth);
});

test('catalogue package birth accepts a real project with no reaching bindings and creates no package values', async () => {
  const store = await prepareCatalogueBirthControl();
  withinStore(store.path, (db) => {
    db.run(
      "INSERT INTO project(id,organization_id,name,revision,created_at,created_by) VALUES('birth-unbound-project','org-a','Unbound Birth Project',0,1,'catalogue-author')",
    );
    expect(
      db.all(
        "SELECT id FROM step_binding WHERE (scope_kind='organization' AND scope_id='org-a') OR (scope_kind='project' AND scope_id='birth-unbound-project')",
      ),
    ).toEqual([]);
    expect(db.all("SELECT space_id FROM project WHERE id='birth-unbound-project'")).toEqual([
      { space_id: null },
    ]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const beforeBirth = captureCatalogueProvenanceState(store.path);
  const created = await createCatalogueBirthControl(
    store.path,
    'birth-rejected',
    'birth-unbound-project',
  );
  expect(typeof created).toBe('object');
  if (typeof created === 'string')
    throw new Error('Legitimate unbound-project birth refused: ' + created);
  expect({ id: created.id, projectId: created.projectId }).toEqual({
    id: 'birth-rejected',
    projectId: 'birth-unbound-project',
  });
  withinStore(store.path, (db) => {
    expect(
      db.all(
        "SELECT resource_id,organization_id FROM work_package_organization WHERE resource_id='birth-rejected'",
      ),
    ).toEqual([{ resource_id: 'birth-rejected', organization_id: 'org-a' }]);
    expect(
      db.all(
        "SELECT work_package_id,step_id FROM work_package_step WHERE work_package_id='birth-rejected'",
      ),
    ).toEqual([]);
    expect(db.all("SELECT id FROM work_item WHERE work_package_id='birth-rejected'")).toEqual([]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  const listed = await withinStoreRead(store.path, async (db) =>
    new StepRepository(db, OPEN).listByWorkPackage('birth-rejected'),
  );
  expect(listed).toEqual([]);
  const afterBirth = captureCatalogueProvenanceState(store.path);
  expect(afterBirth.schema).toEqual(beforeBirth.schema);
  for (const name of [
    '__drizzle_migrations',
    'step_definition',
    'step_binding',
    'step_identity_history',
    'work_package_step',
  ]) {
    const before = beforeBirth.tables.find((table) => table.name === name),
      after = afterBirth.tables.find((table) => table.name === name);
    if (before === undefined || after === undefined)
      throw new Error('Unbound birth preservation table is absent: ' + name);
    expect(after).toEqual(before);
  }
});
