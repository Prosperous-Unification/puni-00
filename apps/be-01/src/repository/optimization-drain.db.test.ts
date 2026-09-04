import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Drizzle, openDatabase, openDrizzle } from './db';
import { runMigrations } from './migrate';
import { beginOptimizationDrain } from './optimization-drain';
import { allocateGeneration, readGeneration } from './optimization-generation';
import { solverQueue, solverSlot } from './schema';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

/** The two releases running against one file during a swap. */
const BLUE = '7+1.0.0';
const GREEN = '8+1.0.0';

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
  } finally {
    seed.close();
  }
  db = openDrizzle(path);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function seedQueue(contractVersion: string, generation: number): void {
  db.insert(solverQueue)
    .values({
      projectId: 'p-1',
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
): void {
  db.insert(solverSlot)
    .values({
      projectId: 'p-1',
      contractVersion,
      generation: 1,
      objective,
      budgetMs: 60000,
      ownerId: 'own-1',
      attemptToken: `tok-${contractVersion}-${objective}`,
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

describe('beginning a contract retirement', () => {
  it('closes admission and advances the cancel epoch of that release alone', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    allocateGeneration(db, 'p-1', GREEN, 'h1', 10);

    beginOptimizationDrain(db, 'p-1', BLUE, 20);

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

    beginOptimizationDrain(db, 'p-1', BLUE, 20);

    expect(slotRows()).toEqual([`${BLUE}/pri/20`, `${GREEN}/pri/null`]);
  });

  it('leaves the slot rows counted and undeleted, whatever it asked of them', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    seedSlot(BLUE, 'pri', null);
    seedSlot(BLUE, 'time', null);

    // Freeing the capacity before the children are proved dead is what let six
    // real processes run while SQLite counted two. Begin asks; it never reaps.
    expect(beginOptimizationDrain(db, 'p-1', BLUE, 20)).toBe(2);
    expect(slotRows()).toEqual([`${BLUE}/pri/20`, `${BLUE}/time/20`]);
  });

  it('deletes the retired release’s queued work and not the other release’s', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    allocateGeneration(db, 'p-1', GREEN, 'h1', 10);
    seedQueue(BLUE, 1);
    seedQueue(GREEN, 1);

    beginOptimizationDrain(db, 'p-1', BLUE, 20);

    // A queue row is unstarted work with no process behind it, so removing it
    // frees nothing early — the asymmetry with the slot rows is the point.
    expect(queueRows()).toEqual([`${GREEN}/1`]);
  });

  it('keeps the instant a cancellation was first requested when it runs again', () => {
    allocateGeneration(db, 'p-1', BLUE, 'h1', 10);
    seedSlot(BLUE, 'pri', null);
    beginOptimizationDrain(db, 'p-1', BLUE, 20);

    beginOptimizationDrain(db, 'p-1', BLUE, 30);

    // The reconciler re-runs this every 60 s. Re-stamping would push the
    // request instant forward for ever, and that instant is what a reader uses
    // to judge whether a child is ignoring the request.
    expect(slotRows()).toEqual([`${BLUE}/pri/20`]);
  });

  it('is a no-op on a release that never allocated, rather than creating it', () => {
    expect(beginOptimizationDrain(db, 'p-1', BLUE, 20)).toBe(0);

    // Draining a release that never allocated must not create the row it is
    // trying to retire.
    expect(readGeneration(db, 'p-1', BLUE)).toBeNull();
  });
});
