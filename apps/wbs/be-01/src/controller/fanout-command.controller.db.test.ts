import { afterEach, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

const opened: OrganizationHarness[] = [];
afterEach(() => {
  for (const harness of opened.splice(0)) harness.close();
});

it('records a cold shared command fan-out without a preceding tree GET', async () => {
  let holdFirstPush = false;
  let releasePush!: () => void;
  let reachedPush!: () => void;
  const heldPush = new Promise<void>((resolve) => {
    releasePush = resolve;
  });
  const pushStarted = new Promise<void>((resolve) => {
    reachedPush = resolve;
  });
  const harness = OrganizationHarness.openComposed(
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    async () => {
      if (holdFirstPush) {
        holdFirstPush = false;
        reachedPush();
        await heldPush;
      }
      return Response.json({ delivered_to_sockets: 0 });
    },
  );
  opened.push(harness);
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'member');
  harness.bind('ada', 'org-a');
  harness.activate();
  const create = async (name: string) => {
    const answer = await harness.call('ada', 'POST', '/api/projects', { name });
    if (answer.status !== 200)
      throw new Error(`project creation refused: ${JSON.stringify(answer)}`);
    const body = answer.body as { project: { id: string }; steps: { id: string }[] };
    const step = body.steps.at(0);
    if (step === undefined) throw new Error('project creation omitted its first step');
    return { projectId: body.project.id, stepId: step.id };
  };
  const upstream = await create('Upstream');
  const downstream = await create('Downstream');
  harness.sqlite.run("INSERT INTO person (id, name) VALUES ('ana', 'Ana')");
  harness.sqlite.run(
    "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('ana', 'org-a', 'Ana')",
  );
  for (const [index, project] of [upstream, downstream].entries()) {
    harness.sqlite.run(
      "UPDATE project SET start_date = '2026-10-05', estimate_rounding = 'exact' WHERE id = ?",
      [project.projectId],
    );
    harness.sqlite.run(
      'INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 10, ?)',
      [`row-${String(index)}`, project.projectId, `row-${String(index)}`],
    );
    harness.sqlite.run(
      'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
      [`row-${String(index)}`, project.stepId],
    );
    harness.sqlite.run(
      'INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)',
      [`row-${String(index)}`, project.stepId, 'ana'],
    );
  }
  harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  holdFirstPush = true;
  const pending = harness.call('ada', 'POST', `/api/projects/${upstream.projectId}/commands`, {
    commands: [
      {
        kind: 'setEstimate',
        workItemId: 'row-0',
        stepId: upstream.stepId,
        days: { optimistic: 3, realistic: 3, pessimistic: 3 },
      },
    ],
  });
  await pushStarted;
  // Proof: moving committed delivery inside the transaction holds its SQLite
  // write lock while transport waits, so this independent writer fails.
  try {
    harness.sqlite.run('UPDATE project SET name = ? WHERE id = ?', [
      'writer entered',
      upstream.projectId,
    ]);
  } finally {
    releasePush();
  }
  const answer = await pending;
  expect(answer.status).toBe(200);
  const events = harness.sqlite
    .query<{ message: string }, [string]>(
      'SELECT message FROM event_log WHERE subscription = ? ORDER BY seq',
    )
    .all(`project:${downstream.projectId}`);
  expect(events.map(({ message }) => JSON.parse(message) as unknown)).toEqual([
    {
      type: 'elsewhere_changed',
      projectId: downstream.projectId,
      causeProjectId: upstream.projectId,
    },
  ]);
  const twice = await harness.call('ada', 'POST', `/api/projects/${upstream.projectId}/commands`, {
    commands: [
      {
        kind: 'setEstimate',
        workItemId: 'row-0',
        stepId: upstream.stepId,
        days: { optimistic: 4, realistic: 4, pessimistic: 4 },
      },
      {
        kind: 'setEstimate',
        workItemId: 'row-0',
        stepId: upstream.stepId,
        days: { optimistic: 5, realistic: 5, pessimistic: 5 },
      },
    ],
  });
  expect(twice.status).toBe(200);
  expect(
    harness.sqlite
      .query('SELECT * FROM event_log WHERE subscription = ? ORDER BY seq')
      .all(`project:${downstream.projectId}`),
  ).toHaveLength(2);
  const roundTrip = await harness.call(
    'ada',
    'POST',
    `/api/projects/${upstream.projectId}/commands`,
    {
      commands: [
        {
          kind: 'setEstimate',
          workItemId: 'row-0',
          stepId: upstream.stepId,
          days: { optimistic: 6, realistic: 6, pessimistic: 6 },
        },
        {
          kind: 'setEstimate',
          workItemId: 'row-0',
          stepId: upstream.stepId,
          days: { optimistic: 5, realistic: 5, pessimistic: 5 },
        },
      ],
    },
  );
  expect(roundTrip.status).toBe(200);
  expect(
    harness.sqlite
      .query('SELECT * FROM event_log WHERE subscription = ? ORDER BY seq')
      .all(`project:${downstream.projectId}`),
  ).toHaveLength(2);
  const beforeRefusal = [
    'estimate',
    'command_journal',
    'plan_event',
    'event_log',
    'event_sequencer',
  ].map((table) => harness.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
  const refused = await harness.call(
    'ada',
    'POST',
    `/api/projects/${upstream.projectId}/commands`,
    {
      commands: [
        {
          kind: 'setEstimate',
          workItemId: 'row-0',
          stepId: upstream.stepId,
          days: { optimistic: 7, realistic: 7, pessimistic: 7 },
        },
        {
          kind: 'setEstimate',
          workItemId: 'absent',
          stepId: upstream.stepId,
          days: { optimistic: 8, realistic: 8, pessimistic: 8 },
        },
      ],
    },
  );
  expect(refused.status).toBe(404);
  expect(
    ['estimate', 'command_journal', 'plan_event', 'event_log', 'event_sequencer'].map((table) =>
      harness.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    ),
  ).toEqual(beforeRefusal);
  expect(
    await harness.removeBareStep(upstream.projectId, upstream.stepId, harness.userId('ada'), true, {
      kind: 'scoped',
      scope: { organizationId: 'org-a', userId: harness.userId('ada'), role: 'member' },
    }),
  ).toEqual({ ok: true });
  expect(harness.sqlite.query('SELECT * FROM organization_audit').all()).toEqual([]);
  expect(
    harness.sqlite
      .query('SELECT * FROM event_log WHERE subscription = ? ORDER BY seq')
      .all(`project:${downstream.projectId}`),
  ).toHaveLength(3);
});

it('records distinct sorted causes from a directory-only batch across old shared usage', async () => {
  const harness = OrganizationHarness.openComposed();
  opened.push(harness);
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'member');
  harness.bind('ada', 'org-a');
  harness.activate();
  const projects: { projectId: string; stepId: string }[] = [];
  for (const name of ['A', 'B', 'C']) {
    const answer = await harness.call('ada', 'POST', '/api/projects', { name });
    if (answer.status !== 200)
      throw new Error(`project creation refused: ${JSON.stringify(answer)}`);
    const body = answer.body as { project: { id: string }; steps: { id: string }[] };
    const step = body.steps.at(0);
    if (step === undefined) throw new Error('project creation omitted its first step');
    projects.push({ projectId: body.project.id, stepId: step.id });
  }
  harness.sqlite.run("INSERT INTO person (id, name) VALUES ('ana', 'Ana')");
  harness.sqlite.run(
    "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('ana', 'org-a', 'Ana')",
  );
  for (const [index, project] of projects.entries()) {
    harness.sqlite.run(
      "UPDATE project SET start_date = '2026-10-05', estimate_rounding = 'exact' WHERE id = ?",
      [project.projectId],
    );
    harness.sqlite.run(
      'INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 10, ?)',
      [`row-${String(index)}`, project.projectId, `row-${String(index)}`],
    );
    harness.sqlite.run(
      'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
      [`row-${String(index)}`, project.stepId],
    );
    harness.sqlite.run(
      'INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)',
      [`row-${String(index)}`, project.stepId, 'ana'],
    );
  }
  harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  const first = projects[0];
  const second = projects[1];
  const third = projects[2];
  const answer = await harness.call('ada', 'POST', `/api/projects/${first.projectId}/commands`, {
    commands: [{ kind: 'deletePerson', personId: 'ana', cascade: true }],
  });
  expect(answer.status).toBe(200);
  const rows = harness.sqlite
    .query<{ subscription: string; message: string }, []>(
      "SELECT subscription, message FROM event_log WHERE message LIKE '%elsewhere_changed%' ORDER BY subscription, seq",
    )
    .all();
  const expected: [string, { type: string; projectId: string; causeProjectId: string }][] = [
    [
      `project:${second.projectId}`,
      { type: 'elsewhere_changed', projectId: second.projectId, causeProjectId: first.projectId },
    ],
    [
      `project:${third.projectId}`,
      { type: 'elsewhere_changed', projectId: third.projectId, causeProjectId: first.projectId },
    ],
    [
      `project:${third.projectId}`,
      { type: 'elsewhere_changed', projectId: third.projectId, causeProjectId: second.projectId },
    ],
  ];
  const sortPair = (
    left: readonly [string, { causeProjectId: string }],
    right: readonly [string, { causeProjectId: string }],
  ) =>
    left[0].localeCompare(right[0]) ||
    left[1].causeProjectId.localeCompare(right[1].causeProjectId);
  expect(
    rows
      .map(
        ({ subscription, message }) =>
          [subscription, JSON.parse(message) as { causeProjectId: string }] as const,
      )
      .sort(sortPair),
  ).toEqual(expected.sort(sortPair));
});

it('keeps both changed connection endpoints as durable causes on assignment removal', async () => {
  const harness = OrganizationHarness.openComposed();
  opened.push(harness);
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'member');
  harness.bind('ada', 'org-a');
  harness.activate();
  const projects: { projectId: string; stepId: string }[] = [];
  for (const name of ['A', 'B', 'C']) {
    const answer = await harness.call('ada', 'POST', '/api/projects', { name });
    if (answer.status !== 200)
      throw new Error(`project creation refused: ${JSON.stringify(answer)}`);
    const body = answer.body as { project: { id: string }; steps: { id: string }[] };
    const step = body.steps.at(0);
    if (step === undefined) throw new Error('project creation omitted its first step');
    projects.push({ projectId: body.project.id, stepId: step.id });
  }
  for (const [id, name] of [
    ['ana', 'Ana'],
    ['ben', 'Ben'],
  ]) {
    harness.sqlite.run('INSERT INTO person (id, name) VALUES (?, ?)', [id, name]);
    harness.sqlite.run(
      'INSERT INTO person_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
      [id, 'org-a', name],
    );
  }
  for (const project of projects)
    harness.sqlite.run(
      "UPDATE project SET start_date = '2026-10-05', estimate_rounding = 'exact' WHERE id = ?",
      [project.projectId],
    );
  const rows: readonly [number, string, number][] = [
    [0, 'ana', 1],
    [1, 'ana', 1],
    [1, 'ben', 2],
    [2, 'ben', 1],
  ];
  for (const [projectIndex, personId, days] of rows) {
    const project = projects[projectIndex];
    const workItemId = `topology-${String(projectIndex)}-${personId}`;
    harness.sqlite.run(
      'INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, ?, ?)',
      [workItemId, project.projectId, personId === 'ana' ? 10 : 20, workItemId],
    );
    harness.sqlite.run(
      'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, ?, ?, ?)',
      [workItemId, project.stepId, days, days, days],
    );
    harness.sqlite.run(
      'INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)',
      [workItemId, project.stepId, personId],
    );
  }
  const bridgeProject = projects[1];
  harness.sqlite.run(
    'INSERT INTO dependency (id, project_id, predecessor_id, successor_id) VALUES (?, ?, ?, ?)',
    ['topology-bridge-order', bridgeProject.projectId, 'topology-1-ana', 'topology-1-ben'],
  );
  harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  const [upstream, bridge, downstream] = projects;
  const answer = await harness.call('ada', 'POST', `/api/projects/${bridge.projectId}/commands`, {
    commands: [
      { kind: 'setAssignee', workItemId: 'topology-1-ana', stepId: bridge.stepId, personId: null },
    ],
  });
  expect(answer.status).toBe(200);
  const pairs = harness.sqlite
    .query<{ subscription: string; message: string }, []>(
      "SELECT subscription, message FROM event_log WHERE message LIKE '%elsewhere_changed%' ORDER BY subscription, seq",
    )
    .all()
    .map(({ subscription, message }) => {
      const event = JSON.parse(message) as { projectId: string; causeProjectId: string };
      return [subscription, event.projectId, event.causeProjectId];
    });
  expect(pairs).toContainEqual([
    `project:${bridge.projectId}`,
    bridge.projectId,
    upstream.projectId,
  ]);
  expect(pairs).toContainEqual([
    `project:${downstream.projectId}`,
    downstream.projectId,
    upstream.projectId,
  ]);
  expect(pairs).toContainEqual([
    `project:${downstream.projectId}`,
    downstream.projectId,
    bridge.projectId,
  ]);
});
