import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import { type Drizzle, openDatabase, openDrizzle } from './db';
import type { WriteStamp } from './index';
import { runMigrations } from './migrate';
import { beginOptimizationDrain } from './optimization-drain';
import { allocateGeneration, readGeneration } from './optimization-generation';
import { optimizationGeneration, project, solverQueue, solverSlot } from './schema';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

/** The two releases running against one file during a swap. */
const BLUE = '7+1.0.0';
const GREEN = '8+1.0.0';

const stampAt = (at: number): WriteStamp => ({ at, by: 'u-1' });

let dir: string;
let path: string;
let db: Drizzle;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-optimization-drain-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  const seed = openDatabase(path);
  try {
    seed.run(
      `INSERT INTO users (id, username, password_hash, created_at) VALUES ('u-1', 'u', 'h', 1)`,
    );
    seed.run(
      `INSERT INTO project (id, name, owner_id, restricted, revision, created_at)
       VALUES ('p-1', 'Rewire the shed', 'u-1', 0, 0, 1)`,
    );
    // The bystander. Deleting one project closes every release of THAT project,
    // which is only a meaningful claim beside a project it must not touch.
    seed.run(
      `INSERT INTO project (id, name, owner_id, restricted, revision, created_at)
       VALUES ('p-2', 'Re-tile the roof', 'u-1', 0, 0, 1)`,
    );
  } finally {
    seed.close();
  }
  db = openDrizzle(path);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function seedQueue(contractVersion: string, generation: number, projectId = 'p-1'): void {
  db.insert(solverQueue)
    .values({
      projectId,
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
  projectId = 'p-1',
): void {
  db.insert(solverSlot)
    .values({
      projectId,
      contractVersion,
      generation: 1,
      objective,
      budgetMs: 60000,
      ownerId: 'own-1',
      attemptToken: `tok-${projectId}-${contractVersion}-${objective}`,
      lifecycle: 'running',
      pid: 4242,
      startedAt: 1,
      heartbeatAt: 1,
      cancelRequestedAt,
      admittedDeadlineAt: 61000,
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
 * The same two views with the project id in front.
 *
 * The retirement cases above seed one project and read the table bare, which
 * says everything they are about. A deletion is a claim about which project's
 * rows moved, so its cases need the id in the value they compare.
 */
function slotRowsByProject(): string[] {
  return db
    .select()
    .from(solverSlot)
    .all()
    .map(
      (row) =>
        `${row.projectId}/${row.contractVersion}/${row.objective}/${String(row.cancelRequestedAt)}`,
    )
    .sort();
}

function queueRowsByProject(): string[] {
  return db
    .select()
    .from(solverQueue)
    .all()
    .map((row) => `${row.projectId}/${row.contractVersion}`)
    .sort();
}

/** `projectId/admissionState/cancelEpoch` for every generation row on file. */
function generationRows(): string[] {
  return db
    .select()
    .from(optimizationGeneration)
    .all()
    .map(
      (row) =>
        `${row.projectId}/${row.contractVersion}/${row.admissionState}/${String(row.cancelEpoch)}`,
    )
    .sort();
}

function deletePendingAt(projectId: string): number | null {
  const row = db.select().from(project).where(eq(project.id, projectId)).get();
  return row?.optimizationDeletePendingAt ?? null;
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

describe('beginning a project deletion', () => {
  it('writes the durable marker and closes every release of that project', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    allocateGeneration(db, 'p-1', GREEN, 'h1', 10);
    allocateGeneration(db, 'p-2', BLUE, 'h1', 10);

    beginOptimizationDrain(db, 'p-1', stampAt(20));

    // Retirement names one release because the other is still serving readers.
    // A deletion has no such other: every release of this project is going.
    expect(deletePendingAt('p-1')).toBe(20);
    expect(generationRows()).toEqual([
      `p-1/${BLUE}/draining/1`,
      `p-1/${GREEN}/draining/1`,
      `p-2/${BLUE}/open/0`,
    ]);
    expect(deletePendingAt('p-2')).toBeNull();
  });

  it('leaves the physical project row in place while its children still run', () => {
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
    expect(db.select().from(project).where(eq(project.id, 'p-1')).get()).toBeDefined();
    expect(slotRowsByProject()).toEqual([`p-1/${BLUE}/pri/20`, `p-1/${GREEN}/time/20`]);
  });

  it('stamps and deletes across every release of that project and no other', () => {
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

    expect(slotRowsByProject()).toEqual([
      `p-1/${BLUE}/pri/20`,
      `p-1/${GREEN}/pri/20`,
      `p-2/${BLUE}/pri/null`,
    ]);
    expect(queueRowsByProject()).toEqual([`p-2/${BLUE}`]);
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

  it('fences a project that has never solved', () => {
    // No generation row, because nothing ever allocated one. The marker is still
    // owed: a project deleted before its first solve must be closed to admission
    // exactly like one deleted mid-solve, or the delete races the first solve.
    expect(beginOptimizationDrain(db, 'p-1', stampAt(20))).toBe(0);

    expect(deletePendingAt('p-1')).toBe(20);
    expect(generationRows()).toEqual([]);
  });

  it('is a no-op on a project that is not there', () => {
    expect(beginOptimizationDrain(db, 'ghost', stampAt(20))).toBe(0);

    // A contract case rather than a mutation-proved one, and it says so: no
    // guard makes this true, the four statements simply match no row. It is here
    // because a future upsert on any of them would break it.
    expect(deletePendingAt('p-1')).toBeNull();
    expect(deletePendingAt('p-2')).toBeNull();
    expect(generationRows()).toEqual([]);
  });
});
