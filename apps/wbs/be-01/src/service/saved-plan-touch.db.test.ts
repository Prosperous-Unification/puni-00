import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SavedPlanService } from '@wbs/core/service/saved-plan.service';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openConnection, openDatabase } from '../repository/db';
import { OPEN } from '../repository/gate';
import type { WriteStamp } from '../repository/index';
import { SavedPlanRepository } from '../repository/saved-plan';
import { SavedPlanCaptureRepository } from '../repository/saved-plan-capture';
import { UserRepository } from '../repository/user';
import { WorkItemRepository } from '../repository/work-item';
import { WorkPackageRepository } from '../repository/work-package';
import { nodeDigest } from '../runtime/bun-runtime';
import { migrateOrganizationCatalogueFixture } from '../testing/organization-catalogue-fixture';
import { seedLegacyProject } from '../testing/project-fixture';
import { bindProjectFixtureSteps } from '../testing/project-steps';
import { workPackageRow } from '../testing/work-package-fixture';
import { fastScheduler } from './optimizer-wiring';

const wrote: WriteStamp = { at: 1, by: 'owner' };

/**
 * Task 6.1's rename and delete, at the service — the permission rule and
 * nothing else.
 *
 * Three accounts, because two cannot tell the rule apart from its wrong
 * versions: `owner` owns the work package, `ada` created the plans, and `mallory` is
 * the third party. A creator who is *not* the owner is what separates "creator
 * or owner" from "owner only"; an owner who is not the creator is what separates
 * it from a fallback ternary that would compare the actor against `created_by_id`
 * whenever one is set and leave the owner unable to tidy up their own work package.
 *
 * Every refusal is asserted by **observation as well as by outcome** — the
 * stored name is re-read, the row is re-counted — because a wrapper that
 * returned `forbidden` after issuing the write would pass an outcome-only test
 * while being the exact defect the wrapper exists to prevent.
 */
// Historical owner-fallback rationale below is retained as the original Task6.1/6.3 record.
// Current legacy header touches require the saved plan's nonnull author; package audit actors grant no fallback.
describe('renaming and deleting a saved plan', () => {
  let dir: string;
  let path: string;
  /**
   * A raw handle, not a `Connection`: `drizzle-orm` is a restricted import in
   * `service/` — the rule that keeps query building in `repository/` — so the
   * two observations below are written as SQL rather than as a query builder
   * this layer is not allowed to hold.
   */
  let reader: ReturnType<typeof openDatabase>;

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
    dir = mkdtempSync(join(tmpdir(), 'wbs-saved-plan-touch-'));
    path = join(dir, 'test.db');
    migrateOrganizationCatalogueFixture(path);
    seedLegacyProject(path, 'saved-plan-legacy', 'saved-plan-parent');
    const seed = openConnection(path);
    const db = seed.db;
    const users = new UserRepository(db, OPEN);
    for (const id of ['owner', 'ada', 'mallory']) {
      await users.create({ id, username: id, passwordHash: 'x', createdAt: 1 }, wrote);
    }
    await bindProjectFixtureSteps(
      db,
      'saved-plan-legacy',
      'saved-plan-parent',
      [['st-1', 'dev', 'Dev', 10]],
      wrote,
    );
    await new WorkPackageRepository(db, OPEN).create(
      workPackageRow({ id: 'p1', name: 'Rewire the shed', projectId: 'saved-plan-parent' }),
      [],
      wrote,
    );
    await new WorkItemRepository(db, OPEN).insert(item('wi-1', 10), [], wrote);
    seed.close();
    reader = openDatabase(path);
  });

  afterEach(() => {
    reader.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const service = (id = 'never-minted', at = Number.NaN) =>
    new SavedPlanService({
      scheduler: fastScheduler,
      digest: nodeDigest,
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
      workPackageId: 'p1',
      name: 'before the rewire',
      createdBy: 'Ada Lovelace',
      createdById,
    });

  const nameOf = (id: string): string | null => {
    const row = reader.query('SELECT name FROM saved_plan WHERE id = ?').get(id) as
      { name: string } | undefined | null;
    return row?.name ?? null;
  };

  /**
   * The two creator columns as the row actually holds them — the display name
   * and the reference, read together so a test cannot assert one and infer the
   * other.
   */
  const creatorOf = (id: string) =>
    reader.query('SELECT created_by, created_by_id FROM saved_plan WHERE id = ?').get(id) as {
      created_by: string;
      created_by_id: string | null;
    } | null;

  const bodyCount = (id: string): number => {
    const row = reader
      .query('SELECT count(*) AS n FROM saved_plan_body WHERE saved_plan_id = ?')
      .get(id) as { n: number };
    return row.n;
  };

  it('lets the creator rename their own plan', async () => {
    await save('sp-1', 'ada');

    expect(
      await service().rename('sp-1', 'ada', 'after the rewire', {
        kind: 'legacy',
        actorId: 'ada',
        source: 'internal',
        operation: 'rename',
      }),
    ).toEqual({
      outcome: 'touched',
      workPackageId: 'p1',
    });
    expect(nameOf('sp-1')).toBe('after the rewire');
  });

  /**
   * The work package owner, on a plan somebody else created. This is the case the
   * "fall back to the work package owner" sentence in A-8 does **not** mean: the
   * fallback is what `null` leaves, not a choice between the two ids, and an
   * owner who could not touch a plan saved on their own work package would be unable
   * to reclaim its quota.
   */
  it('refuses the package audit actor when a different saved author is recorded', async () => {
    await save('sp-1', 'ada');

    expect(
      await service().rename('sp-1', 'owner', 'after the rewire', {
        kind: 'legacy',
        actorId: 'owner',
        source: 'internal',
        operation: 'rename',
      }),
    ).toEqual({
      outcome: 'forbidden',
    });
    expect(nameOf('sp-1')).toBe('before the rewire');
    expect(bodyCount('sp-1')).toBe(2);
  });

  it('refuses a third party, and writes nothing', async () => {
    await save('sp-1', 'ada');

    expect(
      await service().rename('sp-1', 'mallory', 'mine now', {
        kind: 'legacy',
        actorId: 'mallory',
        source: 'internal',
        operation: 'rename',
      }),
    ).toEqual({
      outcome: 'forbidden',
    });
    expect(nameOf('sp-1')).toBe('before the rewire');

    expect(
      await service().delete('sp-1', 'mallory', {
        kind: 'legacy',
        actorId: 'mallory',
        source: 'internal',
        operation: 'delete',
      }),
    ).toEqual({ outcome: 'forbidden' });
    expect(nameOf('sp-1')).toBe('before the rewire');
    expect(bodyCount('sp-1')).toBe(2);
  });

  /**
   * The `null` creator — a plan whose creator's account is gone, or one written
   * before the column existed. The owner is then the only account left that may
   * touch it, which is the whole of what "falls back to the work package owner"
   * means, and the third party is still refused.
   */
  it('refuses every actor when no saved author account is recorded', async () => {
    await save('sp-1', null);

    expect(
      await service().rename('sp-1', 'mallory', 'mine now', {
        kind: 'legacy',
        actorId: 'mallory',
        source: 'internal',
        operation: 'rename',
      }),
    ).toEqual({
      outcome: 'forbidden',
    });
    expect(nameOf('sp-1')).toBe('before the rewire');

    expect(
      await service().rename('sp-1', 'owner', 'tidied up', {
        kind: 'legacy',
        actorId: 'owner',
        source: 'internal',
        operation: 'rename',
      }),
    ).toEqual({
      outcome: 'forbidden',
    });
    expect(nameOf('sp-1')).toBe('before the rewire');
    expect(bodyCount('sp-1')).toBe(2);
    expect(
      await service().delete('sp-1', 'owner', {
        kind: 'legacy',
        actorId: 'owner',
        source: 'internal',
        operation: 'delete',
      }),
    ).toEqual({ outcome: 'forbidden' });
    expect(bodyCount('sp-1')).toBe(2);
  });

  /**
   * Task 6.3, **both halves at once and in the order they really happen.**
   *
   * The storage half is proved in
   * `repository/saved-plan-created-by-id.db.test.ts` — the constraint nulls the
   * reference and keeps the value — and the rule half is proved by the `null`
   * case above. Neither says the two *compose*, and each is written against a
   * state the other produces: the rule test saves a plan that was born with no
   * creator, which is not what an account deletion leaves behind. So this
   * deletes a real account and then asks the rule, in that order.
   *
   * The plan is renamed **before** the deletion as well as after it, because
   * "the right is gone" is only a claim if the right was demonstrably there.
   */
  it('keeps the creator’s name and drops their right when the account is deleted', async () => {
    await save('sp-1', 'ada');
    expect(
      await service().rename('sp-1', 'ada', 'still hers', {
        kind: 'legacy',
        actorId: 'ada',
        source: 'internal',
        operation: 'rename',
      }),
    ).toEqual({
      outcome: 'touched',
      workPackageId: 'p1',
    });

    reader.run(`DELETE FROM users WHERE id = 'ada'`);

    // The value outlives the reference: `created_by` is what the record *says*,
    // stored by value, and is never read back through the users table.
    expect(creatorOf('sp-1')).toEqual({ created_by: 'Ada Lovelace', created_by_id: null });

    // The right is **dropped, not transferred**. `mallory` is asserted beside
    // the deleted id because a fallback that widened to "anyone, once the
    // creator is gone" would answer `touched` here and pass a test that only
    // re-tried `ada`.
    expect(
      await service().rename('sp-1', 'ada', 'mine again', {
        kind: 'legacy',
        actorId: 'ada',
        source: 'internal',
        operation: 'rename',
      }),
    ).toEqual({ outcome: 'forbidden' });
    expect(
      await service().rename('sp-1', 'mallory', 'mine now', {
        kind: 'legacy',
        actorId: 'mallory',
        source: 'internal',
        operation: 'rename',
      }),
    ).toEqual({ outcome: 'forbidden' });
    expect(nameOf('sp-1')).toBe('still hers');

    // And the owner can still tidy up, which is the reason the constraint is
    // `SET NULL` and not `RESTRICT`: a plan nobody could reach would hold its
    // work package's quota forever.
    expect(
      await service().rename('sp-1', 'owner', 'tidied up', {
        kind: 'legacy',
        actorId: 'owner',
        source: 'internal',
        operation: 'rename',
      }),
    ).toEqual({
      outcome: 'forbidden',
    });
    expect(nameOf('sp-1')).toBe('still hers');
    expect(
      await service().delete('sp-1', 'owner', {
        kind: 'legacy',
        actorId: 'owner',
        source: 'internal',
        operation: 'delete',
      }),
    ).toEqual({
      outcome: 'forbidden',
    });
    expect(nameOf('sp-1')).toBe('still hers');
    expect(bodyCount('sp-1')).toBe(2);
  });

  it('deletes the header and its bodies', async () => {
    await save('sp-1', 'ada');
    expect(bodyCount('sp-1')).toBe(2);

    expect(
      await service().delete('sp-1', 'ada', {
        kind: 'legacy',
        actorId: 'ada',
        source: 'internal',
        operation: 'delete',
      }),
    ).toEqual({
      outcome: 'touched',
      workPackageId: 'p1',
    });

    expect(nameOf('sp-1')).toBeNull();
    expect(bodyCount('sp-1')).toBe(0);
  });

  /**
   * The reason the rule is built on `principalsOf` and not on `read`. `read`
   * verifies every stored byte and answers `corrupt` for this plan; if
   * authorisation went through it, a damaged plan would be undeletable and would
   * hold its work package's quota forever with nothing able to reach it.
   */
  it('renames and deletes a plan whose stored bytes are damaged', async () => {
    await save('sp-1', 'ada');
    reader.run(`UPDATE saved_plan_body SET bytes = bytes || ' ' WHERE saved_plan_id = 'sp-1'`);
    expect((await service().read('sp-1')).outcome).toBe('corrupt');

    expect(
      await service().rename('sp-1', 'ada', 'damaged, and still mine', {
        kind: 'legacy',
        actorId: 'ada',
        source: 'internal',
        operation: 'rename',
      }),
    ).toEqual({
      outcome: 'touched',
      workPackageId: 'p1',
    });
    expect(nameOf('sp-1')).toBe('damaged, and still mine');

    expect(
      await service().delete('sp-1', 'ada', {
        kind: 'legacy',
        actorId: 'ada',
        source: 'internal',
        operation: 'delete',
      }),
    ).toEqual({
      outcome: 'touched',
      workPackageId: 'p1',
    });
    expect(nameOf('sp-1')).toBeNull();
  });

  /**
   * A plan that is not there is `not_found` and never `forbidden`: the actor's
   * right cannot be decided at all, and answering `forbidden` would tell every
   * caller that a plan they may not touch exists.
   */
  it('answers not_found for a plan that is not there', async () => {
    expect(
      await service().rename('sp-missing', 'owner', 'anything', {
        kind: 'legacy',
        actorId: 'owner',
        source: 'internal',
        operation: 'rename',
      }),
    ).toEqual({
      outcome: 'not_found',
    });
    expect(
      await service().delete('sp-missing', 'owner', {
        kind: 'legacy',
        actorId: 'owner',
        source: 'internal',
        operation: 'delete',
      }),
    ).toEqual({ outcome: 'not_found' });
  });
});
