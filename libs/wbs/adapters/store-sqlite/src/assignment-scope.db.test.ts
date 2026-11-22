import { rejects } from 'node:assert/strict';

import type { AvailableWorkItemService as WorkItemService } from '@wbs/core/testing/available-work-item-service';
import { createTestServices } from '@wbs/core/testing/harness';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { personAdded } from '@wbs/store-memory/testing/service-fixtures';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { DirectoryRepository } from './directory';
import { OPEN } from './gate';
import { createScopePackage, openScopedServiceFixture } from './testing/scoped-service-fixture';
import { UserRepository } from './user';
import { WorkItemRepository } from './work-item';
import { WorkPackageRepository } from './work-package';

const STAMP = { at: 1, by: 'owner' };
let owned: ReturnType<typeof openScopedServiceFixture>;
let path: string;
let directory: DirectoryRepository;
let service: WorkItemService;
let recorded: { sql: string; bindings: unknown[] }[];

beforeEach(async () => {
  recorded = [];
  owned = openScopedServiceFixture('wbs-assignment-scope-', {
    logQuery(sql, bindings) {
      recorded.push({ sql, bindings });
    },
  });
  path = owned.path;
  const db = owned.source.db;
  directory = new DirectoryRepository(db, OPEN);
  const workPackages = new WorkPackageRepository(db, OPEN);
  const workItems = new WorkItemRepository(db, OPEN);
  service = createTestServices(owned.source, { workPackages, workItems, directory }).service;
  await new UserRepository(db, OPEN).create(
    { id: 'owner', username: 'owner', passwordHash: 'x', createdAt: 1 },
    STAMP,
  );
  const team = await directory.addTeam({ id: 'team', name: 'Shared team' }, STAMP);
  for (let index = 0; index < 41; index += 1) {
    const workPackageId = `work-package-${String(index)}`;
    const stepId = `step-${String(index)}`;
    const workItemId = `work-${String(index)}`;
    const personId = `person-${String(index)}`;
    await createScopePackage(
      owned.source,
      workPackageRow({ id: workPackageId, projectId: 'fixture-project' }),
      {
        id: stepId,
        name: 'Dev ' + stepId,
        position: 10,
        code: stepId,
        defaultAllowancePercent: 0,
        defaultEstimateUnit: 'workdays',
      },
      STAMP,
    );
    await workItems.insert(workItemRow({ id: workItemId, workPackageId }), [], STAMP);
    await personAdded(directory.addPerson({ id: personId, name: personId }, [team.id], STAMP));
    await directory.assign(workItemId, stepId, personId, STAMP);
  }
  recorded = [];
});

afterEach(async () => {
  await owned.close();
});

/** Examines the actual statements issued by the production call, on its migrated schema. */
function expectBoundedReads(): void {
  const reads = recorded.filter(
    ({ sql }) =>
      /^select /i.test(sql) && /(?:from|join) "(?:assignment|person|person_team)"/.test(sql),
  );
  expect(reads.length).toBeGreaterThan(0);
  const connection = openDatabase(path);
  try {
    for (const read of reads) {
      // Drizzle's logger exposes unknown[]; this test boundary only receives
      // SQLite-supported scalar parameters from the production query builder.
      const bindings = read.bindings as (string | number | null)[];
      const materialized = connection.query(read.sql).all(...bindings);
      expect(materialized.length, `materialized unrelated rows: ${read.sql}`).toBeLessThanOrEqual(
        1,
      );
      const plan = connection
        .query<{ detail: string }, (string | number | null)[]>(`EXPLAIN QUERY PLAN ${read.sql}`)
        .all(...bindings);
      expect(plan.some(({ detail }) => /SEARCH (?:assignment|person) USING/.test(detail))).toBe(
        true,
      );
      expect(
        plan.filter(({ detail }) =>
          /SCAN (?:work_item|assignment|person|person_team)(?:\s|$)/.test(detail),
        ),
      ).toEqual([]);
    }
  } finally {
    connection.close();
  }
}

describe('work-package-scoped assignment reads', () => {
  it('[PROJECT-ASSIGNMENT-READS-001] materializes only assigned project rows and names during a tiny tree read', async () => {
    const tree = await service.tree('work-package-0');
    expect(tree?.assignedPeople).toEqual([{ id: 'person-0', name: 'person-0' }]);
    expectBoundedReads();
  });

  it('[PROJECT-ASSIGNMENT-READS-002] uses an indexed prior assignment read during one assignment write', async () => {
    expect(await service.assign('work-0', 'owner', 'step-0', null)).toEqual({
      ok: true,
      value: null,
    });
    expectBoundedReads();
    expect(await directory.assignmentsOf(['work-1'])).toEqual([
      { workItemId: 'work-1', stepId: 'step-1', personId: 'person-1' },
    ]);
    const undone = await service.undo('work-package-0', 'owner');
    expect(undone.ok).toBe(true);
    expect(await directory.assignmentsOf(['work-0'])).toEqual([
      { workItemId: 'work-0', stepId: 'step-0', personId: 'person-0' },
    ]);
  });

  it('models missing step identities without hiding other assignment failures', async () => {
    const store = owned.source.stores.directory;
    const revisions = () => owned.source.db.all('SELECT id,revision FROM work_item ORDER BY id');
    const before = revisions();
    expect(await store.assign('work-0', 'absent', 'person-0', STAMP)).toEqual({
      ok: false,
      reason: 'unknown_step',
    });
    expect(await store.assign('work-0', 'absent', 'missing-person', STAMP)).toEqual({
      ok: false,
      reason: 'unknown_person',
    });
    await rejects(store.assign('missing-owner', 'step-0', 'person-0', STAMP));
    expect(revisions()).toEqual(before);
    expect(await store.assignmentsOf(['work-0'])).toEqual([
      { workItemId: 'work-0', stepId: 'step-0', personId: 'person-0' },
    ]);

    await new WorkItemRepository(owned.source.db, OPEN).insert(
      workItemRow({ id: 'child-0', workPackageId: 'work-package-0', parentId: 'work-0' }),
      [],
      STAMP,
    );
    expect(await store.assign('work-0', 'step-0', null, STAMP)).toEqual({ ok: true });
    expect(await store.assign('work-0', 'absent', null, STAMP)).toEqual({ ok: true });
    expect(await store.assignmentsOf(['work-0'])).toEqual([]);
  });
});
