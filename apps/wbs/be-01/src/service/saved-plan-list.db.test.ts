import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SavedPlanService } from '@wbs/core/service/saved-plan.service';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import type { Connection } from '../repository/db';
import { openConnection } from '../repository/db';
import { OPEN } from '../repository/gate';
import type { WriteStamp } from '../repository/index';
import { SavedPlanRepository } from '../repository/saved-plan';
import { SavedPlanCaptureRepository } from '../repository/saved-plan-capture';
import { savedPlan } from '../repository/schema';
import { UserRepository } from '../repository/user';
import { WorkItemRepository } from '../repository/work-item';
import { WorkPackageRepository } from '../repository/work-package';
import { nodeDigest } from '../runtime/bun-runtime';
import { migrateOrganizationCatalogueFixture } from '../testing/organization-catalogue-fixture';
import { seedLegacyProject } from '../testing/project-fixture';
import { workPackageRow } from '../testing/work-package-fixture';
import { bindProjectFixtureSteps } from './fixtures/project-steps';
import { fastScheduler } from './optimizer-wiring';

const wrote: WriteStamp = { at: 1, by: 'owner' };

/**
 * Task 6.1's list, at the service.
 *
 * The list is an index, and the two properties worth pinning are the ones it
 * leaves out: no body bytes, and no integrity verdict. Both are tested by
 * observation rather than by reading the implementation — a body damaged on
 * disk must still be listed, which is the only behaviour under which a corrupt
 * plan can be found and deleted rather than becoming a row nobody can reach.
 */
describe("listing a work package's saved plans", () => {
  let dir: string;
  let path: string;
  let reader: Connection;

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
    dir = mkdtempSync(join(tmpdir(), 'wbs-saved-plan-list-'));
    path = join(dir, 'test.db');
    migrateOrganizationCatalogueFixture(path);
    seedLegacyProject(path, 'saved-plan-legacy', 'saved-plan-parent');
    const seed = openConnection(path);
    const db = seed.db;
    await new UserRepository(db, OPEN).create(
      { id: 'owner', username: 'owner', passwordHash: 'x', createdAt: 1 },
      wrote,
    );
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
    await new WorkPackageRepository(db, OPEN).create(
      workPackageRow({ id: 'p2', name: 'Somebody else', projectId: 'saved-plan-parent' }),
      [],
      wrote,
    );
    await new WorkItemRepository(db, OPEN).insert(item('wi-1', 10), [], wrote);
    seed.close();
    reader = openConnection(path);
  });

  afterEach(() => {
    reader.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /** The service, minting the id and the instant this save is stamped with. */
  const service = (id: string, at: number) =>
    new SavedPlanService({
      scheduler: fastScheduler,
      digest: nodeDigest,
      capture: new SavedPlanCaptureRepository({ openConnection: () => openConnection(path) }),
      plans: new SavedPlanRepository({ openConnection: () => openConnection(path) }),
      newId: () => id,
      now: () => at,
    });

  const save = (id: string, at: number, name: string, workPackageId = 'p1') =>
    service(id, at).save({ workPackageId, name, createdBy: 'Ada Lovelace', createdById: null });

  /**
   * A service that only ever reads. `newId` and `now` are still required, and
   * are given values no assertion mentions, so a list or read that reached for
   * either would be visible rather than plausible.
   */
  const readerService = () => service('never-minted', Number.NaN);

  it('answers newest first, with the header fields a list shows', async () => {
    await save('sp-old', 1_756_000_000, 'before the rewire');
    await save('sp-new', 1_756_000_900, 'after the rewire');

    const rows = await readerService().list('p1');

    expect(rows.map((row) => row.id)).toEqual(['sp-new', 'sp-old']);
    expect(rows[0].name).toBe('after the rewire');
    expect(rows[0].createdBy).toBe('Ada Lovelace');
    expect(rows[0].createdAt).toBe(1_756_000_900);
    expect(rows[0].inputBytes).toBeGreaterThan(0);
  });

  it('lists one work package and not another', async () => {
    await save('sp-1', 1_756_000_000, 'ours');
    await save('sp-2', 1_756_000_001, 'theirs', 'p2');

    const service0 = readerService();

    expect((await service0.list('p1')).map((row) => row.id)).toEqual(['sp-1']);
    expect((await service0.list('p2')).map((row) => row.id)).toEqual(['sp-2']);
  });

  /**
   * The interesting one. `read` refuses a plan whose stored bytes no longer
   * hash to the header; the list must **not**, or a corrupt plan becomes a row
   * that holds quota and cannot be reached to be deleted. Damaging the bytes
   * behind the service's back is the only way to observe the difference — the
   * writer cannot produce this state, which is why the guard against it is a
   * source scan and not a test.
   */
  it('lists a plan whose bytes are damaged, and read still refuses it', async () => {
    await save('sp-1', 1_756_000_000, 'before the rewire');
    reader.db.run(`UPDATE saved_plan_body SET bytes = bytes || ' ' WHERE saved_plan_id = 'sp-1'`);

    const service0 = readerService();

    expect((await service0.list('p1')).map((row) => row.id)).toEqual(['sp-1']);
    expect((await service0.read('sp-1')).outcome).toBe('corrupt');
  });

  it('answers an empty list for a work package that has saved nothing', async () => {
    const service0 = readerService();

    expect(await service0.list('p1')).toEqual([]);
    expect(await reader.db.select().from(savedPlan)).toEqual([]);
  });
});
