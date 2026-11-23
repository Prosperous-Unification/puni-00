import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import { type Drizzle, openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import {
  beginOptimizationDrain,
  finishOptimizationDrain,
  readOptimizationClosedState,
  reconcileOptimizationDrains,
  releaseSolverSlot,
} from './optimization-drain';
import { allocateGeneration, readGeneration } from './optimization-generation';
import {
  optimizationGeneration,
  optimizedScheduleCache,
  solverQueue,
  solverSlot,
  workPackage,
} from './schema';
import { StepCatalogueRepository } from './step-catalogue';
import {
  type CatalogueFixtureCustody,
  migrateEmptyCatalogueFixture,
} from './testing/catalogue-database';

/** The two releases running against one file during a swap. */
const BLUE = '7+1.0.0';
const GREEN = '8+1.0.0';

const stampAt = (at: number): WriteStamp => ({ at, by: 'u-1' });

let dir: string;
let path: string;
let db: Drizzle;
let custody: CatalogueFixtureCustody;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-optimization-drain-'));
  path = join(dir, 'test.db');
  custody = { hasUnknownOwner: false };
  migrateEmptyCatalogueFixture({ path, directory: dir, reportedAt: 1 }, custody);
  const seed = openDatabase(path);
  try {
    seed.run(
      `INSERT INTO users (id, username, password_hash, created_at) VALUES ('u-1', 'u', 'h', 1)`,
    );
    seed.run("INSERT INTO organization(id,name,created_at) VALUES('org','Org',1)");
    seed.run(
      "INSERT INTO project(id,organization_id,name,created_at) VALUES('parent','org','Parent',1)",
    );
    seed.run(
      `INSERT INTO work_package (id, name, project_id, created_by, restricted, revision, created_at)
       VALUES ('p-1', 'Rewire the shed', 'parent', 'u-1', 0, 0, 1)`,
    );
    // The bystander. Deleting one work package closes every release of THAT work package,
    // which is only a meaningful claim beside a work package it must not touch.
    seed.run(
      `INSERT INTO work_package (id, name, project_id, created_by, restricted, revision, created_at)
       VALUES ('p-2', 'Re-tile the roof', 'parent', 'u-1', 0, 0, 1)`,
    );
    seed.run(
      "INSERT INTO work_package_organization(resource_id,organization_id) VALUES('p-1','org'),('p-2','org')",
    );
  } finally {
    seed.close();
  }
  db = openDrizzle(path);
  expect(
    (
      await new StepCatalogueRepository(db, OPEN, 'owned').defineAndBindStep(
        'org',
        {
          id: 's-1',
          code: 'work',
          name: 'Work',
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 0,
          position: 10,
        },
        {
          bindingId: 'work-binding',
          scopeKind: 'organization',
          scopeId: 'org',
          workItemTypeId: null,
          position: 10,
        },
        stampAt(1),
      )
    ).ok,
  ).toBe(true);
});

afterEach(() => {
  // Proof: real helper close returned before an injected lost-close-authority throw.
  // Removing this guard deleted the fixture namespace and lost its required diagnostic;
  // exact restoration retained both (drain custody controls, v322). No FD-leak claim.
  if (custody.hasUnknownOwner)
    throw new Error('SQLite fixture has unknown native custody; retained ' + dir);
  rmSync(dir, { recursive: true, force: true });
});

function seedQueue(contractVersion: string, generation: number, workPackageId = 'p-1'): void {
  db.insert(solverQueue)
    .values({
      workPackageId,
      contractVersion,
      objective: 'time',
      budgetMs: 60000,
      generation,
      admittedCancelEpoch: 0,
      enqueuedAt: 1,
    })
    .run();
}

function seedSlot(
  contractVersion: string,
  objective: 'pri' | 'time',
  cancelRequestedAt: number | null,
  workPackageId = 'p-1',
  admittedDeadlineAt = 61000,
): void {
  db.insert(solverSlot)
    .values({
      workPackageId,
      contractVersion,
      generation: 1,
      objective,
      budgetMs: 60000,
      ownerId: 'own-1',
      attemptToken: `tok-${workPackageId}-${contractVersion}-${objective}`,
      lifecycle: 'running',
      pid: 4242,
      startedAt: 1,
      heartbeatAt: 1,
      cancelRequestedAt,
      admittedDeadlineAt,
    })
    .run();
}

/** Every stored slot as `contractVersion/objective/cancelRequestedAt`. */
function slotRows(): string[] {
  return db
    .select()
    .from(solverSlot)
    .all()
    .map((row) => `${row.contractVersion}/${row.objective}/${String(row.cancelRequestedAt)}`)
    .sort();
}

function queueRows(): string[] {
  return db
    .select()
    .from(solverQueue)
    .all()
    .map((row) => `${row.contractVersion}/${String(row.generation)}`)
    .sort();
}

/**
 * The same two views with the work package id in front.
 *
 * The retirement cases above seed one work package and read the table bare, which
 * says everything they are about. A deletion is a claim about which work package's
 * rows moved, so its cases need the id in the value they compare.
 */
function slotRowsByWorkPackage(): string[] {
  return db
    .select()
    .from(solverSlot)
    .all()
    .map(
      (row) =>
        `${row.workPackageId}/${row.contractVersion}/${row.objective}/${String(row.cancelRequestedAt)}`,
    )
    .sort();
}

function queueRowsByWorkPackage(): string[] {
  return db
    .select()
    .from(solverQueue)
    .all()
    .map((row) => `${row.workPackageId}/${row.contractVersion}`)
    .sort();
}

/** `workPackageId/admissionState/cancelEpoch` for every generation row on file. */
function generationRows(): string[] {
  return db
    .select()
    .from(optimizationGeneration)
    .all()
    .map(
      (row) =>
        `${row.workPackageId}/${row.contractVersion}/${row.admissionState}/${String(row.cancelEpoch)}`,
    )
    .sort();
}

function deletePendingAt(workPackageId: string): number | null {
  const row = db.select().from(workPackage).where(eq(workPackage.id, workPackageId)).get();
  return row?.optimizationDeletePendingAt ?? null;
}

function seedCache(contractVersion: string, workPackageId = 'p-1'): void {
  db.insert(optimizedScheduleCache)
    .values({
      workPackageId,
      inputHash: 'h1',
      objective: 'pri',
      contractVersion,
      budgetMs: 60000,
      generation: 1,
      status: 'ok',
      resultJson: '{}',
      failureReason: null,
      createdAt: 1,
    })
    .run();
}

function cacheRows(): string[] {
  return db
    .select()
    .from(optimizedScheduleCache)
    .all()
    .map((row) => `${row.workPackageId}/${row.contractVersion}`)
    .sort();
}

function workPackageIds(): string[] {
  return db
    .select()
    .from(workPackage)
    .all()
    .map((row) => row.id)
    .sort();
}

describe('beginning a contract retirement', () => {
  it('closes admission and advances the cancel epoch of that release alone', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    allocateGeneration(db, 'p-1', GREEN, 'h1', 10);

    beginOptimizationDrain(db, 'p-1', stampAt(20), BLUE);

    const blue = readGeneration(db, 'p-1', BLUE);
    expect(blue?.admissionState).toBe('draining');
    expect(blue?.cancelEpoch).toBe(1);
    // Retiring blue is not a statement about green, which is the release that
    // is still serving readers through the swap.
    const green = readGeneration(db, 'p-1', GREEN);
    expect(green?.admissionState).toBe('open');
    expect(green?.cancelEpoch).toBe(0);
  });

  it('stamps the retired release’s live slots and leaves the other release’s alone', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    allocateGeneration(db, 'p-1', GREEN, 'h1', 10);
    seedSlot(BLUE, 'pri', null);
    seedSlot(GREEN, 'pri', null);

    beginOptimizationDrain(db, 'p-1', stampAt(20), BLUE);

    expect(slotRows()).toEqual([`${BLUE}/pri/20`, `${GREEN}/pri/null`]);
  });

  it('leaves the slot rows counted and undeleted, whatever it asked of them', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    seedSlot(BLUE, 'pri', null);
    seedSlot(BLUE, 'time', null);

    // Freeing the capacity before the children are proved dead is what let six
    // real processes run while SQLite counted two. Begin asks; it never reaps.
    expect(beginOptimizationDrain(db, 'p-1', stampAt(20), BLUE)).toBe(2);
    expect(slotRows()).toEqual([`${BLUE}/pri/20`, `${BLUE}/time/20`]);
  });

  it('deletes the retired release’s queued work and not the other release’s', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    allocateGeneration(db, 'p-1', GREEN, 'h1', 10);
    seedQueue(BLUE, 1);
    seedQueue(GREEN, 1);

    beginOptimizationDrain(db, 'p-1', stampAt(20), BLUE);

    // A queue row is unstarted work with no process behind it, so removing it
    // frees nothing early — the asymmetry with the slot rows is the point.
    expect(queueRows()).toEqual([`${GREEN}/1`]);
  });

  it('keeps the instant a cancellation was first requested when it runs again', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    seedSlot(BLUE, 'pri', null);
    beginOptimizationDrain(db, 'p-1', stampAt(20), BLUE);

    beginOptimizationDrain(db, 'p-1', stampAt(30), BLUE);

    // The reconciler re-runs this every 60 s. Re-stamping would push the
    // request instant forward for ever, and that instant is what a reader uses
    // to judge whether a child is ignoring the request.
    expect(slotRows()).toEqual([`${BLUE}/pri/20`]);
  });

  it('is a no-op on a release that never allocated, rather than creating it', () => {
    expect(beginOptimizationDrain(db, 'p-1', stampAt(20), BLUE)).toBe(0);

    // Draining a release that never allocated must not create the row it is
    // trying to retire.
    expect(readGeneration(db, 'p-1', BLUE)).toBeNull();
  });
});

describe('beginning a work package deletion', () => {
  it('writes the durable marker and closes every release of that work package', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    allocateGeneration(db, 'p-1', GREEN, 'h1', 10);
    allocateGeneration(db, 'p-2', BLUE, 'h1', 10);

    beginOptimizationDrain(db, 'p-1', stampAt(20));

    // Retirement names one release because the other is still serving readers.
    // A deletion has no such other: every release of this work package is going.
    expect(deletePendingAt('p-1')).toBe(20);
    expect(generationRows()).toEqual([
      `p-1/${BLUE}/draining/1`,
      `p-1/${GREEN}/draining/1`,
      `p-2/${BLUE}/open/0`,
    ]);
    expect(deletePendingAt('p-2')).toBeNull();
  });

  it('leaves the physical work package row in place while its children still run', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    allocateGeneration(db, 'p-1', GREEN, 'h1', 10);
    seedSlot(BLUE, 'pri', null);
    seedSlot(GREEN, 'time', null);

    // The row survives its own deletion's phase 1 for the same reason a slot row
    // survives a retirement: the slots reference it, and their capacity
    // accounting has to stay alive while the children it counts are running.
    // Taking the row here is the immediate cascade that let six real processes
    // run while SQLite counted two.
    expect(beginOptimizationDrain(db, 'p-1', stampAt(20))).toBe(2);
    expect(db.select().from(workPackage).where(eq(workPackage.id, 'p-1')).get()).toBeDefined();
    expect(slotRowsByWorkPackage()).toEqual([`p-1/${BLUE}/pri/20`, `p-1/${GREEN}/time/20`]);
  });

  it('stamps and deletes across every release of that work package and no other', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    allocateGeneration(db, 'p-1', GREEN, 'h1', 10);
    allocateGeneration(db, 'p-2', BLUE, 'h1', 10);
    seedSlot(BLUE, 'pri', null);
    seedSlot(GREEN, 'pri', null);
    seedSlot(BLUE, 'pri', null, 'p-2');
    seedQueue(BLUE, 1);
    seedQueue(GREEN, 1);
    seedQueue(BLUE, 1, 'p-2');

    beginOptimizationDrain(db, 'p-1', stampAt(20));

    expect(slotRowsByWorkPackage()).toEqual([
      `p-1/${BLUE}/pri/20`,
      `p-1/${GREEN}/pri/20`,
      `p-2/${BLUE}/pri/null`,
    ]);
    expect(queueRowsByWorkPackage()).toEqual([`p-2/${BLUE}`]);
  });

  it('keeps the instant the deletion was first requested when it runs again', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    beginOptimizationDrain(db, 'p-1', stampAt(20));

    beginOptimizationDrain(db, 'p-1', stampAt(30));

    // Same rule as the slot stamp, on the marker this time. A reader asking how
    // long this drain has been stuck needs when it started, not when something
    // last asked it to start.
    expect(deletePendingAt('p-1')).toBe(20);
  });

  it('fences a work package that has never solved', () => {
    // No generation row, because nothing ever allocated one. The marker is still
    // owed: a work package deleted before its first solve must be closed to admission
    // exactly like one deleted mid-solve, or the delete races the first solve.
    expect(beginOptimizationDrain(db, 'p-1', stampAt(20))).toBe(0);

    expect(deletePendingAt('p-1')).toBe(20);
    expect(generationRows()).toEqual([]);
  });

  it('is a no-op on a work package that is not there', () => {
    expect(beginOptimizationDrain(db, 'ghost', stampAt(20))).toBe(0);

    // A contract case rather than a mutation-proved one, and it says so: no
    // guard makes this true, the four statements simply match no row. It is here
    // because a future upsert on any of them would break it.
    expect(deletePendingAt('p-1')).toBeNull();
    expect(deletePendingAt('p-2')).toBeNull();
    expect(generationRows()).toEqual([]);
  });
});

describe('finishing a contract retirement', () => {
  it('deletes the drained generation and that release’s cache, and no other’s', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    allocateGeneration(db, 'p-1', GREEN, 'h1', 10);
    seedCache(BLUE);
    seedCache(GREEN);
    beginOptimizationDrain(db, 'p-1', stampAt(20), BLUE);

    // 6.9c-d: the phase-1 draining marker authorizes phase-2 eviction. There
    // is no worker attempt token once the release has no counted slots.
    expect(generationRows()).toContain(`p-1/${BLUE}/draining/1`);
    expect(finishOptimizationDrain(db, 'p-1', BLUE)).toBe('finished');

    expect(generationRows()).toEqual([`p-1/${GREEN}/open/0`]);
    // A-1: nothing references the generation row, so retirement has no cascade
    // and takes the retired release's cache rows itself. They can never be read
    // again — the cache key carries the contract version — and 4.1b's retention
    // bound is stated per LIVE contract version, so left alone they accumulate
    // one release at a time for ever.
    expect(cacheRows()).toEqual([`p-1/${GREEN}`]);
    // Watched red: suppress either token-free phase-2 delete and this retired
    // release's generation or cache row remains observable above.
  });

  it('waits while a slot of that release is still counted, and deletes nothing', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    seedCache(BLUE);
    seedSlot(BLUE, 'pri', null);
    beginOptimizationDrain(db, 'p-1', stampAt(20), BLUE);

    expect(finishOptimizationDrain(db, 'p-1', BLUE)).toBe('waiting');

    expect(generationRows()).toEqual([`p-1/${BLUE}/draining/1`]);
    expect(cacheRows()).toEqual([`p-1/${BLUE}`]);
  });

  it('refuses a release nobody drained, however few slots it has', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    seedCache(BLUE);

    // Zero slots is the ordinary state of an idle release. Deleting on that
    // observation alone would retire a live contract version the moment anybody
    // called finish, which is why the closed state is read too.
    expect(finishOptimizationDrain(db, 'p-1', BLUE)).toBe('open');

    expect(generationRows()).toEqual([`p-1/${BLUE}/open/0`]);
    expect(cacheRows()).toEqual([`p-1/${BLUE}`]);
  });

  it('is a no-op on a release already finished by whoever won the race', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    beginOptimizationDrain(db, 'p-1', stampAt(20), BLUE);
    expect(finishOptimizationDrain(db, 'p-1', BLUE)).toBe('finished');

    // The initiator, every slot release and the reconciler all call this. Most
    // calls are expected to find the work already done.
    expect(finishOptimizationDrain(db, 'p-1', BLUE)).toBe('absent');
  });
});

describe('finishing a work package deletion', () => {
  it('deletes the work package and lets the cascade take everything under it', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    allocateGeneration(db, 'p-1', GREEN, 'h1', 10);
    allocateGeneration(db, 'p-2', BLUE, 'h1', 10);
    seedCache(BLUE);
    seedCache(BLUE, 'p-2');
    seedQueue(BLUE, 1, 'p-2');
    beginOptimizationDrain(db, 'p-1', stampAt(20));

    expect(finishOptimizationDrain(db, 'p-1')).toBe('finished');

    // Here the cascade IS the mechanism, because every optimizer table
    // references `workPackage` with `ON DELETE CASCADE`.
    expect(workPackageIds()).toEqual(['p-2']);
    expect(generationRows()).toEqual([`p-2/${BLUE}/open/0`]);
    expect(cacheRows()).toEqual([`p-2/${BLUE}`]);
    expect(queueRowsByWorkPackage()).toEqual([`p-2/${BLUE}`]);
  });

  it('waits while any of the work package’s slots is still counted', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    allocateGeneration(db, 'p-1', GREEN, 'h1', 10);
    seedSlot(GREEN, 'time', null);
    beginOptimizationDrain(db, 'p-1', stampAt(20));

    // A work package's outstanding count spans every release it has, so a green
    // child keeps a deletion waiting even with blue empty.
    expect(finishOptimizationDrain(db, 'p-1')).toBe('waiting');

    expect(workPackageIds()).toEqual(['p-1', 'p-2']);
    expect(slotRowsByWorkPackage()).toEqual([`p-1/${GREEN}/time/20`]);
  });

  it('keeps a populated work package graph intact while a child remains counted', () => {
    const seed = openDatabase(path);
    try {
      seed.run(
        "INSERT INTO work_item (id, work_package_id, position, name) VALUES ('w-1', 'p-1', 10, 'Work')",
      );
      seed.run(
        "INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES ('w-1', 's-1', 1, 1, 1)",
      );
    } finally {
      seed.close();
    }
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    seedSlot(BLUE, 'time', null);
    expect(beginOptimizationDrain(db, 'p-1', stampAt(20))).toBe(1);

    expect(finishOptimizationDrain(db, 'p-1')).toBe('waiting');
    const inspect = openDatabase(path);
    try {
      for (const [table, column, id] of [
        ['work_package', 'id', 'p-1'],
        ['step_definition', 'id', 's-1'],
        ['work_item', 'id', 'w-1'],
        ['estimate', 'work_item_id', 'w-1'],
      ]) {
        expect(inspect.query(`SELECT * FROM ${table} WHERE ${column} = ?`).all(id)).toHaveLength(1);
      }
      expect(inspect.query('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      inspect.close();
    }
  });

  it('refuses a cross-work-package dependency instead of cascading another work package’s edge', () => {
    const seed = openDatabase(path);
    try {
      seed.run(
        "INSERT INTO work_item (id, work_package_id, position, name) VALUES ('w-1', 'p-1', 10, 'A')",
      );
      seed.run(
        "INSERT INTO work_item (id, work_package_id, position, name) VALUES ('w-2', 'p-2', 10, 'B')",
      );
      seed.run(
        "INSERT INTO dependency (id, work_package_id, predecessor_id, successor_id) VALUES ('foreign-edge', 'p-2', 'w-1', 'w-2')",
      );
    } finally {
      seed.close();
    }
    beginOptimizationDrain(db, 'p-1', stampAt(20));
    const inspect = openDatabase(path);
    try {
      const before = {
        workPackages: inspect.query('SELECT * FROM work_package ORDER BY id').all(),
        workItems: inspect.query('SELECT * FROM work_item ORDER BY id').all(),
        dependencies: inspect.query('SELECT * FROM dependency ORDER BY id').all(),
      };
      expect(() => finishOptimizationDrain(db, 'p-1')).toThrow('cross-work-package');
      expect({
        workPackages: inspect.query('SELECT * FROM work_package ORDER BY id').all(),
        workItems: inspect.query('SELECT * FROM work_item ORDER BY id').all(),
        dependencies: inspect.query('SELECT * FROM dependency ORDER BY id').all(),
      }).toEqual(before);
      expect(inspect.query('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      inspect.close();
    }
  });

  it('refuses a cross-work-package typed dependency instead of cascading another work package’s edge', () => {
    const seed = openDatabase(path);
    try {
      seed.run(
        "INSERT INTO work_item (id, work_package_id, position, name) VALUES ('w-1', 'p-1', 10, 'A')",
      );
      seed.run(
        "INSERT INTO work_item (id, work_package_id, position, name) VALUES ('w-2', 'p-2', 10, 'B')",
      );
      seed.run(
        "INSERT INTO typed_dependency (id, work_package_id, predecessor_work_item_id, predecessor_scope, successor_work_item_id, successor_scope, type) VALUES ('foreign-typed-edge', 'p-2', 'w-1', 'whole', 'w-2', 'whole', 'FS')",
      );
    } finally {
      seed.close();
    }
    beginOptimizationDrain(db, 'p-1', stampAt(20));
    const inspect = openDatabase(path);
    try {
      const before = {
        workPackages: inspect.query('SELECT * FROM work_package ORDER BY id').all(),
        workItems: inspect.query('SELECT * FROM work_item ORDER BY id').all(),
        dependencies: inspect.query('SELECT * FROM typed_dependency ORDER BY id').all(),
      };
      expect(() => finishOptimizationDrain(db, 'p-1')).toThrow('cross-work-package');
      expect({
        workPackages: inspect.query('SELECT * FROM work_package ORDER BY id').all(),
        workItems: inspect.query('SELECT * FROM work_item ORDER BY id').all(),
        dependencies: inspect.query('SELECT * FROM typed_dependency ORDER BY id').all(),
      }).toEqual(before);
      expect(inspect.query('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      inspect.close();
    }
  });

  it('retains a bystander typed edge using the same shared definition', () => {
    const seed = openDatabase(path);
    try {
      seed.run(
        "INSERT INTO work_item (id, work_package_id, position, name) VALUES ('w-2', 'p-2', 10, 'B')",
      );
      seed.run(
        "INSERT INTO typed_dependency (id, work_package_id, predecessor_work_item_id, predecessor_scope, predecessor_step_id, successor_work_item_id, successor_scope, type) VALUES ('foreign-step-edge', 'p-2', 'w-2', 'node', 's-1', 'w-2', 'whole', 'FS')",
      );
    } finally {
      seed.close();
    }
    beginOptimizationDrain(db, 'p-1', stampAt(20));
    const inspect = openDatabase(path);
    try {
      const before = {
        values: inspect.query("SELECT * FROM work_package_step WHERE work_package_id='p-2'").all(),
        steps: inspect.query('SELECT * FROM step_definition ORDER BY id').all(),
        dependencies: inspect.query('SELECT * FROM typed_dependency ORDER BY id').all(),
      };
      expect(finishOptimizationDrain(db, 'p-1')).toBe('finished');
      expect(workPackageIds()).toEqual(['p-2']);
      expect({
        values: inspect.query("SELECT * FROM work_package_step WHERE work_package_id='p-2'").all(),
        steps: inspect.query('SELECT * FROM step_definition ORDER BY id').all(),
        dependencies: inspect.query('SELECT * FROM typed_dependency ORDER BY id').all(),
      }).toEqual(before);
      expect(inspect.query('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      inspect.close();
    }
  });

  for (const relation of ['dependency', 'typed_dependency'] as const) {
    it(`refuses a target-owned ${relation} whose endpoints both belong to a bystander`, () => {
      const seed = openDatabase(path);
      try {
        seed.run(
          "INSERT INTO work_item (id, work_package_id, position, name) VALUES ('w-2', 'p-2', 10, 'B')",
        );
        if (relation === 'dependency') {
          seed.run(
            "INSERT INTO dependency (id, work_package_id, predecessor_id, successor_id) VALUES ('foreign-owned-edge', 'p-1', 'w-2', 'w-2')",
          );
        } else {
          seed.run(
            "INSERT INTO typed_dependency (id, work_package_id, predecessor_work_item_id, predecessor_scope, successor_work_item_id, successor_scope, type) VALUES ('foreign-owned-typed-edge', 'p-1', 'w-2', 'whole', 'w-2', 'whole', 'FS')",
          );
        }
      } finally {
        seed.close();
      }
      beginOptimizationDrain(db, 'p-1', stampAt(20));
      const inspect = openDatabase(path);
      try {
        const before = inspect.query(`SELECT * FROM ${relation}`).all();
        expect(() => finishOptimizationDrain(db, 'p-1')).toThrow('cross-work-package');
        expect(inspect.query(`SELECT * FROM ${relation}`).all()).toEqual(before);
        expect(inspect.query("SELECT id FROM work_package WHERE id = 'p-1'").all()).toHaveLength(1);
      } finally {
        inspect.close();
      }
    });
  }

  it('lets the restrictive foreign key roll back a cross-work-package parent reference', () => {
    const seed = openDatabase(path);
    try {
      seed.run(
        "INSERT INTO work_item (id, work_package_id, position, name) VALUES ('w-1', 'p-1', 10, 'A')",
      );
      seed.run(
        "INSERT INTO work_item (id, work_package_id, parent_id, position, name) VALUES ('w-2', 'p-2', 'w-1', 10, 'B')",
      );
    } finally {
      seed.close();
    }
    beginOptimizationDrain(db, 'p-1', stampAt(20));
    const inspect = openDatabase(path);
    try {
      const before = {
        workPackages: inspect.query('SELECT * FROM work_package ORDER BY id').all(),
        workItems: inspect.query('SELECT * FROM work_item ORDER BY id').all(),
      };
      expect(() => finishOptimizationDrain(db, 'p-1')).toThrow();
      expect({
        workPackages: inspect.query('SELECT * FROM work_package ORDER BY id').all(),
        workItems: inspect.query('SELECT * FROM work_item ORDER BY id').all(),
      }).toEqual(before);
      expect(inspect.query('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      inspect.close();
    }
  });

  it('cannot store a typed endpoint naming a step that does not exist', () => {
    const seed = openDatabase(path);
    try {
      seed.run(
        "INSERT INTO work_item (id, work_package_id, position, name) VALUES ('w-1', 'p-1', 10, 'A')",
      );
      expect(() =>
        seed.run(
          "INSERT INTO typed_dependency (id, work_package_id, predecessor_work_item_id, predecessor_scope, predecessor_step_id, successor_work_item_id, successor_scope, type) VALUES ('missing-step', 'p-1', 'w-1', 'node', 'missing', 'w-1', 'whole', 'FS')",
        ),
      ).toThrow();
      expect(seed.query('SELECT * FROM typed_dependency').all()).toEqual([]);
      expect(seed.query('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      seed.close();
    }
  });

  it('rolls back an earlier estimate delete when a later populated cleanup fails', () => {
    const seed = openDatabase(path);
    try {
      seed.run(
        "INSERT INTO work_item (id, work_package_id, position, name) VALUES ('w-1', 'p-1', 10, 'Work')",
      );
      seed.run(
        "INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES ('w-1', 's-1', 1, 1, 1)",
      );
      seed.run(
        `CREATE TRIGGER fail_step_cleanup BEFORE DELETE ON work_package_step
         WHEN OLD.work_package_id = 'p-1'
           AND NOT EXISTS (SELECT 1 FROM work_item WHERE work_package_id = 'p-1')
         BEGIN SELECT RAISE(ABORT, 'later raw cleanup failed'); END`,
      );
    } finally {
      seed.close();
    }
    beginOptimizationDrain(db, 'p-1', stampAt(20));
    const inspect = openDatabase(path);
    try {
      const before = {
        workPackage: inspect.query("SELECT * FROM work_package WHERE id = 'p-1'").all(),
        step: inspect.query("SELECT * FROM work_package_step WHERE work_package_id = 'p-1'").all(),
        workItems: inspect.query("SELECT * FROM work_item WHERE work_package_id = 'p-1'").all(),
        estimates: inspect.query("SELECT * FROM estimate WHERE work_item_id = 'w-1'").all(),
      };
      expect(() => finishOptimizationDrain(db, 'p-1')).toThrow();
      expect({
        workPackage: inspect.query("SELECT * FROM work_package WHERE id = 'p-1'").all(),
        step: inspect.query("SELECT * FROM work_package_step WHERE work_package_id = 'p-1'").all(),
        workItems: inspect.query("SELECT * FROM work_item WHERE work_package_id = 'p-1'").all(),
        estimates: inspect.query("SELECT * FROM estimate WHERE work_item_id = 'w-1'").all(),
      }).toEqual(before);
    } finally {
      inspect.close();
    }
  });

  it('refuses a work package nobody is deleting, which is most work packages', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);

    // The single most destructive thing this function could do. `p-1` has no
    // slots — the ordinary state — and no marker, so it is not a drain that
    // finished, it is a work package going about its business.
    expect(finishOptimizationDrain(db, 'p-1')).toBe('open');

    expect(workPackageIds()).toEqual(['p-1', 'p-2']);
    expect(generationRows()).toEqual([`p-1/${BLUE}/open/0`]);
  });

  it('is a no-op on a work package that is already gone', () => {
    expect(finishOptimizationDrain(db, 'ghost')).toBe('absent');

    expect(workPackageIds()).toEqual(['p-1', 'p-2']);
  });
});

/** The release an owner of that seeded slot would make, with its real token. */
function releaseOf(
  contractVersion: string,
  objective: 'pri' | 'time',
  workPackageId = 'p-1',
  attemptToken = `tok-${workPackageId}-${contractVersion}-${objective}`,
): Parameters<typeof releaseSolverSlot>[1] {
  return {
    workPackageId,
    contractVersion,
    generation: 1,
    objective,
    budgetMs: 60000,
    attemptToken,
  };
}

describe('releasing a slot, which is how most drains finish', () => {
  it('gives the row back and finds no drain to finish, which is every ordinary release', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    seedCache(BLUE);
    seedSlot(BLUE, 'pri', null);

    // Neither target is closed, so both re-reads return `open` and write
    // nothing. Two reads is what the ordinary path pays for never needing to
    // know whether it is the last one out.
    expect(releaseSolverSlot(db, releaseOf(BLUE, 'pri'))).toEqual({
      released: true,
      retirement: 'open',
      deletion: 'open',
    });
    expect(slotRowsByWorkPackage()).toEqual([]);
    expect(generationRows()).toEqual([`p-1/${BLUE}/open/0`]);
    expect(cacheRows()).toEqual([`p-1/${BLUE}`]);
    expect(workPackageIds()).toEqual(['p-1', 'p-2']);
  });

  it('retires the release in the same call that removes the last of its slots', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    allocateGeneration(db, 'p-1', GREEN, 'h1', 10);
    seedCache(BLUE);
    seedCache(GREEN);
    seedSlot(BLUE, 'pri', null);
    seedSlot(GREEN, 'time', null);
    beginOptimizationDrain(db, 'p-1', stampAt(20), BLUE);

    // Nobody had to notice this was the last one: the delete and the marker
    // re-read are one transaction, so there is no instant at which the release
    // is drained and unfinished.
    expect(releaseSolverSlot(db, releaseOf(BLUE, 'pri'))).toEqual({
      released: true,
      retirement: 'finished',
      deletion: 'open',
    });
    expect(generationRows()).toEqual([`p-1/${GREEN}/open/0`]);
    expect(cacheRows()).toEqual([`p-1/${GREEN}`]);
    expect(slotRowsByWorkPackage()).toEqual([`p-1/${GREEN}/time/null`]);
    expect(workPackageIds()).toEqual(['p-1', 'p-2']);
  });

  it('waits while another slot of the same release is still counted', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    seedSlot(BLUE, 'pri', null);
    seedSlot(BLUE, 'time', null);
    beginOptimizationDrain(db, 'p-1', stampAt(20), BLUE);

    // The second child is still running and its capacity is still its own.
    expect(releaseSolverSlot(db, releaseOf(BLUE, 'pri'))).toEqual({
      released: true,
      retirement: 'waiting',
      deletion: 'open',
    });
    expect(generationRows()).toEqual([`p-1/${BLUE}/draining/1`]);
    expect(slotRowsByWorkPackage()).toEqual([`p-1/${BLUE}/time/20`]);
  });

  it('closes both targets when the last slot of a deleted work package goes back', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    seedCache(BLUE);
    seedSlot(BLUE, 'pri', null);
    beginOptimizationDrain(db, 'p-1', stampAt(20));

    // A deletion closes every release, so the last slot back retires its own
    // contract version AND takes the work package — in that order, because retiring
    // first is what makes the observation the drain exists to make.
    expect(releaseSolverSlot(db, releaseOf(BLUE, 'pri'))).toEqual({
      released: true,
      retirement: 'finished',
      deletion: 'finished',
    });
    expect(workPackageIds()).toEqual(['p-2']);
    expect(generationRows()).toEqual([]);
    expect(cacheRows()).toEqual([]);
  });

  it('retires its own release and leaves the work package waiting on the other one', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    allocateGeneration(db, 'p-1', GREEN, 'h1', 10);
    seedSlot(BLUE, 'pri', null);
    seedSlot(GREEN, 'time', null);
    beginOptimizationDrain(db, 'p-1', stampAt(20));

    // The work package's physical row stays while a child it counts is still
    // running, which is the same reason a slot row survives a retirement.
    expect(releaseSolverSlot(db, releaseOf(BLUE, 'pri'))).toEqual({
      released: true,
      retirement: 'finished',
      deletion: 'waiting',
    });
    expect(workPackageIds()).toEqual(['p-1', 'p-2']);
    expect(generationRows()).toEqual([`p-1/${GREEN}/draining/1`]);
    expect(deletePendingAt('p-1')).toBe(20);
  });

  it('releases nothing on a stale attempt token and leaves the capacity counted', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    seedSlot(BLUE, 'pri', null);
    beginOptimizationDrain(db, 'p-1', stampAt(20), BLUE);

    // 6.11's fence. A reclaimed owner whose slot was re-admitted would
    // otherwise delete a row belonging to a live child and hand its capacity to
    // somebody else — so a stale token removes nothing and the drain waits.
    expect(releaseSolverSlot(db, releaseOf(BLUE, 'pri', 'p-1', 'tok-reclaimed'))).toEqual({
      released: false,
      retirement: 'waiting',
      deletion: 'open',
    });
    expect(slotRowsByWorkPackage()).toEqual([`p-1/${BLUE}/pri/20`]);
    expect(generationRows()).toEqual([`p-1/${BLUE}/draining/1`]);
  });
});

describe('reconciling drains nobody finished', () => {
  it('reclaims a slot past its own stored deadline and retires the release', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    seedSlot(BLUE, 'pri', null, 'p-1', 500);
    beginOptimizationDrain(db, 'p-1', stampAt(20), BLUE);

    // Nobody called finish: the coordinator that began this died. The pass at
    // 600 is past the deadline stored on the row, so its child is presumed dead.
    expect(reconcileOptimizationDrains(db, 600)).toEqual({
      reclaimed: 1,
      finished: 1,
      waiting: 0,
    });
    expect(generationRows()).toEqual([]);
    expect(slotRowsByWorkPackage()).toEqual([]);
  });

  it('leaves a child inside its own deadline alone, whatever this pass thinks the budget is', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    seedSlot(BLUE, 'pri', null, 'p-1', 900);
    beginOptimizationDrain(db, 'p-1', stampAt(20), BLUE);

    // The deadline is read from the row, not computed from this coordinator's
    // configuration, so a coordinator running the smaller budget cannot reclaim
    // a larger-budget child that is still inside its own deadline.
    expect(reconcileOptimizationDrains(db, 600)).toEqual({
      reclaimed: 0,
      finished: 0,
      waiting: 1,
    });
    expect(generationRows()).toEqual([`p-1/${BLUE}/draining/1`]);
    expect(slotRowsByWorkPackage()).toEqual([`p-1/${BLUE}/pri/20`]);
  });

  it('physically deletes a work package whose delete crashed between begin and finish', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    allocateGeneration(db, 'p-1', GREEN, 'h1', 10);
    seedCache(BLUE);
    seedSlot(BLUE, 'pri', null, 'p-1', 500);
    seedSlot(GREEN, 'time', null, 'p-1', 500);
    beginOptimizationDrain(db, 'p-1', stampAt(20));

    // 3.9b's third watched red, at the repository layer: the work package was hidden
    // with admission closed and nothing finished it. Admission is exactly what a
    // draining work package rejects, so without this pass no read could ever sweep it
    // and the work package is wedged and undeletable.
    const pass = reconcileOptimizationDrains(db, 600);

    expect(pass.reclaimed).toBe(2);
    expect(workPackageIds()).toEqual(['p-2']);
    expect(generationRows()).toEqual([]);
    expect(cacheRows()).toEqual([]);
  });

  it('touches nothing that is neither draining nor delete-pending', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    seedCache(BLUE);
    // Long past its deadline, and still nobody's business: a slot is reclaimed
    // as part of a drain, and this work package is not draining.
    seedSlot(BLUE, 'pri', null, 'p-1', 100);

    expect(reconcileOptimizationDrains(db, 600)).toEqual({
      reclaimed: 0,
      finished: 0,
      waiting: 0,
    });
    expect(workPackageIds()).toEqual(['p-1', 'p-2']);
    expect(generationRows()).toEqual([`p-1/${BLUE}/open/0`]);
    expect(slotRowsByWorkPackage()).toEqual([`p-1/${BLUE}/pri/null`]);
  });

  it('reaches the same end state when a second reconciler runs the same pass', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    seedSlot(BLUE, 'pri', null, 'p-1', 500);
    beginOptimizationDrain(db, 'p-1', stampAt(20));
    const first = reconcileOptimizationDrains(db, 600);

    // The second coordinator finds the work done and says so, rather than
    // erroring: it reads `absent` where the first read `finished`.
    const second = reconcileOptimizationDrains(db, 600);

    expect(first.finished).toBeGreaterThan(0);
    expect(second).toEqual({ reclaimed: 0, finished: 0, waiting: 0 });
    expect(workPackageIds()).toEqual(['p-2']);
  });
});

describe('the closed-state predicate admission and dequeue share', () => {
  it('lets an ordinary allocated release through, which is every admission', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);

    expect(readOptimizationClosedState(db, 'p-1', BLUE)).toBeNull();
  });

  it('refuses the retired release and lets its sibling through', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    allocateGeneration(db, 'p-1', GREEN, 'h1', 10);
    beginOptimizationDrain(db, 'p-1', stampAt(20), BLUE);

    // A retirement is per contract version, and that is the whole difference
    // between the two targets: green keeps admitting through the swap.
    expect(readOptimizationClosedState(db, 'p-1', BLUE)).toBe('draining');
    expect(readOptimizationClosedState(db, 'p-1', GREEN)).toBeNull();
  });

  it('says deleting rather than draining when the work package is going', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    beginOptimizationDrain(db, 'p-1', stampAt(20));

    // Both are true — a deletion closes every release — and the marker is the
    // more useful of the two to report, because it is about the work package.
    expect(readOptimizationClosedState(db, 'p-1', BLUE)).toBe('deleting');
    expect(readOptimizationClosedState(db, 'p-2', BLUE)).toBe('absent');
  });

  it('refuses a release that finish has already retired', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    beginOptimizationDrain(db, 'p-1', stampAt(20), BLUE);
    expect(finishOptimizationDrain(db, 'p-1', BLUE)).toBe('finished');

    // The trap: `finish` DELETES the generation row, so a predicate reading
    // absence as "nothing closed here" would admit work for a contract version
    // one transaction after the drain it was supposed to respect completed.
    expect(readOptimizationClosedState(db, 'p-1', BLUE)).toBe('absent');
  });

  it('refuses a work package that is already gone', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    beginOptimizationDrain(db, 'p-1', stampAt(20));
    expect(finishOptimizationDrain(db, 'p-1')).toBe('finished');

    expect(readOptimizationClosedState(db, 'p-1', BLUE)).toBe('absent');
    expect(workPackageIds()).toEqual(['p-2']);
  });

  it('keeps a bystander work package admitting while its neighbour drains', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    allocateGeneration(db, 'p-2', BLUE, 'h1', 10);
    beginOptimizationDrain(db, 'p-1', stampAt(20));

    expect(readOptimizationClosedState(db, 'p-1', BLUE)).toBe('deleting');
    expect(readOptimizationClosedState(db, 'p-2', BLUE)).toBeNull();
  });
});

describe('two coordinators against one file, which is the point of all of it', () => {
  /** Green: a second connection to the same database, with its own everything. */
  let green: Drizzle;

  beforeEach(() => {
    green = openDrizzle(path);
  });

  it('refuses on the second coordinator throughout the whole drain, not just at the end', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    seedSlot(BLUE, 'pri', null);
    expect(readOptimizationClosedState(green, 'p-1', BLUE)).toBeNull();

    // 3.9b's second watched red, at the repository layer. The interval the red
    // targets is the one BETWEEN the drain opening and the row physically
    // going: after the zero-slot observation and before the final deletion.
    // Green must refuse at every instant in it, and the reason it can is that
    // the closed state is a row in SQLite rather than something blue knows.
    beginOptimizationDrain(db, 'p-1', stampAt(20), BLUE);
    expect(readOptimizationClosedState(green, 'p-1', BLUE)).toBe('draining');

    expect(finishOptimizationDrain(db, 'p-1', BLUE)).toBe('waiting');
    expect(readOptimizationClosedState(green, 'p-1', BLUE)).toBe('draining');

    releaseSolverSlot(db, releaseOf(BLUE, 'pri'));
    expect(readOptimizationClosedState(green, 'p-1', BLUE)).toBe('absent');
  });

  it('sees a work package deletion from the other coordinator and still admits its neighbour', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    allocateGeneration(db, 'p-2', BLUE, 'h1', 10);
    beginOptimizationDrain(db, 'p-1', stampAt(20));

    expect(readOptimizationClosedState(green, 'p-1', BLUE)).toBe('deleting');
    expect(readOptimizationClosedState(green, 'p-2', BLUE)).toBeNull();
  });

  it('lets the other coordinator’s release finish the drain this one began', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    seedCache(BLUE);
    seedSlot(BLUE, 'pri', null);
    beginOptimizationDrain(db, 'p-1', stampAt(20));

    // The child belongs to green, so green is who releases it — and the finish
    // is not the initiator's job precisely so that this works.
    expect(releaseSolverSlot(green, releaseOf(BLUE, 'pri'))).toEqual({
      released: true,
      retirement: 'finished',
      deletion: 'finished',
    });
    expect(workPackageIds()).toEqual(['p-2']);
  });

  it('lets a different coordinator reconcile a drain the first one died inside', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    seedSlot(BLUE, 'pri', null, 'p-1', 500);
    beginOptimizationDrain(db, 'p-1', stampAt(20));

    // 3.9b's third watched red with the restart made real: the coordinator that
    // began this is gone, and the one sweeping never saw it happen.
    const pass = reconcileOptimizationDrains(green, 600);

    expect(pass.reclaimed).toBe(1);
    expect(workPackageIds()).toEqual(['p-2']);
    expect(readOptimizationClosedState(db, 'p-1', BLUE)).toBe('absent');
  });
});

describe('terminal current typed identity evidence', () => {
  for (const fault of [
    'missing-work-item',
    'missing-definition',
    'missing-values',
    'foreign-organization',
    'missing-definition-organization',
    'malformed-values',
    'unknown-scope',
    'whole-with-step',
    'unknown-type',
  ] as const) {
    it(`refuses selected typed ${fault} before cleanup and preserves exact state`, () => {
      const sqlite = openDatabase(path);
      try {
        sqlite.run(
          "INSERT INTO work_item(id,work_package_id,name,position) VALUES('typed-owner','p-1','Typed',1)",
        );
        sqlite.run(
          "INSERT INTO typed_dependency(id,work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,type) VALUES('typed-point','p-1','typed-owner','node','s-1','typed-owner','whole','FS')",
        );
        beginOptimizationDrain(db, 'p-1', stampAt(20));
        sqlite.run('PRAGMA foreign_keys=OFF');
        sqlite.run('PRAGMA ignore_check_constraints=ON');
        if (fault === 'missing-work-item')
          sqlite.run("DELETE FROM work_item WHERE id='typed-owner'");
        if (fault === 'missing-definition')
          sqlite.run("DELETE FROM step_definition WHERE id='s-1'");
        if (fault === 'missing-values')
          sqlite.run("DELETE FROM work_package_step WHERE work_package_id='p-1' AND step_id='s-1'");
        if (fault === 'foreign-organization')
          sqlite.run("INSERT INTO organization(id,name,created_at) VALUES('foreign','Foreign',1)");
        if (fault === 'foreign-organization' || fault === 'missing-definition-organization')
          sqlite.run("UPDATE step_definition SET organization_id=? WHERE id='s-1'", [
            fault === 'foreign-organization' ? 'foreign' : 'missing',
          ]);
        if (fault === 'malformed-values')
          sqlite.run(
            "UPDATE work_package_step SET estimate_unit=x'01' WHERE work_package_id='p-1' AND step_id='s-1'",
          );
        if (fault === 'unknown-scope')
          sqlite.run("UPDATE typed_dependency SET predecessor_scope='other'");
        if (fault === 'whole-with-step')
          sqlite.run("UPDATE typed_dependency SET predecessor_scope='whole'");
        if (fault === 'unknown-type') sqlite.run("UPDATE typed_dependency SET type='SF'");
        sqlite.run('PRAGMA ignore_check_constraints=OFF');
        sqlite.run('PRAGMA foreign_keys=ON');
        const capture = () =>
          [
            'work_package',
            'work_item',
            'typed_dependency',
            'work_package_step',
            'step_definition',
            'step_binding',
            'step_retirement',
            'optimization_generation',
            'solver_slot',
            'optimized_schedule_cache',
            'command_journal',
            'event_log',
            'event_sequencer',
          ].map((table) => sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
        const before = capture();
        const diagnostic = {
          'missing-work-item': 'cross-work-package typed dependency',
          'missing-definition': 'step parallelism has an invalid step reference',
          'missing-values': 'has no explicit values for step',
          'foreign-organization': 'drain step definition organization is absent or foreign',
          'missing-definition-organization':
            'drain step definition organization is absent or foreign',
          'malformed-values': 'catalogue package estimate unit is malformed',
          'unknown-scope': 'unknown predecessor scope other',
          'whole-with-step': 'whole predecessor with a step',
          'unknown-type': 'unknown relationship type SF',
        }[fault];
        expect(() => finishOptimizationDrain(db, 'p-1')).toThrow(diagnostic);
        expect(capture()).toEqual(before);
      } finally {
        sqlite.close();
      }
    });
  }
  it('selects actual successor incidence despite a foreign declared owner', () => {
    const sqlite = openDatabase(path);
    try {
      sqlite.run(
        "INSERT INTO work_item(id,work_package_id,name,position) VALUES('actual-a','p-1','A',1),('actual-b','p-2','B',1)",
      );
      sqlite.run(
        "INSERT INTO typed_dependency(id,work_package_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES('foreign-successor','p-2','actual-b','whole','actual-a','whole','FS')",
      );
      beginOptimizationDrain(db, 'p-1', stampAt(20));
      const before = sqlite.query('SELECT * FROM typed_dependency').all();
      expect(() => finishOptimizationDrain(db, 'p-1')).toThrow(
        'cross-work-package typed dependency',
      );
      expect(sqlite.query('SELECT * FROM typed_dependency').all()).toEqual(before);
      expect(workPackageIds()).toEqual(['p-1', 'p-2']);
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
});

it('refuses actual successor ownership before a bystander predecessor missing package values', () => {
  const sqlite = openDatabase(path);
  try {
    sqlite.run(
      "INSERT INTO work_item(id,work_package_id,name,position) VALUES('mixed-a','p-1','A',1),('mixed-b','p-2','B',1)",
    );
    sqlite.run(
      "INSERT INTO typed_dependency(id,work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,type) VALUES('mixed','p-2','mixed-b','node','s-1','mixed-a','whole','FS')",
    );
    sqlite.run('PRAGMA foreign_keys=OFF');
    sqlite.run("DELETE FROM work_package_step WHERE work_package_id='p-2' AND step_id='s-1'");
    sqlite.run('PRAGMA foreign_keys=ON');
    beginOptimizationDrain(db, 'p-1', stampAt(20));
    const capture = () =>
      [
        'work_package',
        'work_item',
        'typed_dependency',
        'work_package_step',
        'step_definition',
        'step_binding',
        'step_retirement',
      ].map((table) => sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = capture();
    expect(() => finishOptimizationDrain(db, 'p-1')).toThrow('cross-work-package typed dependency');
    expect(capture()).toEqual(before);
  } finally {
    sqlite.close();
  }
});

it('refuses later cross-owner edges before an earlier local edge missing package values', () => {
  const sqlite = openDatabase(path);
  try {
    sqlite.run(
      "INSERT INTO work_item(id,work_package_id,name,position) VALUES('mixed-a','p-1','A',1),('mixed-b','p-2','B',1)",
    );
    sqlite.run(
      "INSERT INTO typed_dependency(id,work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,type) VALUES('local-first','p-1','mixed-a','node','s-1','mixed-a','whole','FS'),('cross-later','p-2','mixed-b','whole',NULL,'mixed-a','whole','FS')",
    );
    sqlite.run('PRAGMA foreign_keys=OFF');
    sqlite.run("DELETE FROM work_package_step WHERE work_package_id='p-1' AND step_id='s-1'");
    sqlite.run('PRAGMA foreign_keys=ON');
    beginOptimizationDrain(db, 'p-1', stampAt(20));
    const capture = () =>
      [
        'work_package',
        'work_item',
        'typed_dependency',
        'work_package_step',
        'step_definition',
        'step_binding',
        'step_retirement',
      ].map((table) => sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = capture();
    expect(() => finishOptimizationDrain(db, 'p-1')).toThrow('cross-work-package typed dependency');
    expect(capture()).toEqual(before);
  } finally {
    sqlite.close();
  }
});
