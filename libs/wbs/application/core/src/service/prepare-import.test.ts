import { expect, test } from 'bun:test';

import { findImportDependencyDuplicate } from '../module/plan-import/import-values';
import { prepareImport } from '../module/plan-import/prepare-import';
import { planDocumentFixture } from '../testing/plan-document-fixture';

const supportsAll = { supports: () => true };
type PlanFixture = ReturnType<typeof planDocumentFixture>;
type Fault = (body: PlanFixture) => void;

function at<T>(values: readonly T[], index = 0): T {
  const value = values.at(index);
  if (value === undefined) throw new Error(`fixture lacks entry ${String(index)}`);
  return value;
}

test('prepares normalized names, indexes and leaf values', () => {
  const prepared = prepareImport(planDocumentFixture(), supportsAll);
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) return;
  expect(prepared.value.settings.name).toBe('Portable plan');
  expect(prepared.value.teamByFileId.get('team-1')?.name).toBe('Billing');
  expect(prepared.value.priorityBands[0]?.label).toBe('Critical');
  expect(prepared.value.calendarMarkers[0]?.name).toBe(' Launch ');
  expect(prepared.value.workItems[0]?.startNoEarlierThanReason).toBe('Release window');
  expect(prepared.value.stepByFileId.get('step-1')?.name).toBe('Build');
  expect(prepared.value.workItems[0]?.estimates).toEqual([
    { stepFileId: 'step-1', optimistic: 1, realistic: 2, pessimistic: 3 },
  ]);
  expect(prepared.value.workItems[0]).toMatchObject({
    fileId: 'row-1',
    parentFileId: null,
    position: 10,
    name: 'Ship',
    notes: 'Keep the deadline',
    frozenNumber: null,
    startNoEarlierThan: '2026-09-14',
    startNoEarlierThanReason: 'Release window',
    deadline: '2026-09-18',
    factStart: null,
    factEnd: null,
    readiness: null,
    hold: null,
    priority: 2,
    serviceTeamFileId: 'team-1',
    serviceFileId: 'service-1',
    maxParallel: 1,
    teamFileIds: ['team-1'],
    tagFileIds: ['tag-1'],
    serviceFileIds: ['service-1'],
    typeFileIds: ['type-1'],
    externalRefs: [
      {
        fileId: 'external-ref-1',
        systemFileId: 'system-1',
        url: 'https://example.test/issues/1',
        name: 'ISSUE-1',
      },
    ],
  });
  expect(prepared.value.workItems[0]).not.toHaveProperty('id');
  expect(prepared.value.workItems[0]).not.toHaveProperty('dependsOn');
  expect(prepared.value.capacity[0]).toEqual({ teamFileId: 'team-1', size: 2 });
  expect(prepared.value.dependencies).toEqual([]);
  expect(prepared.value.workItems[0]?.assignments).toEqual([
    { stepFileId: 'step-1', personFileId: 'person-1' },
  ]);
});

const fieldFaults: readonly (readonly [string, Fault, string, string])[] = [
  [
    'blank project name',
    (body) => {
      body.settings.name = '   ';
    },
    'invalid_body',
    'settings.name',
  ],
  [
    'invalid project start',
    (body) => {
      body.settings.startDate = '2026-02-31';
    },
    'invalid_body',
    'settings.startDate',
  ],
  [
    'invalid PERT weights',
    (body) => {
      body.settings.pertWeights = { optimistic: 0, realistic: 0, pessimistic: 0 };
    },
    'invalid_body',
    'settings.pertWeights',
  ],
  [
    'duplicate row id',
    (body) => body.workItems.push(structuredClone(at(body.workItems))),
    'invalid_body',
    'workItems[1].id',
  ],
  [
    'duplicate trimmed tag name',
    (body) => body.directory.tags.push({ id: 'tag-2', name: 'Release' }),
    'invalid_body',
    'directory.tags[1].name',
  ],
  [
    'invalid date',
    (body) => {
      at(body.workItems).deadline = '2026-02-31';
    },
    'invalid_body',
    'workItems[0].deadline',
  ],
  [
    'invalid priority',
    (body) => {
      at(body.workItems).priority = 0;
    },
    'invalid_body',
    'workItems[0].priority',
  ],
  [
    'invalid band',
    (body) => {
      at(body.priorityBands, 1).startsAt = 1;
    },
    'invalid_body',
    'priorityBands[1].startsAt',
  ],
  [
    'nonpositive band start',
    (body) => {
      at(body.priorityBands).startsAt = 0;
    },
    'invalid_body',
    'priorityBands[0].startsAt',
  ],
  [
    'nonpositive band default',
    (body) => {
      at(body.priorityBands).defaultValue = 0;
    },
    'invalid_body',
    'priorityBands[0].defaultValue',
  ],
  [
    'band default outside its range',
    (body) => {
      at(body.priorityBands).defaultValue = 30;
    },
    'invalid_body',
    'priorityBands',
  ],
  [
    'invalid capacity',
    (body) => {
      at(body.capacity).size = 0;
    },
    'invalid_body',
    'capacity[0].size',
  ],
  [
    'duplicate capacity team',
    (body) => {
      body.capacity.push({ teamId: 'team-1', size: 1 });
    },
    'invalid_body',
    'capacity[1].teamId',
  ],
  [
    'unknown step',
    (body) => {
      at(body.workItems).estimates = { missing: { optimistic: 1, realistic: 1, pessimistic: 1 } };
    },
    'unknown_ref',
    'workItems[0].estimates.missing',
  ],
  [
    'unknown system',
    (body) => {
      at(at(body.workItems).externalRefs).systemId = 'missing';
    },
    'unknown_ref',
    'workItems[0].externalRefs[0].systemId',
  ],
  [
    'unknown person',
    (body) => {
      at(body.workItems).assignees['step-1'] = 'missing';
    },
    'unknown_ref',
    'workItems[0].assignees.step-1',
  ],
  [
    'unknown capacity team',
    (body) => {
      at(body.capacity).teamId = 'missing';
    },
    'unknown_ref',
    'capacity[0].teamId',
  ],
  [
    'unknown owned service',
    (body) => {
      const team = at(body.directory.teams);
      team.serviceIds = ['missing'];
    },
    'unknown_ref',
    'directory.teams[0].serviceIds[0]',
  ],
  [
    'unknown membership team',
    (body) => {
      const person = at(body.directory.people);
      person.teamIds = ['missing'];
    },
    'unknown_ref',
    'directory.people[0].teamIds[0]',
  ],
  [
    'unknown row tag',
    (body) => {
      at(body.workItems).tagIds = ['missing'];
    },
    'unknown_ref',
    'workItems[0].tagIds[0]',
  ],
  [
    'invalid row position',
    (body) => {
      at(body.workItems).position = 1.5;
    },
    'invalid_body',
    'workItems[0].position',
  ],
  [
    'blank row name',
    (body) => {
      at(body.workItems).name = '   ';
    },
    'invalid_body',
    'workItems[0].name',
  ],
  [
    'invalid parallelism',
    (body) => {
      at(body.workItems).maxParallel = 0;
    },
    'invalid_body',
    'workItems[0].maxParallel',
  ],
  [
    'empty external URL',
    (body) => {
      at(at(body.workItems).externalRefs).url = '';
    },
    'invalid_body',
    'workItems[0].externalRefs[0].url',
  ],
  [
    'overlong external ref name',
    (body) => {
      at(at(body.workItems).externalRefs).name = 'x'.repeat(301);
    },
    'invalid_body',
    'workItems[0].externalRefs[0].name',
  ],
  [
    'duplicate external ref id',
    (body) => {
      const row = at(body.workItems);
      row.externalRefs.push(structuredClone(at(row.externalRefs)));
    },
    'invalid_body',
    'workItems[0].externalRefs[1].id',
  ],
  [
    'unknown assignment step',
    (body) => {
      at(body.workItems).assignees = { missing: 'person-1' };
    },
    'unknown_ref',
    'workItems[0].assignees.missing',
  ],
];

test.each(fieldFaults)('%s refuses at the first stable path', (_name, fault, code, path) => {
  const body = planDocumentFixture();
  fault(body);
  expect(prepareImport(body, supportsAll)).toMatchObject({ ok: false, code, path });
});

const leafValueFaults: readonly (readonly [string, Fault, string])[] = [
  [
    'unordered estimate',
    (body) => {
      at(body.workItems).estimates = {
        'step-1': { optimistic: 3, realistic: 2, pessimistic: 1 },
      };
    },
    'workItems[0].estimates.step-1',
  ],
  [
    'negative actual',
    (body) => {
      at(body.workItems).actuals = { 'step-1': -1 };
    },
    'workItems[0].actuals.step-1',
  ],
  [
    'invalid progress',
    (body) => {
      at(body.workItems).progress = { 'step-1': 'not_started' };
    },
    'workItems[0].progress.step-1',
  ],
  [
    'unknown measure metric',
    (body) => {
      at(body.workItems).measures = { hours: { 'step-1': 1 } };
    },
    'workItems[0].measures.hours',
  ],
  [
    'negative measure',
    (body) => {
      at(body.workItems).measures = { hours_actual: { 'step-1': -1 } };
    },
    'workItems[0].measures.hours_actual.step-1',
  ],
  [
    'measure map is not an object',
    (body) => {
      at(body.workItems).measures = { hours_actual: 3 };
    },
    'workItems[0].measures.hours_actual',
  ],
];

test.each(leafValueFaults)('%s is refused as an invalid leaf value', (_name, fault, path) => {
  const body = planDocumentFixture();
  fault(body);
  expect(prepareImport(body, supportsAll)).toMatchObject({ ok: false, code: 'invalid_body', path });
});

test('validates step positions, marker colors and not-before reasons', () => {
  const duplicateStepPosition = planDocumentFixture();
  at(duplicateStepPosition.steps, 1).position = at(duplicateStepPosition.steps).position;
  expect(prepareImport(duplicateStepPosition, supportsAll)).toMatchObject({
    ok: false,
    code: 'invalid_body',
    path: 'steps[1].position',
  });

  const malformedMarkerDate = planDocumentFixture();
  at(malformedMarkerDate.calendarMarkers).date = '2026-02-31';
  expect(prepareImport(malformedMarkerDate, supportsAll)).toMatchObject({
    ok: false,
    code: 'invalid_body',
    path: 'calendarMarkers[0].date',
  });

  const blankMarkerName = planDocumentFixture();
  at(blankMarkerName.calendarMarkers).name = '';
  expect(prepareImport(blankMarkerName, supportsAll)).toMatchObject({
    ok: false,
    code: 'invalid_body',
    path: 'calendarMarkers[0].name',
  });

  const malformedColor = planDocumentFixture();
  at(malformedColor.calendarMarkers).color = '#bad';
  expect(prepareImport(malformedColor, supportsAll)).toMatchObject({
    ok: false,
    code: 'invalid_body',
    path: 'calendarMarkers[0].color',
  });

  const orphanedReason = planDocumentFixture();
  at(orphanedReason.workItems).startNoEarlierThan = null;
  expect(prepareImport(orphanedReason, supportsAll)).toMatchObject({
    ok: false,
    code: 'invalid_body',
    path: 'workItems[0].startNoEarlierThanReason',
  });

  const overlongReason = planDocumentFixture();
  at(overlongReason.workItems).startNoEarlierThanReason = 'x'.repeat(201);
  expect(prepareImport(overlongReason, supportsAll)).toMatchObject({
    ok: false,
    code: 'invalid_body',
    path: 'workItems[0].startNoEarlierThanReason',
  });
});

test('accepts forward references and out-of-order parents', () => {
  const body = planDocumentFixture();
  const child = structuredClone(at(body.workItems));
  child.id = 'child';
  child.parentId = 'parent';
  child.dependsOn = ['later'];
  child.externalRefs = [];
  const parent = structuredClone(at(body.workItems));
  parent.id = 'parent';
  parent.parentId = null;
  parent.position = 20;
  parent.estimates = { broken: 'ignored parent aggregate' };
  parent.externalRefs = [];
  const later = structuredClone(at(body.workItems));
  later.id = 'later';
  later.position = 30;
  later.externalRefs = [];
  body.workItems = [child, parent, later];
  expect(prepareImport(body, supportsAll).ok).toBe(true);
});

const graphFaults: readonly (readonly [string, Fault, string, string])[] = [
  [
    'missing parent',
    (body) => {
      at(body.workItems).parentId = 'missing';
    },
    'unknown_ref',
    'workItems[0].parentId',
  ],
  [
    'parent self-cycle',
    (body) => {
      at(body.workItems).parentId = 'row-1';
    },
    'cycle',
    'workItems[0].parentId',
  ],
  [
    'duplicate sibling position',
    (body) => {
      const row = structuredClone(at(body.workItems));
      row.id = 'row-2';
      body.workItems.push(row);
    },
    'invalid_body',
    'workItems[1].position',
  ],
  [
    'unknown dependency',
    (body) => {
      at(body.workItems).dependsOn = ['missing'];
    },
    'unknown_ref',
    'workItems[0].dependsOn[0]',
  ],
];

test.each(graphFaults)('%s refuses before preparation', (_name, fault, code, path) => {
  const body = planDocumentFixture();
  fault(body);
  expect(prepareImport(body, supportsAll)).toMatchObject({ ok: false, code, path });
});

test('fully declared parent cycle refuses before admission', () => {
  const body = planDocumentFixture();
  const first = at(body.workItems);
  const second = structuredClone(first);
  second.id = 'row-2';
  second.position = 20;
  first.parentId = second.id;
  second.parentId = first.id;
  body.workItems.push(second);
  expect(prepareImport(body, supportsAll)).toMatchObject({
    ok: false,
    code: 'cycle',
    path: 'workItems[0].parentId',
  });
});

test('complete dependency rules refuse ancestry and cycles independent of edge order', () => {
  const ancestral = planDocumentFixture();
  const parent = at(ancestral.workItems);
  const child = structuredClone(parent);
  child.id = 'child';
  child.parentId = parent.id;
  child.position = 20;
  child.externalRefs = [];
  child.dependsOn = [parent.id];
  ancestral.workItems.push(child);
  expect(prepareImport(ancestral, supportsAll)).toMatchObject({
    ok: false,
    code: 'ancestor',
    path: 'workItems[1].dependsOn[0]',
  });

  const cyclic = planDocumentFixture();
  const first = at(cyclic.workItems);
  const second = structuredClone(first);
  second.id = 'row-2';
  second.position = 20;
  second.externalRefs = [];
  first.dependsOn = [second.id];
  second.dependsOn = [first.id];
  cyclic.workItems.push(second);
  expect(prepareImport(cyclic, supportsAll)).toMatchObject({
    ok: false,
    code: 'cycle',
    path: 'workItems[0].dependsOn[0]',
  });
});

test('parent aggregate maps never become prepared facts', () => {
  const body = planDocumentFixture();
  const parent = at(body.workItems);
  const child = structuredClone(parent);
  child.id = 'leaf';
  child.parentId = 'row-1';
  child.externalRefs = [];
  parent.estimates = { absent: 'deliberately invalid' };
  parent.actuals = { absent: -1 };
  parent.progress = { absent: 'blocked' };
  parent.measures = { made_up: { absent: -1 } };
  parent.assignees = {};
  Reflect.set(parent, 'doesEveryStep', true);
  body.workItems.push(child);
  const prepared = prepareImport(body, supportsAll);
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) return;
  expect(prepared.value.workItems[0]).toMatchObject({
    isLeaf: false,
    estimates: [],
    actuals: [],
    progress: [],
    measures: [],
    assignments: [],
  });
});

test('deadline before day zero is refused', () => {
  const body = planDocumentFixture();
  at(body.workItems).deadline = '2026-09-13';
  expect(prepareImport(body, supportsAll)).toMatchObject({
    ok: false,
    code: 'deadline_before_project_start',
    path: 'workItems[0].deadline',
  });
});

test('enabled unavailable optimizer refuses while a disabled preference is retained', () => {
  const unavailable = { supports: (engine: string) => engine === 'fast' };
  const enabled = planDocumentFixture();
  enabled.settings.optimizationEnabled = true;
  enabled.settings.scheduleEngine = 'optimized';
  expect(prepareImport(enabled, unavailable)).toMatchObject({
    ok: false,
    code: 'engine_unavailable',
    path: 'settings.scheduleEngine',
  });
  const disabled = planDocumentFixture();
  disabled.settings.scheduleEngine = 'optimized';
  const prepared = prepareImport(disabled, unavailable);
  expect(prepared.ok).toBe(true);
  if (prepared.ok) expect(prepared.value.settings.scheduleEngine).toBe('optimized');
});

/** Proof: see the allowance guard in `prepareImport`. */
test('refuses a step allowance over 1000%, and carries a valid one to the prepared step', () => {
  const prepared = prepareImport(planDocumentFixture(), supportsAll);
  if (!prepared.ok) throw new Error('fixture refused');
  expect(prepared.value.stepByFileId.get('step-2')?.allowancePercent).toBe(30);

  for (const allowancePercent of [1000.01, -1, 0.001]) {
    const refused = planDocumentFixture();
    at(refused.steps, 1).allowancePercent = allowancePercent;
    expect(prepareImport(refused, supportsAll)).toMatchObject({
      ok: false,
      code: 'invalid_body',
      path: 'steps[1].allowancePercent',
    });
  }
});

/** The fixture with a second type and a second root row, both rows carrying both types. */
function twoConflictedRows(): PlanFixture {
  const body = planDocumentFixture();
  body.directory.types.push({ id: 'type-2', name: 'Spike' });
  const first = at(body.workItems);
  first.typeIds = ['type-1', 'type-2'];
  body.workItems.push({
    ...structuredClone(first),
    id: 'row-2',
    position: 20,
    externalRefs: [],
    assignees: {},
  });
  return body;
}

test('refuses rows carrying several types, naming every such row', () => {
  // Proof: the one-type row check skipped in prepareImport and this received
  // ok: true. Watched 2026-09-27.
  expect(prepareImport(twoConflictedRows(), supportsAll)).toEqual({
    ok: false,
    code: 'work_item_takes_one_type',
    path: 'workItems[0].typeIds',
    detail: 'row-1, row-2',
  });
});

test('counts a repeated type id as one type', () => {
  const body = planDocumentFixture();
  at(body.workItems).typeIds = ['type-1', 'type-1'];
  expect(prepareImport(body, supportsAll).ok).toBe(true);
});

test('carries a version-3 file’s step codes to the prepared steps', () => {
  const prepared = prepareImport(planDocumentFixture(), supportsAll);
  if (!prepared.ok) throw new Error('fixture refused');
  expect(prepared.value.steps.map(({ fileId, code }) => [fileId, code])).toEqual([
    ['step-1', 'impl'],
    ['step-2', 'qa'],
  ]);
});

test('suggests codes in step order for an earlier-version file, exactly as for new steps', () => {
  const earlier = planDocumentFixture();
  earlier.steps = [
    {
      estimateUnit: 'workdays' as const,
      id: 'step-2',
      name: 'Review!',
      position: 20,
      allowancePercent: 0,
      code: null,
    },
    {
      estimateUnit: 'workdays' as const,
      id: 'step-1',
      name: ' Review ',
      position: 10,
      allowancePercent: 0,
      code: null,
    },
    {
      estimateUnit: 'workdays' as const,
      id: 'step-3',
      name: 'S1 check',
      position: 30,
      allowancePercent: 0,
      code: null,
    },
  ];
  const prepared = prepareImport(earlier, supportsAll);
  if (!prepared.ok) throw new Error(`earlier file refused`);
  expect(
    Object.fromEntries(prepared.value.steps.map(({ fileId, code }) => [fileId, code])),
  ).toEqual({
    'step-1': 'review',
    'step-2': 'review-2',
    'step-3': 'step-s1-check',
  });
});

/** Proof: see the step-code guards in `prepareImport`. */
test('refuses a version-3 step code that is malformed, reserved or a duplicate', () => {
  for (const code of ['QA', '', '2qa', 'a'.repeat(33), 's1-qa', 's12', 'impl']) {
    const refused = planDocumentFixture();
    at(refused.steps, 1).code = code;
    expect(prepareImport(refused, supportsAll)).toEqual({
      ok: false,
      code: 'invalid_body',
      path: 'steps[1].code',
      detail: code,
    });
  }
});

test('prepares whole minute trios with their step unit and refuses fractional minute imports', () => {
  const document = planDocumentFixture();
  document.steps = document.steps.map((step) => ({ ...step, estimateUnit: 'minutes' }));
  const prepared = prepareImport(document, supportsAll);
  if (!prepared.ok) throw new Error('whole minute document refused');
  expect(prepared.value.steps.every((step) => step.estimateUnit === 'minutes')).toBe(true);
  const row = at(document.workItems);
  Reflect.set(row.estimates, 'step-1', { optimistic: 1.5, realistic: 2, pessimistic: 3 });
  expect(prepareImport(document, supportsAll)).toMatchObject({
    ok: false,
    code: 'invalid_body',
    path: 'workItems[0].estimates.step-1',
  });
});

test('prepares exact direct blockage identities and negative timestamps', () => {
  const document = planDocumentFixture();
  Reflect.set(document, 'stepBlockages', [
    { workItemId: 'row-1', stepId: 'step-1', blockedAt: -17 },
  ]);
  const prepared = prepareImport(document, supportsAll);
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) return;
  expect(Reflect.get(prepared.value, 'stepBlockages')).toEqual([
    { workItemId: 'row-1', stepId: 'step-1', blockedAt: -17 },
  ]);
});

for (const [name, facts, path] of [
  [
    'unknown owner',
    [{ workItemId: 'missing', stepId: 'step-1', blockedAt: 1 }],
    'stepBlockages[0].workItemId',
  ],
  [
    'unknown step',
    [{ workItemId: 'row-1', stepId: 'missing', blockedAt: 1 }],
    'stepBlockages[0].stepId',
  ],
  [
    'fractional time',
    [{ workItemId: 'row-1', stepId: 'step-1', blockedAt: 1.5 }],
    'stepBlockages[0].blockedAt',
  ],
  [
    'unsafe time',
    [{ workItemId: 'row-1', stepId: 'step-1', blockedAt: Number.MAX_SAFE_INTEGER + 1 }],
    'stepBlockages[0].blockedAt',
  ],
  [
    'duplicate pair',
    [
      { workItemId: 'row-1', stepId: 'step-1', blockedAt: 1 },
      { workItemId: 'row-1', stepId: 'step-1', blockedAt: 2 },
    ],
    'stepBlockages[1]',
  ],
] as const) {
  test(`refuses direct blockage ${name}`, () => {
    const document = planDocumentFixture();
    Reflect.set(document, 'stepBlockages', facts);
    expect(prepareImport(document, supportsAll)).toEqual({
      ok: false,
      code: 'invalid_body',
      path,
      detail: null,
    });
  });
}

test('refuses direct blockage on a parent', () => {
  const document = planDocumentFixture();
  const parent = at(document.workItems);
  parent.estimates = {};
  parent.actuals = {};
  parent.progress = {};
  parent.measures = {};
  parent.assignees = {};
  document.workItems.push({
    ...structuredClone(parent),
    id: 'child',
    parentId: parent.id,
    externalRefs: [],
  });
  Reflect.set(document, 'stepBlockages', [
    { workItemId: parent.id, stepId: 'step-1', blockedAt: 1 },
  ]);
  expect(prepareImport(document, supportsAll)).toEqual({
    ok: false,
    code: 'invalid_body',
    path: 'stepBlockages[0].workItemId',
    detail: null,
  });
});

/** The fixture with two resources, a capacity of each and a demand on the one row. */
function withResources(): PlanFixture {
  const body = planDocumentFixture();
  body.directory.resources = [
    { id: 'res-ram', name: ' h2puni ram ', kind: 'divisible', unitLabel: 'GB' },
    { id: 'res-stage', name: 'staging', kind: 'exclusive', unitLabel: 'env' },
  ];
  body.resourceCapacities = [
    { resourceId: 'res-ram', units: 32 },
    { resourceId: 'res-stage', units: 0 },
  ];
  body.demands = [
    { workItemId: 'row-1', resourceId: 'res-ram', units: 4 },
    { workItemId: 'row-1', resourceId: 'res-stage', units: 1 },
  ];
  return body;
}

test('prepares resources by file id, their capacities and demands (wbs-resources)', () => {
  const prepared = prepareImport(withResources(), supportsAll);
  if (!prepared.ok) throw new Error(`refused at ${prepared.path}`);
  expect([...prepared.value.resourceByFileId.values()]).toEqual([
    { fileId: 'res-ram', name: 'h2puni ram', kind: 'divisible', unitLabel: 'GB' },
    { fileId: 'res-stage', name: 'staging', kind: 'exclusive', unitLabel: 'env' },
  ]);
  expect(prepared.value.resourceCapacities).toEqual([
    { resourceFileId: 'res-ram', units: 32 },
    { resourceFileId: 'res-stage', units: 0 },
  ]);
  expect(prepared.value.demands).toEqual([
    { workItemFileId: 'row-1', resourceFileId: 'res-ram', units: 4 },
    { workItemFileId: 'row-1', resourceFileId: 'res-stage', units: 1 },
  ]);
});

for (const [name, fault, expected] of [
  [
    'a capacity naming no resource of the file',
    (body: PlanFixture) => {
      at(body.resourceCapacities).resourceId = 'res-missing';
    },
    { code: 'unknown_ref', path: 'resourceCapacities[0].resourceId', detail: 'res-missing' },
  ],
  [
    'a resource stated twice',
    (body: PlanFixture) => {
      at(body.resourceCapacities, 1).resourceId = 'res-ram';
    },
    { code: 'invalid_body', path: 'resourceCapacities[1].resourceId', detail: 'res-ram' },
  ],
  [
    'a demand naming no resource of the file',
    (body: PlanFixture) => {
      at(body.demands).resourceId = 'res-missing';
    },
    { code: 'unknown_ref', path: 'demands[0].resourceId', detail: 'res-missing' },
  ],
  [
    'a demand naming no row of the file',
    (body: PlanFixture) => {
      at(body.demands).workItemId = 'row-missing';
    },
    { code: 'unknown_ref', path: 'demands[0].workItemId', detail: 'row-missing' },
  ],
  [
    'one pair demanded twice',
    (body: PlanFixture) => {
      at(body.demands, 1).resourceId = 'res-ram';
    },
    { code: 'invalid_body', path: 'demands[1]', detail: null },
  ],
  [
    'two units of an exclusive resource',
    (body: PlanFixture) => {
      at(body.demands, 1).units = 2;
    },
    { code: 'invalid_body', path: 'demands[1].units', detail: 'exclusive_demand_is_one' },
  ],
  [
    'two resources of one name',
    (body: PlanFixture) => {
      at(body.directory.resources, 1).name = 'h2puni ram';
    },
    { code: 'invalid_body', path: 'directory.resources[1].name', detail: 'h2puni ram' },
  ],
] as const satisfies readonly (readonly [string, Fault, object])[]) {
  // Proof: with each refusal in `prepareResources` bypassed alone, its case here
  // answered ok; watched 2026-10-20.
  test(`refuses a version-10 file whose resources do not resolve: ${name}`, () => {
    const body = withResources();
    fault(body);
    expect(prepareImport(body, supportsAll)).toEqual({ ok: false, ...expected });
  });
}

function externalRelationship(id: string, projectId = 'remote') {
  return {
    id,
    type: 'FS' as const,
    predecessor: {
      kind: 'external' as const,
      scope: 'whole' as const,
      projectId,
      workItemId: 'prerequisite',
      display: {
        projectName: 'Remote',
        abbreviation: 'REM',
        workItemName: 'Prerequisite',
        address: 'REM.1',
      },
    },
    successor: { kind: 'internal' as const, scope: 'whole' as const, workItem: 'row-1' },
  };
}

for (const external of [false, true]) {
  test(`refuses empty authored relationship ID in ${external ? 'external' : 'internal'} arm`, () => {
    const document = planDocumentFixture();
    document.typedDependencies = [
      external
        ? externalRelationship('')
        : {
            id: '',
            type: 'FS',
            predecessor: { scope: 'whole', workItem: 'row-1' },
            successor: { scope: 'whole', workItem: 'row-1' },
          },
    ];
    expect(prepareImport(document, supportsAll)).toMatchObject({
      ok: false,
      code: 'invalid_typed_dependency',
      path: 'typedDependencies[0].id',
    });
  });
}

test('refuses repeated authored ID across internal and external arms before splitting', () => {
  const document = planDocumentFixture();
  document.typedDependencies = [
    externalRelationship('same'),
    {
      id: 'same',
      type: 'SS',
      predecessor: { scope: 'whole', workItem: 'row-1' },
      successor: { scope: 'whole', workItem: 'row-1' },
    },
  ];
  expect(prepareImport(document, supportsAll)).toMatchObject({
    ok: false,
    code: 'invalid_typed_dependency',
    path: 'typedDependencies[1].id',
  });
});

test('refuses semantic duplicates introduced by explicit destination mappings', () => {
  const document = planDocumentFixture();
  document.typedDependencies = [
    externalRelationship('first', 'source-a'),
    externalRelationship('second', 'source-b'),
  ];
  document.externalMappings = ['source-a', 'source-b'].map((projectId) => ({
    source: { scope: 'whole', projectId, workItemId: 'prerequisite' },
    destination: { scope: 'whole', projectId: 'destination', workItemId: 'mapped' },
  }));
  expect(prepareImport(document, supportsAll)).toMatchObject({
    ok: false,
    code: 'invalid_typed_dependency',
    path: 'typedDependencies[1]',
    detail: 'duplicate',
  });
});

test('preserves distinct mapped scopes and original source identities', () => {
  const document = planDocumentFixture();
  document.typedDependencies = [
    externalRelationship('first', 'source-a'),
    externalRelationship('second', 'source-b'),
  ];
  const prepared = prepareImport(document, supportsAll);
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) throw new Error('valid external preparation refused');
  expect(
    prepared.value.externalDependencies.map(({ predecessor }) => predecessor.projectId),
  ).toEqual(['source-a', 'source-b']);
});

test('final scoped tuple comparison detects collisions across declaration arms', () => {
  const relationship = {
    path: 'typedDependencies[0]',
    type: 'FS' as const,
    predecessor: { scope: 'whole' as const, projectId: 'destination', workItemId: 'mapped' },
    successor: { scope: 'whole' as const, projectId: 'new-owner', workItemId: 'new-row' },
  };
  expect(
    findImportDependencyDuplicate([
      relationship,
      { ...relationship, path: 'typedDependencies[1]' },
    ]),
  ).toBe('typedDependencies[1]');
  expect(findImportDependencyDuplicate([relationship, { ...relationship, type: 'SS' }])).toBeNull();
  expect(
    findImportDependencyDuplicate([
      relationship,
      { ...relationship, successor: { ...relationship.successor, projectId: 'other-owner' } },
    ]),
  ).toBeNull();
  expect(
    findImportDependencyDuplicate([
      relationship,
      { ...relationship, predecessor: { ...relationship.predecessor, projectId: 'other-project' } },
    ]),
  ).toBeNull();
});

/**
 * The fixture at version 11: a priced `cost` fact and trio, a `gpu_minutes`
 * definition with a fact, a three-point tokens trio and a tokens budget.
 */
function withMeasures(): PlanFixture {
  const body = planDocumentFixture();
  body.document.version = 11;
  body.settings.budgetFactor = 1.5;
  const base = {
    showByDefault: false,
    schedulesWork: false,
    derived: false,
  };
  body.measureDefinitions = [
    {
      ...base,
      key: 'tokens',
      name: 'Tokens',
      unit: 'tokens',
      kind: 'count',
      scale: 'integer',
      threePoint: true,
      order: 2,
      currency: null,
    },
    {
      ...base,
      key: 'cost',
      name: 'Cost',
      unit: 'micro-USD',
      kind: 'money',
      scale: 'integer',
      threePoint: true,
      order: 4,
      currency: 'USD',
    },
    {
      ...base,
      key: 'gpu_minutes',
      name: ' GPU minutes ',
      unit: 'minutes',
      kind: 'duration',
      scale: 'integer',
      threePoint: false,
      order: 6,
      currency: null,
    },
  ];
  const card = { currency: 'USD', rateCardDigest: 'sha256:a' };
  body.measureFacts = [
    { workItemId: 'row-1', stepId: 'step-1', measure: 'cost', value: 5, basis: card },
    { workItemId: 'row-1', stepId: 'step-1', measure: 'gpu_minutes', value: 9, basis: null },
  ];
  body.measureEstimates = [
    {
      workItemId: 'row-1',
      stepId: 'step-1',
      measure: 'tokens',
      optimistic: 1,
      realistic: 2,
      pessimistic: 3,
      basis: null,
    },
    {
      workItemId: 'row-1',
      stepId: 'step-2',
      measure: 'cost',
      optimistic: 4,
      realistic: 5,
      pessimistic: 6,
      basis: card,
    },
  ];
  body.budgets = [
    { workItemId: 'row-1', measure: 'tokens', cap: 100, policy: 'strict', holdPerAttempt: 10 },
  ];
  return body;
}

test('prepares a version-11 file’s measures, its definitions’ names and units cleaned', () => {
  const body = withMeasures();
  const prepared = prepareImport(body, supportsAll);
  if (!prepared.ok) throw new Error(`refused at ${prepared.path}`);
  expect({
    factor: prepared.value.settings.budgetFactor,
    names: prepared.value.measureDefinitions.map(({ name }) => name),
    facts: prepared.value.measureFacts,
    estimates: prepared.value.measureEstimates,
    budgets: prepared.value.budgets,
  }).toEqual({
    factor: 1.5,
    names: ['Tokens', 'Cost', 'GPU minutes'],
    facts: body.measureFacts,
    estimates: body.measureEstimates,
    budgets: body.budgets,
  });
});

const MEASURE_FAULTS = [
  [
    'a malformed key',
    (body: PlanFixture) => {
      at(body.measureDefinitions, 2).key = 'GPU';
    },
    { code: 'invalid_body', path: 'measureDefinitions[2].key', detail: 'GPU' },
  ],
  [
    'a legacy metric name as a key',
    (body: PlanFixture) => {
      at(body.measureDefinitions, 2).key = 'token_actual';
    },
    { code: 'invalid_body', path: 'measureDefinitions[2].key', detail: 'token_actual' },
  ],
  [
    'a key stated twice',
    (body: PlanFixture) => {
      at(body.measureDefinitions, 2).key = 'cost';
    },
    { code: 'invalid_body', path: 'measureDefinitions[2].key', detail: 'cost' },
  ],
  [
    'a blank name',
    (body: PlanFixture) => {
      at(body.measureDefinitions, 2).name = '  ';
    },
    { code: 'invalid_body', path: 'measureDefinitions[2].name', detail: null },
  ],
  [
    'a blank unit',
    (body: PlanFixture) => {
      at(body.measureDefinitions, 2).unit = ' ';
    },
    { code: 'invalid_body', path: 'measureDefinitions[2].unit', detail: null },
  ],
  [
    'a fractional order',
    (body: PlanFixture) => {
      at(body.measureDefinitions, 2).order = 6.5;
    },
    { code: 'invalid_body', path: 'measureDefinitions[2].order', detail: null },
  ],
  [
    'money without a currency',
    (body: PlanFixture) => {
      at(body.measureDefinitions, 1).currency = null;
    },
    { code: 'invalid_body', path: 'measureDefinitions[1].currency', detail: null },
  ],
  [
    'a currency off money',
    (body: PlanFixture) => {
      at(body.measureDefinitions, 2).currency = 'USD';
    },
    { code: 'invalid_body', path: 'measureDefinitions[2].currency', detail: null },
  ],
  [
    'a second scheduling measure',
    (body: PlanFixture) => {
      at(body.measureDefinitions, 2).schedulesWork = true;
    },
    { code: 'invalid_body', path: 'measureDefinitions[2].schedulesWork', detail: null },
  ],
  [
    'a derived measure other than agent minutes',
    (body: PlanFixture) => {
      at(body.measureDefinitions, 2).derived = true;
    },
    { code: 'invalid_body', path: 'measureDefinitions[2].derived', detail: null },
  ],
  [
    'a fact in a measure the file does not define',
    (body: PlanFixture) => {
      at(body.measureFacts, 1).measure = 'story_points';
    },
    { code: 'unknown_ref', path: 'measureFacts[1].measure', detail: 'story_points' },
  ],
  [
    'a fact on a row the file does not hold',
    (body: PlanFixture) => {
      at(body.measureFacts).workItemId = 'row-missing';
    },
    { code: 'unknown_ref', path: 'measureFacts[0].workItemId', detail: 'row-missing' },
  ],
  [
    'a fact on a parent',
    (body: PlanFixture) => {
      body.workItems.push({
        ...structuredClone(at(body.workItems)),
        id: 'row-child',
        parentId: 'row-1',
        externalRefs: [],
        estimates: {},
        actuals: {},
        progress: {},
        measures: {},
        assignees: {},
      });
    },
    { code: 'invalid_body', path: 'measureFacts[0].workItemId', detail: 'row-1' },
  ],
  [
    'a fact at a step the file does not hold',
    (body: PlanFixture) => {
      at(body.measureFacts).stepId = 'step-missing';
    },
    { code: 'unknown_ref', path: 'measureFacts[0].stepId', detail: 'step-missing' },
  ],
  [
    'a tokens fact outside the legacy row measures',
    (body: PlanFixture) => {
      at(body.measureFacts, 1).measure = 'tokens';
    },
    { code: 'invalid_body', path: 'measureFacts[1].measure', detail: 'tokens' },
  ],
  [
    'a negative fact',
    (body: PlanFixture) => {
      at(body.measureFacts, 1).value = -1;
    },
    { code: 'invalid_body', path: 'measureFacts[1].value', detail: null },
  ],
  [
    'a fractional fact in an integer measure',
    (body: PlanFixture) => {
      at(body.measureFacts, 1).value = 1.5;
    },
    { code: 'invalid_body', path: 'measureFacts[1].value', detail: null },
  ],
  [
    'a basis off money',
    (body: PlanFixture) => {
      at(body.measureFacts, 1).basis = { currency: 'USD', rateCardDigest: 'sha256:a' };
    },
    { code: 'invalid_body', path: 'measureFacts[1].basis', detail: null },
  ],
  [
    'a basis in no currency',
    (body: PlanFixture) => {
      at(body.measureFacts).basis = { currency: 'usd', rateCardDigest: 'sha256:a' };
    },
    { code: 'invalid_body', path: 'measureFacts[0].basis.currency', detail: null },
  ],
  [
    'a fact basis in another currency than its definition',
    (body: PlanFixture) => {
      at(body.measureFacts).basis = { currency: 'EUR', rateCardDigest: 'sha256:a' };
    },
    { code: 'invalid_body', path: 'measureFacts[0].basis.currency', detail: null },
  ],
  [
    'a trio basis in another currency than its definition',
    (body: PlanFixture) => {
      at(body.measureEstimates, 1).basis = { currency: 'EUR', rateCardDigest: 'sha256:a' };
    },
    { code: 'invalid_body', path: 'measureEstimates[1].basis.currency', detail: null },
  ],
  [
    'an empty rate card digest',
    (body: PlanFixture) => {
      at(body.measureFacts).basis = { currency: 'USD', rateCardDigest: '' };
    },
    { code: 'invalid_body', path: 'measureFacts[0].basis.rateCardDigest', detail: null },
  ],
  [
    'an unpriced money fact',
    (body: PlanFixture) => {
      at(body.measureFacts).basis = null;
    },
    { code: 'invalid_body', path: 'measureFacts[0].basis', detail: 'rate_card_required' },
  ],
  [
    'an unpriced money trio',
    (body: PlanFixture) => {
      at(body.measureEstimates, 1).basis = null;
    },
    { code: 'invalid_body', path: 'measureEstimates[1].basis', detail: 'rate_card_required' },
  ],
  [
    'one fact stated twice',
    (body: PlanFixture) => {
      at(body.measureFacts, 1).measure = 'cost';
      at(body.measureFacts, 1).basis = at(body.measureFacts).basis;
    },
    { code: 'invalid_body', path: 'measureFacts[1]', detail: null },
  ],
  [
    'a trio at a step the file does not hold',
    (body: PlanFixture) => {
      at(body.measureEstimates, 1).stepId = 'step-missing';
    },
    { code: 'unknown_ref', path: 'measureEstimates[1].stepId', detail: 'step-missing' },
  ],
  [
    'a trio where three points are forbidden',
    (body: PlanFixture) => {
      at(body.measureEstimates).measure = 'gpu_minutes';
    },
    { code: 'invalid_body', path: 'measureEstimates[0].measure', detail: 'gpu_minutes' },
  ],
  [
    'an unordered trio',
    (body: PlanFixture) => {
      at(body.measureEstimates).optimistic = 3;
    },
    { code: 'invalid_body', path: 'measureEstimates[0]', detail: null },
  ],
  [
    'a fractional point in an integer measure',
    (body: PlanFixture) => {
      at(body.measureEstimates).realistic = 2.5;
    },
    { code: 'invalid_body', path: 'measureEstimates[0]', detail: null },
  ],
  [
    'a three-point tokens trio beside the legacy token estimate',
    (body: PlanFixture) => {
      at(body.workItems).measures = { token_estimate: { 'step-1': 2 } };
    },
    { code: 'invalid_body', path: 'measureEstimates[0].measure', detail: 'tokens' },
  ],
  [
    'one trio stated twice',
    (body: PlanFixture) => {
      at(body.measureEstimates, 1).measure = 'tokens';
      at(body.measureEstimates, 1).stepId = 'step-1';
      at(body.measureEstimates, 1).basis = null;
    },
    { code: 'invalid_body', path: 'measureEstimates[1]', detail: null },
  ],
  [
    'a budget in a measure the file does not define',
    (body: PlanFixture) => {
      at(body.budgets).measure = 'story_points';
    },
    { code: 'unknown_ref', path: 'budgets[0].measure', detail: 'story_points' },
  ],
  [
    'a budget on a row the file does not hold',
    (body: PlanFixture) => {
      at(body.budgets).workItemId = 'row-missing';
    },
    { code: 'unknown_ref', path: 'budgets[0].workItemId', detail: 'row-missing' },
  ],
  [
    'a budget in the scheduling measure',
    (body: PlanFixture) => {
      body.measureDefinitions.push({
        key: 'time',
        name: 'Time',
        unit: 'days',
        kind: 'duration',
        scale: 'real',
        threePoint: true,
        showByDefault: true,
        schedulesWork: true,
        derived: false,
        order: 1,
        currency: null,
      });
      at(body.budgets).measure = 'time';
    },
    { code: 'invalid_body', path: 'budgets[0].measure', detail: 'time' },
  ],
  [
    'a fractional hold in an integer measure',
    (body: PlanFixture) => {
      at(body.budgets).holdPerAttempt = 0.5;
    },
    { code: 'invalid_body', path: 'budgets[0]', detail: null },
  ],
  [
    'one budget stated twice',
    (body: PlanFixture) => {
      body.budgets.push({ ...at(body.budgets) });
    },
    { code: 'invalid_body', path: 'budgets[1]', detail: null },
  ],
] as const satisfies readonly (readonly [string, Fault, object])[];

for (const [name, fault, expected] of MEASURE_FAULTS) {
  // Proof: with each refusal in `prepareMeasures` bypassed alone, at least one
  // case here answered ok or another path; watched 2026-10-23 (verify.md, slice 7).
  test(`refuses a version-11 file whose measures do not hold together: ${name}`, () => {
    const body = withMeasures();
    fault(body);
    expect(prepareImport(body, supportsAll)).toEqual({ ok: false, ...expected });
  });
}
