import { buildConnectedSolverRequest } from '@wbs/contracts/solver/build-connected-request';
import { encodeConnectedSuccess } from '@wbs/contracts/solver/connected-durable';
import { captureConnectedHistory } from '@wbs/core/module/saved-plans/connected-history';
import {
  canonicalConnectedStageInput,
  readSavedPlanInput,
  SavedHistoryError,
  serializeSavedConnectedScheduleBody,
  sliceKey,
} from '@wbs/domain';
import {
  captureConnectedQuestion,
  hashConnectedBytes,
} from '@wbs/store-sqlite/connected-question-identity';
import { openConnection } from '@wbs/store-sqlite/db';
import { optimizedScheduleCache } from '@wbs/store-sqlite/schema';
import { expect, test } from 'bun:test';

import { captureMixedFixture, captureSavedConnectedFixture } from './saved-plan-connected.fixture';

test.each(['isolated', 'shared'] as const)(
  'converts detached migrated %s capture with interleaved stages and original string codes',
  async (mode) => {
    const captured = await captureSavedConnectedFixture(mode);
    const prepared = captureConnectedHistory(captured, 'a1');
    expect(readSavedPlanInput(prepared.input, 9)).toEqual(prepared.input);
    const history = prepared.input.dependencyHistory;
    if (history.kind !== 'connected') throw new Error('connected history expected');
    expect(history.mode).toBe(mode);
    expect(history.relationships.map((relationship) => relationship.id)).toEqual([
      'ab',
      'ba',
      'hb',
    ]);
    expect(
      history.projects
        .find((project) => project.projectId === 'a1')
        ?.steps.map((step) => step.code),
    ).toEqual(['design', 'test']);
    expect(
      history.readiness.find((node) => node.workItemId === 'b' && node.kind === 'step')?.status,
    ).toBe('blocked_by_proxy');
    if (!prepared.schedule.present) throw new Error('selected schedule expected');
    const placement = captured.projection.placement;
    if (placement.kind !== 'scheduled') throw new Error('scheduled placement expected');
    expect(prepared.schedule.body.slices[sliceKey('a', 'test')].earliestStart).toBe(1.75);
    expect(prepared.schedule.body.connection.stages.map((stage) => stage.stageBytes)).toEqual(
      placement.stages.map((selection) => canonicalConnectedStageInput(selection.stage)),
    );
    const bytes = serializeSavedConnectedScheduleBody(prepared.schedule.body);
    Map.prototype.clear.call(captured.metadataByProject);
    expect(serializeSavedConnectedScheduleBody(prepared.schedule.body)).toBe(bytes);
  },
);

test.each([
  ['project', 'name', 'Old project'],
  ['project', 'abbreviation', 'OLD'],
  ['project', 'startDate', '2026-09-01'],
  ['project', 'scheduleEngine', 'optimized'],
  ['project', 'scheduleObjective', 'time'],
  ['project', 'optimizationEnabled', true],
  ['row', 'hold', 'on_hold'],
  ['row', 'name', 'Old row'],
  ['row', 'parentId', 'missing'],
  ['row', 'position', 99],
  ['row', 'frozenNumber', '999'],
  ['step', 'name', 'Old step'],
  ['step', 'code', 'old'],
  ['step', 'position', 99],
] as const)(
  'refuses contradictory foreign %s %s before historical conversion',
  async (kind, field, value) => {
    const captured = await captureSavedConnectedFixture('isolated');
    const foreign = captured.metadataByProject.get('a2');
    if (foreign === undefined) throw new Error('foreign fixture expected');
    const facts =
      kind === 'project'
        ? foreign.project
        : kind === 'row'
          ? foreign.workItems[0]
          : foreign.steps[0];
    Reflect.set(facts, field, value);
    expect(() => captureConnectedHistory(captured, 'a1')).toThrow(SavedHistoryError);
    expect(() => captureConnectedHistory(captured, 'a1')).toThrow('metadata_facts');
  },
);

test.each(['isolated', 'shared'] as const)(
  'retains %s SQL cache-ready mixed-engine movement and later captured foreign boundary',
  async (mode) => {
    const captured = await captureMixedFixture(mode, false);
    const prepared = captureConnectedHistory(captured, 'a1');
    if (!prepared.schedule.present) throw new Error('schedule expected');
    const body = prepared.schedule.body;
    const [first, second] = body.connection.stages;
    expect(body.connection.baseline.slices[sliceKey('a', 'design')].earliestStart).toBe(3);
    expect(body.connection.composite.slices[sliceKey('a', 'design')].earliestStart).toBe(0);
    expect(body.slices[sliceKey('a', 'test')].earliestStart).toBe(0.5);
    expect(body.slices[sliceKey('a', 'design')].personId).toBe('person');
    expect(body.connection.baseline.slices[sliceKey('a', 'design')].personId).toBe('person');
    expect(body.connection.composite.slices[sliceKey('a', 'design')].personId).toBe('person');
    if (first.variants?.time.state !== 'ready') throw new Error('ready expected');
    expect(first.variants.time.decision.schedule.slices[sliceKey('a', 'design')].personId).toBe(
      mode === 'shared' ? 'person' : JSON.stringify(['person', 'a1', 'person']),
    );
    for (const kind of ['team', 'resource']) {
      expect(first.stageBytes).toContain(JSON.stringify(JSON.stringify([kind, 'a1', kind])));
    }
    expect(first.selected).toBe('time');
    expect(second.selected).toBeNull();
    expect(first.variants.time).toMatchObject({
      state: 'ready',
      decision: { chosen: 'optimized' },
    });
    expect(second.variants?.time).toMatchObject({ state: 'ready' });
    expect(first.stageBytes).toContain(JSON.stringify([sliceKey('a', 'design'), 3]));
    expect(second.stageBytes).toContain(JSON.stringify([sliceKey('a', 'design'), 0]));
    expect(body.connection.composite.slices[sliceKey('b', 'build')].earliestStart).toBe(8);
    const foreign = captureConnectedHistory(captured, 'a2');
    if (!foreign.schedule.present) throw new Error('foreign schedule expected');
    expect(foreign.schedule.body.slices[sliceKey('b', 'build')].earliestStart).toBe(7);
  },
);

test('SQL quantisation-floor ready selects baseline and preserves a ready unselected sibling', async () => {
  const prepared = captureConnectedHistory(await captureMixedFixture('isolated', true), 'a1');
  if (!prepared.schedule.present) throw new Error('schedule expected');
  const stage = prepared.schedule.body.connection.stages[0];
  expect(stage.selected).toBe('time');
  expect(stage.variants?.time).toMatchObject({
    state: 'ready',
    proof: 'quantisation-floor',
    decision: { chosen: 'baseline' },
  });
  expect(stage.variants?.pri).toMatchObject({
    state: 'ready',
    proof: 'proven',
    decision: { chosen: 'optimized' },
  });
  expect(prepared.schedule.body.slices[sliceKey('a', 'design')].earliestStart).toBe(3);
});

test('retains node whole and descendant-step endpoints with original parent and step identities', async () => {
  const captured = await captureSavedConnectedFixture('isolated', {
    seed: (client) => {
      client.run(
        "INSERT INTO work_item(id,project_id,position,name) VALUES('group','a1',5,'Alpha group')",
      );
      client.run("UPDATE work_item SET parent_id='group' WHERE id='a'");
      client.run(
        "UPDATE external_dependency SET predecessor_work_item_id='group',predecessor_scope='descendant-step' WHERE id='ab'",
      );
    },
  });
  const prepared = captureConnectedHistory(captured, 'a2');
  const history = prepared.input.dependencyHistory;
  if (history.kind !== 'connected') throw new Error('connected history expected');
  expect(history.relationships.find((edge) => edge.id === 'ab')?.predecessor).toMatchObject({
    projectId: 'a1',
    workItemId: 'group',
    scope: 'descendant-step',
    name: 'Alpha group',
    step: { id: 'design', code: 'design' },
  });
  expect(history.relationships.find((edge) => edge.id === 'ba')?.predecessor.scope).toBe('node');
  expect(history.relationships.find((edge) => edge.id === 'hb')?.predecessor.scope).toBe('whole');
  if (!prepared.schedule.present) throw new Error('schedule expected');
  expect(prepared.schedule.body.slices[sliceKey('b', 'build')].earliestStart).toBe(0);
});

test('nonempty held member stays historical and idle without a synthetic stage', async () => {
  const captured = await captureSavedConnectedFixture('isolated', {
    seed: (client) => client.run("UPDATE work_item SET hold='on_hold' WHERE id='b'"),
  });
  const prepared = captureConnectedHistory(captured, 'a1');
  if (!prepared.schedule.present) throw new Error('schedule expected');
  expect(prepared.schedule.body.connection.idleProjects).toEqual(['a2']);
  expect(prepared.schedule.body.connection.stages.map((stage) => stage.projectId)).toEqual(['a1']);
  const history = prepared.input.dependencyHistory;
  if (history.kind !== 'connected') throw new Error('connected history expected');
  expect(history.projects.find((project) => project.projectId === 'a2')?.workItems).toMatchObject([
    { id: 'b', hold: 'on_hold' },
  ]);
});

test.each(['engine', 'cycle', 'range'] as const)(
  'real SQLite %s refusal agrees across input and schedule',
  async (reason) => {
    const captured = await captureSavedConnectedFixture('isolated', {
      seed: (client) => {
        if (reason === 'engine')
          client.run(
            "UPDATE project SET schedule_engine='optimized',optimization_enabled=1 WHERE id='a2'",
          );
        if (reason === 'cycle')
          client.run("UPDATE external_dependency SET successor_step_id='design' WHERE id='ba'");
        if (reason === 'range')
          client.run('UPDATE estimate SET optimistic=1e12,realistic=1e12,pessimistic=1e12');
      },
    });
    const prepared = captureConnectedHistory(captured, 'a1');
    expect(prepared.schedule).toEqual({
      present: false,
      absentReason: reason === 'engine' ? 'unavailable' : 'infeasible',
    });
    const history = prepared.input.dependencyHistory;
    if (history.kind !== 'connected') throw new Error('connected history expected');
    expect(history.placementState).toMatchObject(
      reason === 'engine'
        ? { kind: 'engine_unavailable', projects: ['a2'], reason: 'adapter_missing' }
        : { kind: 'unavailable', reason: reason === 'range' ? 'calendar_range' : 'cycle' },
    );
    expect(history.relationships).toHaveLength(3);
  },
);

// Proof: omitting team/resource identity restoration exposed encoded IDs in the actual public bindings (slice-d-fault-binding-restoration.log, slice-d-fault-resource-restoration.log).
test.each(['team', 'resource'] as const)(
  'retains real %s capacity binding in public and encoded history placements',
  async (kind) => {
    const captured = await captureSavedConnectedFixture('isolated', {
      seed: (client) => {
        client.run("DELETE FROM external_dependency WHERE id IN ('ba','hb')");
        client.run(
          "INSERT INTO work_item(id,project_id,position,name) VALUES('c','a1',30,'Contending work')",
        );
        client.run(
          "INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES('c','design',1,1,1),('c','test',1,1,1)",
        );
        if (kind === 'team') {
          client.run("INSERT INTO service_team(id,name) VALUES('pool','Pool')");
          client.run(
            "INSERT INTO service_team_organization(resource_id,organization_id,name) VALUES('pool','org-a','Pool')",
          );
          client.run(
            "INSERT INTO work_item_team(work_item_id,team_id) VALUES('a','pool'),('c','pool')",
          );
          client.run(
            "INSERT INTO project_team_capacity(project_id,service_team_id,size) VALUES('a1','pool',1)",
          );
        } else {
          client.run(
            "INSERT INTO resource(id,name,kind,unit_label) VALUES('pool','Pool','exclusive','units')",
          );
          client.run(
            "INSERT INTO resource_organization(resource_id,organization_id,name) VALUES('pool','org-a','Pool')",
          );
          client.run(
            "INSERT INTO work_item_resource_demand(work_item_id,resource_id,units) VALUES('a','pool',1),('c','pool',1)",
          );
          client.run(
            "INSERT INTO project_resource_capacity(project_id,resource_id,units) VALUES('a1','pool',1)",
          );
        }
      },
    });
    const prepared = captureConnectedHistory(captured, 'a1');
    if (!prepared.schedule.present) throw new Error('capacity schedule expected');
    const body = prepared.schedule.body;
    const key = sliceKey('a', 'design');
    for (const placement of [body, body.connection.baseline, body.connection.composite]) {
      const slice = placement.slices[key];
      expect(slice.boundBy).toBe('capacity');
      expect(slice.capacityPredecessorIds.length).toBeGreaterThan(0);
      expect(slice.earliestStart).toBeGreaterThan(0);
      expect(slice.capacityTeamId).toBe(kind === 'team' ? 'pool' : null);
      expect(slice.capacityResource).toEqual(
        kind === 'resource' ? { resourceId: 'pool', units: 1 } : undefined,
      );
    }
    expect(body.connection.stages[0].stageBytes).toContain(
      JSON.stringify(JSON.stringify([kind, 'a1', 'pool'])),
    );
    expect(serializeSavedConnectedScheduleBody(body)).toContain('capacityPredecessorIds');
  },
);

test('saved fractional FS evidence retains durable movement scores and the real Fast baseline', async () => {
  let durableComparison: ReturnType<typeof encodeConnectedSuccess>['comparison'] | undefined;
  const installed = { solverVersion: '0.4.0', budgetMs: 1000, now: () => 12 };
  const captured = await captureSavedConnectedFixture('isolated', {
    connected: installed,
    seed: (client) => {
      client.run("DELETE FROM external_dependency WHERE id IN ('ba','hb')");
      client.run("DELETE FROM estimate WHERE step_id='test'");
      client.run("DELETE FROM step WHERE id='test'");
      client.run(
        "UPDATE estimate SET optimistic=0.2,realistic=0.2,pessimistic=0.2 WHERE work_item_id='a'",
      );
      client.run(
        "UPDATE estimate SET optimistic=1,realistic=1,pessimistic=1 WHERE work_item_id='b'",
      );
      client.run(
        "UPDATE project SET start_date='2026-10-05',schedule_engine='fast',optimization_enabled=0 WHERE id='a1'",
      );
      client.run(
        "UPDATE project SET start_date='2026-10-05',schedule_engine='optimized',optimization_enabled=1,schedule_objective='time' WHERE id='a2'",
      );
    },
    prepare: async (path, read) => {
      const current = await read();
      if (current.projection.placement.kind !== 'scheduled') throw new Error('placement expected');
      const stage = current.projection.placement.stages.find(
        (selection) => selection.stage.projectId === 'a2',
      )?.stage;
      if (stage === undefined) throw new Error('stage expected');
      expect(stage.starts.get(sliceKey('b', 'build'))).toBeCloseTo(0.2, 14);
      const question = captureConnectedQuestion(stage, 'time', installed);
      const { stageBytes: _stageBytes, ...identity } = question;
      const prepared = buildConnectedSolverRequest(stage, identity, installed, 'time');
      if (prepared.kind !== 'request') throw new Error('request expected');
      expect(prepared.request.movementReferenceOffsets).toEqual({ [sliceKey('b', 'build')]: 10 });
      const term = (value: number) => ({
        value,
        stageValue: value,
        bound: value,
        status: 'optimal',
      });
      const success = encodeConnectedSuccess(
        stage,
        identity,
        prepared.request,
        JSON.stringify({
          wireVersion: 5,
          scope: {
            kind: 'connected-stage',
            projectId: 'a2',
            inputHash: question.inputHash,
            questionHash: question.questionHash,
          },
          status: 'feasible',
          offsets: { [sliceKey('b', 'build')]: 10 },
          objectiveValues: { makespan: term(58), priority: term(0), movement: term(0) },
        }),
        hashConnectedBytes,
      );
      durableComparison = success.comparison;
      expect(success.publication).toBe('baseline');
      expect(success.comparison.baselineValues.movement).toBeCloseTo(1 / 120, 14);
      expect(success.comparison.optimizedValues.movement).toBe(0);
      const publisher = openConnection(path);
      try {
        publisher.db
          .insert(optimizedScheduleCache)
          .values({
            ...question,
            generation: 1,
            status: 'ok',
            resultJson: JSON.stringify(success),
            createdAt: 12,
          })
          .run();
      } finally {
        publisher.close();
      }
    },
  });
  if (durableComparison === undefined) throw new Error('durable comparison expected');
  if (captured.projection.placement.kind !== 'scheduled') throw new Error('placement expected');
  const decision = captured.projection.placement.stages.find(
    (selection) => selection.stage.projectId === 'a2',
  )?.decisions.time;
  const history = captureConnectedHistory(captured, 'a2');
  if (!history.schedule.present) throw new Error('schedule expected');
  const saved = history.schedule.body.connection.stages.find((stage) => stage.projectId === 'a2');
  expect(saved?.selected).toBe('time');
  const variant = saved?.variants?.time;
  if (variant?.state !== 'ready') throw new Error('ready evidence expected');
  expect(variant.proof).toBe('quantisation-floor');
  expect(variant.decision.chosen).toBe('baseline');
  expect(variant.decision.baselineValues.movement).toBeCloseTo(1 / 120, 14);
  expect(variant.decision.optimizedValues.movement).toBe(0);
  expect(variant.decision.values.movement).toBeCloseTo(1 / 120, 14);
  expect(variant.decision.baselineValues).toEqual(durableComparison.baselineValues);
  expect(variant.decision.optimizedValues).toEqual(durableComparison.optimizedValues);
  expect(variant.decision.values).toEqual(durableComparison.values);
  expect(decision?.baselineValues).toEqual(durableComparison.baselineValues);
  expect(decision?.optimizedValues).toEqual(durableComparison.optimizedValues);
  expect(decision?.values).toEqual(durableComparison.values);
  expect(
    history.schedule.body.connection.baseline.slices[sliceKey('b', 'build')].earliestStart,
  ).toBeCloseTo(0.2, 14);
  expect(
    history.schedule.body.connection.composite.slices[sliceKey('b', 'build')].earliestStart,
  ).toBeCloseTo(0.2, 14);
  expect(
    history.schedule.body.connection.composite.slices[sliceKey('a', 'design')].earliestStart,
  ).toBe(0);
  expect(history.schedule.body.slices[sliceKey('b', 'build')].earliestStart).toBeCloseTo(0.2, 14);
});
