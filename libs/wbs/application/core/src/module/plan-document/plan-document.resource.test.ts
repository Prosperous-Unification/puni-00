import {
  type PlanDocument,
  planDocumentResponse,
  validateSchema,
  type WorkItemTree,
} from '@wbs/contracts';
import { expect, test } from 'bun:test';

import type { CalendarMarker, DirectoryStore, Project } from '../../index';
import { LEGACY_ACCESS } from '../../ports/organization-access';
import { classifyPlanDocument, PlanDocumentService } from './plan-document.resource';

const PROJECT: Project & { timezone: string } = {
  id: 'project-1',
  name: 'Release plan',
  ownerId: 'owner-1',
  restricted: true,
  estimateMethod: 'realistic',
  depReach: 'anchor-slice',
  pertWeights: { optimistic: 2, realistic: 5, pessimistic: 2 },
  estimateRounding: 'round',
  startDate: '2026-09-14',
  solutionRef: { slug: 'release-plan', url: 'https://example.test/release-plan' },
  revision: 7,
  createdAt: 1_000,
  optimizationEnabled: true,
  scheduleEngine: 'optimized',
  scheduleObjective: 'time',
  budgetFactor: 1.5,
  timezone: 'Europe/Kyiv',
};

const TREE: WorkItemTree = {
  typedDependencies: [],
  workItems: [
    {
      charged: {},
      blockages: {},
      id: 'row-1',
      projectId: PROJECT.id,
      parentId: null,
      position: 10,
      name: 'Ship',
      notes: 'Keep the deadline',
      frozenNumber: '1',
      startNoEarlierThan: '2026-09-14',
      startNoEarlierThanReason: 'Release window',
      deadline: '2026-09-18',
      factStart: null,
      factEnd: null,
      readiness: null,
      hold: null,
      priority: 2,
      serviceTeamId: 'team-direct',
      serviceId: 'service-direct',
      maxParallel: 2,
      revision: 3,
      teamIds: [],
      tagIds: ['tag-used'],
      serviceIds: [],
      typeIds: ['type-used'],
      externalRefs: [
        {
          id: 'ref-1',
          systemId: 'system-used',
          url: 'https://example.test/issues/1',
          name: 'ISSUE-1',
        },
      ],
      number: '1',
      estimates: { 'step-1': { optimistic: 1, realistic: 2, pessimistic: 3 } },
      rolledUp: false,
      actuals: { 'step-1': 1 },
      progress: { 'step-1': 'in_progress' },
      status: 'in_progress',
      // A legacy metric: the export keeps legacy metrics only (wbs-measure-budgets
      // design D22); the golden hashes below moved from 61243efa/f8bf291a when
      // this fixture's made-up `hours` key became `hours_actual`, and match the
      // export with the filter removed.
      measures: { hours_actual: { 'step-1': 4 } },
      dependsOn: [],
      finalDays: { 'step-1': 2 },
      finalTotal: 2,
      schedule: {
        duration: 2,
        estimated: true,
        earliestStart: 0,
        earliestFinish: 2,
        latestStart: 0,
        latestFinish: 2,
        float: 0,
        critical: true,
      },
      dates: { startsOn: '2026-09-14', endsOn: '2026-09-15' },
      assignees: { 'step-1': 'person-used' },
      doesEveryStep: null,
    },
  ],
  seq: 19,
  scheduleError: null,
  waitingForPerson: 0,
  waitingForCapacity: 1,
  slices: [
    {
      id: 'slice-1',
      workItemId: 'row-1',
      stepId: 'step-1',
      personId: 'person-used',
      duration: 2,
      estimated: true,
      earliestStart: 0,
      earliestFinish: 2,
      latestStart: 0,
      latestFinish: 2,
      float: 0,
      critical: true,
      boundBy: 'capacity',
      resourcePredecessorId: null,
      capacityPredecessorIds: [],
      capacityTeamId: 'team-membership',
      width: 1,
      effort: 2,
      lateBy: null,
    },
  ],
  steps: [
    {
      id: 'step-1',
      projectId: PROJECT.id,
      name: 'Build',
      position: 10,
      code: 'build',
      allowancePercent: 30,
      estimateUnit: 'workdays' as const,
    },
  ],
  assignedPeople: [{ id: 'person-used', name: 'Kat' }],
  teamCapacities: [{ serviceTeamId: 'team-capacity', size: 4 }],
  priorityBands: [
    { startsAt: 1, defaultValue: 1, label: 'Urgent' },
    { startsAt: 2, defaultValue: 2, label: 'High' },
    { startsAt: 3, defaultValue: 3, label: 'Medium' },
    { startsAt: 4, defaultValue: 4, label: 'Low' },
    { startsAt: 5, defaultValue: 5, label: 'Someday' },
  ],
  estimateMethod: PROJECT.estimateMethod,
  pertWeights: PROJECT.pertWeights,
  estimateRounding: PROJECT.estimateRounding,
  depReach: PROJECT.depReach,
  startDate: PROJECT.startDate,
  projectRevision: PROJECT.revision,
  optimization: {
    enabled: true,
    engine: 'optimized',
    objective: 'time',
    inputHash: 'input-hash',
    generation: 4,
    contractVersion: '7+test',
    budgetMs: 60_000,
    displayed: 'time',
    variants: {
      pri: { state: 'ready', proof: 'proven' },
      time: { state: 'ready', proof: 'proven' },
    },
    finishDays: { fast: 5, pri: 4, time: 3 },
    sameOrderAsFast: { pri: false, time: false },
  },
};

const MARKERS: CalendarMarker[] = [
  {
    id: 'marker-1',
    projectId: PROJECT.id,
    date: '2026-09-17',
    name: 'Launch',
    color: null,
    createdAt: 1_200,
  },
];

function directory(): Pick<
  DirectoryStore,
  | 'listInOrganization'
  | 'listTeams'
  | 'listPeople'
  | 'listTags'
  | 'listServices'
  | 'listWorkItemTypes'
  | 'listExternalSystems'
  | 'listResources'
> {
  return {
    listTeams: () =>
      Promise.resolve([
        { id: 'team-capacity', name: 'Capacity only', serviceIds: [] },
        { id: 'team-direct', name: 'Direct label', serviceIds: [] },
        { id: 'team-membership', name: 'Billing', serviceIds: ['service-owned'] },
        { id: 'team-unused', name: 'Unrelated team', serviceIds: [] },
      ]),
    listPeople: () =>
      Promise.resolve([
        // Bound, so the export assertions below prove the binding stays home.
        {
          id: 'person-used',
          name: 'Kat',
          kind: 'agent',
          teamIds: ['team-membership'],
          accountId: 'account-dany',
        },
        { id: 'person-unused', name: 'Nobody', kind: 'person', teamIds: [], accountId: null },
        { id: 'person-attempt', name: 'Ana', kind: 'person', teamIds: [], accountId: null },
      ]),
    listTags: () =>
      Promise.resolve([
        { id: 'tag-used', name: 'Release' },
        { id: 'tag-unused', name: 'Unrelated' },
      ]),
    listServices: () =>
      Promise.resolve([
        { id: 'service-direct', name: 'Delivery' },
        { id: 'service-owned', name: 'Billing API' },
        { id: 'service-unused', name: 'Unrelated service' },
      ]),
    listWorkItemTypes: () =>
      Promise.resolve([
        { id: 'type-used', name: 'Milestone' },
        { id: 'type-unused', name: 'Unrelated type' },
      ]),
    listExternalSystems: () =>
      Promise.resolve([
        { id: 'system-used', name: 'Tracker' },
        { id: 'system-unused', name: 'Unrelated tracker' },
      ]),
    listResources: () =>
      Promise.resolve([
        { id: 'resource-ram', name: 'h2puni ram', kind: 'divisible', unitLabel: 'GB' },
        { id: 'resource-stage', name: 'staging', kind: 'exclusive', unitLabel: 'env' },
        { id: 'resource-unused', name: 'Unrelated resource', kind: 'divisible', unitLabel: 'x' },
      ]),
    listInOrganization: () =>
      Promise.reject(new Error('a legacy export read an organization catalog')),
  };
}

/** A plan that states nothing about resources, as every plan before `wbs-resources` did. */
const NO_RESOURCE_FACTS = {
  resourceCapacitiesOf: () => Promise.resolve([]),
  demandsOf: () => Promise.resolve([]),
};

function service(
  directorySource = directory(),
  resourceFacts: ConstructorParameters<
    typeof PlanDocumentService
  >[0]['resourceFacts'] = NO_RESOURCE_FACTS,
) {
  return new PlanDocumentService({
    directory: directorySource,
    stepParallels: { listByProject: () => Promise.resolve([]) },
    markers: { list: () => Promise.resolve({ ok: true, value: MARKERS }) },
    clock: { now: () => Date.parse('2026-09-13T12:30:00.000Z') },
    resourceFacts,
  });
}

async function exportDocument(tree: WorkItemTree = TREE): Promise<PlanDocument> {
  const exported = await service().export(PROJECT, tree, LEGACY_ACCESS);
  if (!exported.ok) throw new Error(`export refused: ${exported.error}`);
  return exported.value;
}

async function exportError(tree: WorkItemTree): Promise<string> {
  const outcome = await service()
    .export(PROJECT, tree, LEGACY_ACCESS)
    .catch((caught: unknown) => caught);
  if (!(outcome instanceof Error)) throw new Error('malformed tree did not throw');
  return outcome.message;
}

// Proof: with every metric kept, this case exported `cost` and
// `agent_minutes` beside `hours_actual`; watched 2026-10-23.
test('exports legacy metrics only, leaving defined and derived measures out', async () => {
  const tree = structuredClone(TREE);
  tree.workItems = tree.workItems.map((row) => ({
    ...row,
    measures: {
      hours_actual: { 'step-1': 4 },
      cost: { 'step-1': 2_500_000 },
      agent_minutes: { 'step-1': 30 },
    },
  }));
  const exported = await exportDocument(tree);
  expect(exported.workItems.map(({ measures }) => measures)).toEqual(
    tree.workItems.map(() => ({ hours_actual: { 'step-1': 4 } })),
  );
});

test('preserves the existing JSON export fields', async () => {
  const exported = await exportDocument();
  const {
    document,
    settings,
    capacity,
    calendarMarkers,
    directory: names,
    stepNodes,
    stepBlockages,
    resourceCapacities,
    demands,
    ...existing
  } = exported;
  // The budget factor is left out of this version's document (`wbs-measure-budgets` D38).
  const { budgetFactor: _factor, ...exportedProject } = PROJECT;
  expect(existing).toEqual<unknown>({
    project: exportedProject,
    ...TREE,
    workItems: TREE.workItems.map(({ blockages: _blockages, ...row }) => row),
  });
  expect(stepBlockages).toEqual([]);
  // A plan that states no resource facts exports none, and no resource.
  expect({ resourceCapacities, demands, resources: names.resources }).toEqual({
    resourceCapacities: [],
    demands: [],
    resources: [],
  });
  expect(existing.workItems[0]?.deadline).toBe('2026-09-18');
  expect(existing.optimization).toEqual(TREE.optimization);
  expect({ document, settings, capacity, calendarMarkers, names, stepNodes }).toBeDefined();
});

test('JSON export is a versioned plan document and settings says what project says', async () => {
  const exported = await exportDocument();
  expect((await validateSchema(planDocumentResponse, exported)).issues).toBeUndefined();
  expect(exported.document).toEqual({
    format: 'wbs-plan',
    version: 10,
    exportedAt: '2026-09-13T12:30:00.000Z',
  });
  expect(exported.settings).toEqual({
    name: PROJECT.name,
    restricted: PROJECT.restricted,
    estimateMethod: PROJECT.estimateMethod,
    depReach: PROJECT.depReach,
    pertWeights: PROJECT.pertWeights,
    estimateRounding: PROJECT.estimateRounding,
    startDate: PROJECT.startDate,
    solutionRef: PROJECT.solutionRef,
    optimizationEnabled: PROJECT.optimizationEnabled,
    scheduleEngine: PROJECT.scheduleEngine,
    scheduleObjective: PROJECT.scheduleObjective,
    timezone: 'Europe/Kyiv',
  });
  expect(exported.capacity).toEqual([{ teamId: 'team-capacity', size: 4 }]);
  expect(exported.calendarMarkers).toEqual([
    { id: 'marker-1', date: '2026-09-17', name: 'Launch', color: null },
  ]);
});

test('capacity-only team is named and assigned agent keeps memberships and owned services', async () => {
  const exported = await exportDocument();
  expect(exported.directory.teams).toEqual([
    { id: 'team-capacity', name: 'Capacity only', serviceIds: [] },
    { id: 'team-direct', name: 'Direct label', serviceIds: [] },
    { id: 'team-membership', name: 'Billing', serviceIds: ['service-owned'] },
  ]);
  expect(exported.directory.people).toEqual([
    { id: 'person-used', name: 'Kat', kind: 'agent', teamIds: ['team-membership'] },
  ]);
  expect(exported.directory.services).toEqual([
    { id: 'service-direct', name: 'Delivery' },
    { id: 'service-owned', name: 'Billing API' },
  ]);
});

test('unreferenced tag is excluded', async () => {
  const exported = await exportDocument();
  expect(exported.directory.tags).toEqual([{ id: 'tag-used', name: 'Release' }]);
  expect(exported.directory.types).toEqual([{ id: 'type-used', name: 'Milestone' }]);
  expect(exported.directory.externalSystems).toEqual([{ id: 'system-used', name: 'Tracker' }]);
});

test('missing referenced entry throws', async () => {
  const missingTag = directory();
  missingTag.listTags = () => Promise.resolve([]);
  const cause = await service(missingTag)
    .export(PROJECT, TREE, LEGACY_ACCESS)
    .catch((caught: unknown) => caught);
  expect(cause).toBeInstanceOf(Error);
  expect((cause as Error).message).toContain('tag "tag-used"');
});

test('malformed priority names workItems[3].priority', async () => {
  const malformed = structuredClone(await exportDocument());
  const row = malformed.workItems[0];
  malformed.workItems = Array.from({ length: 4 }, () => structuredClone(row));
  Reflect.set(malformed.workItems[3] ?? {}, 'priority', 'high');
  expect(await classifyPlanDocument(malformed)).toEqual({
    ok: false,
    code: 'invalid_body',
    path: 'workItems[3].priority',
  });
});

test('unknown version precedes version-specific validation', async () => {
  const future = structuredClone(await exportDocument());
  Reflect.set(future.document, 'version', 11);
  const row = future.workItems[0];
  future.workItems = Array.from({ length: 4 }, () => structuredClone(row));
  Reflect.set(future.workItems[3] ?? {}, 'priority', 'high');
  expect(await classifyPlanDocument(future)).toEqual({
    ok: false,
    code: 'unsupported_version',
    path: 'document.version',
  });
});

test('refuses a version-4 document without its typed dependency list', async () => {
  const missing = structuredClone(await exportDocument());
  Reflect.set(missing.document, 'version', 4);
  Reflect.deleteProperty(missing, 'typedDependencies');
  expect(await classifyPlanDocument(missing)).toEqual({
    ok: false,
    code: 'invalid_typed_dependency',
    path: 'typedDependencies',
  });
});

test('version 5 classifies SS and FF while version 4 keeps its FS-only conversion', async () => {
  const latest = structuredClone(await exportDocument());
  latest.typedDependencies = [
    {
      id: 'start-link',
      predecessor: { scope: 'whole', workItem: 'row-1' },
      successor: { scope: 'whole', workItem: 'row-2' },
      type: 'SS',
    },
    {
      id: 'finish-link',
      predecessor: { scope: 'whole', workItem: 'row-1' },
      successor: { scope: 'whole', workItem: 'row-2' },
      type: 'FF',
    },
  ];
  const classified = await classifyPlanDocument(latest);
  expect(classified).toMatchObject({ ok: true });
  if (!classified.ok) return;
  expect(classified.value.typedDependencies.map(({ type }) => type)).toEqual(['SS', 'FF']);

  const legacy = structuredClone(latest);
  Reflect.set(legacy.document, 'version', 4);
  expect(await classifyPlanDocument(legacy)).toMatchObject({
    ok: false,
    code: 'invalid_typed_dependency',
    path: 'typedDependencies[0].type',
  });
});

test('version 5 refuses a missing relationship type', async () => {
  const latest = structuredClone(await exportDocument());
  const relationship: object = {
    id: 'untyped',
    predecessor: { scope: 'whole', workItem: 'row-1' },
    successor: { scope: 'whole', workItem: 'row-2' },
  };
  Reflect.set(latest, 'typedDependencies', [relationship]);
  expect(await classifyPlanDocument(latest)).toMatchObject({
    ok: false,
    code: 'invalid_typed_dependency',
    path: 'typedDependencies[0].type',
  });
});

test('the current export keeps SS and FF types from the trusted tree', async () => {
  const tree = structuredClone(TREE);
  tree.typedDependencies = [
    {
      id: 'start-link',
      predecessor: { scope: 'whole', workItemId: 'row-1' },
      successor: { scope: 'whole', workItemId: 'row-2' },
      type: 'SS',
    },
    {
      id: 'finish-link',
      predecessor: { scope: 'whole', workItemId: 'row-1' },
      successor: { scope: 'whole', workItemId: 'row-2' },
      type: 'FF',
    },
  ];
  const exported = await service().export(PROJECT, tree, LEGACY_ACCESS);
  expect(exported).toMatchObject({
    ok: true,
    value: {
      document: { version: 10 },
      typedDependencies: [
        { id: 'start-link', type: 'SS' },
        { id: 'finish-link', type: 'FF' },
      ],
    },
  });
});

test('archival validation projects derived fields away', async () => {
  const exported = await exportDocument();
  const classified = await classifyPlanDocument({ ...exported, audit: { importedBy: 'future' } });
  if (!classified.ok) throw new Error(`fixture document refused at ${classified.path}`);
  expect(classified.value).not.toHaveProperty('audit');
  expect(classified.value.workItems[0]).not.toHaveProperty('projectId');
  expect(classified.value.workItems[0]).not.toHaveProperty('number');
  expect(classified.value.workItems[0]).not.toHaveProperty('rolledUp');
  expect(classified.value.workItems[0]).not.toHaveProperty('schedule');
  expect(classified.value.steps[0]).not.toHaveProperty('projectId');
  expect(classified.value.workItems[0]?.estimates).toEqual(TREE.workItems[0]?.estimates);
});

test('exports each step’s allowance and reads it back from a current-format file', async () => {
  const exported = await exportDocument();
  expect(exported.steps[0]?.allowancePercent).toBe(30);

  const classified = await classifyPlanDocument(exported);

  if (!classified.ok) throw new Error(`current file refused at ${classified.path}`);
  expect(classified.value.steps[0]?.allowancePercent).toBe(30);
});

/** Proof: see `classifyPlanDocument`. */
test('refuses a current-format file whose step has no allowance', async () => {
  const exported = structuredClone(await exportDocument());
  Reflect.deleteProperty(exported.steps[0] ?? {}, 'allowancePercent');

  expect(await classifyPlanDocument(exported)).toEqual({
    ok: false,
    code: 'invalid_body',
    path: 'steps[0].allowancePercent',
  });
});

test('reads a version-1 file through the legacy conversion, every step at 0%', async () => {
  const legacy = structuredClone(await exportDocument());
  Reflect.set(legacy.document, 'version', 1);
  Reflect.deleteProperty(legacy.steps[0] ?? {}, 'allowancePercent');

  const classified = await classifyPlanDocument(legacy);

  if (!classified.ok) throw new Error(`legacy file refused at ${classified.path}`);
  expect(classified.value.steps[0]?.allowancePercent).toBe(0);
  expect(classified.value.steps[0]?.code).toBeNull();
});

/** Proof: see `classifyPlanDocument`. */
test('refuses a version-1 file that names a step allowance', async () => {
  const legacy = structuredClone(await exportDocument());
  Reflect.set(legacy.document, 'version', 1);

  expect(await classifyPlanDocument(legacy)).toEqual({
    ok: false,
    code: 'invalid_body',
    path: 'steps[0].allowancePercent',
  });
});

test('exports each step’s code and reads it back from a version-3 file', async () => {
  const exported = await exportDocument();
  expect(exported.steps.map(({ code }) => code)).toEqual(['build']);

  const classified = await classifyPlanDocument(exported);

  if (!classified.ok) throw new Error(`current file refused at ${classified.path}`);
  expect(classified.value.steps.map(({ code }) => code)).toEqual(['build']);
});

/** Proof: see `PlanDocumentService.export`. */
test('refuses to export a project holding an uncoded step, naming it', async () => {
  const uncoded = structuredClone(TREE);
  const step = uncoded.steps.at(0);
  if (step === undefined) throw new Error('fixture has no step');
  step.code = null;

  expect(await service().export(PROJECT, uncoded, LEGACY_ACCESS)).toEqual({
    ok: false,
    error: 'uncoded_steps',
    steps: [{ id: step.id, name: step.name }],
    command: 'bun run src/backfill-step-codes-cli.ts',
  });
});

test('throws on a step read without a code key', async () => {
  const keyless = structuredClone(TREE);
  Reflect.deleteProperty(keyless.steps[0] ?? {}, 'code');

  const cause = await service()
    .export(PROJECT, keyless, LEGACY_ACCESS)
    .catch((caught: unknown) => caught);
  expect(cause).toBeInstanceOf(Error);
  expect((cause as Error).message).toContain('was read without a code');
});

test('throws when the trusted tree omits typed dependencies', async () => {
  const missing = structuredClone(TREE);
  Reflect.deleteProperty(missing, 'typedDependencies');
  expect(await exportError(missing)).toContain('without typed dependencies');
});

test('throws when a trusted typed endpoint has no step', async () => {
  const incomplete = structuredClone(TREE);
  incomplete.typedDependencies = [
    {
      id: 'link',
      predecessor: { scope: 'node', workItemId: 'row-1' },
      successor: { scope: 'whole', workItemId: 'row-1' },
      type: 'FS',
    },
  ];
  expect(await exportError(incomplete)).toContain('has no step');
});

test('throws when a trusted typed relationship has an unknown type', async () => {
  const malformed = structuredClone(TREE);
  malformed.typedDependencies = [
    {
      id: 'link',
      predecessor: { scope: 'whole', workItemId: 'row-1' },
      successor: { scope: 'whole', workItemId: 'row-1' },
      type: 'FS',
    },
  ];
  Reflect.set(malformed.typedDependencies[0] ?? {}, 'type', 'SF');
  expect(await exportError(malformed)).toContain('unknown typed dependency type');
});

/** Proof: see `classifyPlanDocument`. */
test('refuses a version-3 file whose step has no string code', async () => {
  for (const code of [undefined, null, 7]) {
    const exported = structuredClone(await exportDocument());
    if (code === undefined) Reflect.deleteProperty(exported.steps[0] ?? {}, 'code');
    else Reflect.set(exported.steps[0] ?? {}, 'code', code);

    expect(await classifyPlanDocument(exported)).toEqual({
      ok: false,
      code: 'invalid_body',
      path: 'steps[0].code',
    });
  }
});

test('reads a version-2 file as before codes existed, leaving each code to suggestion', async () => {
  for (const code of [undefined, null, 'kept-nowhere', 7]) {
    const earlier = structuredClone(await exportDocument());
    Reflect.set(earlier.document, 'version', 2);
    if (code === undefined) Reflect.deleteProperty(earlier.steps[0] ?? {}, 'code');
    else Reflect.set(earlier.steps[0] ?? {}, 'code', code);

    const classified = await classifyPlanDocument(earlier);

    if (!classified.ok) throw new Error(`version-2 file refused at ${classified.path}`);
    expect(classified.value.steps.map((step) => step.code)).toEqual(earlier.steps.map(() => null));
    expect(classified.value.steps[0]?.allowancePercent).toBe(30);
  }
});

/** Proof: see `spellStepNodes`. */
test('spells each leaf’s step nodes beside their IDs', async () => {
  const nested = structuredClone(TREE);
  const parent = nested.workItems.at(0);
  if (parent === undefined) throw new Error('fixture has no row');
  nested.workItems.push({
    ...structuredClone(parent),
    id: 'row-2',
    parentId: parent.id,
    number: '1.1',
  });

  const exported = await exportDocument(nested);

  expect(exported.stepNodes).toEqual([
    { id: 'sn1.row-2.step-1', workItemId: 'row-2', stepId: 'step-1', reference: '1.1.s1-build' },
  ]);
  const classified = await classifyPlanDocument(exported);
  if (!classified.ok) throw new Error(`current file refused at ${classified.path}`);
  expect(classified.value).not.toHaveProperty('stepNodes');
});

test('version 6 carries each row’s readiness and hold, and earlier versions read as nothing said', async () => {
  const exported = structuredClone(await exportDocument());
  expect(exported.document.version).toBe(10);
  const row = exported.workItems.find(
    (each) => !exported.workItems.some((c) => c.parentId === each.id),
  );
  if (row === undefined) throw new Error('fixture has no leaf');
  Reflect.set(row, 'readiness', 'ready');
  Reflect.set(row, 'hold', 'blocked');

  const current = await classifyPlanDocument(exported);
  if (!current.ok) throw new Error(`current file refused at ${current.path}`);
  expect(current.value.workItems.find((each) => each.id === row.id)).toMatchObject({
    readiness: 'ready',
    hold: 'blocked',
  });

  for (const version of [4, 5]) {
    const older = structuredClone(exported);
    Reflect.set(older.document, 'version', version);
    if (version === 4) older.typedDependencies = [];
    const classified = await classifyPlanDocument(older);
    if (!classified.ok) throw new Error(`version ${String(version)} refused at ${classified.path}`);
    expect(
      classified.value.workItems.every((each) => each.readiness === null && each.hold === null),
    ).toBe(true);
  }
});

/** Proof: see `classifyPlanDocument`. */
test('refuses a version-6 hold or readiness outside its vocabulary or on a parent, and accepts a hold on done work', async () => {
  const exported = structuredClone(await exportDocument());
  const [only] = exported.workItems;
  // A child under the fixture's one row, so the file holds a parent and a leaf.
  exported.workItems.push({ ...structuredClone(only), id: 'row-child', parentId: only.id });
  const parentAt = 0;
  const leafAt = exported.workItems.length - 1;

  const paused = structuredClone(exported);
  Reflect.set(paused.workItems[leafAt] ?? {}, 'hold', 'paused');
  expect(await classifyPlanDocument(paused)).toEqual({
    ok: false,
    code: 'invalid_body',
    path: `workItems[${String(leafAt)}].hold`,
  });

  const unready = structuredClone(exported);
  Reflect.set(unready.workItems[leafAt] ?? {}, 'readiness', 'soon');
  expect(await classifyPlanDocument(unready)).toEqual({
    ok: false,
    code: 'invalid_body',
    path: `workItems[${String(leafAt)}].readiness`,
  });

  const onParent = structuredClone(exported);
  Reflect.set(onParent.workItems[parentAt] ?? {}, 'hold', 'on_hold');
  expect(await classifyPlanDocument(onParent)).toEqual({
    ok: false,
    code: 'invalid_body',
    path: `workItems[${String(parentAt)}].hold`,
  });

  const heldDone = structuredClone(exported);
  const doneRow = heldDone.workItems[leafAt];
  doneRow.progress = Object.fromEntries(heldDone.steps.map((step) => [step.id, 'done']));
  Reflect.set(doneRow, 'hold', 'on_hold');
  expect((await classifyPlanDocument(heldDone)).ok).toBe(true);

  const missing = structuredClone(exported);
  Reflect.deleteProperty(missing.workItems[leafAt] ?? {}, 'hold');
  expect(await classifyPlanDocument(missing)).toEqual({
    ok: false,
    code: 'invalid_body',
    path: `workItems[${String(leafAt)}].hold`,
  });
});

/** `TREE` with its leaf's Build node holding attempt 1 failed by Ana and attempt 2 running. */
function attemptedTree(): WorkItemTree {
  const tree = structuredClone(TREE);
  const [row] = tree.workItems;
  row.attempts = {
    'step-1': [
      {
        attemptNumber: 1,
        startedAt: Date.parse('2026-10-10T08:00:00.000Z'),
        endedAt: Date.parse('2026-10-10T09:30:00.000Z'),
        outcome: 'failed',
        executorPersonId: 'person-attempt',
        reference: 'PR #11',
        note: null,
      },
      {
        attemptNumber: 2,
        startedAt: Date.parse('2026-10-10T10:00:00.000Z'),
        endedAt: null,
        outcome: null,
        executorPersonId: null,
        reference: null,
        note: 'retry',
      },
    ],
  };
  row.spans = { 'step-1': { start: Date.parse('2026-10-10T08:00:00.000Z'), end: null } };
  row.span = { start: Date.parse('2026-10-10T08:00:00.000Z'), end: null };
  return tree;
}

test('exports a Kyiv project’s zone and each leaf’s attempts by step code, executors by name', async () => {
  const exported = await exportDocument(attemptedTree());
  expect((await validateSchema(planDocumentResponse, exported)).issues).toBeUndefined();
  expect(exported.settings.timezone).toBe('Europe/Kyiv');
  const [row] = exported.workItems;
  expect(row).not.toHaveProperty('spans');
  expect(row).not.toHaveProperty('span');
  expect(row.attempts).toEqual({
    build: [
      {
        number: 1,
        startedAt: '2026-10-10T08:00:00.000Z',
        endedAt: '2026-10-10T09:30:00.000Z',
        outcome: 'failed',
        executor: 'Ana',
        reference: 'PR #11',
        note: null,
      },
      {
        number: 2,
        startedAt: '2026-10-10T10:00:00.000Z',
        endedAt: null,
        outcome: null,
        executor: null,
        reference: null,
        note: 'retry',
      },
    ],
  });
  expect(exported.directory.people.map(({ name }) => name)).toEqual(['Kat', 'Ana']);
});

test('reads a version-7 file’s zone and attempts back, and a version-6 file as UTC with none', async () => {
  const exported = await exportDocument(attemptedTree());
  const current = await classifyPlanDocument(exported);
  if (!current.ok) throw new Error(`current file refused at ${current.path}`);
  expect(current.value.settings.timezone).toBe('Europe/Kyiv');
  expect(current.value.workItems[0]?.attempts).toEqual([
    {
      stepId: 'step-1',
      attemptNumber: 1,
      startedAt: Date.parse('2026-10-10T08:00:00.000Z'),
      endedAt: Date.parse('2026-10-10T09:30:00.000Z'),
      outcome: 'failed',
      executor: 'Ana',
      reference: 'PR #11',
      note: null,
    },
    {
      stepId: 'step-1',
      attemptNumber: 2,
      startedAt: Date.parse('2026-10-10T10:00:00.000Z'),
      endedAt: null,
      outcome: null,
      executor: null,
      reference: null,
      note: 'retry',
    },
  ]);

  const older = structuredClone(exported);
  Reflect.set(older.document, 'version', 6);
  const previous = await classifyPlanDocument(older);
  if (!previous.ok) throw new Error(`version 6 refused at ${previous.path}`);
  expect(previous.value.settings.timezone).toBe('UTC');
  expect(previous.value.workItems.every((each) => each.attempts.length === 0)).toBe(true);
});

/** Proof: each check's own, beside it in `classifyPlanDocument` (mounted, `step-node-attempt.controller.db`). */
test('refuses a version-7 zone, outcome, order, running pair or running number it cannot hold', async () => {
  const exported = await exportDocument(attemptedTree());
  const edited = (edit: (attempts: Record<string, unknown>[]) => void) => {
    const changed = structuredClone(exported);
    const attempts = changed.workItems[0]?.attempts?.['build'];
    if (attempts === undefined) throw new Error('the export lost its attempts');
    edit(attempts);
    return changed;
  };
  const zone = structuredClone(exported);
  zone.settings.timezone = 'Kyiv';
  const local = edited((attempts) => {
    Object.assign(attempts[0], { startedAt: '2026-10-10T08:00:00' });
  });
  const onParent = edited(() => undefined);
  const [attempted] = onParent.workItems;
  const { attempts: _attempts, ...child } = structuredClone(attempted);
  onParent.workItems.push({ ...child, id: 'row-child', parentId: 'row-1' });
  const cases: [unknown, string][] = [
    [zone, 'settings.timezone'],
    [
      edited((attempts) => Object.assign(attempts[0] ?? {}, { outcome: 'won' })),
      'workItems[0].attempts.build[0]',
    ],
    [
      edited((attempts) =>
        Object.assign(attempts[0] ?? {}, { endedAt: '2026-10-10T07:00:00.000Z' }),
      ),
      'workItems[0].attempts.build[0].endedAt',
    ],
    [
      edited((attempts) => Object.assign(attempts[0] ?? {}, { outcome: null })),
      'workItems[0].attempts.build[0].outcome',
    ],
    [
      edited((attempts) => Object.assign(attempts[0] ?? {}, { endedAt: null, outcome: null })),
      'workItems[0].attempts.build',
    ],
    [
      edited((attempts) => attempts.push({ ...attempts[0], number: 3 })),
      'workItems[0].attempts.build',
    ],
    [
      edited((attempts) => Object.assign(attempts[1] ?? {}, { number: 1 })),
      'workItems[0].attempts.build[1].number',
    ],
    [local, 'workItems[0].attempts.build[0].startedAt'],
    [onParent, 'workItems[0].attempts.build'],
  ];
  for (const [file, path] of cases) {
    expect(await classifyPlanDocument(file)).toEqual({ ok: false, code: 'invalid_body', path });
  }
});

test('version 8 keeps minute step units and refuses missing or unknown written units', async () => {
  const tree = structuredClone(TREE);
  tree.steps = tree.steps.map((step) => ({ ...step, estimateUnit: 'minutes' }));
  const document = await exportDocument(tree);
  expect(document.document.version).toBe(10);
  const classified = await classifyPlanDocument(document);
  expect(classified.ok).toBe(true);
  if (!classified.ok) throw new Error('minute document refused');
  expect(classified.value.steps[0]?.estimateUnit).toBe('minutes');
  for (const unit of [undefined, 'hours']) {
    const damaged = structuredClone(document);
    if (unit === undefined) Reflect.deleteProperty(damaged.steps[0] ?? {}, 'estimateUnit');
    else Reflect.set(damaged.steps[0] ?? {}, 'estimateUnit', unit);
    expect(await classifyPlanDocument(damaged)).toEqual({
      ok: false,
      code: 'invalid_body',
      path: 'steps[0].estimateUnit',
    });
  }
  const older = structuredClone(document);
  Reflect.set(older.document, 'version', 7);
  Reflect.deleteProperty(older.steps[0] ?? {}, 'estimateUnit');
  const historical = await classifyPlanDocument(older);
  if (!historical.ok) throw new Error('historical document refused');
  expect(historical.value.steps[0]?.estimateUnit).toBe('workdays');
  const missing = structuredClone(TREE);
  Reflect.deleteProperty(missing.steps[0] ?? {}, 'estimateUnit');
  expect(await exportError(missing)).toContain('estimate unit');
});

test('v9 exports detached direct blockage facts and excludes row aliases', async () => {
  const tree = structuredClone(TREE);
  const row = tree.workItems.at(0);
  if (row === undefined) throw new Error('missing fixture row');
  row.blockages = { 'step-1': { blockedAt: -17 } };
  const exported = await service().export(PROJECT, tree, LEGACY_ACCESS);
  expect(exported.ok).toBe(true);
  if (!exported.ok) return;
  expect(exported.value.document.version).toBe(10);
  expect(Reflect.get(exported.value, 'stepBlockages')).toEqual([
    { workItemId: 'row-1', stepId: 'step-1', blockedAt: -17 },
  ]);
  expect(exported.value.workItems[0]).not.toHaveProperty('blockages');
  row.blockages['step-1'] = { blockedAt: 50 };
  expect(Reflect.get(exported.value, 'stepBlockages')).toEqual([
    { workItemId: 'row-1', stepId: 'step-1', blockedAt: -17 },
  ]);
});

test('v9 requires facts and legacy files refuse facts instead of losing them', async () => {
  const exported = await exportDocument();
  const current = { ...exported, document: { ...exported.document, version: 9 } };
  Reflect.deleteProperty(current, 'stepBlockages');
  expect(await classifyPlanDocument(current)).toEqual({
    ok: false,
    code: 'invalid_body',
    path: 'stepBlockages',
  });
  for (let version = 1; version <= 8; version++) {
    const legacy = {
      ...exported,
      document: { ...exported.document, version },
      stepBlockages: [{ workItemId: 'row-1', stepId: 'step-1', blockedAt: 3 }],
    };
    expect(await classifyPlanDocument(legacy)).toEqual({
      ok: false,
      code: 'invalid_body',
      path: 'stepBlockages[0]',
    });
  }
});

test('v9 excludes derived blockage causes and captured exports retain the same facts', async () => {
  const tree = structuredClone(TREE);
  const row = tree.workItems.at(0);
  if (row === undefined) throw new Error('missing row');
  row.blockages = { 'step-1': { blockedAt: 42 } };
  row.blockageCauses = { 'step-1': [{ kind: 'work-item', workItemId: row.id }] };
  const exported = await exportDocument(tree);
  expect(exported.workItems[0]).not.toHaveProperty('blockageCauses');
  const captured = service().exportCaptured(PROJECT, tree, {
    directory: {
      teams: await directory().listTeams(),
      people: await directory().listPeople(),
      tags: await directory().listTags(),
      services: await directory().listServices(),
      types: await directory().listWorkItemTypes(),
      externalSystems: await directory().listExternalSystems(),
    },
    markers: MARKERS,
    stepParallels: [],
    resources: { resources: await directory().listResources(), capacities: [], demands: [] },
  });
  expect(captured).toEqual({ ok: true, value: exported });
});

for (const [name, mutate, message] of [
  [
    'absent leaf map',
    (tree: WorkItemTree) => Reflect.deleteProperty(tree.workItems[0] ?? {}, 'blockages'),
    /without blockages/,
  ],
  [
    'unknown step',
    (tree: WorkItemTree) =>
      Reflect.set(tree.workItems[0] ?? {}, 'blockages', { missing: { blockedAt: 1 } }),
    /unknown step/,
  ],
  [
    'unsafe time',
    (tree: WorkItemTree) =>
      Reflect.set(tree.workItems[0] ?? {}, 'blockages', { 'step-1': { blockedAt: 1.5 } }),
    /invalid time/,
  ],
  [
    'parent owner',
    (tree: WorkItemTree) => {
      tree.workItems.push({
        ...tree.workItems[0],
        id: 'child',
        parentId: 'row-1',
        blockages: {},
      });
      Reflect.set(tree.workItems[0] ?? {}, 'blockages', { 'step-1': { blockedAt: 1 } });
    },
    /parent/,
  ],
] as const)
  test(`v9 trusted export refuses ${name}`, async () => {
    const tree = structuredClone(TREE);
    mutate(tree);
    expect(await exportError(tree)).toMatch(message);
  });

for (const held of [
  null,
  {},
  'wrong',
  [null],
  [{ workItemId: 1, stepId: 'step-1', blockedAt: 1 }],
  [{ workItemId: 'row-1', stepId: 1, blockedAt: 1 }],
  [{ workItemId: 'row-1', stepId: 'step-1', blockedAt: 1.5 }],
  [{ workItemId: 'row-1', stepId: 'step-1', blockedAt: Number.MAX_SAFE_INTEGER + 1 }],
]) {
  test(`v9 classifies malformed facts ${JSON.stringify(held)}`, async () => {
    const document = await exportDocument();
    Reflect.set(document, 'stepBlockages', held);
    expect(await classifyPlanDocument(document)).toMatchObject({ ok: false, code: 'invalid_body' });
  });
}

test('legacy row blockage aliases are refused, while empty aliases normalize to no facts', async () => {
  for (let version = 1; version <= 8; version++) {
    const document = await exportDocument();
    Reflect.set(document.document, 'version', version);
    if (version === 1)
      document.steps.forEach((step) => Reflect.deleteProperty(step, 'allowancePercent'));
    Reflect.set(document.workItems[0] ?? {}, 'blockages', { 'step-1': { blockedAt: 1 } });
    expect(await classifyPlanDocument(document)).toEqual({
      ok: false,
      code: 'invalid_body',
      path: 'workItems[0].blockages',
    });
    Reflect.set(document.workItems[0] ?? {}, 'blockages', {});
    expect(await classifyPlanDocument(document)).toMatchObject({
      ok: true,
      value: { stepBlockages: [] },
    });
  }
});

test('v9 trusted export refuses a malformed leaf blockage map', async () => {
  const tree = structuredClone(TREE);
  Reflect.set(tree.workItems[0] ?? {}, 'blockages', []);
  expect(await exportError(tree)).toMatch(/malformed blockages/);
});

test('plan document excludes derived node resources from isolated and captured exports', async () => {
  const tree = structuredClone(TREE);
  const row = tree.workItems.at(0);
  if (row === undefined) throw new Error('missing fixture row');
  row.nodeResources = {
    'step-1': {
      nodeId: 'sn1.w.s',
      assignment: { kind: 'unassigned' },
      teams: { kind: 'unstated' },
      maxParallel: 3,
      width: 3,
    },
  };
  const exported = await exportDocument(tree);
  expect(exported.workItems[0]).not.toHaveProperty('nodeResources');
});

test('v9 refuses authored sparse parallelism on direct and captured JSON exports', async () => {
  const parallel = { workItemId: 'row-1', stepId: 'step-1', maxParallel: 2 };
  const writer = new PlanDocumentService({
    directory: directory(),
    markers: { list: () => Promise.resolve({ ok: true, value: MARKERS }) },
    clock: { now: () => 0 },
    resourceFacts: NO_RESOURCE_FACTS,
    stepParallels: {
      listByProject: (projectId) => {
        if (projectId !== PROJECT.id) throw new Error('wrong sparse project');
        return Promise.resolve([parallel]);
      },
    },
  });
  expect(await writer.export(PROJECT, TREE, LEGACY_ACCESS)).toEqual({
    ok: false,
    error: 'unsupported_step_parallelism',
  });
  expect(
    writer.exportCaptured(PROJECT, TREE, {
      directory: { teams: [], people: [], tags: [], services: [], types: [], externalSystems: [] },
      markers: [],
      resources: { resources: [], capacities: [], demands: [] },
      stepParallels: [parallel],
    }),
  ).toEqual({ ok: false, error: 'unsupported_step_parallelism' });
});

for (const [name, sparse, message] of [
  ['missing collection', undefined, /without step parallelism/],
  ['null collection', null, /without step parallelism/],
  ['object collection', {}, /without step parallelism/],
  ['array row', [[]], /malformed step parallelism/],
  ['missing maximum', [{ workItemId: 'row-1', stepId: 'step-1' }], /malformed step parallelism/],
  [
    'string maximum',
    [{ workItemId: 'row-1', stepId: 'step-1', maxParallel: '2' }],
    /malformed step parallelism/,
  ],
  ['null row', [null], /malformed step parallelism/],
  [
    'numeric owner',
    [{ workItemId: 1, stepId: 'step-1', maxParallel: 2 }],
    /malformed step parallelism/,
  ],
  [
    'numeric step',
    [{ workItemId: 'row-1', stepId: 1, maxParallel: 2 }],
    /malformed step parallelism/,
  ],
  [
    'missing owner',
    [{ workItemId: 'missing', stepId: 'step-1', maxParallel: 2 }],
    /unknown work item/,
  ],
  ['missing step', [{ workItemId: 'row-1', stepId: 'missing', maxParallel: 2 }], /unknown step/],
  [
    'fraction',
    [{ workItemId: 'row-1', stepId: 'step-1', maxParallel: 1.5 }],
    /integer from 1 to 1000/,
  ],
  ['zero', [{ workItemId: 'row-1', stepId: 'step-1', maxParallel: 0 }], /integer from 1 to 1000/],
  [
    'too large',
    [{ workItemId: 'row-1', stepId: 'step-1', maxParallel: 1001 }],
    /integer from 1 to 1000/,
  ],
  [
    'duplicate',
    Array(2).fill({ workItemId: 'row-1', stepId: 'step-1', maxParallel: 2 }),
    /duplicate step parallelism/,
  ],
] as const) {
  test(`v9 refuses corrupt captured sparse evidence: ${name}`, () => {
    const reads = {
      directory: { teams: [], people: [], tags: [], services: [], types: [], externalSystems: [] },
      markers: [],
      resources: { resources: [], capacities: [], demands: [] },
      stepParallels: sparse,
    };
    expect(() => service().exportCaptured(PROJECT, TREE, reads as never)).toThrow(message);
  });
}

test('v9 direct export propagates unreadable sparse state', async () => {
  const failure = new Error('sparse state unreadable');
  const writer = new PlanDocumentService({
    directory: directory(),
    markers: { list: () => Promise.resolve({ ok: true, value: MARKERS }) },
    clock: { now: () => 0 },
    resourceFacts: NO_RESOURCE_FACTS,
    stepParallels: { listByProject: () => Promise.reject(failure) },
  });
  const caught = await writer.export(PROJECT, TREE, LEGACY_ACCESS).catch((cause: unknown) => cause);
  expect(caught).toBe(failure);
});

test('v9 refuses construction without its sparse read capability', () => {
  expect(
    () =>
      new PlanDocumentService({
        directory: directory(),
        markers: { list: () => Promise.resolve({ ok: true, value: [] }) },
        clock: { now: () => 0 },
        resourceFacts: NO_RESOURCE_FACTS,
      } as never),
  ).toThrow(/step parallelism reader/);
});

for (const [name, mutate, message] of [
  [
    'foreign owner',
    (tree: WorkItemTree) => {
      Reflect.set(tree.workItems[0] ?? {}, 'projectId', 'foreign');
    },
    /foreign work item/,
  ],
  [
    'foreign step',
    (tree: WorkItemTree) => {
      Reflect.set(tree.steps[0] ?? {}, 'projectId', 'foreign');
    },
    /foreign step/,
  ],
  [
    'parent owner',
    (tree: WorkItemTree) => {
      tree.workItems.push({ ...tree.workItems[0], id: 'child', parentId: 'row-1' });
    },
    /parent work item/,
  ],
] as const) {
  test(`v9 refuses sparse ownership corruption: ${name}`, () => {
    const tree = structuredClone(TREE);
    mutate(tree);
    expect(() =>
      service().exportCaptured(PROJECT, tree, {
        directory: {
          teams: [],
          people: [],
          tags: [],
          services: [],
          types: [],
          externalSystems: [],
        },
        markers: [],
        stepParallels: [{ workItemId: 'row-1', stepId: 'step-1', maxParallel: 2 }],
        resources: { resources: [], capacities: [], demands: [] },
      }),
    ).toThrow(message);
  });
}

test('v9 sparse pair identities never alias at colons', () => {
  const tree = structuredClone(TREE);
  const row = tree.workItems.at(0);
  const step = tree.steps.at(0);
  if (row === undefined || step === undefined) throw new Error('missing pair fixture');
  tree.workItems = [
    { ...row, id: 'a' },
    { ...row, id: 'a:b' },
  ];
  tree.steps = [
    { ...step, id: 'b:c' },
    { ...step, id: 'c' },
  ];
  expect(
    service().exportCaptured(PROJECT, tree, {
      directory: { teams: [], people: [], tags: [], services: [], types: [], externalSystems: [] },
      markers: [],
      resources: { resources: [], capacities: [], demands: [] },
      stepParallels: [
        { workItemId: 'a', stepId: 'b:c', maxParallel: 1 },
        { workItemId: 'a:b', stepId: 'c', maxParallel: 1 },
      ],
    }),
  ).toEqual({ ok: false, error: 'unsupported_step_parallelism' });
});

test('v9 zero-fact export retains canonical bytes', async () => {
  // Version 10 adds three lists and changes nothing else: a plan that states no
  // resource facts, with those lists taken off and its version read as 9, is
  // the v9 golden byte for byte.
  const exported = structuredClone(await exportDocument());
  const { resources, ...directoryBefore } = exported.directory;
  const { resourceCapacities, demands, ...rest } = exported;
  expect({ resources, resourceCapacities, demands }).toEqual({
    resources: [],
    resourceCapacities: [],
    demands: [],
  });
  const bytes = JSON.stringify({
    ...rest,
    document: { ...rest.document, version: 9 },
    directory: directoryBefore,
  });
  expect(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')).toBe(
    '016181aa4021ca4b8b400feac0780e135635c49d149f2fd13e655015ceb1e6e5',
  );
});

test('uncoded steps retain precedence over unreadable sparse export evidence', async () => {
  const tree = structuredClone(TREE);
  const step = tree.steps.at(0);
  if (step === undefined) throw new Error('missing uncoded fixture');
  step.code = null;
  const writer = new PlanDocumentService({
    directory: directory(),
    markers: { list: () => Promise.resolve({ ok: true, value: [] }) },
    clock: { now: () => 0 },
    resourceFacts: NO_RESOURCE_FACTS,
    stepParallels: {
      listByProject: () => Promise.reject(new Error('must not read before uncoded refusal')),
    },
  });
  expect(await writer.export(PROJECT, tree, LEGACY_ACCESS)).toEqual({
    ok: false,
    error: 'uncoded_steps',
    steps: [{ id: 'step-1', name: 'Build' }],
    command: 'bun run src/backfill-step-codes-cli.ts',
  });
  expect(
    writer.exportCaptured(PROJECT, tree, {
      directory: { teams: [], people: [], tags: [], services: [], types: [], externalSystems: [] },
      markers: [],
      resources: { resources: [], capacities: [], demands: [] },
      stepParallels: [{ workItemId: 'row-1', stepId: 'step-1', maxParallel: 2 }],
    }),
  ).toEqual({
    ok: false,
    error: 'uncoded_steps',
    steps: [{ id: 'step-1', name: 'Build' }],
    command: 'bun run src/backfill-step-codes-cli.ts',
  });
});

/** The project states a capacity of RAM and staging, and its row demands both. */
const RESOURCE_FACTS = {
  resourceCapacitiesOf: () =>
    Promise.resolve([
      { resourceId: 'resource-stage', units: 0 },
      { resourceId: 'resource-ram', units: 32 },
    ]),
  demandsOf: () =>
    Promise.resolve([
      { workItemId: 'row-1', resourceId: 'resource-stage', units: 1 },
      { workItemId: 'row-1', resourceId: 'resource-ram', units: 4 },
    ]),
};

async function exportWithResources(): Promise<PlanDocument> {
  const exported = await service(directory(), RESOURCE_FACTS).export(PROJECT, TREE, LEGACY_ACCESS);
  if (!exported.ok) throw new Error(`export refused: ${exported.error}`);
  return exported.value;
}

test('exports only the resources its capacities and demands name (wbs-resources)', async () => {
  const exported = await exportWithResources();
  expect(exported.document.version).toBe(10);
  expect((await validateSchema(planDocumentResponse, exported)).issues).toBeUndefined();
  expect(exported.directory.resources).toEqual([
    { id: 'resource-ram', name: 'h2puni ram', kind: 'divisible', unitLabel: 'GB' },
    { id: 'resource-stage', name: 'staging', kind: 'exclusive', unitLabel: 'env' },
  ]);
  expect(exported.resourceCapacities).toEqual([
    { resourceId: 'resource-ram', units: 32 },
    { resourceId: 'resource-stage', units: 0 },
  ]);
  expect(exported.demands).toEqual([
    { workItemId: 'row-1', resourceId: 'resource-ram', units: 4 },
    { workItemId: 'row-1', resourceId: 'resource-stage', units: 1 },
  ]);
});

test('v10 resources export retains canonical bytes', async () => {
  const bytes = JSON.stringify(await exportWithResources());
  expect(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')).toBe(
    'f2308a55167653345d85178e2253675097c1ee00956f34c4df933da06163fa4a',
  );
});

test('reads a version-10 file’s resources, capacities and demands back', async () => {
  const classified = await classifyPlanDocument(await exportWithResources());
  if (!classified.ok) throw new Error(`refused at ${classified.path}`);
  expect(classified.value.directory.resources.map(({ id }) => id)).toEqual([
    'resource-ram',
    'resource-stage',
  ]);
  expect(classified.value.resourceCapacities).toHaveLength(2);
  expect(classified.value.demands).toHaveLength(2);
});

test('refuses a version-10 file with a malformed resource, capacity or demand', async () => {
  const exported = await exportWithResources();
  for (const [path, damage] of [
    [
      'directory.resources[0]',
      (file: PlanDocument) => Reflect.set(file.directory.resources[0] ?? {}, 'kind', 'renewable'),
    ],
    [
      'resourceCapacities[0]',
      (file: PlanDocument) => Reflect.set(file.resourceCapacities[0] ?? {}, 'units', -1),
    ],
    [
      'resourceCapacities[0]',
      (file: PlanDocument) => Reflect.set(file.resourceCapacities[0] ?? {}, 'units', 1.5),
    ],
    ['demands[0]', (file: PlanDocument) => Reflect.set(file.demands[0] ?? {}, 'units', 0)],
    [
      'demands[0]',
      (file: PlanDocument) => Reflect.set(file.demands[0] ?? {}, 'units', 1_000_000_001),
    ],
    ['demands', (file: PlanDocument) => Reflect.deleteProperty(file, 'demands')],
    [
      'resourceCapacities',
      (file: PlanDocument) => Reflect.deleteProperty(file, 'resourceCapacities'),
    ],
    [
      'directory.resources',
      (file: PlanDocument) => Reflect.deleteProperty(file.directory, 'resources'),
    ],
  ] as const) {
    const file = structuredClone(exported);
    damage(file);
    expect({ path, outcome: await classifyPlanDocument(file) }).toEqual({
      path,
      outcome: { ok: false, code: 'invalid_body', path },
    });
  }
});

test('refuses resources in a file older than version 10', async () => {
  const exported = await exportWithResources();
  for (const [path, keep] of [
    ['directory.resources', (file: PlanDocument) => Reflect.set(file, 'demands', [])],
    ['resourceCapacities', (file: PlanDocument) => Reflect.set(file.directory, 'resources', [])],
    [
      'demands',
      (file: PlanDocument) => {
        Reflect.set(file.directory, 'resources', []);
        Reflect.set(file, 'resourceCapacities', []);
      },
    ],
  ] as const) {
    const file = structuredClone(exported);
    Reflect.set(file.document, 'version', 9);
    keep(file);
    expect({ path, outcome: await classifyPlanDocument(file) }).toEqual({
      path,
      outcome: { ok: false, code: 'invalid_body', path },
    });
  }
  // A version-9 file that names none of them reads as a plan with none.
  const empty = structuredClone(exported);
  Reflect.set(empty.document, 'version', 9);
  for (const strip of ['resourceCapacities', 'demands'] as const)
    Reflect.deleteProperty(empty, strip);
  Reflect.deleteProperty(empty.directory, 'resources');
  const classified = await classifyPlanDocument(empty);
  if (!classified.ok) throw new Error(`refused at ${classified.path}`);
  expect({
    resources: classified.value.directory.resources,
    capacities: classified.value.resourceCapacities,
    demands: classified.value.demands,
  }).toEqual({ resources: [], capacities: [], demands: [] });
});
