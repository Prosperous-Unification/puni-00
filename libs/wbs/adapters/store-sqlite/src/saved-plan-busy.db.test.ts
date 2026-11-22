import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { SavedPlanService } from '@wbs/core';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { CapacityRepository } from './capacity';
import type { Connection } from './db';
import { openConnection } from './db';
import { DirectoryRepository } from './directory';
import { OPEN } from './gate';
import { SavedPlanRepository } from './saved-plan';
import { SavedPlanCaptureRepository } from './saved-plan-capture';
import { savedPlan, workItem } from './schema';
import { seedCurrentProjectFixture } from './testing/current-project-fixture';
import { nodeDigest } from './testing/node-digest';
import { HOLDER_CASE_BUDGET_MS, WriteLockHolder } from './testing/write-lock-holder';
import { WorkItemRepository } from './work-item';
import { WorkPackageRepository } from './work-package';

function readerDb(reader: Connection | undefined): Connection['db'] {
  if (reader === undefined) throw new Error('saved-plan fixture reader was not acquired');
  return reader.db;
}

const wrote: WriteStamp = { at: 1, by: 'owner' };

const OPENED_AT = 1_756_000_123;

describe('SavedPlanService.save answers snapshot_busy without holding up an edit', () => {
  let dir: string;
  let path: string;
  let reader: Connection | undefined;
  let custody: { hasUnknownOwner: boolean };

  const item = (id: string, position: number) => ({
    id,
    workPackageId: 'p1',
    parentId: null,
    position,
    name: id,
    notes: '',
    frozenNumber: null,
    priority: null,
    startNoEarlierThan: null,
    serviceTeamId: null,
    serviceId: null,
    maxParallel: 1,
    startNoEarlierThanReason: null,
    deadline: null,
    factStart: null,
    factEnd: null,
    readiness: null,
    hold: null,
    revision: 0,
  });

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-saved-plan-busy-svc-'));
    path = join(dir, 'test.db');
    custody = { hasUnknownOwner: false };
    await seedCurrentProjectFixture(
      {
        path,
        directory: dir,
        organizationId: 'fixture-legacy-org',
        projectId: 'fixture-project',
        stamp: wrote,
        definitions: [
          {
            id: 'st-1',
            code: 'dev',
            name: 'Dev',
            position: 10,
            defaultEstimateUnit: 'workdays',
            defaultAllowancePercent: 0,
          },
        ],
      },
      custody,
    );
    const seed = openConnection(path);
    const db = seed.db;
    const created = await new WorkPackageRepository(db, OPEN).create(
      workPackageRow({
        id: 'p1',
        name: 'Rewire the shed',
        projectId: 'fixture-project',
        estimateMethod: 'realistic',
        startDate: '2026-03-02',
      }),
      [],
      wrote,
    );
    const directory = new DirectoryRepository(db, OPEN);
    await directory.addTeam({ id: 't-platform', name: 'Platform' }, wrote);
    await directory.addPerson({ id: 'pp-ada', name: 'Ada' }, ['t-platform'], wrote);
    await new CapacityRepository(db, OPEN).set('p1', 't-platform', 4, wrote);
    const items = new WorkItemRepository(db, OPEN);
    await items.insert(item('wi-1', 10), [], wrote);
    await items.insert(item('wi-2', 20), [], wrote);
    seed.close();
    if (typeof created === 'string')
      throw new Error('saved plan fixture package refused: ' + created);
    reader = openConnection(path);
  });

  afterEach(async () => {
    await WriteLockHolder.stopAll();
    reader?.close();
    reader = undefined;
    if (!custody.hasUnknownOwner) rmSync(dir, { recursive: true });
  });

  const service = (): SavedPlanService =>
    new SavedPlanService({
      scheduler: fastScheduler,
      digest: nodeDigest,
      capture: new SavedPlanCaptureRepository({ openConnection: () => openConnection(path) }),
      plans: new SavedPlanRepository({ openConnection: () => openConnection(path) }),
      newId: () => 'sp-mine',
      now: () => OPENED_AT,
    });

  const headerIds = async (): Promise<string[]> =>
    (await readerDb(reader).select().from(savedPlan)).map((row) => row.id).sort();

  const itemIds = async (): Promise<string[]> =>
    (await readerDb(reader).select().from(workItem)).map((row) => row.id).sort();

  /**
   * The whole refusal, end to end, and the promise that comes with it.
   *
   * The repository-level test proves the mechanism; this one proves the service
   * reports it as itself rather than as a save, and — the half that only exists
   * at this level — that the refusal costs a concurrent editor nothing. The
   * edit waits behind the **other process**, which is where the write lock
   * actually is; it never waits behind this save, because this save is not
   * holding anything to wait for.
   *
   * No stopwatch: the holder commits 2.5 s after `go`, inside the 5 s a waiting
   * save would spend, so a save that queued behind it would answer `saved`.
   */
  it(
    'refuses at once and lets a live edit issued in the same window complete',
    async () => {
      const holder = await WriteLockHolder.hold(path, 'sp-other');

      await holder.go();
      const attempt = await service().save({
        workPackageId: 'p1',
        name: 'once more',
        createdBy: 'Ada Lovelace',
        createdById: null,
      });

      // Proof: with refuseToWaitForWriteLock removed from SavedPlanRepository.write
      // the save waited out the holder and this received `{ outcome: 'saved' }`;
      // watched 2026-09-29.
      expect(attempt).toEqual({ outcome: 'snapshot_busy' });
      // The other process was still inside its transaction when that answer
      // arrived, so it was contention that produced it.
      expect(await headerIds()).toEqual([]);

      // Issued while the holder still holds the lock, on a connection carrying
      // the ordinary 5 s `busy_timeout`, and nothing here tells the holder to
      // commit: `go`'s countdown does, inside that 5 s. So the edit waits for
      // the holder and then lands, which is the spec's "a live edit issued
      // during that window still completes". Releasing first would let the
      // holder commit before the edit began and skip the wait under load.
      await new WorkItemRepository(readerDb(reader), OPEN).insert(item('wi-3', 30), [], wrote);
      expect(await itemIds()).toEqual(['wi-1', 'wi-2', 'wi-3']);
      // The edit could only land after the holder committed.
      expect(await headerIds()).toEqual(['sp-other']);

      expect(await holder.finish()).toBe(0);
      // And the refused save wrote nothing: the only record is the other
      // process's.
      expect(await headerIds()).toEqual(['sp-other']);
    },
    HOLDER_CASE_BUDGET_MS,
  );
});
