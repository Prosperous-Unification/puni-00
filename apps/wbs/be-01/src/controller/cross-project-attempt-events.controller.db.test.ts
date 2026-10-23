import { StepNodeAttemptRepository } from '@wbs/store-sqlite/step-node-attempt';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, expect, it, spyOn } from 'bun:test';

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
      "INSERT INTO work_item (id, project_id, position, name, readiness) VALUES (?, ?, 10, ?, 'ready')",
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
  return { harness, upstream, downstream, tail, foreign, events, connect };
}

// Proof: replacing the captured attempt fingerprint with [] leaves B and C without
// elsewhere_changed rows after A starts, although B becomes startable.
it.each([false, true])(
  'attempt start, end and remove invalidate only the dependency component (shared=%s)',
  async (shared) => {
    const { harness, upstream, downstream, tail, foreign, events } = await fixture();
    if (shared) harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const relationships = harness.sqlite
      .query('SELECT * FROM external_dependency ORDER BY id')
      .all();
    const readStartable = async () => {
      const answer = await harness.call('ada', 'GET', `/api/projects/${downstream.id}/startable`);
      expect(answer.status).toBe(200);
      return (answer.body as { leaves: { workItemId: string }[] }).leaves.some(
        ({ workItemId }) => workItemId === downstream.rowId,
      );
    };
    const command = async (body: object) => {
      const answer = await harness.call('ada', 'POST', `/api/projects/${upstream.id}/commands`, {
        commands: [{ workItemId: upstream.rowId, stepId: upstream.stepId, ...body }],
      });
      expect(answer.status).toBe(200);
    };
    expect(await readStartable()).toBe(false);
    await command({ kind: 'startAttempt' });
    expect(await readStartable()).toBe(true);
    for (const project of [downstream, tail]) expect(events(project.id)).toHaveLength(1);
    await command({ kind: 'endAttempt', outcome: 'failed' });
    expect(await readStartable()).toBe(true);
    for (const project of [downstream, tail]) expect(events(project.id)).toHaveLength(2);
    await command({ kind: 'removeAttempt', attemptNumber: 1 });
    expect(await readStartable()).toBe(false);
    for (const project of [downstream, tail]) expect(events(project.id)).toHaveLength(3);
    expect(events(foreign.id)).toEqual([]);
    expect(harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all()).toEqual(
      relationships,
    );
  },
);

// Proof: forcing the attempt repository read to reject makes the mounted writer
// refuse with 500 and leaves the attempt, journal, and event tables unchanged.
it('an unreadable attempt refuses the command without a durable or published change', async () => {
  const { harness, upstream, downstream, tail, events } = await fixture();
  const tables = ['step_node_attempt', 'event_log', 'event_sequencer', 'command_journal'];
  const before = tables.map((table) =>
    harness.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
  );
  const read = spyOn(StepNodeAttemptRepository.prototype, 'listByProject').mockRejectedValue(
    new Error('injected attempt read failure'),
  );
  try {
    const answer = await harness.call('ada', 'POST', `/api/projects/${upstream.id}/commands`, {
      commands: [{ kind: 'startAttempt', workItemId: upstream.rowId, stepId: upstream.stepId }],
    });
    expect(answer.status).toBe(500);
    expect(
      tables.map((table) => harness.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all()),
    ).toEqual(before);
    expect(events(downstream.id)).toEqual([]);
    expect(events(tail.id)).toEqual([]);
  } finally {
    read.mockRestore();
  }
});

it('a failed attempt command batch rolls back its first start and publishes nothing', async () => {
  const { harness, upstream, downstream, tail, events } = await fixture();
  const answer = await harness.call('ada', 'POST', `/api/projects/${upstream.id}/commands`, {
    commands: [
      { kind: 'startAttempt', workItemId: upstream.rowId, stepId: upstream.stepId },
      { kind: 'startAttempt', workItemId: upstream.rowId, stepId: upstream.stepId },
    ],
  });
  expect(answer.status).toBe(409);
  expect(harness.sqlite.query('SELECT * FROM step_node_attempt').all()).toEqual([]);
  expect(events(downstream.id)).toEqual([]);
  expect(events(tail.id)).toEqual([]);
});
