import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { personAdded } from '../testing/directory-fixture';
import { openDatabase, openDrizzle } from './db';
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
let dbPath: string;
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
  dbPath = join(dir, 'test.db');
  runMigrations(dbPath, FOLDER);
  const db = openDrizzle(dbPath);
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
    priority: null,
    startNoEarlierThan: null,
    serviceTeamId: null,
    maxParallel: 1,
    revision: 0,
  };
}

const byPosition = (items: WorkItem[]) =>
  [...items].sort((a, b) => a.position - b.position).map((w) => w.name);

/** A team in the global directory, since a join row has to point at a real one. */
async function team(name: string): Promise<string> {
  return (await directory.addTeam({ id: crypto.randomUUID(), name })).id;
}

/**
 * The join table as it stands, ordered, read on a connection of its own.
 *
 * Its own connection because the repository's writes are what is under test:
 * reading them back through the same drizzle client would prove the object in
 * front of the database and not the database.
 */
function joinedTeams(): { workItemId: string; teamId: string }[] {
  const db = openDatabase(dbPath);
  try {
    return db
      .query<
        { workItemId: string; teamId: string },
        []
      >('SELECT work_item_id AS workItemId, team_id AS teamId FROM work_item_team ORDER BY work_item_id, team_id')
      .all();
  } finally {
    db.close();
  }
}

/** A join row written directly, which is the only way to state two teams until R2-4. */
function joinTeam(workItemId: string, teamId: string): void {
  const db = openDatabase(dbPath);
  try {
    db.run('INSERT INTO work_item_team (work_item_id, team_id) VALUES (?, ?)', [
      workItemId,
      teamId,
    ]);
  } finally {
    db.close();
  }
}

describe('the team set beside the column', () => {
  it('reads back every team a work item is joined to, in one order', async () => {
    // The set, and the order that makes two reads of an unchanged plan the same
    // array — design.md D6. Written straight into the join because the write
    // path states one team until R2-4, and the read is the thing under test.
    const strip = row(null, 10, 'Strip');
    await repo.insert(strip, []);
    const backend = await team('Backend');
    const design = await team('Design');
    joinTeam(strip.id, design);
    joinTeam(strip.id, backend);

    const read = await repo.listByProject(projectId);

    expect(read.at(0)?.teamIds).toEqual([backend, design].sort((a, b) => (a < b ? -1 : 1)));
  });

  it('leaves a work item nobody labelled with an empty set rather than a null', async () => {
    // _Unstated_ has one spelling on this side too: the empty set inherits, and
    // there is no second state meaning "deliberately no team".
    await repo.insert(row(null, 10, 'Strip'), []);

    expect((await repo.listByProject(projectId)).at(0)?.teamIds).toEqual([]);
  });

  it('labels the join as well as the column', async () => {
    // The dual write, forward. The column is what the outgoing release and the
    // journal read; the join is what everything in this release reads, and a
    // write that moved only one of them would put a label on screen that the
    // scheduler cannot see, or the reverse.
    const strip = row(null, 10, 'Strip');
    await repo.insert(strip, []);
    const backend = await team('Backend');

    const written = await repo.patch(strip.id, { serviceTeamId: backend });

    expect(written.ok).toBe(true);
    expect(written.ok ? written.workItem.serviceTeamId : null).toBe(backend);
    expect(joinedTeams()).toEqual([{ workItemId: strip.id, teamId: backend }]);
    expect((await repo.listByProject(projectId)).at(0)?.teamIds).toEqual([backend]);
  });

  it('empties the join when the label is taken off', async () => {
    const strip = row(null, 10, 'Strip');
    await repo.insert(strip, []);
    const backend = await team('Backend');
    await repo.patch(strip.id, { serviceTeamId: backend });

    await repo.patch(strip.id, { serviceTeamId: null });

    expect(joinedTeams()).toEqual([]);
    const read = await repo.listByProject(projectId);
    expect(read.at(0)?.serviceTeamId).toBeNull();
    expect(read.at(0)?.teamIds).toEqual([]);
  });

  it('leaves the join alone when the patch does not name the label', async () => {
    // A rename must not empty the set. The join is replaced only where the
    // patch states it, exactly as the column is written only where it does.
    const strip = row(null, 10, 'Strip');
    await repo.insert(strip, []);
    const backend = await team('Backend');
    await repo.patch(strip.id, { serviceTeamId: backend });

    await repo.patch(strip.id, { name: 'Strip the walls' });

    expect(joinedTeams()).toEqual([{ workItemId: strip.id, teamId: backend }]);
  });

  it('joins a row that arrives already labelled', async () => {
    // `create` never labels, so this is the parity that keeps every other way a
    // whole row is written — a restore among them — from landing unpooled.
    const backend = await team('Backend');
    const strip = { ...row(null, 10, 'Strip'), serviceTeamId: backend };

    await repo.insert(strip, []);

    expect((await repo.listByProject(projectId)).at(0)?.teamIds).toEqual([backend]);
  });

  it('carries the teams of every row a copy writes', async () => {
    // A duplicated branch draws from the pools the original drew from, and a
    // restored one comes back on the pool it left: the join rows of a deleted
    // work item went with it through the cascade, so a restore writing only the
    // column would put the rows back unpooled and move dates nobody edited.
    const backend = await team('Backend');
    const strip = { ...row(null, 10, 'Strip'), serviceTeamId: backend };
    await repo.insert(strip, []);
    const copiedRoot = { ...row(null, 20, 'Strip (copy)'), serviceTeamId: backend };
    const copiedLeaf = { ...row(copiedRoot.id, 10, 'Sockets'), serviceTeamId: null };

    await subtrees.insertSubtree({
      rows: [copiedRoot, copiedLeaf],
      respaced: [],
      reparented: [],
      estimates: [],
      assignments: [],
      dependencies: [],
      removedEstimates: [],
    });

    expect(joinedTeams()).toEqual(
      [
        { workItemId: strip.id, teamId: backend },
        { workItemId: copiedRoot.id, teamId: backend },
      ].sort((a, b) => (a.workItemId < b.workItemId ? -1 : 1)),
    );
  });

  it('takes a work item’s join rows with it when the work item goes', async () => {
    // The cascade, on the other column. Nothing in be-01 deletes these rows,
    // and an undo of the deletion is what puts them back — through the copy
    // above, from the column the journal carries.
    const backend = await team('Backend');
    const strip = { ...row(null, 10, 'Strip'), serviceTeamId: backend };
    await repo.insert(strip, []);

    await repo.remove([strip.id], []);

    expect(joinedTeams()).toEqual([]);
  });
});

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
