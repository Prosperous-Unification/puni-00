import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

const opened: OrganizationHarness[] = [];
afterEach(async () => {
  for (const harness of opened.splice(0)) await harness.closeComposed();
});

async function fixture(push?: () => Promise<Response>) {
  const harness = OrganizationHarness.openComposedWith({ pushFetch: push });
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
  const unrelated = await create('Unrelated same-organization project');
  harness.organization('org-b');
  harness.member('org-b', 'ada', 'member');
  harness.bind('ada', 'org-b');
  const foreign = await create('Protected foreign name');
  const foreignTail = await create('Protected foreign successor');
  harness.sqlite.run(
    `INSERT INTO external_dependency (id, organization_id, predecessor_project_id, successor_project_id, predecessor_work_item_id, predecessor_scope, successor_work_item_id, successor_scope, type) VALUES ('foreign-edge', 'org-b', ?, ?, ?, 'whole', ?, 'whole', 'SS')`,
    [foreign.id, foreignTail.id, foreign.rowId, foreignTail.rowId],
  );
  harness.bind('ada', 'org-a');
  const connect = (id: string, predecessor: typeof upstream, successor: typeof upstream) =>
    harness.sqlite.run(
      `INSERT INTO external_dependency (id, organization_id, predecessor_project_id, successor_project_id, predecessor_work_item_id, predecessor_scope, successor_work_item_id, successor_scope, type) VALUES (?, 'org-a', ?, ?, ?, 'whole', ?, 'whole', 'SS')`,
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
  return { harness, upstream, downstream, tail, unrelated, foreign, foreignTail, events };
}

async function assertProxy(
  harness: OrganizationHarness,
  project: { id: string; rowId: string; stepId: string },
  blocked: boolean,
) {
  const answer = await harness.call(
    'ada',
    'GET',
    `/api/projects/${project.id}/work-items?full=true`,
  );
  expect(answer.status).toBe(200);
  expect(answer.body).toMatchObject({
    workItems: [
      {
        id: project.rowId,
        status: blocked ? 'blocked_by_proxy' : 'unknown',
        nodeReadings: { [project.stepId]: blocked ? 'blocked_by_proxy' : 'unknown' },
      },
    ],
  });
}

it.each([
  [false, false],
  [false, true],
  [true, false],
  [true, true],
])(
  'blocked hold and clear invalidate exactly the changed dependency component (shared=%s, initiallyBlocked=%s)',
  async (shared, initiallyBlocked) => {
    const { harness, upstream, downstream, tail, unrelated, foreign, foreignTail, events } =
      await fixture();
    if (shared) harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    if (initiallyBlocked)
      harness.sqlite.run("UPDATE work_item SET hold='blocked' WHERE id=?", [upstream.rowId]);
    expect(harness.sqlite.query('SELECT * FROM assignment').all()).toEqual([]);
    const relationships = harness.sqlite
      .query('SELECT * FROM external_dependency ORDER BY id')
      .all();
    const revisions = () =>
      harness.sqlite.query('SELECT id,revision FROM project ORDER BY id').all();
    const beforeRevisions = revisions();
    const set = async (status: 'blocked' | 'unknown') => {
      const answer = await harness.call('ada', 'POST', `/api/projects/${upstream.id}/commands`, {
        commands: [{ kind: 'setStatus', workItemId: upstream.rowId, status }],
      });
      expect(answer.status).toBe(200);
    };
    const assertTransition = async (blocked: boolean, count: number) => {
      expect(
        harness.sqlite.query('SELECT hold FROM work_item WHERE id=?').get(upstream.rowId),
      ).toEqual({ hold: blocked ? 'blocked' : null });
      for (const recipient of [downstream, tail]) await assertProxy(harness, recipient, blocked);
      for (const recipient of [downstream, tail]) {
        expect(events(recipient.id)).toEqual(
          Array.from({ length: count }, () => ({
            type: 'elsewhere_changed',
            projectId: recipient.id,
            causeProjectId: upstream.id,
          })),
        );
      }
      for (const silent of [upstream, unrelated, foreign, foreignTail])
        expect(events(silent.id)).toEqual([]);
      expect(harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all()).toEqual(
        relationships,
      );
      expect(revisions()).toEqual(beforeRevisions);
    };
    await assertTransition(initiallyBlocked, 0);
    const first = initiallyBlocked ? 'unknown' : 'blocked';
    const second = initiallyBlocked ? 'blocked' : 'unknown';
    await set(first);
    await assertTransition(!initiallyBlocked, 1);
    await set(first);
    await assertTransition(!initiallyBlocked, 1);
    await set(second);
    await assertTransition(initiallyBlocked, 2);
    await set(second);
    await assertTransition(initiallyBlocked, 2);
  },
);

it.each([false, true])(
  'second-recipient event insert failure rolls back hold, history and publication (shared=%s)',
  async (shared) => {
    let pushes = 0;
    const { harness, upstream, downstream, tail, events } = await fixture(() => {
      pushes++;
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    });
    if (shared) harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const tables = [
      'work_item',
      'step_progress',
      'project',
      'external_dependency',
      'command_journal',
      'plan_event',
      'event_log',
      'event_sequencer',
      'organization_audit',
    ];
    const snapshot = () =>
      tables.map((table) => harness.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = snapshot();
    const beforePushes = pushes;
    harness.sqlite.run(`CREATE TRIGGER reject_second_hold_fanout BEFORE INSERT ON event_log
      WHEN NEW.message LIKE '%elsewhere_changed%' AND
        (SELECT COUNT(*) FROM event_log WHERE message LIKE '%elsewhere_changed%') >= 1
      BEGIN SELECT RAISE(ABORT, 'injected second hold fanout insert failure'); END`);
    const answer = await harness.call('ada', 'POST', `/api/projects/${upstream.id}/commands`, {
      commands: [{ kind: 'setStatus', workItemId: upstream.rowId, status: 'blocked' }],
    });
    expect(answer.status).toBe(500);
    expect(snapshot()).toEqual(before);
    expect(pushes).toBe(beforePushes);
    for (const recipient of [downstream, tail]) {
      expect(events(recipient.id)).toEqual([]);
      await assertProxy(harness, recipient, false);
    }
  },
);

it.each([false, true])(
  'hold undo and redo publish each semantic transition exactly once (shared=%s)',
  async (shared) => {
    const { harness, upstream, downstream, tail, unrelated, foreign, foreignTail, events } =
      await fixture();
    if (shared) harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const relationships = harness.sqlite
      .query('SELECT * FROM external_dependency ORDER BY id')
      .all();
    const route = `/api/projects/${upstream.id}`;
    const assertTransition = async (blocked: boolean, count: number) => {
      expect(
        harness.sqlite.query('SELECT hold FROM work_item WHERE id=?').get(upstream.rowId),
      ).toEqual({ hold: blocked ? 'blocked' : null });
      for (const recipient of [downstream, tail]) await assertProxy(harness, recipient, blocked);
      for (const recipient of [downstream, tail])
        expect(events(recipient.id)).toEqual(
          Array.from({ length: count }, () => ({
            type: 'elsewhere_changed',
            projectId: recipient.id,
            causeProjectId: upstream.id,
          })),
        );
      for (const silent of [upstream, unrelated, foreign, foreignTail])
        expect(events(silent.id)).toEqual([]);
      expect(harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all()).toEqual(
        relationships,
      );
    };
    for (const [status, offset] of [
      ['blocked', 0],
      ['unknown', 3],
    ] as const) {
      const blocked = status === 'blocked';
      const accepted = await harness.call('ada', 'POST', `${route}/commands`, {
        commands: [{ kind: 'setStatus', workItemId: upstream.rowId, status }],
      });
      expect(accepted.status).toBe(200);
      await assertTransition(blocked, offset + 1);
      expect((await harness.call('ada', 'POST', `${route}/undo`)).status).toBe(200);
      await assertTransition(!blocked, offset + 2);
      expect((await harness.call('ada', 'POST', `${route}/redo`)).status).toBe(200);
      await assertTransition(blocked, offset + 3);
    }
  },
);
