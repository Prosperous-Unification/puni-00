import { readdirSync, readlinkSync } from 'node:fs';

import type { StartableWork } from '@wbs/core/module/work-item/startable';
import { openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, beforeEach, expect, test } from 'bun:test';

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
