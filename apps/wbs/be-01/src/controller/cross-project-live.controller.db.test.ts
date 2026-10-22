import { WorkItemService } from '@wbs/core/module/work-item/work-item.resource';
import { formatStepNodeId } from '@wbs/domain';
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
