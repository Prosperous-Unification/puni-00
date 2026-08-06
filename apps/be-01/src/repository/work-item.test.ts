import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDrizzle } from './db';
import type { WorkItem } from './index';
import { runMigrations } from './migrate';
import { ProjectRepository } from './project';
import { UserRepository } from './user';
import { WorkItemRepository } from './work-item';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

let dir: string;
let repo: WorkItemRepository;
let projectId: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-work-item-'));
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  const db = openDrizzle(path);
  repo = new WorkItemRepository(db);

  const ownerId = crypto.randomUUID();
  await new UserRepository(db).create({
    id: ownerId,
    username: 'owner',
    passwordHash: 'x',
    createdAt: 1,
  });
  projectId = crypto.randomUUID();
  await new ProjectRepository(db).create(
    {
      id: projectId,
      name: 'Rewire the shed',
      ownerId,
      restricted: false,
      estimateMethod: 'pert',
      startDate: null,
      createdAt: 1,
    },
    [],
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function row(parentId: string | null, position: number, name: string): WorkItem {
  return {
    id: crypto.randomUUID(),
    projectId,
    parentId,
    position,
    name,
    notes: '',
    frozenNumber: null,
  };
}

const byPosition = (items: WorkItem[]) =>
  [...items].sort((a, b) => a.position - b.position).map((w) => w.name);

describe('WorkItemRepository', () => {
  it('inserts and reads back a project’s work items', async () => {
    const strip = row(null, 10, 'Strip');
    await repo.insert(strip, []);

    expect(byPosition(await repo.listByProject(projectId))).toEqual(['Strip']);
  });

  it('applies respacing in the same write as the insertion', async () => {
    const strip = row(null, 10, 'Strip');
    const cable = row(null, 11, 'Cable');
    await repo.insert(strip, []);
    await repo.insert(cable, []);

    const survey = row(null, 20, 'Survey');
    await repo.insert(survey, [
      { id: strip.id, position: 10 },
      { id: cable.id, position: 30 },
    ]);

    expect(byPosition(await repo.listByProject(projectId))).toEqual(['Strip', 'Survey', 'Cable']);
  });

  it('re-parents on move', async () => {
    const strip = row(null, 10, 'Strip');
    const cable = row(null, 20, 'Cable');
    await repo.insert(strip, []);
    await repo.insert(cable, []);

    await repo.move(cable.id, strip.id, 10, []);

    const moved = await repo.findById(cable.id);
    expect(moved?.parentId).toBe(strip.id);
  });

  // The ordering claim in `remove`, against the constraints that force it. With
  // the parent deleted first SQLite rejects the whole transaction, so this
  // passing is what proves the reversal is real rather than intended.
  it('deletes a subtree leaves-first, which the foreign keys require', async () => {
    const strip = row(null, 10, 'Strip');
    const sockets = row(strip.id, 10, 'Sockets');
    const boxes = row(sockets.id, 10, 'Back boxes');
    for (const item of [strip, sockets, boxes]) await repo.insert(item, []);

    // Ancestors-first, as `subtreeOf` produces them.
    await repo.remove([strip.id, sockets.id, boxes.id], []);

    expect(await repo.listByProject(projectId)).toEqual([]);
  });

  it('promotes children before deleting the parent they point at', async () => {
    const strip = row(null, 10, 'Strip');
    const sockets = row(strip.id, 10, 'Sockets');
    await repo.insert(strip, []);
    await repo.insert(sockets, []);

    await repo.remove([strip.id], [{ id: sockets.id, parentId: null, position: 10 }]);

    const remaining = await repo.listByProject(projectId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.parentId).toBeNull();
  });
});
