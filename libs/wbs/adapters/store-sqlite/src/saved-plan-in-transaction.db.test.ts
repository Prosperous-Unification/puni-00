import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { buildStores } from './build-stores';
import type { Connection } from './db';
import { openConnection, refuseToWaitForWriteLock } from './db';
import { OPEN, WriteCoordinator } from './gate';
import type { SavedPlanHoldingRow, SavedPlanWrite, SavedPlanWriteOutcome } from './saved-plan';
import { SavedPlanRepository } from './saved-plan';
import { savedPlan } from './schema';
import { sqliteUnitOfWork } from './sqlite-unit-of-work';
import { seedCurrentProjectFixture } from './testing/current-project-fixture';
import { WorkPackageRepository } from './work-package';

function readerDb(reader: Connection | undefined): Connection['db'] {
  if (reader === undefined) throw new Error('saved-plan fixture reader was not acquired');
  return reader.db;
}

const wrote: WriteStamp = { at: 1, by: 'owner' };

/** A plausible header and one small body. The bytes are not the subject here. */
const record = (id: string): SavedPlanWrite => ({
  id,
  workPackageId: 'p1',
  name: id,
  createdBy: 'Ada Lovelace',
  createdById: null,
  createdAt: 1_756_000_123,
  input: { schemaVersion: 1, bytes: '{"schemaVersion":1}', sha256: 'a'.repeat(64) },
  schedule: { present: false, absentReason: 'pending' },
});

describe('the quota is read inside the transaction that would write', () => {
  let dir: string;
  let path: string;
  let reader: Connection | undefined;
  let custody: { hasUnknownOwner: boolean };

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-saved-plan-in-tx-'));
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
    const created = await new WorkPackageRepository(seed.db, OPEN).create(
      workPackageRow({ id: 'p1', name: 'Rewire the shed', projectId: 'fixture-project' }),
      [],
      wrote,
    );
    seed.close();
    if (typeof created === 'string')
      throw new Error('saved plan fixture package refused: ' + created);
    reader = openConnection(path);
  });

  afterEach(() => {
    reader?.close();
    reader = undefined;
    if (!custody.hasUnknownOwner) rmSync(dir, { recursive: true });
  });

  const plans = (): SavedPlanRepository =>
    new SavedPlanRepository({ openConnection: () => openConnection(path) });

  const headers = () => readerDb(reader).select().from(savedPlan);

  /**
   * A rival save's commit, attempted from a **second** connection.
   *
   * This is the whole test. `Promise.all` over two `save` calls cannot express
   * the race: `bun:sqlite` is synchronous, so the second `BEGIN IMMEDIATE`
   * blocks the only thread that could ever let the first one reach its commit,
   * and the pair deadlocks into a `busy_timeout` rather than interleaving. A
   * rival driven from *inside* the check callback is the same interleaving —
   * "the moment between reading the count and writing the row" — made
   * deterministic and single-threaded.
   *
   * Returns whether SQLite let the rival in.
   */
  const rivalCommits = (id: string): boolean => {
    const rival = openConnection(path);
    try {
      // `busy_timeout` **0**, through the same function the writer itself uses,
      // set after `openConnection`'s assertion rather than instead of it: the
      // refusal under test is the immediate one, and at the connection default
      // of 5 s the wait alone outlives bun's per-test budget. One spelling of
      // the setting, so a rival here fails the way a second save is meant to.
      refuseToWaitForWriteLock(rival.db);
      rival.db
        .insert(savedPlan)
        .values({
          id,
          workPackageId: 'p1',
          name: id,
          createdBy: 'Rival',
          createdById: null,
          createdAt: 1_756_000_124,
          inputSchemaVersion: 1,
          inputBytes: 19,
          inputSha256: 'b'.repeat(64),
          scheduleSchemaVersion: null,
          scheduleBytes: null,
          scheduleSha256: null,
          scheduleInputSha256: null,
          schedulerAlgorithmId: null,
          scheduleAbsentReason: 'pending',
        })
        .run();
      return true;
    } catch {
      // SQLITE_BUSY: the write lock the save under test is holding. Swallowed
      // rather than rethrown because "the rival could not get in" is the
      // property, and the assertion on the return value is where it is stated.
      return false;
    } finally {
      rival.close();
    }
  };

  it('holds the write lock across the check, so no rival can commit between read and write', async () => {
    // One held, a limit of two: the save under test is the last one that fits,
    // which is the state where a rival slipping in is the difference between
    // holding two and holding three.
    expect(await plans().write(record('sp-held'), () => Promise.resolve(null))).toEqual({
      outcome: 'written',
    });

    // Collected into arrays rather than assigned to nullable locals: an
    // assignment inside a callback stays `null` to TypeScript's narrowing, and
    // the length also says the check ran exactly once.
    const saw: SavedPlanHoldingRow[] = [];
    const rivalGotIn: boolean[] = [];
    const attempt = await plans().write<'over'>(record('sp-last'), (holding) => {
      saw.push(holding);
      // Attempted at exactly the instant the count has been read and the row
      // has not been written yet — the window the bound lives or dies in.
      rivalGotIn.push(rivalCommits('sp-rival'));
      return Promise.resolve(holding.plans + 1 > 2 ? 'over' : null);
    });

    // The count was read once, from inside the transaction, and it saw the held
    // plan.
    expect(saw).toEqual([{ plans: 1, bytes: 19 }]);
    // And SQLite refused the rival, because `BEGIN IMMEDIATE` was already held.
    // This is the SQLite-visible mechanism, not an in-process marker: the rival
    // is a different connection to the same file, which is what blue and green
    // are.
    expect(rivalGotIn).toEqual([false]);
    expect(attempt).toEqual({ outcome: 'written' });

    // Two, not three: the last slot went to the save that held the lock.
    expect((await headers()).map((row) => row.id).sort()).toEqual(['sp-held', 'sp-last']);
  });
});

/**
 * Case (j) of the source kit's admission list, on the production call path.
 *
 * A saved plan is **independent of every batch** (D12, D27): it takes no turn at
 * the write coordinator, so it neither waits for an open batch nor is undone by
 * one. Both halves matter and they fail for different reasons — a save that
 * waited would be a save an editing session can stall, and a save a rollback
 * took would be a plan somebody made and cannot find.
 *
 * Written here rather than in the kit for now because the kit is a store kit
 * and this is a claim about **two stores at once**; it moves with the rest in
 * slice 5, where `sourceConformance` composes them.
 */
describe('a saved plan is independent of the batch beside it', () => {
  let dir: string;
  let path: string;
  let reader: Connection | undefined;
  let custody: { hasUnknownOwner: boolean };

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-saved-plan-independent-'));
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
    const created = await new WorkPackageRepository(seed.db, OPEN).create(
      workPackageRow({ id: 'p1', name: 'Rewire the shed', projectId: 'fixture-project' }),
      [],
      wrote,
    );
    seed.close();
    if (typeof created === 'string')
      throw new Error('saved plan fixture package refused: ' + created);
    reader = openConnection(path);
  });

  afterEach(() => {
    reader?.close();
    reader = undefined;
    if (!custody.hasUnknownOwner) rmSync(dir, { recursive: true });
  });

  const savedNames = async (): Promise<string[]> =>
    (await readerDb(reader).select().from(savedPlan)).map((row) => row.name);

  for (const outcome of ['commit', 'rollback'] as const) {
    it(`survives a batch that ends in ${outcome}`, async () => {
      const process = openConnection(path);
      const coordinator = new WriteCoordinator();
      const uow = sqliteUnitOfWork(process.db, coordinator, {
        createScope: () => ({ stores: buildStores(process.db, OPEN) }),
        createRepairScope: () => ({ stores: buildStores(process.db, OPEN) }),
      });
      const plans = new SavedPlanRepository({ openConnection: () => openConnection(path) });

      // Collected into an array rather than assigned to a nullable local, for
      // the reason the case above gives: an assignment inside a callback stays
      // at its initial type to TypeScript's narrowing.
      const saved: SavedPlanWriteOutcome<null>[] = [];
      try {
        await uow.run<'done'>(async (scope) => {
          await scope.stores.workItems.insert(
            workItemRow({ id: 'wi-1', workPackageId: 'p1' }),
            [],
            wrote,
          );
          // Inside the batch's own turn, from outside the batch: a save that
          // asked the coordinator for a turn would wait for this one and the
          // case would time out. Proof: `SavedPlanRepository.write` given the
          // process gate — `await coordinator.enter(...)` around its body —
          // failed on `this test timed out after 5000ms`. Watched 2026-09-08.
          saved.push(await plans.write(record('sp-beside'), () => Promise.resolve(null)));
          return outcome === 'commit'
            ? { commit: true, value: 'done' }
            : { commit: false, value: 'done' };
        });
      } finally {
        process.close();
      }

      // Either it got in, or it met the database's own write lock and said so —
      // never "waited for the batch".
      const outcomeOfSave = saved.at(0);
      if (outcomeOfSave === undefined) throw new Error('the save never ran beside the batch');
      expect(['written', 'snapshot_busy']).toContain(outcomeOfSave.outcome);
      if (outcomeOfSave.outcome !== 'written') return;
      // And a save that succeeded is still there whichever way the batch went.
      // Proof: the rollback arm run against a source that swept saved plans
      // into the batch's transaction is what D27 exists to forbid; the memory
      // source's version of that fault — history put back inside the swapped
      // clone — is slice 5's, where a memory source exists to break.
      expect(await savedNames()).toContain('sp-beside');
    });
  }
});
