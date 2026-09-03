import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { CapacityRepository } from '../repository/capacity';
import type { Connection } from '../repository/db';
import { openConnection } from '../repository/db';
import { DirectoryRepository } from '../repository/directory';
import type { WriteStamp } from '../repository/index';
import { runMigrations } from '../repository/migrate';
import { ProjectRepository } from '../repository/project';
import { SavedPlanRepository } from '../repository/saved-plan';
import { SavedPlanCaptureRepository } from '../repository/saved-plan-capture';
import { savedPlan, savedPlanBody } from '../repository/schema';
import { StepRepository } from '../repository/step';
import { UserRepository } from '../repository/user';
import { WorkItemRepository } from '../repository/work-item';
import { projectRow } from '../testing/project-fixture';
import { SavedPlanService } from './saved-plan.service';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

const wrote: WriteStamp = { at: 1, by: 'owner' };
const OPENED_AT = 1_756_000_123;

const sha256 = (bytes: string): string =>
  createHash('sha256').update(bytes, 'utf8').digest('hex');

/**
 * Task 4.2 — **immutability asserted by hash, not by field list.**
 *
 * A field-by-field comparison of the stored body against the live plan stays
 * green for every field the writer forgot to store: both sides are missing it,
 * so both sides agree. Hashing the whole body removes that escape — the digest
 * covers what was written, including the parts nobody thought to assert — so
 * this file compares **bytes and both SHA-256 values** before and after the live
 * plan moves under the record, and nothing else.
 */
describe('a saved plan does not move when the live plan does', () => {
  let dir: string;
  let path: string;
  let reader: Connection;

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
    dir = mkdtempSync(join(tmpdir(), 'wbs-saved-plan-immutable-'));
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
      [
        { id: 'st-1', projectId: 'p1', name: 'Dev', position: 10 },
        { id: 'st-2', projectId: 'p1', name: 'Review', position: 20 },
      ],
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

  const save = () =>
    new SavedPlanService({
      capture: new SavedPlanCaptureRepository({ openConnection: () => openConnection(path) }),
      plans: new SavedPlanRepository({ openConnection: () => openConnection(path) }),
      newId: () => 'sp-1',
      now: () => OPENED_AT,
    }).save({ projectId: 'p1', name: 'before the rewire', createdBy: 'Ada Lovelace' });

  /** Everything the record holds, read the way another process would read it. */
  const stored = async (): Promise<{
    header: Record<string, unknown>;
    bodies: Record<string, string>;
  }> => {
    const headers = await reader.db.select().from(savedPlan);
    expect(headers.length).toBe(1);
    const rows = await reader.db.select().from(savedPlanBody);
    const bodies: Record<string, string> = {};
    for (const row of rows) bodies[row.kind] = row.bytes;
    return { header: headers[0] as unknown as Record<string, unknown>, bodies };
  };

  it('keeps both bodies and both hashes byte-identical across five live edits', async () => {
    const saved = await save();
    expect(saved.outcome).toBe('saved');
    const before = await stored();

    const live = openConnection(path);
    const items = new WorkItemRepository(live.db);
    // The five edits task 4.2 names, and they are five because each reaches the
    // capture by a different route: a column, a deleted row, a deleted row in
    // another table, a scheduling *rule*, and the calendar the dates count from.
    await items.patch('wi-1', { name: 'renamed after the save' }, wrote);
    await items.remove(['wi-2'], [], wrote);
    await new StepRepository(live.db).remove('p1', 'st-2', true, wrote);
    await new ProjectRepository(live.db).update(
      'p1',
      { estimateMethod: 'optimistic', startDate: '2027-01-04' },
      wrote,
    );
    live.close();

    // The live plan really did move — otherwise the assertions below are a
    // comparison of a record against itself and would pass on any writer.
    const moved = openConnection(path);
    const nowItems = await new WorkItemRepository(moved.db).listByProject('p1');
    const nowProject = await new ProjectRepository(moved.db).findById('p1');
    const nowSteps = await new ProjectRepository(moved.db).stepsOf('p1');
    moved.close();
    expect(nowItems.map((row) => row.name)).toEqual(['renamed after the save']);
    expect(nowSteps.map((row) => row.id)).toEqual(['st-1']);
    expect(nowProject?.estimateMethod).toBe('optimistic');
    expect(nowProject?.startDate).toBe('2027-01-04');

    const after = await stored();
    // Bytes first: this is the property, and the hashes below are the check a
    // reader can make cheaply once it holds them.
    expect(after.bodies).toEqual(before.bodies);
    expect(sha256(after.bodies.input)).toBe(before.header.inputSha256);
    expect(sha256(after.bodies.schedule)).toBe(before.header.scheduleSha256);
    // The whole header, not the two hash columns: `input_bytes`,
    // `scheduler_algorithm_id` and `created_at` are as restatable as the digests
    // are, and an assertion on the hashes alone would not notice them moving.
    expect(after.header).toEqual(before.header);
    // And the saved plan still names the item the live plan no longer has.
    expect(before.bodies.input).toContain('wi-2');
  });
});
