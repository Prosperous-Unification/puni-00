import { WorkItemService } from '@wbs/core/module/work-item/work-item.resource';
import * as connectedTree from '@wbs/core/service/connected-tree';
import { formatStepNodeId, sliceKey } from '@wbs/domain';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { type ComposedHarnessOptions, OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;
afterEach(async () => {
  await harness.closeComposed();
});

async function open(options: ComposedHarnessOptions = {}) {
  harness = OrganizationHarness.openComposedWith(options);
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'member');
  harness.bind('ada', 'org-a');
  harness.activate();
  const endpoints: { projectId: string; workItemId: string; stepId: string }[] = [];
  for (const [name, start] of [
    ['Remote', '2026-10-19'],
    ['Target', '2026-10-20'],
  ]) {
    const created = await harness.call('ada', 'POST', '/api/projects', { name });
    expect(created.status).toBe(200);
    const project = harness.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM project WHERE name=?')
      .get(name);
    if (project === null) throw new Error('missing fixture project');
    const added = await harness.call('ada', 'POST', `/api/projects/${project.id}/commands`, {
      commands: [{ kind: 'createWorkItem', name: `${name} row` }],
    });
    expect(added.status).toBe(200);
    const row = harness.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE project_id=?')
      .get(project.id);
    const step = harness.sqlite
      .query<{ id: string }, [string]>(
        'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1',
      )
      .get(project.id);
    if (row === null || step === null) throw new Error('missing fixture endpoint');
    harness.sqlite
      .query(
        "UPDATE project SET start_date=?,estimate_method='realistic',estimate_rounding='exact' WHERE id=?",
      )
      .run(start, project.id);
    harness.sqlite
      .query(
        'INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES (?,?,2.5,2.5,2.5)',
      )
      .run(row.id, step.id);
    endpoints.push({ projectId: project.id, workItemId: row.id, stepId: step.id });
  }
  harness.sqlite.query("UPDATE work_item SET readiness='ready'").run();
  const remote = endpoints.at(0);
  const target = endpoints.at(1);
  if (remote === undefined || target === undefined) throw new Error('missing fixture pair');
  harness.sqlite
    .query(
      "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('remote-fs','org-a',?,?,?,?, 'whole','whole','FS')",
    )
    .run(remote.projectId, target.projectId, remote.workItemId, target.workItemId);
  return { remote, target };
}

test('mounted full paged and detail reads preserve connected placement and readiness', async () => {
  const { remote, target } = await open();
  const full = await harness.call(
    'ada',
    'GET',
    `/api/projects/${target.projectId}/work-items?full=true`,
  );
  expect(full.status).toBe(200);
  expect(full.body).toMatchObject({
    workItems: [
      {
        id: target.workItemId,
        schedule: { earliestStart: 1.5, earliestFinish: 4 },
        nodeReadings: { [target.stepId]: 'unknown' },
      },
    ],
    connectedDependencies: [
      { id: 'remote-fs', predecessor: { endpoint: { workItemId: remote.workItemId } } },
    ],
  });
  const page = await harness.call(
    'ada',
    'GET',
    `/api/projects/${target.projectId}/work-item-rows?fields=schedule&limit=1`,
  );
  expect(page.status).toBe(200);
  expect(page.body).toMatchObject({
    rows: [{ id: target.workItemId, schedule: { earliestStart: 1.5 } }],
  });
  const detail = await harness.call(
    'ada',
    'GET',
    `/api/projects/${target.projectId}/work-items/${target.workItemId}`,
  );
  expect(detail.status).toBe(200);
  expect(detail.body).toMatchObject({
    workItem: { id: target.workItemId, schedule: { earliestStart: 1.5 } },
  });
  const outgoing = await harness.call(
    'ada',
    'GET',
    `/api/projects/${remote.projectId}/work-items?full=true`,
  );
  expect(outgoing.status).toBe(200);
  expect(outgoing.body).toMatchObject({
    connectedDependencies: [
      { id: 'remote-fs', successor: { endpoint: { workItemId: target.workItemId } } },
    ],
  });
});

test('mounted tree retains the remote direct blockage root in component readiness', async () => {
  const { remote, target } = await open();
  harness.sqlite.query("UPDATE step_blockage_activation SET state='ENABLED' WHERE id=1").run();
  harness.sqlite
    .query('INSERT INTO step_blockage(work_item_id,step_id,blocked_at) VALUES (?,?,123)')
    .run(remote.workItemId, remote.stepId);
  const tree = await harness.call(
    'ada',
    'GET',
    `/api/projects/${target.projectId}/work-items?full=true`,
  );
  expect(tree.status).toBe(200);
  expect(tree.body).toMatchObject({
    workItems: [
      {
        id: target.workItemId,
        nodeReadings: { [target.stepId]: 'blocked_by_proxy' },
        blockageCauses: { [target.stepId]: [{ kind: 'step', nodeId: formatStepNodeId(remote) }] },
      },
    ],
  });
});

test('mounted tree refuses a malformed captured connected navigation identity', async () => {
  const { target } = await open();
  // The implementation is invoked below with the original service as its receiver.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = WorkItemService.prototype.treeWithin;
  const changed = spyOn(WorkItemService.prototype, 'treeWithin').mockImplementation(async function (
    this: WorkItemService,
    ...args
  ) {
    const tree = await original.apply(this, args);
    if (tree === null || 'kind' in tree || tree.connectedDependencies === undefined)
      throw new Error('fixture connected tree missing');
    return {
      ...tree,
      connectedDependencies: tree.connectedDependencies.map((dependency) => ({
        ...dependency,
        predecessor: {
          ...dependency.predecessor,
          endpoint: { ...dependency.predecessor.endpoint, projectId: 42 as unknown as string },
        },
      })),
    };
  });
  try {
    const tree = await harness.call(
      'ada',
      'GET',
      `/api/projects/${target.projectId}/work-items?full=true`,
    );
    expect(tree.status).toBe(500);
  } finally {
    changed.mockRestore();
  }
});

test('mounted tree uses the component row status when a remote predecessor is held', async () => {
  const { remote, target } = await open();
  harness.sqlite.query("UPDATE work_item SET hold='on_hold' WHERE id=?").run(remote.workItemId);
  const tree = await harness.call(
    'ada',
    'GET',
    `/api/projects/${target.projectId}/work-items?full=true`,
  );
  expect(tree.status).toBe(200);
  expect(tree.body).toMatchObject({
    workItems: [
      {
        id: target.workItemId,
        status: 'blocked_by_proxy',
        nodeReadings: { [target.stepId]: 'blocked_by_proxy' },
      },
    ],
  });
});

function shareAna(remote: { workItemId: string; stepId: string }, target: typeof remote): void {
  harness.sqlite.run("UPDATE organization SET shared_people=1 WHERE id='org-a'");
  harness.sqlite.run("UPDATE external_dependency SET type='SS' WHERE id='remote-fs'");
  harness.sqlite.run("INSERT INTO person(id,name) VALUES ('ana','Root Ana')");
  harness.sqlite.run(
    "INSERT INTO person_organization(resource_id,organization_id,name) VALUES ('ana','org-a','Local Ana')",
  );
  for (const endpoint of [remote, target])
    harness.sqlite
      .query("INSERT INTO assignment(work_item_id,step_id,person_id) VALUES (?,?,'ana')")
      .run(endpoint.workItemId, endpoint.stepId);
}

test('shared connected person wait reaches the real Gantt consumer with a qualified foreign holder', async () => {
  const { remote, target } = await open();
  shareAna(remote, target);
  const answer = await harness.call(
    'ada',
    'GET',
    `/api/projects/${target.projectId}/work-items?full=true`,
  );
  expect(answer.status).toBe(200);
  const tree = answer.body as {
    slices: {
      id: string;
      workItemId: string;
      boundBy: string;
      resourcePredecessorId: string | null;
    }[];
    steps: unknown[];
    assignedPeople: { id: string; name: string }[];
    elsewhereHolders?: {
      projectId: string;
      projectName: string;
      workItemId: string;
      number: string;
      name: string;
    }[];
  };
  // Bundle the actual browser consumer using its configured aliases, without
  // importing frontend-only path aliases into the backend's TypeScript graph.
  const built = await Bun.build({
    entrypoints: ['apps/wbs/fe-01/src/components/wbs/gantt-geometry.ts'],
    target: 'bun',
    tsconfig: 'apps/wbs/fe-01/tsconfig.app.json',
  });
  if (!built.success) throw new AggregateError(built.logs, 'Gantt consumer build failed');
  const output = built.outputs.at(0);
  if (output === undefined) throw new Error('Gantt consumer bundle missing');
  const code = await output.text();
  const geometry = (await import(
    `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  )) as { layOutGantt: (plan: unknown) => { bars: { floorWords: string }[] } };
  const chart = geometry.layOutGantt({
    rows: [
      {
        id: target.workItemId,
        number: '010',
        name: 'Target row',
        depth: 0,
        leaf: true,
        schedule: { earliestStart: 1.5, earliestFinish: 4 },
        notBeforeOffset: null,
        status: 'unknown',
        factStartOffset: null,
        factEndStop: null,
        priority: null,
        maxParallel: 1,
        team: { state: 'none' },
        tags: { own: [], inherited: [] },
        trioByStep: new Map(),
        waitsFor: [],
        stoppedBy: [],
        held: false,
      },
    ],
    tree: [{ id: target.workItemId, parentId: null }],
    slices: tree.slices,
    steps: tree.steps,
    dependencies: [],
    heldLeafIds: new Set(),
    narrowedByFilter: false,
    personNames: new Map(tree.assignedPeople.map((person) => [person.id, person.name])),
    elsewhereHolders: new Map(
      (tree.elsewhereHolders ?? []).map((holder) => [
        `${holder.projectId}\u0000${holder.workItemId}`,
        holder,
      ]),
    ),
    teamNames: new Map(),
    resourceLabels: new Map(),
    priorityBands: [],
    depReach: 'whole-item',
  });
  expect(chart.bars.map((bar) => bar.floorWords)).toContain(
    'Waits for Local Ana to finish 010 Remote row in Remote',
  );
  expect(tree.slices.every((slice) => slice.workItemId === target.workItemId)).toBe(true);
  expect(answer.body).toMatchObject({
    waitingForPerson: 0,
    waitingElsewhere: 1,
    assignedPeople: [{ id: 'ana', name: 'Local Ana' }],
    elsewhereHolders: [
      {
        projectId: remote.projectId,
        projectName: 'Remote',
        workItemId: remote.workItemId,
        number: '010',
        name: 'Remote row',
      },
    ],
    slices: [
      {
        workItemId: target.workItemId,
        earliestStart: 1.5,
        earliestFinish: 4,
        boundBy: 'elsewhere',
        resourcePredecessorId: null,
        elsewhereHolder: { projectId: remote.projectId, workItemId: remote.workItemId },
      },
      { workItemId: target.workItemId },
    ],
  });
});

test('shared connected display preserves local person arrows and counts mixed local and foreign waits', async () => {
  const { remote, target } = await open();
  shareAna(remote, target);
  const qa = harness.sqlite
    .query<{ id: string }, [string]>(
      'SELECT id FROM step WHERE project_id=? ORDER BY position DESC LIMIT 1',
    )
    .get(target.projectId);
  if (qa === null) throw new Error('fixture QA step missing');
  harness.sqlite.run("INSERT INTO person(id,name) VALUES ('ben','Root Ben')");
  harness.sqlite.run(
    "INSERT INTO person_organization(resource_id,organization_id,name) VALUES ('ben','org-a','Local Ben')",
  );
  harness.sqlite
    .query(
      'INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES (?,?,2.5,2.5,2.5)',
    )
    .run(target.workItemId, qa.id);
  harness.sqlite
    .query("INSERT INTO assignment(work_item_id,step_id,person_id) VALUES (?,?,'ben')")
    .run(target.workItemId, qa.id);
  harness.sqlite
    .query(
      "INSERT INTO work_item(id,project_id,position,name,priority) VALUES ('second-target',?,20,'Second target',1)",
    )
    .run(target.projectId);
  harness.sqlite
    .query(
      'INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES (?,?,10,10,10)',
    )
    .run('second-target', target.stepId);
  harness.sqlite
    .query(
      "INSERT INTO assignment(work_item_id,step_id,person_id) VALUES ('second-target',?,'ben')",
    )
    .run(target.stepId);
  const answer = await harness.call(
    'ada',
    'GET',
    `/api/projects/${target.projectId}/work-items?full=true`,
  );
  expect(answer.status).toBe(200);
  expect(answer.body).toMatchObject({ waitingForPerson: 1, waitingElsewhere: 1 });
  const tree = answer.body as {
    slices: {
      workItemId: string;
      stepId: string | null;
      boundBy: string;
      resourcePredecessorId: string | null;
    }[];
  };
  expect(
    tree.slices.find((slice) => slice.workItemId === target.workItemId && slice.stepId === qa.id),
  ).toMatchObject({
    boundBy: 'person',
    resourcePredecessorId: sliceKey('second-target', target.stepId),
  });
  const page = await harness.call(
    'ada',
    'GET',
    `/api/projects/${target.projectId}/work-item-rows?fields=schedule&limit=1`,
  );
  expect(page.status).toBe(200);
  expect(page.body).toMatchObject({
    rows: [{ id: target.workItemId, schedule: { earliestStart: 1.5, earliestFinish: 12.5 } }],
  });
  const detail = await harness.call(
    'ada',
    'GET',
    `/api/projects/${target.projectId}/work-items/${target.workItemId}`,
  );
  expect(detail.status).toBe(200);
  expect(detail.body).toMatchObject({
    workItem: {
      schedule: { earliestStart: 1.5, earliestFinish: 12.5 },
      slices: [
        {
          boundBy: 'elsewhere',
          resourcePredecessorId: null,
          elsewhereHolder: { projectId: remote.projectId, workItemId: remote.workItemId },
        },
        { workItemId: target.workItemId },
      ],
    },
  });
});

test.each(['person mismatch', 'foreign capacity'] as const)(
  'mounted tree refuses corrupt detached blocker evidence: %s',
  async (fault) => {
    const { remote, target } = await open();
    shareAna(remote, target);
    const original = connectedTree.projectConnectedTree;
    const corrupted = spyOn(connectedTree, 'projectConnectedTree').mockImplementation(
      (captured, projectId) => {
        const detached = structuredClone(captured);
        const placement = detached.projection.placement;
        if (placement.kind !== 'scheduled') throw new Error('fixture schedule missing');
        const selected = placement.byProject.get(projectId);
        if (selected === undefined) throw new Error('fixture target missing');
        const entry = [...selected.slices].find(([, slice]) => slice.boundBy === 'person');
        if (entry === undefined) throw new Error('fixture person blocker missing');
        const [key, waiter] = entry;
        const predecessorId = waiter.resourcePredecessorId;
        if (predecessorId === null) throw new Error('fixture person predecessor missing');
        if (fault === 'person mismatch') {
          const predecessor = placement.combined.slices.get(predecessorId);
          if (predecessor === undefined) throw new Error('fixture direct predecessor missing');
          Object.defineProperty(predecessor, 'personId', { value: 'another-person' });
        } else {
          Object.defineProperty(waiter, 'capacityPredecessorIds', {
            value: [waiter.resourcePredecessorId],
          });
          Object.defineProperty(waiter, 'boundBy', { value: 'capacity' });
          Object.defineProperty(waiter, 'resourcePredecessorId', { value: key });
        }
        return original(detached, projectId);
      },
    );
    try {
      const answer = await harness.call(
        'ada',
        'GET',
        `/api/projects/${target.projectId}/work-items?full=true`,
      );
      expect(answer.status).toBe(500);
    } finally {
      corrupted.mockRestore();
    }
  },
);
// Proof: replacing connected tree publication with a throw made this mounted
// claim fail 0/1 before its target push; restored code passes 1/1 with the
// committed claim, statement, journal and announcement observed together.
test('nonassigning remote governed claim commits before durable announcement delivery', async () => {
  let waiting = false;
  let pushedTargetEnvelope: unknown;
  const arrived = Promise.withResolvers<boolean>();
  const delivery = Promise.withResolvers<Response>();
  const fixture = await open({
    pushFetch: (_url, init) => {
      if (waiting) {
        if (typeof init?.body !== 'string') throw new Error('missing push body');
        const event: unknown = JSON.parse(init.body);
        if (
          event !== null &&
          typeof event === 'object' &&
          'subscription' in event &&
          event.subscription === `project:${fixture.target.projectId}`
        ) {
          pushedTargetEnvelope = event;
          arrived.resolve(true);
          return delivery.promise;
        }
      }
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    },
  });
  const { remote, target } = fixture;
  harness.sqlite
    .query("INSERT INTO person(id,name,kind,account_id) VALUES ('worker','Worker','agent',?)")
    .run(harness.userId('ada'));
  harness.sqlite
    .query(
      "INSERT INTO person_organization(resource_id,organization_id,name) VALUES ('worker','org-a','Local worker')",
    )
    .run();
  harness.sqlite
    .query(
      "INSERT INTO step_progress(work_item_id,step_id,state,stated_at) SELECT ?,id,'done',1 FROM step WHERE project_id=?",
    )
    .run(remote.workItemId, remote.projectId);
  const before = harness.sqlite
    .query<{ n: number }, [string]>('SELECT count(*) AS n FROM command_journal WHERE project_id=?')
    .get(target.projectId);
  if (before === null) throw new Error('missing journal count');
  const prior = harness.sqlite
    .query<{ seq: number }, [string]>(
      'SELECT seq FROM event_log WHERE subscription=? ORDER BY seq DESC LIMIT 1',
    )
    .get(`project:${target.projectId}`);
  if (prior === null) throw new Error('fixture has no prior target event');
  waiting = true;
  const pending = harness.call('ada', 'POST', `/api/projects/${target.projectId}/commands`, {
    commands: [
      {
        kind: 'claimWorkItem',
        workItemId: target.workItemId,
        steps: [target.stepId],
        personId: 'worker',
        runId: 'connected-run',
        assign: false,
      },
    ],
  });
  try {
    await Promise.race([
      arrived.promise,
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error('claim did not reach postcommit push'));
        }, 1500);
      }),
    ]);
    const durable = harness.sqlite
      .query<{ seq: number; message: string }, [string]>(
        'SELECT seq,message FROM event_log WHERE subscription=? ORDER BY seq DESC LIMIT 1',
      )
      .get(`project:${target.projectId}`);
    if (durable === null) throw new Error('missing target event while delivery held');
    const durableMessage: unknown = JSON.parse(durable.message);
    expect(durable.seq).toBeGreaterThan(prior.seq);
    expect(pushedTargetEnvelope).toMatchObject({
      subscription: `project:${target.projectId}`,
      seq: durable.seq,
      message: durableMessage,
    });
    expect(durableMessage).toMatchObject({
      type: 'tree_replaced',
      workItems: [{ id: target.workItemId }],
    });
    expect(
      harness.sqlite
        .query('SELECT person_id,step_id,run_id FROM claim WHERE work_item_id=?')
        .all(target.workItemId),
    ).toEqual([{ person_id: 'worker', step_id: target.stepId, run_id: 'connected-run' }]);
    expect(
      harness.sqlite
        .query('SELECT state FROM step_progress WHERE work_item_id=? AND step_id=?')
        .get(target.workItemId, target.stepId),
    ).toEqual({ state: 'in_progress' });
    expect(harness.sqlite.query('SELECT * FROM claim_occupancy').all()).toEqual([]);
    expect(
      harness.sqlite.query('SELECT * FROM assignment WHERE work_item_id=?').all(target.workItemId),
    ).toEqual([]);
    expect(
      harness.sqlite
        .query('SELECT count(*) AS n FROM command_journal WHERE project_id=?')
        .get(target.projectId),
    ).toEqual({ n: before.n + 1 });
    const entered = Promise.withResolvers<boolean>();
    const turn = harness.holdWriteTurn(Promise.resolve(), () => {
      entered.resolve(true);
    });
    await Promise.race([
      entered.promise,
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error('announcement retained writer turn'));
        }, 1000);
      }),
    ]);
    await turn;
  } finally {
    delivery.resolve(Response.json({ delivered_to_sockets: 0 }));
  }
  const answer = await pending;
  expect(answer.status).toBe(200);
  expect(
    harness.sqlite
      .query<{ message: string }, [string]>(
        'SELECT message FROM event_log WHERE subscription=? ORDER BY seq DESC LIMIT 1',
      )
      .get(`project:${target.projectId}`)?.message,
  ).toContain('tree_replaced');
});

test('mounted unavailable calendar tree retains incident links readiness and null forecasts', async () => {
  const { remote, target } = await open();
  harness.sqlite.query('UPDATE project SET start_date=NULL WHERE id=?').run(remote.projectId);
  harness.sqlite.query("UPDATE step_blockage_activation SET state='ENABLED' WHERE id=1").run();
  harness.sqlite
    .query('INSERT INTO step_blockage(work_item_id,step_id,blocked_at) VALUES (?,?,123)')
    .run(remote.workItemId, remote.stepId);
  const label = harness.sqlite
    .query<{ abbreviation: string; name: string }, [string]>(
      'SELECT a.abbreviation,p.name FROM project p JOIN project_abbreviation a ON a.project_id=p.id WHERE p.id=?',
    )
    .get(remote.projectId);
  if (label === null) throw new Error('missing remote label');
  for (const endpoint of [target, remote]) {
    const tree = await harness.call(
      'ada',
      'GET',
      `/api/projects/${endpoint.projectId}/work-items?full=true`,
    );
    expect(tree.status).toBe(200);
    expect(tree.body).toMatchObject({
      scheduleError: {
        kind: 'dependency_calendar_missing',
        projects: [{ projectId: remote.projectId, ...label }],
      },
      slices: [],
      waitingForPerson: 0,
      waitingForCapacity: 0,
      workItems: [{ id: endpoint.workItemId, schedule: null, dates: null }],
      connectedDependencies: [{ id: 'remote-fs' }],
    });
    if (endpoint === target)
      expect(tree.body).toMatchObject({
        workItems: [
          {
            nodeReadings: { [target.stepId]: 'blocked_by_proxy' },
            blockageCauses: {
              [target.stepId]: [{ kind: 'step', nodeId: formatStepNodeId(remote) }],
            },
          },
        ],
      });
  }
  for (const path of [
    `work-item-rows?fields=schedule&limit=1`,
    `work-items/${target.workItemId}`,
  ]) {
    const answer = await harness.call('ada', 'GET', `/api/projects/${target.projectId}/${path}`);
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject(
      path.startsWith('work-item-rows')
        ? { rows: [{ schedule: null }] }
        : { workItem: { schedule: null, dates: null } },
    );
  }
});

test.each([false, true])(
  'mounted connected optimized refusal is an inspectable tree without Fast dates (adapter %s)',
  async (withOptimizer) => {
    const { target } = await open({ withOptimizer });
    harness.sqlite
      .query("UPDATE project SET schedule_engine='optimized',optimization_enabled=1 WHERE id=?")
      .run(target.projectId);
    const tree = await harness.call(
      'ada',
      'GET',
      `/api/projects/${target.projectId}/work-items?full=true`,
    );
    expect(tree.status).toBe(200);
    expect(tree.body).toMatchObject({
      scheduleError: {
        kind: 'engine_unavailable',
        engine: 'optimized',
        projects: [target.projectId],
        reason: withOptimizer ? 'connected_optimization_not_supported' : 'adapter_missing',
      },
      slices: [],
      workItems: [{ id: target.workItemId, schedule: null, dates: null }],
      connectedDependencies: [{ id: 'remote-fs' }],
    });
    expect(tree.body).not.toHaveProperty('optimization');
  },
);

test('mounted calendar unavailable edit and eligible claim commit and publish current rows', async () => {
  const { remote, target } = await open();
  harness.sqlite.query('UPDATE project SET start_date=NULL WHERE id=?').run(remote.projectId);
  const edited = await harness.call('ada', 'POST', `/api/projects/${target.projectId}/commands`, {
    commands: [{ kind: 'createWorkItem', name: 'Inspectable edit' }],
  });
  expect(edited.status).toBe(200);
  const latestEvent = () => {
    const event = harness.sqlite
      .query<{ message: string }, [string]>(
        'SELECT message FROM event_log WHERE subscription=? ORDER BY seq DESC LIMIT 1',
      )
      .get(`project:${target.projectId}`);
    if (event === null) throw new Error('missing published tree');
    const message: unknown = JSON.parse(event.message);
    return message;
  };
  expect(latestEvent()).toMatchObject({ type: 'tree_replaced' });
  expect(latestEvent()).toHaveProperty(
    'workItems',
    expect.arrayContaining([
      expect.objectContaining({ id: target.workItemId, schedule: null, dates: null }),
      expect.objectContaining({ name: 'Inspectable edit', schedule: null, dates: null }),
    ]),
  );
  harness.sqlite
    .query("INSERT INTO person(id,name,kind,account_id) VALUES ('worker','Worker','agent',?)")
    .run(harness.userId('ada'));
  harness.sqlite
    .query(
      "INSERT INTO person_organization(resource_id,organization_id,name) VALUES ('worker','org-a','Local worker')",
    )
    .run();
  harness.sqlite
    .query(
      "INSERT INTO step_progress(work_item_id,step_id,state,stated_at) SELECT ?,id,'done',1 FROM step WHERE project_id=?",
    )
    .run(remote.workItemId, remote.projectId);
  const claimed = await harness.call('ada', 'POST', `/api/projects/${target.projectId}/commands`, {
    commands: [
      {
        kind: 'claimWorkItem',
        workItemId: target.workItemId,
        steps: [target.stepId],
        personId: 'worker',
        runId: 'unavailable-run',
        assign: false,
      },
    ],
  });
  expect(claimed.status).toBe(200);
  expect(
    harness.sqlite.query('SELECT run_id FROM claim WHERE work_item_id=?').get(target.workItemId),
  ).toEqual({ run_id: 'unavailable-run' });
  expect(latestEvent()).toMatchObject({ type: 'tree_replaced' });
  expect(latestEvent()).toHaveProperty(
    'workItems',
    expect.arrayContaining([
      expect.objectContaining({
        id: target.workItemId,
        schedule: null,
        dates: null,
        progress: { [target.stepId]: 'in_progress' },
      }),
      expect.objectContaining({ name: 'Inspectable edit', schedule: null, dates: null }),
    ]),
  );
});

test('mounted shared connected calendar range leaves no partial forecast display', async () => {
  const { remote, target } = await open();
  shareAna(remote, target);
  harness.sqlite
    .query('UPDATE estimate SET optimistic=100000000,realistic=100000000,pessimistic=100000000')
    .run();
  const tree = await harness.call(
    'ada',
    'GET',
    `/api/projects/${target.projectId}/work-items?full=true`,
  );
  expect(tree.status).toBe(200);
  expect(tree.body).toMatchObject({
    scheduleError: 'calendar_range',
    slices: [],
    waitingForPerson: 0,
    waitingForCapacity: 0,
    workItems: [{ id: target.workItemId, schedule: null, dates: null }],
  });
  expect(tree.body).not.toHaveProperty('optimization');
  expect(tree.body).not.toHaveProperty('elsewhereHolders');
  expect(tree.body).not.toHaveProperty('resourceLabels');
});

test.each(
  (['isolated', 'shared'] as const).flatMap((mode) =>
    (
      [
        'calendar',
        'calendar_range',
        'adapter_missing',
        'connected_optimization_not_supported',
      ] as const
    ).map((reason) => [mode, reason] as const),
  ),
)(
  'mounted %s-capacity load and space preserve connected unavailability (%s)',
  async (mode, reason) => {
    const { remote, target } = await open({
      withOptimizer: reason === 'connected_optimization_not_supported',
    });
    shareAna(remote, target);
    harness.sqlite
      .query("UPDATE organization SET shared_people=? WHERE id='org-a'")
      .run(mode === 'shared' ? 1 : 0);
    if (reason === 'calendar')
      harness.sqlite.query('UPDATE project SET start_date=NULL WHERE id=?').run(remote.projectId);
    else if (reason === 'calendar_range')
      harness.sqlite
        .query('UPDATE estimate SET optimistic=100000000,realistic=100000000,pessimistic=100000000')
        .run();
    else
      harness.sqlite
        .query("UPDATE project SET schedule_engine='optimized',optimization_enabled=1 WHERE id=?")
        .run(target.projectId);
    const missing =
      reason === 'calendar'
        ? {
            kind: 'dependency_calendar_missing',
            projects: [
              {
                projectId: remote.projectId,
                abbreviation: 'REM',
                name: 'Remote',
              },
            ],
          }
        : reason === 'calendar_range'
          ? 'calendar_range'
          : {
              kind: 'engine_unavailable',
              engine: 'optimized',
              projects: [target.projectId],
              reason,
            };
    const load = await harness.call(
      'ada',
      'GET',
      '/api/people/ana/load?from=2026-10-19&to=2026-10-30',
    );
    expect(load.status).toBe(200);
    expect(load.body).toMatchObject({
      projects: [],
      overlaps: [],
      undated: [],
      unavailable: expect.arrayContaining([
        {
          projectId: target.projectId,
          name: 'Target',
          reason:
            reason === 'calendar'
              ? 'dependency_calendar_missing'
              : reason === 'calendar_range'
                ? 'calendar_range'
                : 'engine_unavailable',
        },
      ]) as unknown,
    });
    const organization = await harness.call(
      'ada',
      'GET',
      '/api/people/load?from=2026-10-19&to=2026-10-30',
    );
    expect(organization.status).toBe(200);
    expect(organization.body).toMatchObject({
      people: [
        {
          id: 'ana',
          weeks: [
            { booked: 0, overlapping: 0 },
            { booked: 0, overlapping: 0 },
          ],
        },
      ],
      unavailable: expect.arrayContaining([
        {
          projectId: target.projectId,
          name: 'Target',
          reason:
            reason === 'calendar'
              ? 'dependency_calendar_missing'
              : reason === 'calendar_range'
                ? 'calendar_range'
                : 'engine_unavailable',
        },
      ]) as unknown,
    });
    const space = await harness.call(
      'ada',
      'GET',
      `/api/spaces/all/roll-ups?projectIds=${target.projectId}`,
    );
    expect(space.status).toBe(200);
    expect(space.body).toMatchObject({
      rollUps: {
        [target.projectId]: {
          kind: 'rolled_up',
          status: 'ready',
          dates: null,
          displayed: null,
          finalTotal: reason === 'calendar_range' ? 100000000 : 2.5,
          counts: { leaves: 1, estimated: 1, byStatus: { ready: 1 } },
          scheduleError: missing,
          waitingForPerson: 0,
          waitingForCapacity: 0,
        },
      },
    });
    if (reason === 'calendar') {
      for (const start of ['2026-10-19', null]) {
        harness.sqlite
          .query('UPDATE project SET start_date=?,revision=revision+1 WHERE id=?')
          .run(start, remote.projectId);
        const refreshedLoad = await harness.call(
          'ada',
          'GET',
          '/api/people/ana/load?from=2026-10-19&to=2026-10-30',
        );
        const refreshedSpace = await harness.call(
          'ada',
          'GET',
          `/api/spaces/all/roll-ups?projectIds=${target.projectId}`,
        );
        expect(refreshedLoad.status).toBe(200);
        expect(refreshedSpace.status).toBe(200);
        if (start !== null) {
          expect(refreshedLoad.body).toMatchObject({
            projects: expect.arrayContaining([
              {
                projectId: target.projectId,
                name: 'Target',
                rank: 2,
                engine: 'fast',
                bookings: [
                  {
                    workItemId: target.workItemId,
                    number: '010',
                    name: 'Target row',
                    stepId: target.stepId,
                    width: 1,
                    startsOn: mode === 'shared' ? '2026-10-21' : '2026-10-20',
                    endsOn: mode === 'shared' ? '2026-10-23' : '2026-10-22',
                  },
                ],
              },
            ]) as unknown,
            unavailable: [],
          });
          expect(refreshedSpace.body).toMatchObject({
            rollUps: {
              [target.projectId]: {
                scheduleError: null,
                displayed: 'fast',
                dates: {
                  startsOn: mode === 'shared' ? '2026-10-21' : '2026-10-20',
                  endsOn: mode === 'shared' ? '2026-10-23' : '2026-10-22',
                },
              },
            },
          });
        } else {
          expect(refreshedLoad.body).toMatchObject({
            projects: [],
            unavailable: expect.arrayContaining([
              {
                projectId: target.projectId,
                name: 'Target',
                reason: 'dependency_calendar_missing',
              },
            ]) as unknown,
          });
          expect(refreshedSpace.body).toMatchObject({
            rollUps: {
              [target.projectId]: {
                scheduleError: missing,
                displayed: null,
                dates: null,
              },
            },
          });
        }
      }
    }
  },
);

test('shared aggregate load and selected Space refresh foreign-only facts with target caches warm', async () => {
  const { remote, target } = await open();
  shareAna(remote, target);
  harness.sqlite.run("DELETE FROM external_dependency WHERE id='remote-fs'");
  for (const [endpoint, position] of [
    [target, 10],
    [remote, 20],
  ] as const)
    harness.sqlite
      .query(
        "INSERT INTO project_rank(project_id,organization_id,position,created_at,created_by) VALUES (?,'org-a',?,1,(SELECT id FROM users WHERE username='ada'))",
      )
      .run(endpoint.projectId, position);
  const createdSpace = await harness.call('ada', 'POST', '/api/spaces', { name: 'Successor only' });
  expect(createdSpace.status).toBe(201);
  const space = (createdSpace.body as { space: { id: string } }).space.id;
  expect(
    (
      await harness.call('ada', 'POST', `/api/spaces/${space}/projects`, {
        projectId: target.projectId,
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await harness.call('ada', 'POST', `/api/projects/${target.projectId}/commands`, {
        commands: [{ kind: 'setStatus', workItemId: target.workItemId, status: 'in_progress' }],
      })
    ).status,
  ).toBe(200);
  const loadPath = '/api/people/ana/load?from=2026-10-19&to=2026-11-06';
  const rollPath = `/api/spaces/${space}/roll-ups?projectIds=${target.projectId}`;
  const identity = () =>
    harness.sqlite
      .query<{ revision: number; seq: number }, [string]>(
        "SELECT revision, COALESCE((SELECT max(seq) FROM event_log WHERE subscription='project:' || project.id),-1) AS seq FROM project WHERE id=?",
      )
      .get(target.projectId);
  const fixed = identity();
  expect((await harness.call('ada', 'GET', loadPath)).status).toBe(200);
  expect((await harness.call('ada', 'GET', rollPath)).status).toBe(200);
  harness.sqlite
    .query(
      "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('remote-fs','org-a',?,?,?,?,'whole','whole','FS')",
    )
    .run(remote.projectId, target.projectId, remote.workItemId, target.workItemId);
  for (const [anchor, startsOn, endsOn] of [
    ['2026-10-19', '2026-10-21', '2026-10-23'],
    ['2026-10-26', '2026-10-28', '2026-10-30'],
    [null, null, null],
    ['2026-10-19', '2026-10-21', '2026-10-23'],
  ] as const) {
    harness.sqlite
      .query('UPDATE project SET start_date=? WHERE id=?')
      .run(anchor, remote.projectId);
    const load = await harness.call('ada', 'GET', loadPath);
    const rolled = await harness.call('ada', 'GET', rollPath);
    const progress = await harness.call('ada', 'GET', `/api/spaces/${space}/in-progress`);
    expect(progress.status).toBe(200);
    expect(progress.body).toMatchObject({
      items: [
        {
          projectId: target.projectId,
          workItemId: target.workItemId,
          dates: startsOn === null ? null : { startsOn, endsOn },
        },
      ],
    });
    expect(load.status).toBe(200);
    expect(rolled.status).toBe(200);
    expect(identity()).toEqual(fixed);
    if (startsOn === null) {
      expect(load.body).toMatchObject({
        projects: [],
        unavailable: expect.arrayContaining([
          { projectId: target.projectId, name: 'Target', reason: 'dependency_calendar_missing' },
        ]) as unknown,
      });
      expect(rolled.body).toMatchObject({
        rollUps: { [target.projectId]: { dates: null, displayed: null } },
      });
    } else {
      expect(load.body).toMatchObject({
        projects: expect.arrayContaining([
          {
            projectId: target.projectId,
            name: 'Target',
            engine: 'fast',
            rank: 1,
            bookings: [
              {
                workItemId: target.workItemId,
                number: '010',
                name: 'Target row',
                width: 1,
                stepId: target.stepId,
                startsOn,
                endsOn,
              },
            ],
          },
        ]) as unknown,
        unavailable: [],
      });
      expect(rolled.body).toMatchObject({
        rollUps: { [target.projectId]: { dates: { startsOn, endsOn }, displayed: 'fast' } },
      });
      const organization = await harness.call(
        'ada',
        'GET',
        '/api/people/load?from=2026-10-19&to=2026-11-06',
      );
      expect(organization.status).toBe(200);
      expect(organization.body).toMatchObject({
        people: [
          {
            id: 'ana',
            weeks:
              anchor === '2026-10-19'
                ? [{ booked: 5 }, { booked: 0 }, { booked: 0 }]
                : [{ booked: 0 }, { booked: 5 }, { booked: 0 }],
          },
        ],
      });
    }
  }
  harness.sqlite
    .query("UPDATE project SET schedule_engine='optimized',optimization_enabled=1 WHERE id=?")
    .run(remote.projectId);
  expect((await harness.call('ada', 'GET', loadPath)).body).toMatchObject({
    projects: [],
    unavailable: expect.arrayContaining([
      { projectId: target.projectId, name: 'Target', reason: 'engine_unavailable' },
    ]) as unknown,
  });
  expect((await harness.call('ada', 'GET', rollPath)).body).toMatchObject({
    rollUps: { [target.projectId]: { dates: null, displayed: null } },
  });
  expect(identity()).toEqual(fixed);
  harness.sqlite
    .query("UPDATE project SET schedule_engine='fast',optimization_enabled=0 WHERE id=?")
    .run(remote.projectId);
  harness.sqlite.run("DELETE FROM external_dependency WHERE id='remote-fs'");
  expect((await harness.call('ada', 'GET', rollPath)).body).toMatchObject({
    rollUps: { [target.projectId]: { dates: { startsOn: '2026-10-20' }, displayed: 'fast' } },
  });
});
