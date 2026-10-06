import { encodeOptimizedResult } from '@wbs/contracts/solver/optimized-result';
import { readSharedPeople } from '@wbs/core';
import type { CapturedFanout } from '@wbs/core/ports/fanout-capture-store';
import { displaySchedule } from '@wbs/core/service/shared-people';
import { contractVersionOf, schedule, sliceKey } from '@wbs/domain';
import { createScheduler } from '@wbs/runtime-portable';
import { openConnection } from '@wbs/store-sqlite/db';
import { allocateGeneration } from '@wbs/store-sqlite/optimization-generation';
import { scheduleInputHash } from '@wbs/store-sqlite/schedule-input-hash';
import { optimizedScheduleCache } from '@wbs/store-sqlite/schema';
import { afterEach, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness | undefined;
afterEach(async () => {
  if (harness !== undefined) await harness.closeComposed();
  harness = undefined;
});

it('uses a selected ready upstream booking for a mounted rank move without optimizer writes', async () => {
  const captures: CapturedFanout[] = [];
  let observeMove = false;
  let spawns = 0;
  harness = OrganizationHarness.openComposed(
    true,
    undefined,
    () => {
      spawns += 1;
      return Promise.reject(new Error('selected rank fixture must not spawn a solver'));
    },
    '0.1.0',
    undefined,
    undefined,
    undefined,
    (captured) => {
      if (observeMove) captures.push(captured);
    },
  );
  const h = harness;
  await h.register('ada');
  h.organization('org-a');
  h.member('org-a', 'ada', 'admin');
  h.bind('ada', 'org-a');
  h.activate();
  const projects: { id: string; stepId: string }[] = [];
  for (const name of ['A', 'B', 'C']) {
    const response = await h.call('ada', 'POST', '/api/projects', { name });
    if (response.status !== 200)
      throw new Error(`rank fixture create refused: ${String(response.status)}`);
    const body = response.body as { project: { id: string }; steps: { id: string }[] };
    const stepId = body.steps.at(0)?.id;
    if (stepId === undefined) throw new Error('rank fixture project has no step');
    projects.push({ id: body.project.id, stepId });
  }
  const upstream = projects.at(0);
  const firstLower = projects.at(1);
  const secondLower = projects.at(2);
  if (upstream === undefined || firstLower === undefined || secondLower === undefined)
    throw new Error('selected rank fixture lacks three projects');
  h.sqlite.run("INSERT INTO person (id, name) VALUES ('selected-ana', 'Ana')");
  h.sqlite.run(
    "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('selected-ana', 'org-a', 'Ana')",
  );
  for (const [index, project] of projects.entries()) {
    h.sqlite.run(
      "UPDATE project SET start_date = '2026-10-05', estimate_rounding = 'exact' WHERE id = ?",
      [project.id],
    );
    const rowId = `selected-row-${String(index)}`;
    const days = index === 0 ? 1 : 2;
    h.sqlite.run('INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 10, ?)', [
      rowId,
      project.id,
      rowId,
    ]);
    h.sqlite.run(
      'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, ?, ?, ?)',
      [rowId, project.stepId, days, days, days],
    );
    h.sqlite.run('INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)', [
      rowId,
      project.stepId,
      'selected-ana',
    ]);
  }
  h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  await h.drainOptimization();
  const higher = await h.capturePlanInput(upstream.id);
  if (higher === null) throw new Error('selected rank fixture input disappeared');
  const fast = createScheduler(
    (rows, edges, slices, floors, pools, reach, deadlines, typed, elsewhere) =>
      schedule(rows, edges, slices, floors, pools, reach, deadlines, typed, undefined, elsewhere),
  );
  const chain = readSharedPeople([higher], upstream.id, fast);
  if (chain.kind !== 'scheduled' || chain.scheduled.kind !== 'scheduled')
    throw new Error('selected rank fixture has no schedule');
  const optimized = schedule(
    chain.input.rows,
    chain.input.edges,
    chain.input.slices,
    new Map([[`selected-row-0`, 1]]),
    chain.input.poolSizes,
    chain.input.reach,
    chain.input.deadlines,
    chain.input.typed,
    undefined,
    chain.input.elsewhere,
  );
  const upstreamSlice = sliceKey('selected-row-0', upstream.stepId);
  expect(chain.scheduled.fast.slices.get(upstreamSlice)?.earliestStart).toBe(0);
  expect(optimized.slices.get(upstreamSlice)?.earliestStart).toBe(1);
  const ready = openConnection(h.databasePath());
  try {
    const contractVersion = contractVersionOf('0.1.0');
    const inputHash = scheduleInputHash(chain.input);
    h.sqlite.run(
      "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
      [upstream.id],
    );
    const generation = allocateGeneration(ready.db, upstream.id, contractVersion, inputHash, 1);
    for (const objective of ['pri', 'time'] as const)
      ready.db
        .insert(optimizedScheduleCache)
        .values({
          projectId: upstream.id,
          inputHash,
          generation,
          contractVersion,
          budgetMs: 60_000,
          objective,
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
  const optimizerState = () =>
    ['optimization_generation', 'optimized_schedule_cache', 'solver_slot', 'solver_queue'].map(
      (table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    );
  const beforeState = optimizerState();
  const fixtureById = new Map(
    projects.map((project, index) => [
      project.id,
      { rowId: `selected-row-${String(index)}`, stepId: project.stepId },
    ]),
  );
  const startsOf = (captured: CapturedFanout) =>
    captured.observation.projects.map((project) => {
      if (project.outcome.kind !== 'scheduled')
        throw new Error('selected rank project unavailable');
      const fixture = fixtureById.get(project.projectId);
      if (fixture === undefined) throw new Error('selected rank fixture project disappeared');
      return {
        projectId: project.projectId,
        selected: displaySchedule(project.settings, project.outcome).planned.slices.get(
          sliceKey(fixture.rowId, fixture.stepId),
        )?.earliestStart,
        fast: project.outcome.fast.slices.get(sliceKey(fixture.rowId, fixture.stepId))
          ?.earliestStart,
      };
    });
  observeMove = true;
  const moved = await h.call('ada', 'POST', `/api/organization/projects/${secondLower.id}/rank`, {
    afterProjectId: upstream.id,
  });
  observeMove = false;
  expect(moved.status).toBe(200);
  expect(captures).toHaveLength(2);
  const starts = captures.map(startsOf);
  expect(starts[0]).toEqual([
    { projectId: upstream.id, selected: 1, fast: 0 },
    { projectId: firstLower.id, selected: 2, fast: 2 },
    { projectId: secondLower.id, selected: 4, fast: 4 },
  ]);
  expect(starts[1]).toEqual([
    { projectId: upstream.id, selected: 1, fast: 0 },
    { projectId: secondLower.id, selected: 2, fast: 2 },
    { projectId: firstLower.id, selected: 4, fast: 4 },
  ]);
  const pairs = h.sqlite
    .query<{ message: string }, []>(
      "SELECT message FROM event_log WHERE message LIKE '%elsewhere_changed%' ORDER BY subscription, seq",
    )
    .all()
    .map(
      ({ message }) =>
        JSON.parse(message) as { type: string; projectId: string; causeProjectId: string },
    );
  expect(pairs).toEqual(
    [
      { type: 'elsewhere_changed', projectId: firstLower.id, causeProjectId: secondLower.id },
      { type: 'elsewhere_changed', projectId: secondLower.id, causeProjectId: firstLower.id },
    ].sort((left, right) => left.projectId.localeCompare(right.projectId)),
  );
  observeMove = true;
  const switched = await h.call('ada', 'PATCH', `/api/projects/${upstream.id}`, {
    scheduleEngine: 'fast',
  });
  observeMove = false;
  expect(switched.status).toBe(200);
  expect(captures).toHaveLength(4);
  expect(startsOf(captures[2])).toEqual(starts[1]);
  expect(startsOf(captures[3])).toEqual([
    { projectId: upstream.id, selected: 0, fast: 0 },
    { projectId: secondLower.id, selected: 1, fast: 1 },
    { projectId: firstLower.id, selected: 3, fast: 3 },
  ]);
  expect(
    h.sqlite
      .query<{ message: string }, []>(
        "SELECT message FROM event_log WHERE message LIKE '%elsewhere_changed%' ORDER BY subscription, seq",
      )
      .all()
      .map(({ message }) => JSON.parse(message) as unknown),
  ).toEqual(
    [
      ...pairs,
      { type: 'elsewhere_changed', projectId: firstLower.id, causeProjectId: upstream.id },
      { type: 'elsewhere_changed', projectId: secondLower.id, causeProjectId: upstream.id },
    ].sort((left, right) => left.projectId.localeCompare(right.projectId)),
  );
  await h.drainOptimization();
  expect(optimizerState()).toEqual(beforeState);
  expect(spawns).toBe(0);
});
