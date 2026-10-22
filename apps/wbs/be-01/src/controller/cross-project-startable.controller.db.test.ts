import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;
let target: string;
let predecessor: string;
let targetStep: string;
let predecessorStep: string;
beforeEach(async () => {
  harness = OrganizationHarness.openComposed();
  await harness.register('ada');
  harness.organization('execution-org');
  harness.member('execution-org', 'ada', 'admin');
  harness.bind('ada', 'execution-org');
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
  for (const [id, project] of [
    ['target-leaf', target],
    ['predecessor-leaf', predecessor],
  ])
    harness.sqlite.run(
      "INSERT INTO work_item (id,project_id,position,name,readiness) VALUES (?,?,0,?,'ready')",
      [id, project, id],
    );
  harness.sqlite.run("INSERT INTO person (id,name) VALUES ('executor','Executor')");
  harness.sqlite.run(
    "INSERT INTO person_organization (resource_id,organization_id,name) VALUES ('executor','execution-org','Executor')",
  );
  harness.sqlite.run(
    "INSERT INTO external_dependency (id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,predecessor_step_id,successor_step_id,type) VALUES ('prerequisite','execution-org',?,?,'predecessor-leaf','target-leaf','node','node',?,?,'FS')",
    [predecessor, target, predecessorStep, targetStep],
  );
});
afterEach(() => {
  harness.close();
});
const startable = () => harness.call('ada', 'GET', `/api/projects/${target}/startable`);
const claim = () =>
  harness.call('ada', 'POST', `/api/projects/${target}/commands`, {
    commands: [
      {
        kind: 'claimWorkItem',
        workItemId: 'target-leaf',
        personId: 'executor',
        steps: [targetStep],
      },
    ],
  });

test('remote unfinished FS is excluded from startable and refused by claim until completion', async () => {
  const before = await startable();
  expect(before.status).toBe(200);
  expect((before.body as { leaves: unknown[] }).leaves).toEqual([]);
  const refused = await claim();
  expect(refused).toMatchObject({ status: 409 });
  expect(refused.body).toMatchObject({
    error: 'prerequisites_unmet',
    at: 0,
    kind: 'claimWorkItem',
    stepIds: [targetStep],
  });
  expect(harness.sqlite.query('SELECT id FROM claim').all()).toEqual([]);
  harness.sqlite.run(
    "INSERT INTO step_progress (work_item_id,step_id,state,stated_at) VALUES ('predecessor-leaf',?,'done',1)",
    [predecessorStep],
  );
  const after = await startable();
  expect((after.body as { leaves: { stepIds: string[] }[] }).leaves).toMatchObject([
    { stepIds: [targetStep] },
  ]);
});

test('FF permits start and exposes the unmet finish prerequisite in the startable response', async () => {
  harness.sqlite.run("UPDATE external_dependency SET type='FF' WHERE id='prerequisite'");
  const answer = await startable();
  expect(answer.status).toBe(200);
  expect((answer.body as { leaves: { stepIds: string[] }[] }).leaves).toMatchObject([
    { stepIds: [targetStep] },
  ]);
  expect(
    (answer.body as { prerequisites: { stepId: string }[] }).prerequisites.find(
      (step) => step.stepId === targetStep,
    ),
  ).toMatchObject({
    workItemId: 'target-leaf',
    stepId: targetStep,
    canStart: true,
    canFinish: false,
    finishBlockers: [
      {
        workItemId: 'predecessor-leaf',
        stepId: predecessorStep,
        type: 'FF',
        provenance: 'authored',
        relationshipId: 'prerequisite',
      },
    ],
  });
});

function makeLocal() {
  harness.sqlite.run("DELETE FROM external_dependency WHERE id='prerequisite'");
  harness.sqlite.run("UPDATE work_item SET project_id=? WHERE id='predecessor-leaf'", [target]);
  harness.sqlite.run(
    "INSERT INTO typed_dependency (id,project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,predecessor_step_id,successor_step_id,type) VALUES ('local-prerequisite',?,'predecessor-leaf','target-leaf','node','node',?,?,'FS')",
    [target, targetStep, targetStep],
  );
}

test('local claim redo reevaluates prerequisites after undo instead of replaying a new start', async () => {
  makeLocal();
  harness.sqlite.run(
    "INSERT INTO step_progress (work_item_id,step_id,state,stated_at) VALUES ('predecessor-leaf',?,'done',1)",
    [targetStep],
  );
  expect((await claim()).status).toBe(200);
  expect((await harness.call('ada', 'POST', `/api/projects/${target}/undo`)).status).toBe(200);
  harness.sqlite.run("DELETE FROM step_progress WHERE work_item_id='predecessor-leaf'");
  const replayed = await harness.call('ada', 'POST', `/api/projects/${target}/redo`);
  expect(replayed.status).toBe(409);
  expect(replayed.body).toMatchObject({ error: 'stale_undo' });
  expect(harness.sqlite.query('SELECT id FROM claim').all()).toEqual([]);
  expect(
    harness.sqlite
      .query("SELECT step_id FROM step_progress WHERE work_item_id='target-leaf'")
      .all(),
  ).toEqual([]);
});

test('SS observes ended unsuccessful attempts while unknown prerequisites refuse atomically', async () => {
  harness.sqlite.run("UPDATE external_dependency SET type='SS' WHERE id='prerequisite'");
  const before = captureState();
  expect((await claim()).status).toBe(409);
  expect(captureState()).toEqual(before);
  harness.sqlite.run(
    "INSERT INTO step_node_attempt (work_item_id,step_id,attempt_number,started_at,ended_at,outcome) VALUES ('predecessor-leaf',?,1,1,2,'failed')",
    [predecessorStep],
  );
  expect(((await startable()).body as { leaves: { stepIds: string[] }[] }).leaves).toMatchObject([
    { stepIds: [targetStep] },
  ]);
});

function captureState() {
  return Object.fromEntries(
    [
      'claim',
      'claim_occupancy',
      'step_progress',
      'assignment',
      'command_journal',
      'project',
      'event_log',
      'event_sequencer',
    ].map((table) => [table, harness.sqlite.query(`SELECT * FROM ${table}`).all()]),
  );
}

test('local all-step claims keep atomic meaning while explicit first-step claims and release undo preserve history', async () => {
  harness.sqlite.run("DELETE FROM external_dependency WHERE id='prerequisite'");
  const all = await harness.call('ada', 'POST', `/api/projects/${target}/commands`, {
    commands: [{ kind: 'claimWorkItem', workItemId: 'target-leaf', personId: 'executor' }],
  });
  expect(all).toMatchObject({ status: 409, body: { error: 'prerequisites_unmet' } });
  expect(harness.sqlite.query('SELECT id FROM claim').all()).toEqual([]);
  expect((await claim()).status).toBe(200);
  const recorded = harness.sqlite
    .query('SELECT id,work_item_id,step_id,person_id,run_id,parent_claim_id,created_by FROM claim')
    .all();
  expect(
    (
      await harness.call('ada', 'POST', `/api/projects/${target}/commands`, {
        commands: [{ kind: 'releaseWorkItem', workItemId: 'target-leaf', personId: 'executor' }],
      })
    ).status,
  ).toBe(200);
  expect((await harness.call('ada', 'POST', `/api/projects/${target}/undo`)).status).toBe(200);
  expect(
    harness.sqlite
      .query(
        'SELECT id,work_item_id,step_id,person_id,run_id,parent_claim_id,created_by FROM claim',
      )
      .all(),
  ).toEqual(recorded);
});

test('manual progress and historical attempts remain observations with unmet local prerequisites', async () => {
  makeLocal();
  const commands = [
    { kind: 'startAttempt', workItemId: 'target-leaf', stepId: targetStep, at: 1 },
    { kind: 'setProgress', workItemId: 'target-leaf', stepId: targetStep, state: 'in_progress' },
  ];
  expect(
    (await harness.call('ada', 'POST', `/api/projects/${target}/commands`, { commands })).status,
  ).toBe(200);
  expect((await claim()).status).toBe(200);
  expect((await startable()).body).toMatchObject({
    claimed: [{ workItemId: 'target-leaf', stepId: targetStep }],
  });
});
