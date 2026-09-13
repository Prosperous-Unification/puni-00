import type {
  SavedPlanPrincipals,
  SavedPlanRow,
  SavedPlanStore,
  SavedPlanWrite,
  StoredSavedPlan,
} from '@wbs/core';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import type { CaseFixture, SeededPlan } from '../source-declaration';
import { type OpenCase, storeCase } from './store-case';

interface SavedPlanState {
  readonly plans: readonly (StoredSavedPlan | null)[];
  readonly lists: readonly (readonly SavedPlanRow[])[];
  readonly principals: readonly (SavedPlanPrincipals | null)[];
}

function storedPlan(
  plan: SavedPlanWrite,
  inputBytes: number,
  scheduleBytes: number | null,
): StoredSavedPlan {
  return {
    header: {
      id: plan.id,
      projectId: plan.projectId,
      name: plan.name,
      createdBy: plan.createdBy,
      createdById: plan.createdById,
      createdAt: plan.createdAt,
      inputSchemaVersion: plan.input.schemaVersion,
      inputBytes,
      inputSha256: plan.input.sha256,
      scheduleSchemaVersion: plan.schedule.present ? plan.schedule.body.schemaVersion : null,
      scheduleBytes,
      scheduleSha256: plan.schedule.present ? plan.schedule.body.sha256 : null,
      scheduleInputSha256: plan.schedule.present ? plan.schedule.inputSha256 : null,
      schedulerAlgorithmId: plan.schedule.present ? plan.schedule.algorithmId : null,
      scheduleAbsentReason: plan.schedule.present ? null : plan.schedule.absentReason,
    },
    bodies: {
      input: plan.input.bytes,
      schedule: plan.schedule.present ? plan.schedule.body.bytes : null,
    },
  };
}

function principals(plan: SavedPlanWrite, projectOwnerId: string): SavedPlanPrincipals {
  return {
    savedPlanId: plan.id,
    projectId: plan.projectId,
    projectOwnerId,
    createdById: plan.createdById,
  };
}

async function writePlan(port: SavedPlanStore, plan: SavedPlanWrite, expected: StoredSavedPlan) {
  expect(await port.write(plan, () => Promise.resolve(null))).toEqual({ outcome: 'written' });
  expect(await port.readOf(plan.id)).toEqual(expected);
}

async function assertState(
  fixture: CaseFixture<SavedPlanStore>,
  ids: readonly string[],
  state: SavedPlanState,
) {
  expect(await Promise.all(ids.map((id) => fixture.readers.savedPlans.readOf(id)))).toEqual([
    ...state.plans,
  ]);
  expect(
    await Promise.all(fixture.seed.projectIds.map((id) => fixture.readers.savedPlans.listOf(id))),
  ).toEqual(state.lists.map((rows) => [...rows]));
  expect(await Promise.all(ids.map((id) => fixture.readers.savedPlans.principalsOf(id)))).toEqual([
    ...state.principals,
  ]);
}

function writePlans(seed: SeededPlan) {
  const present: SavedPlanWrite = {
    id: 'saved-present',
    projectId: seed.projectIds[0],
    name: 'Present plan',
    createdBy: 'Ada Display',
    createdById: seed.ownerIds[1],
    createdAt: 301,
    input: { schemaVersion: 7, bytes: 'A🔦B', sha256: 'input-hash-present' },
    schedule: {
      present: true,
      body: { schemaVersion: 9, bytes: 'é', sha256: 'schedule-hash-present' },
      inputSha256: 'input-hash-present',
      algorithmId: 'scheduler-present',
    },
  };
  const absent: SavedPlanWrite = {
    id: 'saved-absent',
    projectId: seed.projectIds[0],
    name: 'Absent plan',
    createdBy: 'Guest Snapshot',
    createdById: null,
    createdAt: 302,
    input: { schemaVersion: 3, bytes: 'Zürich', sha256: 'input-hash-absent' },
    schedule: { present: false, absentReason: 'infeasible' },
  };
  return {
    present,
    absent,
    expectedPresent: storedPlan(present, 6, 2),
    expectedAbsent: storedPlan(absent, 7, null),
  };
}

function touchPlans(seed: SeededPlan) {
  const target: SavedPlanWrite = {
    id: 'touch-target',
    projectId: seed.projectIds[0],
    name: 'Touch target',
    createdBy: 'External author',
    createdById: seed.ownerIds[1],
    createdAt: 401,
    input: { schemaVersion: 1, bytes: 'target', sha256: 'hash-target' },
    schedule: { present: false, absentReason: 'not-requested' },
  };
  const nullCreator: SavedPlanWrite = {
    id: 'touch-null-creator',
    projectId: seed.projectIds[0],
    name: 'Null creator',
    createdBy: 'Deleted account display',
    createdById: null,
    createdAt: 402,
    input: { schemaVersion: 2, bytes: 'nullable', sha256: 'hash-nullable' },
    schedule: { present: false, absentReason: 'not-requested' },
  };
  const peer: SavedPlanWrite = {
    id: 'touch-peer',
    projectId: seed.projectIds[0],
    name: 'Project peer',
    createdBy: 'Owner A display',
    createdById: seed.ownerIds[0],
    createdAt: 403,
    input: { schemaVersion: 3, bytes: 'peer', sha256: 'hash-peer' },
    schedule: { present: false, absentReason: 'not-requested' },
  };
  const otherProject: SavedPlanWrite = {
    id: 'touch-other-project',
    projectId: seed.projectIds[1],
    name: 'Other project sentinel',
    createdBy: 'Owner A cross-project',
    createdById: seed.ownerIds[0],
    createdAt: 404,
    input: { schemaVersion: 4, bytes: 'sentinel', sha256: 'hash-sentinel' },
    schedule: { present: false, absentReason: 'not-requested' },
  };
  const expectedTarget = storedPlan(target, 6, null);
  const expectedNullCreator = storedPlan(nullCreator, 8, null);
  const expectedPeer = storedPlan(peer, 4, null);
  const expectedOtherProject = storedPlan(otherProject, 8, null);
  return {
    plans: [target, nullCreator, peer, otherProject] as const,
    stored: [expectedTarget, expectedNullCreator, expectedPeer, expectedOtherProject] as const,
    principals: [
      principals(target, seed.ownerIds[0]),
      principals(nullCreator, seed.ownerIds[0]),
      principals(peer, seed.ownerIds[0]),
      principals(otherProject, seed.ownerIds[1]),
    ] as const,
  };
}

async function assertWrites(fixture: CaseFixture<SavedPlanStore>) {
  const plans = writePlans(fixture.seed);
  await writePlan(fixture.port, plans.present, plans.expectedPresent);
  await writePlan(fixture.port, plans.absent, plans.expectedAbsent);

  await assertState(fixture, [plans.present.id, plans.absent.id], {
    plans: [plans.expectedPresent, plans.expectedAbsent],
    lists: [[plans.expectedAbsent.header, plans.expectedPresent.header], []],
    principals: [
      principals(plans.present, fixture.seed.ownerIds[0]),
      principals(plans.absent, fixture.seed.ownerIds[0]),
    ],
  });
}

async function assertTouches(fixture: CaseFixture<SavedPlanStore>) {
  const plans = touchPlans(fixture.seed);
  for (const [index, plan] of plans.plans.entries()) {
    const expected = plans.stored[index];
    await writePlan(fixture.port, plan, expected);
  }

  const ids = [...plans.plans.map(({ id }) => id), 'missing-touch-plan'];
  const initial: SavedPlanState = {
    plans: [...plans.stored, null],
    lists: [
      [plans.stored[2].header, plans.stored[1].header, plans.stored[0].header],
      [plans.stored[3].header],
    ],
    principals: [...plans.principals, null],
  };
  await assertState(fixture, ids, initial);

  expect(await fixture.port.renameTo('touch-target', 'Renamed target')).toBe('touched');
  const renamedTarget: StoredSavedPlan = {
    header: { ...plans.stored[0].header, name: 'Renamed target' },
    bodies: { input: 'target', schedule: null },
  };
  const renamed: SavedPlanState = {
    plans: [renamedTarget, plans.stored[1], plans.stored[2], plans.stored[3], null],
    lists: [
      [plans.stored[2].header, plans.stored[1].header, renamedTarget.header],
      [plans.stored[3].header],
    ],
    principals: initial.principals,
  };
  await assertState(fixture, ids, renamed);

  expect(await fixture.port.renameTo('missing-touch-plan', 'Never stored')).toBe('no_such_plan');
  await assertState(fixture, ids, renamed);
  expect(await fixture.port.deleteOf('missing-touch-plan')).toBe('no_such_plan');
  await assertState(fixture, ids, renamed);

  expect(await fixture.port.deleteOf('touch-target')).toBe('touched');
  await assertState(fixture, ids, {
    plans: [null, plans.stored[1], plans.stored[2], plans.stored[3], null],
    lists: [[plans.stored[2].header, plans.stored[1].header], [plans.stored[3].header]],
    principals: [null, plans.principals[1], plans.principals[2], plans.principals[3], null],
  });
}

/** Registers saved-plan byte, body, ownership and touch evidence. */
export function savedPlanRegistrations(open: OpenCase<'savedPlans'>): readonly CaseRegistration[] {
  return [
    storeCase('savedPlans', 'savedPlans.write:bytes-and-bodies', open, assertWrites),
    storeCase('savedPlans', 'savedPlans.touch:principals-scope', open, assertTouches),
  ];
}
