import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Schedule } from '@wbs/domain';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { CapacityRepository } from '../repository/capacity';
import type { Connection } from '../repository/db';
import { openConnection } from '../repository/db';
import { DirectoryRepository } from '../repository/directory';
import type { WriteStamp } from '../repository/index';
import { runMigrations } from '../repository/migrate';
import { ProjectRepository } from '../repository/project';
import { SavedPlanRepository } from '../repository/saved-plan';
import type { PlanInputReads } from '../repository/saved-plan-capture';
import { SavedPlanCaptureRepository } from '../repository/saved-plan-capture';
import { savedPlan, savedPlanBody } from '../repository/schema';
import { UserRepository } from '../repository/user';
import { WorkItemRepository } from '../repository/work-item';
import { projectRow } from '../testing/project-fixture';
import { SavedPlanService } from './saved-plan.service';
import { bodySha256 } from './saved-plan-integrity';
import { schedulePlanInput } from './saved-plan-schedule';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

const wrote: WriteStamp = { at: 1, by: 'owner' };
const OPENED_AT = 1_756_000_123;

/**
 * The id a saved plan in this file was written under.
 *
 * A *recorded older* one, which is what task 5.1 asks for: the live constant is
 * `slice-leveling-v1` (`libs/domain/src/schedule.ts`), and a record stamped
 * with an id this build no longer produces is the only record that can tell a
 * reader-of-bytes apart from a reader-that-recomputes by anything other than
 * luck. Deliberately **not** imported from `SCHEDULE_ALGORITHM_ID` and not
 * asserted against it: this is a value out of the past, so a bump of that
 * constant must not silently move this fixture along with it.
 *
 * `schedule-algorithm-id.test.ts` and `live-plan-identity.test.ts` own the
 * question of what the *current* identity is and what changing it means. This
 * file borrows neither baseline; it only needs a value that is not the current
 * one.
 */
const OLDER_ALGORITHM_ID = 'slice-leveling-v0-retired';

/**
 * Tasks 5.1 and 5.1b — the read path returns stored bytes, and checks them.
 *
 * **Why a spy and not a comparison of dates.** A reader that re-derived the
 * schedule from the stored settings would produce the same dates the writer
 * did, so every assertion about *values* passes on both a correct reader and
 * the exact defect this slice exists to prevent. The observation that separates
 * them is whether the scheduler was called at all, so `SavedPlanService` takes
 * the scheduler as an option and this file hands it one that counts.
 *
 * **Why raw SQL.** 5.1b's negative needs a stored body whose bytes and hash
 * disagree, and no code path in this repository can produce one — that is 2.4's
 * whole point. A test that could only stage the fault through the writer would
 * be a test of the writer. `UPDATE` here is the fault being injected, not a
 * pattern the production path is allowed to copy.
 */
describe('reading a saved plan back', () => {
  let dir: string;
  let path: string;
  let reader: Connection;
  let scheduleCalls: PlanInputReads[];

  const item = (id: string, position: number) => ({
    id,
    projectId: 'p1',
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
    revision: 0,
  });

  beforeEach(async () => {
    scheduleCalls = [];
    dir = mkdtempSync(join(tmpdir(), 'wbs-saved-plan-read-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    const seed = openConnection(path);
    const db = seed.db;
    await new UserRepository(db).create(
      { id: 'owner', username: 'owner', passwordHash: 'x', createdAt: 1 },
      wrote,
    );
    await new ProjectRepository(db).create(
      projectRow({
        id: 'p1',
        name: 'Rewire the shed',
        ownerId: 'owner',
        estimateMethod: 'realistic',
        startDate: '2026-03-02',
      }),
      [{ id: 'st-1', projectId: 'p1', name: 'Dev', position: 10 }],
      wrote,
    );
    const directory = new DirectoryRepository(db);
    await directory.addTeam({ id: 't-platform', name: 'Platform' }, wrote);
    await directory.addPerson({ id: 'pp-ada', name: 'Ada' }, ['t-platform'], wrote);
    await new CapacityRepository(db).set('p1', 't-platform', 4, wrote);
    const items = new WorkItemRepository(db);
    await items.insert(item('wi-1', 10), [], wrote);
    await items.insert(item('wi-2', 20), [], wrote);
    seed.close();
    reader = openConnection(path);
  });

  afterEach(() => {
    reader.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /** The service under test, with a scheduler that records every call. */
  const service = (id = 'sp-1') =>
    new SavedPlanService({
      capture: new SavedPlanCaptureRepository({ openConnection: () => openConnection(path) }),
      plans: new SavedPlanRepository({ openConnection: () => openConnection(path) }),
      newId: () => id,
      now: () => OPENED_AT,
      schedule: (reads: PlanInputReads): Schedule => {
        scheduleCalls.push(reads);
        return schedulePlanInput(reads);
      },
    });

  /**
   * Saves one plan and back-stamps its `scheduler_algorithm_id` to an id this
   * build no longer produces — the "recorded older" record 5.1 asks for.
   */
  const saveUnderTheOlderAlgorithm = async () => {
    const saved = await service().save({
      projectId: 'p1',
      name: 'before the rewire',
      createdBy: 'Ada Lovelace',
    });
    if (saved.outcome !== 'saved') throw new Error(`expected a save, got ${saved.outcome}`);
    reader.db.run(
      `UPDATE saved_plan SET scheduler_algorithm_id = '${OLDER_ALGORITHM_ID}' WHERE id = 'sp-1'`,
    );
    return saved.record;
  };

  it('returns the stored bytes without calling the scheduler', async () => {
    const record = await saveUnderTheOlderAlgorithm();
    // The save is what called it. Zeroed here so the assertion after the read
    // is about the read alone.
    expect(scheduleCalls.length).toBe(1);
    scheduleCalls = [];

    const read = await service().read('sp-1');
    if (read.outcome !== 'read') throw new Error(`expected a read, got ${read.outcome}`);

    // THE PROPERTY: not one call into the scheduler on the read path.
    expect(scheduleCalls.length).toBe(0);

    // And what came back is the bytes on disk, byte for byte.
    const bodies = await reader.db.select().from(savedPlanBody);
    const stored = new Map(bodies.map((row) => [row.kind, row.bytes]));
    // Compared with the stored side as the *subject*, so the assertion carries
    // `string | undefined` and a body that turned out absent fails here rather
    // than being narrowed away with a `??` before it is ever compared.
    expect(stored.get('input')).toBe(read.plan.input.bytes);
    expect(read.plan.schedule.present).toBe(true);
    if (!read.plan.schedule.present) return;
    expect(stored.get('schedule')).toBe(read.plan.schedule.body.bytes);
    // The record still names the algorithm it was written under, rather than
    // the one this build would compute — a reader that re-derived would have
    // had to say `slice-leveling-v1` here.
    expect(read.plan.schedule.algorithmId).toBe(OLDER_ALGORITHM_ID);
    // The header, handed over as stored.
    expect(read.plan.input.sha256).toBe(record.input.sha256);
    expect(read.plan.createdAt).toBe(OPENED_AT);
    expect(read.plan.createdBy).toBe('Ada Lovelace');
    expect(read.plan.name).toBe('before the rewire');
    expect(read.plan.projectId).toBe('p1');
  });

  it('still returns those bytes when the live plan has moved underneath them', async () => {
    // The control the test above needs. A reader that recomputed would be
    // indistinguishable from one that did not while the live plan still matches
    // the capture; moving the live plan is what makes "the stored bytes" a
    // claim with a false version.
    await saveUnderTheOlderAlgorithm();
    const live = openConnection(path);
    await new WorkItemRepository(live.db).remove(['wi-2'], [], wrote);
    live.close();

    scheduleCalls = [];
    const read = await service().read('sp-1');
    if (read.outcome !== 'read') throw new Error(`expected a read, got ${read.outcome}`);
    expect(scheduleCalls.length).toBe(0);
    expect(read.plan.input.bytes).toContain('wi-2');
  });

  it('refuses a body whose stored bytes no longer hash to the header', async () => {
    await saveUnderTheOlderAlgorithm();
    // One byte, flipped underneath the record — 5.1b's negative. Appending
    // rather than substituting so the change is provably in the bytes and not
    // in some equal rendering of them.
    reader.db.run(`UPDATE saved_plan_body SET bytes = bytes || ' ' WHERE kind = 'input'`);

    const read = await service().read('sp-1');
    expect(read.outcome).toBe('corrupt');
    if (read.outcome !== 'corrupt') return;
    expect(read.refusal.reason).toBe('body_hash_mismatch');
    expect(read.refusal.savedPlanId).toBe('sp-1');
    expect(read.refusal.body).toBe('input');
  });

  it('refuses the schedule side by itself, naming that body and not the input', async () => {
    // The refusal has to name *which* half, or a reader holding a good input
    // and a corrupt schedule is told the whole record is untrustworthy.
    await saveUnderTheOlderAlgorithm();
    reader.db.run(`UPDATE saved_plan_body SET bytes = bytes || ' ' WHERE kind = 'schedule'`);

    const read = await service().read('sp-1');
    if (read.outcome !== 'corrupt') throw new Error(`expected a refusal, got ${read.outcome}`);
    expect(read.refusal.body).toBe('schedule');
    expect(read.refusal.reason).toBe('body_hash_mismatch');
  });

  it('refuses a header whose body row is gone', async () => {
    await saveUnderTheOlderAlgorithm();
    reader.db.run(`DELETE FROM saved_plan_body WHERE kind = 'input'`);

    const read = await service().read('sp-1');
    if (read.outcome !== 'corrupt') throw new Error(`expected a refusal, got ${read.outcome}`);
    expect(read.refusal).toEqual({ reason: 'body_missing', savedPlanId: 'sp-1', body: 'input' });
  });

  it('reports a plan that was never saved as absent, not as corrupt', async () => {
    const read = await service().read('sp-does-not-exist');
    expect(read.outcome).toBe('not_found');
  });

  it('watched negative: a read that skips the recomputation accepts the flipped byte', async () => {
    // The assertion that makes the refusals above mean something. Recomputing
    // the digest and comparing it against the header is the only step between
    // this record and a plan the reader would hand over as saved; here the same
    // record is verified with the header's own hash restated over the *new*
    // bytes, which is what a reader that trusted the column would effectively
    // be doing.
    await saveUnderTheOlderAlgorithm();
    reader.db.run(`UPDATE saved_plan_body SET bytes = bytes || ' ' WHERE kind = 'input'`);
    const rows = await reader.db.select().from(savedPlanBody);
    const flipped = rows.find((row) => row.kind === 'input');
    expect(flipped).toBeDefined();
    if (flipped === undefined) return;
    const headers = await reader.db.select().from(savedPlan);
    // Trusting the stored column: the two disagree, which is the fault.
    expect(bodySha256(flipped.bytes)).not.toBe(headers[0].inputSha256);
    // And re-stamping the header the way a "repair" would makes the record read
    // clean again — which is exactly why 5.1b forbids one.
    reader.db.run(
      `UPDATE saved_plan SET input_sha256 = '${bodySha256(flipped.bytes)}' WHERE id = 'sp-1'`,
    );
    const repaired = await service().read('sp-1');
    expect(repaired.outcome).toBe('read');
  });
});
