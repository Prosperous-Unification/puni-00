import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { StoredTypedDependency, WriteStamp } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import { type Connection, type Drizzle, openConnection, openDatabase } from './db';
import { OPEN } from './gate';
import { workItem } from './schema';
import { StepCatalogueRepository } from './step-catalogue';
import { seedCurrentProjectFixture } from './testing/current-project-fixture';
import { seedPackageParent } from './testing/legacy-package-parent';
import { TypedDependencyRepository } from './typed-dependency';
import { WorkItemRepository } from './work-item';
import { WorkPackageRepository } from './work-package';

const ORGANIZATION = 'fixture-legacy-org';
const PROJECT = 'fixture-project';
let owner: { hasUnknownOwner: boolean; connection?: Connection };
let dir: string;
let path: string;
let db: Drizzle;
let repo: TypedDependencyRepository;
let ownerId: string;
let workPackageId: string;
let workItems: WorkItemRepository;
let devStepId: string;
const wrote = (): WriteStamp => ({ at: 1, by: ownerId });

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-typed-repo-'));
  path = join(dir, 'test.db');
  owner = { hasUnknownOwner: false };
  ownerId = crypto.randomUUID();
  workPackageId = crypto.randomUUID();
  devStepId = crypto.randomUUID();
  await seedCurrentProjectFixture(
    {
      path,
      directory: dir,
      organizationId: ORGANIZATION,
      projectId: PROJECT,
      stamp: wrote(),
      definitions: [
        {
          id: devStepId,
          name: 'Dev',
          code: 'dev',
          position: 10,
          defaultAllowancePercent: 0,
          defaultEstimateUnit: 'workdays',
        },
      ],
    },
    owner,
  );
  const connection = openConnection(path);
  owner.connection = connection;
  db = connection.db;
  repo = new TypedDependencyRepository(db, OPEN);
  workItems = new WorkItemRepository(db, OPEN);
  await createPackage(workPackageId, PROJECT);
});
afterEach(() => {
  owner.connection?.close();
  if (!owner.hasUnknownOwner) rmSync(dir, { recursive: true, force: true });
});

async function createPackage(id: string, projectId: string) {
  const packages = new WorkPackageRepository(db, OPEN);
  expect(await packages.create(workPackageRow({ id, projectId }), [], wrote())).toMatchObject({
    id,
    projectId,
  });
}

async function addWorkItem(
  name: string,
  parentId: string | null = null,
  inWorkPackage: string = workPackageId,
): Promise<string> {
  const id = crypto.randomUUID();
  await workItems.insert(
    workItemRow({ id, workPackageId: inWorkPackage, parentId, position: 10, name }),
    [],
    wrote(),
  );
  return id;
}

const link = (predecessorId: string, successorId: string): StoredTypedDependency => ({
  id: crypto.randomUUID(),
  workPackageId,
  predecessor: { workPackageId, scope: 'whole', workItemId: predecessorId },
  successor: { workPackageId, scope: 'whole', workItemId: successorId },
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
 * an assertion nobody awaits passes whatever happens (`work-package.db.test.ts`).
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
    expect(await repo.listByWorkPackage(workPackageId)).toEqual([]);
    expect(revision(a)).toBe(revisions.get(a) ?? -1);
    expect(revision(b)).toBe(revisions.get(b) ?? -1);
    expect(revision(c)).toBe((revisions.get(c) ?? 0) + 1);
    expect(revision(d)).toBe((revisions.get(d) ?? 0) + 1);
  });

  it('refuses an endpoint outside the work package or in the wrong shape', async () => {
    const otherWorkPackage = crypto.randomUUID();
    const otherStep = crypto.randomUUID();
    const siblingProject = 'sibling-project';
    seedPackageParent(path, ORGANIZATION, siblingProject);
    const bound = await new StepCatalogueRepository(db, OPEN, 'owned').defineAndBindStep(
      ORGANIZATION,
      {
        id: otherStep,
        name: 'Review',
        code: 'review',
        position: 10,
        defaultAllowancePercent: 0,
        defaultEstimateUnit: 'workdays',
      },
      {
        bindingId: 'review-binding',
        scopeKind: 'project',
        scopeId: siblingProject,
        workItemTypeId: null,
        position: 10,
      },
      wrote(),
    );
    expect(bound.ok).toBe(true);
    await createPackage(otherWorkPackage, siblingProject);
    expect(
      (await new WorkPackageRepository(db, OPEN).stepsOf(otherWorkPackage)).map((step) => step.id),
    ).toEqual([otherStep]);
    const leaf = await addWorkItem('Leaf');
    const parent = await addWorkItem('Parent');
    await addWorkItem('Child', parent);
    const foreign = await addWorkItem('Foreign', null, otherWorkPackage);
    const refusals: [string, StoredTypedDependency, string][] = [
      ['foreign work item', link(foreign, leaf), 'outside work package'],
      [
        'foreign step',
        {
          ...link(leaf, parent),
          predecessor: { workPackageId, scope: 'node', workItemId: leaf, stepId: otherStep },
        },
        'outside work package',
      ],
      [
        'node on a parent',
        {
          ...link(leaf, parent),
          successor: { workPackageId, scope: 'node', workItemId: parent, stepId: devStepId },
        },
        'a parent',
      ],
      [
        'descendant-step on a leaf',
        {
          ...link(leaf, parent),
          predecessor: {
            workPackageId,
            scope: 'descendant-step',
            workItemId: leaf,
            stepId: devStepId,
          },
        },
        'a leaf',
      ],
    ];
    for (const [name, row, message] of refusals) {
      expect(await rejection(repo.add(row, wrote())), name).toContain(message);
    }
    expect(await repo.listByWorkPackage(workPackageId)).toEqual([]);
  });

  it('adds, lists, updates and removes a link while bumping both endpoints', async () => {
    const a = await addWorkItem('A');
    const b = await addWorkItem('B');
    const c = await addWorkItem('C');
    const row = link(a, b);
    const beforeA = revision(a);
    const beforeB = revision(b);
    await repo.add(row, wrote());
    expect(await repo.listByWorkPackage(workPackageId)).toEqual([row]);
    expect(revision(a)).toBe(beforeA + 1);
    expect(revision(b)).toBe(beforeB + 1);
    expect(await rejection(repo.add({ ...row, id: crypto.randomUUID() }, wrote()))).toContain(
      'Failed query',
    );
    const changed = {
      ...row,
      successor: { workPackageId, scope: 'whole' as const, workItemId: c },
    };
    await repo.update(changed, wrote());
    expect(await repo.listByWorkPackage(workPackageId)).toEqual([changed]);
    expect(revision(a)).toBe(beforeA + 2);
    expect(revision(b)).toBe(beforeB + 2);
    const beforeC = revision(c);
    expect(beforeC).toBeGreaterThanOrEqual(1);
    await repo.remove(row.id, wrote());
    expect(await repo.listByWorkPackage(workPackageId)).toEqual([]);
    expect(revision(a)).toBe(beforeA + 3);
    expect(revision(c)).toBe(beforeC + 1);
  });

  it('refuses update of an unknown id without changing rows or revisions', async () => {
    const a = await addWorkItem('A');
    const b = await addWorkItem('B');
    const row = link(a, b);
    await repo.add(row, wrote());
    const revisions = [revision(a), revision(b)];
    expect(await rejection(repo.update({ ...row, id: 'missing' }, wrote()))).toContain(
      'does not exist',
    );
    expect(await repo.listByWorkPackage(workPackageId)).toEqual([row]);
    expect([revision(a), revision(b)]).toEqual(revisions);
  });

  it('refuses removal of an unknown id without changing rows or revisions', async () => {
    const a = await addWorkItem('A');
    const b = await addWorkItem('B');
    const row = link(a, b);
    await repo.add(row, wrote());
    const revisions = [revision(a), revision(b)];
    expect(await rejection(repo.remove('missing', wrote()))).toContain('does not exist');
    expect(await repo.listByWorkPackage(workPackageId)).toEqual([row]);
    expect([revision(a), revision(b)]).toEqual(revisions);
  });

  it('refuses moving a typed dependency to another work package without changing rows or revisions', async () => {
    const a = await addWorkItem('A');
    const b = await addWorkItem('B');
    const row = link(a, b);
    await repo.add(row, wrote());
    const otherWorkPackage = crypto.randomUUID();
    await createPackage(otherWorkPackage, PROJECT);
    const destinationPredecessor = await addWorkItem(
      'Destination predecessor',
      null,
      otherWorkPackage,
    );
    const destinationSuccessor = await addWorkItem('Destination successor', null, otherWorkPackage);
    const proposed: StoredTypedDependency = {
      ...row,
      workPackageId: otherWorkPackage,
      predecessor: {
        workPackageId: otherWorkPackage,
        scope: 'whole',
        workItemId: destinationPredecessor,
      },
      successor: {
        workPackageId: otherWorkPackage,
        scope: 'whole',
        workItemId: destinationSuccessor,
      },
    };
    const endpointIds = [a, b, destinationPredecessor, destinationSuccessor];
    const revisions = endpointIds.map(revision);
    const sqlite = openDatabase(path);
    try {
      const physicalBefore = sqlite.query('SELECT * FROM typed_dependency ORDER BY id').all();
      const endpointsBefore = sqlite
        .query('SELECT id,revision,updated_at FROM work_item ORDER BY id')
        .all();
      expect(await rejection(repo.update(proposed, { ...wrote(), at: 2 }))).toContain(
        'cannot move',
      );
      expect(await repo.listByWorkPackage(workPackageId)).toEqual([row]);
      expect(await repo.listByWorkPackage(otherWorkPackage)).toEqual([]);
      expect(sqlite.query('SELECT * FROM typed_dependency ORDER BY id').all()).toEqual(
        physicalBefore,
      );
      expect(
        sqlite.query('SELECT id,revision,updated_at FROM work_item ORDER BY id').all(),
      ).toEqual(endpointsBefore);
      expect(endpointIds.map(revision)).toEqual(revisions);
    } finally {
      sqlite.close();
    }
  });

  it('reads stored SS and FF relationships', async () => {
    const a = await addWorkItem('A');
    const b = await addWorkItem('B');
    const sqlite = openDatabase(path);
    try {
      for (const type of ['SS', 'FF'])
        sqlite.run(
          'INSERT INTO typed_dependency (id,work_package_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES (?,?,?,?,?,?,?)',
          [type, workPackageId, a, 'whole', b, 'whole', type],
        );
    } finally {
      sqlite.close();
    }
    expect((await repo.listByWorkPackage(workPackageId)).map(({ type }) => type).sort()).toEqual([
      'FF',
      'SS',
    ]);
  });

  /**
   * Proof: the `isRelationshipType` read check removed made this case fail on
   * `Received: (resolved without throwing)`: an SF row came back as a link;
   * watched 2026-09-28. The fixture bypasses SQLite's known-type CHECK to model
   * a future or corrupted database row.
   */
  it('refuses an unsupported stored relationship type on read', async () => {
    const a = await addWorkItem('A');
    const b = await addWorkItem('B');
    const sqlite = openDatabase(path);
    try {
      sqlite.run('PRAGMA ignore_check_constraints = ON');
      sqlite.run(
        'INSERT INTO typed_dependency (id,work_package_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES (?,?,?,?,?,?,?)',
        ['future-type', workPackageId, a, 'whole', b, 'whole', 'SF'],
      );
    } finally {
      sqlite.close();
    }
    expect(await rejection(repo.listByWorkPackage(workPackageId))).toContain(
      'unknown relationship type SF',
    );
  });

  it('refuses unsupported rows during bulk removal before deleting them', async () => {
    const a = await addWorkItem('A');
    const b = await addWorkItem('B');
    const sqlite = openDatabase(path);
    try {
      sqlite.run('PRAGMA ignore_check_constraints = ON');
      sqlite.run(
        'INSERT INTO typed_dependency (id,work_package_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES (?,?,?,?,?,?,?)',
        ['future-type', workPackageId, a, 'whole', b, 'whole', 'SF'],
      );
    } finally {
      sqlite.close();
    }
    expect(await rejection(repo.removeAllFor([a], wrote()))).toContain(
      'unknown relationship type SF',
    );
    const stored = openDatabase(path);
    try {
      expect(stored.query<{ id: string }, []>('SELECT id FROM typed_dependency').all()).toEqual([
        { id: 'future-type' },
      ]);
    } finally {
      stored.close();
    }
  });

  it('refuses unknown scopes and scope/step mismatches on read', async () => {
    const a = await addWorkItem('A');
    const b = await addWorkItem('B');
    const sqlite = openDatabase(path);
    try {
      const step = sqlite
        .query<{ id: string }, [string]>(
          'SELECT step_id AS id FROM work_package_step WHERE work_package_id = ?',
        )
        .get(workPackageId);
      if (step === null) throw new Error('work package step is missing');
      sqlite.run('PRAGMA ignore_check_constraints = ON');
      sqlite.run(
        'INSERT INTO typed_dependency (id,work_package_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES (?,?,?,?,?,?,?)',
        ['bad-scope', workPackageId, a, 'other', b, 'whole', 'FS'],
      );
      expect(await rejection(repo.listByWorkPackage(workPackageId))).toContain(
        'unknown predecessor scope other',
      );
      sqlite.run("DELETE FROM typed_dependency WHERE id='bad-scope'");
      sqlite.run(
        'INSERT INTO typed_dependency (id,work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,type) VALUES (?,?,?,?,?,?,?,?)',
        ['bad-pair', workPackageId, a, 'whole', step.id, b, 'whole', 'FS'],
      );
      expect(await rejection(repo.listByWorkPackage(workPackageId))).toContain(
        'whole predecessor with a step',
      );
      sqlite.run("DELETE FROM typed_dependency WHERE id='bad-pair'");
      sqlite.run(
        'INSERT INTO typed_dependency (id,work_package_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES (?,?,?,?,?,?,?)',
        ['missing-step', workPackageId, a, 'node', b, 'whole', 'FS'],
      );
      expect(await rejection(repo.listByWorkPackage(workPackageId))).toContain(
        'node predecessor without a step',
      );
    } finally {
      sqlite.close();
    }
  });
});

it('refuses absent endpoint work package state during typed authoring admission', async () => {
  const dependency = link('a', 'b');
  expect(
    await rejection(
      repo.hasDeletingEndpoint({
        ...dependency,
        predecessor: { workPackageId: 'absent-work-package', workItemId: 'a', scope: 'whole' },
      }),
    ),
  ).toContain('missing endpoint work package absent-work-package');
});

it('refuses unreadable endpoint work package state during typed authoring admission', async () => {
  const native = openDatabase(path);
  try {
    native.run(
      'ALTER TABLE work_package RENAME COLUMN optimization_delete_pending_at TO broken_pending_at',
    );
  } finally {
    native.close();
  }
  expect(await rejection(repo.hasDeletingEndpoint(link('a', 'b')))).toContain(
    'unreadable endpoint work package deletion state',
  );
});
