import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import type { Connection } from './db';
import { openConnection } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { ProjectRepository } from './project';
import type { SavedPlanWrite } from './saved-plan';
import { SavedPlanRepository } from './saved-plan';
import { savedPlan } from './schema';
import { HOLDER_CASE_BUDGET_MS, WriteLockHolder } from './testing/write-lock-holder';
import { UserRepository } from './user';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;

const wrote: WriteStamp = { at: 1, by: 'owner' };

/** A plausible header and one small body. The bytes are not the subject here. */
const record = (id: string): SavedPlanWrite => ({
  id,
  projectId: 'p1',
  name: id,
  createdBy: 'Ada Lovelace',
  createdById: null,
  createdAt: 1_756_000_123,
  input: { schemaVersion: 1, bytes: '{"schemaVersion":1}', sha256: 'a'.repeat(64) },
  schedule: { present: false, absentReason: 'pending' },
});

describe('a save that meets a held write lock is refused, not queued behind it', () => {
  let dir: string;
  let path: string;
  let reader: Connection;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-saved-plan-busy-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    const seed = openConnection(path);
    await new UserRepository(seed.db, OPEN).create(
      { id: 'owner', username: 'owner', passwordHash: 'x', createdAt: 1 },
      wrote,
    );
    await new ProjectRepository(seed.db, OPEN).create(
      projectRow({ id: 'p1', name: 'Rewire the shed', ownerId: 'owner' }),
      [
        {
          id: 'st-1',
          projectId: 'p1',
          name: 'Dev',
          position: 10,
          code: 'dev',
          allowancePercent: 0,
        },
      ],
      wrote,
    );
    seed.close();
    reader = openConnection(path);
  });

  afterEach(async () => {
    await WriteLockHolder.stopAll();
    reader.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const plans = (): SavedPlanRepository =>
    new SavedPlanRepository({ openConnection: () => openConnection(path) });

  const headerIds = async (): Promise<string[]> =>
    (await reader.db.select().from(savedPlan)).map((row) => row.id).sort();

  it(
    'refuses at once while the other process is still writing, and only that process commits',
    async () => {
      const holder = await WriteLockHolder.hold(path, 'sp-other');

      // Nothing is visible yet: the holder is inside its transaction. This is
      // what "before the first has finished writing" means, and it is asserted
      // rather than assumed, because a refusal that arrived after the rival had
      // committed would be a different (and permitted) event.
      expect(await headerIds()).toEqual([]);

      await holder.go();
      const attempt = await plans().write<'over'>(record('sp-mine'), () => Promise.resolve(null));

      // The whole point of `busy_timeout = 0`, told apart from a wait by outcome
      // rather than by a stopwatch. At the connection default this call waits;
      // the holder commits 2.5 s after `go`, inside that 5 s wait, and the
      // waiting save then succeeds, having held every live edit in the project
      // behind it for the duration.
      // Proof: with refuseToWaitForWriteLock removed from SavedPlanRepository.write
      // this received `{ outcome: 'written' }`; watched 2026-09-29.
      expect(attempt).toEqual({ outcome: 'snapshot_busy' });
      // And the rival was genuinely still holding when the refusal arrived, so
      // the refusal measured contention rather than an empty file.
      expect(await headerIds()).toEqual([]);

      await holder.release();
      expect(await holder.finish()).toBe(0);
      // One record, not two: the save was refused rather than serialised behind
      // the other process. A marker in this process's memory would not have been
      // able to see that writer at all, and both would be here.
      expect(await headerIds()).toEqual(['sp-other']);
    },
    HOLDER_CASE_BUDGET_MS,
  );

  it(
    'writes normally once the other process has committed, on a fresh attempt',
    async () => {
      const holder = await WriteLockHolder.hold(path, 'sp-other');
      await holder.release();
      expect(await holder.finish()).toBe(0);

      // The refusal is about *this instant* and nothing else: with the lock
      // released the very same call succeeds, which is why the outcome is
      // separate from a quota refusal that would still be true a second later.
      expect(await plans().write<'over'>(record('sp-mine'), () => Promise.resolve(null))).toEqual({
        outcome: 'written',
      });
      expect(await headerIds()).toEqual(['sp-mine', 'sp-other']);
    },
    HOLDER_CASE_BUDGET_MS,
  );
});
