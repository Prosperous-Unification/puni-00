import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { encodeOptimizedResult } from '@wbs/contracts/solver/optimized-result';
import { readSharedPeople } from '@wbs/core';
import { recordCommittedFanout } from '@wbs/core/service/committed-fanout';
import { displaySchedule } from '@wbs/core/service/shared-people';
import { compareSharedPeopleFanout } from '@wbs/core/service/shared-people-fanout';
import { scheduleResolved } from '@wbs/domain';
import { schedule, sliceKey } from '@wbs/domain';
import { createScheduler } from '@wbs/runtime-portable';
import { afterEach, expect, it, spyOn } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openConnection, openDatabase } from './db';
import { DrizzleEventLogStore } from './event-log';
import {
  authorizeImportIn,
  authorizeProjectFanoutIn,
  authorizeStepFanoutIn,
  readFanoutObservationIn,
} from './fanout-capture';
import { OPEN } from './gate';
import { allocateGeneration } from './optimization-generation';
import { ProjectRepository } from './project';
import { ProjectRankRepository } from './project-rank';
import { createReadSnapshotLifetime } from './read-snapshot-lifetime';
import { SavedPlanCaptureRepository } from './saved-plan-capture';
import { scheduleInputHash } from './schedule-input-hash';
import { optimizedScheduleCache } from './schema';
import { openSqliteSource } from './source';
import { StepNodeAttemptRepository } from './step-node-attempt';
import { seedDependencyAuthority } from './testing/dependency-activation';
import { openSpaceDatabase } from './testing/space-database';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

it('keeps legacy and isolated captured owners silent without reading a scheduler', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-fanout-silent-'));
  directories.push(directory);
  const path = await openSpaceDatabase(directory);
  const connection = openConnection(path);
  try {
    const options: Parameters<typeof readFanoutObservationIn>[2] = {
      schedulerOf: () => {
        throw new Error('silent owner must not read shared scheduler');
      },
    };
    const legacy = await readFanoutObservationIn(
      connection.db,
      'org-a',
      options,
      createReadSnapshotLifetime(),
    );
    expect(legacy.observation).toEqual({ mode: 'legacy', organizationId: null, projects: [] });
    expect(legacy.localFacts.size).toBe(0);
    connection.db.run(
      sql.raw("UPDATE organization_activation SET state = 'activated', activated_at = 1"),
    );
    const isolated = await readFanoutObservationIn(
      connection.db,
      'org-a',
      options,
      createReadSnapshotLifetime(),
    );
    expect(isolated.observation).toEqual({
      mode: 'isolated',
      organizationId: 'org-a',
      projects: [],
    });
    expect(isolated.localFacts.size).toBe(0);
  } finally {
    connection.close();
  }
});

it('captures staged upstream displacement on the borrowed writer without admitting optimization', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-fanout-capture-'));
  directories.push(directory);
  const path = await openSpaceDatabase(directory);
  const seed = openDatabase(path);
  seed.run("UPDATE organization_activation SET state = 'activated', activated_at = 1");
  seed.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  seed.run("INSERT INTO person (id, name) VALUES ('ana', 'Ana')");
  seed.run(
    "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('ana', 'org-a', 'Ana')",
  );
  seed.run(
    "INSERT INTO project_rank (project_id, organization_id, position, created_at, created_by) VALUES ('a2', 'org-a', 10, 1, 'ada'), ('a1', 'org-a', 10, 1, 'ada')",
  );
  for (const projectId of ['a1', 'a2']) {
    seed.run(
      `UPDATE project SET start_date = '2026-10-05', estimate_rounding = 'exact', optimization_enabled = 1 WHERE id = '${projectId}'`,
    );
    seed.run(
      `INSERT INTO work_item (id, project_id, position, name) VALUES ('${projectId}', '${projectId}', 10, '${projectId}')`,
    );
    seed.run(
      `INSERT INTO step (id, project_id, name, position) VALUES ('${projectId}-step', '${projectId}', '${projectId}-step', 10)`,
    );
    const days = projectId === 'a2' ? 2 : 1;
    seed.run(
      `INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES ('${projectId}', '${projectId}-step', ${String(days)}, ${String(days)}, ${String(days)})`,
    );
    seed.run(
      `INSERT INTO assignment (work_item_id, step_id, person_id) VALUES ('${projectId}', '${projectId}-step', 'ana')`,
    );
  }
  seed.close();

  const capture = new SavedPlanCaptureRepository({ openConnection: () => openConnection(path) });
  const higher = await capture.readPlanInput('a1');
  if (higher === null) throw new Error('missing ranked capture fixture');
  const fast = createScheduler(
    (rows, edges, slices, floors, pools, reach, deadlines, typed, elsewhere) =>
      schedule(rows, edges, slices, floors, pools, reach, deadlines, typed, undefined, elsewhere),
    scheduleResolved,
  );
  const chain = readSharedPeople([higher], 'a1', fast);
  if (chain.kind !== 'scheduled' || chain.scheduled.kind !== 'scheduled')
    throw new Error('missing shared target input');
  const optimized = schedule(
    chain.input.rows,
    chain.input.edges,
    chain.input.slices,
    new Map([['a1', 1]]),
    chain.input.poolSizes,
    chain.input.reach,
    chain.input.deadlines,
    chain.input.typed,
    undefined,
    chain.input.elsewhere,
  );
  const fastStart = chain.scheduled.fast.slices.get(sliceKey('a1', 'a1-step'))?.earliestStart;
  const optimizedStart = optimized.slices.get(sliceKey('a1', 'a1-step'))?.earliestStart;
  expect(optimizedStart).not.toBe(fastStart);
  const ready = openConnection(path);
  try {
    ready.db.run(sql.raw("UPDATE project SET schedule_engine = 'optimized' WHERE id = 'a1'"));
    const inputHash = scheduleInputHash(chain.input);
    const generation = allocateGeneration(ready.db, 'a1', '17+0.3.0', inputHash, 1);
    ready.db
      .insert(optimizedScheduleCache)
      .values({
        projectId: 'a1',
        inputHash,
        generation,
        contractVersion: '17+0.3.0',
        budgetMs: 1000,
        objective: 'pri',
        status: 'ok',
        failureReason: null,
        createdAt: 1,
        resultJson: JSON.stringify(
          encodeOptimizedResult({
            publication: 'solver',
            objectiveValues: {
              makespan: { value: 9, stageValue: 9, bound: 9, status: 'optimal' },
              priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
              movement: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
            },
            schedule: optimized,
          }),
        ),
      })
      .run();
  } finally {
    ready.close();
  }

  const connection = openConnection(path);
  const schedulerOf: Parameters<typeof readFanoutObservationIn>[2]['schedulerOf'] = (
    readCaptured,
  ) =>
    createScheduler(
      (rows, edges, slices, floors, pools, reach, deadlines, typed, elsewhere) =>
        schedule(rows, edges, slices, floors, pools, reach, deadlines, typed, undefined, elsewhere),
      scheduleResolved,
      readCaptured === undefined
        ? undefined
        : {
            readCaptured,
            readLive: () => {
              throw new Error('live optimizer admission inside fan-out capture');
            },
          },
    );
  const options = {
    schedulerOf,
    optimization: { contractVersion: '17+0.3.0', budgetMs: 1000, now: () => 100 },
  };
  connection.db.run(sql.raw('BEGIN IMMEDIATE'));
  try {
    const optimizerState = () =>
      ['optimization_generation', 'optimized_schedule_cache', 'solver_slot', 'solver_queue'].map(
        (table) => connection.db.all(`SELECT * FROM ${table} ORDER BY rowid`),
      );
    const initialState = optimizerState();
    const before = await readFanoutObservationIn(
      connection.db,
      'org-a',
      options,
      createReadSnapshotLifetime(),
    );
    connection.db.run(sql.raw("UPDATE project SET schedule_engine = 'fast' WHERE id = 'a1'"));
    const after = await readFanoutObservationIn(
      connection.db,
      'org-a',
      options,
      createReadSnapshotLifetime(),
    );
    expect(optimizerState()).toEqual(initialState);
    expect(before.observation.projects.map((project) => project.projectId)).toEqual([
      'a1',
      'a2',
      'a3',
      'a4',
    ]);
    expect(before.observation.projects[1]?.outcome.kind).toBe('scheduled');
    expect(after.observation.projects[1]?.outcome.kind).toBe('scheduled');
    const selected = before.observation.projects[0];
    if (selected.outcome.kind !== 'scheduled') throw new Error('missing ready target capture');
    // Proof: dropping the captured optimizer binding made the before observation
    // engine_unavailable instead of retaining the ready selected schedule.
    expect(selected.outcome.optimization?.variants.pri).toEqual({
      state: 'ready',
      proof: 'proven',
    });
    expect(displaySchedule(selected.settings, selected.outcome).engine).toBe('optimized');
    expect(
      displaySchedule(selected.settings, selected.outcome).planned.slices.get(
        sliceKey('a1', 'a1-step'),
      )?.earliestStart,
    ).toBe(optimizedStart);
    expect(selected.outcome.fast.slices.get(sliceKey('a1', 'a1-step'))?.earliestStart).toBe(
      fastStart,
    );
    expect(before.observation.projects[0]?.inputHash).toBe(
      after.observation.projects[0]?.inputHash,
    );
    expect(before.observation.projects[1]?.inputHash).not.toBe(
      after.observation.projects[1]?.inputHash,
    );
    expect(before.observation.projects[1]?.outcome.kind).toBe('scheduled');
    expect(after.observation.projects[1]?.outcome.kind).toBe('scheduled');
    const beforeDownstream = before.observation.projects[1]?.outcome;
    const afterDownstream = after.observation.projects[1]?.outcome;
    if (beforeDownstream.kind !== 'scheduled' || afterDownstream.kind !== 'scheduled')
      throw new Error('missing downstream schedule');
    expect(beforeDownstream.fast.slices.get(sliceKey('a2', 'a2-step'))?.earliestStart).toBe(2);
    expect(afterDownstream.fast.slices.get(sliceKey('a2', 'a2-step'))?.earliestStart).toBe(1);
    expect(
      compareSharedPeopleFanout({
        before: before.observation,
        after: after.observation,
        directCauses: ['a1'],
      }).recipients,
    ).toEqual([{ projectId: 'a2', causeProjectId: 'a1' }]);
    expect(after.localFacts.get('a1')).not.toBe(before.localFacts.get('a1'));
    expect(after.localFacts.get('a2')).toBe(before.localFacts.get('a2'));
    expect(after.observation.projects[1]?.incomingBasis).not.toBe(
      before.observation.projects[1]?.incomingBasis,
    );
  } finally {
    connection.db.run(sql.raw('ROLLBACK'));
    connection.close();
  }
  const source = openSqliteSource({ dbPath: path }).bindLivePlans(options);
  try {
    const throughScope = await source.uow.run(async ({ fanoutCapture }) => {
      if (fanoutCapture === undefined) throw new Error('transactional fan-out capture missing');
      const captured = await fanoutCapture.capture('org-a');
      return { commit: true, value: captured };
    });
    expect(throughScope.observation.projects[1]?.projectId).toBe('a2');
  } finally {
    await source.close();
  }
});

it('records remote completion without shared people and rolls dependency events back with the writer', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-dependency-fanout-'));
  directories.push(directory);
  const path = await openSpaceDatabase(directory);
  seedDependencyAuthority(path);
  const connection = openConnection(path);
  try {
    connection.db.run(
      sql.raw("UPDATE organization_activation SET state = 'activated', activated_at = 1"),
    );
    for (const projectId of ['a1', 'a2']) {
      connection.db.run(
        sql`INSERT INTO work_item (id, project_id, position, name) VALUES (${projectId}, ${projectId}, 10, ${projectId})`,
      );
      connection.db.run(
        sql`INSERT INTO step (id, project_id, name, position) VALUES (${`${projectId}-step`}, ${projectId}, 'Build', 10)`,
      );
      connection.db.run(
        sql`INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (${projectId}, ${`${projectId}-step`}, 1, 1, 1)`,
      );
    }
    connection.db.run(
      sql.raw(
        "INSERT INTO external_dependency (id, organization_id, predecessor_project_id, successor_project_id, predecessor_work_item_id, predecessor_scope, successor_work_item_id, successor_scope, type) VALUES ('edge', 'org-a', 'a1', 'a2', 'a1', 'whole', 'a2', 'whole', 'FS')",
      ),
    );
    const options = {
      schedulerOf: () => {
        throw new Error('isolated fanout cannot schedule');
      },
    };
    connection.db.run(sql.raw('BEGIN IMMEDIATE'));
    const before = await readFanoutObservationIn(
      connection.db,
      'org-a',
      options,
      createReadSnapshotLifetime(),
    );
    connection.db.run(
      sql.raw(
        "INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES ('a1', 'a1-step', 'done', 1)",
      ),
    );
    const after = await readFanoutObservationIn(
      connection.db,
      'org-a',
      options,
      createReadSnapshotLifetime(),
    );
    const committed = await recordCommittedFanout(
      new DrizzleEventLogStore(connection.db, OPEN),
      before,
      after,
      () => 1,
    );
    expect(committed.map(({ event }) => event)).toEqual([
      { type: 'elsewhere_changed', projectId: 'a2', causeProjectId: 'a1' },
    ]);
    expect(
      connection.db.all(sql`SELECT * FROM event_log WHERE subscription = 'project:a2'`),
    ).toHaveLength(1);
    connection.db.run(sql.raw('ROLLBACK'));
    expect(connection.db.all(sql`SELECT * FROM step_progress`)).toHaveLength(0);
    expect(connection.db.all(sql`SELECT * FROM event_log`)).toHaveLength(0);
    expect(connection.db.all(sql`SELECT * FROM event_sequencer`)).toHaveLength(0);
  } finally {
    connection.close();
  }
});

it.each(['isolated', 'shared'])(
  'refuses missing and unreadable %s dependency endpoint evidence',
  async (mode) => {
    const directory = mkdtempSync(join(tmpdir(), 'wbs-dependency-fanout-corrupt-'));
    directories.push(directory);
    const path = await openSpaceDatabase(directory);
    seedDependencyAuthority(path);
    const connection = openConnection(path);
    try {
      connection.db.run(
        sql.raw("UPDATE organization_activation SET state = 'activated', activated_at = 1"),
      );
      if (mode === 'shared')
        connection.db.run(sql.raw("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'"));
      connection.db.run(sql.raw('PRAGMA foreign_keys = OFF'));
      connection.db.run(
        sql.raw(
          "INSERT INTO external_dependency (id, organization_id, predecessor_project_id, successor_project_id, predecessor_work_item_id, predecessor_scope, successor_work_item_id, successor_scope, type) VALUES ('edge', 'org-a', 'absent', 'a2', 'absent-row', 'whole', 'a2-row', 'whole', 'FS')",
        ),
      );
      const schedulerOf = () => {
        throw new Error('dependency invalidation cannot schedule');
      };
      expect(
        readFanoutObservationIn(
          connection.db,
          'org-a',
          { schedulerOf },
          createReadSnapshotLifetime(),
        ),
      ).rejects.toThrow('dependency fan-out endpoint is unreadable');
      connection.db.run(
        sql.raw("UPDATE external_dependency SET predecessor_project_id = 'a1' WHERE id = 'edge'"),
      );
      expect(
        readFanoutObservationIn(
          connection.db,
          'org-a',
          {
            schedulerOf,
            captureRead: {
              afterFirstRead: () => {
                throw new Error('injected endpoint read failure');
              },
            },
          },
          createReadSnapshotLifetime(),
        ),
      ).rejects.toThrow('injected endpoint read failure');
    } finally {
      connection.close();
    }
  },
);

it('invalidates surviving projects disconnected by relationship removal', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-dependency-fanout-topology-'));
  directories.push(directory);
  const path = await openSpaceDatabase(directory);
  seedDependencyAuthority(path);
  const connection = openConnection(path);
  try {
    connection.db.run(
      sql.raw("UPDATE organization_activation SET state = 'activated', activated_at = 1"),
    );
    for (const projectId of ['a1', 'a2'])
      connection.db.run(
        sql`INSERT INTO work_item (id, project_id, position, name) VALUES (${projectId}, ${projectId}, 10, ${projectId})`,
      );
    connection.db.run(
      sql.raw(
        "INSERT INTO external_dependency (id, organization_id, predecessor_project_id, successor_project_id, predecessor_work_item_id, predecessor_scope, successor_work_item_id, successor_scope, type) VALUES ('edge', 'org-a', 'a1', 'a2', 'a1', 'whole', 'a2', 'whole', 'FS')",
      ),
    );
    const options = {
      schedulerOf: () => {
        throw new Error('isolated invalidation cannot schedule');
      },
    };
    const before = await readFanoutObservationIn(
      connection.db,
      'org-a',
      options,
      createReadSnapshotLifetime(),
    );
    connection.db.run(sql.raw("DELETE FROM external_dependency WHERE id = 'edge'"));
    const after = await readFanoutObservationIn(
      connection.db,
      'org-a',
      options,
      createReadSnapshotLifetime(),
    );
    const committed = await recordCommittedFanout(
      new DrizzleEventLogStore(connection.db, OPEN),
      before,
      after,
      () => 1,
    );
    expect(committed.map(({ event }) => event)).toEqual([
      { type: 'elsewhere_changed', projectId: 'a1', causeProjectId: 'a2' },
      { type: 'elsewhere_changed', projectId: 'a2', causeProjectId: 'a1' },
    ]);
  } finally {
    connection.close();
  }
});

it.each(['restricted-project', 'viewer-project', 'viewer-step', 'viewer-import'])(
  'preserves scoped ceilings in borrowed %s authority',
  async (operation) => {
    const directory = mkdtempSync(join(tmpdir(), 'wbs-fanout-role-cap-'));
    directories.push(directory);
    const path = await openSpaceDatabase(directory);
    const connection = openConnection(path);
    try {
      connection.db.run(
        sql.raw(
          "INSERT INTO users (id, username, password_hash, created_at) VALUES ('sam', 'sam', 'hash', 1)",
        ),
      );
      connection.db.run(
        sql.raw(
          "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'sam', 'super_admin', 1)",
        ),
      );
      connection.db.run(sql.raw("UPDATE project SET restricted = 1 WHERE id = 'a1'"));
      const member = {
        kind: 'scoped' as const,
        scope: { organizationId: 'org-a', userId: 'sam', role: 'member' as const },
      };
      const viewer = {
        kind: 'scoped' as const,
        scope: { ...member.scope, role: 'viewer' as const },
      };
      const lifetime = createReadSnapshotLifetime();
      const refusal =
        operation === 'restricted-project'
          ? await authorizeProjectFanoutIn(connection.db, lifetime)('a1', 'sam', member)
          : operation === 'viewer-project'
            ? await authorizeProjectFanoutIn(connection.db, lifetime)('a2', 'sam', viewer)
            : operation === 'viewer-step'
              ? await authorizeStepFanoutIn(connection.db, lifetime)('a2', 'sam', viewer)
              : await authorizeImportIn(connection.db)('sam', viewer);
      expect(refusal).toEqual({ ok: false, reason: 'forbidden' });
    } finally {
      connection.close();
    }
  },
);

it.each(['external', 'alternating', 'disconnected'])(
  'captures staged %s shared connected facts once without scheduling the component',
  async (topology) => {
    const directory = mkdtempSync(join(tmpdir(), 'wbs-shared-connected-fanout-'));
    directories.push(directory);
    const path = await openSpaceDatabase(directory);
    seedDependencyAuthority(path);
    const connection = openConnection(path);
    try {
      connection.db.run(
        sql.raw("UPDATE organization_activation SET state = 'activated', activated_at = 1"),
      );
      connection.db.run(sql.raw("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'"));
      for (const projectId of ['a1', 'a2', 'a3', 'a4']) {
        connection.db.run(
          sql`INSERT INTO work_item (id, project_id, position, name) VALUES (${projectId}, ${projectId}, 10, ${projectId})`,
        );
        connection.db.run(
          sql`INSERT INTO step (id, project_id, name, position) VALUES (${`${projectId}-step`}, ${projectId}, 'Build', 10)`,
        );
      }
      connection.db.run(
        sql.raw(
          "INSERT INTO external_dependency (id, organization_id, predecessor_project_id, successor_project_id, predecessor_work_item_id, predecessor_scope, successor_work_item_id, successor_scope, type) VALUES ('edge', 'org-a', 'a2', 'a3', 'a2', 'whole', 'a3', 'whole', 'FS')",
        ),
      );
      if (topology === 'disconnected')
        connection.db.run(
          sql.raw(
            "INSERT INTO external_dependency (id, organization_id, predecessor_project_id, successor_project_id, predecessor_work_item_id, predecessor_scope, successor_work_item_id, successor_scope, type) VALUES ('separate', 'org-a', 'a1', 'a4', 'a1', 'whole', 'a4', 'whole', 'FS')",
          ),
        );
      if (topology === 'alternating') {
        for (const personId of ['p', 'q']) {
          connection.db.run(sql`INSERT INTO person (id, name) VALUES (${personId}, ${personId})`);
          connection.db.run(
            sql`INSERT INTO person_organization (resource_id, organization_id, name) VALUES (${personId}, 'org-a', ${personId})`,
          );
        }
        for (const [projectId, personId] of [
          ['a1', 'p'],
          ['a2', 'p'],
          ['a3', 'q'],
          ['a4', 'q'],
        ])
          connection.db.run(
            sql`INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (${projectId}, ${`${projectId}-step`}, ${personId})`,
          );
      }
      const capturedIds: string[] = [];
      const options = {
        schedulerOf: () =>
          createScheduler(
            (rows, edges, slices, floors, pools, reach, deadlines, typed, elsewhere) =>
              schedule(
                rows,
                edges,
                slices,
                floors,
                pools,
                reach,
                deadlines,
                typed,
                undefined,
                elsewhere,
              ),
            scheduleResolved,
          ),
        captureRead: {
          afterFirstRead: ({ projectId }: { projectId: string }) => {
            capturedIds.push(projectId);
            return Promise.resolve();
          },
        },
      };
      connection.db.run(sql.raw('BEGIN IMMEDIATE'));
      const before = await readFanoutObservationIn(
        connection.db,
        'org-a',
        options,
        createReadSnapshotLifetime(),
      );
      expect(capturedIds.sort()).toEqual(['a1', 'a2', 'a3', 'a4']);
      capturedIds.length = 0;
      const causeProjectId = topology === 'alternating' ? 'a1' : 'a2';
      connection.db.run(
        sql`INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES (${causeProjectId}, ${`${causeProjectId}-step`}, 'done', 1)`,
      );
      const after = await readFanoutObservationIn(
        connection.db,
        'org-a',
        options,
        createReadSnapshotLifetime(),
      );
      expect(capturedIds.sort()).toEqual(['a1', 'a2', 'a3', 'a4']);
      expect(after.observation.projects.map(({ projectId }) => projectId)).toEqual(
        topology === 'external' ? ['a1', 'a4'] : [],
      );
      const committed = await recordCommittedFanout(
        new DrizzleEventLogStore(connection.db, OPEN),
        before,
        after,
        () => 1,
        [causeProjectId],
      );
      expect(committed.map(({ event }) => event)).toEqual(
        (topology === 'alternating' ? ['a2', 'a3', 'a4'] : ['a3']).map((projectId) => ({
          type: 'elsewhere_changed',
          projectId,
          causeProjectId,
        })),
      );
      connection.db.run(
        sql`UPDATE step SET code = 'delivery' WHERE id = ${`${causeProjectId}-step`}`,
      );
      const relabeled = await readFanoutObservationIn(
        connection.db,
        'org-a',
        options,
        createReadSnapshotLifetime(),
      );
      const labelEvents = await recordCommittedFanout(
        new DrizzleEventLogStore(connection.db, OPEN),
        after,
        relabeled,
        () => 2,
      );
      expect(labelEvents.map(({ projectId }) => projectId)).toEqual(
        topology === 'alternating' ? ['a2', 'a3', 'a4'] : ['a3'],
      );
      connection.db.run(sql.raw("DELETE FROM external_dependency WHERE id = 'edge'"));
      capturedIds.length = 0;
      const detached = await readFanoutObservationIn(
        connection.db,
        'org-a',
        options,
        createReadSnapshotLifetime(),
      );
      expect(capturedIds.sort()).toEqual(['a1', 'a2', 'a3', 'a4']);
      expect(detached.observation.projects.map(({ projectId }) => projectId)).toEqual(
        topology === 'disconnected' ? ['a2', 'a3'] : ['a1', 'a2', 'a3', 'a4'],
      );
      const split = await recordCommittedFanout(
        new DrizzleEventLogStore(connection.db, OPEN),
        relabeled,
        detached,
        () => 3,
      );
      expect(split).toHaveLength(topology === 'alternating' ? 12 : 2);
      expect(
        split.some(
          ({ event }) =>
            event.type === 'elsewhere_changed' &&
            event.projectId === 'a3' &&
            event.causeProjectId === causeProjectId,
        ),
      ).toBe(true);
      connection.db.run(sql.raw('ROLLBACK'));
      expect(connection.db.all(sql`SELECT * FROM event_log`)).toHaveLength(0);
    } finally {
      connection.close();
    }
  },
);

it.each(['isolated', 'shared'] as const)(
  'captures staged component-relative rank changes in %s mode and ignores unrelated order and respacing',
  async (mode) => {
    const directory = mkdtempSync(join(tmpdir(), 'wbs-rank-fanout-'));
    directories.push(directory);
    const path = await openSpaceDatabase(directory);
    seedDependencyAuthority(path);
    const connection = openConnection(path);
    try {
      connection.db.run(
        sql.raw("UPDATE organization_activation SET state = 'activated', activated_at = 1"),
      );
      if (mode === 'shared')
        connection.db.run(sql.raw("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'"));
      for (const projectId of ['a1', 'a2', 'a3', 'a4'])
        connection.db.run(
          sql`INSERT INTO work_item (id, project_id, position, name) VALUES (${projectId}, ${projectId}, 10, ${projectId})`,
        );
      for (const [predecessor, successor] of [
        ['a1', 'a2'],
        ['a3', 'a4'],
      ])
        connection.db.run(
          sql`INSERT INTO external_dependency (id, organization_id, predecessor_project_id, successor_project_id, predecessor_work_item_id, predecessor_scope, successor_work_item_id, successor_scope, type) VALUES (${predecessor}, 'org-a', ${predecessor}, ${successor}, ${predecessor}, 'whole', ${successor}, 'whole', 'FS')`,
        );
      const capture = () =>
        readFanoutObservationIn(
          connection.db,
          'org-a',
          {
            schedulerOf: () =>
              createScheduler(
                (rows, edges, slices, floors, pools, reach, deadlines, typed, elsewhere) =>
                  schedule(
                    rows,
                    edges,
                    slices,
                    floors,
                    pools,
                    reach,
                    deadlines,
                    typed,
                    undefined,
                    elsewhere,
                  ),
                scheduleResolved,
              ),
          },
          createReadSnapshotLifetime(),
        );
      const ranks = new ProjectRankRepository(connection.db, OPEN);
      connection.db.run(sql.raw('BEGIN IMMEDIATE'));
      const before = await capture();
      await ranks.moveAfter('org-a', 'a3', null, { at: 1, by: 'ada' });
      const unrelated = await capture();
      expect(unrelated.dependency).toEqual(before.dependency);
      connection.db.run(sql.raw('UPDATE project_rank SET position = position * 7'));
      const respaced = await capture();
      expect(respaced.dependency).toEqual(unrelated.dependency);
      await ranks.moveAfter('org-a', 'a2', null, { at: 2, by: 'ada' });
      const reordered = await capture();
      expect(reordered.dependency?.projects.get('a1')).not.toBe(
        before.dependency?.projects.get('a1'),
      );
      expect(reordered.dependency?.projects.get('a2')).not.toBe(
        before.dependency?.projects.get('a2'),
      );
      expect(reordered.dependency?.projects.get('a3')).toBe(before.dependency?.projects.get('a3'));
      expect(reordered.dependency?.projects.get('a4')).toBe(before.dependency?.projects.get('a4'));
      const committed = await recordCommittedFanout(
        new DrizzleEventLogStore(connection.db, OPEN),
        respaced,
        reordered,
        () => 3,
      );
      expect(committed.map(({ event }) => event)).toEqual([
        { type: 'elsewhere_changed', projectId: 'a1', causeProjectId: 'a2' },
        { type: 'elsewhere_changed', projectId: 'a2', causeProjectId: 'a1' },
      ]);
      connection.db.run(sql.raw('ROLLBACK'));
      expect((await capture()).dependency).toEqual(before.dependency);
      expect(connection.db.all(sql`SELECT * FROM event_log`)).toHaveLength(0);
    } finally {
      connection.close();
    }
  },
);

it('refuses a dependency member omitted from authoritative rank order', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-fanout-missing-rank-'));
  directories.push(directory);
  const path = await openSpaceDatabase(directory);
  seedDependencyAuthority(path);
  const connection = openConnection(path);
  const order = spyOn(ProjectRankRepository.prototype, 'orderIn').mockResolvedValue([]);
  try {
    connection.db.run(
      sql.raw("UPDATE organization_activation SET state = 'activated', activated_at = 1"),
    );
    for (const projectId of ['a1', 'a2'])
      connection.db.run(
        sql`INSERT INTO work_item (id, project_id, position, name) VALUES (${projectId}, ${projectId}, 10, ${projectId})`,
      );
    connection.db.run(
      sql.raw(
        "INSERT INTO external_dependency (id, organization_id, predecessor_project_id, successor_project_id, predecessor_work_item_id, predecessor_scope, successor_work_item_id, successor_scope, type) VALUES ('edge', 'org-a', 'a1', 'a2', 'a1', 'whole', 'a2', 'whole', 'FS')",
      ),
    );
    expect(
      readFanoutObservationIn(
        connection.db,
        'org-a',
        {
          schedulerOf: () => {
            throw new Error('isolated capture cannot schedule');
          },
        },
        createReadSnapshotLifetime(),
      ),
    ).rejects.toThrow('dependency fan-out member absent from rank order');
  } finally {
    order.mockRestore();
    connection.close();
  }
});

it('refuses expired rank evidence before reading a dependency member', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-fanout-expired-rank-'));
  directories.push(directory);
  const path = await openSpaceDatabase(directory);
  seedDependencyAuthority(path);
  const connection = openConnection(path);
  const lifetime = createReadSnapshotLifetime();
  const read = spyOn(ProjectRepository.prototype, 'findInOrganization');
  const order = spyOn(ProjectRankRepository.prototype, 'orderIn').mockImplementation(() => {
    lifetime.expire();
    return Promise.resolve([
      { projectId: 'a1', rank: 1, ranked: false },
      { projectId: 'a2', rank: 2, ranked: false },
    ]);
  });
  try {
    connection.db.run(
      sql.raw("UPDATE organization_activation SET state = 'activated', activated_at = 1"),
    );
    for (const projectId of ['a1', 'a2'])
      connection.db.run(
        sql`INSERT INTO work_item (id, project_id, position, name) VALUES (${`${projectId}-row`}, ${projectId}, 10, ${projectId})`,
      );
    connection.db.run(
      sql.raw(
        "INSERT INTO external_dependency (id, organization_id, predecessor_project_id, successor_project_id, predecessor_work_item_id, predecessor_scope, successor_work_item_id, successor_scope, type) VALUES ('edge', 'org-a', 'a1', 'a2', 'a1-row', 'whole', 'a2-row', 'whole', 'FS')",
      ),
    );
    expect(
      readFanoutObservationIn(
        connection.db,
        'org-a',
        {
          schedulerOf: () => {
            throw new Error('isolated capture cannot schedule');
          },
        },
        lifetime,
      ),
    ).rejects.toThrow('snapshot');
    expect(read).not.toHaveBeenCalled();
  } finally {
    order.mockRestore();
    read.mockRestore();
    connection.close();
  }
});

// Proof: removing the post-attempt-await lifetime assertion lets the a2 read
// finish and the expired fanout resolve instead of rejecting "read snapshot is closed".
it('refuses an attempt read that completes after its borrowed snapshot expires', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-fanout-expired-attempt-'));
  directories.push(directory);
  const path = await openSpaceDatabase(directory);
  seedDependencyAuthority(path);
  const connection = openConnection(path);
  const lifetime = createReadSnapshotLifetime();
  const original = Object.getOwnPropertyDescriptor(
    StepNodeAttemptRepository.prototype,
    'listByProject',
  )?.value as StepNodeAttemptRepository['listByProject'];
  const read = spyOn(StepNodeAttemptRepository.prototype, 'listByProject').mockImplementation(
    async function (this: StepNodeAttemptRepository, projectId) {
      const attempts = await original.call(this, projectId);
      if (projectId === 'a2') lifetime.expire();
      return attempts;
    },
  );
  try {
    connection.db.run(
      sql.raw("UPDATE organization_activation SET state = 'activated', activated_at = 1"),
    );
    for (const projectId of ['a1', 'a2'])
      connection.db.run(
        sql`INSERT INTO work_item (id, project_id, position, name) VALUES (${`${projectId}-row`}, ${projectId}, 10, ${projectId})`,
      );
    connection.db.run(
      sql.raw(
        "INSERT INTO external_dependency (id, organization_id, predecessor_project_id, successor_project_id, predecessor_work_item_id, predecessor_scope, successor_work_item_id, successor_scope, type) VALUES ('edge', 'org-a', 'a1', 'a2', 'a1-row', 'whole', 'a2-row', 'whole', 'FS')",
      ),
    );
    expect(
      readFanoutObservationIn(
        connection.db,
        'org-a',
        {
          schedulerOf: () => {
            throw new Error('capture cannot schedule');
          },
        },
        lifetime,
      ),
    ).rejects.toThrow('read snapshot is closed');
  } finally {
    read.mockRestore();
    connection.close();
  }
});
