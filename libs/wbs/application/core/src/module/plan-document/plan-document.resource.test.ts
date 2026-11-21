import {
  createPlanDocumentV10,
  type PlanDocumentV13 as PlanDocument,
  planDocumentV13,
  planDocumentV14,
  requestSchema,
  responseSchema,
  validateSchema,
  type WorkItemTree,
} from '@wbs/contracts';
import { isLegacyMetric, SEEDED_MEASURE_DEFINITIONS } from '@wbs/domain';
import { expect, test } from 'bun:test';

import type { CalendarMarker, DirectoryStore, WorkPackage } from '../../index';
import { LEGACY_ACCESS } from '../../ports/organization-access';
import type { PlanDocumentReads } from '../../ports/shared-people-values';
import { createConnectedBlockageRead } from '../../testing/connected-blockage.fixture';
import { workPackageConnectedDocument } from './connected-document';
import { classifyPlanDocument, PlanDocumentService } from './plan-document.resource';

const planDocumentV13Response = responseSchema(planDocumentV13);
const planDocumentV10Response = responseSchema(createPlanDocumentV10());
const planDocumentV14Response = responseSchema(planDocumentV14);

/** Original owner-bearing constructed control, not a released binary capture. */
const LEGACY_WORK_PACKAGE: Omit<WorkPackage, 'projectId'> & { ownerId: string; timezone: string } =
  {
    id: 'work-package-1',
    abbreviation: 'PLAN',
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
    // The default factor; the measure cases below state 1.5 (design D67).
    budgetFactor: 1,
    timezone: 'Europe/Kyiv',
  };
const { ownerId: _retiredOwner, ...CURRENT_WORK_PACKAGE } = LEGACY_WORK_PACKAGE;
const WORK_PACKAGE: WorkPackage & { timezone: string } = {
  ...CURRENT_WORK_PACKAGE,
  projectId: 'fixture-project',
};
const PROJECT = { id: WORK_PACKAGE.projectId, name: 'Fixture parent' };

const TREE: WorkItemTree = {
  typedDependencies: [],
  workItems: [
    {
      charged: {},
      blockages: {},
      id: 'row-1',
      workPackageId: WORK_PACKAGE.id,
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
      workPackageId: WORK_PACKAGE.id,
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
  estimateMethod: WORK_PACKAGE.estimateMethod,
  pertWeights: WORK_PACKAGE.pertWeights,
  estimateRounding: WORK_PACKAGE.estimateRounding,
  depReach: WORK_PACKAGE.depReach,
  startDate: WORK_PACKAGE.startDate,
  workPackageRevision: WORK_PACKAGE.revision,
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
    workPackageId: WORK_PACKAGE.id,
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

/** A plan that holds no measures, as every plan before `wbs-measure-budgets` did. */
const NO_MEASURE_FACTS = {
  measureDefinitionsOf: () => Promise.resolve(null),
  measuresOf: () => Promise.resolve([]),
  measureEstimatesOf: () => Promise.resolve([]),
  budgetsOf: () => Promise.resolve([]),
};

/** {@link NO_MEASURE_FACTS} as captured export evidence. */
const NO_MEASURE_READS = { definitions: null, facts: [], estimates: [], budgets: [] };

/** A plan that states nothing about resources, as every plan before `wbs-resources` did. */
const NO_RESOURCE_FACTS = {
  resourceCapacitiesOf: () => Promise.resolve([]),
  demandsOf: () => Promise.resolve([]),
};

interface FixtureResourceFacts {
  resourceCapacitiesOf: () => Promise<PlanDocumentReads['resources']['capacities']>;
  demandsOf: () => Promise<PlanDocumentReads['resources']['demands']>;
}
interface FixtureMeasureFacts {
  measureDefinitionsOf: () => Promise<PlanDocumentReads['measures']['definitions']>;
  measuresOf: () => Promise<PlanDocumentReads['measures']['facts']>;
  measureEstimatesOf: () => Promise<PlanDocumentReads['measures']['estimates']>;
  budgetsOf: () => Promise<PlanDocumentReads['measures']['budgets']>;
}

/** Pure unit controls assembled from literal rows; these functions never read a Source. */
function service(
  directorySource = directory(),
  resourceFacts: FixtureResourceFacts = NO_RESOURCE_FACTS,
  measureFacts: FixtureMeasureFacts = NO_MEASURE_FACTS,
) {
  const serializer = new PlanDocumentService({
    clock: { now: () => Date.parse('2026-09-13T12:30:00.000Z') },
  });
  return {
    exportCaptured: serializer.exportCaptured.bind(serializer),
    /** Builds a historical constructed control from the original owner-bearing fixture. No runtime exporter emits this shape. */
    async serializeFixture(
      workPackage: typeof WORK_PACKAGE,
      tree: WorkItemTree,
      _access: typeof LEGACY_ACCESS,
    ) {
      const captured = serializer.exportCaptured(workPackage, tree, {
        project: PROJECT,
        directory: {
          teams: await directorySource.listTeams(),
          people: await directorySource.listPeople(),
          tags: await directorySource.listTags(),
          services: await directorySource.listServices(),
          types: await directorySource.listWorkItemTypes(),
          externalSystems: await directorySource.listExternalSystems(),
        },
        markers: MARKERS,
        stepParallels: [],
        resources: {
          resources: await directorySource.listResources(),
          capacities: await resourceFacts.resourceCapacitiesOf(),
          demands: await resourceFacts.demandsOf(),
        },
        measures: {
          definitions: await measureFacts.measureDefinitionsOf(),
          facts: await measureFacts.measuresOf(),
          estimates: await measureFacts.measureEstimatesOf(),
          budgets: await measureFacts.budgetsOf(),
        },
      });
      if (!captured.ok) return captured;
      const { project: _parent, ...historical } = captured.value;
      const { projectId: _projectId, budgetFactor: _budgetFactor, ...legacySettings } = workPackage;
      const control = {
        ...historical,
        document: { ...historical.document, version: 13 },
        workPackage: { ...LEGACY_WORK_PACKAGE, ...legacySettings },
      };
      Reflect.deleteProperty(control.workPackage, 'budgetFactor');
      const validated = await validateSchema(planDocumentV13Response, control);
      if (validated.issues !== undefined)
        throw new Error(
          'historical constructed control is invalid: ' + JSON.stringify(validated.issues),
        );
      return { ok: true as const, value: validated.value };
    },
  };
}

async function exportDocument(tree: WorkItemTree = TREE): Promise<PlanDocument> {
  const exported = await service().serializeFixture(WORK_PACKAGE, tree, LEGACY_ACCESS);
  if (!exported.ok) throw new Error(`export refused: ${exported.error}`);
  return exported.value;
}

async function exportError(tree: WorkItemTree): Promise<string> {
  const outcome = await service()
    .serializeFixture(WORK_PACKAGE, tree, LEGACY_ACCESS)
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
    measureDefinitions,
    measureFacts,
    measureEstimates,
    budgets,
    ...existing
  } = exported;
  // The budget factor travels in `settings`, never in the embedded work package (design D63, D71).
  const { budgetFactor: _factor, ...exportedWorkPackage } = LEGACY_WORK_PACKAGE;
  expect(existing).toEqual<unknown>({
    workPackage: exportedWorkPackage,
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
  // A plan with no measures writes the four lists empty (design D71).
  expect([measureDefinitions, measureFacts, measureEstimates, budgets]).toEqual([[], [], [], []]);
  expect(existing.workItems[0]?.deadline).toBe('2026-09-18');
  expect(existing.optimization).toEqual(TREE.optimization);
  expect({ document, settings, capacity, calendarMarkers, names, stepNodes }).toBeDefined();
});

test('JSON export is a versioned plan document and settings says what work package says', async () => {
  const exported = await exportDocument();
  expect((await validateSchema(planDocumentV13Response, exported)).issues).toBeUndefined();
  expect(exported.document).toEqual({
    format: 'wbs-plan',
    version: 13,
    exportedAt: '2026-09-13T12:30:00.000Z',
  });
  expect(exported.settings).toEqual({
    name: WORK_PACKAGE.name,
    restricted: WORK_PACKAGE.restricted,
    estimateMethod: WORK_PACKAGE.estimateMethod,
    depReach: WORK_PACKAGE.depReach,
    pertWeights: WORK_PACKAGE.pertWeights,
    estimateRounding: WORK_PACKAGE.estimateRounding,
    startDate: WORK_PACKAGE.startDate,
    solutionRef: WORK_PACKAGE.solutionRef,
    optimizationEnabled: WORK_PACKAGE.optimizationEnabled,
    scheduleEngine: WORK_PACKAGE.scheduleEngine,
    scheduleObjective: WORK_PACKAGE.scheduleObjective,
    timezone: 'Europe/Kyiv',
    budgetFactor: WORK_PACKAGE.budgetFactor,
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
    .serializeFixture(WORK_PACKAGE, TREE, LEGACY_ACCESS)
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
  Reflect.set(future.document, 'version', 99);
  const row = future.workItems[0];
  future.workItems = Array.from({ length: 4 }, () => structuredClone(row));
  Reflect.set(future.workItems[3] ?? {}, 'priority', 'high');
  expect(await classifyPlanDocument(future)).toEqual({
    ok: false,
    code: 'unsupported_version',
    path: 'document.version',
  });
});

test('v14 classifies a stable external predecessor and refuses its v10 disguise', async () => {
  const document = structuredClone(await exportDocument());
  Reflect.set(document.document, 'version', 14);
  Reflect.set(
    document,
    'connected',
    workPackageConnectedDocument(createConnectedBlockageRead('clear'), 'C').connected,
  );
  Reflect.set(document, 'typedDependencies', [
    {
      id: 'cross',
      type: 'FS',
      predecessor: {
        kind: 'external',
        scope: 'whole',
        workPackageId: 'other-work-package',
        workItemId: 'stable-row',
        display: {
          workPackageName: 'Other',
          abbreviation: 'OTHER',
          workItemName: 'Prerequisite',
          address: 'OTHER.1',
        },
      },
      successor: { kind: 'internal', scope: 'whole', workItem: 'row-1' },
    },
  ]);
  expect(await classifyPlanDocument(document)).toMatchObject({
    ok: true,
    value: {
      typedDependencies: [
        { predecessor: { workPackageId: 'other-work-package', workItemId: 'stable-row' } },
      ],
    },
  });
  Reflect.set(document.document, 'version', 10);
  Reflect.deleteProperty(document, 'connected');
  Reflect.set(document.typedDependencies[0]?.predecessor ?? {}, 'workItem', 'row-1');
  expect(await classifyPlanDocument(document)).toMatchObject({
    ok: false,
    code: 'invalid_typed_dependency',
    path: 'typedDependencies[0]',
  });
});

test('v14 mapping binds only the declared stable source tuple', async () => {
  const document = structuredClone(await exportDocument());
  Reflect.set(document.document, 'version', 14);
  Reflect.set(
    document,
    'connected',
    workPackageConnectedDocument(createConnectedBlockageRead('clear'), 'C').connected,
  );
  Reflect.set(document, 'typedDependencies', [
    {
      id: 'cross',
      type: 'FS',
      predecessor: {
        kind: 'external',
        scope: 'whole',
        workPackageId: 'other-work-package',
        workItemId: 'stable-row',
        display: {
          workPackageName: 'Other',
          abbreviation: 'OTHER',
          workItemName: 'Prerequisite',
          address: 'OTHER.1',
        },
      },
      successor: { kind: 'internal', scope: 'whole', workItem: 'row-1' },
    },
  ]);
  Reflect.set(document, 'externalMappings', [
    {
      source: { scope: 'whole', workPackageId: 'other-work-package', workItemId: 'stable-row' },
      destination: {
        scope: 'whole',
        workPackageId: 'destination-work-package',
        workItemId: 'destination-row',
      },
    },
  ]);
  expect(await classifyPlanDocument(document)).toMatchObject({
    ok: true,
    value: { externalMappings: [{ destination: { workItemId: 'destination-row' } }] },
  });
  Reflect.set(document, 'externalMappings', [
    {
      source: { scope: 'whole', workPackageId: 'other-work-package', workItemId: 'different-row' },
      destination: {
        scope: 'whole',
        workPackageId: 'destination-work-package',
        workItemId: 'destination-row',
      },
    },
  ]);
  expect(await classifyPlanDocument(document)).toMatchObject({
    ok: false,
    code: 'invalid_typed_dependency',
    path: 'externalMappings[0].source',
  });
  const source = { scope: 'whole', workPackageId: 'other-work-package', workItemId: 'stable-row' };
  const destination = {
    scope: 'whole',
    workPackageId: 'destination-work-package',
    workItemId: 'destination-row',
  };
  Reflect.set(document, 'externalMappings', [
    { source, destination: { ...destination, scope: 'node', stepId: 'destination-step' } },
  ]);
  expect(await classifyPlanDocument(document)).toMatchObject({
    ok: false,
    code: 'invalid_typed_dependency',
    path: 'externalMappings[0].destination.scope',
  });
  Reflect.set(document, 'externalMappings', [
    { source, destination },
    { source, destination },
  ]);
  expect(await classifyPlanDocument(document)).toMatchObject({
    ok: false,
    code: 'invalid_typed_dependency',
    path: 'externalMappings[1].source',
  });
});

test('v14 internal endpoint cannot carry a contradictory external identity', async () => {
  const document = structuredClone(await exportDocument());
  Reflect.set(document.document, 'version', 14);
  Reflect.set(
    document,
    'connected',
    workPackageConnectedDocument(createConnectedBlockageRead('clear'), 'C').connected,
  );
  Reflect.set(document, 'typedDependencies', [
    {
      id: 'mixed',
      type: 'FS',
      predecessor: {
        kind: 'internal',
        scope: 'whole',
        workItem: 'row-1',
        workPackageId: 'foreign-work-package',
        workItemId: 'foreign-row',
      },
      successor: { kind: 'internal', scope: 'whole', workItem: 'row-1' },
    },
  ]);
  expect(await classifyPlanDocument(document)).toMatchObject({
    ok: false,
    code: 'invalid_typed_dependency',
  });
});

test('v1–3 retain their historical treatment of file-local typed fields', async () => {
  for (const version of [1, 2, 3]) {
    const document = structuredClone(await exportDocument());
    Reflect.set(document.document, 'version', version);
    if (version === 1)
      for (const step of document.steps) Reflect.deleteProperty(step, 'allowancePercent');
    Reflect.set(document, 'typedDependencies', [
      {
        id: 'historical',
        type: 'FS',
        predecessor: { scope: 'whole', workItem: 'row-1' },
        successor: { scope: 'whole', workItem: 'row-1' },
      },
    ]);
    const classified = await classifyPlanDocument(document);
    expect(classified).toMatchObject({ ok: true, value: { typedDependencies: [] } });
  }
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
  const exported = await service().serializeFixture(WORK_PACKAGE, tree, LEGACY_ACCESS);
  expect(exported).toMatchObject({
    ok: true,
    value: {
      document: { version: 13 },
      typedDependencies: [
        { id: 'start-link', type: 'SS' },
        { id: 'finish-link', type: 'FF' },
      ],
    },
  });
});

test('archival validation work packages derived fields away', async () => {
  const exported = await exportDocument();
  const classified = await classifyPlanDocument({ ...exported, audit: { importedBy: 'future' } });
  if (!classified.ok) throw new Error(`fixture document refused at ${classified.path}`);
  expect(classified.value).not.toHaveProperty('audit');
  expect(classified.value.workItems[0]).not.toHaveProperty('workPackageId');
  expect(classified.value.workItems[0]).not.toHaveProperty('number');
  expect(classified.value.workItems[0]).not.toHaveProperty('rolledUp');
  expect(classified.value.workItems[0]).not.toHaveProperty('schedule');
  expect(classified.value.steps[0]).not.toHaveProperty('workPackageId');
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
test('refuses to export a work package holding an uncoded step, naming it', async () => {
  const uncoded = structuredClone(TREE);
  const step = uncoded.steps.at(0);
  if (step === undefined) throw new Error('fixture has no step');
  step.code = null;

  expect(await service().serializeFixture(WORK_PACKAGE, uncoded, LEGACY_ACCESS)).toEqual({
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
    .serializeFixture(WORK_PACKAGE, keyless, LEGACY_ACCESS)
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
  expect(exported.document.version).toBe(13);
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

test('exports a Kyiv work package’s zone and each leaf’s attempts by step code, executors by name', async () => {
  const exported = await exportDocument(attemptedTree());
  expect((await validateSchema(planDocumentV13Response, exported)).issues).toBeUndefined();
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
  expect(document.document.version).toBe(13);
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
  const exported = await service().serializeFixture(WORK_PACKAGE, tree, LEGACY_ACCESS);
  expect(exported.ok).toBe(true);
  if (!exported.ok) return;
  expect(exported.value.document.version).toBe(13);
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
  const captured = service().exportCaptured(WORK_PACKAGE, tree, {
    project: PROJECT,
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
    measures: NO_MEASURE_READS,
  });
  expect(captured.ok).toBe(true);
  if (!captured.ok) throw new Error('captured serialization refused');
  expect(captured.value.stepBlockages).toEqual(exported.stepBlockages);
  expect(captured.value.document.version).toBe(15);
  expect(captured.value.project).toEqual(PROJECT);
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

test('plan document excludes live leaf applicability until its versioned document change', async () => {
  const tree = structuredClone(TREE);
  const row = tree.workItems.at(0);
  if (row === undefined) throw new Error('missing fixture row');
  row.steps = [
    {
      stepId: 'step-1',
      code: 'dev',
      name: 'Develop',
      via: [
        {
          bindingId: 'binding-1',
          scopeKind: 'project',
          scopeId: WORK_PACKAGE.projectId,
          workItemTypeId: null,
        },
      ],
    },
  ];
  const exported = await exportDocument(tree);
  expect(exported.workItems[0]).not.toHaveProperty('steps');
});

test('v9 refuses authored sparse parallelism on captured JSON exports', () => {
  const parallel = { workItemId: 'row-1', stepId: 'step-1', maxParallel: 2 };
  const writer = new PlanDocumentService({ clock: { now: () => 0 } });
  expect(
    writer.exportCaptured(WORK_PACKAGE, TREE, {
      project: PROJECT,
      directory: { teams: [], people: [], tags: [], services: [], types: [], externalSystems: [] },
      markers: [],
      resources: { resources: [], capacities: [], demands: [] },
      measures: NO_MEASURE_READS,
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
      project: PROJECT,
      directory: { teams: [], people: [], tags: [], services: [], types: [], externalSystems: [] },
      markers: [],
      resources: { resources: [], capacities: [], demands: [] },
      measures: NO_MEASURE_READS,
      stepParallels: sparse,
    };
    expect(() => service().exportCaptured(WORK_PACKAGE, TREE, reads as never)).toThrow(message);
  });
}

test('pure serializer exposes no live sparse reader or independent IO exporter', () => {
  const writer = new PlanDocumentService({ clock: { now: () => 0 } });
  expect('export' in writer).toBe(false);
  expect('readDocumentReads' in writer).toBe(false);
});

for (const [name, mutate, message] of [
  [
    'foreign owner',
    (tree: WorkItemTree) => {
      Reflect.set(tree.workItems[0] ?? {}, 'workPackageId', 'foreign');
    },
    /foreign work item/,
  ],
  [
    'foreign step',
    (tree: WorkItemTree) => {
      Reflect.set(tree.steps[0] ?? {}, 'workPackageId', 'foreign');
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
      service().exportCaptured(WORK_PACKAGE, tree, {
        project: PROJECT,
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
        measures: NO_MEASURE_READS,
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
    service().exportCaptured(WORK_PACKAGE, tree, {
      project: PROJECT,
      directory: { teams: [], people: [], tags: [], services: [], types: [], externalSystems: [] },
      markers: [],
      resources: { resources: [], capacities: [], demands: [] },
      measures: NO_MEASURE_READS,
      stepParallels: [
        { workItemId: 'a', stepId: 'b:c', maxParallel: 1 },
        { workItemId: 'a:b', stepId: 'c', maxParallel: 1 },
      ],
    }),
  ).toEqual({ ok: false, error: 'unsupported_step_parallelism' });
});

/**
 * A current export projected without the fields version 11 added (the factor in
 * `settings` and the four measure lists, each empty here) and its version read
 * as `version`, for focused feature-era classifier controls on a plan without
 * measures. These are current renamed projections; genuine historical writer
 * bytes and strict historical readers are covered by plan-document-rename.test.ts.
 */
function withoutVersion11(exported: PlanDocument, version: number): Record<string, unknown> {
  const { budgetFactor, ...settings } = exported.settings;
  expect({
    budgetFactor,
    lists: [
      exported.measureDefinitions,
      exported.measureFacts,
      exported.measureEstimates,
      exported.budgets,
    ],
  }).toEqual({ budgetFactor: 1, lists: [[], [], [], []] });
  const added = new Set(['measureDefinitions', 'measureFacts', 'measureEstimates', 'budgets']);
  // Key order is part of the bytes, so every other field keeps its place.
  return Object.fromEntries(
    Object.entries<unknown>(exported)
      .filter(([key]) => !added.has(key))
      .map(([key, value]): [string, unknown] => {
        if (key === 'settings') return [key, settings];
        if (key === 'document') return [key, { ...exported.document, version }];
        return [key, value];
      }),
  );
}

test('current zero-fact pre-resource projection has canonical renamed bytes', async () => {
  // Pin the current renamed zero-fact projection after removing later feature
  // fields. Historical writer bytes remain separately frozen in legacy captures.
  const exported = withoutVersion11(structuredClone(await exportDocument()), 9);
  Reflect.deleteProperty(exported['workPackage'] as object, 'abbreviation');
  const { resources, ...directoryBefore } = exported['directory'] as PlanDocument['directory'];
  const { resourceCapacities, demands, ...rest } = exported;
  expect({ resources, resourceCapacities, demands }).toEqual({
    resources: [],
    resourceCapacities: [],
    demands: [],
  });
  const bytes = JSON.stringify({ ...rest, directory: directoryBefore });
  expect(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')).toBe(
    '264f0f7a91b275206f64aeaa27dc8dae46bfb5cc33534d7d7f6b0858b6cc8016',
  );
});

test('uncoded steps retain precedence over modeled sparse refusal in captured evidence', () => {
  const tree = structuredClone(TREE);
  const step = tree.steps.at(0);
  if (step === undefined) throw new Error('missing uncoded fixture');
  step.code = null;
  const writer = new PlanDocumentService({ clock: { now: () => 0 } });
  expect(
    writer.exportCaptured(WORK_PACKAGE, tree, {
      project: PROJECT,
      directory: { teams: [], people: [], tags: [], services: [], types: [], externalSystems: [] },
      markers: [],
      resources: { resources: [], capacities: [], demands: [] },
      measures: NO_MEASURE_READS,
      stepParallels: [{ workItemId: 'row-1', stepId: 'step-1', maxParallel: 2 }],
    }),
  ).toEqual({
    ok: false,
    error: 'uncoded_steps',
    steps: [{ id: 'step-1', name: 'Build' }],
    command: 'bun run src/backfill-step-codes-cli.ts',
  });
});

/** The work package states a capacity of RAM and staging, and its row demands both. */
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
  const exported = await service(directory(), RESOURCE_FACTS).serializeFixture(
    WORK_PACKAGE,
    TREE,
    LEGACY_ACCESS,
  );
  if (!exported.ok) throw new Error(`export refused: ${exported.error}`);
  return exported.value;
}

test('exports only the resources its capacities and demands name (wbs-resources)', async () => {
  const exported = await exportWithResources();
  expect(exported.document.version).toBe(13);
  expect((await validateSchema(planDocumentV13Response, exported)).issues).toBeUndefined();
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

test('current resource projection has canonical renamed bytes', async () => {
  const exported = await exportWithResources();
  Reflect.deleteProperty(exported.workPackage, 'abbreviation');
  const bytes = JSON.stringify(withoutVersion11(exported, 10));
  expect(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')).toBe(
    '6728707f4e5e700e663fd1add9af617a71452152180fa9b5a588c2092f628716',
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

test('versioned response admits explicit v14 links while v10 remains frozen', async () => {
  const document = await exportDocument();
  expect((await validateSchema(planDocumentV13Response, document)).issues).toBeUndefined();
  const external = {
    id: 'cross',
    type: 'FS',
    predecessor: {
      kind: 'external',
      scope: 'whole',
      workPackageId: 'remote',
      workItemId: 'stable',
      display: {
        workPackageName: 'Remote',
        abbreviation: 'REM',
        workItemName: 'Build',
        address: 'REM.1',
      },
    },
    successor: { kind: 'internal', scope: 'whole', workItem: 'row-1' },
  };
  const next = {
    ...document,
    document: { ...document.document, version: 14 },
    typedDependencies: [external],
    connected: {
      kind: 'connected',
      workPackageId: document.workPackage.id,
      mode: 'isolated',
      workPackages: [],
      relationships: [],
      placement: { kind: 'unavailable', reason: 'cycle' },
    },
  };
  const incomplete = { ...next };
  Reflect.deleteProperty(incomplete, 'connected');
  expect((await validateSchema(planDocumentV14Response, incomplete)).issues).toBeDefined();
  expect((await classifyPlanDocument(incomplete)).ok).toBe(true);
  expect((await validateSchema(planDocumentV14Response, next)).issues).toBeUndefined();
  expect((await validateSchema(planDocumentV14Response, next)).issues).toBeUndefined();
  expect((await validateSchema(planDocumentV10Response, next)).issues).toBeDefined();
  expect(
    (await validateSchema(planDocumentV14Response, { ...next, document: document.document }))
      .issues,
  ).toBeDefined();
});

test('v14 step endpoint requires its descriptive step label', async () => {
  const document = await exportDocument();
  Reflect.set(document.document, 'version', 14);
  Reflect.set(
    document,
    'connected',
    workPackageConnectedDocument(createConnectedBlockageRead('clear'), 'C').connected,
  );
  Reflect.set(document, 'typedDependencies', [
    {
      id: 'cross',
      type: 'FS',
      predecessor: {
        kind: 'external',
        scope: 'node',
        workPackageId: 'remote',
        workItemId: 'stable',
        stepId: 'remote-step',
        display: {
          workPackageName: 'Remote',
          abbreviation: 'REM',
          workItemName: 'Build',
          address: 'REM.1',
        },
      },
      successor: { kind: 'internal', scope: 'whole', workItem: 'row-1' },
    },
  ]);
  expect(await classifyPlanDocument(document)).toMatchObject({
    ok: false,
    code: 'invalid_typed_dependency',
  });
});

/** An organization's definitions: the seeded five and one it defined. */
const DEFINITIONS = [
  ...SEEDED_MEASURE_DEFINITIONS.map((each) => ({ ...each, id: `measure-${each.key}` })),
  {
    id: 'measure-gpu',
    key: 'gpu_minutes',
    name: 'GPU minutes',
    unit: 'minutes',
    kind: 'duration' as const,
    scale: 'integer' as const,
    threePoint: true,
    showByDefault: false,
    schedulesWork: false,
    derived: false,
    order: 6,
    currency: null,
  },
];

const CARD = { currency: 'USD', rateCardDigest: 'sha256:card-a' };

/**
 * A plan holding every kind of figure version 11 adds, beside the legacy ones
 * version 10 already carried: facts in `cost` (priced) and `gpu_minutes`, a
 * three-point tokens trio and a priced cost trio, a strict tokens budget with
 * a hold and an advisory one in `gpu_minutes`; the single-point tokens trio and
 * the legacy facts stay in the row's `measures`.
 */
const MEASURE_FACTS = {
  measureDefinitionsOf: () => Promise.resolve(DEFINITIONS),
  measuresOf: () =>
    Promise.resolve([
      { workItemId: 'row-1', stepId: 'step-1', metric: 'hours_actual', value: 4, recordedAt: 1 },
      {
        workItemId: 'row-1',
        stepId: 'step-1',
        metric: 'gpu_minutes',
        value: 90,
        recordedAt: 2,
      },
      {
        workItemId: 'row-1',
        stepId: 'step-1',
        metric: 'cost',
        value: 2_500_000,
        recordedAt: 3,
        basis: CARD,
      },
      {
        workItemId: 'row-1',
        stepId: 'step-1',
        metric: 'token_estimate',
        value: 500,
        recordedAt: 4,
      },
    ]),
  measureEstimatesOf: () =>
    Promise.resolve([
      {
        workItemId: 'row-1',
        stepId: 'step-1',
        key: 'tokens',
        optimistic: 500,
        realistic: 500,
        pessimistic: 500,
        singlePoint: true,
      },
      {
        workItemId: 'row-1',
        stepId: 'step-1',
        key: 'gpu_minutes',
        optimistic: 30,
        realistic: 60,
        pessimistic: 120,
        singlePoint: false,
      },
      {
        workItemId: 'row-1',
        stepId: 'step-1',
        key: 'cost',
        optimistic: 1_000_000,
        realistic: 2_000_000,
        pessimistic: 4_000_000,
        singlePoint: false,
        basis: CARD,
      },
    ]),
  budgetsOf: () =>
    Promise.resolve([
      {
        workItemId: 'row-1',
        key: 'tokens',
        cap: 10_000,
        policy: 'strict' as const,
        holdPerAttempt: 2_000,
      },
      {
        workItemId: 'row-1',
        key: 'gpu_minutes',
        cap: 600,
        policy: 'advisory' as const,
        holdPerAttempt: null,
      },
    ]),
};

const FACTORED: typeof WORK_PACKAGE = { ...WORK_PACKAGE, budgetFactor: 1.5 };

async function exportWithMeasures(
  workPackage: typeof WORK_PACKAGE = FACTORED,
  measureFacts: FixtureMeasureFacts = MEASURE_FACTS,
): Promise<PlanDocument> {
  const tree = structuredClone(TREE);
  tree.workItems = tree.workItems.map((row) => ({
    ...row,
    measures: { hours_actual: { 'step-1': 4 }, token_estimate: { 'step-1': 500 } },
  }));
  const exported = await service(directory(), NO_RESOURCE_FACTS, measureFacts).serializeFixture(
    workPackage,
    tree,
    LEGACY_ACCESS,
  );
  if (!exported.ok) throw new Error(`export refused: ${exported.error}`);
  return exported.value;
}

test('exports version 13 with every measure the plan holds', async () => {
  const exported = await exportWithMeasures();
  expect((await validateSchema(planDocumentV13Response, exported)).issues).toBeUndefined();
  expect({
    version: exported.document.version,
    factor: exported.settings.budgetFactor,
    rowMeasures: exported.workItems[0]?.measures,
    definitions: exported.measureDefinitions.map(({ key }) => key),
    facts: exported.measureFacts,
    estimates: exported.measureEstimates,
    budgets: exported.budgets,
  }).toEqual({
    version: 13,
    factor: 1.5,
    // The legacy fact and the single-point tokens trio stay the row's legacy names.
    rowMeasures: { hours_actual: { 'step-1': 4 }, token_estimate: { 'step-1': 500 } },
    definitions: ['tokens', 'cost', 'gpu_minutes'],
    facts: [
      { workItemId: 'row-1', stepId: 'step-1', measure: 'cost', value: 2_500_000, basis: CARD },
      { workItemId: 'row-1', stepId: 'step-1', measure: 'gpu_minutes', value: 90, basis: null },
    ],
    estimates: [
      {
        workItemId: 'row-1',
        stepId: 'step-1',
        measure: 'cost',
        optimistic: 1_000_000,
        realistic: 2_000_000,
        pessimistic: 4_000_000,
        basis: CARD,
      },
      {
        workItemId: 'row-1',
        stepId: 'step-1',
        measure: 'gpu_minutes',
        optimistic: 30,
        realistic: 60,
        pessimistic: 120,
        basis: null,
      },
    ],
    budgets: [
      {
        workItemId: 'row-1',
        measure: 'gpu_minutes',
        cap: 600,
        policy: 'advisory',
        holdPerAttempt: null,
      },
      {
        workItemId: 'row-1',
        measure: 'tokens',
        cap: 10_000,
        policy: 'strict',
        holdPerAttempt: 2_000,
      },
    ],
  });
  // A definition travels whole but for the organization's id.
  expect(exported.measureDefinitions.at(2)).toEqual({
    key: 'gpu_minutes',
    name: 'GPU minutes',
    unit: 'minutes',
    kind: 'duration',
    scale: 'integer',
    threePoint: true,
    showByDefault: false,
    schedulesWork: false,
    derived: false,
    order: 6,
    currency: null,
  });
});

test('v13 measures export has canonical current bytes', async () => {
  const exported = await exportWithMeasures();
  Reflect.deleteProperty(exported.workPackage, 'abbreviation');
  const bytes = JSON.stringify(exported);
  expect(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')).toBe(
    'c66f9a348578df7d1c19a9a27accd8cfd3de244d6b0770bb235e549bf7d30db6',
  );
});

test('a factor other than 1 alone exports version 13 with empty measure lists', async () => {
  const exported = await exportWithMeasures(FACTORED, NO_MEASURE_FACTS);
  expect({
    version: exported.document.version,
    factor: exported.settings.budgetFactor,
    lists: [
      exported.measureDefinitions,
      exported.measureFacts,
      exported.measureEstimates,
      exported.budgets,
    ],
  }).toEqual({ version: 13, factor: 1.5, lists: [[], [], [], []] });
});

// Proof: with the export's version put back on `measures !== null ||
// budgetFactor !== 1 ? 11 : 10` (design D63's dual rule), this case and eight
// more read version 10 (80 pass, 9 fail); watched 2026-10-24.
test('a plan whose measures are all legacy exports version 13 with empty lists (design D71)', async () => {
  const legacyOnly = {
    ...MEASURE_FACTS,
    measureEstimatesOf: async () =>
      (await MEASURE_FACTS.measureEstimatesOf()).filter(({ singlePoint }) => singlePoint),
    measuresOf: async () =>
      (await MEASURE_FACTS.measuresOf()).filter(({ metric }) => isLegacyMetric(metric)),
    budgetsOf: () => Promise.resolve([]),
  };
  const exported = await exportWithMeasures(WORK_PACKAGE, legacyOnly);
  expect((await validateSchema(planDocumentV13Response, exported)).issues).toBeUndefined();
  expect({
    version: exported.document.version,
    factor: exported.settings.budgetFactor,
    lists: [
      exported.measureDefinitions,
      exported.measureFacts,
      exported.measureEstimates,
      exported.budgets,
    ],
  }).toEqual({ version: 13, factor: 1, lists: [[], [], [], []] });
});

test('a plan without measures exports canonical version-13 bytes', async () => {
  const exported = await exportDocument();
  Reflect.deleteProperty(exported.workPackage, 'abbreviation');
  const bytes = JSON.stringify(exported);
  expect(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')).toBe(
    'cb757038838bc7c1744176c5b4d02e1e50e371a973ac7f3280ba8c0862b75fb1',
  );
});

// Proof: with the four readings kept in `documentWorkItems`, this case
// exported `budgets` and `measureEstimates` on the row; watched 2026-10-23.
test('leaves the row’s measure readings out of the document', async () => {
  const tree = structuredClone(TREE);
  tree.workItems = tree.workItems.map((row) => ({
    ...row,
    measureEstimates: {
      tokens: {
        'step-1': {
          optimistic: 5,
          realistic: 5,
          pessimistic: 5,
          singlePoint: true,
          expected: 5,
        },
      },
    },
    budgets: {
      tokens: { cap: 8, policy: 'advisory', source: 'derived', remaining: 8, exceeded: false },
    },
    moneyBases: { cost: { facts: CARD } },
    mixedRateCards: { cost: { estimates: [null, CARD] } },
  }));
  const exported = await exportDocument(tree);
  for (const key of ['measureEstimates', 'budgets', 'moneyBases', 'mixedRateCards'])
    expect(exported.workItems[0]).not.toHaveProperty(key);
});

test('reads a version-11 file’s measures and factor back', async () => {
  const exported = await exportWithMeasures();
  const classified = await classifyPlanDocument(exported);
  if (!classified.ok) throw new Error(`refused at ${classified.path}`);
  const read: unknown = {
    factor: classified.value.settings.budgetFactor,
    definitions: classified.value.measureDefinitions,
    facts: classified.value.measureFacts,
    estimates: classified.value.measureEstimates,
    budgets: classified.value.budgets,
  };
  expect(read).toEqual({
    factor: 1.5,
    definitions: exported.measureDefinitions,
    facts: exported.measureFacts,
    estimates: exported.measureEstimates,
    budgets: exported.budgets,
  });
  // A version-10 file reads with a factor of 1 and no measures.
  const legacy = await classifyPlanDocument(await exportDocument());
  if (!legacy.ok) throw new Error(`refused at ${legacy.path}`);
  expect({
    factor: legacy.value.settings.budgetFactor,
    lists: [
      legacy.value.measureDefinitions,
      legacy.value.measureFacts,
      legacy.value.measureEstimates,
      legacy.value.budgets,
    ],
  }).toEqual({ factor: 1, lists: [[], [], [], []] });
});

test('refuses a version-11 file with a malformed measure entry or factor', async () => {
  const exported = await exportWithMeasures();
  for (const [path, damage] of [
    [
      'settings.budgetFactor',
      (file: PlanDocument) => Reflect.set(file.settings, 'budgetFactor', 0),
    ],
    [
      'settings.budgetFactor',
      (file: PlanDocument) => Reflect.set(file.settings, 'budgetFactor', 1001),
    ],
    [
      'settings.budgetFactor',
      (file: PlanDocument) => Reflect.deleteProperty(file.settings, 'budgetFactor'),
    ],
    [
      'measureDefinitions[0]',
      (file: PlanDocument) => Reflect.set(file.measureDefinitions.at(0) ?? {}, 'kind', 'weight'),
    ],
    [
      'measureFacts[0]',
      (file: PlanDocument) =>
        Reflect.set(file.measureFacts.at(0) ?? {}, 'basis', { currency: 'USD' }),
    ],
    [
      'measureEstimates[0]',
      (file: PlanDocument) =>
        Reflect.set(file.measureEstimates.at(0) ?? {}, 'pessimistic', Number.POSITIVE_INFINITY),
    ],
    ['budgets[0]', (file: PlanDocument) => Reflect.set(file.budgets.at(0) ?? {}, 'policy', 'hard')],
    ['budgets', (file: PlanDocument) => Reflect.deleteProperty(file, 'budgets')],
    ['measureFacts', (file: PlanDocument) => Reflect.set(file, 'measureFacts', {})],
  ] as const) {
    const file = structuredClone(exported);
    damage(file);
    expect({ path, outcome: await classifyPlanDocument(file) }).toEqual({
      path,
      outcome: { ok: false, code: 'invalid_body', path },
    });
  }
});

test('refuses measures in a file older than version 11', async () => {
  const exported = await exportWithMeasures();
  for (const path of [
    'measureDefinitions',
    'measureFacts',
    'measureEstimates',
    'budgets',
    'settings.budgetFactor',
  ]) {
    const file = structuredClone(exported);
    Reflect.set(file.document, 'version', 10);
    // Every earlier field emptied, so only `path` still names something.
    for (const other of ['measureDefinitions', 'measureFacts', 'measureEstimates', 'budgets'])
      if (other !== path) Reflect.deleteProperty(file, other);
    if (path !== 'settings.budgetFactor') Reflect.deleteProperty(file.settings, 'budgetFactor');
    expect({ path, outcome: await classifyPlanDocument(file) }).toEqual({
      path,
      outcome: { ok: false, code: 'invalid_body', path },
    });
  }
  // A factor of 1 is what an earlier version reads as, so it is accepted.
  const named = structuredClone(await exportDocument());
  Reflect.set(named.settings, 'budgetFactor', 1);
  expect((await classifyPlanDocument(named)).ok).toBe(true);
});

test('throws when a stored figure names a measure, row or step the reads do not hold', async () => {
  const faults = [
    ['undefined measure "gone"', 'gone', 'row-1', 'step-1'],
    ['work item "row-gone"', 'gpu_minutes', 'row-gone', 'step-1'],
    ['step "step-gone"', 'gpu_minutes', 'row-1', 'step-gone'],
  ] as const;
  for (const [message, metric, workItemId, stepId] of faults) {
    const reads = {
      ...MEASURE_FACTS,
      measuresOf: () => Promise.resolve([{ workItemId, stepId, metric, value: 1, recordedAt: 1 }]),
    };
    const outcome = await exportWithMeasures(FACTORED, reads).catch((caught: unknown) => caught);
    expect(outcome instanceof Error ? outcome.message : 'exported').toContain(message);
  }
});

test('v14 export requires captured evidence while import discards untrusted read-only history', async () => {
  const captured = createConnectedBlockageRead('clear');
  const evidence = workPackageConnectedDocument(captured, 'C').connected;
  const ordinary = await exportDocument();
  const next = {
    ...ordinary,
    document: { ...ordinary.document, version: 14 },
    connected: evidence,
  };
  expect((await classifyPlanDocument(next)).ok).toBe(true);
  const { connected: omitted, ...missing } = next;
  expect(omitted).toBe(evidence);
  expect((await validateSchema(planDocumentV14Response, missing)).issues).toBeDefined();
  expect((await classifyPlanDocument(missing)).ok).toBe(true);
  expect(
    (await validateSchema(planDocumentV14Response, { ...next, connected: null })).issues,
  ).toBeDefined();
  expect((await classifyPlanDocument({ ...next, connected: null })).ok).toBe(true);
  expect((await classifyPlanDocument({ ...next, document: ordinary.document })).ok).toBe(true);
});

test('frozen v10 strict consumers refuse the newer embedded work package factor', async () => {
  const document = JSON.parse(
    await Bun.file(
      new URL(
        '../../../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-document11-ordinary.txt',
        import.meta.url,
      ),
    ).text(),
  ) as {
    document: { version: number };
    settings: Record<string, unknown>;
    project: object;
    [key: string]: unknown;
  };
  document.document.version = 10;
  Reflect.deleteProperty(document.settings, 'budgetFactor');
  for (const key of ['measureDefinitions', 'measureFacts', 'measureEstimates', 'budgets'])
    Reflect.deleteProperty(document, key);
  const strict = requestSchema(createPlanDocumentV10());
  expect((await validateSchema(strict, document)).issues).toBeUndefined();
  const workPackage: unknown = document.project;
  if (typeof workPackage !== 'object' || workPackage === null)
    throw new Error('fixture work package missing');
  Reflect.set(workPackage, 'budgetFactor', 2);
  expect((await validateSchema(strict, document)).issues).toBeDefined();
});
