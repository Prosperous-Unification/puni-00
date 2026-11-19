import type { StepBinding, StepTypeState } from '@wbs/domain';
import { expect, test } from 'bun:test';

import {
  projectStepNodesInUse,
  type StepUsageFact,
  type StepUsagePackage,
  type StepUsageWorkItem,
} from './step-usage';

function leaf(
  id: string,
  position: number,
  parentId: string | null = null,
  typeState: StepTypeState = { kind: 'untyped' },
): StepUsageWorkItem {
  return { id, name: id, position, parentId, typeState };
}

function workPackage(id: string, workItems: readonly StepUsageWorkItem[]): StepUsagePackage {
  return {
    chain: {
      level: 'work_package',
      organizationId: 'org',
      spaceId: null,
      projectId: 'project',
      workPackageId: id,
    },
    workItems,
  };
}

function binding(
  bindingId: string,
  stepId: string,
  position: number,
  workItemTypeId: string | null = null,
): StepBinding {
  return {
    bindingId,
    organizationId: 'org',
    scopeKind: 'organization',
    scopeId: 'org',
    workItemTypeId,
    position,
    step: { id: stepId, code: stepId, name: stepId },
  };
}

test('step usage merges all thirteen fact kinds in registry order without counting duplicate facts twice', () => {
  const endpoint = {
    scope: 'node',
    workPackageId: 'package',
    workItemId: 'leaf',
    stepId: 'dev',
  } as const;
  const facts: StepUsageFact[] = [
    { kind: 'external_dependency', endpoint },
    { kind: 'typed_dependency', endpoint },
    { kind: 'parallel', endpoint },
    { kind: 'blockage', endpoint },
    { kind: 'claim', endpoint },
    { kind: 'assignment', endpoint },
    { kind: 'attempt_issued', endpoint },
    { kind: 'attempt', endpoint },
    { kind: 'measure_estimate', endpoint },
    { kind: 'measure', endpoint },
    { kind: 'progress', endpoint },
    { kind: 'actual', endpoint },
    { kind: 'estimate', endpoint },
    { kind: 'estimate', endpoint },
  ];
  expect(
    projectStepNodesInUse(
      [workPackage('package', [leaf('leaf', 0)])],
      [binding('dev-binding', 'dev', 0)],
      [],
      facts,
    ),
  ).toEqual({
    count: 1,
    pairs: [
      {
        id: 'leaf',
        name: 'leaf',
        workPackageId: 'package',
        stepId: 'dev',
        facts: [
          'estimate',
          'actual',
          'progress',
          'measure',
          'measure_estimate',
          'attempt',
          'attempt_issued',
          'assignment',
          'claim',
          'blockage',
          'parallel',
          'typed_dependency',
          'external_dependency',
        ],
      },
    ],
  });
});

test('step usage projects descendant endpoints only onto leaves whose actual type resolves the step', () => {
  const placements = [
    leaf('parent', 0),
    leaf('spike', 0, 'parent', { kind: 'typed', typeId: 'spike-type' }),
    leaf('story', 1, 'parent', { kind: 'typed', typeId: 'story-type' }),
    leaf('conflict', 2, 'parent', { kind: 'conflict', typeIds: ['story-type', 'spike-type'] }),
  ];
  const endpoint = {
    scope: 'descendant-step',
    workPackageId: 'package',
    workItemId: 'parent',
    stepId: 'qa',
  } as const;
  expect(
    projectStepNodesInUse(
      [workPackage('package', placements)],
      [binding('qa-binding', 'qa', 0, 'story-type')],
      [],
      [
        { kind: 'typed_dependency', endpoint },
        { kind: 'external_dependency', endpoint },
      ],
    ),
  ).toEqual({
    count: 1,
    pairs: [
      {
        id: 'story',
        name: 'story',
        workPackageId: 'package',
        stepId: 'qa',
        facts: ['typed_dependency', 'external_dependency'],
      },
    ],
  });
});

test('step usage keeps whole dependencies and subtree claim reservations independent of step inventory', () => {
  const packages = [workPackage('package', [leaf('parent', 0), leaf('child', 0, 'parent')])];
  const whole = {
    scope: 'whole',
    workPackageId: 'package',
    workItemId: 'parent',
    stepId: null,
  } as const;
  const subtree = {
    scope: 'subtree-claim',
    workPackageId: 'package',
    workItemId: 'parent',
    stepId: null,
  } as const;
  expect(
    projectStepNodesInUse(
      packages,
      [binding('dev-binding', 'dev', 0)],
      [],
      [
        { kind: 'typed_dependency', endpoint: whole },
        { kind: 'external_dependency', endpoint: whole },
        { kind: 'claim', endpoint: subtree },
      ],
    ),
  ).toEqual({ count: 0, pairs: [] });
});

test('step usage protects explicit leaf claims while retaining a distinct subtree reservation', () => {
  const packages = [workPackage('package', [leaf('parent', 0), leaf('child', 0, 'parent')])];
  expect(
    projectStepNodesInUse(
      packages,
      [binding('dev-binding', 'dev', 0)],
      [],
      [
        {
          kind: 'claim',
          endpoint: {
            scope: 'subtree-claim',
            workPackageId: 'package',
            workItemId: 'parent',
            stepId: null,
          },
        },
        {
          kind: 'claim',
          endpoint: { scope: 'node', workPackageId: 'package', workItemId: 'child', stepId: 'dev' },
        },
      ],
    ),
  ).toEqual({
    count: 1,
    pairs: [
      { id: 'child', name: 'child', workPackageId: 'package', stepId: 'dev', facts: ['claim'] },
    ],
  });
});

test('step usage allows removal of redundant provenance without losing protected applicability', () => {
  const organization = binding('organization-binding', 'dev', 0);
  const project: StepBinding = {
    ...binding('project-binding', 'dev', 10),
    scopeKind: 'project',
    scopeId: 'project',
  };
  expect(
    projectStepNodesInUse(
      [workPackage('package', [leaf('leaf', 0)])],
      [organization, project],
      [organization],
      [
        {
          kind: 'estimate',
          endpoint: { scope: 'node', workPackageId: 'package', workItemId: 'leaf', stepId: 'dev' },
        },
      ],
    ),
  ).toEqual({ count: 0, pairs: [] });
});

test('step usage orders packages then depth-first tree position then resolved step order', () => {
  const packages = [
    workPackage('b-package', [leaf('b-leaf', 0)]),
    workPackage('a-package', [
      leaf('a-late', 9),
      leaf('z-child', 0, 'z-parent'),
      leaf('z-parent', 1),
    ]),
  ];
  const facts: StepUsageFact[] = [];
  for (const [workPackageId, workItemId] of [
    ['b-package', 'b-leaf'],
    ['a-package', 'a-late'],
    ['a-package', 'z-child'],
  ]) {
    for (const stepId of ['a-step', 'z-step'])
      facts.push({
        kind: 'actual',
        endpoint: { scope: 'node', workPackageId, workItemId, stepId },
      });
  }
  const projected = projectStepNodesInUse(
    packages,
    [binding('a-binding', 'a-step', 20), binding('z-binding', 'z-step', 10)],
    [],
    facts,
  );
  expect(projected.count).toBe(6);
  expect(
    projected.pairs.map(({ workPackageId, id, stepId }) => [workPackageId, id, stepId]),
  ).toEqual([
    ['a-package', 'z-child', 'z-step'],
    ['a-package', 'z-child', 'a-step'],
    ['a-package', 'a-late', 'z-step'],
    ['a-package', 'a-late', 'a-step'],
    ['b-package', 'b-leaf', 'z-step'],
    ['b-package', 'b-leaf', 'a-step'],
  ]);
});

test('step usage computes the full distinct count before limiting the rendered list to two hundred', () => {
  const leaves = Array.from({ length: 201 }, (_, index) =>
    leaf('leaf-' + String(201 - index).padStart(3, '0'), index),
  );
  const facts: StepUsageFact[] = [...leaves].reverse().flatMap(({ id }) => [
    {
      kind: 'estimate',
      endpoint: { scope: 'node', workPackageId: 'package', workItemId: id, stepId: 'dev' },
    },
    {
      kind: 'actual',
      endpoint: { scope: 'node', workPackageId: 'package', workItemId: id, stepId: 'dev' },
    },
  ]);
  const projected = projectStepNodesInUse(
    [workPackage('package', [...leaves].reverse())],
    [binding('dev-binding', 'dev', 0)],
    [],
    facts,
  );
  expect(projected.count).toBe(201);
  expect(projected.pairs).toHaveLength(200);
  expect(projected.pairs.at(0)).toEqual({
    id: 'leaf-201',
    name: 'leaf-201',
    workPackageId: 'package',
    stepId: 'dev',
    facts: ['estimate', 'actual'],
  });
  expect(projected.pairs.at(-1)).toEqual({
    id: 'leaf-002',
    name: 'leaf-002',
    workPackageId: 'package',
    stepId: 'dev',
    facts: ['estimate', 'actual'],
  });
});

test('step usage refuses a captured tree with an unreachable row', () => {
  expect(() =>
    projectStepNodesInUse(
      [workPackage('package', [leaf('orphan', 0, 'missing')])],
      [binding('dev-binding', 'dev', 0)],
      [],
      [],
    ),
  ).toThrow(/unreachable|parent|tree/i);
});

test('step usage refuses duplicate package identity', () => {
  expect(() =>
    projectStepNodesInUse([workPackage('package', []), workPackage('package', [])], [], [], []),
  ).toThrow('step usage duplicate package');
});

test('step usage refuses duplicate work item identity across packages', () => {
  expect(() =>
    projectStepNodesInUse(
      [workPackage('first', [leaf('duplicate', 0)]), workPackage('second', [leaf('duplicate', 0)])],
      [],
      [],
      [],
    ),
  ).toThrow('step usage duplicate work item');
});

test('step usage refuses a fact whose package was not captured', () => {
  expect(() =>
    projectStepNodesInUse(
      [],
      [],
      [],
      [
        {
          kind: 'estimate',
          endpoint: { scope: 'node', workPackageId: 'missing', workItemId: 'leaf', stepId: 'dev' },
        },
      ],
    ),
  ).toThrow('step usage missing endpoint package');
});

test('step usage refuses a fact whose work item was not captured', () => {
  expect(() =>
    projectStepNodesInUse(
      [workPackage('package', [])],
      [],
      [],
      [
        {
          kind: 'estimate',
          endpoint: {
            scope: 'node',
            workPackageId: 'package',
            workItemId: 'missing',
            stepId: 'dev',
          },
        },
      ],
    ),
  ).toThrow('step usage missing endpoint work item');
});

test('step usage refuses a concrete node endpoint on a parent', () => {
  expect(() =>
    projectStepNodesInUse(
      [workPackage('package', [leaf('parent', 0), leaf('child', 0, 'parent')])],
      [binding('dev-binding', 'dev', 0)],
      [],
      [
        {
          kind: 'typed_dependency',
          endpoint: {
            scope: 'node',
            workPackageId: 'package',
            workItemId: 'parent',
            stepId: 'dev',
          },
        },
      ],
    ),
  ).toThrow('step usage node names a parent');
});

test('step usage refuses a descendant endpoint on a leaf', () => {
  expect(() =>
    projectStepNodesInUse(
      [workPackage('package', [leaf('leaf', 0)])],
      [binding('dev-binding', 'dev', 0)],
      [],
      [
        {
          kind: 'external_dependency',
          endpoint: {
            scope: 'descendant-step',
            workPackageId: 'package',
            workItemId: 'leaf',
            stepId: 'dev',
          },
        },
      ],
    ),
  ).toThrow('step usage descendant step names a leaf');
});

test('step usage refuses a subtree reservation on a leaf', () => {
  expect(() =>
    projectStepNodesInUse(
      [workPackage('package', [leaf('leaf', 0)])],
      [binding('dev-binding', 'dev', 0)],
      [],
      [
        {
          kind: 'claim',
          endpoint: {
            scope: 'subtree-claim',
            workPackageId: 'package',
            workItemId: 'leaf',
            stepId: null,
          },
        },
      ],
    ),
  ).toThrow('step usage subtree claim names a leaf');
});

test('step usage refuses a concrete fact on an unresolved prechange step even without a mutation', () => {
  expect(() =>
    projectStepNodesInUse(
      [workPackage('package', [leaf('leaf', 0)])],
      [],
      [],
      [
        {
          kind: 'attempt_issued',
          endpoint: {
            scope: 'node',
            workPackageId: 'package',
            workItemId: 'leaf',
            stepId: 'missing',
          },
        },
      ],
    ),
  ).toThrow('step usage fact names an unresolved step');
});

test('step usage refuses a descendant endpoint without a prechange matching leaf', () => {
  expect(() =>
    projectStepNodesInUse(
      [
        workPackage('package', [
          leaf('parent', 0),
          leaf('child', 0, 'parent', { kind: 'typed', typeId: 'spike-type' }),
        ]),
      ],
      [binding('qa-binding', 'qa', 0, 'story-type')],
      [],
      [
        {
          kind: 'typed_dependency',
          endpoint: {
            scope: 'descendant-step',
            workPackageId: 'package',
            workItemId: 'parent',
            stepId: 'qa',
          },
        },
      ],
    ),
  ).toThrow('step usage descendant endpoint has no resolved match');
});

test('step usage leaves captured trees bindings and endpoints unchanged', () => {
  const packages = [workPackage('package', [leaf('second', 2), leaf('first', 1)])];
  const bindings = [binding('dev-binding', 'dev', 0)];
  const facts: StepUsageFact[] = [
    {
      kind: 'estimate',
      endpoint: { scope: 'node', workPackageId: 'package', workItemId: 'first', stepId: 'dev' },
    },
  ];
  const retained = structuredClone({ packages, bindings, facts });
  projectStepNodesInUse(packages, bindings, [], facts);
  expect({ packages, bindings, facts }).toEqual(retained);
});
