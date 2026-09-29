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

const PROJECT: Project = {
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
};

const TREE: WorkItemTree = {
  typedDependencies: [],
  workItems: [
    {
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
      measures: { hours: { 'step-1': 4 } },
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
        { id: 'person-used', name: 'Kat', kind: 'agent', teamIds: ['team-membership'] },
        { id: 'person-unused', name: 'Nobody', kind: 'person', teamIds: [] },
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
    listInOrganization: () =>
      Promise.reject(new Error('a legacy export read an organization catalog')),
  };
}

function service(directorySource = directory()) {
  return new PlanDocumentService({
    directory: directorySource,
    markers: { list: () => Promise.resolve({ ok: true, value: MARKERS }) },
    clock: { now: () => Date.parse('2026-09-13T12:30:00.000Z') },
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

test('preserves the existing JSON export fields', async () => {
  const exported = await exportDocument();
  const {
    document,
    settings,
    capacity,
    calendarMarkers,
    directory: names,
    stepNodes,
    ...existing
  } = exported;
  expect(existing).toEqual<unknown>({ project: PROJECT, ...TREE });
  expect(existing.workItems[0]?.deadline).toBe('2026-09-18');
  expect(existing.optimization).toEqual(TREE.optimization);
  expect({ document, settings, capacity, calendarMarkers, names, stepNodes }).toBeDefined();
});

test('JSON export is a versioned plan document and settings says what project says', async () => {
  const exported = await exportDocument();
  expect((await validateSchema(planDocumentResponse, exported)).issues).toBeUndefined();
  expect(exported.document).toEqual({
    format: 'wbs-plan',
    version: 6,
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
  Reflect.set(future.document, 'version', 7);
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

test('version 6 export keeps SS and FF types from the trusted tree', async () => {
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
      document: { version: 6 },
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
    { id: 'sn1.row-2.step-1', workItemId: 'row-2', stepId: 'step-1', reference: '1.1.build' },
  ]);
  const classified = await classifyPlanDocument(exported);
  if (!classified.ok) throw new Error(`current file refused at ${classified.path}`);
  expect(classified.value).not.toHaveProperty('stepNodes');
});

test('version 6 carries each row’s readiness and hold, and earlier versions read as nothing said', async () => {
  const exported = structuredClone(await exportDocument());
  expect(exported.document.version).toBe(6);
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
test('refuses a version-6 hold or readiness outside its vocabulary, on a parent, or a hold on done work', async () => {
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
  expect(await classifyPlanDocument(heldDone)).toEqual({
    ok: false,
    code: 'invalid_body',
    path: `workItems[${String(leafAt)}].hold`,
  });

  const missing = structuredClone(exported);
  Reflect.deleteProperty(missing.workItems[leafAt] ?? {}, 'hold');
  expect(await classifyPlanDocument(missing)).toEqual({
    ok: false,
    code: 'invalid_body',
    path: `workItems[${String(leafAt)}].hold`,
  });
});
