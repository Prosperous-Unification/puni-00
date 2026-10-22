import { WorkItemService } from '@wbs/core/module/work-item/work-item.resource';
import * as connectedTree from '@wbs/core/service/connected-tree';
import { formatStepNodeId, sliceKey } from '@wbs/domain';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;
afterEach(async () => {
  await harness.closeComposed();
});

async function open() {
  harness = OrganizationHarness.openComposed();
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
