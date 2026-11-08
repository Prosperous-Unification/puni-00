import { readdirSync, readlinkSync } from 'node:fs';

import type { StartableWork } from '@wbs/core/module/work-item/startable';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;
let target: string;
let predecessor: string;
let targetStep: string;
let predecessorStep: string;
let publications: string[];
beforeEach(async () => {
  publications = [];
  harness = OrganizationHarness.openComposedWith({
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
  for (const [projectId, stepId] of [
    [target, targetStep],
    [predecessor, predecessorStep],
  ])
    harness.sqlite.run('DELETE FROM step WHERE project_id=? AND id<>?', [projectId, stepId]);
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

async function command(commands: readonly unknown[]) {
  return harness.call('ada', 'POST', `/api/projects/${target}/commands`, { commands });
}
async function readPermission(started: boolean, canStart: boolean, canFinish = true) {
  const answer = await startable();
  expect(answer.status).toBe(200);
  const reading = answer.body as StartableWork;
  expect(reading.prerequisites.find((node) => node.workItemId === 'target-leaf')).toMatchObject({
    stepId: targetStep,
    started,
    canStart,
    canFinish,
  });
  return reading;
}
function readAttempts() {
  return harness.sqlite
    .query(
      "SELECT work_item_id,step_id,attempt_number,started_at,ended_at,outcome FROM step_node_attempt WHERE work_item_id='target-leaf'",
    )
    .all();
}
function readProgress() {
  return harness.sqlite
    .query("SELECT step_id,state FROM step_progress WHERE work_item_id='target-leaf'")
    .all();
}
async function recordAttempt() {
  expect(
    (
      await command([
        { kind: 'startAttempt', workItemId: 'target-leaf', stepId: targetStep, at: 10 },
        {
          kind: 'endAttempt',
          workItemId: 'target-leaf',
          stepId: targetStep,
          at: 20,
          outcome: 'failed',
        },
      ])
    ).status,
  ).toBe(200);
  expect(readProgress()).toEqual([]);
  expect(readAttempts()).toEqual([
    {
      work_item_id: 'target-leaf',
      step_id: targetStep,
      attempt_number: 1,
      started_at: 10,
      ended_at: 20,
      outcome: 'failed',
    },
  ]);
}

for (const mode of ['isolated', 'shared'] as const) {
  for (const scope of ['local', 'remote'] as const) {
    const configure = () => {
      setMode(mode);
      if (scope === 'local') {
        makeLocal();
        predecessorStep = targetStep;
      }
    };
    // Proof: losing connected attempted.has(key) failed both remote started readings (attempt-evidence.log).
    // Proof: removing the started exemption from startable or claim failed all eight continuation cases
    // (startable-continuation.log, claim-continuation.log); removing it from replay failed all four attempt-only redos (replay-continuation.log).
    test(`${mode} ${scope} attempt-only continuation survives unmet prerequisites and claim replay`, async () => {
      configure();
      await assertRefusal(() => claim());
      await recordAttempt();
      const attempts = readAttempts();
      expect(
        (await readPermission(true, false)).leaves.find(
          (leaf) => leaf.workItemId === 'target-leaf',
        ),
      ).toMatchObject({ stepIds: [targetStep] });
      expect((await claim()).status).toBe(200);
      expect(readAttempts()).toEqual(attempts);
      expect((await harness.call('ada', 'POST', `/api/projects/${target}/undo`)).status).toBe(200);
      expect(readProgress()).toEqual([]);
      expect(readAttempts()).toEqual(attempts);
      expect((await harness.call('ada', 'POST', `/api/projects/${target}/redo`)).status).toBe(200);
      expect(readAttempts()).toEqual(attempts);
      expect(harness.sqlite.query('SELECT work_item_id,step_id FROM claim').all()).toEqual([
        { work_item_id: 'target-leaf', step_id: targetStep },
      ]);
      expect((await readPermission(true, false)).claimed).toMatchObject([
        { workItemId: 'target-leaf', stepId: targetStep },
      ]);
    });

    test(`${mode} ${scope} statement-only continuation remains distinct from prerequisite permission`, async () => {
      configure();
      await assertRefusal(() => claim());
      expect(
        (
          await command([
            {
              kind: 'setProgress',
              workItemId: 'target-leaf',
              stepId: targetStep,
              state: 'in_progress',
            },
          ])
        ).status,
      ).toBe(200);
      expect(readAttempts()).toEqual([]);
      expect(
        (await readPermission(true, false)).leaves.find(
          (leaf) => leaf.workItemId === 'target-leaf',
        ),
      ).toMatchObject({ stepIds: [targetStep] });
      expect((await claim()).status).toBe(200);
      expect(readAttempts()).toEqual([]);
    });

    // Proof: replaying completion as in_progress or replacing authored actual days with 1 failed all twelve manual cases
    // (manual-completion-replay.log, manual-actual-correction.log).
    for (const type of ['FS', 'SS', 'FF'] as const) {
      test(`${mode} ${scope} ${type} manual completion and actual correction preserve historical observations`, async () => {
        configure();
        harness.sqlite.run(
          scope === 'local'
            ? "UPDATE typed_dependency SET type=? WHERE id='local-prerequisite'"
            : "UPDATE external_dependency SET type=? WHERE id='prerequisite'",
          [type],
        );
        await readPermission(false, type === 'FF', type !== 'FF');
        expect(
          (
            await command([
              { kind: 'setProgress', workItemId: 'target-leaf', stepId: targetStep, state: 'done' },
            ])
          ).status,
        ).toBe(200);
        expect(readProgress()).toEqual([{ step_id: targetStep, state: 'done' }]);
        expect(readAttempts()).toEqual([]);
        expect((await harness.call('ada', 'POST', `/api/projects/${target}/undo`)).status).toBe(
          200,
        );
        expect(readProgress()).toEqual([]);
        await readPermission(false, type === 'FF', type !== 'FF');
        expect((await harness.call('ada', 'POST', `/api/projects/${target}/redo`)).status).toBe(
          200,
        );
        expect(readProgress()).toEqual([{ step_id: targetStep, state: 'done' }]);
        expect(
          (await readPermission(true, type === 'FF', type !== 'FF')).leaves.find(
            (leaf) => leaf.workItemId === 'target-leaf',
          ),
        ).toBeUndefined();
        expect(
          (
            await command([
              { kind: 'setActual', workItemId: 'target-leaf', stepId: targetStep, days: 2.5 },
            ])
          ).status,
        ).toBe(200);
        const actuals = () =>
          harness.sqlite
            .query("SELECT step_id,days FROM actual WHERE work_item_id='target-leaf'")
            .all();
        expect(actuals()).toEqual([{ step_id: targetStep, days: 2.5 }]);
        expect((await harness.call('ada', 'POST', `/api/projects/${target}/undo`)).status).toBe(
          200,
        );
        expect(actuals()).toEqual([]);
        expect(readProgress()).toEqual([{ step_id: targetStep, state: 'done' }]);
        expect((await harness.call('ada', 'POST', `/api/projects/${target}/redo`)).status).toBe(
          200,
        );
        expect(actuals()).toEqual([{ step_id: targetStep, days: 2.5 }]);
        await readPermission(true, type === 'FF', type !== 'FF');
        expect(
          (
            await command([
              {
                kind: 'setProgress',
                workItemId: 'target-leaf',
                stepId: targetStep,
                state: 'in_progress',
              },
            ])
          ).status,
        ).toBe(200);
        expect(readProgress()).toEqual([{ step_id: targetStep, state: 'in_progress' }]);
        expect(actuals()).toEqual([{ step_id: targetStep, days: 2.5 }]);
        expect(readAttempts()).toEqual([]);
      });
    }

    // Proof: classifying every restored claim as a new start made all four release undos return 409 (release-classification.log).
    test(`${mode} ${scope} release undo restores historical claim without creating a governed start`, async () => {
      configure();
      recordCompletion();
      expect((await claim()).status).toBe(200);
      const identity = harness.sqlite
        .query(
          'SELECT id,work_item_id,step_id,person_id,run_id,parent_claim_id,created_by FROM claim',
        )
        .all();
      expect(
        (
          await command([
            { kind: 'releaseWorkItem', workItemId: 'target-leaf', personId: 'executor' },
          ])
        ).status,
      ).toBe(200);
      // Later observations no longer justify a fresh start; release undo restores ownership only.
      harness.sqlite.run('DELETE FROM step_progress');
      await readPermission(false, false);
      expect((await harness.call('ada', 'POST', `/api/projects/${target}/undo`)).status).toBe(200);
      expect(
        harness.sqlite
          .query(
            'SELECT id,work_item_id,step_id,person_id,run_id,parent_claim_id,created_by FROM claim',
          )
          .all(),
      ).toEqual(identity);
      expect(readProgress()).toEqual([]);
      expect(readAttempts()).toEqual([]);
      expect((await readPermission(false, false)).claimed).toMatchObject([
        { workItemId: 'target-leaf', stepId: targetStep },
      ]);
    });
  }
}

function makeLocal() {
  harness.sqlite.run("DELETE FROM external_dependency WHERE id='prerequisite'");
  harness.sqlite.run("UPDATE work_item SET project_id=? WHERE id='predecessor-leaf'", [target]);
  harness.sqlite.run(
    "INSERT INTO typed_dependency (id,project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,predecessor_step_id,successor_step_id,type) VALUES ('local-prerequisite',?,'predecessor-leaf','target-leaf','node','node',?,?,'FS')",
    [target, targetStep, targetStep],
  );
}

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
