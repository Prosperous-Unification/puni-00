import type { PlanInputReads, SavedPlanCaptureStore, TransactionalStores } from '@wbs/core';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import { CURRENT_SOURCE_PROJECT_IDS } from '../source-catalogue-fixture';
import type { SeededPlan } from '../source-declaration';
import { type OpenCase, storeCase } from './store-case';

type CaptureSeedStores = Pick<
  TransactionalStores,
  | 'workPackages'
  | 'settings'
  | 'workItems'
  | 'estimates'
  | 'actuals'
  | 'progress'
  | 'blockages'
  | 'stepParallels'
  | 'measures'
  | 'measureEstimates'
  | 'budgets'
  | 'dependencies'
  | 'typedDependencies'
  | 'directory'
  | 'capacity'
  | 'demands'
  | 'resourceCapacity'
  | 'priorityBands'
>;

export type CaptureRevisionPolicy = 'memory-unbumped' | 'sqlite-bumped';
export type CaptureDirectoryEpoch = 'before' | 'after';

const A_BANDS = [
  { startsAt: 1, label: 'A urgent', defaultValue: 2 },
  { startsAt: 11, label: 'A high', defaultValue: 12 },
  { startsAt: 21, label: 'A ordinary', defaultValue: 22 },
  { startsAt: 31, label: 'A low', defaultValue: 32 },
  { startsAt: 41, label: 'A someday', defaultValue: 42 },
] as const;

const B_BANDS = [
  { startsAt: 1, label: 'B urgent', defaultValue: 3 },
  { startsAt: 101, label: 'B high', defaultValue: 103 },
  { startsAt: 201, label: 'B ordinary', defaultValue: 203 },
  { startsAt: 301, label: 'B low', defaultValue: 303 },
  { startsAt: 401, label: 'B someday', defaultValue: 403 },
] as const;

const EXTERNAL_SYSTEMS = [
  { id: 'sys-confluence-page', name: 'confluence-page' },
  { id: 'sys-github-issue', name: 'github-issue' },
  { id: 'sys-github-pr', name: 'github-pr' },
  { id: 'sys-jira-issue', name: 'jira-issue' },
  { id: 'sys-slack-message', name: 'slack-message' },
] as const;

const byId = <Row extends { readonly id: string }>(left: Row, right: Row) =>
  left.id.localeCompare(right.id);
const byPair = <Row extends { readonly workItemId: string; readonly stepId: string }>(
  left: Row,
  right: Row,
) => left.workItemId.localeCompare(right.workItemId) || left.stepId.localeCompare(right.stepId);

/** Work packages every declared capture field into a stable cross-source value. */
export function observePlanInput(reads: PlanInputReads) {
  return {
    workPackage: {
      id: reads.workPackage.id,
      name: reads.workPackage.name,
      projectId: reads.workPackage.projectId,
      restricted: reads.workPackage.restricted,
      estimateMethod: reads.workPackage.estimateMethod,
      depReach: reads.workPackage.depReach,
      pertWeights: { ...reads.workPackage.pertWeights },
      estimateRounding: reads.workPackage.estimateRounding,
      startDate: reads.workPackage.startDate,
      scheduleEngine: reads.workPackage.scheduleEngine,
      scheduleObjective: reads.workPackage.scheduleObjective,
      optimizationEnabled: reads.workPackage.optimizationEnabled,
      solutionRef:
        reads.workPackage.solutionRef === null ? null : { ...reads.workPackage.solutionRef },
      budgetFactor: reads.workPackage.budgetFactor,
    },
    steps: reads.steps.map(({ id, name, position }) => ({ id, name, position })),
    workItems: reads.workItems
      .map((row) => ({
        id: row.id,
        workPackageId: row.workPackageId,
        parentId: row.parentId,
        position: row.position,
        name: row.name,
        notes: row.notes,
        frozenNumber: row.frozenNumber,
        startNoEarlierThan: row.startNoEarlierThan,
        startNoEarlierThanReason: row.startNoEarlierThanReason,
        deadline: row.deadline,
        readiness: row.readiness,
        hold: row.hold,
        priority: row.priority,
        serviceTeamId: row.serviceTeamId,
        serviceId: row.serviceId,
        maxParallel: row.maxParallel,
        revision: row.revision,
        teamIds: [...row.teamIds].sort(),
        tagIds: [...row.tagIds].sort(),
        serviceIds: [...row.serviceIds].sort(),
        typeIds: [...row.typeIds].sort(),
        externalRefs: row.externalRefs
          .map(({ id, systemId, url }) => ({ id, systemId, url }))
          .sort(byId),
      }))
      .sort(byId),
    estimates: reads.estimates.map((row) => ({ ...row })).sort(byPair),
    actuals: reads.actuals.map((row) => ({ ...row })).sort(byPair),
    progress: reads.progress.map((row) => ({ ...row })).sort(byPair),
    measures: reads.measures
      .map((row) => ({ ...row }))
      .sort((left, right) => byPair(left, right) || left.metric.localeCompare(right.metric)),
    measureEstimates: reads.measureEstimates
      .map((row) => ({ ...row }))
      .sort((left, right) => byPair(left, right) || left.key.localeCompare(right.key)),
    budgets: reads.budgets
      .map((row) => ({ ...row }))
      .sort(
        (left, right) =>
          left.workItemId.localeCompare(right.workItemId) || left.key.localeCompare(right.key),
      ),
    dependencies: reads.dependencies
      .map(({ predecessorId, successorId }) => ({ predecessorId, successorId }))
      .sort(
        (left, right) =>
          left.predecessorId.localeCompare(right.predecessorId) ||
          left.successorId.localeCompare(right.successorId),
      ),
    typedDependencies: reads.typedDependencies.map((row) => structuredClone(row)).sort(byId),
    assignments: reads.assignments
      .map((row) => ({ ...row }))
      .sort((left, right) => byPair(left, right) || left.personId.localeCompare(right.personId)),
    capacity: [...reads.capacity.entries()].sort(([left], [right]) => left.localeCompare(right)),
    priorityBands: reads.priorityBands.map((row) => ({ ...row })),
    people: reads.people
      .map(({ id, name, teamIds }) => ({ id, name, teamIds: [...teamIds].sort() }))
      .sort(byId),
    teams: reads.teams
      .map(({ id, name, serviceIds }) => ({ id, name, serviceIds: [...serviceIds].sort() }))
      .sort(byId),
    services: reads.services.map(({ id, name }) => ({ id, name })).sort(byId),
    tags: reads.tags.map(({ id, name }) => ({ id, name })).sort(byId),
    workItemTypes: reads.workItemTypes.map(({ id, name }) => ({ id, name })).sort(byId),
    externalSystems: reads.externalSystems.map(({ id, name }) => ({ id, name })).sort(byId),
  };
}

function expectedWorkItem(
  workPackageId: string,
  id: string,
  name: string,
  revision: number,
  captured = false,
) {
  return {
    id,
    workPackageId,
    parentId: null,
    position: 10,
    name: captured ? 'Captured A' : name,
    notes: captured ? 'all capture fields' : '',
    frozenNumber: captured ? 'A-001' : null,
    startNoEarlierThan: captured ? '2026-10-02' : null,
    startNoEarlierThanReason: captured ? 'fixture floor' : null,
    deadline: captured ? '2026-10-20' : null,
    readiness: captured ? ('ready' as const) : null,
    hold: captured ? ('blocked' as const) : null,
    priority: captured ? 7 : null,
    serviceTeamId: captured ? 'team-a' : null,
    serviceId: null,
    maxParallel: captured ? 2 : 1,
    revision,
    teamIds: captured ? ['team-a'] : [],
    tagIds: captured ? ['tag-a'] : [],
    serviceIds: captured ? ['service-a'] : [],
    typeIds: captured ? ['type-a'] : [],
    externalRefs: [],
  };
}

/** Builds the complete expected capture without consulting an adapter read. */
export function savedPlanCaptureExpected(
  seed: SeededPlan,
  workPackageIndex: 0 | 1,
  revisionPolicy: CaptureRevisionPolicy,
  directoryEpoch: CaptureDirectoryEpoch = 'before',
): ReturnType<typeof observePlanInput> {
  const isA = workPackageIndex === 0;
  const workPackageId = seed.workPackageIds[workPackageIndex];
  const [firstWorkItemId, secondWorkItemId] = seed.workItemIds[workPackageIndex];
  const [firstStepId, secondStepId] = seed.stepIds[workPackageIndex];
  return {
    workPackage: isA
      ? {
          id: workPackageId,
          name: 'Captured work package A',
          projectId: CURRENT_SOURCE_PROJECT_IDS[workPackageIndex],
          restricted: true,
          estimateMethod: 'pessimistic',
          depReach: 'anchor-slice',
          pertWeights: { optimistic: 2, realistic: 5, pessimistic: 3 },
          estimateRounding: 'round',
          startDate: '2026-10-01',
          scheduleEngine: 'optimized',
          scheduleObjective: 'time',
          optimizationEnabled: true,
          solutionRef: { slug: 'capture-a', url: 'https://example.test/capture-a' },
          budgetFactor: 1.5,
        }
      : {
          id: workPackageId,
          name: 'Work package 2',
          projectId: CURRENT_SOURCE_PROJECT_IDS[workPackageIndex],
          restricted: false,
          estimateMethod: 'pert',
          depReach: 'whole-item',
          pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
          estimateRounding: 'ceil',
          startDate: null,
          scheduleEngine: 'fast',
          scheduleObjective: 'pri',
          optimizationEnabled: false,
          solutionRef: null,
          budgetFactor: 1,
        },
    steps: [
      { id: firstStepId, name: isA ? 'Dev' : 'Other Dev', position: 10 },
      { id: secondStepId, name: isA ? 'QA' : 'Other QA', position: 20 },
    ],
    workItems: [
      expectedWorkItem(
        workPackageId,
        firstWorkItemId,
        'Work 1',
        // A's first row also takes the tokens trio and budget, two writes more.
        revisionPolicy === 'sqlite-bumped' ? (isA ? 9 : 5) : 0,
        isA,
      ),
      expectedWorkItem(
        workPackageId,
        secondWorkItemId,
        'Work 2',
        revisionPolicy === 'sqlite-bumped' ? 4 : 0,
      ),
    ],
    estimates: [
      {
        workItemId: firstWorkItemId,
        stepId: firstStepId,
        optimistic: isA ? 1 : 11,
        realistic: isA ? 2 : 12,
        pessimistic: isA ? 3 : 13,
      },
    ],
    actuals: [
      {
        workItemId: firstWorkItemId,
        stepId: secondStepId,
        days: isA ? 4 : 14,
        recordedAt: isA ? 301 : 401,
      },
    ],
    progress: [
      {
        workItemId: secondWorkItemId,
        stepId: firstStepId,
        state: isA ? ('done' as const) : ('in_progress' as const),
        statedAt: isA ? 302 : 402,
      },
    ],
    measures: [
      {
        workItemId: secondWorkItemId,
        stepId: secondStepId,
        metric: isA ? ('token_actual' as const) : ('hours_actual' as const),
        value: isA ? 500 : 15,
        recordedAt: isA ? 303 : 403,
      },
    ],
    // A three-point tokens trio and a tokens budget, the measures an unowned
    // work package may hold beyond its legacy facts (`wbs-measure-budgets` D66).
    measureEstimates: isA
      ? [
          {
            workItemId: firstWorkItemId,
            stepId: firstStepId,
            key: 'tokens',
            optimistic: 100,
            realistic: 200,
            pessimistic: 600,
            singlePoint: false,
          },
        ]
      : [],
    budgets: isA
      ? [
          {
            workItemId: firstWorkItemId,
            key: 'tokens',
            cap: 5000,
            policy: 'strict' as const,
            holdPerAttempt: 300,
          },
        ]
      : [],
    dependencies: [
      {
        predecessorId: isA ? firstWorkItemId : secondWorkItemId,
        successorId: isA ? secondWorkItemId : firstWorkItemId,
      },
    ],
    // Proof: 2026-09-28, memory capture returning [] failed the complete case's typedDependencies comparison.
    typedDependencies: isA
      ? [
          {
            id: 'capture-typed-a',
            predecessor: { scope: 'whole', workItemId: firstWorkItemId },
            successor: { scope: 'whole', workItemId: secondWorkItemId },
            type: 'FS',
          },
        ]
      : [
          {
            id: 'capture-typed-b',
            predecessor: { scope: 'node', workItemId: firstWorkItemId, stepId: firstStepId },
            successor: { scope: 'node', workItemId: secondWorkItemId, stepId: secondStepId },
            type: 'FS',
          },
        ],
    assignments: [
      {
        workItemId: firstWorkItemId,
        stepId: firstStepId,
        personId: isA ? 'person-a' : 'person-b',
      },
    ],
    capacity: [[isA ? 'team-b' : 'team-a', isA ? 4 : 6]] as [string, number][],
    priorityBands: (isA ? A_BANDS : B_BANDS).map((row) => ({ ...row })),
    people: [
      {
        id: 'capture-person-unassigned',
        name: 'Unassigned member',
        teamIds: [directoryEpoch === 'before' ? 'team-b' : 'team-a'],
      },
      { id: 'person-a', name: 'Person 1', teamIds: ['team-a'] },
      { id: 'person-b', name: 'Person 2', teamIds: ['team-b'] },
    ],
    teams: [
      { id: 'team-a', name: 'Team 1', serviceIds: ['service-a'] },
      { id: 'team-b', name: 'Team 2', serviceIds: [] },
    ],
    services: [
      { id: 'capture-service-only', name: 'Capture-only service' },
      { id: 'service-a', name: 'Service 1' },
    ],
    tags: [
      { id: 'capture-tag-only', name: 'Capture-only tag' },
      { id: 'tag-a', name: directoryEpoch === 'before' ? 'Tag 1' : 'Tag after interleave' },
    ],
    workItemTypes: [
      { id: 'capture-type-only', name: 'Capture-only type' },
      { id: 'type-a', name: 'Type 1' },
    ],
    externalSystems: EXTERNAL_SYSTEMS.map((row) => ({ ...row })),
  };
}

async function expectWritten(outcome: Promise<string>) {
  expect(await outcome).toBe('written');
}

async function readSeededPlanInput(
  stores: CaptureSeedStores,
  workPackageId: string,
): Promise<PlanInputReads> {
  const [
    workPackage,
    steps,
    workItems,
    estimates,
    actuals,
    progress,
    stepBlockages,
    stepParallels,
    measures,
    measureDefinitions,
    measureEstimates,
    budgets,
    dependencies,
    typedDependencies,
    assignmentRows,
    capacity,
    demands,
    resourceCapacities,
    resourceCatalog,
    priorityBands,
    people,
    teams,
    services,
    tags,
    workItemTypes,
    externalSystems,
  ] = await Promise.all([
    stores.workPackages.findById(workPackageId),
    stores.workPackages.stepsOf(workPackageId),
    stores.workItems.listByWorkPackage(workPackageId),
    stores.estimates.listByWorkPackage(workPackageId),
    stores.actuals.listByWorkPackage(workPackageId),
    stores.progress.listByWorkPackage(workPackageId),
    stores.blockages.listByWorkPackage(workPackageId),
    stores.stepParallels.listByWorkPackage(workPackageId),
    stores.measures.listByWorkPackage(workPackageId),
    stores.measures.definitionsFor(workPackageId),
    stores.measureEstimates.listByWorkPackage(workPackageId),
    stores.budgets.listByWorkPackage(workPackageId),
    stores.dependencies.listByWorkPackage(workPackageId),
    stores.typedDependencies.listByWorkPackage(workPackageId),
    stores.directory.assignmentsInWorkPackage(workPackageId),
    stores.capacity.slotsFor(workPackageId),
    stores.demands.listByWorkPackage(workPackageId),
    stores.resourceCapacity.listFor(workPackageId),
    stores.directory.listResources(),
    stores.priorityBands.listFor(workPackageId),
    stores.directory.listPeople(),
    stores.directory.listTeams(),
    stores.directory.listServices(),
    stores.directory.listTags(),
    stores.directory.listWorkItemTypes(),
    stores.directory.listExternalSystems(),
  ]);
  if (workPackage === null) throw new Error(`capture seed work package ${workPackageId} is absent`);
  const timezone = await stores.workPackages.timezoneOf(workPackageId);
  if (timezone === null)
    throw new Error(`capture seed work package ${workPackageId} has no timezone`);
  return {
    workPackage: { ...workPackage, timezone },
    steps,
    workItems,
    estimates,
    actuals,
    progress,
    stepBlockages,
    stepParallels,
    measures,
    measureDefinitions,
    measureEstimates,
    budgets,
    dependencies,
    typedDependencies: typedDependencies.map(({ id, predecessor, successor, type }) => ({
      id,
      predecessor:
        predecessor.scope === 'whole'
          ? { scope: predecessor.scope, workItemId: predecessor.workItemId }
          : {
              scope: predecessor.scope,
              workItemId: predecessor.workItemId,
              stepId: predecessor.stepId,
            },
      successor:
        successor.scope === 'whole'
          ? { scope: successor.scope, workItemId: successor.workItemId }
          : { scope: successor.scope, workItemId: successor.workItemId, stepId: successor.stepId },
      type,
    })),
    assignments: assignmentRows.assignments,
    capacity,
    demands,
    resourceCapacities,
    resources: resourceCatalog,
    priorityBands,
    people,
    teams,
    services,
    tags,
    workItemTypes,
    externalSystems,
  };
}

/** Adds every work-package-scoped fact and every capture-only directory witness. */
export async function seedSavedPlanCapture(stores: CaptureSeedStores, seed: SeededPlan) {
  const stamp = seed.stamps[0];
  const workPackage = await stores.workPackages.findById(seed.workPackageIds[0]);
  if (workPackage === null) throw new Error('capture fixture work package is absent');
  const project = await stores.settings.readTarget(
    { level: 'project', id: workPackage.projectId },
    null,
  );
  if (project === null) throw new Error('capture fixture project is absent');
  expect(await stores.settings.write(project, { key: 'budgetFactor', value: 1.5 }, stamp)).toEqual({
    ok: true,
  });
  expect(await stores.directory.patchTeam('team-a', { serviceIds: ['service-a'] }, stamp)).toEqual({
    ok: true,
    team: { id: 'team-a', name: 'Team 1', serviceIds: ['service-a'] },
    workPackageIds: [],
  });
  expect(
    await stores.directory.addTag({ id: 'capture-tag-only', name: 'Capture-only tag' }, stamp),
  ).toEqual({ id: 'capture-tag-only', name: 'Capture-only tag' });
  expect(
    await stores.directory.addService(
      { id: 'capture-service-only', name: 'Capture-only service' },
      stamp,
    ),
  ).toEqual({ id: 'capture-service-only', name: 'Capture-only service' });
  expect(
    await stores.directory.addWorkItemType(
      { id: 'capture-type-only', name: 'Capture-only type' },
      stamp,
    ),
  ).toEqual({ id: 'capture-type-only', name: 'Capture-only type' });
  expect(
    await stores.directory.addPerson(
      { id: 'capture-person-unassigned', name: 'Unassigned member', kind: 'person' },
      ['team-b'],
      stamp,
    ),
  ).toEqual({
    ok: true,
    person: { id: 'capture-person-unassigned', name: 'Unassigned member', kind: 'person' },
  });
  expect(
    await stores.workItems.patch(
      'work-a-one',
      {
        name: 'Captured A',
        notes: 'all capture fields',
        startNoEarlierThan: '2026-10-02',
        startNoEarlierThanReason: 'fixture floor',
        deadline: '2026-10-20',
        readiness: 'ready',
        hold: 'blocked',
        priority: 7,
        serviceTeamId: 'team-a',
        maxParallel: 2,
        teamIds: ['team-a'],
        tagIds: ['tag-a'],
        serviceIds: ['service-a'],
        typeIds: ['type-a'],
        externalRefs: [],
      },
      stamp,
    ),
  ).toMatchObject({ ok: true });
  await stores.workItems.setFrozenNumbers([{ id: 'work-a-one', frozenNumber: 'A-001' }], stamp);
  expect(await stores.directory.assign('work-a-one', 'step-a-dev', 'person-a', stamp)).toEqual({
    ok: true,
  });
  expect(await stores.directory.assign('work-b-one', 'step-b-dev', 'person-b', stamp)).toEqual({
    ok: true,
  });
  expect(await stores.capacity.set('work-package-a', 'team-b', 4, stamp)).toEqual({ ok: true });
  expect(await stores.capacity.set('work-package-b', 'team-a', 6, stamp)).toEqual({ ok: true });
  expect(
    await stores.workPackages.update(
      'work-package-a',
      {
        name: 'Captured work package A',
        restricted: true,
        estimateMethod: 'pessimistic',
        depReach: 'anchor-slice',
        pertWeights: { optimistic: 2, realistic: 5, pessimistic: 3 },
        estimateRounding: 'round',
        startDate: '2026-10-01',
        solutionRef: { slug: 'capture-a', url: 'https://example.test/capture-a' },
        optimizationEnabled: true,
        scheduleEngine: 'optimized',
        scheduleObjective: 'time',
      },
      stamp,
    ),
  ).toMatchObject({ id: 'work-package-a', name: 'Captured work package A' });
  await expectWritten(
    stores.measureEstimates.set(
      {
        workItemId: 'work-a-one',
        stepId: 'step-a-dev',
        key: 'tokens',
        optimistic: 100,
        realistic: 200,
        pessimistic: 600,
        singlePoint: false,
      },
      stamp,
    ),
  );
  await stores.budgets.set(
    { workItemId: 'work-a-one', key: 'tokens', cap: 5000, policy: 'strict', holdPerAttempt: 300 },
    stamp,
  );
  await expectWritten(
    stores.estimates.set(
      {
        workItemId: 'work-a-one',
        stepId: 'step-a-dev',
        optimistic: 1,
        realistic: 2,
        pessimistic: 3,
      },
      stamp,
    ),
  );
  await expectWritten(
    stores.estimates.set(
      {
        workItemId: 'work-b-one',
        stepId: 'step-b-dev',
        optimistic: 11,
        realistic: 12,
        pessimistic: 13,
      },
      stamp,
    ),
  );
  await expectWritten(
    stores.actuals.set(
      { workItemId: 'work-a-one', stepId: 'step-a-qa', days: 4, recordedAt: 301 },
      stamp,
    ),
  );
  await expectWritten(
    stores.actuals.set(
      { workItemId: 'work-b-one', stepId: 'step-b-qa', days: 14, recordedAt: 401 },
      stamp,
    ),
  );
  await expectWritten(
    stores.progress.set(
      { workItemId: 'work-a-two', stepId: 'step-a-dev', state: 'done', statedAt: 302 },
      stamp,
    ),
  );
  await expectWritten(
    stores.progress.set(
      { workItemId: 'work-b-two', stepId: 'step-b-dev', state: 'in_progress', statedAt: 402 },
      stamp,
    ),
  );
  await expectWritten(
    stores.measures.set(
      {
        workItemId: 'work-a-two',
        stepId: 'step-a-qa',
        metric: 'token_actual',
        value: 500,
        recordedAt: 303,
      },
      stamp,
    ),
  );
  await expectWritten(
    stores.measures.set(
      {
        workItemId: 'work-b-two',
        stepId: 'step-b-qa',
        metric: 'hours_actual',
        value: 15,
        recordedAt: 403,
      },
      stamp,
    ),
  );
  await stores.dependencies.add(
    {
      id: 'capture-dependency-a',
      workPackageId: 'work-package-a',
      predecessorId: 'work-a-one',
      successorId: 'work-a-two',
    },
    stamp,
  );
  await stores.typedDependencies.add(
    {
      id: 'capture-typed-a',
      workPackageId: seed.workPackageIds[0],
      predecessor: {
        workPackageId: seed.workPackageIds[0],
        scope: 'whole',
        workItemId: seed.workItemIds[0][0],
      },
      successor: {
        workPackageId: seed.workPackageIds[0],
        scope: 'whole',
        workItemId: seed.workItemIds[0][1],
      },
      type: 'FS',
    },
    stamp,
  );
  await stores.typedDependencies.add(
    {
      id: 'capture-typed-b',
      workPackageId: seed.workPackageIds[1],
      predecessor: {
        workPackageId: seed.workPackageIds[1],
        scope: 'node',
        workItemId: seed.workItemIds[1][0],
        stepId: seed.stepIds[1][0],
      },
      successor: {
        workPackageId: seed.workPackageIds[1],
        scope: 'node',
        workItemId: seed.workItemIds[1][1],
        stepId: seed.stepIds[1][1],
      },
      type: 'FS',
    },
    stamp,
  );
  await stores.dependencies.add(
    {
      id: 'capture-dependency-b',
      workPackageId: 'work-package-b',
      predecessorId: 'work-b-two',
      successorId: 'work-b-one',
    },
    stamp,
  );
  expect(await stores.priorityBands.replace('work-package-a', A_BANDS, stamp)).toEqual({
    ok: true,
  });
  expect(await stores.priorityBands.replace('work-package-b', B_BANDS, stamp)).toEqual({
    ok: true,
  });

  const [workPackageA, workPackageB, dependenciesA, dependenciesB] = await Promise.all([
    readSeededPlanInput(stores, seed.workPackageIds[0]),
    readSeededPlanInput(stores, seed.workPackageIds[1]),
    stores.dependencies.listByWorkPackage(seed.workPackageIds[0]),
    stores.dependencies.listByWorkPackage(seed.workPackageIds[1]),
  ]);
  const completeState = {
    workPackageA: observePlanInput(workPackageA),
    workPackageB: observePlanInput(workPackageB),
  };
  expect(
    (['memory-unbumped', 'sqlite-bumped'] as const).map((revisionPolicy) => ({
      workPackageA: savedPlanCaptureExpected(seed, 0, revisionPolicy),
      workPackageB: savedPlanCaptureExpected(seed, 1, revisionPolicy),
    })),
  ).toContainEqual(completeState);
  expect(dependenciesA).toEqual([
    {
      id: 'capture-dependency-a',
      workPackageId: 'work-package-a',
      predecessorId: 'work-a-one',
      successorId: 'work-a-two',
    },
  ]);
  expect(dependenciesB).toEqual([
    {
      id: 'capture-dependency-b',
      workPackageId: 'work-package-b',
      predecessorId: 'work-b-two',
      successorId: 'work-b-one',
    },
  ]);
}

/** Changes one live typed relationship and removes the other after both captures. */
export async function changeSavedPlanCaptureTypedDependencies(
  stores: Pick<CaptureSeedStores, 'typedDependencies'>,
  seed: SeededPlan,
) {
  await stores.typedDependencies.update(
    {
      id: 'capture-typed-a',
      workPackageId: seed.workPackageIds[0],
      predecessor: {
        workPackageId: seed.workPackageIds[0],
        scope: 'whole',
        workItemId: seed.workItemIds[0][0],
      },
      successor: {
        workPackageId: seed.workPackageIds[0],
        scope: 'node',
        workItemId: seed.workItemIds[0][1],
        stepId: seed.stepIds[0][1],
      },
      type: 'FS',
    },
    seed.stamps[1],
  );
  await stores.typedDependencies.remove('capture-typed-b', seed.stamps[1]);
}

function captureAlternatives(seed: SeededPlan, missing: PlanInputReads | null) {
  return (['memory-unbumped', 'sqlite-bumped'] as const).map((revisionPolicy) => ({
    missing,
    workPackageA: savedPlanCaptureExpected(seed, 0, revisionPolicy),
    workPackageB: savedPlanCaptureExpected(seed, 1, revisionPolicy),
  }));
}

async function readComplete(port: SavedPlanCaptureStore, workPackageId: string) {
  const captured = await port.readPlanInput(workPackageId);
  expect(captured).not.toBeNull();
  if (captured === null) throw new Error(`capture unexpectedly absent for ${workPackageId}`);
  return captured;
}

function clearArray(array: readonly unknown[]) {
  Reflect.apply(Array.prototype.splice, array, [0, array.length]);
}

/** Shared complete, missing-work-package, and detached capture cases. */
export function savedPlanCaptureRegistrations(
  open: OpenCase<'savedPlanCapture'>,
): readonly CaseRegistration[] {
  return [
    storeCase(
      'savedPlanCapture',
      'savedPlanCapture.readPlanInput:complete',
      open,
      async ({ port, seed }) => {
        const captured = observePlanInput(await readComplete(port, seed.workPackageIds[0]));
        expect([
          savedPlanCaptureExpected(seed, 0, 'memory-unbumped'),
          savedPlanCaptureExpected(seed, 0, 'sqlite-bumped'),
        ]).toContainEqual(captured);
      },
    ),
    storeCase(
      'savedPlanCapture',
      'savedPlanCapture.readPlanInput:coherent-interleave',
      open,
      async ({ port, seed, scenario }) => {
        if (scenario.kind !== 'capture-interleave')
          throw new Error('coherent capture requires its interleave scenario');
        const heldRead = port.readPlanInput(seed.workPackageIds[0]);
        await scenario.firstRead.entered;
        let change: Awaited<ReturnType<typeof scenario.changeDirectory>> | undefined;
        let changeFailure: unknown;
        try {
          change = await scenario.changeDirectory();
        } catch (cause) {
          changeFailure = cause;
        } finally {
          scenario.firstRead.release();
        }
        const heldSettlement = await Promise.allSettled([heldRead]);
        if (changeFailure !== undefined)
          throw changeFailure instanceof Error
            ? changeFailure
            : new Error('capture directory change failed', { cause: changeFailure });
        const held = heldSettlement[0];
        if (held.status === 'rejected')
          throw held.reason instanceof Error
            ? held.reason
            : new Error(`held capture rejected: ${String(held.reason)}`);
        if (change === undefined) throw new Error('capture directory change did not settle');
        const tag = change.tag;
        const person = change.person;
        if (!tag.ok) throw new Error(`capture tag change was refused: ${tag.reason}`);
        if (!person.ok) throw new Error(`capture person change was refused: ${person.reason}`);
        if (held.value === null) throw new Error('held capture unexpectedly absent');
        const next = await readComplete(port, seed.workPackageIds[0]);
        const observed = {
          change: { tag, person },
          held: observePlanInput(held.value),
          next: observePlanInput(next),
        };
        expect(
          (['memory-unbumped', 'sqlite-bumped'] as const).map((revisionPolicy) => ({
            change: {
              tag: {
                ok: true as const,
                tag: { id: 'tag-a', name: 'Tag after interleave' },
                workPackageIds: [seed.workPackageIds[0]] as readonly string[],
              },
              person: {
                ok: true as const,
                person: {
                  id: 'capture-person-unassigned',
                  name: 'Unassigned member',
                  kind: 'person',
                  teamIds: ['team-a'] as readonly string[],
                  accountId: null as string | null,
                },
                workPackageIds: [] as readonly string[],
              },
            },
            held: savedPlanCaptureExpected(seed, 0, revisionPolicy, 'before'),
            next: savedPlanCaptureExpected(seed, 0, revisionPolicy, 'after'),
          })),
        ).toContainEqual(observed);
      },
    ),
    storeCase(
      'savedPlanCapture',
      'savedPlanCapture.readPlanInput:missing-work-package',
      open,
      async ({ port, seed }) => {
        const [missing, workPackageA, workPackageB] = await Promise.all([
          port.readPlanInput('capture-work-package-missing'),
          readComplete(port, seed.workPackageIds[0]),
          readComplete(port, seed.workPackageIds[1]),
        ]);
        expect(captureAlternatives(seed, null)).toContainEqual({
          missing,
          workPackageA: observePlanInput(workPackageA),
          workPackageB: observePlanInput(workPackageB),
        });
      },
    ),
    storeCase(
      'savedPlanCapture',
      'savedPlanCapture.readPlanInput:detached',
      open,
      async ({ port, seed, readers, scenario }) => {
        if (scenario.kind !== 'capture-typed-change')
          throw new Error('detached capture requires its typed-change scenario');
        const first = await readComplete(port, seed.workPackageIds[0]);
        const firstB = await readComplete(port, seed.workPackageIds[1]);
        expect(
          captureAlternatives(seed, null).map(({ workPackageA }) => workPackageA),
        ).toContainEqual(observePlanInput(first));
        expect(
          captureAlternatives(seed, null).map(({ workPackageB }) => workPackageB),
        ).toContainEqual(observePlanInput(firstB));
        const labelled = first.workItems.find(({ id }) => id === 'work-a-one');
        const unassigned = first.people.find(({ id }) => id === 'capture-person-unassigned');
        const team = first.teams.find(({ id }) => id === 'team-a');
        expect({ labelled, unassigned, team }).toMatchObject({
          labelled: { id: 'work-a-one' },
          unassigned: { id: 'capture-person-unassigned' },
          team: { id: 'team-a' },
        });
        if (labelled === undefined || unassigned === undefined || team === undefined)
          throw new Error('capture mutation witnesses are absent');
        for (const nested of [
          labelled.teamIds,
          labelled.tagIds,
          labelled.serviceIds,
          labelled.typeIds,
          unassigned.teamIds,
          team.serviceIds,
        ])
          clearArray(nested);
        for (const collection of [
          first.steps,
          first.workItems,
          first.estimates,
          first.actuals,
          first.progress,
          first.measures,
          first.dependencies,
          first.assignments,
          first.priorityBands,
          first.people,
          first.teams,
          first.services,
          first.tags,
          first.workItemTypes,
          first.externalSystems,
        ])
          clearArray(collection);
        const [workPackageA, workPackageB] = await Promise.all([
          readComplete(port, seed.workPackageIds[0]),
          readComplete(port, seed.workPackageIds[1]),
        ]);
        expect(captureAlternatives(seed, null)).toContainEqual({
          missing: null,
          workPackageA: observePlanInput(workPackageA),
          workPackageB: observePlanInput(workPackageB),
        });
        await scenario.changeTypedDependencies();
        expect(await readers.typedDependencies.listByWorkPackage(seed.workPackageIds[0])).toEqual([
          {
            id: 'capture-typed-a',
            workPackageId: seed.workPackageIds[0],
            predecessor: {
              workPackageId: seed.workPackageIds[0],
              scope: 'whole',
              workItemId: seed.workItemIds[0][0],
            },
            successor: {
              workPackageId: seed.workPackageIds[0],
              scope: 'node',
              workItemId: seed.workItemIds[0][1],
              stepId: seed.stepIds[0][1],
            },
            type: 'FS',
          },
        ]);
        expect(await readers.typedDependencies.listByWorkPackage(seed.workPackageIds[1])).toEqual(
          [],
        );
        expect(first.typedDependencies).toEqual([
          {
            id: 'capture-typed-a',
            predecessor: { scope: 'whole', workItemId: seed.workItemIds[0][0] },
            successor: { scope: 'whole', workItemId: seed.workItemIds[0][1] },
            type: 'FS',
          },
        ]);
        expect(firstB.typedDependencies).toEqual([
          {
            id: 'capture-typed-b',
            predecessor: {
              scope: 'node',
              workItemId: seed.workItemIds[1][0],
              stepId: seed.stepIds[1][0],
            },
            successor: {
              scope: 'node',
              workItemId: seed.workItemIds[1][1],
              stepId: seed.stepIds[1][1],
            },
            type: 'FS',
          },
        ]);
      },
    ),
  ];
}
