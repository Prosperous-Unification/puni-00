import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseConnectedSolverResponse } from '@wbs/contracts/solver/parse-solver-response';
import { revalidateConnectedSolverResult } from '@wbs/contracts/solver/revalidate-solver-result';
import { clockOf } from '@wbs/core';
import { localCommandAccess } from '@wbs/core/testing/organization-access-fixture';
import {
  canonicalConnectedStageInput,
  guardConnectedPublication,
  scheduleResolved,
} from '@wbs/domain';
import { createLogger } from '@wbs/observability';
import {
  openSqliteSource,
  SqliteOrganizationAccess,
  type SqliteSource,
  userBoundOrganizationOf,
} from '@wbs/store-sqlite';
import { captureConnectedQuestion } from '@wbs/store-sqlite/connected-question-identity';
import { openDatabase, openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { openSpaceDatabase } from '@wbs/store-sqlite/testing/space-database';
import { afterEach, expect, test } from 'bun:test';

import { prepareConnectedQuestion } from './module/optimization/connected-question';
import type { ReservedSpawnRequest } from './module/optimization/contract';
import { BACKEND_DEPENDENCY_CAPABILITY } from './runtime/dependency-support';
import { buildServices, type OptimizerRuntime } from './services';
import { testApp } from './testing/app-fixture';
import { testLocalAuthService } from './testing/auth-fixture';

type ConnectedSolverRequest = Extract<ReservedSpawnRequest, { kind: 'connected' }>['request'];

const installed = { solverVersion: '0.4.0', budgetMs: 1000 };
const access = {
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId: 'ada', role: 'member' },
} as const;
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});

function compose(source: SqliteSource, optimizer?: OptimizerRuntime) {
  const errors: string[] = [];
  let bound: ReturnType<SqliteSource['bindLivePlans']> | undefined;
  const bind = source.bindLivePlans.bind(source);
  const services = buildServices({
    source: {
      ...source,
      bindLivePlans: (options) => {
        bound = bind(options);
        return bound;
      },
    },
    commandAccess: localCommandAccess,
    clock: clockOf({ now: () => 12, newId: () => crypto.randomUUID() }),
    now: () => 12,
    logger: createLogger({
      service: 'be-01',
      destination: {
        write: (line: string) => {
          errors.push(line);
        },
      },
    }),
    jwtKey: 'k'.repeat(32),
    gwUrl: 'http://gw.invalid',
    internalAuthSecret: 's'.repeat(32),
    pushFetch: () => Promise.resolve(Response.json({ delivered_to_sockets: 0 })),
    ...(optimizer === undefined ? {} : { optimizer }),
  });
  cleanups.push(async () => {
    await services.optimizer?.stop();
    await source.close();
  });
  if (bound === undefined) throw Error('source was not bound');
  const app = testApp({
    ...services,
    writes: services,
    auth: testLocalAuthService({ id: 'ada', username: 'ada', scopes: ['read', 'write'] }),
    organizations: new SqliteOrganizationAccess(
      source.db,
      userBoundOrganizationOf(() => Promise.resolve('org-a')),
      () => 12,
    ),
  });
  const tree = async (mounted = app, projectId = 'a1') => {
    const response = await mounted.handle(
      new Request(`http://localhost/api/projects/${projectId}/work-items`, {
        headers: { 'X-WBS-Expected-Organization': 'org-a' },
      }),
    );
    expect(response.status).toBe(200);
    const decoded: unknown = await response.json();
    return decoded as {
      readonly slices: readonly {
        readonly id: string;
        readonly earliestStart: number;
        readonly earliestFinish: number;
      }[];
    };
  };
  return { services, errors, source, bound, tree, app };
}
function stream(bytes: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(bytes));
      controller.close();
    },
  });
}
async function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'connected-composition-'));
  const path = await openSpaceDatabase(folder);
  seedDependencyAuthority(path);
  const sqlite = openDatabase(path);
  sqlite.run("UPDATE organization_activation SET state='activated',activated_at=1");
  sqlite.run(
    "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','ada','member',1)",
  );
  sqlite.run("UPDATE project SET estimate_rounding='exact',start_date='2026-10-05'");
  sqlite.run("UPDATE organization SET shared_people=? WHERE id='org-a'", [0]);
  sqlite.run("UPDATE project SET schedule_engine='optimized',optimization_enabled=1 WHERE id='a1'");
  const launched: ReservedSpawnRequest[] = [];
  const probe = {
    open: 0,
    opened: 0,
    writerReads: [] as number[],
    onClosed: (): void => undefined,
  };
  const source = openSqliteSource({
    dependencyCapability: BACKEND_DEPENDENCY_CAPABILITY,
    dbPath: path,
    openReadOnlyConnection: (filename) => {
      const connection = openReadOnlyConnection(filename);
      probe.open++;
      probe.opened++;
      return {
        ...connection,
        close: () => {
          connection.close();
          probe.open--;
          probe.onClosed();
        },
      };
    },
  });
  const enter = source.gate.enter.bind(source.gate);
  source.gate.enter = (work) => {
    probe.writerReads.push(probe.open);
    return enter(work);
  };
  let answer: (asked: Extract<ReservedSpawnRequest, { kind: 'connected' }>) => string = (asked) =>
    stdout(asked.request);
  const composed = compose(source, {
    ...installed,
    spawn: (asked) => {
      expect(probe.open).toBe(0);
      launched.push(asked);
      if (asked.kind !== 'connected') throw Error('expected connected launch');
      return Promise.resolve({
        pid: 100 + launched.length,
        stdout: stream(answer(asked)),
        stderr: stream(''),
        exited: Promise.resolve(0),
        verdict: () => undefined,
        kill: () => undefined,
      });
    },
  });
  // Cleanup runs in insertion order; persistence outlives the composed source.
  cleanups.push(() => {
    sqlite.close();
    rmSync(folder, { recursive: true, force: true });
    return Promise.resolve();
  });
  const capture = async () => {
    const captured = await composed.services.workItems.optimizationCapture('a1');
    if (captured.kind !== 'scheduled' || captured.input.kind !== 'connected')
      throw Error('expected installed connected capture');
    return captured.input.stage;
  };
  sqlite.run('DELETE FROM external_dependency');
  sqlite.run('DELETE FROM estimate');
  sqlite.run('DELETE FROM work_item');
  sqlite.run('DELETE FROM step');
  sqlite.run("UPDATE project SET schedule_objective='pri' WHERE id='a1'");
  for (const project of ['a1', 'a2']) {
    sqlite.run('INSERT INTO service_team(id,name) VALUES(?,?)', [project, project]);
    sqlite.run(
      "INSERT INTO service_team_organization(resource_id,organization_id,name) VALUES(?,'org-a',?)",
      [project, project],
    );
    sqlite.run('INSERT INTO project_team_capacity(project_id,service_team_id,size) VALUES(?,?,1)', [
      project,
      project,
    ]);
    sqlite.run('INSERT INTO step(id,project_id,name,position) VALUES(?,?,?,0)', [
      project + '-s',
      project,
      'Build',
    ]);
    for (const [position, suffix] of (project === 'a1'
      ? ['long', 'short']
      : ['foreign']
    ).entries()) {
      const id = project + '-' + suffix;
      const days = suffix === 'long' ? 2 : 1;
      sqlite.run('INSERT INTO work_item(id,project_id,position,name,priority) VALUES(?,?,?,?,1)', [
        id,
        project,
        position,
        id,
      ]);
      sqlite.run('INSERT INTO work_item_team(work_item_id,team_id) VALUES(?,?)', [id, project]);
      sqlite.run(
        'INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES(?,?,?,?,?)',
        [id, project + '-s', days, days, days],
      );
    }
  }
  sqlite.run(
    "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES('edge','org-a','a2','a1','a2-foreign','a1-long','whole','whole','FS')",
  );
  sqlite.run(
    "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES('short-edge','org-a','a2','a1','a2-foreign','a1-short','whole','whole','FS')",
  );
  const placement = async () => {
    const observed = await composed.bound.stores.livePlans?.read('a1', access);
    if (observed?.kind !== 'connected' || observed.projection.placement.kind !== 'scheduled')
      throw Error('connected placement missing');
    return observed.projection.placement;
  };
  return {
    ...composed,
    sqlite,
    source,
    launched,
    probe,
    capture,
    placement,
    path,
    respond: (next: typeof answer) => {
      answer = next;
    },
  };
}

function stdout(request: ConnectedSolverRequest, days?: Readonly<Record<string, number>>) {
  const offsets =
    days === undefined
      ? { 'a1-long\u0000a1-s': 96, 'a1-short\u0000a1-s': 48 }
      : Object.fromEntries(Object.entries(days).map(([key, start]) => [key, start * 48]));
  const finishes = request.slices.map((slice) => offsets[slice.key] + slice.durationUnits);
  const term = (value: number) => ({ value, stageValue: value, bound: 0, status: 'feasible' });
  return JSON.stringify({
    wireVersion: 5,
    scope: {
      kind: 'connected-stage',
      projectId: request.scope.projectId,
      inputHash: request.scope.inputHash,
      questionHash: request.scope.questionHash,
    },
    status: 'feasible',
    offsets,
    objectiveValues: {
      makespan: term(Math.max(...finishes)),
      priority: term(
        request.slices.reduce(
          (sum, slice, index) => sum + slice.priorityWeight * finishes[index],
          0,
        ),
      ),
      movement: term(
        request.slices.reduce(
          (sum, slice) =>
            sum + Math.abs(offsets[slice.key] - request.movementReferenceOffsets[slice.key]),
          0,
        ),
      ),
    },
  });
}

function ledger(sqlite: ReturnType<typeof openDatabase>) {
  return [
    'optimization_generation',
    'solver_queue',
    'solver_slot',
    'optimized_schedule_cache',
    'event_log',
  ].map((table) => sqlite.query(`SELECT * FROM ${table}`).all());
}
async function drain(f: Awaited<ReturnType<typeof fixture>>) {
  if (f.services.optimizer === undefined) throw Error('optimizer missing');
  await f.services.optimizer.drain();
}
function retry(f: Awaited<ReturnType<typeof fixture>>, inputHash: string) {
  return f.app.handle(
    new Request('http://localhost/api/projects/a1/optimization/retry', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-WBS-Expected-Organization': 'org-a' },
      body: JSON.stringify({ inputHash, objective: 'pri' }),
    }),
  );
}

// Proof: forcing real publication to baseline fails the literal selected target offsets (publication.log).
test('mounted child publishes improved durable ready candidate and replays exact target and foreign dates', async () => {
  const f = await fixture();
  const before = await f.placement();
  expect([...before.combined.slices].map(([key, slice]) => [key, slice.earliestStart])).toEqual([
    ['a1-long\u0000a1-s', 1],
    ['a1-short\u0000a1-s', 3],
    ['a2-foreign\u0000a2-s', 0],
  ]);
  const initial = await f.tree();
  expect(
    initial.slices.map((slice) => [slice.id, slice.earliestStart, slice.earliestFinish]),
  ).toEqual([
    ['a1-long\u0000a1-s', 1, 3],
    ['a1-short\u0000a1-s', 3, 4],
  ]);
  expect(initial).toMatchObject({
    optimization: { variants: { pri: { state: 'idle' }, time: { state: 'idle' } } },
  });
  await drain(f);
  expect(f.launched).toHaveLength(2);
  expect(
    f.sqlite
      .query('SELECT objective,status FROM optimized_schedule_cache ORDER BY objective')
      .all(),
  ).toEqual([
    { objective: 'pri', status: 'ok' },
    { objective: 'time', status: 'ok' },
  ]);
  const persisted = f.sqlite
    .query<{ result_json: string }, []>('SELECT result_json FROM optimized_schedule_cache')
    .all();
  for (const row of persisted) {
    const stored = JSON.parse(row.result_json) as {
      dtoVersion: number;
      publication: string;
      scope: { kind: string; projectId: string };
      response: { offsets: Record<string, number> };
    };
    expect(stored).toMatchObject({
      dtoVersion: 2,
      publication: 'optimized',
      scope: { kind: 'connected-stage', projectId: 'a1' },
      response: { offsets: { 'a1-long\u0000a1-s': 96, 'a1-short\u0000a1-s': 48 } },
    });
  }
  expect(f.sqlite.query('SELECT * FROM solver_queue').all()).toEqual([]);
  expect(f.sqlite.query('SELECT * FROM solver_slot').all()).toEqual([]);
  const selected = await f.placement();
  expect([...selected.combined.slices].map(([key, slice]) => [key, slice.earliestStart])).toEqual([
    ['a1-long\u0000a1-s', 2],
    ['a1-short\u0000a1-s', 1],
    ['a2-foreign\u0000a2-s', 0],
  ]);
  expect(selected.combined.slices.get('a2-foreign\u0000a2-s')?.earliestFinish).toBe(1);
  expect(
    selected.stages.find((selection) => selection.stage.projectId === 'a1')?.chosen?.chosen,
  ).toBe('optimized');
  const events = f.sqlite
    .query("SELECT message FROM event_log WHERE message LIKE '%schedule_optimized%' ORDER BY seq")
    .all();
  expect(events).toHaveLength(2);
  expect(
    events.map(
      (entry) => (JSON.parse((entry as { message: string }).message) as { type: string }).type,
    ),
  ).toEqual(['schedule_optimized', 'schedule_optimized']);
  const settled = ledger(f.sqlite);
  for (let repeat = 0; repeat < 2; repeat++) {
    const tree = await f.tree();
    expect(tree).toMatchObject({
      optimization: { variants: { pri: { state: 'ready' }, time: { state: 'ready' } } },
    });
    expect(
      tree.slices.map((slice) => [slice.id, slice.earliestStart, slice.earliestFinish]),
    ).toEqual([
      ['a1-long\u0000a1-s', 2, 4],
      ['a1-short\u0000a1-s', 1, 2],
    ]);
    expect(await f.placement()).toEqual(selected);
    expect(ledger(f.sqlite)).toEqual(settled);
  }
  expect(f.launched).toHaveLength(2);
  expect(f.errors).toEqual([]);
});

// Proof: accepting invalid objective metrics fails the failed-state assertion (validator.log); removing the mounted Retry binding keeps HTTP 409 but returns not-retryable/idle instead of stale-input-hash (retry-route.log).
test('mounted current-hash Retry alone recovers failed objective without retrying healthy sibling', async () => {
  const f = await fixture();
  const stage = await f.capture();
  const question = captureConnectedQuestion(stage, 'pri', installed);
  f.respond((asked) => {
    const candidate = JSON.parse(stdout(asked.request)) as {
      objectiveValues: { movement: { value: number; stageValue: number } };
    };
    if (asked.objective === 'pri') {
      candidate.objectiveValues.movement.value = 999;
      candidate.objectiveValues.movement.stageValue = 999;
    }
    return JSON.stringify(candidate);
  });
  await f.tree();
  await drain(f);
  expect(await f.tree()).toMatchObject({
    optimization: {
      variants: { pri: { state: 'failed', reason: 'invalid-output' }, time: { state: 'ready' } },
    },
  });
  const settled = ledger(f.sqlite);
  const healthy = f.sqlite
    .query("SELECT * FROM optimized_schedule_cache WHERE objective='time'")
    .all();
  await f.tree();
  await f.tree();
  expect(ledger(f.sqlite)).toEqual(settled);
  expect(f.launched).toHaveLength(2);
  const stale = await retry(f, 'stale');
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({ code: 'stale-input-hash' });
  expect(ledger(f.sqlite)).toEqual(settled);
  f.respond((asked) => stdout(asked.request));
  const accepted = await retry(f, question.inputHash);
  expect(accepted.status).toBe(202);
  await drain(f);
  expect(f.launched.map((asked) => asked.objective)).toEqual(['pri', 'time', 'pri']);
  expect(
    f.sqlite.query("SELECT * FROM optimized_schedule_cache WHERE objective='time'").all(),
  ).toEqual(healthy);
  expect(await f.tree()).toMatchObject({
    optimization: { variants: { pri: { state: 'ready' }, time: { state: 'ready' } } },
  });
  expect(f.errors).toEqual([]);
});

// Proof: replacing cached candidate evidence with a valid response loses candidate corruption (cached-revalidation.log); bypassing stored comparison equality loses comparison corruption (cached-comparison.log).
for (const fault of ['candidate', 'comparison'] as const) {
  test(`mounted persisted ${fault} tamper is corrupt and never admits on read`, async () => {
    const f = await fixture();
    const baseline = await f.placement();
    await f.tree();
    await drain(f);
    const row = f.sqlite
      .query<{ result_json: string }, []>(
        "SELECT result_json FROM optimized_schedule_cache WHERE objective='pri'",
      )
      .get();
    if (row === null) throw Error('durable Pri missing');
    const stored = JSON.parse(row.result_json) as {
      response: { offsets: Record<string, number> };
      comparison: { values: { movement: number } };
    };
    if (fault === 'candidate') stored.response.offsets['a1-long\u0000a1-s'] = 48;
    else stored.comparison.values.movement = 999;
    f.sqlite.run("UPDATE optimized_schedule_cache SET result_json=? WHERE objective='pri'", [
      JSON.stringify(stored),
    ]);
    const settled = ledger(f.sqlite);
    for (let repeat = 0; repeat < 2; repeat++) {
      expect(await f.tree()).toMatchObject({
        optimization: { variants: { pri: { state: 'corrupt' }, time: { state: 'ready' } } },
      });
      expect((await f.placement()).combined).toEqual(baseline.combined);
      expect(ledger(f.sqlite)).toEqual(settled);
    }
    expect(f.launched).toHaveLength(2);
    expect(f.errors).toEqual([]);
  });
}

async function fractionalFixture(shortUnits: 8 | 9) {
  const f = await fixture();
  f.sqlite.run('DELETE FROM external_dependency');
  f.sqlite.run('DELETE FROM estimate');
  f.sqlite.run('DELETE FROM work_item');
  f.sqlite.run('DELETE FROM step');
  f.sqlite.run('DELETE FROM project_rank');
  f.sqlite.run("UPDATE project SET schedule_engine='fast',optimization_enabled=0");
  f.sqlite.run(
    "UPDATE project SET schedule_engine='optimized',optimization_enabled=1 WHERE id='a1'",
  );
  for (const [rank, project] of ['a2', 'a3', 'a1'].entries()) {
    f.sqlite.run(
      "INSERT INTO project_rank(project_id,organization_id,position,created_at,created_by) VALUES(?,'org-a',?,1,'ada')",
      [project, rank],
    );
    if (project === 'a3') {
      f.sqlite.run('INSERT INTO service_team(id,name) VALUES(?,?)', [project, project]);
      f.sqlite.run(
        "INSERT INTO service_team_organization(resource_id,organization_id,name) VALUES(?,'org-a',?)",
        [project, project],
      );
      f.sqlite.run(
        'INSERT INTO project_team_capacity(project_id,service_team_id,size) VALUES(?,?,1)',
        [project, project],
      );
    }
    f.sqlite.run('INSERT INTO step(id,project_id,name,position) VALUES(?,?,?,0)', [
      project + '-s',
      project,
      'Build',
    ]);
  }
  for (const [project, suffix, position, days, priority] of [
    ['a2', 'anchor', 0, 0.1, 1],
    ['a1', 'dep', 0, 3 / 48, 1],
    ['a1', 'short', 1, 5 / 48, 2],
    ['a3', 'long', 0, 1, 1],
    ['a3', 'short', 1, shortUnits / 48, 1],
  ] as const) {
    const id = project + '-' + suffix;
    f.sqlite.run('INSERT INTO work_item(id,project_id,position,name,priority) VALUES(?,?,?,?,?)', [
      id,
      project,
      position,
      id,
      priority,
    ]);
    f.sqlite.run('INSERT INTO work_item_team(work_item_id,team_id) VALUES(?,?)', [id, project]);
    f.sqlite.run(
      'INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES(?,?,?,?,?)',
      [id, project + '-s', days, days, days],
    );
  }
  for (const [id, predecessorProject, successorProject, predecessor, successor] of [
    ['anchor-dep', 'a2', 'a1', 'a2-anchor', 'a1-dep'],
    ['dep-long', 'a1', 'a3', 'a1-dep', 'a3-long'],
  ])
    f.sqlite.run(
      "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES(?,'org-a',?,?,?,?,'whole','whole','FS')",
      [id, predecessorProject, successorProject, predecessor, successor],
    );
  return f;
}

async function fractionalQuestion(f: Awaited<ReturnType<typeof fixture>>, shortUnits: 8 | 9) {
  const stage = await f.capture();
  expect(stage.projectId).toBe('a1');
  expect(stage.mode).toBe('isolated');
  expect(stage.input.order.kind).toBe('connected');
  if (stage.input.order.kind !== 'connected') throw Error('captured ownership missing');
  expect([...stage.input.order.projectIdByWorkItem]).toEqual([
    ['a2-anchor', 'a2'],
    ['a3-long', 'a3'],
    ['a3-short', 'a3'],
    ['a1-dep', 'a1'],
    ['a1-short', 'a1'],
  ]);
  expect(
    stage.relationships.map(({ id, type, predecessor, successor }) => [
      id,
      type,
      predecessor.projectId,
      predecessor.workItemId,
      successor.projectId,
      successor.workItemId,
    ]),
  ).toEqual([
    ['anchor-dep', 'FS', 'a2', 'a2-anchor', 'a1', 'a1-dep'],
    ['dep-long', 'FS', 'a1', 'a1-dep', 'a3', 'a3-long'],
  ]);
  expect(stage.input.slices.find(({ workItemId }) => workItemId === 'a3-short')?.days).toBe(
    shortUnits / 48,
  );
  expect(stage.projects.map(({ projectId, rank }) => [projectId, rank])).toEqual([
    ['a2', 1],
    ['a3', 2],
    ['a1', 3],
  ]);
  expect(stage.starts.get('a3-long\u0000a3-s')).toBe(shortUnits / 48);
  expect(stage.starts.get('a3-short\u0000a3-s')).toBe(0);
  expect(stage.finishes.get('a3-short\u0000a3-s')).toBe(shortUnits / 48);
  expect(stage.finishes.get('a1-dep\u0000a1-s')).toBeLessThan(8 / 48);
  expect(stage.starts.get('a1-short\u0000a1-s')).toBe(stage.finishes.get('a1-dep\u0000a1-s'));
  const prepared = prepareConnectedQuestion(stage, installed, (bytes) =>
    new Bun.CryptoHasher('sha256').update(bytes).digest('hex'),
  );
  expect(prepared.questions.pri.stageBytes).toBe(canonicalConnectedStageInput(stage));
  const built = prepared.requests.pri;
  expect(built.kind).toBe('request');
  if (built.kind !== 'request') throw Error('genuine fractional question is not a request');
  const request = built.request;
  expect(request.scope).toMatchObject({
    projectId: stage.projectId,
    inputHash: prepared.questions.pri.inputHash,
    questionHash: prepared.questions.pri.questionHash,
    projects: stage.projects,
  });
  expect(request.scope.fixed.find(({ key }) => key === 'a3-long\u0000a3-s')?.start).toBe(
    shortUnits / 48,
  );
  expect(request.quantum).toBe(48);
  expect(request.slices.map(({ key, durationUnits }) => [key, durationUnits])).toEqual([
    ['a1-dep\u0000a1-s', 3],
    ['a1-short\u0000a1-s', 5],
  ]);
  expect(request.scope.boundaries).toMatchObject([
    { direction: 'incoming', minimumStartUnits: 5 },
    { direction: 'outgoing', maximumStartUnits: shortUnits - 3 },
  ]);
  const parsed = parseConnectedSolverResponse(
    stdout(request, { 'a1-dep\u0000a1-s': 5 / 48, 'a1-short\u0000a1-s': 0 }),
    request,
  );
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw Error('genuine candidate failed response parser');
  expect(revalidateConnectedSolverResult(stage, request, parsed.response)).toEqual({
    ok: true,
    published: true,
  });
  const time = prepared.requests.time;
  if (time.kind !== 'request') throw Error('genuine time question missing request');
  const parsedTime = parseConnectedSolverResponse(
    stdout(time.request, { 'a1-dep\u0000a1-s': 5 / 48, 'a1-short\u0000a1-s': 0 }),
    time.request,
  );
  expect(parsedTime.ok).toBe(true);
  if (!parsedTime.ok) throw Error('genuine time candidate failed response parser');
  expect(revalidateConnectedSolverResult(stage, time.request, parsedTime.response)).toEqual({
    ok: true,
    published: true,
  });
  const starts = new Map([
    ['a1-dep\u0000a1-s', 5 / 48],
    ['a1-short\u0000a1-s', 0],
  ]);
  const replayed = scheduleResolved(stage.input, new Map([...stage.starts, ...starts]));
  const reference = new Map(
    Object.entries(request.movementReferenceOffsets).map(([key, offset]) => [key, offset / 48]),
  );
  if (shortUnits === 8) {
    expect(replayed.slices.get('a3-long\u0000a3-s')?.earliestStart).toBe(5 / 48 + 3 / 48);
    expect(replayed.slices.get('a3-long\u0000a3-s')?.earliestStart).toBeGreaterThan(8 / 48);
    expect(replayed.slices.get('a3-long\u0000a3-s')?.earliestFinish).toBe(
      stage.finishes.get('a3-long\u0000a3-s'),
    );
  } else {
    expect(guardConnectedPublication(stage, starts, 'priority', reference).chosen).toBe(
      'optimized',
    );
    expect(replayed.slices.get('a3-long\u0000a3-s')?.earliestStart).toBe(9 / 48);
  }
  return { stage, prepared, request };
}

function wholeStore(sqlite: ReturnType<typeof openDatabase>) {
  const tables = sqlite
    .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all();
  return Object.fromEntries(
    tables.map(({ name }) => [
      name,
      sqlite
        .query(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
        .all()
        .map((row) => JSON.stringify(row))
        .sort(),
    ]),
  );
}

// Proof: omitting only the real foreign-start check made the 8/48 mounted child
// publish both objectives READY and move C one ulp; the 9/48 control remained READY.
for (const shortUnits of [8, 9] as const) {
  test(`mounted genuine fractional ${String(shortUnits)}/48 boundary ${shortUnits === 8 ? 'refuses drift' : 'admits neighbor'}`, async () => {
    const f = await fractionalFixture(shortUnits);
    const { prepared, request } = await fractionalQuestion(f, shortUnits);
    const before = wholeStore(f.sqlite);
    const placement = await f.placement();
    f.respond((asked) => {
      const built = prepared.requests[asked.objective];
      if (built.kind !== 'request') throw Error('prepared objective missing request');
      expect(asked.request).toEqual(built.request);
      return stdout(asked.request, { 'a1-dep\u0000a1-s': 5 / 48, 'a1-short\u0000a1-s': 0 });
    });
    await f.tree();
    await drain(f);
    const tree = await f.tree();
    expect(tree).toMatchObject({
      optimization: {
        variants:
          shortUnits === 8
            ? {
                pri: { state: 'failed', reason: 'invalid-output' },
                time: { state: 'failed', reason: 'invalid-output' },
              }
            : { pri: { state: 'ready' }, time: { state: 'ready' } },
      },
    });
    const settled = wholeStore(f.sqlite);
    const selected = await f.placement();
    const foreign = await f.tree(f.app, 'a3');
    expect(
      foreign.slices.map(({ id, earliestStart, earliestFinish }) => [
        id,
        earliestStart,
        earliestFinish,
      ]),
    ).toEqual([
      ['a3-long\u0000a3-s', shortUnits / 48, 1 + shortUnits / 48],
      ['a3-short\u0000a3-s', 0, shortUnits / 48],
    ]);
    if (shortUnits === 8) {
      expect(selected.combined).toEqual(placement.combined);
      expect(
        tree.slices.map(({ id, earliestStart, earliestFinish }) => [
          id,
          earliestStart,
          earliestFinish,
        ]),
      ).toEqual(
        [...placement.combined.slices]
          .filter(([key]) => key.startsWith('a1-'))
          .map(([key, slice]) => [key, slice.earliestStart, slice.earliestFinish]),
      );
      const encoded = (rows: readonly unknown[]) => rows.map((row) => JSON.stringify(row)).sort();
      const notifications: { subscription: string; message: string }[] = [];
      const elsewhere = () =>
        ['a2', 'a3'].map((projectId) => ({
          subscription: 'project:' + projectId,
          message: JSON.stringify({ type: 'elsewhere_changed', projectId, causeProjectId: 'a1' }),
        }));
      notifications.push(...elsewhere());
      for (const objective of ['pri', 'time'] as const) {
        notifications.push({
          subscription: 'project:a1',
          message: JSON.stringify({
            type: 'schedule_optimization_failed',
            projectId: 'a1',
            generation: 1,
            inputHash: request.scope.inputHash,
            objective,
            contractVersion: request.contractVersion,
            budgetMs: 1000,
            failureReason: 'invalid-output',
          }),
        });
        notifications.push(...elsewhere(), ...elsewhere());
      }
      const sequences = new Map<string, number>();
      const events = notifications.map((event, index) => {
        const seq = sequences.get(event.subscription) ?? 0;
        sequences.set(event.subscription, seq + 1);
        return {
          id: index + 1,
          subscription: event.subscription,
          seq,
          message: event.message,
          created_at: 12,
        };
      });
      // The complete store differs only by these exact terminal records and notifications;
      // authored state, migration ledger, queue/slots and every other table remain identical.
      expect(settled).toEqual({
        ...before,
        optimization_generation: encoded([
          {
            project_id: 'a1',
            contract_version: request.contractVersion,
            generation: 1,
            input_hash: request.scope.inputHash,
            cancel_epoch: 0,
            admission_state: 'open',
            updated_at: 12,
          },
        ]),
        optimized_schedule_cache: encoded(
          ['pri', 'time'].map((objective) => ({
            project_id: 'a1',
            input_hash: request.scope.inputHash,
            objective,
            contract_version: request.contractVersion,
            budget_ms: 1000,
            generation: 1,
            status: 'failed',
            result_json: null,
            failure_reason: 'invalid-output',
            created_at: 12,
          })),
        ),
        event_log: encoded(events),
        event_sequencer: encoded([
          { subscription: 'project:a1', next_seq: 2 },
          { subscription: 'project:a2', next_seq: 5 },
          { subscription: 'project:a3', next_seq: 5 },
        ]),
        sqlite_sequence: encoded([{ name: 'event_log', seq: 12 }]),
      });
    } else {
      expect(
        tree.slices.map(({ id, earliestStart, earliestFinish }) => [
          id,
          earliestStart,
          earliestFinish,
        ]),
      ).toEqual([
        ['a1-dep\u0000a1-s', 5 / 48, 5 / 48 + 3 / 48],
        ['a1-short\u0000a1-s', 0, 5 / 48],
      ]);
      expect(
        f.sqlite
          .query('SELECT objective,status FROM optimized_schedule_cache ORDER BY objective')
          .all(),
      ).toEqual([
        { objective: 'pri', status: 'ok' },
        { objective: 'time', status: 'ok' },
      ]);
      expect(f.sqlite.query('SELECT * FROM solver_slot').all()).toEqual([]);
      expect(f.sqlite.query('SELECT * FROM solver_queue').all()).toEqual([]);
    }
    expect(f.launched).toHaveLength(2);
    for (let repeat = 0; repeat < 2; repeat++) {
      expect(await f.tree()).toEqual(tree);
      expect(wholeStore(f.sqlite)).toEqual(settled);
    }
    expect(f.launched).toHaveLength(2);
    expect(f.errors).toEqual([]);
  });
}
