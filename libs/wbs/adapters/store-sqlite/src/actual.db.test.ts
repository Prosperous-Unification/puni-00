import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WorkItem, WriteStamp } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { ActualRepository } from './actual';
import { openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { seedCurrentProjectFixture } from './testing/current-project-fixture';
import { seedLegacyPackageParent } from './testing/legacy-package-parent';
import { copyRecoveryPrefix } from './testing/recovery-state';
import { UserRepository } from './user';
import { WorkItemRepository } from './work-item';
import { WorkPackageRepository } from './work-package';

const custody = { hasUnknownOwner: false };

let dir: string;
let path: string;
let ownerId: string;
let repo: ActualRepository;
let workItems: WorkItemRepository;
let workPackageId: string;
let devId: string;
let qaId: string;
let stripId: string;
let sandId: string;

/**
 * The stamp every write here carries. The account is the work package's owner, which
 * the `created_by` foreign key requires to exist; the owner's own signup carries
 * it too, because a new account authors its own row. Not to be read as an
 * actual's `recordedAt` — that is the day somebody says the work took, and this
 * is when the row was written.
 */
const wrote = (): WriteStamp => ({ at: 1, by: ownerId });

const insertItem = async (id: string, position: number, name: string): Promise<void> => {
  const item: WorkItem = workItemRow({
    id,
    workPackageId,
    position,
    name,
  });
  await workItems.insert(item, [], wrote());
};

const revisionOf = async (id: string): Promise<number> => {
  const rows = await workItems.listByWorkPackage(workPackageId);
  const found = rows.find((row) => row.id === id);
  if (found === undefined) throw new Error(`${id} is not in the work package`);
  return found.revision;
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-actual-'));
  path = join(dir, 'test.db');
  custody.hasUnknownOwner = false;
  ownerId = crypto.randomUUID();
  workPackageId = crypto.randomUUID();
  // Key order must differ from authored order to prove the real step projection.
  devId = `z-dev-${crypto.randomUUID()}`;
  qaId = `a-qa-${crypto.randomUUID()}`;
  await seedCurrentProjectFixture(
    {
      path,
      directory: dir,
      organizationId: 'fixture-legacy-org',
      projectId: 'fixture-project',
      stamp: wrote(),
      definitions: [
        {
          id: devId,
          code: 'dev',
          name: 'Dev',
          position: 10,
          defaultAllowancePercent: 0,
          defaultEstimateUnit: 'workdays',
        },
        {
          id: qaId,
          code: 'qa',
          name: 'QA',
          position: 20,
          defaultAllowancePercent: 0,
          defaultEstimateUnit: 'workdays',
        },
      ],
    },
    custody,
  );
  const db = openDrizzle(path);
  repo = new ActualRepository(db, OPEN);
  workItems = new WorkItemRepository(db, OPEN);
  await new WorkPackageRepository(db, OPEN).create(
    workPackageRow({ id: workPackageId, projectId: 'fixture-project' }),
    [],
    wrote(),
  );

  stripId = crypto.randomUUID();
  sandId = crypto.randomUUID();
  await insertItem(stripId, 10, 'Strip');
  await insertItem(sandId, 20, 'Sand');
});

afterEach(() => {
  if (!custody.hasUnknownOwner) rmSync(dir, { recursive: true, force: true });
});

describe('ActualRepository', () => {
  it('replaces one pair’s days and restamps them, rather than keeping two rows', async () => {
    // The composite primary key is the whole point: a second recording for the
    // same (work item, step) is a correction, not a second fact. And the stamp
    // moves with it — the column says when *this* number was typed, so a figure
    // corrected today reading as recorded last week is the one thing it must
    // not do.
    await repo.set({ workItemId: stripId, stepId: devId, days: 3, recordedAt: 1_000 }, wrote());

    await repo.set({ workItemId: stripId, stepId: devId, days: 8, recordedAt: 2_000 }, wrote());

    expect(await repo.listByWorkPackage(workPackageId)).toEqual([
      { workItemId: stripId, stepId: devId, days: 8, recordedAt: 2_000 },
    ]);
  });

  it('removes one work item’s step without touching the other step or the same step elsewhere', async () => {
    // Both halves of the condition are load-bearing and each needs its own
    // survivor. With one work item, a delete narrowed to the step alone —
    // which would clear that step on every work item in the database — passes.
    // The same trap `estimate.test.ts` and `directory.test.ts` record.
    await repo.set({ workItemId: stripId, stepId: devId, days: 1, recordedAt: 1 }, wrote());
    await repo.set({ workItemId: stripId, stepId: qaId, days: 2, recordedAt: 2 }, wrote());
    await repo.set({ workItemId: sandId, stepId: devId, days: 3, recordedAt: 3 }, wrote());

    await repo.remove(stripId, devId, wrote());

    const left = await repo.listByWorkPackage(workPackageId);
    expect(left).toHaveLength(2);
    // The same step on another work item survives — the work-item half.
    expect(left).toContainEqual({ workItemId: sandId, stepId: devId, days: 3, recordedAt: 3 });
    // The other step on this one — the step half.
    expect(left).toContainEqual({ workItemId: stripId, stepId: qaId, days: 2, recordedAt: 2 });
  });

  it('removing days that were never recorded takes nothing away and does not throw', async () => {
    await repo.set({ workItemId: stripId, stepId: qaId, days: 2, recordedAt: 2 }, wrote());

    await repo.remove(stripId, devId, wrote());
    await repo.remove(stripId, devId, wrote());

    expect(await repo.listByWorkPackage(workPackageId)).toEqual([
      { workItemId: stripId, stepId: qaId, days: 2, recordedAt: 2 },
    ]);
  });

  it('keeps zero as a recorded figure, because nobody typing is the absence of a row', async () => {
    // The rule the whole table rests on, asserted at the storage layer rather
    // than only argued in `schema.ts`: 0 is a person saying the work took no
    // days and it is stored; "nobody has said" is no row at all. A repository
    // that treated 0 as nothing to write would make the two the same sentence.
    await repo.set({ workItemId: stripId, stepId: devId, days: 0, recordedAt: 5 }, wrote());

    expect(await repo.listByWorkPackage(workPackageId)).toEqual([
      { workItemId: stripId, stepId: devId, days: 0, recordedAt: 5 },
    ]);
  });

  it('reads a work item’s actuals in step order, not in the order the row ids happen to sort', async () => {
    // The order is a contract for the roll-up's reason — floating-point
    // addition is not associative, so a parent's total can differ in its last
    // bit with the terms in a different order — and for the reader's: the
    // actuals must line up with the estimates beside them, which come back in
    // this same order.
    await repo.set({ workItemId: stripId, stepId: qaId, days: 4, recordedAt: 1 }, wrote());
    await repo.set({ workItemId: stripId, stepId: devId, days: 1, recordedAt: 2 }, wrote());

    const held = await repo.listByWorkPackage(workPackageId);

    expect(held.map((each) => each.stepId)).toEqual([devId, qaId]);
  });

  it('answers one work package only, so another plan’s recorded days are never in the list', async () => {
    const otherWorkPackage = crypto.randomUUID();
    const otherItem = crypto.randomUUID();
    const db = openDrizzle(path);
    const owner = crypto.randomUUID();
    // The other plan is the other owner's, so its rows are attributed to them.
    const wroteElsewhere: WriteStamp = { at: 1, by: owner };
    await new UserRepository(db, OPEN).create(
      { id: owner, username: 'other', passwordHash: 'x', createdAt: 1 },
      wroteElsewhere,
    );
    await new WorkPackageRepository(db, OPEN).create(
      workPackageRow({
        id: otherWorkPackage,
        name: 'Another shed',
        projectId: 'fixture-project',
      }),
      [],
      wroteElsewhere,
    );
    await new WorkItemRepository(db, OPEN).insert(
      workItemRow({
        id: otherItem,
        workPackageId: otherWorkPackage,
        position: 10,
        name: 'Elsewhere',
      }),
      [],
      wroteElsewhere,
    );
    expect(
      await repo.set(
        { workItemId: otherItem, stepId: devId, days: 9, recordedAt: 1 },
        wroteElsewhere,
      ),
    ).toBe('written');
    await repo.set({ workItemId: stripId, stepId: devId, days: 1, recordedAt: 1 }, wrote());

    expect(await repo.listByWorkPackage(workPackageId)).toEqual([
      { workItemId: stripId, stepId: devId, days: 1, recordedAt: 1 },
    ]);
  });

  it('moves the work item’s revision on a write and on a removal', async () => {
    // An actual is a satellite of the work item it is on: nobody holds an id
    // for it, and every reader sees it through that row. A write that left the
    // revision where it was would let a stale undo apply over a number
    // somebody recorded in between.
    const before = await revisionOf(stripId);

    await repo.set({ workItemId: stripId, stepId: devId, days: 3, recordedAt: 1 }, wrote());
    const written = await revisionOf(stripId);
    await repo.remove(stripId, devId, wrote());
    const removed = await revisionOf(stripId);

    expect(written).toBe(before + 1);
    expect(removed).toBe(before + 2);
  });

  it('moves every actual to another work item, and moves neither revision when there was nothing to move', async () => {
    // Two claims in one case because they are the same statement from both
    // ends. The move is what a leaf gaining its first child runs, beside the
    // estimates'; the silence is what every other create runs, and almost every
    // plan has no actuals at all.
    await repo.set({ workItemId: stripId, stepId: devId, days: 2, recordedAt: 7 }, wrote());
    const sandBefore = await revisionOf(sandId);

    await repo.moveAll(stripId, sandId, wrote());

    expect(await repo.listByWorkPackage(workPackageId)).toEqual([
      { workItemId: sandId, stepId: devId, days: 2, recordedAt: 7 },
    ]);
    expect(await revisionOf(sandId)).toBe(sandBefore + 1);

    const quiet = await revisionOf(stripId);
    await repo.moveAll(stripId, sandId, wrote());
    expect(await revisionOf(stripId)).toBe(quiet);
  });

  it('goes with the work item it is on, so an old release can still delete one', async () => {
    // `actual.work_item_id` cascades, and it is the blue/green window this is
    // for: the outgoing release knows nothing about this table and its plain
    // `DELETE FROM work_item` must not hit a constraint it cannot see.
    await repo.set({ workItemId: stripId, stepId: devId, days: 4, recordedAt: 1 }, wrote());

    const db = openDatabase(path);
    try {
      db.run('PRAGMA foreign_keys = ON');
      db.run(`DELETE FROM work_item WHERE id = '${stripId}'`);
    } finally {
      db.close();
    }

    expect(await repo.listByWorkPackage(workPackageId)).toEqual([]);
  });

  it('the pre-catalogue schema refuses a step deletion while actuals still reference it', () => {
    const retained = mkdtempSync(join(dir, 'retained-step-'));
    const previousPath = join(retained, 'store.db');
    runMigrations(
      previousPath,
      copyRecoveryPrefix(retained, '20261115120000_add_step_migration_report'),
    );
    seedLegacyPackageParent(previousPath, 'retained-org', 'retained-parent');
    const db = openDatabase(previousPath);
    try {
      db.run('PRAGMA foreign_keys = ON');
      db.run("INSERT INTO users(id,username,created_at) VALUES ('owner','Owner',1)");
      db.run(
        "INSERT INTO work_package(id,name,project_id,created_at,created_by) VALUES ('retained','Retained','retained-parent',1,'owner')",
      );
      db.run(
        "INSERT INTO work_item(id,work_package_id,name,position) VALUES ('leaf','retained','Leaf',10)",
      );
      db.run(
        "INSERT INTO step(id,work_package_id,code,name,position) VALUES ('dev','retained','dev','Dev',10)",
      );
      db.run("INSERT INTO actual(work_item_id,step_id,days,recorded_at) VALUES ('leaf','dev',4,1)");
      expect(() => db.run("DELETE FROM step WHERE id='dev'")).toThrow(
        /FOREIGN KEY constraint failed/,
      );
      expect(db.query('SELECT work_item_id,step_id,days,recorded_at FROM actual').all()).toEqual([
        { work_item_id: 'leaf', step_id: 'dev', days: 4, recorded_at: 1 },
      ]);
      db.run("DELETE FROM actual WHERE step_id='dev'");
      db.run("DELETE FROM step WHERE id='dev'");
      expect(db.query("SELECT id FROM step WHERE id='dev'").get()).toBeNull();
    } finally {
      db.close();
    }
  });
});
