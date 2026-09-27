import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { StoredTypedDependency, WriteStamp } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import { type Drizzle, openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { ProjectRepository } from './project';
import { workItem } from './schema';
import { TypedDependencyRepository } from './typed-dependency';
import { UserRepository } from './user';
import { WorkItemRepository } from './work-item';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
let dir: string;
let path: string;
let db: Drizzle;
let repo: TypedDependencyRepository;
let ownerId: string;
let projectId: string;
let workItems: WorkItemRepository;
let devStepId: string;
const wrote = (): WriteStamp => ({ at: 1, by: ownerId });

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-typed-repo-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  db = openDrizzle(path);
  repo = new TypedDependencyRepository(db, OPEN);
  workItems = new WorkItemRepository(db, OPEN);
  ownerId = crypto.randomUUID();
  await new UserRepository(db, OPEN).create(
    { id: ownerId, username: 'owner', passwordHash: 'x', createdAt: 1 },
    wrote(),
  );
  projectId = crypto.randomUUID();
  devStepId = crypto.randomUUID();
  await new ProjectRepository(db, OPEN).create(
    projectRow({ id: projectId, ownerId }),
    [{ id: devStepId, projectId, name: 'Dev', position: 10, code: 'dev' }],
    wrote(),
  );
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function addWorkItem(
  name: string,
  parentId: string | null = null,
  inProject: string = projectId,
): Promise<string> {
  const id = crypto.randomUUID();
  await workItems.insert(
    workItemRow({ id, projectId: inProject, parentId, position: 10, name }),
    [],
    wrote(),
  );
  return id;
}

const link = (predecessorId: string, successorId: string): StoredTypedDependency => ({
  id: crypto.randomUUID(),
  projectId,
  predecessor: { scope: 'whole', workItemId: predecessorId },
  successor: { scope: 'whole', workItemId: successorId },
  type: 'FS',
});

function revision(id: string): number {
  const row = db
    .select({ revision: workItem.revision })
    .from(workItem)
    .where(eq(workItem.id, id))
    .get();
  if (row === undefined) throw new Error(`missing work item ${id}`);
  return row.revision;
}

/**
 * The message a promise rejected with, or a marker when it resolved.
 *
 * `.rejects.toThrow` returns void under Bun's types and cannot be awaited, and
 * an assertion nobody awaits passes whatever happens (`project.db.test.ts`).
 */
async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return '(resolved without throwing)';
  } catch (err) {
    const messages: string[] = [];
    for (let at: unknown = err; at instanceof Error; at = at.cause) messages.push(at.message);
    return messages.join('\n');
  }
}

describe('TypedDependencyRepository', () => {
  /** Proof: removing the bulk delete left all three links present; watched 2026-09-27. */
  it('returns a doomed set of links and bumps only surviving endpoints', async () => {
    const a = await addWorkItem('A');
    const b = await addWorkItem('B');
    const c = await addWorkItem('C');
    const d = await addWorkItem('D');
    const internal = link(a, b);
    const outgoing = link(a, c);
    const incoming = link(d, b);
    await repo.add(internal, wrote());
    await repo.add(outgoing, wrote());
    await repo.add(incoming, wrote());
    const revisions = new Map([a, b, c, d].map((id) => [id, revision(id)]));

    expect(
      (await repo.removeAllFor([a, b], wrote())).sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
    ).toEqual(
      [internal, outgoing, incoming].sort((left, right) => left.id.localeCompare(right.id)),
    );
    expect(await repo.listByProject(projectId)).toEqual([]);
    expect(revision(a)).toBe(revisions.get(a) ?? -1);
    expect(revision(b)).toBe(revisions.get(b) ?? -1);
    expect(revision(c)).toBe((revisions.get(c) ?? 0) + 1);
    expect(revision(d)).toBe((revisions.get(d) ?? 0) + 1);
  });

  it('refuses an endpoint outside the project or in the wrong shape', async () => {
    const otherProject = crypto.randomUUID();
    const otherStep = crypto.randomUUID();
    await new ProjectRepository(db, OPEN).create(
      projectRow({ id: otherProject, ownerId }),
      [{ id: otherStep, projectId: otherProject, name: 'Dev', position: 10, code: 'dev' }],
      wrote(),
    );
    const leaf = await addWorkItem('Leaf');
    const parent = await addWorkItem('Parent');
    await addWorkItem('Child', parent);
    const foreign = await addWorkItem('Foreign', null, otherProject);
    const refusals: [string, StoredTypedDependency, string][] = [
      ['foreign work item', link(foreign, leaf), 'outside project'],
      [
        'foreign step',
        {
          ...link(leaf, parent),
          predecessor: { scope: 'node', workItemId: leaf, stepId: otherStep },
        },
        'outside project',
      ],
      [
        'node on a parent',
        {
          ...link(leaf, parent),
          successor: { scope: 'node', workItemId: parent, stepId: devStepId },
        },
        'a parent',
      ],
      [
        'descendant-step on a leaf',
        {
          ...link(leaf, parent),
          predecessor: { scope: 'descendant-step', workItemId: leaf, stepId: devStepId },
        },
        'a leaf',
      ],
    ];
    for (const [name, row, message] of refusals) {
      expect(await rejection(repo.add(row, wrote())), name).toContain(message);
    }
    expect(await repo.listByProject(projectId)).toEqual([]);
  });

  it('adds, lists, updates and removes a link while bumping both endpoints', async () => {
    const a = await addWorkItem('A');
    const b = await addWorkItem('B');
    const c = await addWorkItem('C');
    const row = link(a, b);
    const beforeA = revision(a);
    const beforeB = revision(b);
    await repo.add(row, wrote());
    expect(await repo.listByProject(projectId)).toEqual([row]);
    expect(revision(a)).toBe(beforeA + 1);
    expect(revision(b)).toBe(beforeB + 1);
    expect(await rejection(repo.add({ ...row, id: crypto.randomUUID() }, wrote()))).toContain(
      'Failed query',
    );
    const changed = { ...row, successor: { scope: 'whole' as const, workItemId: c } };
    await repo.update(changed, wrote());
    expect(await repo.listByProject(projectId)).toEqual([changed]);
    expect(revision(a)).toBe(beforeA + 2);
    expect(revision(b)).toBe(beforeB + 2);
    const beforeC = revision(c);
    expect(beforeC).toBeGreaterThanOrEqual(1);
    await repo.remove(row.id, wrote());
    expect(await repo.listByProject(projectId)).toEqual([]);
    expect(revision(a)).toBe(beforeA + 3);
    expect(revision(c)).toBe(beforeC + 1);
  });

  /**
   * Proof: the `isRelationshipType` read check removed made this case fail on
   * `Received: (resolved without throwing)` — an SS row came back as a link; watched
   * 2026-09-27.
   */
  it('refuses an SS row admitted by storage but unknown to this release', async () => {
    const a = await addWorkItem('A');
    const b = await addWorkItem('B');
    const sqlite = openDatabase(path);
    try {
      sqlite.run(
        'INSERT INTO typed_dependency (id,project_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES (?,?,?,?,?,?,?)',
        [crypto.randomUUID(), projectId, a, 'whole', b, 'whole', 'SS'],
      );
    } finally {
      sqlite.close();
    }
    expect(await rejection(repo.listByProject(projectId))).toContain(
      'unknown relationship type SS',
    );
  });

  it('refuses malformed rows during bulk removal before deleting them', async () => {
    const a = await addWorkItem('A');
    const b = await addWorkItem('B');
    const sqlite = openDatabase(path);
    try {
      sqlite.run(
        'INSERT INTO typed_dependency (id,project_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES (?,?,?,?,?,?,?)',
        ['future-type', projectId, a, 'whole', b, 'whole', 'SS'],
      );
    } finally {
      sqlite.close();
    }
    expect(await rejection(repo.removeAllFor([a], wrote()))).toContain(
      'unknown relationship type SS',
    );
    const stored = openDatabase(path);
    try {
      expect(stored.query<{ id: string }, []>('SELECT id FROM typed_dependency').all()).toEqual([
        { id: 'future-type' },
      ]);
    } finally {
      stored.close();
    }
    // Proof: bypassing readTypedDependency in bulk removal returns the SS row
    // and deletes it; the refusal fails. Watched 2026-09-27.
  });

  it('refuses unknown scopes and scope/step mismatches on read', async () => {
    const a = await addWorkItem('A');
    const b = await addWorkItem('B');
    const sqlite = openDatabase(path);
    try {
      const step = sqlite
        .query<{ id: string }, [string]>('SELECT id FROM step WHERE project_id = ?')
        .get(projectId);
      if (step === null) throw new Error('project step is missing');
      sqlite.run('PRAGMA ignore_check_constraints = ON');
      sqlite.run(
        'INSERT INTO typed_dependency (id,project_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES (?,?,?,?,?,?,?)',
        ['bad-scope', projectId, a, 'other', b, 'whole', 'FS'],
      );
      expect(await rejection(repo.listByProject(projectId))).toContain(
        'unknown predecessor scope other',
      );
      sqlite.run("DELETE FROM typed_dependency WHERE id='bad-scope'");
      sqlite.run(
        'INSERT INTO typed_dependency (id,project_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,type) VALUES (?,?,?,?,?,?,?,?)',
        ['bad-pair', projectId, a, 'whole', step.id, b, 'whole', 'FS'],
      );
      expect(await rejection(repo.listByProject(projectId))).toContain(
        'whole predecessor with a step',
      );
      sqlite.run("DELETE FROM typed_dependency WHERE id='bad-pair'");
      sqlite.run(
        'INSERT INTO typed_dependency (id,project_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES (?,?,?,?,?,?,?)',
        ['missing-step', projectId, a, 'node', b, 'whole', 'FS'],
      );
      expect(await rejection(repo.listByProject(projectId))).toContain(
        'node predecessor without a step',
      );
    } finally {
      sqlite.close();
    }
  });
});
