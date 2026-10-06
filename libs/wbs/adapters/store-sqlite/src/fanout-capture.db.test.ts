import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { encodeOptimizedResult } from '@wbs/contracts/solver/optimized-result';
import { readSharedPeople } from '@wbs/core';
import { displaySchedule } from '@wbs/core/service/shared-people';
import { compareSharedPeopleFanout } from '@wbs/core/service/shared-people-fanout';
import { schedule, sliceKey } from '@wbs/domain';
import { createScheduler } from '@wbs/runtime-portable';
import { afterEach, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openConnection, openDatabase } from './db';
import { readFanoutObservationIn } from './fanout-capture';
import { allocateGeneration } from './optimization-generation';
import { SavedPlanCaptureRepository } from './saved-plan-capture';
import { scheduleInputHash } from './schedule-input-hash';
import { optimizedScheduleCache } from './schema';
import { openSqliteSource } from './source';
import { openSpaceDatabase } from './testing/space-database';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
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
    const generation = allocateGeneration(ready.db, 'a1', '15+0.2.0', inputHash, 1);
    ready.db
      .insert(optimizedScheduleCache)
      .values({
        projectId: 'a1',
        inputHash,
        generation,
        contractVersion: '15+0.2.0',
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
    optimization: { contractVersion: '15+0.2.0', budgetMs: 1000, now: () => 100 },
  };
  connection.db.run(sql.raw('BEGIN IMMEDIATE'));
  try {
    const optimizerState = () =>
      ['optimization_generation', 'optimized_schedule_cache', 'solver_slot', 'solver_queue'].map(
        (table) => connection.db.all(`SELECT * FROM ${table} ORDER BY rowid`),
      );
    const initialState = optimizerState();
    const before = await readFanoutObservationIn(connection.db, 'org-a', options);
    connection.db.run(sql.raw("UPDATE project SET schedule_engine = 'fast' WHERE id = 'a1'"));
    const after = await readFanoutObservationIn(connection.db, 'org-a', options);
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
