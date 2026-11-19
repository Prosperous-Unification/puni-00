import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { runMigrations } from './migrate';
import { reserveSolverSlot } from './optimization-admission';
import { allocateGeneration } from './optimization-generation';
import { solverSlot } from './schema';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const CONTRACT = '7+0.1.0';
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('reserveSolverSlot cross-coordinator capacity', () => {
  it('shares both ceilings and reclaims abandoned seats only after their stored deadlines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wbs-optimization-global-admission-'));
    dirs.push(dir);
    const path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    const raw = openDatabase(path);
    try {
      raw.run(
        `INSERT INTO users (id, username, password_hash, created_at)
         VALUES ('u-1', 'owner', 'hash', 1)`,
      );
      for (let workPackage = 1; workPackage <= 5; workPackage += 1) {
        raw.run(
          `INSERT INTO work_package (id, name, owner_id, restricted, revision, created_at,
                                optimization_enabled, schedule_engine, schedule_objective)
           VALUES (?, ?, 'u-1', 0, 0, 1, 1, 'optimized', 'pri')`,
          [`p-${String(workPackage)}`, `Plan ${String(workPackage)}`],
        );
      }
    } finally {
      raw.close();
    }

    const blue = openDrizzle(path);
    const green = openDrizzle(path);
    const generations = new Map<string, number>();
    for (let workPackage = 1; workPackage <= 5; workPackage += 1) {
      const workPackageId = `p-${String(workPackage)}`;
      generations.set(
        workPackageId,
        allocateGeneration(blue, workPackageId, CONTRACT, 'hash-1', 2),
      );
    }

    for (let index = 0; index < 16; index += 1) {
      const workPackageId = `p-${String(Math.floor(index / 4) + 1)}`;
      expect(
        reserveSolverSlot(index % 2 === 0 ? blue : green, {
          workPackageId,
          contractVersion: CONTRACT,
          generation: generations.get(workPackageId)!,
          objective: index % 2 === 0 ? 'pri' : 'time',
          budgetMs: 60_000 + (index % 4),
          ownerId: `owner-${String(index)}`,
          attemptToken: `token-${String(index)}`,
          now: 10,
        }),
      ).toMatchObject({ kind: 'reserved' });
    }

    expect(
      reserveSolverSlot(green, {
        workPackageId: 'p-5',
        contractVersion: CONTRACT,
        generation: generations.get('p-5')!,
        objective: 'pri',
        budgetMs: 70_000,
        ownerId: 'seventeenth-owner',
        attemptToken: 'seventeenth-token',
        now: 10,
      }),
    ).toEqual({ kind: 'global-full' });
    expect(blue.select().from(solverSlot).all()).toHaveLength(16);

    expect(
      reserveSolverSlot(green, {
        workPackageId: 'p-1',
        contractVersion: CONTRACT,
        generation: generations.get('p-1')!,
        objective: 'pri',
        budgetMs: 70_001,
        ownerId: 'fifth-work-package-owner',
        attemptToken: 'fifth-work-package-token',
        now: 20_000,
      }),
    ).toEqual({ kind: 'work-package-full' });
    expect(
      reserveSolverSlot(green, {
        workPackageId: 'p-5',
        contractVersion: CONTRACT,
        generation: generations.get('p-5')!,
        objective: 'pri',
        budgetMs: 70_000,
        ownerId: 'early-replacement-owner',
        attemptToken: 'early-replacement-token',
        now: 20_000,
      }),
    ).toEqual({ kind: 'global-full' });
    expect(
      reserveSolverSlot(green, {
        workPackageId: 'p-5',
        contractVersion: CONTRACT,
        generation: generations.get('p-5')!,
        objective: 'pri',
        budgetMs: 70_000,
        ownerId: 'replacement-owner',
        attemptToken: 'replacement-token',
        now: 80_014,
      }),
    ).toMatchObject({ kind: 'reserved', attemptToken: 'replacement-token' });
    expect(blue.select().from(solverSlot).all()).toHaveLength(1);

    // Proof: changing the global comparison from >= to > admits the seventeenth
    // row. Counting only one owner/connection — the observable result of an
    // in-memory per-coordinator counter — admits the fifth p-1 row. Reclaiming
    // from heartbeat age makes the 20_000 ms request succeed; ignoring the
    // stored deadlines leaves the 80_014 ms replacement globally blocked.
  });
});
