import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Step, WorkItem, WorkPackage, WriteStamp } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { personAdded } from '@wbs/store-memory/testing/service-fixtures';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';

import { ClaimRepository } from './claim';
import { type Drizzle, openDatabase } from './db';
import { DirectoryRepository } from './directory';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { actual, assignment, estimate, measureEstimate, stepMeasure, stepProgress } from './schema';
import { StepRepository } from './step';
import { StepCatalogueRepository } from './step-catalogue';
import { StepNodeAttemptRepository } from './step-node-attempt';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';
import { seedLegacyPackageParent, seedPackageParent } from './testing/legacy-package-parent';
import { copyRecoveryPrefix } from './testing/recovery-state';
import { UserRepository } from './user';
import { WorkItemRepository } from './work-item';
import { WorkPackageRepository } from './work-package';

/**
 * The step table's write path, against real SQLite.
 *
 * Real, and only real. Every claim here is one SQLite makes and no fixture
 * can: the unique index that refuses a second `Design`, the foreign key that
 * `estimate.step_id` has no cascade for, and the revision arithmetic that
 * happens inside the statement rather than in this process.
 */
const PRE_CATALOGUE = '20261115120000_add_step_migration_report';
const ORGANIZATION = 'fixture-legacy-org';
const PROJECT = 'fixture-project';

let dir: string;
let ownerId: string;
let steps: StepRepository;
let workPackages: WorkPackageRepository;
let attempts: StepNodeAttemptRepository;
let directory: DirectoryRepository;
let workItems: WorkItemRepository;
let claims: ClaimRepository;
let workPackageId: string;
let otherWorkPackageId: string;
let devId: string;
let qaId: string;
/** A raw connection, for writing rows the way an older release writes them. */
let rawDb: ReturnType<typeof openDatabase>;

/**
 * The stamp every write here carries. The account is the work packages' owner, which
 * the `created_by` foreign key requires to exist; the owner's own signup carries
 * it too, because a new account authors its own row.
 */
const wrote = (): WriteStamp => ({ at: 1, by: ownerId });

const newWorkPackage = (name: string, projectId = PROJECT): WorkPackage =>
  workPackageRow({
    id: crypto.randomUUID(),
    name,
    projectId,
  });

const newItem = (id: string, position: number, name: string): WorkItem =>
  workItemRow({
    id,
    workPackageId,
    position,
    name,
  });

const revisionOf = async (id: string): Promise<number> => {
  const found = await workPackages.findById(id);
  if (found === null) throw new Error(`no work package ${id}`);
  return found.revision;
};

const workItemRevisionOf = async (id: string): Promise<number> => {
  const found = await workItems.findById(id);
  if (found === null) throw new Error(`no work item ${id}`);
  return found.revision;
};

const DAYS = { optimistic: 1, realistic: 2, pessimistic: 3 };

let db: Drizzle;
let closeDatabase: (() => void) | undefined;
const custody = { hasUnknownOwner: false };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-step-'));
  custody.hasUnknownOwner = false;
  ownerId = crypto.randomUUID();
  devId = crypto.randomUUID();
  qaId = crypto.randomUUID();
});

function openRepositories(path: string) {
  rawDb = openDatabase(path);
  const sqlite = rawDb;
  closeDatabase = () => {
    sqlite.close();
  };
  db = drizzle({ client: sqlite });
  steps = new StepRepository(db, OPEN);
  workPackages = new WorkPackageRepository(db, OPEN);
  attempts = new StepNodeAttemptRepository(db, OPEN);
  directory = new DirectoryRepository(db, OPEN);
  workItems = new WorkItemRepository(db, OPEN);
  claims = new ClaimRepository(db, OPEN);
}

async function seedOwner() {
  await new UserRepository(db, OPEN).create(
    { id: ownerId, username: 'owner', passwordHash: 'x', createdAt: 1 },
    wrote(),
  );
}

/** Runs the last migration whose physical step rows are owned by add, rename and remove. */
async function seedHistoricalSteps() {
  const path = join(dir, 'test.db');
  runMigrations(path, copyRecoveryPrefix(dir, PRE_CATALOGUE));
  seedLegacyPackageParent(path, ORGANIZATION, PROJECT);
  openRepositories(path);
  await seedOwner();
  workPackageId = crypto.randomUUID();
  otherWorkPackageId = crypto.randomUUID();
  for (const [id, name] of [
    [workPackageId, 'Rewire the shed'],
    [otherWorkPackageId, 'Re-tile the roof'],
  ] as const) {
    rawDb.run(
      'INSERT INTO work_package(id,name,project_id,created_at,created_by) VALUES(?,?,?,1,?)',
      [id, name, PROJECT, ownerId],
    );
  }
  rawDb.run(
    "INSERT INTO step(id,work_package_id,name,code,position) VALUES (?,?,'Dev','dev',10),(?,?,'QA','qa',20),(?,?,'Dev','dev',10)",
    [devId, workPackageId, qaId, workPackageId, crypto.randomUUID(), otherWorkPackageId],
  );
  await workItems.insert(newItem('strip', 10, 'Strip'), [], wrote());
  await workItems.insert(newItem('sand', 20, 'Sand'), [], wrote());
  await workItems.insert(newItem('paint', 30, 'Paint'), [], wrote());
}

/** Independent predecessor rows witness writes after the public list moved to the catalogue. */
function historicalSteps(id: string) {
  return rawDb
    .query<Step, [string]>(
      `SELECT id, work_package_id AS workPackageId, name, code, position,
  allowance_bps / 100.0 AS allowancePercent, estimate_unit AS estimateUnit FROM step WHERE work_package_id = ? ORDER BY position, id`,
    )
    .all(id);
}

function seedHistoricalAssignment(workItemId: string, stepId: string, personId: string) {
  db.insert(assignment).values({ workItemId, stepId, personId }).run();
}

function historicalEstimates() {
  return rawDb
    .query(
      'SELECT work_item_id AS workItemId, step_id AS stepId, optimistic, realistic, pessimistic FROM estimate',
    )
    .all();
}

function historicalActuals() {
  return rawDb
    .query(
      'SELECT work_item_id AS workItemId, step_id AS stepId, days, recorded_at AS recordedAt FROM actual',
    )
    .all();
}

function historicalMeasures() {
  return rawDb
    .query(
      'SELECT work_item_id AS workItemId, step_id AS stepId, metric, value, recorded_at AS recordedAt FROM step_measure',
    )
    .all();
}

function historicalProgress() {
  return rawDb
    .query(
      'SELECT work_item_id AS workItemId, step_id AS stepId, state, stated_at AS statedAt FROM step_progress',
    )
    .all();
}

async function bindStep(id: string, name: string, position: number) {
  const catalogue = new StepCatalogueRepository(db, OPEN, 'owned');
  const bound = await catalogue.defineAndBindStep(
    ORGANIZATION,
    {
      id,
      name,
      code: name.toLowerCase(),
      position,
      defaultAllowancePercent: 0,
      defaultEstimateUnit: 'workdays',
    },
    {
      bindingId: id + '-binding',
      scopeKind: 'project',
      scopeId: PROJECT,
      workItemTypeId: null,
      position,
    },
    wrote(),
  );
  expect(bound.ok).toBe(true);
}

async function seedCurrentSteps() {
  const path = join(dir, 'test.db');
  migrateEmptyCatalogueFixture({ path, directory: dir, reportedAt: 1 }, custody);
  seedLegacyPackageParent(path, ORGANIZATION, PROJECT);
  seedPackageParent(path, ORGANIZATION, 'other-project');
  openRepositories(path);
  await seedOwner();
  await bindStep(devId, 'Dev', 10);
  await bindStep(qaId, 'QA', 20);
  const primary = newWorkPackage('Rewire the shed');
  const other = newWorkPackage('Re-tile the roof', 'other-project');
  expect(await workPackages.create(primary, [], wrote())).toMatchObject({ id: primary.id });
  expect(await workPackages.create(other, [], wrote())).toMatchObject({ id: other.id });
  workPackageId = primary.id;
  otherWorkPackageId = other.id;
}

afterEach(() => {
  closeDatabase?.();
  closeDatabase = undefined;
  if (!custody.hasUnknownOwner) rmSync(dir, { recursive: true, force: true });
});

const ORGANIZATION_ROLE_COLUMNS = [
  'organization_invitation.role',
  'organization_membership.role',
  'access_grant.role_id',
  'access_role_permission.role_id',
];

/**
 * The access role catalogue of `20261102120000_add_access_grants` (`wbs-permissions`
 * E7): an access role is its own domain term, like an organization role, so its
 * table and its triggers are exempt by exact name and nothing else is.
 */
const ACCESS_ROLE_OBJECTS = [
  'access_role',
  'access_role_permission',
  'access_role_reserved_name_insert',
  'access_role_reserved_name_update',
];

describe('the names the pre-catalogue schema uses', () => {
  beforeEach(seedHistoricalSteps);
  /**
   * The physical schema and the domain agree, and this reads the **live
   * migrated database** rather than the schema file to say so.
   *
   * It replaces `the step table's physical name is still role`, which recorded
   * the disagreement `steps-not-phases` left behind and which
   * `20260831120000_rename_role_to_step` was written to end. That test was
   * deliberately built to go red the day the rename ran; this is what it
   * becomes.
   *
   * Proof: `ALTER TABLE assignment RENAME COLUMN role_id TO step_id` removed
   * from the migration, watched failing here on
   * `Expected to contain: "step_id" / Received: [ "work_item_id", "role_id",
   * "person_id" ]`. Observed 2026-08-31.
   *
   * Removing the **table** rename instead was tried first and is not the fault
   * to inject: the migration's own
   * `CREATE UNIQUE INDEX step_work_package_name ON step` then fails inside
   * `runMigrations`, so the run dies in `beforeEach` and this assertion is
   * never reached.
   */
  it('names steps everywhere the database does, and role nowhere', () => {
    // Through `openDatabase`, never `new Database`: the pragmas are
    // per-connection and the ESLint rule that keeps them so is the point.
    const sqlite = openDatabase(join(dir, 'test.db'));
    try {
      const objectsNamed = (type: string, name: string): number =>
        sqlite
          .query<{ n: number }, [string, string]>(
            'SELECT count(*) AS n FROM sqlite_master WHERE type = ? AND name = ?',
          )
          .get(type, name)?.n ?? 0;

      for (const table of ['step', 'step_progress', 'step_measure'])
        expect(objectsNamed('table', table)).toBe(1);
      for (const table of ['role', 'role_progress', 'role_measure'])
        expect(objectsNamed('table', table)).toBe(0);
      expect(objectsNamed('index', 'step_work_package_name')).toBe(1);

      // The column every join in this repository is written against.
      const columnsOf = (table: string): string[] =>
        sqlite
          .query<{ name: string }, [string]>('SELECT name FROM pragma_table_info(?)')
          .all(table)
          .map((column) => column.name);
      for (const table of ['estimate', 'actual', 'assignment', 'step_progress', 'step_measure'])
        expect(columnsOf(table)).toContain('step_id');
      for (const table of ['estimate', 'actual', 'assignment', 'step_progress', 'step_measure'])
        expect(columnsOf(table)).not.toContain('role_id');

      // Not one table, column or index name left carrying the word. The sweep
      // rather than a list, because a name nobody thought to name is exactly
      // the one a rename forgets.
      const named = sqlite
        .query<{ type: string; name: string }, []>(
          "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
        )
        .all();
      expect(
        named.filter((each) => /role/i.test(each.name) && !ACCESS_ROLE_OBJECTS.includes(each.name)),
      ).toEqual([]);
      const roleColumns = named
        .filter((each) => each.type === 'table')
        .flatMap((each) =>
          columnsOf(each.name)
            .filter((column) => /role/i.test(column))
            .map((column) => `${each.name}.${column}`),
        )
        // An organization role and an access role are their own domain terms,
        // not leftover steps: named here so any other `role` column is still a red.
        .filter((column) => !ORGANIZATION_ROLE_COLUMNS.includes(column));
      expect(roleColumns).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  /**
   * There is no boundary left for a comment to reconcile, so `schema.ts` must
   * not carry one.
   *
   * The spec `20260831120000_rename_role_to_step` implements says the schema
   * "SHALL NOT carry a comment reconciling a physical name with a domain name,
   * because they SHALL agree". This is that sentence, made breakable: the
   * paragraph it is about opened with **The physical name is `role`, and the
   * domain name is `step`.**
   *
   * `step.ts` is exempt and named here rather than left to be discovered: its
   * `isDuplicateName` comment says "physical" about the string SQLite puts in
   * an error message, which is a real fact about SQLite rather than a
   * disagreement between two names.
   *
   * Proof: that paragraph pasted back onto {@link step}, watched failing on
   * `expect(received).toEqual(expected)` with
   * `+ "* **The physical name is \`role\`, and the domain name is \`step\`.**
   * Every"` among three received lines against an empty expectation. Observed
   * 2026-08-31.
   */
  it('leaves no comment in the schema reconciling a physical name with a domain one', () => {
    const schema = readFileSync(join(import.meta.dir, 'schema.ts'), 'utf8');

    const reconciling = schema
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /physical name|physical\*\* name|domain name/i.test(line));

    expect(reconciling).toEqual([]);
  });
});

describe('StepRepository pre-catalogue writes', () => {
  beforeEach(seedHistoricalSteps);
  it('adds a step and moves the work package’s revision', async () => {
    const before = await revisionOf(workPackageId);

    const written = await steps.add(
      {
        id: 'design',
        workPackageId,
        name: 'Design',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
      wrote(),
    );

    expect(written).toEqual({
      ok: true,
      step: {
        id: 'design',
        workPackageId,
        name: 'Design',
        position: 30,
        code: 'design',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
    });
    const names = historicalSteps(workPackageId).map((each) => each.name);
    expect(names).toEqual(['Dev', 'QA', 'Design']);
    expect(await revisionOf(workPackageId)).toBe(before + 1);
  });

  it('writes the code its creator chose', async () => {
    const written = await steps.add(
      {
        id: 'impl',
        workPackageId,
        name: 'Build',
        code: 'impl',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
      wrote(),
    );

    expect(written).toEqual({
      ok: true,
      step: {
        id: 'impl',
        workPackageId,
        name: 'Build',
        position: 30,
        code: 'impl',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
    });
  });

  it('suggests a code against the codes the work package holds', async () => {
    const written = await steps.add(
      {
        id: 'qa-again',
        workPackageId,
        name: 'Q/A',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
      wrote(),
    );

    expect(written).toEqual({
      ok: true,
      step: {
        id: 'qa-again',
        workPackageId,
        name: 'Q/A',
        position: 30,
        code: 'q-a',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
    });
    const clash = await steps.add(
      {
        id: 'dev-again',
        workPackageId,
        name: 'DEV!',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
      wrote(),
    );
    expect(clash).toEqual({
      ok: true,
      step: {
        id: 'dev-again',
        workPackageId,
        name: 'DEV!',
        position: 40,
        code: 'dev-2',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
    });
  });

  /**
   * Proof: with the `stepCodeInWorkPackage` branch removed, this case failed on
   * `SQLiteError: UNIQUE constraint failed: step.work_package_id, step.code`
   * escaping the repository instead of a `code_taken`; watched 2026-09-27.
   */
  it('refuses a chosen code the work package already holds, writing nothing', async () => {
    const before = await revisionOf(workPackageId);

    const written = await steps.add(
      {
        id: 'dup',
        workPackageId,
        name: 'Develop',
        code: 'dev',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
      wrote(),
    );

    expect(written).toEqual({ ok: false, reason: 'code_taken' });
    expect(historicalSteps(workPackageId)).toHaveLength(2);
    expect(await revisionOf(workPackageId)).toBe(before);
  });

  it('reads a step an older release inserted without a code as uncoded', async () => {
    rawDb.run(
      `INSERT INTO step (id, work_package_id, name, position) VALUES ('legacy', '${workPackageId}', 'Legacy', 30)`,
    );

    expect(await steps.findById('legacy')).toEqual({
      id: 'legacy',
      workPackageId,
      name: 'Legacy',
      position: 30,
      code: null,
      allowancePercent: 0,
      estimateUnit: 'workdays' as const,
    });
    // And a new step beside it is still coded: an uncoded step holds no code.
    const written = await steps.add(
      {
        id: 'next',
        workPackageId,
        name: 'Legacy 2',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
      wrote(),
    );
    expect(written.ok && written.step.code).toBe('legacy-2');
  });

  it('refuses a name the work package already holds, and leaves the steps as they were', async () => {
    const written = await steps.add(
      {
        id: 'second-qa',
        workPackageId,
        name: 'QA',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
      wrote(),
    );

    expect(written).toEqual({ ok: false, reason: 'taken' });
    expect(historicalSteps(workPackageId)).toHaveLength(2);
  });

  it('accepts in one work package a name another work package holds', async () => {
    const written = await steps.add(
      {
        id: 'other-qa',
        workPackageId: otherWorkPackageId,
        name: 'QA',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
      wrote(),
    );

    expect(written.ok).toBe(true);
    const names = historicalSteps(otherWorkPackageId).map((each) => each.name);
    expect(names).toHaveLength(2);
    expect(names).toContain('QA');
  });

  it('renames a step and moves the work package’s revision', async () => {
    const before = await revisionOf(workPackageId);

    const written = await steps.rename(workPackageId, qaId, 'Review', wrote());

    expect(written).toEqual({
      ok: true,
      // The code stays: a step code is immutable, and `010.qa` must keep
      // naming this step after the rename.
      step: {
        id: qaId,
        workPackageId,
        name: 'Review',
        position: 20,
        code: 'qa',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
    });
    expect(await revisionOf(workPackageId)).toBe(before + 1);
  });

  it('refuses a rename onto a name already in use, leaving both alone', async () => {
    const before = await revisionOf(workPackageId);

    const written = await steps.rename(workPackageId, qaId, 'Dev', wrote());

    expect(written).toEqual({ ok: false, reason: 'taken' });
    const names = historicalSteps(workPackageId)
      .map((each) => each.name)
      .sort();
    expect(names).toEqual(['Dev', 'QA']);
    // The refused write moved nothing, so nobody's precondition is defeated by
    // a request that changed nothing.
    expect(await revisionOf(workPackageId)).toBe(before);
  });

  it('renames nothing of another work package, whatever it is called by', async () => {
    const before = await revisionOf(workPackageId);

    expect(await steps.rename(otherWorkPackageId, qaId, 'Taken', wrote())).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect((await steps.findById(qaId))?.name).toBe('QA');
    expect(await revisionOf(workPackageId)).toBe(before);
  });

  it('reports a step that is gone rather than pretending to rename it', async () => {
    expect(await steps.rename(workPackageId, 'never-existed', 'Design', wrote())).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await steps.findById('never-existed')).toBeNull();
  });

  it('finds a step by id, carrying the work package it belongs to', async () => {
    expect(await steps.findById(qaId)).toEqual({
      id: qaId,
      workPackageId,
      name: 'QA',
      position: 20,
      code: 'qa',
      allowancePercent: 0,
      estimateUnit: 'workdays' as const,
    });
  });

  it('counts the step’s estimates and hands back every assignment in the work package', async () => {
    db.insert(estimate)
      .values({ workItemId: 'strip', stepId: qaId, ...DAYS })
      .run();
    db.insert(estimate)
      .values({ workItemId: 'sand', stepId: qaId, ...DAYS })
      .run();
    db.insert(estimate)
      .values({ workItemId: 'sand', stepId: devId, ...DAYS })
      .run();
    const ada = await personAdded(
      directory.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, [], wrote()),
    );
    seedHistoricalAssignment('strip', devId, ada.id);
    seedHistoricalAssignment('strip', qaId, ada.id);

    const usage = await steps.usageOf(workPackageId, qaId);

    expect(usage.estimates).toBe(2);
    // Both of the work item's assignments, not only the QA one: what `strip`
    // is assumed to be after QA goes depends on the Dev row staying.
    expect(usage.assignments).toHaveLength(2);
    expect(usage.assignments).toContainEqual({
      workItemId: 'strip',
      stepId: devId,
      personId: ada.id,
    });
  });

  it('removes the step’s estimates, its assignments and its row, and nothing else’s', async () => {
    db.insert(estimate)
      .values({ workItemId: 'strip', stepId: qaId, ...DAYS })
      .run();
    db.insert(estimate)
      .values({ workItemId: 'strip', stepId: devId, ...DAYS })
      .run();
    db.insert(estimate)
      .values({ workItemId: 'sand', stepId: qaId, ...DAYS })
      .run();
    const ada = await personAdded(
      directory.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, [], wrote()),
    );
    seedHistoricalAssignment('strip', qaId, ada.id);
    seedHistoricalAssignment('strip', devId, ada.id);

    const removed = await steps.remove(workPackageId, qaId, true, wrote());

    if (!removed.ok) throw new Error(`removal refused: ${removed.reason}`);
    expect(removed.removal.estimates).toBe(2);
    expect(removed.removal.assignments).toBe(1);
    expect([...removed.removal.workItemIds].sort()).toEqual(['sand', 'strip']);
    expect(await steps.findById(qaId)).toBeNull();
    // The other step's rows are the survivors that make the delete's WHERE
    // clause provable: narrowed to the work item alone it would take these too.
    expect(historicalEstimates()).toEqual([{ workItemId: 'strip', stepId: devId, ...DAYS }]);
    expect(await directory.assignmentsOf(['strip', 'sand'])).toEqual([
      { workItemId: 'strip', stepId: devId, personId: ada.id },
    ]);
    // A step of the same name in another work package is not this work package's business.
    expect(historicalSteps(otherWorkPackageId)).toHaveLength(1);
  });

  it('moves the work package and every work item that lost something, and nothing else', async () => {
    db.insert(estimate)
      .values({ workItemId: 'strip', stepId: qaId, ...DAYS })
      .run();
    const ada = await personAdded(
      directory.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, [], wrote()),
    );
    seedHistoricalAssignment('sand', qaId, ada.id);
    const workPackageBefore = await revisionOf(workPackageId);
    const stripBefore = await workItemRevisionOf('strip');
    const sandBefore = await workItemRevisionOf('sand');
    const paintBefore = await workItemRevisionOf('paint');

    await steps.remove(workPackageId, qaId, true, wrote());

    expect(await revisionOf(workPackageId)).toBe(workPackageBefore + 1);
    expect(await workItemRevisionOf('strip')).toBe(stripBefore + 1);
    expect(await workItemRevisionOf('sand')).toBe(sandBefore + 1);
    // Held nothing of that step's, so nobody's read of it differs and a
    // precondition on it must survive.
    expect(await workItemRevisionOf('paint')).toBe(paintBefore);
  });

  it('refuses an unconfirmed removal and deletes nothing, reporting what it read', async () => {
    db.insert(estimate)
      .values({ workItemId: 'strip', stepId: qaId, ...DAYS })
      .run();
    const ada = await personAdded(
      directory.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, [], wrote()),
    );
    seedHistoricalAssignment('strip', qaId, ada.id);
    const before = await revisionOf(workPackageId);

    const refused = await steps.remove(workPackageId, qaId, false, wrote());

    expect(refused).toEqual({
      ok: false,
      reason: 'in_use',
      // The whole work package's assignments, so the caller can work out whose
      // assumed assignee moves — the `Dev` row is not there because nobody
      // holds it, and this is what the reading is made from.
      usage: {
        estimates: 1,
        // Nothing recorded against this step, and the count travels anyway: a
        // refusal that reported only estimates would be silent about the one
        // number nobody can retype from memory.
        actuals: 0,
        progress: 0,
        blockages: 0,
        measures: 0,
        attempts: 0,
        claims: 0,
        assignments: [{ workItemId: 'strip', stepId: qaId, personId: ada.id }],
      },
    });
    expect(await steps.findById(qaId)).not.toBeNull();
    expect(historicalEstimates()).toHaveLength(1);
    expect(await revisionOf(workPackageId)).toBe(before);
  });

  it('reports a step that is already gone, moving nothing', async () => {
    await steps.remove(workPackageId, qaId, true, wrote());
    const after = await revisionOf(workPackageId);

    const second = await steps.remove(workPackageId, qaId, true, wrote());

    expect(second).toEqual({ ok: false, reason: 'not_found' });
    // The loser of two removals writes nothing at all, the work package's revision
    // included: it removed nothing, so nobody's read of the work package differs.
    expect(await revisionOf(workPackageId)).toBe(after);
  });

  it('reports another work package’s step as not there, and leaves it alone', async () => {
    const theirs = historicalSteps(otherWorkPackageId).at(0);
    if (theirs === undefined) throw new Error('the other work package was created without steps');
    const before = await revisionOf(workPackageId);

    const refused = await steps.remove(workPackageId, theirs.id, true, wrote());

    expect(refused).toEqual({ ok: false, reason: 'not_found' });
    expect(await steps.findById(theirs.id)).toEqual(theirs);
    expect(await revisionOf(workPackageId)).toBe(before);
  });

  it('deletes an estimate written between the count and the confirmed removal', async () => {
    db.insert(estimate)
      .values({ workItemId: 'strip', stepId: qaId, ...DAYS })
      .run();
    const counted = await steps.usageOf(workPackageId, qaId);
    expect(counted.estimates).toBe(1);

    // The race the confirmation opens: somebody estimates the doomed step on a
    // work item the counts never mentioned, between the refusal and the
    // confirmed delete. The transaction chooses what it deletes for itself, so
    // this is deleted with the rest rather than left pointing at a step that
    // has gone — which is a foreign key error, a 500, and a work package nobody can
    // read afterwards.
    db.insert(estimate)
      .values({ workItemId: 'paint', stepId: qaId, ...DAYS })
      .run();
    const paintBefore = await workItemRevisionOf('paint');

    const removed = await steps.remove(workPackageId, qaId, true, wrote());

    if (!removed.ok) throw new Error(`removal refused: ${removed.reason}`);
    expect(removed.removal.estimates).toBe(2);
    expect(historicalEstimates()).toEqual([]);
    expect(await workItemRevisionOf('paint')).toBe(paintBefore + 1);
    expect(await steps.findById(qaId)).toBeNull();
  });

  it('counts the recorded days, and refuses an unconfirmed removal of a step that holds only those', async () => {
    // The case that makes the count load-bearing rather than decorative: this
    // step has no estimate and nobody assigned, so a removal that counted only
    // those two would sail through and take the record of somebody's week with
    // it. `actual.step_id` has no cascade precisely so this cannot happen
    // quietly.
    db.insert(actual)
      .values({ workItemId: 'strip', stepId: qaId, days: 8, recordedAt: 1000 })
      .run();
    const before = await revisionOf(workPackageId);

    const counted = await steps.usageOf(workPackageId, qaId);
    const refused = await steps.remove(workPackageId, qaId, false, wrote());

    expect(counted).toEqual({
      estimates: 0,
      actuals: 1,
      progress: 0,
      blockages: 0,
      measures: 0,
      attempts: 0,
      claims: 0,
      assignments: [],
    });
    expect(refused).toEqual({
      ok: false,
      reason: 'in_use',
      usage: {
        estimates: 0,
        actuals: 1,
        progress: 0,
        blockages: 0,
        measures: 0,
        attempts: 0,
        claims: 0,
        assignments: [],
      },
    });
    expect(await steps.findById(qaId)).not.toBeNull();
    expect(historicalActuals()).toHaveLength(1);
    // A refusal writes nothing at all, the work package's revision included.
    expect(await revisionOf(workPackageId)).toBe(before);
  });

  it('counts the stated progress, and refuses an unconfirmed removal of a step that holds only that', async () => {
    // The third loss, and the one that makes this count load-bearing rather than
    // decorative: this step has no estimate, no recorded day and nobody
    // assigned, so a removal that counted only those three would sail through
    // and turn finished work back into work nobody has started.
    // `step_progress.step_id` has no cascade precisely so this cannot happen
    // quietly.
    //
    // Proof: `spoken.length > 0` dropped from the `in_use` condition, and this
    // fails with the removal proceeding against a step whose only usage is the
    // statement that its work is done; watched 2026-08-18.
    db.insert(stepProgress)
      .values({ workItemId: 'strip', stepId: qaId, state: 'done', statedAt: 1000 })
      .run();
    const before = await revisionOf(workPackageId);

    const counted = await steps.usageOf(workPackageId, qaId);
    const refused = await steps.remove(workPackageId, qaId, false, wrote());

    expect(counted).toEqual({
      estimates: 0,
      actuals: 0,
      progress: 1,
      blockages: 0,
      measures: 0,
      attempts: 0,
      claims: 0,
      assignments: [],
    });
    expect(refused).toEqual({
      ok: false,
      reason: 'in_use',
      usage: {
        estimates: 0,
        actuals: 0,
        progress: 1,
        blockages: 0,
        measures: 0,
        attempts: 0,
        claims: 0,
        assignments: [],
      },
    });
    expect(await steps.findById(qaId)).not.toBeNull();
    expect(historicalProgress()).toHaveLength(1);
    // A refusal writes nothing at all, the work package's revision included.
    expect(await revisionOf(workPackageId)).toBe(before);
  });

  it('deletes the stated progress with the step it confirmed, moving the work items that lost one', async () => {
    // The other half, and the one the missing cascade forces: without an
    // explicit delete here the step row cannot go at all — SQLite refuses it —
    // so this is what turns a 500 into a removal that says what it took.
    //
    // Proof: `tx.delete(stepProgress)` struck from `StepRepository.remove`, and
    // this fails with `SQLITE_CONSTRAINT_FOREIGNKEY` thrown out of the
    // transaction; watched 2026-08-18.
    db.insert(stepProgress)
      .values({ workItemId: 'strip', stepId: qaId, state: 'done', statedAt: 1000 })
      .run();
    db.insert(stepProgress)
      .values({ workItemId: 'sand', stepId: devId, state: 'in_progress', statedAt: 1000 })
      .run();
    const stripBefore = await workItemRevisionOf('strip');

    const removed = await steps.remove(workPackageId, qaId, true, wrote());

    expect(removed).toEqual({
      ok: true,
      removal: {
        estimates: 0,
        actuals: 0,
        progress: 1,
        blockages: 0,
        measures: 0,
        attempts: 0,
        claims: 0,
        assignments: 0,
        workItemIds: ['strip'],
      },
    });
    expect(await steps.findById(qaId)).toBeNull();
    // The other step's row on another work item survives, which is what makes
    // the delete's `WHERE` provable.
    expect(historicalProgress()).toEqual([
      { workItemId: 'sand', stepId: devId, state: 'in_progress', statedAt: 1000 },
    ]);
    expect(await workItemRevisionOf('strip')).toBe(stripBefore + 1);
  });

  /**
   * Proof: the holdings' `attempts` written as `0` made the unconfirmed
   * removal go through (`toEqual` failed, `- Expected - 4 / + Received + 6`);
   * with `tx.delete(stepNodeAttempt)` struck the confirmed one threw
   * `SQLiteError: FOREIGN KEY constraint failed`; watched 2026-10-12.
   */
  it('counts the attempts, refusing an unconfirmed removal of a step holding only those, and a confirmed one deletes them', async () => {
    const node = { workItemId: 'strip', stepId: qaId, executorPersonId: null, note: null };
    await attempts.start({ ...node, startedAt: 100, reference: 'PR #1' }, wrote());
    await attempts.end(
      { workItemId: 'strip', stepId: qaId, endedAt: 110, outcome: 'failed' },
      wrote(),
    );
    await attempts.start({ ...node, startedAt: 120, reference: null }, wrote());
    const before = await revisionOf(workPackageId);

    const counted = await steps.usageOf(workPackageId, qaId);
    const refused = await steps.remove(workPackageId, qaId, false, wrote());

    const usage = {
      estimates: 0,
      actuals: 0,
      progress: 0,
      blockages: 0,
      measures: 0,
      attempts: 2,
      claims: 0,
    };
    expect(counted).toEqual({ ...usage, assignments: [] });
    expect(refused).toEqual({ ok: false, reason: 'in_use', usage: { ...usage, assignments: [] } });
    expect(await steps.findById(qaId)).not.toBeNull();
    expect(await revisionOf(workPackageId)).toBe(before);

    const stripBefore = await workItemRevisionOf('strip');
    const removed = await steps.remove(workPackageId, qaId, true, wrote());

    expect(removed).toEqual({
      ok: true,
      removal: { ...usage, assignments: 0, workItemIds: ['strip'] },
    });
    expect(await steps.findById(qaId)).toBeNull();
    expect(rawDb.query('SELECT * FROM step_node_attempt').all()).toEqual([]);
    expect(await workItemRevisionOf('strip')).toBe(stripBefore + 1);
  });

  it('counts the claims, refusing an unconfirmed removal of a claimed step, and a confirmed one releases them', async () => {
    await directory.addPerson({ id: 'claire', name: 'claire', kind: 'agent' }, [], wrote());
    const held = {
      id: 'claim-qa',
      workItemId: 'strip',
      stepId: qaId,
      personId: 'claire',
      runId: null,
      parentClaimId: null,
      accountId: ownerId,
    };
    expect(await claims.add([held], [], wrote(), [])).toBe('written');
    const usage = {
      estimates: 0,
      actuals: 0,
      progress: 0,
      blockages: 0,
      measures: 0,
      attempts: 0,
      claims: 1,
    };
    expect(await steps.usageOf(workPackageId, qaId)).toEqual({ ...usage, assignments: [] });
    expect(await steps.remove(workPackageId, qaId, false, wrote())).toEqual({
      ok: false,
      reason: 'in_use',
      usage: { ...usage, assignments: [] },
    });
    expect(await claims.listByWorkPackage(workPackageId)).toEqual([held]);
    expect(await steps.remove(workPackageId, qaId, true, wrote())).toEqual({
      ok: true,
      removal: { ...usage, assignments: 0, workItemIds: ['strip'] },
    });
    expect(await claims.listByWorkPackage(workPackageId)).toEqual([]);
  });

  it('counts the figures that are not days, and refuses an unconfirmed removal of a step that holds only those', async () => {
    // The fourth loss. This step has no estimate, no recorded day, no stated
    // progress and nobody assigned, so a removal that counted only those four
    // would sail through and delete what an agent's work on this plan cost —
    // the figures nobody typed and nobody can retype. `step_measure.step_id`
    // has no cascade precisely so this cannot happen quietly.
    //
    // **Two rows on one pair, and the count is 2.** A count of pairs would say
    // "1 figure" for two statements made on two different days in two different
    // units, and a person consenting to that number would be consenting to less
    // than goes.
    db.insert(stepMeasure)
      .values({
        workItemId: 'strip',
        stepId: qaId,
        metric: 'token_actual',
        value: 12_000,
        recordedAt: 1000,
      })
      .run();
    db.insert(stepMeasure)
      .values({
        workItemId: 'strip',
        stepId: qaId,
        metric: 'hours_actual',
        value: 3,
        recordedAt: 2000,
      })
      .run();
    const before = await revisionOf(workPackageId);

    const counted = await steps.usageOf(workPackageId, qaId);
    const refused = await steps.remove(workPackageId, qaId, false, wrote());

    expect(counted).toEqual({
      estimates: 0,
      actuals: 0,
      progress: 0,
      blockages: 0,
      measures: 2,
      attempts: 0,
      claims: 0,
      assignments: [],
    });
    expect(refused).toEqual({
      ok: false,
      reason: 'in_use',
      usage: {
        estimates: 0,
        actuals: 0,
        progress: 0,
        blockages: 0,
        measures: 2,
        attempts: 0,
        claims: 0,
        assignments: [],
      },
    });
    expect(await steps.findById(qaId)).not.toBeNull();
    expect(historicalMeasures()).toHaveLength(2);
    // A refusal writes nothing at all, the work package's revision included.
    expect(await revisionOf(workPackageId)).toBe(before);
  });

  it('deletes the figures that are not days with the step it confirmed, moving the work items that lost one', async () => {
    // The other half, and the one the missing cascade forces: without an
    // explicit delete here the step row cannot go at all — SQLite refuses it —
    // so this is what turns a 500 into a removal that says what it took.
    //
    // Two work items, so `workItemIds` is a set of the items that lost a row
    // rather than a count of rows: `strip` holds two of this step's figures and
    // appears once.
    db.insert(stepMeasure)
      .values({
        workItemId: 'strip',
        stepId: qaId,
        metric: 'token_estimate',
        value: 8000,
        recordedAt: 1000,
      })
      .run();
    db.insert(stepMeasure)
      .values({
        workItemId: 'strip',
        stepId: qaId,
        metric: 'token_actual',
        value: 9500,
        recordedAt: 1000,
      })
      .run();
    db.insert(stepMeasure)
      .values({
        workItemId: 'sand',
        stepId: devId,
        metric: 'hours_actual',
        value: 2,
        recordedAt: 1000,
      })
      .run();
    const stripBefore = await workItemRevisionOf('strip');

    const removed = await steps.remove(workPackageId, qaId, true, wrote());

    expect(removed).toEqual({
      ok: true,
      removal: {
        estimates: 0,
        actuals: 0,
        progress: 0,
        blockages: 0,
        measures: 2,
        attempts: 0,
        claims: 0,
        assignments: 0,
        workItemIds: ['strip'],
      },
    });
    expect(await steps.findById(qaId)).toBeNull();
    // The other step's figure on another work item survives, which is what
    // makes the delete's `WHERE` provable.
    expect(historicalMeasures()).toEqual([
      { workItemId: 'sand', stepId: devId, metric: 'hours_actual', value: 2, recordedAt: 1000 },
    ]);
    expect(await workItemRevisionOf('strip')).toBe(stripBefore + 1);
  });

  // Proof: with the trio count left out of the transaction's `measured`,
  // this case removed the step unconfirmed; watched 2026-10-23.
  it('refuses removing a step holding only a three-point trio, and takes it with a confirmed cascade', async () => {
    // A three-point tokens trio has no legacy row (`wbs-measure-budgets`
    // design D28), so it is counted from `measure_estimate`; a single-point
    // one is its legacy row and counts once.
    db.insert(measureEstimate)
      .values({ workItemId: 'strip', stepId: qaId, measureKey: 'tokens', ...DAYS })
      .run();
    const usage = {
      estimates: 0,
      actuals: 0,
      progress: 0,
      blockages: 0,
      measures: 1,
      attempts: 0,
      claims: 0,
      assignments: [],
    };
    expect(await steps.usageOf(workPackageId, qaId)).toEqual(usage);
    expect(await steps.remove(workPackageId, qaId, false, wrote())).toEqual({
      ok: false,
      reason: 'in_use',
      usage,
    });
    db.insert(stepMeasure)
      .values({
        workItemId: 'sand',
        stepId: qaId,
        metric: 'token_estimate',
        value: 7,
        recordedAt: 1,
      })
      .run();
    expect((await steps.usageOf(workPackageId, qaId)).measures).toBe(2);
    expect(await steps.remove(workPackageId, qaId, true, wrote())).toEqual({
      ok: true,
      removal: {
        estimates: 0,
        actuals: 0,
        progress: 0,
        blockages: 0,
        measures: 2,
        attempts: 0,
        claims: 0,
        assignments: 0,
        workItemIds: ['sand', 'strip'],
      },
    });
    expect(rawDb.query('SELECT * FROM measure_estimate').all()).toEqual([]);
    expect(historicalMeasures()).toEqual([]);
  });

  it('deletes the recorded days with the step it confirmed, moving the work items that lost one', async () => {
    // The other half, and the one the missing cascade forces: without an
    // explicit delete here the step row cannot go at all — SQLite refuses it —
    // so this is what turns a 500 into a removal that says what it took.
    db.insert(actual)
      .values({ workItemId: 'strip', stepId: qaId, days: 8, recordedAt: 1000 })
      .run();
    db.insert(actual)
      .values({ workItemId: 'sand', stepId: devId, days: 2, recordedAt: 1000 })
      .run();
    const stripBefore = await workItemRevisionOf('strip');

    const removed = await steps.remove(workPackageId, qaId, true, wrote());

    expect(removed).toEqual({
      ok: true,
      removal: {
        estimates: 0,
        actuals: 1,
        progress: 0,
        blockages: 0,
        measures: 0,
        attempts: 0,
        claims: 0,
        assignments: 0,
        workItemIds: ['strip'],
      },
    });
    expect(await steps.findById(qaId)).toBeNull();
    // The other step's row on another work item survives, which is what makes
    // the delete's `WHERE` provable.
    expect(historicalActuals()).toEqual([
      { workItemId: 'sand', stepId: devId, days: 2, recordedAt: 1000 },
    ]);
    expect(await workItemRevisionOf('strip')).toBe(stripBefore + 1);
  });

  it('publishes exactly the Step columns from add, find and rename', async () => {
    const written = await steps.add(
      {
        id: 'design',
        workPackageId,
        name: 'Design',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
      wrote(),
    );
    if (!written.ok) throw new Error(`add refused: ${written.reason}`);

    const found = await steps.findById('design');
    const renamed = await steps.rename(workPackageId, 'design', 'Drafting', wrote());
    if (!renamed.ok) throw new Error(`rename refused: ${renamed.reason}`);
    expect(Object.keys(written.step).sort()).toEqual(STEP_KEYS);
    expect(Object.keys(found ?? {}).sort()).toEqual(STEP_KEYS);
    expect(Object.keys(renamed.step).sort()).toEqual(STEP_KEYS);
  });
  it('reads and writes a step estimate unit', async () => {
    const added = await steps.add(
      {
        id: 'minute-step',
        workPackageId,
        name: 'Agent',
        allowancePercent: 0,
        estimateUnit: 'minutes',
      },
      wrote(),
    );
    expect(added).toMatchObject({ ok: true, step: { estimateUnit: 'minutes' } });
    expect(await steps.findById('minute-step')).toMatchObject({ estimateUnit: 'minutes' });
  });
});

/** Exact public projection. Historical proof: replacing STEP_COLUMNS with a bare select leaked three audit columns. */
const STEP_KEYS = [
  'id',
  'workPackageId',
  'name',
  'position',
  'code',
  'allowancePercent',
  'estimateUnit',
].sort();

describe('current catalogue step reads', () => {
  beforeEach(seedCurrentSteps);

  it('reads a step added later last, however its name sorts', async () => {
    await bindStep('analysis', 'Analysis', 30);
    expect((await steps.listByWorkPackage(workPackageId)).map((each) => each.name)).toEqual([
      'Dev',
      'QA',
      'Analysis',
    ]);
  });

  it('reads the same order through the work package, which is where the schedule asks', async () => {
    await bindStep('analysis', 'Analysis', 30);
    expect((await workPackages.stepsOf(workPackageId)).map((each) => each.name)).toEqual([
      'Dev',
      'QA',
      'Analysis',
    ]);
  });

  it('publishes exactly the Step columns from both catalogue readers', async () => {
    const listed = (await steps.listByWorkPackage(workPackageId)).find((each) => each.id === qaId);
    const throughWorkPackage = (await workPackages.stepsOf(workPackageId)).find(
      (each) => each.id === qaId,
    );
    expect(Object.keys(listed ?? {}).sort()).toEqual(STEP_KEYS);
    expect(Object.keys(throughWorkPackage ?? {}).sort()).toEqual(STEP_KEYS);
  });
});

describe('WorkPackageRepository.setStepAllowance', () => {
  beforeEach(seedCurrentSteps);
  it('writes the allowance, answers the one it replaced and moves the work package', async () => {
    const before = await revisionOf(workPackageId);

    const written = await workPackages.setStepAllowance(workPackageId, qaId, 12.34, wrote());

    expect(written).toEqual({
      ok: true,
      step: {
        id: qaId,
        workPackageId,
        name: 'QA',
        position: 20,
        code: 'qa',
        allowancePercent: 12.34,
        estimateUnit: 'workdays' as const,
      },
      previousPercent: 0,
      revision: 1,
    });
    expect(
      (await steps.listByWorkPackage(workPackageId)).find((each) => each.id === qaId)
        ?.allowancePercent,
    ).toBe(12.34);
    expect(await revisionOf(workPackageId)).toBe(before + 1);
  });

  it('stores whole hundredths of a percent', async () => {
    await workPackages.setStepAllowance(workPackageId, qaId, 12.34, wrote());
    const sqlite = openDatabase(join(dir, 'test.db'));
    try {
      const stored = sqlite
        .query<{ allowance_bps: number }, [string, string]>(
          'SELECT allowance_bps FROM work_package_step WHERE work_package_id = ? AND step_id = ?',
        )
        .get(workPackageId, qaId);
      expect(stored).toEqual({ allowance_bps: 1234 });
    } finally {
      sqlite.close();
    }
  });

  /** Proof: see `WorkPackageRepository.setStepAllowance`. */
  it('moves the step’s allowance revision on every write, even back to a value it held', async () => {
    expect((await workPackages.stepAllowanceRevisions(workPackageId)).get(qaId)).toBe(0);

    await workPackages.setStepAllowance(workPackageId, qaId, 50, wrote());
    const back = await workPackages.setStepAllowance(workPackageId, qaId, 0, wrote());

    expect(back).toMatchObject({ ok: true, previousPercent: 50, revision: 2 });
    expect((await workPackages.stepAllowanceRevisions(workPackageId)).get(qaId)).toBe(2);
    expect((await workPackages.stepAllowanceRevisions(workPackageId)).get(devId)).toBe(0);
  });

  it('refuses a step of another work package, and a step that is gone', async () => {
    expect(await workPackages.setStepAllowance(otherWorkPackageId, qaId, 30, wrote())).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await workPackages.setStepAllowance(workPackageId, 'gone', 30, wrote())).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('refuses to store an allowance no boundary would have admitted', async () => {
    let refused: unknown = null;
    try {
      await workPackages.setStepAllowance(workPackageId, qaId, 12.345, wrote());
    } catch (cause) {
      refused = cause;
    }
    expect(String(refused)).toContain('not a storable step allowance');
    // The column's own CHECK, below the converter: a raw write out of range fails.
    const sqlite = openDatabase(join(dir, 'test.db'));
    try {
      expect(() =>
        sqlite.run(
          'UPDATE work_package_step SET allowance_bps = 100001 WHERE work_package_id = ? AND step_id = ?',
          [workPackageId, qaId],
        ),
      ).toThrow('CHECK constraint failed');
    } finally {
      sqlite.close();
    }
  });
});

it('names an absent estimate-count row before changing a unit', () => {
  let reads = 0;
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          get: () =>
            reads++ === 0
              ? { id: 'dev', workPackageId: 'package', estimateUnit: 'workdays' }
              : undefined,
        }),
      }),
    }),
  };
  const broken = { transaction: (act: (transaction: typeof tx) => unknown) => act(tx) };
  const repository = new StepRepository(
    broken as unknown as ConstructorParameters<typeof StepRepository>[0],
    OPEN,
  );
  expect(repository.patchUnit('package', 'dev', 'minutes', wrote())).rejects.toThrow(
    'estimate count returned no row',
  );
});
