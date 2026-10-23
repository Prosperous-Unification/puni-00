import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness | undefined;
afterEach(async () => {
  await harness?.closeComposed();
});

it('mounted topology replacement refreshes separate old and new components atomically', async () => {
  let deliveries = 0;
  const opened = OrganizationHarness.openComposedWith({
    // Synthetic authoring exercises the complete writer; release activation remains dormant.
    syntheticExternalCommands: true,
    pushFetch: () => {
      deliveries++;
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    },
  });
  harness = opened;
  seedDependencyAuthority(opened.databasePath());
  await opened.register('ada');
  opened.organization('org-a');
  opened.member('org-a', 'ada', 'member');
  opened.bind('ada', 'org-a');
  opened.activate();
  const create = async (name: string) => {
    const answer = await opened.call('ada', 'POST', '/api/projects', { name });
    expect(answer.status).toBe(200);
    const projectId = (answer.body as { project: { id: string } }).project.id;
    const workItemId = `${projectId}-row`;
    opened.sqlite.run(
      'INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 10, ?)',
      [workItemId, projectId, name],
    );
    return { projectId, workItemId, scope: 'whole' as const };
  };
  const oldSource = await create('Old source');
  const owner = await create('Owner');
  const tail = await create('Tail');
  const newSource = await create('New source');
  const unrelated = await create('Unrelated');
  opened.organization('org-b');
  opened.member('org-b', 'ada', 'member');
  opened.bind('ada', 'org-b');
  const foreign = await create('Protected foreign name');
  const foreignTail = await create('Protected foreign tail');
  const connect = (
    id: string,
    organizationId: string,
    predecessor: typeof owner,
    successor: typeof owner,
  ) =>
    opened.sqlite.run(
      `INSERT INTO external_dependency (id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES (?,?,?,?,?,'whole',?,'whole','FS')`,
      [
        id,
        organizationId,
        predecessor.projectId,
        successor.projectId,
        predecessor.workItemId,
        successor.workItemId,
      ],
    );
  connect('protected', 'org-b', foreign, foreignTail);
  opened.bind('ada', 'org-a');
  connect('replaced', 'org-a', oldSource, owner);
  connect('retained', 'org-a', owner, tail);
  const route = `/api/projects/${owner.projectId}/commands`;
  const replacement = {
    kind: 'updateTypedDependency',
    dependencyId: 'replaced',
    predecessor: newSource,
    successor: owner,
    type: 'FS',
  };
  const tables = [
    'external_dependency',
    'work_item',
    'project',
    'command_journal',
    'plan_event',
    'event_log',
    'event_sequencer',
  ];
  const snapshot = () =>
    tables.map((table) => opened.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
  const before = snapshot();
  const sent = deliveries;
  const refused = await opened.call('ada', 'POST', route, {
    commands: [
      replacement,
      { kind: 'patchWorkItem', workItemId: 'absent', patch: { name: 'Refused' } },
    ],
  });
  expect(refused.status).toBe(404);
  expect(snapshot()).toEqual(before);
  expect(deliveries).toBe(sent);
  const preserved = opened.sqlite
    .query("SELECT * FROM external_dependency WHERE id!='replaced' ORDER BY id")
    .all();
  const revisions = () => opened.sqlite.query('SELECT id,revision FROM project ORDER BY id').all();
  const priorRevisions = revisions();
  const events = () =>
    opened.sqlite
      .query<{ subscription: string; seq: number; message: string }, []>(
        "SELECT subscription,seq,message FROM event_log WHERE message LIKE '%elsewhere_changed%' ORDER BY subscription,seq",
      )
      .all();
  expect(events()).toEqual([]);
  const heads = new Map<string, number>(
    [oldSource, owner, tail, newSource].map(({ projectId }) => {
      const latest = opened.sqlite
        .query<{ seq: number }, [string]>(
          'SELECT seq FROM event_log WHERE subscription=? ORDER BY seq DESC LIMIT 1',
        )
        .get(`project:${projectId}`);
      return [`project:${projectId}`, latest?.seq ?? -1] as const;
    }),
  );
  const accepted = await opened.call('ada', 'POST', route, { commands: [replacement] });
  expect(accepted.status).toBe(200);
  const changed = events();
  const pairs = changed.map(
    ({ message }) =>
      JSON.parse(message) as { type: string; projectId: string; causeProjectId: string },
  );
  const expected = new Map<string, { type: string; projectId: string; causeProjectId: string }>();
  for (const component of [
    [oldSource, owner, tail],
    [newSource, owner, tail],
  ])
    for (const recipient of component)
      for (const cause of component)
        if (recipient !== cause) {
          const event = {
            type: 'elsewhere_changed',
            projectId: recipient.projectId,
            causeProjectId: cause.projectId,
          };
          expected.set(`${event.projectId}:${event.causeProjectId}`, event);
        }
  const sort = (
    left: { projectId: string; causeProjectId: string },
    right: { projectId: string; causeProjectId: string },
  ) =>
    left.projectId.localeCompare(right.projectId) ||
    left.causeProjectId.localeCompare(right.causeProjectId);
  // Proof: dropping before or after traversal lost four pairs independently;
  // traversing their union invented the two old-source/new-source pairs.
  expect(pairs.sort(sort)).toEqual([...expected.values()].sort(sort));
  for (const { subscription, seq } of changed) {
    const prior = heads.get(subscription);
    if (prior === undefined) throw new Error('unexpected topology event subscription');
    expect(seq).toBeGreaterThan(prior);
    heads.set(subscription, seq);
  }
  expect(
    changed.some(({ subscription }) =>
      [unrelated, foreign, foreignTail].some(
        ({ projectId }) => subscription === `project:${projectId}`,
      ),
    ),
  ).toBe(false);
  expect(JSON.stringify(changed)).not.toContain('Protected foreign');
  expect(
    opened.sqlite.query("SELECT * FROM external_dependency WHERE id!='replaced' ORDER BY id").all(),
  ).toEqual(preserved);
  expect(revisions()).toEqual(priorRevisions);
  expect(deliveries).toBeGreaterThan(sent);
  expect(
    opened.sqlite
      .query(
        'SELECT predecessor_project_id,successor_project_id FROM external_dependency WHERE id=?',
      )
      .get('replaced'),
  ).toEqual({ predecessor_project_id: newSource.projectId, successor_project_id: owner.projectId });
});
