import { expect, test } from 'bun:test';

import { documentFromShapes } from './document-from-shapes';
import { responseSchema, validateSchema } from './schema-shape';
import { workItemTree } from './work-item-response';
import { getWorkItems } from './work-item-shapes';

test('tree boundary refuses missing core producer fields while allowing additive metadata', async () => {
  const schema = responseSchema(workItemTree);
  const tree = {
    workItems: [],
    seq: 1,
    scheduleError: null,
    waitingForPerson: 0,
    waitingForCapacity: 0,
    slices: [],
    steps: [],
    assignedPeople: [],
    teamCapacities: [],
    priorityBands: [],
    estimateMethod: 'pert',
    pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
    estimateRounding: 'exact',
    depReach: 'whole-item',
    startDate: null,
    projectRevision: 1,
  };
  expect(
    (await validateSchema(schema, { ...tree, future: { extra: true } })).issues,
  ).toBeUndefined();
  const missingCalendar = {
    kind: 'dependency_calendar_missing',
    projects: [{ projectId: 'p', abbreviation: 'P', name: 'Plan' }],
  };
  const missingEngine = {
    kind: 'engine_unavailable',
    engine: 'optimized',
    projects: ['p'],
    reason: 'adapter_missing',
  };
  for (const scheduleError of [
    null,
    'cycle',
    'calendar_range',
    missingCalendar,
    missingEngine,
    { ...missingEngine, reason: 'connected_optimization_not_supported' },
  ])
    expect((await validateSchema(schema, { ...tree, scheduleError })).issues).toBeUndefined();
  for (const scheduleError of [
    { ...missingCalendar, projects: undefined },
    { ...missingCalendar, projects: [] },
    ...['projectId', 'abbreviation', 'name'].map((field) => ({
      ...missingCalendar,
      projects: [{ ...missingCalendar.projects[0], [field]: undefined }],
    })),
    { ...missingEngine, projects: undefined },
    { ...missingEngine, projects: [] },
    { ...missingEngine, engine: 'fast' },
    { ...missingEngine, reason: undefined },
    { ...missingEngine, reason: 'unknown' },
    { ...missingEngine, kind: 'unknown' },
  ])
    expect((await validateSchema(schema, { ...tree, scheduleError })).issues).toBeDefined();
  const olderReply = { ...tree, undoable: false, redoable: false };
  expect(
    (await validateSchema(getWorkItems.responses[0].schema, olderReply)).issues,
  ).toBeUndefined();
  const read = getWorkItems.responses[0].schema;
  const node = { id: 'sn1.w.s', workItemId: 'w', stepId: 's', reference: '010.dev' };
  const current = { ...olderReply, addressRevision: 'ar1:00', stepNodes: [node] };
  expect((await validateSchema(read, current)).issues).toBeUndefined();
  const typed = {
    id: 'd',
    predecessor: { scope: 'node', workItemId: 'w', stepId: 's', stepNodeId: 'sn1.w.s' },
    successor: { scope: 'whole', workItemId: 'b' },
    type: 'FS',
  };
  expect(
    (await validateSchema(read, { ...current, typedDependencies: [typed] })).issues,
  ).toBeUndefined();
  for (const malformed of [
    { ...current, addressRevision: 7 },
    { ...current, stepNodes: [{ ...node, reference: 5 }] },
    { ...current, stepNodes: [{ ...node, id: undefined }] },
    {
      ...current,
      typedDependencies: [{ ...typed, predecessor: { ...typed.predecessor, stepNodeId: 7 } }],
    },
  ]) {
    expect((await validateSchema(read, malformed)).issues).toBeDefined();
  }
  const { projectRevision, ...missing } = tree;
  expect((await validateSchema(schema, missing)).issues).toBeDefined();
});

test('checks deadline and slice lateness while retaining additive nested response fields', async () => {
  const schema = responseSchema(workItemTree);
  const schedule = {
    duration: 1,
    estimated: true,
    earliestStart: 0,
    earliestFinish: 1,
    latestStart: 0,
    latestFinish: 1,
    float: 0,
    critical: true,
  };
  const row = {
    charged: {},
    id: 'w',
    projectId: 'p',
    parentId: null,
    position: 1,
    name: 'Work',
    notes: '',
    frozenNumber: null,
    startNoEarlierThan: null,
    startNoEarlierThanReason: null,
    deadline: '2026-09-07',
    factStart: null,
    factEnd: '2026-09-12',
    readiness: null,
    hold: 'blocked',
    priority: null,
    serviceTeamId: null,
    serviceId: null,
    maxParallel: 1,
    revision: 0,
    teamIds: [],
    tagIds: [],
    serviceIds: [],
    typeIds: [],
    externalRefs: [
      { id: 'ref', systemId: 'jira', url: 'https://example.test/issue/1', name: 'AB-1 Wiring' },
    ],
    number: '010',
    estimates: { s: { optimistic: 1, realistic: 1, pessimistic: 1 } },
    rolledUp: false,
    actuals: { s: 1 },
    progress: { s: 'done' },
    status: 'done',
    measures: { hours_actual: { s: 8 } },
    dependsOn: [],
    finalDays: { s: 1 },
    finalTotal: 1,
    schedule,
    dates: null,
    assignees: { s: 'person' },
    doesEveryStep: 'person',
    future: true,
  };
  const slice = {
    ...schedule,
    id: 'slice',
    workItemId: 'w',
    stepId: 's',
    personId: 'person',
    boundBy: 'projectStart',
    resourcePredecessorId: null,
    capacityPredecessorIds: [],
    capacityTeamId: null,
    width: 1,
    effort: 1,
    lateBy: null,
  };
  const tree = {
    workItems: [row],
    seq: 1,
    scheduleError: null,
    waitingForPerson: 0,
    waitingForCapacity: 0,
    slices: [slice],
    steps: [],
    assignedPeople: [],
    teamCapacities: [],
    priorityBands: [],
    estimateMethod: 'pert',
    pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
    estimateRounding: 'exact',
    depReach: 'whole-item',
    startDate: null,
    projectRevision: 1,
  };
  expect((await validateSchema(schema, tree)).issues).toBeUndefined();
  const resources = {
    nodeId: 'sn1.w.s',
    assignment: { kind: 'assumed', personId: 'person', fromStepId: 'source' },
    teams: {
      kind: 'stated',
      fromWorkItemId: 'ancestor',
      entries: [{ teamId: 'team', capacity: null }],
    },
    maxParallel: 3,
    width: 1,
  };
  expect(
    (
      await validateSchema(schema, {
        ...tree,
        workItems: [{ ...row, nodeResources: { s: resources } }],
      })
    ).issues,
  ).toBeUndefined();
  for (const malformed of [
    { ...resources, nodeId: 4 },
    { ...resources, assignment: { kind: 'invented' } },
    { ...resources, assignment: { kind: 'explicit' } },
    { ...resources, assignment: { kind: 'assumed', personId: 'person' } },
    { ...resources, teams: { kind: 'stated', entries: [] } },
    {
      ...resources,
      teams: {
        kind: 'stated',
        fromWorkItemId: 'ancestor',
        entries: [{ teamId: 'team', capacity: 'many' }],
      },
    },
    { ...resources, teams: { kind: 'invented' } },
    { ...resources, maxParallel: '3' },
    { ...resources, width: 'one' },
  ])
    expect(
      (
        await validateSchema(schema, {
          ...tree,
          workItems: [{ ...row, nodeResources: { s: malformed } }],
        })
      ).issues,
    ).toBeDefined();
  for (const charged of [
    { s: { unit: 'minutes', minutes: 240 } },
    { s: { unit: 'workdays', days: 0.5 } },
  ]) {
    expect(
      (await validateSchema(schema, { ...tree, workItems: [{ ...row, charged }] })).issues,
    ).toBeUndefined();
  }
  for (const altered of [
    { ...tree, workItems: [{ ...row, charged: { s: { unit: 'minutes', minutes: 1.5 } } }] },
    { ...tree, workItems: [{ ...row, charged: { s: { unit: 'minutes', minutes: -1 } } }] },
    { ...tree, workItems: [{ ...row, charged: { s: { unit: 'hours', minutes: 1 } } }] },
    { ...tree, workItems: [{ ...row, deadline: 3 }] },
    { ...tree, slices: [{ ...slice, lateBy: 'late' }] },
    { ...tree, workItems: [{ ...row, measures: { hours_actual: { s: '8' } } }] },
    {
      ...tree,
      workItems: [
        {
          ...row,
          externalRefs: [{ systemId: 'jira', url: 'https://example.test/issue/1' }],
        },
      ],
    },
    {
      ...tree,
      workItems: [
        {
          ...row,
          externalRefs: [{ id: 1, systemId: 'jira', url: 'https://example.test/issue/1' }],
        },
      ],
    },
    // A read is where `name` is **not** optional: the column is
    // `NOT NULL DEFAULT ''`, so a row that came back without the field is a
    // be-01 that did not select it, and the client's fallback would draw the
    // derived label over a name somebody typed.
    {
      ...tree,
      workItems: [
        {
          ...row,
          externalRefs: [{ id: 'ref', systemId: 'jira', url: 'https://example.test/issue/1' }],
        },
      ],
    },
    {
      ...tree,
      workItems: [
        {
          ...row,
          externalRefs: [
            { id: 'ref', systemId: 'jira', url: 'https://example.test/issue/1', name: 7 },
          ],
        },
      ],
    },
  ])
    expect((await validateSchema(schema, altered)).issues).toBeDefined();
});

test('checks the optional optimization projection and every variant state', async () => {
  const schema = responseSchema(workItemTree);
  const tree = {
    workItems: [],
    seq: 1,
    scheduleError: null,
    waitingForPerson: 0,
    waitingForCapacity: 0,
    slices: [],
    steps: [],
    assignedPeople: [],
    teamCapacities: [],
    priorityBands: [],
    estimateMethod: 'pert',
    pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
    estimateRounding: 'exact',
    depReach: 'whole-item',
    startDate: null,
    projectRevision: 1,
  };
  const optimization = {
    enabled: true,
    engine: 'optimized',
    objective: 'pri',
    inputHash: 'input',
    generation: 2,
    contractVersion: '7+test',
    budgetMs: 60_000,
    displayed: 'pri',
    variants: {
      pri: { state: 'ready', proof: 'proven' },
      time: {
        state: 'plan-infeasible',
        items: [{ ownerWorkItemId: 'owner', boundWorkItemId: 'bound', effectiveDeadlineOffset: 4 }],
      },
    },
    // Both required, and both are what the cue reads: Fast's finish is what
    // every comparison is measured against, and a variant contributes its own
    // finish and its order relation only where be-01 holds a schedule for it —
    // here `pri` does and the `plan-infeasible` `time` does not.
    finishDays: { fast: 10, pri: 8 },
    sameOrderAsFast: { pri: false },
  };

  expect((await validateSchema(schema, { ...tree, optimization })).issues).toBeUndefined();
  expect(
    (
      await validateSchema(schema, {
        ...tree,
        optimization: {
          ...optimization,
          variants: { ...optimization.variants, pri: { state: 'failed', reason: 'unknown' } },
        },
      })
    ).issues,
  ).toBeDefined();
});

test('generated tree OpenAPI requires captured unavailable evidence', () => {
  const document = documentFromShapes([getWorkItems]);
  const schema =
    document.paths['/api/projects/{id}/work-items']?.['get']?.responses['200']?.content?.[
      'application/json'
    ]?.schema;
  expect(schema).toHaveProperty('properties.scheduleError.anyOf');
  expect(schema).toMatchObject({
    properties: {
      scheduleError: {
        anyOf: [
          {
            properties: {
              kind: { const: 'engine_unavailable' },
              engine: { const: 'optimized' },
              projects: { minItems: 1 },
              reason: { enum: ['adapter_missing', 'connected_optimization_not_supported'] },
            },
            required: ['engine', 'kind', 'projects', 'reason'],
          },
          {
            properties: {
              kind: { const: 'dependency_calendar_missing' },
              projects: { minItems: 1, items: { required: ['abbreviation', 'name', 'projectId'] } },
            },
            required: ['kind', 'projects'],
          },
          { const: 'calendar_range' },
          { const: 'cycle' },
          { type: 'null' },
        ],
      },
    },
  });
});
