import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildConnectedSolverRequest } from '@wbs/contracts/solver/build-connected-request';
import { encodeConnectedSuccess } from '@wbs/contracts/solver/connected-durable';
import type { LivePlanRead, Scheduler } from '@wbs/core';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { scheduleResolved, sliceKey } from '@wbs/domain';
import { createLivePlanStore } from '@wbs/store-sqlite/chain-snapshot';
import {
  captureConnectedQuestion,
  hashConnectedBytes,
} from '@wbs/store-sqlite/connected-question-identity';
import { openConnection, openDatabase, openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { optimizedScheduleCache } from '@wbs/store-sqlite/schema';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { openSpaceDatabase } from '@wbs/store-sqlite/testing/space-database';

interface CaptureFixtureOptions {
  readonly seed?: (client: ReturnType<typeof openDatabase>) => void;
  readonly prepare?: (
    path: string,
    read: () => Promise<Extract<LivePlanRead, { kind: 'connected' }>>,
  ) => Promise<void>;
  readonly consume?: (
    captured: Extract<LivePlanRead, { kind: 'connected' }>,
    path: string,
    read: () => Promise<Extract<LivePlanRead, { kind: 'connected' }>>,
  ) => Promise<void>;
  readonly scheduler?: Scheduler;
  readonly connected?: {
    readonly solverVersion: string;
    readonly budgetMs: number;
    readonly now: () => number;
  };
}

/** Real migrated persistence fixture; the returned observation outlives every SQLite connection and file. */
export async function captureSavedConnectedFixture(
  mode: 'isolated' | 'shared',
  options: CaptureFixtureOptions = {},
): Promise<Extract<LivePlanRead, { kind: 'connected' }>> {
  const folder = mkdtempSync(join(tmpdir(), 'saved-connected-'));
  try {
    const path = await openSpaceDatabase(folder);
    seedDependencyAuthority(path);
    const client = openDatabase(path);
    try {
      client.run("UPDATE organization_activation SET state='activated', activated_at=1");
      client.run(
        "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','ada','member',1)",
      );
      client.run('UPDATE organization SET shared_people=? WHERE id=?', [
        mode === 'shared' ? 1 : 0,
        'org-a',
      ]);
      client.run(
        "UPDATE project SET estimate_rounding='exact',start_date='2026-10-05' WHERE id='a1'",
      );
      client.run(
        "UPDATE project SET estimate_rounding='exact',start_date='2026-10-06' WHERE id='a2'",
      );
      client.run(
        "INSERT INTO work_item(id,project_id,position,name,hold) VALUES('a','a1',10,'Alpha work',null),('h','a1',20,'Held cause','on_hold'),('b','a2',10,'Beta work',null)",
      );
      client.run(
        "INSERT INTO step(id,project_id,name,code,position) VALUES('design','a1','Design','design',10),('test','a1','Test','test',20),('build','a2','Build','build',10)",
      );
      client.run(
        "INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES('a','design',0.5,0.5,0.5),('a','test',1,1,1),('b','build',0.75,0.75,0.75)",
      );
      client.run(
        "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,predecessor_step_id,successor_step_id,type) VALUES('ab','org-a','a1','a2','a','b','node','node','design','build','FS'),('ba','org-a','a2','a1','b','a','node','node','build','test','FS'),('hb','org-a','a1','a2','h','b','whole','node',null,'build','FS')",
      );
      options.seed?.(client);
    } finally {
      client.close();
    }
    const read = async () => {
      const observed = await createLivePlanStore({
        kind: 'owned',
        openConnection: () => openReadOnlyConnection(path),
        schedulerOf: () => options.scheduler ?? fastScheduler,
        ...(options.connected === undefined ? {} : { connected: options.connected }),
      }).read('a1', {
        kind: 'scoped',
        scope: { organizationId: 'org-a', userId: 'ada', role: 'member' },
      });
      if (observed.kind !== 'connected')
        throw new Error(`expected connected fixture, received ${observed.kind}`);
      return observed;
    };
    await options.prepare?.(path, read);
    const captured = await read();
    await options.consume?.(captured, path, read);
    return captured;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/** Real durable cache rows, captured in execution order; Fast keeps its ready candidate unselected. */
export function captureMixedFixture(
  mode: 'isolated' | 'shared',
  floor: boolean,
  consume?: CaptureFixtureOptions['consume'],
) {
  const installed = { solverVersion: '0.4.0', budgetMs: 1000, now: () => 12 };
  return captureSavedConnectedFixture(mode, {
    connected: installed,
    ...(consume === undefined ? {} : { consume }),
    seed: (client) => {
      client.run("DELETE FROM external_dependency WHERE id IN ('ba','hb')");
      client.run("UPDATE external_dependency SET type='SS' WHERE id='ab'");
      client.run(
        "UPDATE project SET optimization_enabled=1,schedule_objective='time' WHERE id IN ('a1','a2')",
      );
      client.run("UPDATE project SET schedule_engine='optimized' WHERE id='a1'");
      client.run("INSERT INTO person(id,name) VALUES('person','Person')");
      client.run(
        "INSERT INTO person_organization(resource_id,organization_id,name) VALUES('person','org-a','Person')",
      );
      client.run("INSERT INTO service_team(id,name) VALUES('team','Team')");
      client.run(
        "INSERT INTO service_team_organization(resource_id,organization_id,name) VALUES('team','org-a','Team')",
      );
      client.run(
        "INSERT INTO resource(id,name,kind,unit_label) VALUES('resource','Resource','exclusive','units')",
      );
      client.run(
        "INSERT INTO resource_organization(resource_id,organization_id,name) VALUES('resource','org-a','Resource')",
      );
      client.run(
        "INSERT INTO assignment(work_item_id,step_id,person_id) VALUES('a','design','person'),('a','test','person'),('b','build','person')",
      );
      client.run(
        "INSERT INTO work_item_team(work_item_id,team_id) VALUES('a','team'),('b','team')",
      );
      client.run(
        "INSERT INTO project_team_capacity(project_id,service_team_id,size) VALUES('a1','team',1),('a2','team',1)",
      );
      client.run(
        "INSERT INTO work_item_resource_demand(work_item_id,resource_id,units) VALUES('a','resource',1),('b','resource',1)",
      );
      client.run(
        "INSERT INTO project_resource_capacity(project_id,resource_id,units) VALUES('a1','resource',1),('a2','resource',1)",
      );
    },
    scheduler: {
      ...fastScheduler,
      readResolvedFast: (input) =>
        scheduleResolved(
          input,
          new Map([
            [sliceKey('a', 'design'), 3],
            [sliceKey('a', 'test'), 3.5],
            [sliceKey('b', 'build'), 8],
          ]),
        ),
    },
    prepare: async (path, read) => {
      for (const projectId of ['a1', 'a2']) {
        const captured = await read();
        if (captured.projection.placement.kind !== 'scheduled')
          throw new Error('scheduled fixture expected');
        const stage = captured.projection.placement.stages.find(
          (selection) => selection.stage.projectId === projectId,
        )?.stage;
        if (stage === undefined) throw new Error('fixture stage expected');
        const publisher = openConnection(path);
        try {
          for (const objective of ['pri', 'time'] as const) {
            const question = captureConnectedQuestion(stage, objective, installed);
            const { stageBytes, ...identity } = question;
            if (stageBytes.length === 0) throw new Error('fixture stage bytes expected');
            const prepared = buildConnectedSolverRequest(stage, identity, installed, objective);
            if (prepared.kind !== 'request')
              throw new Error(`fixture request expected: ${prepared.kind}`);
            const request = prepared.request;
            const offsets = Object.fromEntries(
              request.slices.map((slice) => [
                slice.key,
                projectId === 'a1'
                  ? (slice.key === sliceKey('a', 'design') ? (floor ? 4 : 0) : floor ? 4.5 : 0.5) *
                    48
                  : 8 * 48,
              ]),
            );
            const finish = Math.max(
              ...request.slices.map((slice) => offsets[slice.key] + slice.durationUnits),
            );
            const priority = request.slices.reduce(
              (sum, slice) =>
                sum + slice.priorityWeight * (offsets[slice.key] + slice.durationUnits),
              0,
            );
            const movement = request.slices.reduce(
              (sum, slice) =>
                sum + Math.abs(offsets[slice.key] - request.movementReferenceOffsets[slice.key]),
              0,
            );
            const term = (value: number) => ({
              value,
              stageValue: value,
              bound: 0,
              status: 'optimal',
            });
            const success = encodeConnectedSuccess(
              stage,
              identity,
              request,
              JSON.stringify({
                wireVersion: 5,
                scope: {
                  kind: 'connected-stage',
                  projectId,
                  inputHash: question.inputHash,
                  questionHash: question.questionHash,
                },
                status: 'feasible',
                offsets,
                objectiveValues: {
                  makespan: term(finish),
                  priority: term(priority),
                  movement: term(movement),
                },
              }),
              hashConnectedBytes,
            );
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
          }
        } finally {
          publisher.close();
        }
      }
    },
  });
}
