import type { AvailableWorkItemService as WorkItemService } from '@wbs/core/testing/available-work-item-service';
import { createTestServices } from '@wbs/core/testing/harness';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { personAdded } from '@wbs/store-memory/testing/service-fixtures';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { ClaimRepository } from './claim';
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
let service: WorkItemService;
let recorded: { sql: string; bindings: unknown[] }[];

/**
 * The by-person read under legacy access among 40 unrelated assigned people
 * (spec `work-package-assignment-reads`, applied to `wbs-resources` task 4.2): one
 * assignee and one claim holder in the work package, and the read asks for the
 * assignee, so no person read may materialize anyone else.
 */
beforeEach(async () => {
  recorded = [];
  owned = openScopedServiceFixture('wbs-person-work-scope-', {
    logQuery(sql, bindings) {
      recorded.push({ sql, bindings });
    },
  });
  path = owned.path;
  const db = owned.source.db;
  const directory = new DirectoryRepository(db, OPEN);
  const workPackages = new WorkPackageRepository(db, OPEN);
  const workItems = new WorkItemRepository(db, OPEN);
  const claims = new ClaimRepository(db, OPEN);
  service = createTestServices(owned.source, {
    workPackages,
    workItems,
    directory,
    claims,
  }).service;
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
  await workItems.insert(
    workItemRow({ id: 'claimed', workPackageId: 'work-package-0' }),
    [],
    STAMP,
  );
  await personAdded(directory.addPerson({ id: 'holder', name: 'Holder' }, [], STAMP));
  expect(
    await claims.add(
      [
        {
          id: 'claim-1',
          workItemId: 'claimed',
          stepId: 'step-0',
          personId: 'holder',
          runId: null,
          parentClaimId: null,
          accountId: 'owner',
        },
      ],
      [],
      { at: 9, by: 'owner' },
      [],
    ),
  ).toBe('written');
  recorded = [];
});

afterEach(async () => {
  await owned.close();
});

describe('the by-person read under legacy access', () => {
  it('materializes only the person read during a tiny by-person read', async () => {
    const work = await service.personWorkWithin('work-package-0', { kind: 'legacy' }, 'person-0');
    if (work === null || 'kind' in work) throw new Error('the read did not answer');
    expect(work.person).toEqual({ personId: 'person-0', name: 'person-0' });
    expect(work.assignments.map(({ workItemId, stepId }) => [workItemId, stepId])).toEqual([
      ['work-0', 'step-0'],
    ]);
    expect(work.claims).toEqual([]);
    const reads = recorded.filter(
      ({ sql }) =>
        /^select /i.test(sql) && /(?:from|join) "(?:person|person_team|service_team)"/.test(sql),
    );
    expect(reads.length).toBeGreaterThan(0);
    const connection = openDatabase(path);
    try {
      let materialized = 0;
      for (const read of reads) {
        // Drizzle's logger exposes unknown[]; this test boundary only receives
        // SQLite-supported scalar parameters from the production query builder.
        const bindings = read.bindings as (string | number | null)[];
        materialized += connection.query(read.sql).all(...bindings).length;
        const plan = connection
          .query<{ detail: string }, (string | number | null)[]>(`EXPLAIN QUERY PLAN ${read.sql}`)
          .all(...bindings);
        expect(
          plan.filter(({ detail }) =>
            /SCAN (?:person|person_team|service_team)(?:\s|$)/.test(detail),
          ),
        ).toEqual([]);
      }
      // The work package's assignee names, then the one person asked for, by key.
      expect(materialized).toBeLessThanOrEqual(2);
    } finally {
      connection.close();
    }
  });
});
