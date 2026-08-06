import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDrizzle } from './db';
import { EstimateRepository } from './estimate';
import type { Project, Role, WorkItem } from './index';
import { runMigrations } from './migrate';
import { ProjectRepository } from './project';
import { UserRepository } from './user';
import { WorkItemRepository } from './work-item';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

let dir: string;
let repo: EstimateRepository;
let projectId: string;
let devId: string;
let qaId: string;
let stripId: string;
let sandId: string;

const insertItem = async (
  workItems: WorkItemRepository,
  id: string,
  position: number,
  name: string,
): Promise<void> => {
  const item: WorkItem = {
    id,
    projectId,
    parentId: null,
    position,
    name,
    notes: '',
    frozenNumber: null,
    startNoEarlierThan: null,
    serviceTeamId: null,
  };
  await workItems.insert(item, []);
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-estimate-'));
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  const db = openDrizzle(path);
  repo = new EstimateRepository(db);
  const workItems = new WorkItemRepository(db);

  const ownerId = crypto.randomUUID();
  await new UserRepository(db).create({
    id: ownerId,
    username: 'owner',
    passwordHash: 'x',
    createdAt: 1,
  });
  projectId = crypto.randomUUID();
  devId = crypto.randomUUID();
  qaId = crypto.randomUUID();
  const project: Project = {
    id: projectId,
    name: 'Rewire the shed',
    ownerId,
    restricted: false,
    estimateMethod: 'pert',
    startDate: null,
    createdAt: 1,
  };
  const roles: Role[] = [
    { id: devId, projectId, name: 'Dev' },
    { id: qaId, projectId, name: 'QA' },
  ];
  await new ProjectRepository(db).create(project, roles);

  stripId = crypto.randomUUID();
  sandId = crypto.randomUUID();
  await insertItem(workItems, stripId, 10, 'Strip');
  await insertItem(workItems, sandId, 20, 'Sand');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('EstimateRepository', () => {
  it('removes one work item’s role without touching the other role or the same role elsewhere', async () => {
    // Both halves of the condition are load-bearing and each needs its own
    // survivor. With one work item, a delete narrowed to the role alone —
    // which would clear that role on every work item in the database — passes.
    // The same trap `directory.test.ts` records for `assign(…, null)`.
    await repo.set({
      workItemId: stripId,
      roleId: devId,
      optimistic: 1,
      realistic: 2,
      pessimistic: 3,
    });
    await repo.set({
      workItemId: stripId,
      roleId: qaId,
      optimistic: 4,
      realistic: 5,
      pessimistic: 6,
    });
    await repo.set({
      workItemId: sandId,
      roleId: devId,
      optimistic: 7,
      realistic: 8,
      pessimistic: 9,
    });

    await repo.remove(stripId, devId);

    const left = await repo.listByProject(projectId);
    expect(left).toHaveLength(2);
    // The same role on another work item survives — the work-item half.
    expect(left).toContainEqual({
      workItemId: sandId,
      roleId: devId,
      optimistic: 7,
      realistic: 8,
      pessimistic: 9,
    });
    // The other role on this one — the role half.
    expect(left).toContainEqual({
      workItemId: stripId,
      roleId: qaId,
      optimistic: 4,
      realistic: 5,
      pessimistic: 6,
    });
  });

  it('removing an estimate that was never stored takes nothing away and does not throw', async () => {
    // Clearing twice is the ordinary path: a person empties three boxes, the
    // tree refreshes, and they empty them again. The state asked for is the
    // state left, so the second call is a success rather than a 404.
    await repo.set({
      workItemId: stripId,
      roleId: qaId,
      optimistic: 4,
      realistic: 5,
      pessimistic: 6,
    });

    await repo.remove(stripId, devId);
    await repo.remove(stripId, devId);

    expect(await repo.listByProject(projectId)).toEqual([
      { workItemId: stripId, roleId: qaId, optimistic: 4, realistic: 5, pessimistic: 6 },
    ]);
  });
});
