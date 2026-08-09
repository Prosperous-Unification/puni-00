import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { personAdded } from '../testing/directory-fixture';
import { openDrizzle } from './db';
import { DependencyRepository } from './dependency';
import { DirectoryRepository } from './directory';
import { EstimateRepository } from './estimate';
import type { SubtreeCopy, WorkItem } from './index';
import { runMigrations } from './migrate';
import { ProjectRepository } from './project';
import { UserRepository } from './user';
import { SubtreeRepository, WorkItemRepository } from './work-item';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

let dir: string;
let repo: WorkItemRepository;
let subtrees: SubtreeRepository;
let estimates: EstimateRepository;
let dependencies: DependencyRepository;
let directory: DirectoryRepository;
let projectId: string;
let roleId: string;
let personId: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-work-item-'));
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  const db = openDrizzle(path);
  repo = new WorkItemRepository(db);
  subtrees = new SubtreeRepository(db);
  estimates = new EstimateRepository(db);
  dependencies = new DependencyRepository(db);
  directory = new DirectoryRepository(db);

  const ownerId = crypto.randomUUID();
  await new UserRepository(db).create({
    id: ownerId,
    username: 'owner',
    passwordHash: 'x',
    createdAt: 1,
  });
  projectId = crypto.randomUUID();
  roleId = crypto.randomUUID();
  await new ProjectRepository(db).create(
    {
      id: projectId,
      name: 'Rewire the shed',
      ownerId,
      restricted: false,
      estimateMethod: 'pert',
      startDate: null,
      revision: 0,
      createdAt: 1,
    },
    [{ id: roleId, projectId, name: 'Dev', position: 10 }],
  );
  personId = (await personAdded(directory.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, [])))
    .id;
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
    startNoEarlierThan: null,
    serviceTeamId: null,
    revision: 0,
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

  it('places the copy after the original, respacing the group in the same write', async () => {
    const strip = row(null, 10, 'Strip');
    const cable = row(null, 11, 'Cable');
    await repo.insert(strip, []);
    await repo.insert(cable, []);

    const copy = row(null, 20, 'Strip (copy)');
    await subtrees.insertSubtree({
      rows: [copy],
      respaced: [
        { id: strip.id, position: 10 },
        { id: cable.id, position: 30 },
      ],
      reparented: [],
      estimates: [],
      assignments: [],
      dependencies: [],
      removedEstimates: [],
    });

    expect(byPosition(await repo.listByProject(projectId))).toEqual([
      'Strip',
      'Strip (copy)',
      'Cable',
    ]);
  });

  it('writes rows, estimates, assignments and edges as one copy', async () => {
    const strip = row(null, 10, 'Strip');
    const sockets = row(strip.id, 10, 'Sockets');
    const switches = row(strip.id, 20, 'Switches');
    for (const item of [strip, sockets, switches]) await repo.insert(item, []);

    const copiedRoot = row(null, 20, 'Strip (copy)');
    const copiedFirst = { ...row(copiedRoot.id, 10, 'Sockets') };
    const copiedSecond = { ...row(copiedRoot.id, 20, 'Switches') };
    await subtrees.insertSubtree({
      rows: [copiedRoot, copiedFirst, copiedSecond],
      respaced: [],
      reparented: [],
      estimates: [
        { workItemId: copiedFirst.id, roleId, optimistic: 1, realistic: 2, pessimistic: 3 },
      ],
      assignments: [{ workItemId: copiedSecond.id, roleId, personId }],
      dependencies: [
        {
          id: crypto.randomUUID(),
          projectId,
          predecessorId: copiedFirst.id,
          successorId: copiedSecond.id,
        },
      ],
      removedEstimates: [],
    });

    expect(byPosition(await repo.listByProject(projectId))).toHaveLength(6);
    expect(await estimates.listByProject(projectId)).toContainEqual({
      workItemId: copiedFirst.id,
      roleId,
      optimistic: 1,
      realistic: 2,
      pessimistic: 3,
    });
    expect(await directory.assignmentsOf([copiedSecond.id])).toEqual([
      { workItemId: copiedSecond.id, roleId, personId },
    ]);
    expect(
      (await dependencies.listByProject(projectId)).map((edge) => [
        edge.predecessorId,
        edge.successorId,
      ]),
    ).toEqual([[copiedFirst.id, copiedSecond.id]]);
  });

  /**
   * The transaction in `insertSubtree`, against the constraint that can break
   * it. The dependency is written last and names a work item that does not
   * exist, so SQLite rejects it — and the rows, the estimate and the
   * assignment written before it must go with it.
   *
   * Proof: with the transaction replaced by the same statements run one after
   * another, this test failed on the first assertion — three copied rows, one
   * estimate and one assignment survived a copy that did not happen. Watched
   * 2026-08-07.
   */
  it('inserts nothing when the last write in the copy violates a foreign key', async () => {
    const strip = row(null, 10, 'Strip');
    await repo.insert(strip, []);

    const copiedRoot = row(null, 20, 'Strip (copy)');
    const copiedChild = row(copiedRoot.id, 10, 'Sockets');
    const copy: SubtreeCopy = {
      rows: [copiedRoot, copiedChild],
      respaced: [],
      reparented: [],
      estimates: [
        { workItemId: copiedChild.id, roleId, optimistic: 1, realistic: 2, pessimistic: 3 },
      ],
      assignments: [{ workItemId: copiedChild.id, roleId, personId }],
      dependencies: [
        {
          id: crypto.randomUUID(),
          projectId,
          // No such work item, so the foreign key refuses the last statement.
          predecessorId: crypto.randomUUID(),
          successorId: copiedChild.id,
        },
      ],
      removedEstimates: [],
    };

    // Awaited through a catch rather than `.rejects`, so the assertions below
    // cannot run against a write that has not finished failing yet.
    let refused: unknown = null;
    try {
      await subtrees.insertSubtree(copy);
    } catch (thrown) {
      refused = thrown;
    }
    expect(refused).toBeInstanceOf(Error);

    expect(byPosition(await repo.listByProject(projectId))).toEqual(['Strip']);
    expect(await estimates.listByProject(projectId)).toEqual([]);
    expect(await directory.assignmentsOf([copiedChild.id])).toEqual([]);
    expect(await dependencies.listByProject(projectId)).toEqual([]);
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
