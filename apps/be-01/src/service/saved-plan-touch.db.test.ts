import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { Connection } from '../repository/db';
import { openConnection } from '../repository/db';
import type { WriteStamp } from '../repository/index';
import { runMigrations } from '../repository/migrate';
import { ProjectRepository } from '../repository/project';
import { SavedPlanRepository } from '../repository/saved-plan';
import { SavedPlanCaptureRepository } from '../repository/saved-plan-capture';
import { savedPlan, savedPlanBody } from '../repository/schema';
import { UserRepository } from '../repository/user';
import { WorkItemRepository } from '../repository/work-item';
import { projectRow } from '../testing/project-fixture';
import { SavedPlanService } from './saved-plan.service';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

const wrote: WriteStamp = { at: 1, by: 'owner' };

/**
 * Task 6.1's rename and delete, at the service — the permission rule and
 * nothing else.
 *
 * Three accounts, because two cannot tell the rule apart from its wrong
 * versions: `owner` owns the project, `ada` created the plans, and `mallory` is
 * the third party. A creator who is *not* the owner is what separates "creator
 * or owner" from "owner only"; an owner who is not the creator is what separates
 * it from a fallback ternary that would compare the actor against `created_by_id`
 * whenever one is set and leave the owner unable to tidy up their own project.
 *
 * Every refusal is asserted by **observation as well as by outcome** — the
 * stored name is re-read, the row is re-counted — because a wrapper that
 * returned `forbidden` after issuing the write would pass an outcome-only test
 * while being the exact defect the wrapper exists to prevent.
 */
describe('renaming and deleting a saved plan', () => {
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
    dir = mkdtempSync(join(tmpdir(), 'wbs-saved-plan-touch-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    const seed = openConnection(path);
    const db = seed.db;
    const users = new UserRepository(db);
    for (const id of ['owner', 'ada', 'mallory']) {
      await users.create({ id, username: id, passwordHash: 'x', createdAt: 1 }, wrote);
    }
    await new ProjectRepository(db).create(
      projectRow({ id: 'p1', name: 'Rewire the shed', ownerId: 'owner' }),
      [{ id: 'st-1', projectId: 'p1', name: 'Dev', position: 10 }],
      wrote,
    );
    await new WorkItemRepository(db).insert(item('wi-1', 10), [], wrote);
    seed.close();
    reader = openConnection(path);
  });

  afterEach(() => {
    reader.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const service = (id = 'never-minted', at = Number.NaN) =>
    new SavedPlanService({
      capture: new SavedPlanCaptureRepository({ openConnection: () => openConnection(path) }),
      plans: new SavedPlanRepository({ openConnection: () => openConnection(path) }),
      newId: () => id,
      now: () => at,
    });

  /**
   * `createdBy` is a display name and `createdById` is the reference, and they
   * are deliberately *different strings* in every fixture here: equal ones would
   * let a rule that read the display name pass every assertion below.
   */
  const save = (id: string, createdById: string | null) =>
    service(id, 1_756_000_000).save({
      projectId: 'p1',
      name: 'before the rewire',
      createdBy: 'Ada Lovelace',
      createdById,
    });

  const nameOf = async (id: string): Promise<string | null> => {
    const rows = await reader.db
      .select({ name: savedPlan.name })
      .from(savedPlan)
      .where(eq(savedPlan.id, id));
    return rows[0]?.name ?? null;
  };

  const bodyCount = async (id: string): Promise<number> => {
    const rows = await reader.db
      .select({ id: savedPlanBody.savedPlanId })
      .from(savedPlanBody)
      .where(eq(savedPlanBody.savedPlanId, id));
    return rows.length;
  };

  it('lets the creator rename their own plan', async () => {
    await save('sp-1', 'ada');

    expect(await service().rename('sp-1', 'ada', 'after the rewire')).toEqual({
      outcome: 'touched',
    });
    expect(await nameOf('sp-1')).toBe('after the rewire');
  });

  /**
   * The project owner, on a plan somebody else created. This is the case the
   * "fall back to the project owner" sentence in A-8 does **not** mean: the
   * fallback is what `null` leaves, not a choice between the two ids, and an
   * owner who could not touch a plan saved on their own project would be unable
   * to reclaim its quota.
   */
  it('lets the project owner rename a plan somebody else created', async () => {
    await save('sp-1', 'ada');

    expect(await service().rename('sp-1', 'owner', 'after the rewire')).toEqual({
      outcome: 'touched',
    });
    expect(await nameOf('sp-1')).toBe('after the rewire');
  });

  it('refuses a third party, and writes nothing', async () => {
    await save('sp-1', 'ada');

    expect(await service().rename('sp-1', 'mallory', 'mine now')).toEqual({
      outcome: 'forbidden',
    });
    expect(await nameOf('sp-1')).toBe('before the rewire');

    expect(await service().delete('sp-1', 'mallory')).toEqual({ outcome: 'forbidden' });
    expect(await nameOf('sp-1')).toBe('before the rewire');
    expect(await bodyCount('sp-1')).toBe(2);
  });

  /**
   * The `null` creator — a plan whose creator's account is gone, or one written
   * before the column existed. The owner is then the only account left that may
   * touch it, which is the whole of what "falls back to the project owner"
   * means, and the third party is still refused.
   */
  it('falls back to the project owner when no account claims the plan', async () => {
    await save('sp-1', null);

    expect(await service().rename('sp-1', 'mallory', 'mine now')).toEqual({
      outcome: 'forbidden',
    });
    expect(await nameOf('sp-1')).toBe('before the rewire');

    expect(await service().rename('sp-1', 'owner', 'tidied up')).toEqual({ outcome: 'touched' });
    expect(await nameOf('sp-1')).toBe('tidied up');
  });

  it('deletes the header and its bodies', async () => {
    await save('sp-1', 'ada');
    expect(await bodyCount('sp-1')).toBe(2);

    expect(await service().delete('sp-1', 'ada')).toEqual({ outcome: 'touched' });

    expect(await nameOf('sp-1')).toBeNull();
    expect(await bodyCount('sp-1')).toBe(0);
  });

  /**
   * The reason the rule is built on `principalsOf` and not on `read`. `read`
   * verifies every stored byte and answers `corrupt` for this plan; if
   * authorisation went through it, a damaged plan would be undeletable and would
   * hold its project's quota forever with nothing able to reach it.
   */
  it('renames and deletes a plan whose stored bytes are damaged', async () => {
    await save('sp-1', 'ada');
    reader.db.run(`UPDATE saved_plan_body SET bytes = bytes || ' ' WHERE saved_plan_id = 'sp-1'`);
    expect((await service().read('sp-1')).outcome).toBe('corrupt');

    expect(await service().rename('sp-1', 'ada', 'damaged, and still mine')).toEqual({
      outcome: 'touched',
    });
    expect(await nameOf('sp-1')).toBe('damaged, and still mine');

    expect(await service().delete('sp-1', 'ada')).toEqual({ outcome: 'touched' });
    expect(await nameOf('sp-1')).toBeNull();
  });

  /**
   * A plan that is not there is `not_found` and never `forbidden`: the actor's
   * right cannot be decided at all, and answering `forbidden` would tell every
   * caller that a plan they may not touch exists.
   */
  it('answers not_found for a plan that is not there', async () => {
    expect(await service().rename('sp-missing', 'owner', 'anything')).toEqual({
      outcome: 'not_found',
    });
    expect(await service().delete('sp-missing', 'owner')).toEqual({ outcome: 'not_found' });
  });
});
