import { expect, test } from 'bun:test';

import { planDocumentFixture } from '../../testing/plan-document-fixture';
import { classifyPlanDocument, decodePlanDocumentTransfer } from './plan-document.resource';

function createDocument(version: number) {
  const plan = planDocumentFixture();
  plan.document.version = version;
  for (const row of plan.workItems) Reflect.deleteProperty(row, 'attempts');
  const first = plan.workItems[0];
  plan.workItems.push({ ...structuredClone(first), id: 'row-2', maxParallel: 4, position: 20 });
  if (version === 1)
    for (const step of plan.steps) Reflect.deleteProperty(step, 'allowancePercent');
  const isConnected = version === 12 || version === 14;
  plan.typedDependencies = [
    {
      id: 'link',
      type: 'FS',
      predecessor: isConnected
        ? {
            kind: 'external',
            scope: 'whole',
            projectId: 'peer',
            workItemId: 'foreign',
            display: {
              projectName: 'Peer',
              abbreviation: 'PEER',
              workItemName: 'Foreign',
              address: 'PEER.1',
            },
          }
        : { scope: 'whole', workItem: 'row-1' },
      successor: isConnected
        ? { kind: 'internal', scope: 'whole', workItem: 'row-1' }
        : { scope: 'whole', workItem: 'row-1' },
    },
  ];
  if (isConnected)
    plan.externalMappings = [
      {
        source: { scope: 'whole', projectId: 'peer', workItemId: 'foreign' },
        destination: { scope: 'whole', projectId: 'destination', workItemId: 'destination-row' },
      },
    ];
  return {
    ...plan,
    ...(isConnected
      ? {
          connected: {
            kind: 'connected',
            projectId: 'source',
            mode: 'isolated',
            projects: [],
            relationships: [],
            placement: { kind: 'unavailable', reason: 'cycle' },
          },
        }
      : {}),
    ...(version >= 13
      ? {
          stepParallels: [
            { workItemId: 'row-1', stepId: 'step-1', maxParallel: 1 },
            { workItemId: 'row-2', stepId: 'step-2', maxParallel: 3 },
          ],
        }
      : {}),
  };
}

test.each(Array.from({ length: 14 }, (_, at) => at + 1))(
  'transfer reads historical family %i',
  async (version) => {
    const decoded = await decodePlanDocumentTransfer(createDocument(version));
    expect(decoded).toMatchObject({
      ok: true,
      value: {
        plan: { document: { version } },
        stepParallels:
          version >= 13
            ? [
                { workItemId: 'row-1', stepId: 'step-1', maxParallel: 1 },
                { workItemId: 'row-2', stepId: 'step-2', maxParallel: 3 },
              ]
            : [],
      },
    });
  },
);

test.each([11, 12, 13, 14])('measures remain introduced at11 for version%i', async (version) => {
  const plan = createDocument(version);
  plan.settings.budgetFactor = 2;
  plan.measureDefinitions = [
    {
      key: 'widgets',
      name: 'Widgets',
      unit: 'widget',
      kind: 'count',
      scale: 'integer',
      threePoint: false,
      showByDefault: true,
      schedulesWork: false,
      derived: false,
      order: 1,
      currency: null,
    },
  ];
  plan.measureFacts = [
    { workItemId: 'row-1', stepId: 'step-1', measure: 'widgets', value: 7, basis: null },
  ];
  plan.directory.resources = [
    { id: 'resource', name: 'Pool', kind: 'divisible', unitLabel: 'seat' },
  ];
  plan.resourceCapacities = [{ resourceId: 'resource', units: 3 }];
  plan.demands = [{ workItemId: 'row-1', resourceId: 'resource', units: 1 }];
  const decoded = await decodePlanDocumentTransfer(plan);
  expect(decoded).toMatchObject({
    ok: true,
    value: {
      plan: {
        settings: { budgetFactor: 2 },
        measureDefinitions: plan.measureDefinitions,
        measureFacts: plan.measureFacts,
        resourceCapacities: plan.resourceCapacities,
        demands: plan.demands,
      },
    },
  });
});

test.each([12, 14])('connected%i retains exact external mappings', async (version) => {
  const plan = createDocument(version);
  expect(await decodePlanDocumentTransfer(plan)).toMatchObject({
    ok: true,
    value: {
      plan: { typedDependencies: plan.typedDependencies, externalMappings: plan.externalMappings },
    },
  });
});

test('ordinary13 uses the local dialect and refuses external mappings', async () => {
  expect(await decodePlanDocumentTransfer(createDocument(13))).toMatchObject({ ok: true });
  const plan = createDocument(13);
  plan.externalMappings = createDocument(12).externalMappings;
  expect(await decodePlanDocumentTransfer(plan)).toMatchObject({
    ok: false,
    code: 'invalid_typed_dependency',
    path: 'externalMappings',
  });
});

test.each([
  { name: 'missing collection', supplied: undefined, path: 'stepParallels' },
  { name: 'null collection', supplied: null, path: 'stepParallels' },
  { name: 'object collection', supplied: {}, path: 'stepParallels' },
  { name: 'null row', supplied: [null], path: 'stepParallels[0]' },
  { name: 'array row', supplied: [[]], path: 'stepParallels[0]' },
  {
    name: 'array row with named values',
    supplied: [Object.assign([], { workItemId: 'row-1', stepId: 'step-1', maxParallel: 1 })],
    path: 'stepParallels[0]',
  },
  {
    name: 'zero maximum',
    supplied: [{ workItemId: 'row-1', stepId: 'step-1', maxParallel: 0 }],
    path: 'stepParallels[0]',
  },
  {
    name: 'missing owner',
    supplied: [{ stepId: 'step-1', maxParallel: 1 }],
    path: 'stepParallels[0]',
  },
  {
    name: 'numeric owner',
    supplied: [{ workItemId: 1, stepId: 'step-1', maxParallel: 1 }],
    path: 'stepParallels[0]',
  },
  {
    name: 'missing step',
    supplied: [{ workItemId: 'row-1', maxParallel: 1 }],
    path: 'stepParallels[0]',
  },
  {
    name: 'numeric step',
    supplied: [{ workItemId: 'row-1', stepId: 1, maxParallel: 1 }],
    path: 'stepParallels[0]',
  },
])('current sparse rejects $name at its exact layer', async ({ supplied, path }) => {
  expect(
    await decodePlanDocumentTransfer({ ...createDocument(13), stepParallels: supplied }),
  ).toEqual({ ok: false, code: 'invalid_body', path });
});

test.each([1, 11, 12])('legacy%i refuses sparse smuggling before projection', async (version) => {
  expect(
    await decodePlanDocumentTransfer({
      ...createDocument(version),
      stepParallels: [{ workItemId: 'row-1', stepId: 'step-1', maxParallel: 1 }],
    }),
  ).toEqual({ ok: false, code: 'invalid_body', path: 'stepParallels' });
  expect(
    await decodePlanDocumentTransfer({ ...createDocument(version), stepParallels: [] }),
  ).toMatchObject({ ok: true, value: { stepParallels: [] } });
});

test.each(['foreign', 'missing'])('sparse owner cannot borrow %s identity', async (workItemId) => {
  expect(
    await decodePlanDocumentTransfer({
      ...createDocument(13),
      stepParallels: [{ workItemId, stepId: 'step-1', maxParallel: 1 }],
    }),
  ).toMatchObject({ ok: false, path: 'stepParallels[0].workItemId' });
});

test('sparse pair rejects duplicates and unknown steps', async () => {
  const fact = { workItemId: 'row-1', stepId: 'step-1', maxParallel: 1 };
  expect(
    await decodePlanDocumentTransfer({ ...createDocument(13), stepParallels: [fact, fact] }),
  ).toMatchObject({ ok: false, path: 'stepParallels[1]' });
  expect(
    await decodePlanDocumentTransfer({
      ...createDocument(13),
      stepParallels: [{ ...fact, stepId: 'foreign-step' }],
    }),
  ).toMatchObject({ ok: false, path: 'stepParallels[0].stepId' });
});

test.each([0, 15, 100])('unsupported header%i precedes body validation', async (version) => {
  expect(
    await decodePlanDocumentTransfer({ document: { format: 'wbs-plan', version, exportedAt: '' } }),
  ).toEqual({ ok: false, code: 'unsupported_version', path: 'document.version' });
});

test.each([null, '13', 13.5])('invalid header %j refuses typed input', async (version) => {
  expect(
    await decodePlanDocumentTransfer({ document: { format: 'wbs-plan', version, exportedAt: '' } }),
  ).toMatchObject({ ok: false, code: 'invalid_body' });
});

test.each([13, 14])('mounted classifier retains version%i fence', async (version) => {
  expect(await classifyPlanDocument(createDocument(version))).toEqual({
    ok: false,
    code: 'unsupported_version',
    path: 'document.version',
  });
});

test('current sparse facts are detached and preserve absence and explicit equality', async () => {
  const plan = createDocument(13);
  const decoded = await decodePlanDocumentTransfer(plan);
  expect(decoded).toMatchObject({
    ok: true,
    value: {
      family: 'ordinary',
      stepParallels: [
        { workItemId: 'row-1', stepId: 'step-1', maxParallel: 1 },
        { workItemId: 'row-2', stepId: 'step-2', maxParallel: 3 },
      ],
    },
  });
  if (!decoded.ok) throw new Error('valid sparse fixture refused');
  Reflect.set(plan, 'stepParallels', []);
  expect(decoded.value.stepParallels).toHaveLength(2);
  expect(
    decoded.value.stepParallels.some(
      (fact) => fact.workItemId === 'row-1' && fact.stepId === 'step-2',
    ),
  ).toBe(false);
});

test('connected evidence is required, discriminated and detached', async () => {
  const plan = createDocument(14);
  const decoded = await decodePlanDocumentTransfer(plan);
  expect(decoded).toMatchObject({
    ok: true,
    value: { family: 'connected', connected: plan.connected },
  });
  Reflect.set(plan.connected ?? {}, 'projectId', 'changed');
  expect(decoded).toMatchObject({ ok: true, value: { connected: { projectId: 'source' } } });
  Reflect.deleteProperty(plan, 'connected');
  expect(await decodePlanDocumentTransfer(plan)).toEqual({
    ok: false,
    code: 'invalid_body',
    path: 'connected',
  });
});

test('a parent and duplicate local inventories refuse sparse ownership', async () => {
  const plan = createDocument(13);
  const second = plan.workItems[1];
  second.parentId = 'row-1';
  expect(await decodePlanDocumentTransfer(plan)).toMatchObject({
    ok: false,
    path: 'stepParallels[0].workItemId',
  });
  second.parentId = null;
  second.id = 'row-1';
  expect(await decodePlanDocumentTransfer(plan)).toMatchObject({ ok: false, path: 'workItems' });
});

test.each([13, 14])(
  'version%i rejects every malformed primitive and local reference',
  async (version) => {
    for (const maxParallel of [-1, 0, 1.5, 1001, Infinity, '1', null])
      expect(
        await decodePlanDocumentTransfer({
          ...createDocument(version),
          stepParallels: [{ workItemId: 'row-1', stepId: 'step-1', maxParallel }],
        }),
      ).toEqual({ ok: false, code: 'invalid_body', path: 'stepParallels[0]' });
    expect(
      await decodePlanDocumentTransfer({
        ...createDocument(version),
        stepParallels: [{ workItemId: 'foreign', stepId: 'step-1', maxParallel: 1 }],
      }),
    ).toMatchObject({ ok: false, path: 'stepParallels[0].workItemId' });
    expect(
      await decodePlanDocumentTransfer({
        ...createDocument(version),
        stepParallels: [{ workItemId: 'row-1', stepId: 'foreign-step', maxParallel: 1 }],
      }),
    ).toMatchObject({ ok: false, path: 'stepParallels[0].stepId' });
  },
);

test.each([null, {}, 'invalid'])(
  'legacy malformed sparse %j is never stripped',
  async (stepParallels) => {
    expect(await decodePlanDocumentTransfer({ ...createDocument(11), stepParallels })).toEqual({
      ok: false,
      code: 'invalid_body',
      path: 'stepParallels',
    });
  },
);

test('duplicate steps refuse even with an empty sparse collection', async () => {
  const plan = createDocument(13);
  const first = plan.steps[0];
  plan.steps.push(first);
  expect(await decodePlanDocumentTransfer({ ...plan, stepParallels: [] })).toEqual({
    ok: false,
    code: 'invalid_body',
    path: 'steps',
  });
});

test.each([12, 14])(
  'connected%i preserves historical bytes, positions and terminal evidence',
  async (version) => {
    const plan = createDocument(version);
    const canonical = ' {"version":1,"historical":"é"}\n';
    const question = {
      projectId: 'peer',
      inputHash: 'input',
      questionHash: 'question',
      objective: 'pri',
      contractVersion: '18',
      budgetMs: 50,
      quantum: 1,
      wireVersion: 5,
      stageBytes: canonical,
    };
    const connected = {
      kind: 'connected',
      projectId: 'source',
      mode: 'isolated',
      projects: [
        {
          projectId: 'peer',
          name: 'Peer',
          abbreviation: 'PEER',
          rank: 0,
          startDate: null,
          timezone: 'UTC',
          revision: 9,
          seq: 17,
        },
      ],
      relationships: [],
      placement: {
        kind: 'scheduled',
        originOrdinal: 1,
        idleProjects: [],
        baseline: [{ projectId: 'peer', workItemId: 'foreign', stepId: null, start: 1, finish: 2 }],
        selected: [{ projectId: 'peer', workItemId: 'foreign', stepId: null, start: 7, finish: 8 }],
        stages: [
          {
            projectId: 'peer',
            engine: 'optimized',
            objective: 'pri',
            boundary: { format: 'wbs-connected-stage', version: 1, canonical },
            optimization: {
              inputHash: 'input',
              generation: 3,
              contractVersion: '18',
              budgetMs: 50,
              quantum: 1,
              wireVersion: 5,
              variants: {
                pri: {
                  state: 'boundary-infeasible',
                  certificate: {
                    kind: 'boundary-infeasible',
                    question,
                    evidence: 'contradictory-bounds',
                  },
                },
                time: { state: 'idle' },
              },
              candidates: { pri: null, time: null },
            },
            decisions: { pri: null, time: null },
            chosen: null,
          },
        ],
      },
    };
    const decoded = await decodePlanDocumentTransfer({ ...plan, connected });
    expect(decoded).toMatchObject({ ok: true, value: { family: 'connected' } });
    if (!decoded.ok || decoded.value.family !== 'connected')
      throw new Error('connected fixture refused');
    expect(decoded.value.connected).toEqual(connected);
  },
);

test.each([
  { field: 'maxParallel', first: 1, later: 1001 },
  { field: 'workItemId', first: 'row-1', later: 'row-2' },
  { field: 'stepId', first: 'step-1', later: 'step-2' },
])('sparse $field is captured once before validation', async ({ field, first, later }) => {
  let reads = 0;
  const fact = { workItemId: 'row-1', stepId: 'step-1', maxParallel: 1 };
  Object.defineProperty(fact, field, {
    enumerable: true,
    get() {
      reads += 1;
      return reads === 1 ? first : later;
    },
  });
  const decoded = await decodePlanDocumentTransfer({
    ...createDocument(13),
    stepParallels: [fact],
  });
  expect(decoded).toMatchObject({
    ok: true,
    value: { stepParallels: [{ workItemId: 'row-1', stepId: 'step-1', maxParallel: 1 }] },
  });
  expect(reads).toBe(1);
});

test('sparse getter failures propagate without a client-error relabel', async () => {
  const failure = new Error('sparse getter failed');
  const fact = {
    workItemId: 'row-1',
    stepId: 'step-1',
    get maxParallel() {
      throw failure;
    },
  };
  const thrown: unknown = await decodePlanDocumentTransfer({
    ...createDocument(13),
    stepParallels: [fact],
  }).catch((cause: unknown) => cause);
  expect(thrown).toBe(failure);
});

test('connected identities are captured once before validation', async () => {
  const plan = createDocument(14);
  let reads = 0;
  const connected = {
    ...plan.connected,
    get projectId() {
      reads += 1;
      return reads === 1 ? 'source' : 42;
    },
  };
  const decoded = await decodePlanDocumentTransfer({ ...plan, connected });
  expect(decoded).toMatchObject({
    ok: true,
    value: { family: 'connected', connected: { projectId: 'source' } },
  });
  expect(reads).toBe(1);
});

test('nested connected evidence is captured once before validation', async () => {
  let reads = 0;
  const project = {
    projectId: 'peer',
    name: 'Peer',
    abbreviation: 'PEER',
    rank: 0,
    startDate: null,
    timezone: 'UTC',
    seq: 17,
    get revision() {
      reads += 1;
      return reads === 1 ? 9 : NaN;
    },
  };
  const plan = createDocument(14);
  const decoded = await decodePlanDocumentTransfer({
    ...plan,
    connected: { ...plan.connected, projects: [project] },
  });
  expect(decoded).toMatchObject({
    ok: true,
    value: { family: 'connected', connected: { projects: [{ revision: 9 }] } },
  });
  expect(reads).toBe(1);
});

test('connected malformed values refuse while getter failures propagate', async () => {
  const plan = createDocument(14);
  expect(
    await decodePlanDocumentTransfer({
      ...plan,
      connected: { ...plan.connected, projectId: () => 'source' },
    }),
  ).toEqual({ ok: false, code: 'invalid_body', path: 'connected' });
  const failure = new Error('connected getter failed');
  const thrown: unknown = await decodePlanDocumentTransfer({
    ...plan,
    connected: {
      ...plan.connected,
      get projectId() {
        throw failure;
      },
    },
  }).catch((cause: unknown) => cause);
  expect(thrown).toBe(failure);
});

test('shared connected evidence is captured once and undeclared JSON fields retain holes', async () => {
  let reads = 0;
  const project = {
    projectId: 'peer',
    name: 'Peer',
    abbreviation: 'PEER',
    rank: 0,
    startDate: null,
    timezone: 'UTC',
    seq: 17,
    get revision() {
      reads += 1;
      return reads === 1 ? 9 : NaN;
    },
  };
  const notes = { labels: new Array<unknown>(2) };
  notes.labels[1] = 'retained';
  Object.defineProperty(notes, '__proto__', { enumerable: true, value: { marker: 'own value' } });
  Object.defineProperty(notes, 'constructor', { enumerable: true, value: 'own constructor' });
  const plan = createDocument(14);
  const decoded = await decodePlanDocumentTransfer({
    ...plan,
    connected: { ...plan.connected, projects: [project, project], notes },
  });
  expect(decoded).toMatchObject({
    ok: true,
    value: {
      family: 'connected',
      connected: { projects: [{ revision: 9 }, { revision: 9 }], notes },
    },
  });
  expect(reads).toBe(1);
  if (!decoded.ok || decoded.value.family !== 'connected')
    throw new Error('connected fixture refused');
  const preserved: unknown = Reflect.get(decoded.value.connected, 'notes');
  expect(preserved).toEqual(notes);
  expect(preserved).not.toBe(notes);
  if (typeof preserved !== 'object' || preserved === null)
    throw new Error('connected notes missing');
  expect(Object.getPrototypeOf(preserved)).toBe(Object.prototype);
  expect(Object.hasOwn(preserved, '__proto__')).toBe(true);
  expect(Reflect.get(preserved, '__proto__')).toEqual({ marker: 'own value' });
  expect(Object.hasOwn(preserved, 'constructor')).toBe(true);
  expect(Reflect.get(preserved, 'constructor')).toBe('own constructor');
});
