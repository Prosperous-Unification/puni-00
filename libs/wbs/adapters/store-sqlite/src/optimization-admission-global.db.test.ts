import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, describe, expect, it } from 'bun:test';

import { openConnection, openDrizzle } from './db';
import { OPEN } from './gate';
import { reserveSolverSlot } from './optimization-admission';
import { allocateGeneration } from './optimization-generation';
import { solverSlot } from './schema';
import { seedCurrentProjectFixture } from './testing/current-project-fixture';
import { WorkPackageRepository } from './work-package';

const CONTRACT = '7+0.1.0';
const dirs: { dir: string; custody: { hasUnknownOwner: boolean } }[] = [];

afterEach(() => {
  for (const { dir, custody } of dirs.splice(0))
    if (!custody.hasUnknownOwner) rmSync(dir, { recursive: true, force: true });
});

describe('reserveSolverSlot cross-coordinator capacity', () => {
  it('shares both ceilings and reclaims abandoned seats only after their stored deadlines', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wbs-optimization-global-admission-'));
    const custody = { hasUnknownOwner: false };
    dirs.push({ dir, custody });
    const path = join(dir, 'test.db');
    const stamp = { by: 'u-1', at: 1 };
    const projectId = 'fixture-project';
    await seedCurrentProjectFixture(
      {
        path,
        directory: dir,
        projectId,
        organizationId: 'fixture-legacy-org',
        stamp,
        definitions: [],
      },
      custody,
    );
    const seed = openConnection(path);
    try {
      const workPackages = new WorkPackageRepository(seed.db, OPEN);
      for (let index = 1; index <= 5; index += 1) {
        const workPackage = await workPackages.create(
          workPackageRow({
            id: `p-${String(index)}`,
            name: `Plan ${String(index)}`,
            projectId,
            optimizationEnabled: true,
            scheduleEngine: 'optimized',
            scheduleObjective: 'pri',
          }),
          [],
          stamp,
        );
        if (typeof workPackage === 'string')
          throw new Error('admission fixture package refused: ' + workPackage);
      }
    } finally {
      seed.close();
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
