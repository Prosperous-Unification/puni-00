import { DEPENDENCY_SEMANTICS, DEPENDENCY_SEMANTICS_HEADER } from '@wbs/contracts';
import { WorkItemService } from '@wbs/core/module/work-item/work-item.resource';
import * as connectedPlan from '@wbs/core/service/connected-plan';
import { response } from '@wbs/store-sqlite/connected-optimization.fixture';
import { openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { expect, spyOn, test } from 'bun:test';

import type { ReservedSpawnRequest } from '../module/optimization/contract';
import { admitDependencyClient } from '../runtime/dependency-client';
import { BACKEND_DEPENDENCY_CAPABILITY } from '../runtime/dependency-support';
import { type Answer, OrganizationHarness } from '../testing/organization-harness';
import { trackReadObservations } from '../testing/read-observation.fixture';

const headers = {
  'X-WBS-Expected-Organization': 'org-a',
  [DEPENDENCY_SEMANTICS_HEADER]: DEPENDENCY_SEMANTICS,
};
const period = 'from=2026-10-05&to=2026-10-23';
const surfaces = ['person', 'people', 'roll-ups', 'in-progress'] as const;
type Surface = (typeof surfaces)[number];

function stream(bytes: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(bytes));
      controller.close();
    },
  });
}

async function fixture(held = true, optimized = true, withLocal = false) {
  const database: { path?: string } = {};
  const reads = trackReadObservations();
  const captures: string[] = [];
  const launches: ReservedSpawnRequest[] = [];
  const finishes = new Set<() => void>();
  let hold = held;
  let afterRead: (projectId: string) => void = () => undefined;
  let beforeRead: () => void = () => undefined;
  reads.beforeRead = () => {
    beforeRead();
  };
  const harness = OrganizationHarness.openComposedWith({
    dependencyCapability: BACKEND_DEPENDENCY_CAPABILITY,
    withOptimizer: true,
    solverVersion: '0.4.0',
    now: () => Date.UTC(2026, 9, 5),
    admitDependencyClient: (claim) => {
      if (database.path === undefined) throw new Error('fixture database not bound');
      const connection = openReadOnlyConnection(database.path);
      try {
        return admitDependencyClient(connection.db, BACKEND_DEPENDENCY_CAPABILITY, claim);
      } finally {
        connection.close();
      }
    },
    captureRead: {
      afterFirstRead: ({ projectId }) => {
        captures.push(projectId);
        afterRead(projectId);
        return Promise.resolve();
      },
    },
    openReadOnlyConnection: reads.openConnection,
    spawn: (asked) => {
      expect(reads.borrowed).toBe(0);
      launches.push(asked);
      if (asked.kind !== 'connected') throw new Error('expected connected request');
      const completion = Promise.withResolvers<number>();
      const finish = () => {
        completion.resolve(0);
      };
      finishes.add(finish);
      if (!hold) finish();
      return Promise.resolve({
        pid: 100 + launches.length,
        stdout: stream(response(asked.request, 'boundary-infeasible').stdout),
        stderr: stream(''),
        exited: completion.promise,
        verdict: () => undefined,
        kill: finish,
      });
    },
  });
  const path = harness.databasePath();
  database.path = path;
  const call = (method: string, route: string, body?: unknown) =>
    harness.callWith(harness.token('ada'), method, route, body, headers);
  const ok = async (asked: Promise<Answer>, status = 200) => {
    const answered = await asked;
    expect(answered.status).toBe(status);
    if (answered.status !== status) throw new Error(`fixture refused ${JSON.stringify(answered)}`);
    return answered;
  };
  try {
    // Synthetic durable authority enables the real production guard only in this fixture.
    seedDependencyAuthority(path);
    await harness.register('ada');
    harness.organization('org-a');
    harness.member('org-a', 'ada', 'member');
    harness.bind('ada', 'org-a');
    harness.activate();
    harness.sqlite.run("INSERT INTO person(id,name) VALUES('ana','Root Ana')");
    harness.sqlite.run(
      "INSERT INTO person_organization(resource_id,organization_id,name) VALUES('ana','org-a','Ana')",
    );
    const endpoints: { projectId: string; workItemId: string; stepId: string }[] = [];
    for (const name of ['Remote', 'Target', ...(withLocal ? ['Local'] : [])]) {
      await ok(call('POST', '/api/projects', { name }));
      const project = harness.sqlite
        .query<{ id: string }, [string]>('SELECT id FROM project WHERE name=?')
        .get(name);
      if (project === null) throw new Error('project missing');
      await ok(call('PATCH', `/api/projects/${project.id}`, { startDate: '2026-10-05' }));
      const step = harness.sqlite
        .query<{ id: string }, [string]>(
          'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1',
        )
        .get(project.id);
      if (step === null) throw new Error('step missing');
      await ok(
        call('POST', `/api/projects/${project.id}/commands`, {
          commands: [
            {
              kind: 'createWorkItem',
              ref: 'w',
              parentId: null,
              afterId: null,
              name: `${name} row`,
            },
            {
              kind: 'setEstimate',
              workItemRef: 'w',
              stepId: step.id,
              days: { optimistic: 1, realistic: 1, pessimistic: 1 },
            },
            { kind: 'setAssignee', workItemRef: 'w', stepId: step.id, personId: 'ana' },
          ],
        }),
      );
      const row = harness.sqlite
        .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE project_id=?')
        .get(project.id);
      if (row === null) throw new Error('work missing');
      await ok(
        call('POST', `/api/projects/${project.id}/commands`, {
          commands: [{ kind: 'setStatus', workItemId: row.id, status: 'in_progress' }],
        }),
      );
      endpoints.push({ projectId: project.id, workItemId: row.id, stepId: step.id });
    }
    const remote = endpoints.at(0);
    const target = endpoints.at(1);
    if (remote === undefined || target === undefined) throw new Error('component missing');
    await ok(call('POST', '/api/spaces', { name: 'Both' }), 201);
    const space = harness.sqlite
      .query<{ id: string }, []>("SELECT id FROM space WHERE name='Both'")
      .get();
    if (space === null) throw new Error('space missing');
    for (const endpoint of endpoints)
      await ok(
        call('POST', `/api/spaces/${space.id}/projects`, { projectId: endpoint.projectId }),
        201,
      );
    harness.sqlite.run(
      "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES('fs','org-a',?,?,?,?,'whole','whole','FS')",
      [remote.projectId, target.projectId, remote.workItemId, target.workItemId],
    );
    await harness.drainOptimization();
    harness.sqlite.run(
      "UPDATE project SET estimate_rounding='exact',schedule_engine=?,optimization_enabled=?",
      [optimized ? 'optimized' : 'fast', optimized ? 1 : 0],
    );
    expect(
      harness.sqlite.query("SELECT shared_people FROM organization WHERE id='org-a'").get(),
    ).toEqual({ shared_people: 0 });
    const ledger = () => {
      const tables = harness.sqlite
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_schema WHERE type='table' AND (name LIKE 'optimization_%' OR name LIKE 'optimized_%' OR name LIKE 'solver_%' OR name LIKE '%event%' OR name LIKE '%execution%') ORDER BY name",
        )
        .all();
      return tables.map(({ name }) => ({
        name,
        rows: harness.sqlite.query(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
      }));
    };
    for (const name of [
      'optimization_generation',
      'optimized_schedule_cache',
      'solver_queue',
      'solver_slot',
    ])
      expect(harness.sqlite.query(`SELECT * FROM ${name}`).all()).toEqual([]);
    expect(launches).toEqual([]);
    captures.length = 0;
    const request = (surface: Surface) =>
      call(
        'GET',
        surface === 'person'
          ? `/api/people/ana/load?${period}`
          : surface === 'people'
            ? `/api/people/load?${period}`
            : surface === 'roll-ups'
              ? `/api/spaces/${space.id}/roll-ups?projectIds=${endpoints.map(({ projectId }) => projectId).join(',')}`
              : `/api/spaces/${space.id}/in-progress`,
      );
    const settle = async () => {
      hold = false;
      for (const finish of finishes) finish();
      await harness.drainOptimization();
    };
    const close = async () => {
      await settle();
      await harness.closeComposed();
    };
    return {
      harness,
      remote,
      target,
      local: endpoints.at(2),
      spaceId: space.id,
      beforeCapture: (observer: typeof beforeRead) => {
        beforeRead = observer;
      },
      captures,
      launches,
      request,
      ledger,
      close,
      settle,
      call,
      observe: (observer: typeof afterRead) => {
        afterRead = observer;
      },
    };
  } catch (cause) {
    hold = false;
    for (const finish of finishes) finish();
    await harness.closeComposed();
    throw cause;
  }
}

function assertResponse(
  surface: Surface,
  answered: Answer,
  remote: { projectId: string; workItemId: string },
  target: { projectId: string; workItemId: string },
) {
  expect(answered.status).toBe(200);
  if (surface === 'in-progress') {
    const body = answered.body as { items: { name: string }[] };
    body.items.sort((left, right) => left.name.localeCompare(right.name));
  }
  if (surface === 'person') {
    const body = answered.body as { projects: { name: string }[] };
    body.projects.sort((left, right) => left.name.localeCompare(right.name));
  }
  if (surface === 'person')
    expect(answered.body).toMatchObject({
      person: { id: 'ana', name: 'Ana' },
      projects: [
        {
          projectId: remote.projectId,
          name: 'Remote',
          bookings: [
            { workItemId: remote.workItemId, startsOn: '2026-10-05', endsOn: '2026-10-05' },
          ],
        },
        {
          projectId: target.projectId,
          name: 'Target',
          bookings: [
            { workItemId: target.workItemId, startsOn: '2026-10-06', endsOn: '2026-10-06' },
          ],
        },
      ],
      unavailable: [],
    });
  else if (surface === 'people')
    expect(answered.body).toMatchObject({
      people: [
        {
          id: 'ana',
          weeks: [
            { weekOf: '2026-10-05', booked: 2, overlapping: 0 },
            { weekOf: '2026-10-12', booked: 0, overlapping: 0 },
            { weekOf: '2026-10-19', booked: 0, overlapping: 0 },
          ],
        },
      ],
      unavailable: [],
    });
  else if (surface === 'roll-ups')
    expect(answered.body).toMatchObject({
      rollUps: {
        [remote.projectId]: {
          kind: 'rolled_up',
          counts: { leaves: 1 },
          dates: { startsOn: '2026-10-05', endsOn: '2026-10-05' },
        },
        [target.projectId]: {
          kind: 'rolled_up',
          counts: { leaves: 1 },
          dates: { startsOn: '2026-10-06', endsOn: '2026-10-06' },
        },
      },
    });
  else
    expect(answered.body).toMatchObject({
      items: [
        {
          projectId: remote.projectId,
          workItemId: remote.workItemId,
          name: 'Remote row',
          dates: { startsOn: '2026-10-05', endsOn: '2026-10-05' },
        },
        {
          projectId: target.projectId,
          workItemId: target.workItemId,
          name: 'Target row',
          dates: { startsOn: '2026-10-06', endsOn: '2026-10-06' },
        },
      ],
      unavailable: [],
    });
}

for (const surface of surfaces) {
  test(`cold isolated ${surface} does not admit optimizer work`, async () => {
    const f = await fixture();
    try {
      const before = f.ledger();
      const answered = await f.request(surface);
      assertResponse(surface, answered, f.remote, f.target);
      expect(f.launches.length).toBe(0);
      expect(f.ledger()).toEqual(before);
      await f.settle();
      expect(f.launches.length).toBe(0);
      expect(f.ledger()).toEqual(before);
    } finally {
      await f.close();
    }
  });
  test(`cold isolated ${surface} with optimization disabled captures each connected member and derives once`, async () => {
    const f = await fixture(false, false);
    const derive = spyOn(connectedPlan, 'deriveConnectedPlan');
    try {
      const answered = await f.request(surface);
      assertResponse(surface, answered, f.remote, f.target);
      expect(f.launches).toEqual([]);
      expect(f.captures.filter((id) => id === f.remote.projectId)).toHaveLength(1);
      expect(f.captures.filter((id) => id === f.target.projectId)).toHaveLength(1);
      expect(derive).toHaveBeenCalledTimes(1);
    } finally {
      derive.mockRestore();
      await f.close();
    }
  });
}

test('cold public connected tree admits installed work only after source reads close', async () => {
  const f = await fixture();
  try {
    const answered = await f.call('GET', `/api/projects/${f.target.projectId}/work-items`);
    expect(answered.status).toBe(200);
    expect(answered.body).toMatchObject({
      workItems: [{ id: f.target.workItemId, dates: { startsOn: '2026-10-06' } }],
    });
    expect(f.launches.length).toBeGreaterThan(0);
  } finally {
    await f.close();
  }
});

test('isolated person aggregate keeps its first component coherent across a rival commit', async () => {
  const f = await fixture(false, false);
  let changed = false;
  let reached = 0;
  try {
    f.observe(() => {
      reached += 1;
      if (changed) return;
      changed = true;
      f.harness.sqlite.run(
        "UPDATE project SET name='Remote revised',start_date='2026-10-06' WHERE id=?",
        [f.remote.projectId],
      );
      f.harness.sqlite.run(
        "UPDATE project_abbreviation SET abbreviation='REVISED' WHERE project_id=?",
        [f.remote.projectId],
      );
      f.harness.sqlite.run(
        "UPDATE work_item SET name='Remote revised row',frozen_number='900' WHERE id=?",
        [f.remote.workItemId],
      );
      f.harness.sqlite.run(
        'UPDATE estimate SET optimistic=2,realistic=2,pessimistic=2 WHERE work_item_id=?',
        [f.remote.workItemId],
      );
    });
    const first = await f.request('person');
    expect(first.status).toBe(200);
    expect(changed).toBe(true);
    expect(reached).toBeGreaterThan(0);
    const next = await f.request('person');
    expect(next.status).toBe(200);
    const body = next.body as { projects: { name: string }[] };
    body.projects.sort((left, right) => left.name.localeCompare(right.name));
    expect(next.body).toMatchObject({
      projects: [
        {
          projectId: f.remote.projectId,
          name: 'Remote revised',
          bookings: [
            {
              workItemId: f.remote.workItemId,
              name: 'Remote revised row',
              startsOn: '2026-10-06',
              endsOn: '2026-10-07',
            },
          ],
        },
        {
          projectId: f.target.projectId,
          name: 'Target',
          bookings: [
            { workItemId: f.target.workItemId, startsOn: '2026-10-08', endsOn: '2026-10-08' },
          ],
        },
      ],
    });
    assertResponse('person', first, f.remote, f.target);
  } finally {
    await f.close();
  }
});

for (const surface of ['roll-ups', 'in-progress'] as const) {
  test(`isolated ${surface} handles local deletion between catalog and aggregate observation`, async () => {
    const f = await fixture(false, false, true);
    const local = f.local;
    if (local === undefined) throw new Error('local fixture member required');
    let deleted = 0;
    const publicTree = spyOn(WorkItemService.prototype, 'treeWithin');
    try {
      f.beforeCapture(() => {
        f.beforeCapture(() => undefined);
        expect(
          f.harness.sqlite.query('SELECT id FROM project WHERE id=?').get(local.projectId),
        ).toEqual({ id: local.projectId });
        // Remove C's existing referencing rows in dependency order, retaining every SQLite constraint.
        f.harness.sqlite.run('DELETE FROM project_access WHERE project_id=?', [local.projectId]);
        f.harness.sqlite.run('DELETE FROM assignment WHERE work_item_id=?', [local.workItemId]);
        f.harness.sqlite.run('DELETE FROM estimate WHERE work_item_id=?', [local.workItemId]);
        f.harness.sqlite.run('DELETE FROM work_item WHERE project_id=?', [local.projectId]);
        f.harness.sqlite.run('DELETE FROM step WHERE project_id=?', [local.projectId]);
        f.harness.sqlite.run('DELETE FROM project WHERE id=?', [local.projectId]);
        expect(
          f.harness.sqlite.query('SELECT id FROM project WHERE id=?').get(local.projectId),
        ).toBeNull();
        deleted += 1;
      });
      const answered = await f.request(surface);
      expect(deleted).toBe(1);
      expect(publicTree).not.toHaveBeenCalled();
      expect(f.captures.filter((id) => id === f.remote.projectId)).toHaveLength(1);
      expect(f.captures.filter((id) => id === f.target.projectId)).toHaveLength(1);
      expect(f.captures).not.toContain(local.projectId);
      if (surface === 'roll-ups')
        expect(answered).toEqual({ status: 404, body: { error: 'not_found' } });
      else assertResponse(surface, answered, f.remote, f.target);
      expect(f.launches).toEqual([]);
    } finally {
      publicTree.mockRestore();
      await f.close();
    }
  });
}

test('isolated held aggregate retains active target labels and placement without admission', async () => {
  const f = await fixture();
  try {
    f.harness.sqlite.run("UPDATE work_item SET hold='on_hold' WHERE id=?", [f.remote.workItemId]);
    const before = f.ledger();
    const answered = await f.call(
      'GET',
      `/api/spaces/${f.spaceId}/roll-ups?projectIds=${f.remote.projectId},${f.target.projectId}`,
    );
    expect(answered.status).toBe(200);
    expect(answered.body).toMatchObject({
      rollUps: {
        [f.remote.projectId]: { status: 'on_hold', dates: null, counts: { leaves: 1 } },
        [f.target.projectId]: {
          status: 'in_progress',
          dates: { startsOn: '2026-10-05', endsOn: '2026-10-05' },
          counts: { leaves: 1 },
        },
      },
    });
    const load = await f.request('person');
    expect(load.status).toBe(200);
    expect(load.body).toMatchObject({
      undated: [],
      projects: [
        {
          projectId: f.target.projectId,
          name: 'Target',
          bookings: [
            { workItemId: f.target.workItemId, startsOn: '2026-10-05', endsOn: '2026-10-05' },
          ],
        },
      ],
      unavailable: [],
    });
    expect(f.launches).toEqual([]);
    expect(f.ledger()).toEqual(before);
  } finally {
    await f.close();
  }
});
