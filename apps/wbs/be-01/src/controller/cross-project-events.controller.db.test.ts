import { afterEach, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

const opened: OrganizationHarness[] = [];
afterEach(() => {
  for (const harness of opened.splice(0)) harness.close();
});

async function fixture(push?: () => Promise<Response>) {
  const harness = OrganizationHarness.openComposed(
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    push,
  );
  opened.push(harness);
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'member');
  harness.bind('ada', 'org-a');
  harness.activate();
  const create = async (name: string) => {
    const answer = await harness.call('ada', 'POST', '/api/projects', { name });
    expect(answer.status).toBe(200);
    const body = answer.body as { project: { id: string }; steps: { id: string }[] };
    const step = body.steps.at(0);
    if (step === undefined) throw new Error('project fixture omitted step');
    harness.sqlite.run(
      'INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 10, ?)',
      [`${body.project.id}-row`, body.project.id, name],
    );
    return { id: body.project.id, rowId: `${body.project.id}-row`, stepId: step.id };
  };
  const upstream = await create('Upstream');
  const downstream = await create('Downstream');
  const tail = await create('Tail');
  harness.organization('org-b');
  harness.member('org-b', 'ada', 'member');
  harness.bind('ada', 'org-b');
  const foreign = await create('Protected foreign name');
  const foreignTail = await create('Protected foreign successor');
  harness.sqlite.run(
    `INSERT INTO external_dependency (id, organization_id, predecessor_project_id, successor_project_id, predecessor_work_item_id, predecessor_scope, successor_work_item_id, successor_scope, type) VALUES ('foreign-edge', 'org-b', ?, ?, ?, 'whole', ?, 'whole', 'FS')`,
    [foreign.id, foreignTail.id, foreign.rowId, foreignTail.rowId],
  );
  harness.bind('ada', 'org-a');
  const connect = (id: string, predecessor: typeof upstream, successor: typeof upstream) =>
    harness.sqlite.run(
      `INSERT INTO external_dependency (id, organization_id, predecessor_project_id, successor_project_id, predecessor_work_item_id, predecessor_scope, successor_work_item_id, successor_scope, type) VALUES (?, 'org-a', ?, ?, ?, 'whole', ?, 'whole', 'FS')`,
      [id, predecessor.id, successor.id, predecessor.rowId, successor.rowId],
    );
  connect('up-down', upstream, downstream);
  connect('down-tail', downstream, tail);
  const events = (projectId: string) =>
    harness.sqlite
      .query<{ message: string }, [string]>(
        "SELECT message FROM event_log WHERE subscription = ? AND message LIKE '%elsewhere_changed%' ORDER BY seq",
      )
      .all(`project:${projectId}`)
      .map(({ message }) => JSON.parse(message) as unknown);
  return { harness, upstream, downstream, tail, foreign, events, connect };
}

it('rename invalidates dependency label readers without retargeting or foreign delivery', async () => {
  const { harness, upstream, downstream, tail, foreign, events } = await fixture();
  const before = harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all();
  const answer = await harness.call('ada', 'PATCH', `/api/projects/${upstream.id}`, {
    name: 'Renamed upstream',
    abbreviation: 'REN',
  });
  expect(answer.status).toBe(200);
  for (const project of [downstream, tail])
    expect(events(project.id)).toEqual([
      { type: 'elsewhere_changed', projectId: project.id, causeProjectId: upstream.id },
    ]);
  expect(events(foreign.id)).toEqual([]);
  const abbreviationOnly = await harness.call('ada', 'PATCH', `/api/projects/${upstream.id}`, {
    abbreviation: 'NEXT',
  });
  expect(abbreviationOnly.status).toBe(200);
  for (const project of [downstream, tail]) expect(events(project.id)).toHaveLength(2);
  expect(events(foreign.id)).toEqual([]);
  expect(harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all()).toEqual(
    before,
  );
  expect(JSON.stringify(events(downstream.id))).not.toContain('Protected foreign name');
});

it('dependency fanout delivery occurs after commit and writer release', async () => {
  const observer: { current?: () => void } = {};
  const { harness, upstream, downstream, events } = await fixture(() => {
    observer.current?.();
    return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
  });
  let deliveries = 0;
  observer.current = () => {
    const stored = harness.sqlite
      .query<{ name: string }, [string]>('SELECT name FROM project WHERE id = ?')
      .get(upstream.id);
    expect(stored?.name).toBe('Committed name');
    harness.sqlite.run('UPDATE project SET name = name WHERE id = ?', [downstream.id]);
    deliveries++;
  };
  const answer = await harness.call('ada', 'PATCH', `/api/projects/${upstream.id}`, {
    name: 'Committed name',
  });
  expect(answer.status).toBe(200);
  expect(deliveries).toBeGreaterThan(0);
  expect(events(downstream.id)).toHaveLength(1);
});

it('a rejected dependency command batch publishes nothing and rolls earlier mutations back', async () => {
  const { harness, upstream, downstream, tail, events } = await fixture();
  const before = [
    'estimate',
    'step_progress',
    'event_log',
    'event_sequencer',
    'command_journal',
    'plan_event',
  ].map((table) => harness.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
  const answer = await harness.call('ada', 'POST', `/api/projects/${upstream.id}/commands`, {
    commands: [
      {
        kind: 'setEstimate',
        workItemId: upstream.rowId,
        stepId: upstream.stepId,
        days: { optimistic: 3, realistic: 3, pessimistic: 3 },
      },
      {
        kind: 'setEstimate',
        workItemId: 'absent',
        stepId: upstream.stepId,
        days: { optimistic: 4, realistic: 4, pessimistic: 4 },
      },
    ],
  });
  expect(answer.status).toBe(404);
  expect(
    [
      'estimate',
      'step_progress',
      'event_log',
      'event_sequencer',
      'command_journal',
      'plan_event',
    ].map((table) => harness.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all()),
  ).toEqual(before);
  expect(events(downstream.id)).toEqual([]);
  expect(events(tail.id)).toEqual([]);
});

it.each([false, true])(
  'mounted completion refreshes successor-only readiness with shared mode %s',
  async (shared) => {
    const { harness, upstream, downstream, tail, foreign, events } = await fixture();
    if (shared) harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    harness.sqlite.run("UPDATE work_item SET readiness = 'ready'");
    for (const project of [upstream, downstream, tail])
      harness.sqlite.run('DELETE FROM step WHERE project_id = ? AND id <> ?', [
        project.id,
        project.stepId,
      ]);
    harness.sqlite.run(
      "UPDATE external_dependency SET predecessor_scope = 'node', predecessor_step_id = ?, successor_scope = 'node', successor_step_id = ? WHERE id = 'up-down'",
      [upstream.stepId, downstream.stepId],
    );
    harness.sqlite.run(
      "UPDATE external_dependency SET predecessor_scope = 'node', predecessor_step_id = ?, successor_scope = 'node', successor_step_id = ? WHERE id = 'down-tail'",
      [downstream.stepId, tail.stepId],
    );
    const before = await harness.call(
      'ada',
      'GET',
      `/api/projects/${downstream.id}/work-items?full=true`,
    );
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({
      workItems: [{ id: downstream.rowId, nodeReadings: { [downstream.stepId]: 'unknown' } }],
    });
    const answer = await harness.call('ada', 'POST', `/api/projects/${upstream.id}/commands`, {
      commands: [
        { kind: 'setProgress', workItemId: upstream.rowId, stepId: upstream.stepId, state: 'done' },
      ],
    });
    expect(answer.status).toBe(200);
    expect(
      harness.sqlite
        .query('SELECT state FROM step_progress WHERE work_item_id = ? AND step_id = ?')
        .get(upstream.rowId, upstream.stepId),
    ).toEqual({ state: 'done' });
    for (const project of [downstream, tail])
      expect(events(project.id)).toEqual([
        { type: 'elsewhere_changed', projectId: project.id, causeProjectId: upstream.id },
      ]);
    expect(events(foreign.id)).toEqual([]);
    const refreshed = await harness.call(
      'ada',
      'GET',
      `/api/projects/${downstream.id}/work-items?full=true`,
    );
    expect(refreshed.status).toBe(200);
    expect(refreshed.body).toMatchObject({
      workItems: [{ id: downstream.rowId, nodeReadings: { [downstream.stepId]: 'waiting' } }],
    });
  },
);

it('mounted shared-person bridge carries a label change across an external edge', async () => {
  const { harness, upstream, downstream, tail, events } = await fixture();
  harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  harness.sqlite.run("DELETE FROM external_dependency WHERE id = 'up-down'");
  harness.sqlite.run("INSERT INTO person (id, name) VALUES ('ana', 'Ana')");
  harness.sqlite.run(
    "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('ana', 'org-a', 'Ana')",
  );
  for (const project of [upstream, downstream])
    harness.sqlite.run(
      'INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)',
      [project.rowId, project.stepId, 'ana'],
    );
  const answer = await harness.call('ada', 'PATCH', `/api/projects/${upstream.id}`, {
    name: 'Changed over person bridge',
  });
  expect(answer.status).toBe(200);
  for (const project of [downstream, tail])
    expect(events(project.id)).toEqual([
      { type: 'elsewhere_changed', projectId: project.id, causeProjectId: upstream.id },
    ]);
});
