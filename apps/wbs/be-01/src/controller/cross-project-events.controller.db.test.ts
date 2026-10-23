import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

const opened: OrganizationHarness[] = [];
afterEach(() => {
  for (const harness of opened.splice(0)) harness.close();
});

async function fixture(push?: () => Promise<Response>, onCaptured?: () => void) {
  const harness = OrganizationHarness.openComposed(
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    push,
    undefined,
    onCaptured,
  );
  // Synthetic stored authority supports fixture edges; the mounted writer still has dormant admission.
  seedDependencyAuthority(harness.databasePath());
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
  const unrelated = await create('Unrelated');
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
  return { harness, upstream, downstream, tail, unrelated, foreign, events, connect };
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

it.each([false, true])(
  'rank reversal invalidates the dependency component with shared mode %s',
  async (shared) => {
    const { harness, upstream, downstream, tail, foreign, events } = await fixture();
    harness.sqlite.run(
      "UPDATE organization_membership SET role = 'admin' WHERE organization_id = 'org-a'",
    );
    if (shared) {
      harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
      harness.sqlite.run("DELETE FROM external_dependency WHERE id = 'down-tail'");
      harness.sqlite.run("INSERT INTO person (id, name) VALUES ('rank-bridge', 'Bridge')");
      harness.sqlite.run(
        "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('rank-bridge', 'org-a', 'Bridge')",
      );
      for (const project of [downstream, tail])
        harness.sqlite.run(
          "INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, 'rank-bridge')",
          [project.rowId, project.stepId],
        );
    }
    const move = (id: string, afterProjectId: string | null) =>
      harness.call('ada', 'POST', `/api/organization/projects/${id}/rank`, { afterProjectId });
    const created = await harness.call('ada', 'POST', '/api/projects', { name: 'Unrelated' });
    expect(created.status).toBe(200);
    const unrelated = (created.body as { project: { id: string } }).project.id;
    const unchanged = [upstream, downstream, tail, foreign].map(({ id }) => events(id));
    expect((await move(unrelated, null)).status).toBe(200);
    expect([upstream, downstream, tail, foreign].map(({ id }) => events(id))).toEqual(unchanged);
    expect((await move(foreign.id, null)).status).toBe(404);
    expect([upstream, downstream, tail, foreign].map(({ id }) => events(id))).toEqual(unchanged);
    expect((await move(downstream.id, null)).status).toBe(200);
    expect(events(upstream.id)).toEqual([
      { type: 'elsewhere_changed', projectId: upstream.id, causeProjectId: downstream.id },
    ]);
    expect(events(downstream.id)).toEqual([
      { type: 'elsewhere_changed', projectId: downstream.id, causeProjectId: upstream.id },
    ]);
    expect(events(tail.id)).toHaveLength(2);
    expect(events(unrelated)).toEqual([]);
    expect(events(foreign.id)).toEqual([]);
    const after = [upstream, downstream, tail].map(({ id }) => events(id));
    expect((await move(downstream.id, downstream.id)).status).toBe(200);
    expect([upstream, downstream, tail].map(({ id }) => events(id))).toEqual(after);
  },
);

it('number-only edits refresh dependency labels without retargeting or foreign events', async () => {
  const { harness, upstream, downstream, tail, foreign, events } = await fixture();
  harness.sqlite.run('UPDATE work_item SET frozen_number = ? WHERE id = ?', [
    '090',
    upstream.rowId,
  ]);
  const incoming = (body: unknown) =>
    (body as { connectedDependencies: readonly { id: string }[] }).connectedDependencies.find(
      ({ id }) => id === 'up-down',
    );
  const relationships = harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all();
  const before = await harness.call(
    'ada',
    'GET',
    `/api/projects/${downstream.id}/work-items?full=true`,
  );
  expect(before.status).toBe(200);
  expect(incoming(before.body)).toMatchObject({
    id: 'up-down',
    predecessor: {
      endpoint: { workItemId: upstream.rowId },
      workItemNumber: '090',
      qualifiedReference: 'UPS.090',
    },
  });
  const changed = await harness.call('ada', 'POST', `/api/projects/${upstream.id}/commands`, {
    commands: [{ kind: 'unfreezeWorkItem', workItemId: upstream.rowId }],
  });
  expect(changed.status).toBe(200);
  // Proof: dropping incident traversal made this mounted number-only command retain no successor events.
  for (const project of [downstream, tail])
    expect(events(project.id)).toEqual([
      { type: 'elsewhere_changed', projectId: project.id, causeProjectId: upstream.id },
    ]);
  expect(events(foreign.id)).toEqual([]);
  expect(harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all()).toEqual(
    relationships,
  );
  const refreshed = await harness.call(
    'ada',
    'GET',
    `/api/projects/${downstream.id}/work-items?full=true`,
  );
  expect(refreshed.status).toBe(200);
  expect(incoming(refreshed.body)).toMatchObject({
    id: 'up-down',
    predecessor: {
      endpoint: { workItemId: upstream.rowId },
      workItemNumber: '010',
      qualifiedReference: 'UPS.010',
    },
  });
});

it.each([false, true])(
  'bare step add refreshes connected whole readiness without shared people (shared=%s)',
  async (shared) => {
    const { harness, upstream, downstream, tail, unrelated, foreign, events } = await fixture();
    if (shared) harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    harness.sqlite.run("UPDATE work_item SET readiness = 'ready'");
    for (const project of [upstream, downstream, tail])
      harness.sqlite.run('DELETE FROM step WHERE project_id = ? AND id <> ?', [
        project.id,
        project.stepId,
      ]);
    harness.sqlite.run(
      "INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES (?, ?, 'done', 1)",
      [upstream.rowId, upstream.stepId],
    );
    expect(harness.sqlite.query('SELECT COUNT(*) AS count FROM assignment').get()).toEqual({
      count: 0,
    });
    const relationships = harness.sqlite
      .query('SELECT * FROM external_dependency ORDER BY id')
      .all();
    const read = () =>
      harness.call('ada', 'GET', `/api/projects/${downstream.id}/work-items?full=true`);
    expect((await read()).body).toMatchObject({
      workItems: [{ id: downstream.rowId, nodeReadings: { [downstream.stepId]: 'waiting' } }],
    });
    const added = await harness.call('ada', 'POST', `/api/projects/${upstream.id}/steps`, {
      name: 'Release',
      code: 'release',
    });
    expect(added.status).toBe(200);
    for (const project of [downstream, tail])
      expect(events(project.id)).toEqual([
        { type: 'elsewhere_changed', projectId: project.id, causeProjectId: upstream.id },
      ]);
    expect(events(upstream.id)).toEqual([]);
    expect(events(unrelated.id)).toEqual([]);
    expect(events(foreign.id)).toEqual([]);
    expect(
      harness.sqlite
        .query("SELECT COUNT(*) AS count FROM event_log WHERE message LIKE '%elsewhere_changed%'")
        .get(),
    ).toEqual({ count: 2 });
    expect((await read()).body).toMatchObject({
      workItems: [{ id: downstream.rowId, nodeReadings: { [downstream.stepId]: 'unknown' } }],
    });
    expect(harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all()).toEqual(
      relationships,
    );
    const previous = harness.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all();
    expect(
      (
        await harness.call('ada', 'POST', `/api/projects/${upstream.id}/steps`, {
          name: 'Release again',
          code: 'release',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await harness.call('ada', 'POST', `/api/projects/${upstream.id}/steps`, {
          name: ' ',
          code: 'empty',
        })
      ).status,
    ).toBe(422);
    expect(harness.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all()).toEqual(previous);
  },
);

it.each([false, true])(
  'bare step rename refreshes connected labels without retargeting (shared=%s)',
  async (shared) => {
    const { harness, upstream, downstream, tail, unrelated, foreign, events } = await fixture();
    if (shared) harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    harness.sqlite.run(
      "UPDATE external_dependency SET predecessor_scope = 'node', predecessor_step_id = ? WHERE id = 'up-down'",
      [upstream.stepId],
    );
    expect(harness.sqlite.query('SELECT COUNT(*) AS count FROM assignment').get()).toEqual({
      count: 0,
    });
    const relationships = harness.sqlite
      .query('SELECT * FROM external_dependency ORDER BY id')
      .all();
    const read = () =>
      harness.call('ada', 'GET', `/api/projects/${downstream.id}/work-items?full=true`);
    const before = (await read()).body as {
      connectedDependencies: {
        id: string;
        predecessor: {
          endpoint: unknown;
          step: { id: string; name: string };
          qualifiedReference: string;
        };
      }[];
    };
    expect(before).toMatchObject({
      workItems: [{ id: downstream.rowId, nodeReadings: { [downstream.stepId]: 'unknown' } }],
    });
    const previousLink = before.connectedDependencies.find(({ id }) => id === 'up-down');
    if (previousLink === undefined) throw new Error('step fixture missing incoming relationship');
    const renamed = await harness.call(
      'ada',
      'PATCH',
      `/api/projects/${upstream.id}/steps/${upstream.stepId}`,
      { name: 'Renamed prerequisite step' },
    );
    expect(renamed.status).toBe(200);
    for (const project of [downstream, tail])
      expect(events(project.id)).toEqual([
        { type: 'elsewhere_changed', projectId: project.id, causeProjectId: upstream.id },
      ]);
    expect(events(upstream.id)).toEqual([]);
    expect(events(unrelated.id)).toEqual([]);
    expect(events(foreign.id)).toEqual([]);
    expect(
      harness.sqlite
        .query("SELECT COUNT(*) AS count FROM event_log WHERE message LIKE '%elsewhere_changed%'")
        .get(),
    ).toEqual({ count: 2 });
    const refreshed = await read();
    expect(refreshed.status).toBe(200);
    expect(refreshed.body).toMatchObject({
      workItems: [{ id: downstream.rowId, nodeReadings: { [downstream.stepId]: 'unknown' } }],
    });
    const refreshedLink = (refreshed.body as typeof before).connectedDependencies.find(
      ({ id }) => id === 'up-down',
    );
    expect(refreshedLink).toMatchObject({
      id: 'up-down',
      predecessor: {
        endpoint: previousLink.predecessor.endpoint,
        step: { id: upstream.stepId, name: 'Renamed prerequisite step' },
        qualifiedReference: previousLink.predecessor.qualifiedReference,
      },
    });
    expect(harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all()).toEqual(
      relationships,
    );
    expect(
      (
        await harness.call(
          'ada',
          'PATCH',
          `/api/projects/${upstream.id}/steps/${upstream.stepId}`,
          { name: 'Renamed prerequisite step' },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await harness.call(
          'ada',
          'PATCH',
          `/api/projects/${upstream.id}/steps/${upstream.stepId}`,
          { name: ' ' },
        )
      ).status,
    ).toBe(422);
    for (const project of [downstream, tail]) expect(events(project.id)).toHaveLength(1);
  },
);

it.each(['add', 'rename'] as const)(
  'bare step %s rolls back the write and first fanout row when the second insert fails',
  async (mutation) => {
    let pushes = 0;
    const { harness, upstream, downstream, tail, events } = await fixture(() => {
      pushes += 1;
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    });
    const tables = [
      'step',
      'project',
      'work_item',
      'event_log',
      'event_sequencer',
      'command_journal',
      'plan_event',
      'organization_audit',
    ];
    const snapshot = () =>
      tables.map((table) => harness.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = snapshot();
    const previousPushes = pushes;
    harness.sqlite.run(`CREATE TRIGGER reject_second_step_fanout BEFORE INSERT ON event_log
      WHEN NEW.message LIKE '%elsewhere_changed%' AND
        (SELECT COUNT(*) FROM event_log WHERE message LIKE '%elsewhere_changed%') >= 1
      BEGIN SELECT RAISE(ABORT, 'injected second step fanout insert failure'); END`);
    const answer =
      mutation === 'add'
        ? await harness.call('ada', 'POST', `/api/projects/${upstream.id}/steps`, {
            name: 'Rolled back addition',
            code: 'rollback',
          })
        : await harness.call(
            'ada',
            'PATCH',
            `/api/projects/${upstream.id}/steps/${upstream.stepId}`,
            { name: 'Rolled back rename' },
          );
    expect(answer.status).toBe(500);
    expect(snapshot()).toEqual(before);
    expect(events(downstream.id)).toEqual([]);
    expect(events(tail.id)).toEqual([]);
    expect(pushes).toBe(previousPushes);
  },
);

it.each(['add', 'rename'] as const)(
  'bare step %s delivers only after its step and complete fanout commit and writer release',
  async (mutation) => {
    const observer: { current?: () => void } = {};
    const { harness, upstream, downstream, tail, events } = await fixture(() => {
      observer.current?.();
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    });
    let deliveries = 0;
    observer.current = () => {
      const written = harness.sqlite
        .query<{ name: string }, [string]>(
          "SELECT name FROM step WHERE project_id = ? AND name = 'Committed step'",
        )
        .get(upstream.id);
      expect(written).toEqual({ name: 'Committed step' });
      expect(events(downstream.id)).toEqual([
        { type: 'elsewhere_changed', projectId: downstream.id, causeProjectId: upstream.id },
      ]);
      expect(events(tail.id)).toEqual([
        { type: 'elsewhere_changed', projectId: tail.id, causeProjectId: upstream.id },
      ]);
      harness.sqlite.run('UPDATE project SET name = name WHERE id = ?', [downstream.id]);
      deliveries += 1;
    };
    const answer =
      mutation === 'add'
        ? await harness.call('ada', 'POST', `/api/projects/${upstream.id}/steps`, {
            name: 'Committed step',
            code: 'committed',
          })
        : await harness.call(
            'ada',
            'PATCH',
            `/api/projects/${upstream.id}/steps/${upstream.stepId}`,
            { name: 'Committed step' },
          );
    observer.current = undefined;
    expect(answer.status).toBe(200);
    expect(deliveries).toBeGreaterThan(0);
  },
);

it.each(['add', 'rename'] as const)(
  'bare step %s preserves service refusals before broken capture and rolls back a valid write',
  async (mutation) => {
    let armed = false;
    let captures = 0;
    let pushes = 0;
    const { harness, upstream, downstream, foreign } = await fixture(
      () => {
        pushes += 1;
        return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
      },
      () => {
        if (armed) {
          captures += 1;
          throw new Error('injected step capture failure');
        }
      },
    );
    const tables = [
      'step',
      'project',
      'work_item',
      'external_dependency',
      'event_log',
      'event_sequencer',
      'command_journal',
      'plan_event',
      'organization_audit',
    ];
    const snapshot = () =>
      tables.map((table) => harness.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = snapshot();
    const previousPushes = pushes;
    armed = true;
    const add = (name: string, code: string) =>
      harness.call('ada', 'POST', `/api/projects/${upstream.id}/steps`, { name, code });
    const rename = (stepId: string, name: string) =>
      harness.call('ada', 'PATCH', `/api/projects/${upstream.id}/steps/${stepId}`, { name });
    if (mutation === 'add') {
      expect((await add(' ', 'blank')).status).toBe(422);
      expect((await add('Invalid code', 'bad code')).status).toBe(422);
      expect((await add('Reserved code', 's2')).status).toBe(422);
    } else {
      expect((await rename(upstream.stepId, ' ')).status).toBe(422);
      expect((await rename(downstream.stepId, 'Foreign step')).status).toBe(404);
      expect((await rename(foreign.stepId, 'Foreign organization step')).status).toBe(404);
      expect((await rename('absent-step', 'Absent step')).status).toBe(404);
    }
    expect(captures).toBe(0);
    expect(snapshot()).toEqual(before);
    expect(pushes).toBe(previousPushes);
    const valid =
      mutation === 'add'
        ? await add('Valid addition', 'valid')
        : await rename(upstream.stepId, 'Valid rename');
    expect(valid.status).toBe(500);
    expect(captures).toBe(1);
    expect(snapshot()).toEqual(before);
    expect(pushes).toBe(previousPushes);
  },
);
