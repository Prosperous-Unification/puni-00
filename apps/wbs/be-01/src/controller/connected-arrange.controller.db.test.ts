import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;
let target: string;
let predecessor: string;
let targetStep: string;
let predecessorStep: string;
beforeEach(async () => {
  harness = OrganizationHarness.openComposedWith({ withOptimizer: true, solverVersion: '0.4.0' });
  await harness.register('ada');
  harness.organization('arrange-org');
  harness.member('arrange-org', 'ada', 'admin');
  harness.bind('ada', 'arrange-org');
  harness.activate();
  seedDependencyAuthority(harness.databasePath());
  const create = async (name: string) => {
    const answer = await harness.call('ada', 'POST', '/api/projects', { name });
    expect(answer.status).toBe(200);
    return answer.body as { project: { id: string }; steps: { id: string }[] };
  };
  const first = await create('Target');
  const second = await create('Predecessor');
  target = first.project.id;
  predecessor = second.project.id;
  targetStep = first.steps[0].id;
  predecessorStep = second.steps[0].id;
  harness.sqlite.run("UPDATE project SET start_date='2026-10-05'");
  for (const [id, project, step, position] of [
    ['late', target, targetStep, 10],
    ['z-held', target, targetStep, 20],
    ['early', target, targetStep, 30],
    ['remote', predecessor, predecessorStep, 10],
  ] as const) {
    harness.sqlite.run('INSERT INTO work_item (id,project_id,position,name) VALUES (?,?,?,?)', [
      id,
      project,
      position,
      id,
    ]);
    harness.sqlite.run(
      'INSERT INTO estimate (work_item_id,step_id,optimistic,realistic,pessimistic) VALUES (?,?,1,1,1)',
      [id, step],
    );
  }
  harness.sqlite.run("UPDATE work_item SET hold='on_hold' WHERE id='z-held'");
  harness.sqlite.run(
    "INSERT INTO external_dependency (id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,predecessor_step_id,successor_step_id,type) VALUES ('wait','arrange-org',?,?,'remote','late','node','node',?,?,'FS')",
    [predecessor, target, predecessorStep, targetStep],
  );
});
afterEach(async () => {
  await harness.closeComposed();
});
const arrange = () =>
  harness.call('ada', 'POST', `/api/projects/${target}/commands`, {
    commands: [{ kind: 'arrangeBySchedule' }],
  });
const positions = () =>
  harness.sqlite.query('SELECT id,project_id,position FROM work_item ORDER BY id').all();
const order = () =>
  harness.sqlite.query('SELECT id FROM work_item WHERE project_id=? ORDER BY position').all(target);
const journal = () => harness.sqlite.query('SELECT * FROM command_journal').all();
const state = () =>
  Object.fromEntries(
    ['work_item', 'project', 'command_journal', 'plan_event', 'event_log', 'event_sequencer'].map(
      (table) => [table, harness.sqlite.query(`SELECT * FROM ${table}`).all()],
    ),
  );

test('connected arrangement uses final captured foreign dates, leaves held and foreign rows, and replays stored positions', async () => {
  const tree = await harness.call('ada', 'GET', `/api/projects/${target}/work-items`);
  expect(tree.status).toBe(200);
  expect(tree.body).toMatchObject({
    workItems: [
      { id: 'late', schedule: { earliestStart: 1 } },
      { id: 'z-held', schedule: null },
      { id: 'early', schedule: { earliestStart: 0 } },
    ],
  });
  const before = positions();
  const histories = journal().length;
  expect(await arrange()).toMatchObject({ status: 200 });
  expect(order()).toEqual([{ id: 'early' }, { id: 'z-held' }, { id: 'late' }]);
  expect(positions().find((row) => (row as { id: string }).id === 'remote')).toEqual(
    before.find((row) => (row as { id: string }).id === 'remote'),
  );
  expect(journal()).toHaveLength(histories + 1);
  const arranged = state();
  expect(await arrange()).toMatchObject({ status: 200 });
  expect(state()).toEqual(arranged);
  expect(await harness.call('ada', 'POST', `/api/projects/${target}/undo`)).toMatchObject({
    status: 200,
  });
  expect(positions()).toEqual(before);
  expect(await harness.call('ada', 'POST', `/api/projects/${target}/redo`)).toMatchObject({
    status: 200,
  });
  expect(order()).toEqual([{ id: 'early' }, { id: 'z-held' }, { id: 'late' }]);
});

test.each(['target', 'foreign'])(
  'connected arrangement refuses missing %s calendar atomically',
  async (missing) => {
    harness.sqlite.run('UPDATE project SET start_date=NULL WHERE id=?', [
      missing === 'target' ? target : predecessor,
    ]);
    const before = state();
    expect(await arrange()).toMatchObject({
      status: 409,
      body: { error: 'dependency_calendar_missing', kind: 'arrangeBySchedule', at: 0 },
    });
    expect(state()).toEqual(before);
  },
);

test('connected selected optimized pending arrangement refuses without admission or writes', async () => {
  harness.sqlite.run(
    "UPDATE project SET schedule_engine='optimized',optimization_enabled=1 WHERE id=?",
    [target],
  );
  const before = state();
  expect(await arrange()).toMatchObject({ status: 409, body: { error: 'schedule_not_ready' } });
  expect(state()).toEqual(before);
  expect(harness.sqlite.query('SELECT * FROM solver_queue').all()).toEqual([]);
});

test('missing calendar rolls back an earlier collected edit', async () => {
  harness.sqlite.run('UPDATE project SET start_date=NULL WHERE id=?', [predecessor]);
  const before = state();
  expect(
    await harness.call('ada', 'POST', `/api/projects/${target}/commands`, {
      commands: [
        { kind: 'patchWorkItem', workItemId: 'early', patch: { name: 'Changed' } },
        { kind: 'arrangeBySchedule' },
      ],
    }),
  ).toMatchObject({ status: 409, body: { error: 'dependency_calendar_missing', at: 1 } });
  expect(state()).toEqual(before);
});

test('connected arrangement refuses a cycle atomically', async () => {
  harness.sqlite.run(
    "INSERT INTO external_dependency (id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('cycle','arrange-org',?,?,'late','remote','whole','whole','FS')",
    [target, predecessor],
  );
  const before = state();
  expect(await arrange()).toMatchObject({ status: 409, body: { error: 'cycle' } });
  expect(state()).toEqual(before);
});

test('shared connected arrangement honors foreign people without moving a held sibling', async () => {
  harness.sqlite.run("UPDATE external_dependency SET type='SS' WHERE id='wait'");
  const principalId = harness.userId('ada');
  harness.sqlite.run('DELETE FROM project_rank');
  harness.sqlite.run(
    "INSERT INTO project_rank (project_id,organization_id,position,created_at,created_by) VALUES (?,'arrange-org',0,1,?),(?,'arrange-org',1,1,?)",
    [predecessor, principalId, target, principalId],
  );

  harness.sqlite.run("INSERT INTO person (id,name) VALUES ('ana','Ana')");
  harness.sqlite.run(
    "INSERT INTO person_organization (resource_id,organization_id,name) VALUES ('ana','arrange-org','Ana')",
  );
  harness.sqlite.run(
    "INSERT INTO assignment (work_item_id,step_id,person_id) VALUES ('late',?,'ana'),('remote',?,'ana')",
    [targetStep, predecessorStep],
  );
  harness.sqlite.run("UPDATE organization SET shared_people=1 WHERE id='arrange-org'");
  expect(await arrange()).toMatchObject({ status: 200 });
  expect(order()).toEqual([{ id: 'early' }, { id: 'z-held' }, { id: 'late' }]);
});

test.each([
  [100, 200, 300],
  [10.25, 20.5, 30.75],
  [10, 20, 30],
])('connected arrangement preserves held slots at %j', async (late, held, early) => {
  for (const [id, position] of [
    ['late', late],
    ['z-held', held],
    ['early', early],
  ] as const)
    harness.sqlite.run('UPDATE work_item SET position=? WHERE id=?', [position, id]);
  const heldBefore = harness.sqlite
    .query("SELECT position,revision FROM work_item WHERE id='z-held'")
    .get();
  const before = positions();
  const readOrder = async () => {
    const answer = await harness.call('ada', 'GET', `/api/projects/${target}/work-items`);
    expect(answer.status).toBe(200);
    return (answer.body as { workItems: { id: string }[] }).workItems.map((row) => row.id);
  };
  expect(await readOrder()).toEqual(['late', 'z-held', 'early']);
  expect(await arrange()).toMatchObject({ status: 200 });
  expect(await readOrder()).toEqual(['early', 'z-held', 'late']);
  expect(
    harness.sqlite.query("SELECT position,revision FROM work_item WHERE id='z-held'").get(),
  ).toEqual(heldBefore);
  expect(
    harness.sqlite
      .query('SELECT id,position FROM work_item WHERE project_id=? ORDER BY position,id')
      .all(target),
  ).toEqual([
    { id: 'early', position: late },
    { id: 'z-held', position: held },
    { id: 'late', position: early },
  ]);
  const arranged = state();
  expect(await arrange()).toMatchObject({ status: 200 });
  expect(state()).toEqual(arranged);
  expect(await harness.call('ada', 'POST', `/api/projects/${target}/undo`)).toMatchObject({
    status: 200,
  });
  expect(positions()).toEqual(before);
  expect(await readOrder()).toEqual(['late', 'z-held', 'early']);
  expect(await harness.call('ada', 'POST', `/api/projects/${target}/redo`)).toMatchObject({
    status: 200,
  });
  expect(await readOrder()).toEqual(['early', 'z-held', 'late']);
  expect(
    harness.sqlite.query("SELECT position,revision FROM work_item WHERE id='z-held'").get(),
  ).toEqual(heldBefore);
});

test('connected arrangement allocates valid duplicate slots around an immutable held anchor', async () => {
  harness.sqlite.run("UPDATE work_item SET position=0 WHERE id='z-held'");
  harness.sqlite.run("UPDATE work_item SET position=10 WHERE id IN ('early','late')");
  harness.sqlite.run(
    "UPDATE external_dependency SET successor_work_item_id='early' WHERE id='wait'",
  );
  const heldBefore = harness.sqlite
    .query("SELECT position,revision FROM work_item WHERE id='z-held'")
    .get();
  expect(await arrange()).toMatchObject({ status: 200 });
  const read = await harness.call('ada', 'GET', `/api/projects/${target}/work-items`);
  expect((read.body as { workItems: { id: string }[] }).workItems.map((row) => row.id)).toEqual([
    'z-held',
    'late',
    'early',
  ]);
  expect(
    harness.sqlite.query("SELECT position,revision FROM work_item WHERE id='z-held'").get(),
  ).toEqual(heldBefore);
  const placed = harness.sqlite
    .query<{ position: number }, [string]>('SELECT position FROM work_item WHERE project_id=?')
    .all(target);
  expect(placed.every((row) => Number.isFinite(row.position))).toBe(true);
  const arranged = state();
  expect(await arrange()).toMatchObject({ status: 200 });
  expect(state()).toEqual(arranged);
});

test('connected arrangement refuses an impossible order between equal held anchors without any write', async () => {
  harness.sqlite.run('DELETE FROM external_dependency');
  harness.sqlite.run(
    'DELETE FROM estimate WHERE work_item_id IN (SELECT id FROM work_item WHERE project_id=?)',
    [target],
  );
  harness.sqlite.run('DELETE FROM work_item WHERE project_id=?', [target]);
  for (const [id, position, hold] of [
    ['z-late', 10, null],
    ['k-held', 20, 'on_hold'],
    ['l-early', 20, null],
    ['m-held', 20, 'on_hold'],
  ] as const) {
    harness.sqlite.run(
      'INSERT INTO work_item (id,project_id,position,name,hold) VALUES (?,?,?,?,?)',
      [id, target, position, id, hold],
    );
    harness.sqlite.run(
      'INSERT INTO estimate (work_item_id,step_id,optimistic,realistic,pessimistic) VALUES (?,?,1,1,1)',
      [id, targetStep],
    );
  }
  harness.sqlite.run(
    "INSERT INTO external_dependency (id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('wait','arrange-org',?,?,'remote','z-late','whole','whole','FS')",
    [predecessor, target],
  );
  const before = state();
  expect(await arrange()).toMatchObject({
    status: 409,
    body: { error: 'arrangement_positions_unavailable', at: 0, kind: 'arrangeBySchedule' },
  });
  expect(state()).toEqual(before);
  expect(
    await harness.call('ada', 'POST', `/api/projects/${target}/commands`, {
      commands: [
        { kind: 'patchWorkItem', workItemId: 'l-early', patch: { name: 'Uncommitted' } },
        { kind: 'arrangeBySchedule' },
      ],
    }),
  ).toMatchObject({ status: 409, body: { error: 'arrangement_positions_unavailable', at: 1 } });
  expect(state()).toEqual(before);
});
