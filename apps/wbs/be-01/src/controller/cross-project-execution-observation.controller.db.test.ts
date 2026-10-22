import { readdirSync, readlinkSync } from 'node:fs';

import { openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;
let target: string;
let remote: string;
let targetStep: string;
let remoteStep: string;
let armed: boolean;
let injections: number;
let relationship: 'FS' | 'SS';

beforeEach(async () => {
  armed = false;
  injections = 0;
  relationship = 'FS';
  harness = OrganizationHarness.openComposedWith({
    openReadOnlyConnection: (path) =>
      openReadOnlyConnection(path, {
        logQuery(query, parameters) {
          if (!armed || !query.includes('from "step_node_attempt"') || !parameters.includes(remote))
            return;
          armed = false;
          injections += 1;
          harness.sqlite.transaction(() => {
            if (relationship === 'FS')
              harness.sqlite.run("DELETE FROM step_progress WHERE work_item_id='remote-leaf'");
            else
              harness.sqlite.run(
                "INSERT INTO step_node_attempt (work_item_id,step_id,attempt_number,started_at,ended_at,outcome) VALUES ('remote-leaf',?,1,10,20,'failed')",
                [remoteStep],
              );
            harness.sqlite.run(
              "INSERT INTO claim (id,work_item_id,step_id,person_id,run_id,created_at,created_by) VALUES ('target-claim','target-leaf',?,'executor','target-run',30,?)",
              [targetStep, harness.userId('ada')],
            );
            harness.sqlite.run(
              "INSERT INTO claim_occupancy (claim_id,resource_id,units) VALUES ('target-claim','machine',1)",
            );
          })();
        },
      }),
  });
  await harness.register('ada');
  harness.organization('execution-org');
  harness.member('execution-org', 'ada', 'admin');
  harness.bind('ada', 'execution-org');
  harness.activate();
  // Synthetic stored authority establishes the reader fixture, not runtime authoring admission.
  seedDependencyAuthority(harness.databasePath());
  const create = async (name: string) => {
    const answer = await harness.call('ada', 'POST', '/api/projects', { name });
    expect(answer.status).toBe(200);
    const created = answer.body as { project: { id: string }; steps: { id: string }[] };
    const step = created.steps[0].id;
    harness.sqlite.run('DELETE FROM step WHERE project_id=? AND id<>?', [created.project.id, step]);
    return { projectId: created.project.id, stepId: step };
  };
  const first = await create('Target');
  const second = await create('Remote');
  target = first.projectId;
  remote = second.projectId;
  targetStep = first.stepId;
  remoteStep = second.stepId;
  for (const [id, projectId] of [
    ['target-leaf', target],
    ['remote-leaf', remote],
  ])
    harness.sqlite.run(
      "INSERT INTO work_item (id,project_id,position,name,readiness) VALUES (?,?,0,?,'ready')",
      [id, projectId, id],
    );
  harness.sqlite.run("INSERT INTO person (id,name) VALUES ('executor','Executor')");
  harness.sqlite.run(
    "INSERT INTO person_organization (resource_id,organization_id,name) VALUES ('executor','execution-org','Executor')",
  );
  harness.sqlite.run(
    "INSERT INTO resource (id,name,kind,unit_label) VALUES ('machine','Machine','divisible','slots')",
  );
  harness.sqlite.run(
    "INSERT INTO resource_organization (resource_id,organization_id,name) VALUES ('machine','execution-org','Machine')",
  );
  harness.sqlite.run(
    "INSERT INTO project_resource_capacity (project_id,resource_id,units) VALUES (?,'machine',1)",
    [target],
  );
  harness.sqlite.run(
    "INSERT INTO work_item_resource_demand (work_item_id,resource_id,units) VALUES ('target-leaf','machine',1)",
  );
  harness.sqlite.run(
    "INSERT INTO external_dependency (id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,predecessor_step_id,successor_step_id,type) VALUES ('prerequisite','execution-org',?,?,'remote-leaf','target-leaf','node','node',?,?,'FS')",
    [remote, target, remoteStep, targetStep],
  );
});
afterEach(async () => {
  const path = harness.databasePath();
  // Proof: replacing closeComposed with close left six deleted database/WAL/SHM descriptors in both mounted cases (execution-teardown-fault.log).
  await harness.closeComposed();
  if (process.platform === 'linux') expect(readDatabaseDescriptors(path)).toEqual([]);
});

/** Linux witness for both live and deleted descriptors retained by a composed source. */
function readDatabaseDescriptors(path: string): string[] {
  return readdirSync('/proc/self/fd').flatMap((descriptor) => {
    let target: string;
    try {
      target = readlinkSync(`/proc/self/fd/${descriptor}`);
    } catch (failure) {
      // Enumerating /proc opens a directory descriptor which can close before readlink.
      if (failure instanceof Error && 'code' in failure && failure.code === 'ENOENT') return [];
      throw failure;
    }
    return target.startsWith(path) ? [target] : [];
  });
}

const address = {
  workItemId: 'target-leaf',
  number: '010',
  numberIsFrozen: false,
  name: 'target-leaf',
};
function buildPrerequisite(canStart: boolean) {
  return {
    workItemId: 'target-leaf',
    stepId: targetStep,
    started: false,
    canStart,
    canFinish: true,
    startBlockers: canStart
      ? []
      : [
          {
            workItemId: 'remote-leaf',
            stepId: remoteStep,
            type: relationship,
            provenance: 'authored',
            relationshipId: 'prerequisite',
          },
        ],
    finishBlockers: [],
  };
}
function buildSnapshot(canStart: boolean, isClaimed: boolean) {
  return {
    prerequisites: [buildPrerequisite(canStart)],
    leaves:
      canStart && !isClaimed
        ? [
            {
              ...address,
              stepIds: [targetStep],
              assignees: [],
              teams: [],
              unfinishedPredecessorIds: [],
              subtreeClaim: null,
              fits: true,
            },
          ]
        : [],
    doesNotFit: [],
    claimed: isClaimed
      ? [
          {
            ...address,
            stepId: targetStep,
            claimId: 'target-claim',
            holder: { personId: 'executor', name: 'Executor' },
            assignee: null,
            runId: 'target-run',
            parentClaimId: null,
            claimedAt: 30,
          },
        ]
      : [],
    subtreeClaims: [],
    resources: [
      {
        resourceId: 'machine',
        name: 'Machine',
        unitLabel: 'slots',
        kind: 'divisible',
        capacity: 1,
        occupied: isClaimed ? 1 : 0,
        free: isClaimed ? 0 : 1,
      },
    ],
    occupancyScope: 'project',
  };
}
async function readStartable() {
  const answer = await harness.call('ada', 'GET', `/api/projects/${target}/startable`);
  expect(answer.status).toBe(200);
  return answer.body;
}
function assertWriterCommitted() {
  expect(injections).toBe(1);
  expect(
    harness.sqlite.query('SELECT id,work_item_id,step_id,person_id,run_id FROM claim').all(),
  ).toEqual([
    {
      id: 'target-claim',
      work_item_id: 'target-leaf',
      step_id: targetStep,
      person_id: 'executor',
      run_id: 'target-run',
    },
  ]);
  expect(
    harness.sqlite.query('SELECT claim_id,resource_id,units FROM claim_occupancy').all(),
  ).toEqual([{ claim_id: 'target-claim', resource_id: 'machine', units: 1 }]);
}

test('FS completion, target claim and resource occupancy share one mounted execution observation', async () => {
  harness.sqlite.run(
    "INSERT INTO step_progress (work_item_id,step_id,state,stated_at) VALUES ('remote-leaf',?,'done',1)",
    [remoteStep],
  );
  armed = true;
  const before = await readStartable();
  assertWriterCommitted();
  expect(
    harness.sqlite.query("SELECT * FROM step_progress WHERE work_item_id='remote-leaf'").all(),
  ).toEqual([]);
  expect(before).toEqual(buildSnapshot(true, false));
  expect(await readStartable()).toEqual(buildSnapshot(false, true));
  expect(injections).toBe(1);
});

test('SS failed attempt, target claim and resource occupancy share one mounted execution observation', async () => {
  relationship = 'SS';
  harness.sqlite.run("UPDATE external_dependency SET type='SS' WHERE id='prerequisite'");
  armed = true;
  const before = await readStartable();
  assertWriterCommitted();
  expect(
    harness.sqlite
      .query(
        'SELECT work_item_id,step_id,attempt_number,started_at,ended_at,outcome FROM step_node_attempt',
      )
      .all(),
  ).toEqual([
    {
      work_item_id: 'remote-leaf',
      step_id: remoteStep,
      attempt_number: 1,
      started_at: 10,
      ended_at: 20,
      outcome: 'failed',
    },
  ]);
  expect(before).toEqual(buildSnapshot(false, false));
  expect(await readStartable()).toEqual(buildSnapshot(true, true));
  expect(injections).toBe(1);
});
