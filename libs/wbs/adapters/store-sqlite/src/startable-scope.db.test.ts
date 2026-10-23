import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AvailableWorkItemService as WorkItemService } from '@wbs/core/testing/available-work-item-service';
import { inMemoryServices } from '@wbs/core/testing/harness';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { personAdded } from '@wbs/store-memory/testing/service-fixtures';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { ClaimRepository } from './claim';
import { openDatabase, openDrizzle } from './db';
import { DirectoryRepository } from './directory';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { ProjectRepository } from './project';
import { DemandRepository, ResourceCapacityRepository } from './resource';
import { UserRepository } from './user';
import { WorkItemRepository } from './work-item';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const STAMP = { at: 1, by: 'owner' };
let folder: string;
let path: string;
let service: WorkItemService;
let recorded: { sql: string; bindings: unknown[] }[];
let stores: {
  directory: DirectoryRepository;
  workItems: WorkItemRepository;
  capacities: ResourceCapacityRepository;
  demands: DemandRepository;
};

/**
 * The startable read under legacy access among 40 unrelated assigned people
 * (spec `project-assignment-reads`, applied to `wbs-team-claims` task 3.1):
 * one assignee and one claim holder in the project, so no person read may
 * materialize anyone else.
 */
beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'wbs-startable-scope-'));
  path = join(folder, 'test.db');
  runMigrations(path, FOLDER);
  recorded = [];
  const db = openDrizzle(path, {
    logQuery(sql, bindings) {
      recorded.push({ sql, bindings });
    },
  });
  const directory = new DirectoryRepository(db, OPEN);
  const projects = new ProjectRepository(db, OPEN);
  const workItems = new WorkItemRepository(db, OPEN);
  const claims = new ClaimRepository(db, OPEN);
  service = inMemoryServices({
    projects,
    workItems,
    directory,
    claims,
    resourceCapacity: new ResourceCapacityRepository(db, OPEN),
    demands: new DemandRepository(db, OPEN),
  }).service;
  stores = {
    directory,
    workItems,
    capacities: new ResourceCapacityRepository(db, OPEN),
    demands: new DemandRepository(db, OPEN),
  };
  await new UserRepository(db, OPEN).create(
    { id: 'owner', username: 'owner', passwordHash: 'x', createdAt: 1 },
    STAMP,
  );
  const team = await directory.addTeam({ id: 'team', name: 'Shared team' }, STAMP);
  for (let index = 0; index < 41; index += 1) {
    const projectId = `project-${String(index)}`;
    const stepId = `step-${String(index)}`;
    const workItemId = `work-${String(index)}`;
    const personId = `person-${String(index)}`;
    await projects.create(
      projectRow({ id: projectId, ownerId: 'owner' }),
      [
        {
          id: stepId,
          projectId,
          name: 'Dev',
          position: 10,
          code: 'dev',
          allowancePercent: 0,
          estimateUnit: 'workdays' as const,
        },
      ],
      STAMP,
    );
    await workItems.insert(workItemRow({ id: workItemId, projectId }), [], STAMP);
    await personAdded(directory.addPerson({ id: personId, name: personId }, [team.id], STAMP));
    await directory.assign(workItemId, stepId, personId, STAMP);
  }
  await workItems.insert(workItemRow({ id: 'claimed', projectId: 'project-0' }), [], STAMP);
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

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

/** Every person read the last call recorded, run again: the rows it materialized and its plan. */
function personReadsSince(): { materialized: number; scans: string[] } {
  const reads = recorded.filter(
    ({ sql }) =>
      /^select /i.test(sql) && /(?:from|join) "(?:person|person_team|service_team)"/.test(sql),
  );
  expect(reads.length).toBeGreaterThan(0);
  const connection = openDatabase(path);
  try {
    let materialized = 0;
    const scans: string[] = [];
    for (const read of reads) {
      // Drizzle's logger exposes unknown[]; this test boundary only receives
      // SQLite-supported scalar parameters from the production query builder.
      const bindings = read.bindings as (string | number | null)[];
      materialized += connection.query(read.sql).all(...bindings).length;
      scans.push(
        ...connection
          .query<{ detail: string }, (string | number | null)[]>(`EXPLAIN QUERY PLAN ${read.sql}`)
          .all(...bindings)
          .map(({ detail }) => detail)
          .filter((detail) => /SCAN (?:person|person_team|service_team)(?:\s|$)/.test(detail)),
      );
    }
    return { materialized, scans };
  } finally {
    connection.close();
  }
}

describe('a refused claim under legacy access', () => {
  // Proof: with the root `listPeople()` in place of `namesOf`, this saw a
  // `SCAN person` and materialized 85 rows; watched 2026-10-20.
  it('reads only the people a refused claim names', async () => {
    const connection = openDatabase(path);
    connection.run("UPDATE person SET account_id = 'owner' WHERE id = 'holder'");
    connection.close();
    recorded = [];
    const refused = await service.claim(
      'claimed',
      'owner',
      {
        personId: 'holder',
        stepIds: ['step-0'],
        runId: 'another-run',
        parentClaimId: null,
        assign: false,
        resources: null,
      },
      { kind: 'legacy' },
      null,
    );
    expect(refused).toMatchObject({
      ok: false,
      reason: 'already_claimed',
      holders: [{ personId: 'holder', name: 'Holder' }],
    });
    // The holder's name, and the holder again as the claimant's bound account.
    const { materialized, scans } = personReadsSince();
    expect(scans).toEqual([]);
    expect(materialized).toBeLessThanOrEqual(2);
  });
});

describe('the startable read under legacy access', () => {
  it('materializes only the assignee and the claim holder during a tiny startable read', async () => {
    const startable = await service.startableWithin('project-0', { kind: 'legacy' }, null);
    if (startable === null || 'kind' in startable) throw new Error('the read did not answer');
    expect(startable.leaves.map(({ assignees }) => assignees)).toEqual([
      [{ stepId: 'step-0', personId: 'person-0', name: 'person-0' }],
    ]);
    expect(startable.claimed.map(({ holder }) => holder)).toEqual([
      { personId: 'holder', name: 'Holder' },
    ]);
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
      expect(materialized).toBeLessThanOrEqual(2);
    } finally {
      connection.close();
    }
  });
});

/** The fit reads (`wbs-resources` R6) the last call recorded, by the table each reads. */
const FIT_TABLES = [
  'claim_occupancy',
  'project_resource_capacity',
  'work_item_resource_demand',
  'resource',
];

describe('resource fit in the startable read', () => {
  // Proof: with the occupancy read once per row (`rows.map(() => occupancyOf)`
  // in `startableWithin`), this counted 32 `claim_occupancy` reads; watched 2026-10-20.
  it('reads capacities, demands and occupancy once each, whatever the number of leaves', async () => {
    const added = await stores.directory.addResource(
      { id: 'ram', name: 'h2puni ram', kind: 'divisible', unitLabel: 'GB' },
      STAMP,
    );
    if (!added.ok) throw new Error('the resource was refused');
    expect(await stores.capacities.set('project-0', 'ram', 8, STAMP)).toEqual({ ok: true });
    for (let index = 0; index < 30; index += 1) {
      const id = `leaf-${String(index)}`;
      await stores.workItems.insert(
        workItemRow({ id, projectId: 'project-0', position: index + 2 }),
        [],
        STAMP,
      );
      expect(await stores.demands.set(id, 'ram', 1 + (index % 8), STAMP)).toBe('written');
    }
    expect(await stores.demands.set('claimed', 'ram', 4, STAMP)).toBe('written');
    const connection = openDatabase(path);
    connection.run(
      "INSERT INTO claim_occupancy (claim_id, resource_id, units) VALUES ('claim-1', 'ram', 4)",
    );
    connection.close();
    recorded = [];
    const startable = await service.startableWithin('project-0', { kind: 'legacy' }, null);
    if (startable === null || 'kind' in startable) throw new Error('the read did not answer');
    expect(startable.resources.map(({ occupied, free }) => ({ occupied, free }))).toEqual([
      { occupied: 4, free: 4 },
    ]);
    expect(startable.leaves.length + startable.doesNotFit.length).toBe(31);
    expect(startable.doesNotFit.length).toBeGreaterThan(0);
    const reads = recorded.filter(({ sql }) => /^select /i.test(sql));
    const readsOf = (table: string) =>
      reads.filter(({ sql }) => new RegExp(`from "${table}"`).test(sql));
    expect(FIT_TABLES.map((table) => [table, readsOf(table).length])).toEqual(
      FIT_TABLES.map((table) => [table, 1]),
    );
    const check = openDatabase(path);
    try {
      const plans = FIT_TABLES.flatMap((table) =>
        readsOf(table).flatMap((read) =>
          check
            .query<{ detail: string }, (string | number | null)[]>(`EXPLAIN QUERY PLAN ${read.sql}`)
            // Drizzle's logger exposes unknown[]; this test boundary only receives
            // SQLite-supported scalar parameters from the production query builder.
            .all(...(read.bindings as (string | number | null)[]))
            .map(({ detail }) => `${table}: ${detail}`),
        ),
      );
      // Every fit read searches by the project's key; the one scan is the
      // root resource catalog, read once under legacy access (`listResources`).
      expect(plans.filter((detail) => detail.includes('SCAN'))).toEqual([
        'resource: SCAN resource USING INDEX resource_name',
      ]);
    } finally {
      check.close();
    }
  });
});
