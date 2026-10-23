import { readdirSync, readlinkSync } from 'node:fs';

import type { StartableWork } from '@wbs/core/module/work-item/startable';
import { openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { ProjectRepository } from '@wbs/store-sqlite/project';
import { StepNodeAttemptRepository } from '@wbs/store-sqlite/step-node-attempt';
import { StepProgressRepository } from '@wbs/store-sqlite/step-progress';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;
let target: string;
let predecessor: string;
let targetStep: string;
let predecessorStep: string;
let publications: string[];
let observedAttemptProjects: Set<string>;
beforeEach(async () => {
  publications = [];
  observedAttemptProjects = new Set();
  harness = OrganizationHarness.openComposedWith({
    openReadOnlyConnection: (path) =>
      openReadOnlyConnection(path, {
        logQuery(query, parameters) {
          if (!query.includes('from "step_node_attempt"')) return;
          for (const parameter of parameters)
            if (typeof parameter === 'string') observedAttemptProjects.add(parameter);
        },
      }),
    pushFetch: (url) => {
      publications.push(url);
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    },
  });
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
afterEach(async () => {
  const path = harness.databasePath();
  // Proof: the old close() left six deleted DB/WAL/SHM descriptors (task-6-3-admission/teardown-red.log).
  await harness.closeComposed();
  if (process.platform === 'linux') expect(readDatabaseDescriptors(path)).toEqual([]);
});
const startable = () => harness.call('ada', 'GET', `/api/projects/${target}/startable`);
const claim = (steps: string[] = [targetStep]) =>
  harness.call('ada', 'POST', `/api/projects/${target}/commands`, {
    commands: [
      {
        kind: 'claimWorkItem',
        workItemId: 'target-leaf',
        personId: 'executor',
        steps,
      },
    ],
  });

// Proof: removing execution-read external edges advertised the unfinished successor (task-6-3-evidence/external-edge-fault.log).
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

// Proof: removing actual-attempt evidence kept the ended failed SS predecessor blocked (task-6-3-evidence/attempt-fault.log).
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
    harness.sqlite
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map(({ name }) => [
        name,
        harness.sqlite.query(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all(),
      ]),
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

/** Linux witness for live and deleted SQLite descriptors retained after fixture shutdown. */
function readDatabaseDescriptors(path: string): string[] {
  return readdirSync('/proc/self/fd').flatMap((descriptor) => {
    let target: string;
    try {
      target = readlinkSync(`/proc/self/fd/${descriptor}`);
    } catch (failure) {
      // Enumerating /proc opens a directory descriptor that can close before readlink.
      if (failure instanceof Error && 'code' in failure && failure.code === 'ENOENT') return [];
      throw failure;
    }
    return target.startsWith(path) ? [target] : [];
  });
}

function setMode(mode: 'isolated' | 'shared') {
  harness.sqlite.run('UPDATE organization SET shared_people=? WHERE id=?', [
    mode === 'shared' ? 1 : 0,
    'execution-org',
  ]);
}

function recordCompletion() {
  harness.sqlite.run(
    "INSERT INTO step_progress (work_item_id,step_id,state,stated_at) VALUES ('predecessor-leaf',?,'done',1)",
    [predecessorStep],
  );
}

async function assertRefusal(act: () => Promise<{ status: number; body: unknown }>) {
  const before = captureState();
  publications.length = 0;
  const answer = await act();
  expect(answer.status).toBe(409);
  expect(captureState()).toEqual(before);
  expect(publications).toEqual([]);
  return answer;
}

async function assertAcceptedClaim() {
  publications.length = 0;
  expect((await claim()).status).toBe(200);
  expect(publications.length).toBeGreaterThan(0);
  expect(harness.sqlite.query('SELECT work_item_id,step_id,person_id FROM claim').all()).toEqual([
    { work_item_id: 'target-leaf', step_id: targetStep, person_id: 'executor' },
  ]);
  expect(
    harness.sqlite
      .query("SELECT step_id,state FROM step_progress WHERE work_item_id='target-leaf'")
      .all(),
  ).toEqual([{ step_id: targetStep, state: 'in_progress' }]);
}

// Proof: replacing the production FS done predicate with false made all four local/remote
// FS advertised-permission cases report canStart=true (task-6-3-execution-predicates/fs-fault.log).
// Proof: replacing the production SS started-or-done predicate with false made all four
// local/remote SS cases report canStart=true (task-6-3-execution-predicates/ss-fault.log).
for (const mode of ['isolated', 'shared'] as const) {
  for (const type of ['FS', 'SS', 'FF'] as const) {
    test(`${mode} local ${type} advertised permission matches governed claim`, async () => {
      setMode(mode);
      makeLocal();
      predecessorStep = targetStep;
      harness.sqlite.run("UPDATE typed_dependency SET type=? WHERE id='local-prerequisite'", [
        type,
      ]);
      const answer = await startable();
      expect(answer.status).toBe(200);
      const reading = answer.body as StartableWork;
      expect(
        reading.prerequisites.find(
          (step) => step.workItemId === 'target-leaf' && step.stepId === targetStep,
        ),
      ).toMatchObject({
        canStart: type === 'FF',
        canFinish: type !== 'FF',
      });
      const leaf = reading.leaves.find((leaf) => leaf.workItemId === 'target-leaf');
      if (type === 'FF') expect(leaf?.stepIds).toEqual([targetStep]);
      else expect(leaf).toBeUndefined();
      if (type !== 'FF') {
        await assertRefusal(() => claim());
        if (type === 'FS') recordCompletion();
        else
          harness.sqlite.run(
            "INSERT INTO step_node_attempt (work_item_id,step_id,attempt_number,started_at,ended_at,outcome) VALUES ('predecessor-leaf',?,1,1,2,'failed')",
            [predecessorStep],
          );
      }
      await assertAcceptedClaim();
    });
  }

  // Proof: bypassing the startable filter or new-start admission independently fails this mounted matrix (task-6-3-admission/*-fault.log).
  for (const type of ['FS', 'SS', 'FF'] as const) {
    test(`${mode} remote ${type} advertised permission matches governed claim`, async () => {
      setMode(mode);
      harness.sqlite.run("UPDATE external_dependency SET type=? WHERE id='prerequisite'", [type]);
      const before = await startable();
      expect(before.status).toBe(200);
      const reading = before.body as StartableWork;
      expect(
        reading.prerequisites.find(
          (step) => step.workItemId === 'target-leaf' && step.stepId === targetStep,
        ),
      ).toEqual({
        workItemId: 'target-leaf',
        stepId: targetStep,
        started: false,
        canStart: type === 'FF',
        canFinish: type !== 'FF',
        startBlockers:
          type === 'FF'
            ? []
            : [
                {
                  workItemId: 'predecessor-leaf',
                  stepId: predecessorStep,
                  type,
                  provenance: 'authored',
                  relationshipId: 'prerequisite',
                },
              ],
        finishBlockers:
          type === 'FF'
            ? [
                {
                  workItemId: 'predecessor-leaf',
                  stepId: predecessorStep,
                  type,
                  provenance: 'authored',
                  relationshipId: 'prerequisite',
                },
              ]
            : [],
      });
      expect(reading.leaves.map(({ workItemId, stepIds }) => ({ workItemId, stepIds }))).toEqual(
        type === 'FF' ? [{ workItemId: 'target-leaf', stepIds: [targetStep] }] : [],
      );
      if (type !== 'FF') {
        expect(await assertRefusal(() => claim())).toMatchObject({
          body: { error: 'prerequisites_unmet', stepIds: [targetStep] },
        });
        if (type === 'FS') recordCompletion();
        else
          harness.sqlite.run(
            "INSERT INTO step_node_attempt (work_item_id,step_id,attempt_number,started_at,ended_at,outcome) VALUES ('predecessor-leaf',?,1,1,2,'failed')",
            [predecessorStep],
          );
        expect((await startable()).body).toMatchObject({
          leaves: [{ workItemId: 'target-leaf', stepIds: [targetStep] }],
        });
      }
      await assertAcceptedClaim();
    });
  }

  test(`${mode} mixed permitted and blocked steps refuse omitted and explicit selection atomically`, async () => {
    setMode(mode);
    recordCompletion();
    const second = harness.sqlite
      .query<{ id: string }, [string]>(
        'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1 OFFSET 1',
      )
      .get(target);
    if (second === null) throw new Error('fixture second step missing');
    expect((await startable()).body).toMatchObject({
      leaves: [{ workItemId: 'target-leaf', stepIds: [targetStep] }],
    });
    for (const steps of [undefined, [targetStep, second.id]]) {
      const answer = await assertRefusal(() =>
        harness.call('ada', 'POST', `/api/projects/${target}/commands`, {
          commands: [
            { kind: 'patchWorkItem', workItemId: 'target-leaf', patch: { name: 'Must roll back' } },
            {
              kind: 'claimWorkItem',
              workItemId: 'target-leaf',
              personId: 'executor',
              ...(steps === undefined ? {} : { steps }),
            },
          ],
        }),
      );
      expect(answer.body).toMatchObject({
        error: 'prerequisites_unmet',
        at: 1,
        kind: 'claimWorkItem',
      });
    }
    await assertAcceptedClaim();
  });

  // Proof: bypassing the replay predicate admits the remote redo after upstream completion removal (task-6-3-admission/replay-fault.log).
  test(`${mode} remote redo revalidates upstream evidence while continuation and release undo retain history`, async () => {
    setMode(mode);
    recordCompletion();
    await assertAcceptedClaim();
    expect((await harness.call('ada', 'POST', `/api/projects/${target}/undo`)).status).toBe(200);
    harness.sqlite.run("DELETE FROM step_progress WHERE work_item_id='predecessor-leaf'");
    const before = captureState();
    expect(harness.sqlite.query('SELECT id FROM command_journal').all()).toHaveLength(1);
    publications.length = 0;
    expect(await harness.call('ada', 'POST', `/api/projects/${target}/redo`)).toMatchObject({
      status: 409,
      body: { error: 'stale_undo' },
    });
    // Stale history is explicitly discarded by the existing afterRollback repair.
    expect(captureState()).toEqual({ ...before, command_journal: [] });
    expect(publications).toEqual([]);
    recordCompletion();
    await assertAcceptedClaim();
    harness.sqlite.run("DELETE FROM step_progress WHERE work_item_id='predecessor-leaf'");
    expect((await startable()).body).toMatchObject({
      claimed: [{ workItemId: 'target-leaf', stepId: targetStep }],
    });
    const identity = harness.sqlite
      .query(
        'SELECT id,work_item_id,step_id,person_id,run_id,parent_claim_id,created_by FROM claim',
      )
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
    ).toEqual(identity);
    // A manual actual statement establishes continuation despite the now-unsatisfied remote prerequisite.
    expect(
      (
        await harness.call('ada', 'POST', `/api/projects/${target}/commands`, {
          commands: [
            { kind: 'releaseWorkItem', workItemId: 'target-leaf', personId: 'executor' },
            {
              kind: 'setProgress',
              workItemId: 'target-leaf',
              stepId: targetStep,
              state: 'in_progress',
            },
          ],
        })
      ).status,
    ).toBe(200);
    await assertAcceptedClaim();
  });

  // Proof: omitting one expanded external predecessor pair falsely advertises the target (task-6-3-admission/expanded-pair-fault.log).
  test(`${mode} whole remote predecessor requires every expanded leaf pair`, async () => {
    setMode(mode);
    harness.sqlite.run(
      "INSERT INTO work_item (id,project_id,position,name,readiness) VALUES ('remote-branch',?,0,'Branch',NULL)",
      [predecessor],
    );
    harness.sqlite.run(
      "UPDATE work_item SET parent_id='remote-branch' WHERE id='predecessor-leaf'",
    );
    harness.sqlite.run(
      "INSERT INTO work_item (id,project_id,parent_id,position,name,readiness) VALUES ('remote-second',?,'remote-branch',1,'Second','ready')",
      [predecessor],
    );
    // Keep one step in the predecessor project so this relationship expands to exactly two leaf pairs.
    harness.sqlite.run('DELETE FROM step WHERE project_id=? AND id<>?', [
      predecessor,
      predecessorStep,
    ]);
    harness.sqlite.run(
      "UPDATE external_dependency SET predecessor_work_item_id='remote-branch',predecessor_scope='whole',predecessor_step_id=NULL WHERE id='prerequisite'",
    );
    recordCompletion();
    const answer = await startable();
    expect(answer.status).toBe(200);
    const reading = answer.body as StartableWork;
    expect(reading.leaves).toEqual([]);
    expect(
      reading.prerequisites.find(
        (step) => step.workItemId === 'target-leaf' && step.stepId === targetStep,
      ),
    ).toMatchObject({
      workItemId: 'target-leaf',
      stepId: targetStep,
      canStart: false,
      startBlockers: [
        {
          workItemId: 'remote-second',
          stepId: predecessorStep,
          type: 'FS',
          provenance: 'authored',
          relationshipId: 'prerequisite',
        },
      ],
    });
    await assertRefusal(() => claim());
    harness.sqlite.run(
      "INSERT INTO step_progress (work_item_id,step_id,state,stated_at) VALUES ('remote-second',?,'done',2)",
      [predecessorStep],
    );
    expect((await startable()).body).toMatchObject({
      leaves: [{ workItemId: 'target-leaf', stepIds: [targetStep] }],
    });
    await assertAcceptedClaim();
  });
}

// Proof: disabling shared-person topology traversal makes all three mounted cases miss the peer's execution evidence (shared-bridge-fault.log).
for (const type of ['FS', 'SS', 'FF'] as const) {
  test(`shared-person bridge preserves remote ${type} governed admission and readiness`, async () => {
    setMode('shared');
    const created = await harness.call('ada', 'POST', '/api/projects', { name: 'Shared peer' });
    expect(created.status).toBe(200);
    const peer = created.body as { project: { id: string }; steps: { id: string }[] };
    const peerStep = peer.steps.at(0);
    if (peerStep === undefined) throw new Error('shared peer step missing');
    harness.sqlite.run(
      "INSERT INTO work_item (id,project_id,position,name,readiness) VALUES ('shared-peer-leaf',?,0,'Shared peer leaf','ready')",
      [peer.project.id],
    );
    for (const [workItemId, stepId] of [
      ['target-leaf', targetStep],
      ['shared-peer-leaf', peerStep.id],
    ])
      harness.sqlite.run(
        "INSERT INTO assignment (work_item_id,step_id,person_id) VALUES (?,?,'executor')",
        [workItemId, stepId],
      );
    harness.sqlite.run("UPDATE external_dependency SET type=? WHERE id='prerequisite'", [type]);
    // B --authored prerequisite--> A --shared executor assignment-- C; C has no authored edges.
    expect(
      harness.sqlite
        .query('SELECT predecessor_project_id,successor_project_id FROM external_dependency')
        .all(),
    ).toEqual([{ predecessor_project_id: predecessor, successor_project_id: target }]);
    observedAttemptProjects.clear();
    const answer = await startable();
    expect(answer.status).toBe(200);
    expect([...observedAttemptProjects].sort()).toEqual(
      [target, predecessor, peer.project.id].sort(),
    );
    const reading = answer.body as StartableWork;
    expect(
      reading.prerequisites.find(
        (step) => step.workItemId === 'target-leaf' && step.stepId === targetStep,
      ),
    ).toMatchObject({
      started: false,
      canStart: type === 'FF',
      canFinish: type !== 'FF',
    });
    expect(reading.leaves.map(({ workItemId, stepIds }) => ({ workItemId, stepIds }))).toEqual(
      type === 'FF' ? [{ workItemId: 'target-leaf', stepIds: [targetStep] }] : [],
    );
    if (type !== 'FF') {
      await assertRefusal(() => claim());
      if (type === 'FS') recordCompletion();
      else
        harness.sqlite.run(
          "INSERT INTO step_node_attempt (work_item_id,step_id,attempt_number,started_at,ended_at,outcome) VALUES ('predecessor-leaf',?,1,1,2,'failed')",
          [predecessorStep],
        );
      const released = await startable();
      expect(released.status).toBe(200);
      expect(
        (released.body as StartableWork).leaves.map(({ workItemId, stepIds }) => ({
          workItemId,
          stepIds,
        })),
      ).toEqual([{ workItemId: 'target-leaf', stepIds: [targetStep] }]);
    }
    await assertAcceptedClaim();
  });
}

const tree = () => harness.call('ada', 'GET', `/api/projects/${target}/work-items?full=true`);

async function assertEvidenceFailure() {
  expect((await startable()).status).toBe(500);
  expect((await tree()).status).toBe(500);
  const before = captureState();
  publications.length = 0;
  expect(
    (
      await harness.call('ada', 'POST', `/api/projects/${target}/commands`, {
        commands: [
          { kind: 'patchWorkItem', workItemId: 'target-leaf', patch: { name: 'Must roll back' } },
          {
            kind: 'claimWorkItem',
            workItemId: 'target-leaf',
            personId: 'executor',
            steps: [targetStep],
          },
        ],
      })
    ).status,
  ).toBe(500);
  expect(captureState()).toEqual(before);
  expect(publications).toEqual([]);
}

/** Rewrite the real repository read after its complete SQL observation. */
function interceptEvidence<Fact extends { stepId: string }>(
  prototype: { listByProject(projectId: string): Promise<Fact[]> },
  rewrite: (projectId: string, facts: Fact[]) => Fact[],
) {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'listByProject');
  if (descriptor === undefined) throw new Error('execution evidence reader missing');
  const read = descriptor.value as typeof prototype.listByProject;
  return spyOn(prototype, 'listByProject').mockImplementation(async function (
    this: typeof prototype,
    projectId: string,
  ) {
    const facts = await read.call(this, projectId);
    return rewrite(projectId, facts);
  });
}

for (const evidence of ['attempts', 'progress'] as const) {
  for (const fault of ['absent', 'unreadable'] as const) {
    test(`remote ${evidence} ${fault} refuses mounted execution evidence atomically`, async () => {
      const rewrite = <Fact>(projectId: string, facts: Fact[]) => {
        if (projectId !== predecessor) return facts;
        if (fault === 'unreadable') throw new Error(`injected unreadable remote ${evidence}`);
        // Deliberate missing collection at the trusted store boundary.
        return undefined as never;
      };
      const interception =
        evidence === 'attempts'
          ? interceptEvidence(StepNodeAttemptRepository.prototype, rewrite)
          : interceptEvidence(StepProgressRepository.prototype, rewrite);
      try {
        await assertEvidenceFailure();
      } finally {
        interception.mockRestore();
      }
      expect((await startable()).status).toBe(200);
    });
  }
}

// Proof: union-wide step validation returned 200 for both corrupt mounted reads (task-6-3-evidence/union-steps-fault.log).
for (const evidence of ['progress', 'attempts'] as const) {
  test(`foreign step in own-project ${evidence} refuses mounted evidence`, async () => {
    if (evidence === 'progress') recordCompletion();
    else
      harness.sqlite.run(
        "INSERT INTO step_node_attempt(work_item_id,step_id,attempt_number,started_at,ended_at,outcome) VALUES ('predecessor-leaf',?,1,1,2,'failed')",
        [predecessorStep],
      );
    const rewrite = <Fact extends { stepId: string }>(projectId: string, facts: Fact[]) =>
      projectId === predecessor ? facts.map((fact) => ({ ...fact, stepId: targetStep })) : facts;
    const interception =
      evidence === 'attempts'
        ? interceptEvidence(StepNodeAttemptRepository.prototype, rewrite)
        : interceptEvidence(StepProgressRepository.prototype, rewrite);
    try {
      await assertEvidenceFailure();
    } finally {
      interception.mockRestore();
    }
  });
}

test('required remote project absence refuses mounted evidence without writes', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    ProjectRepository.prototype,
    'findInOrganization',
  );
  if (descriptor === undefined) throw new Error('project reader missing');
  const read = descriptor.value as ProjectRepository['findInOrganization'];
  const interception = spyOn(ProjectRepository.prototype, 'findInOrganization').mockImplementation(
    function (this: ProjectRepository, projectId: string, organizationId: string) {
      return projectId === predecessor
        ? Promise.resolve(null)
        : read.call(this, projectId, organizationId);
    },
  );
  try {
    await assertEvidenceFailure();
  } finally {
    interception.mockRestore();
  }
  expect((await startable()).status).toBe(200);
});

// Proof: omitting remote holds changed mounted tree blocked_by_proxy to ready (task-6-3-evidence/hold-fault.log).
test('remote holds remain visible in mounted tree and prevent governed claims', async () => {
  harness.sqlite.run("UPDATE work_item SET hold='on_hold' WHERE id='predecessor-leaf'");
  expect(await tree()).toMatchObject({
    status: 200,
    body: {
      workItems: [
        {
          id: 'target-leaf',
          status: 'blocked_by_proxy',
          nodeReadings: { [targetStep]: 'blocked_by_proxy' },
        },
      ],
    },
  });
  expect((await startable()).body).toMatchObject({ leaves: [] });
  await assertRefusal(() => claim());
});

// Proof: removing progress evidence kept the completed remote FS blocked (task-6-3-evidence/progress-fault.log).
test('missing remote calendar preserves mounted readiness and governed execution', async () => {
  harness.sqlite.run("UPDATE project SET start_date='2026-10-19' WHERE id=?", [target]);
  harness.sqlite.run('UPDATE project SET start_date=NULL WHERE id=?', [predecessor]);
  expect(await tree()).toMatchObject({
    status: 200,
    body: {
      scheduleError: { kind: 'dependency_calendar_missing' },
      workItems: [
        { id: 'target-leaf', status: 'ready', nodeReadings: { [targetStep]: 'unknown' } },
      ],
      connectedDependencies: [{ id: 'prerequisite' }],
    },
  });
  expect((await startable()).body).toMatchObject({ leaves: [] });
  await assertRefusal(() => claim());
  recordCompletion();
  expect((await startable()).body).toMatchObject({
    leaves: [{ workItemId: 'target-leaf', stepIds: [targetStep] }],
  });
  await assertAcceptedClaim();
});

// Proof: dropping occupancy project scope counted the peer's seven units against target capacity two (task-6-3-evidence/resource-scope-fault.log).
test('shared-person peer discovery retains exact project-local resource occupancy', async () => {
  setMode('shared');
  recordCompletion();
  const created = await harness.call('ada', 'POST', '/api/projects', { name: 'Resource peer' });
  expect(created.status).toBe(200);
  const peer = created.body as { project: { id: string }; steps: { id: string }[] };
  const peerStep = peer.steps.at(0);
  if (peerStep === undefined) throw new Error('resource peer step missing');
  harness.sqlite.run(
    "INSERT INTO work_item(id,project_id,position,name,readiness) VALUES ('resource-peer',?,0,'Resource peer','ready')",
    [peer.project.id],
  );
  harness.sqlite.run(
    "INSERT INTO assignment(work_item_id,step_id,person_id) VALUES ('target-leaf',?,'executor'),('resource-peer',?,'executor')",
    [targetStep, peerStep.id],
  );
  harness.sqlite.run(
    "INSERT INTO resource(id,name,kind,unit_label) VALUES ('machine','Machine','divisible','slots')",
  );
  harness.sqlite.run(
    "INSERT INTO resource_organization(resource_id,organization_id,name) VALUES ('machine','execution-org','Machine')",
  );
  harness.sqlite.run(
    "INSERT INTO project_resource_capacity(project_id,resource_id,units) VALUES (?,'machine',2),(?,'machine',7)",
    [target, peer.project.id],
  );
  harness.sqlite.run(
    "INSERT INTO work_item_resource_demand(work_item_id,resource_id,units) VALUES ('target-leaf','machine',2),('resource-peer','machine',7)",
  );
  harness.sqlite.run(
    "INSERT INTO claim(id,work_item_id,step_id,person_id,run_id,created_at,created_by) VALUES ('remote-claim','resource-peer',?,'executor','remote-run',1,?)",
    [peerStep.id, harness.userId('ada')],
  );
  harness.sqlite.run(
    "INSERT INTO claim_occupancy(claim_id,resource_id,units) VALUES ('remote-claim','machine',7)",
  );
  observedAttemptProjects.clear();
  expect(await startable()).toMatchObject({
    status: 200,
    body: {
      occupancyScope: 'project',
      resources: [{ resourceId: 'machine', capacity: 2, occupied: 0, free: 2 }],
      leaves: [{ workItemId: 'target-leaf', stepIds: [targetStep], fits: true }],
    },
  });
  expect([...observedAttemptProjects].sort()).toEqual(
    [target, predecessor, peer.project.id].sort(),
  );
  expect((await claim()).status).toBe(200);
  expect((await startable()).body).toMatchObject({
    occupancyScope: 'project',
    resources: [{ resourceId: 'machine', capacity: 2, occupied: 2, free: 0 }],
    claimed: [{ workItemId: 'target-leaf', stepId: targetStep }],
  });
  expect(
    harness.sqlite
      .query('SELECT claim_id,resource_id,units FROM claim_occupancy ORDER BY units')
      .all(),
  ).toMatchObject([
    { resource_id: 'machine', units: 2 },
    { claim_id: 'remote-claim', resource_id: 'machine', units: 7 },
  ]);
});
