import type { StepBinding, StepTypeState } from '@wbs/domain';
import { expect, test } from 'bun:test';

import type { StepUsageSnapshot } from '../ports/step-usage';
import {
  projectMoveStepUsage,
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

function moveSnapshot(facts: readonly StepUsageFact[] = []): StepUsageSnapshot {
  return {
    packages: [
      workPackage('package', [leaf('destination', 0), leaf('moving', 1), leaf('sibling', 2)]),
    ],
    bindings: [binding('dev-binding', 'dev', 0)],
    facts,
  };
}

const destinationNode = {
  scope: 'node',
  workPackageId: 'package',
  workItemId: 'destination',
  stepId: 'dev',
} as const;

test.each([
  'estimate',
  'actual',
  'progress',
  'measure',
  'measure_estimate',
  'attempt',
  'assignment',
  'claim',
  'blockage',
  'parallel',
  'typed_dependency',
  'external_dependency',
] as const)(
  'move usage reports a destination leaf losing its %s node without transferring it to existing work',
  (kind) => {
    const snapshot = moveSnapshot([{ kind, endpoint: destinationNode }]);
    expect(projectMoveStepUsage(snapshot, 'moving', 'destination')).toEqual({
      count: 1,
      pairs: [
        {
          id: 'destination',
          name: 'destination',
          workPackageId: 'package',
          stepId: 'dev',
          facts: [kind],
        },
      ],
    });
  },
);

test('move usage preserves ordinary node counter protection unless the actual capture explicitly owns an allocator reservation', () => {
  expect(
    projectMoveStepUsage(
      moveSnapshot([{ kind: 'attempt_issued', endpoint: destinationNode }]),
      'moving',
      'destination',
    ),
  ).toEqual({
    count: 1,
    pairs: [
      {
        id: 'destination',
        name: 'destination',
        workPackageId: 'package',
        stepId: 'dev',
        facts: ['attempt_issued'],
      },
    ],
  });
});

test('move usage retains an explicit allocator on the destination own type when incoming work resolves a different type', () => {
  const snapshot: StepUsageSnapshot = {
    packages: [
      workPackage('package', [
        leaf('destination', 0, null, { kind: 'typed', typeId: 'spike' }),
        leaf('moving', 1, null, { kind: 'typed', typeId: 'story' }),
      ]),
    ],
    bindings: [
      binding('research-spike', 'research', 0, 'spike'),
      binding('build-story', 'build', 0, 'story'),
    ],
    facts: [
      {
        kind: 'attempt_issued',
        endpoint: { ...destinationNode, scope: 'allocator', stepId: 'research' },
      },
    ],
  };
  expect(projectMoveStepUsage(snapshot, 'moving', 'destination')).toEqual({ count: 0, pairs: [] });
});

test('move usage reports the destination direct type rather than substituting the incoming work type', () => {
  const snapshot: StepUsageSnapshot = {
    packages: [
      workPackage('package', [
        leaf('destination', 0, null, { kind: 'typed', typeId: 'spike' }),
        leaf('moving', 1, null, { kind: 'typed', typeId: 'story' }),
      ]),
    ],
    bindings: [
      binding('research-spike', 'research', 0, 'spike'),
      binding('build-story', 'build', 0, 'story'),
    ],
    facts: [{ kind: 'estimate', endpoint: { ...destinationNode, stepId: 'research' } }],
  };
  expect(projectMoveStepUsage(snapshot, 'moving', 'destination')).toEqual({
    count: 1,
    pairs: [
      {
        id: 'destination',
        name: 'destination',
        workPackageId: 'package',
        stepId: 'research',
        facts: ['estimate'],
      },
    ],
  });
});

test.each(['typed_dependency', 'external_dependency'] as const)(
  'move usage expands a %s descendant endpoint against prechange leaves',
  (kind) => {
    const snapshot: StepUsageSnapshot = {
      packages: [
        workPackage('package', [
          leaf('root', 0),
          leaf('destination', 0, 'root'),
          leaf('moving', 1),
        ]),
      ],
      bindings: [binding('dev-binding', 'dev', 0)],
      facts: [
        {
          kind,
          endpoint: {
            scope: 'descendant-step',
            workPackageId: 'package',
            workItemId: 'root',
            stepId: 'dev',
          },
        },
      ],
    };
    expect(projectMoveStepUsage(snapshot, 'moving', 'destination')).toEqual({
      count: 1,
      pairs: [
        {
          id: 'destination',
          name: 'destination',
          workPackageId: 'package',
          stepId: 'dev',
          facts: [kind],
        },
      ],
    });
  },
);

test('move usage admits an empty destination while validating and retaining incoming, sibling and other-package facts', () => {
  const snapshot = moveSnapshot([
    { kind: 'estimate', endpoint: { ...destinationNode, workItemId: 'moving' } },
    { kind: 'parallel', endpoint: { ...destinationNode, workItemId: 'sibling' } },
    {
      kind: 'actual',
      endpoint: { ...destinationNode, workPackageId: 'other', workItemId: 'other-leaf' },
    },
  ]);
  const captured = {
    ...snapshot,
    packages: [...snapshot.packages, workPackage('other', [leaf('other-leaf', 0)])],
  };
  expect(projectMoveStepUsage(captured, 'moving', 'destination')).toEqual({ count: 0, pairs: [] });
});

test.each([
  { name: 'same-parent reorder', parentId: 'root' },
  { name: 'move to root', parentId: null },
  { name: 'existing destination parent', parentId: 'other-parent' },
])('move usage retains existing nodes during $name', ({ parentId }) => {
  const snapshot: StepUsageSnapshot = {
    packages: [
      workPackage('package', [
        leaf('root', 0),
        leaf('moving', 0, 'root'),
        leaf('other-parent', 1),
        leaf('other-child', 0, 'other-parent'),
      ]),
    ],
    bindings: [binding('dev-binding', 'dev', 0)],
    facts: [{ kind: 'estimate', endpoint: { ...destinationNode, workItemId: 'moving' } }],
  };
  expect(projectMoveStepUsage(snapshot, 'moving', parentId)).toEqual({ count: 0, pairs: [] });
});

test('move usage merges fact kinds and duplicate points before the existing pair cap', () => {
  const endpoint = destinationNode;
  const snapshot = moveSnapshot([
    { kind: 'external_dependency', endpoint },
    { kind: 'parallel', endpoint },
    { kind: 'estimate', endpoint },
    { kind: 'estimate', endpoint },
    { kind: 'claim', endpoint },
    { kind: 'typed_dependency', endpoint },
  ]);
  expect(projectMoveStepUsage(snapshot, 'moving', 'destination')).toEqual({
    count: 1,
    pairs: [
      {
        id: 'destination',
        name: 'destination',
        workPackageId: 'package',
        stepId: 'dev',
        facts: ['estimate', 'claim', 'parallel', 'typed_dependency', 'external_dependency'],
      },
    ],
  });
});

test('move usage counts every lost pair and caps only the final binding-ordered response', () => {
  const ids = Array.from(
    { length: 201 },
    (_, ordinal) => 'step-' + String(ordinal).padStart(3, '0'),
  );
  const snapshot: StepUsageSnapshot = {
    ...moveSnapshot(),
    bindings: ids.map((id, ordinal) => binding('bind-' + id, id, ordinal)),
    facts: [...ids]
      .reverse()
      .map((stepId) => ({ kind: 'estimate', endpoint: { ...destinationNode, stepId } })),
  };
  const usage = projectMoveStepUsage(snapshot, 'moving', 'destination');
  expect(usage.count).toBe(201);
  expect(usage.pairs).toHaveLength(200);
  expect(usage.pairs.at(0)).toEqual({
    id: 'destination',
    name: 'destination',
    workPackageId: 'package',
    stepId: 'step-000',
    facts: ['estimate'],
  });
  expect(usage.pairs.at(-1)).toEqual({
    id: 'destination',
    name: 'destination',
    workPackageId: 'package',
    stepId: 'step-199',
    facts: ['estimate'],
  });
});

test('move usage leaves captured trees, direct types, bindings and fact addresses unchanged', () => {
  const snapshot = moveSnapshot([{ kind: 'estimate', endpoint: destinationNode }]);
  const captured = structuredClone(snapshot);
  projectMoveStepUsage(snapshot, 'moving', 'destination');
  expect(snapshot).toEqual(captured);
});

test.each([
  {
    name: 'missing moving row',
    moving: 'absent',
    parentId: 'destination',
    message: 'move work item is absent',
  },
  {
    name: 'missing destination',
    moving: 'moving',
    parentId: 'absent',
    message: 'move destination is absent from its work package',
  },
  {
    name: 'self-parent',
    moving: 'moving',
    parentId: 'moving',
    message: 'unreachable from any root',
  },
])(
  'move usage throws for $name before answering an empty refusal',
  ({ moving, parentId, message }) => {
    expect(() => projectMoveStepUsage(moveSnapshot(), moving, parentId)).toThrow(message);
  },
);

test('move usage throws for a destination in another captured work package', () => {
  const snapshot = moveSnapshot();
  const captured = {
    ...snapshot,
    packages: [...snapshot.packages, workPackage('other', [leaf('other-parent', 0)])],
  };
  expect(() => projectMoveStepUsage(captured, 'moving', 'other-parent')).toThrow(
    'move destination is absent from its work package',
  );
});

test('move usage validates the complete prechange snapshot even when unrelated facts do not vanish', () => {
  const snapshot = moveSnapshot([
    {
      kind: 'estimate',
      endpoint: { ...destinationNode, workItemId: 'sibling', stepId: 'missing' },
    },
  ]);
  expect(() => projectMoveStepUsage(snapshot, 'moving', 'destination')).toThrow(
    'step usage fact names an unresolved step',
  );
});

test('move usage refuses an already corrupt parent point before interpreting its candidate topology', () => {
  const snapshot: StepUsageSnapshot = {
    ...moveSnapshot([{ kind: 'estimate', endpoint: destinationNode }]),
    packages: [
      workPackage('package', [
        leaf('destination', 0),
        leaf('existing', 0, 'destination'),
        leaf('moving', 1),
      ]),
    ],
  };
  expect(() => projectMoveStepUsage(snapshot, 'moving', null)).toThrow(
    'step usage node names a parent',
  );
});

test('move usage rejects a cycle through an existing descendant', () => {
  const snapshot: StepUsageSnapshot = {
    ...moveSnapshot(),
    packages: [
      workPackage('package', [
        leaf('moving', 0),
        leaf('child', 0, 'moving'),
        leaf('destination', 1),
      ]),
    ],
  };
  expect(() => projectMoveStepUsage(snapshot, 'moving', 'child')).toThrow(
    'unreachable from any root',
  );
});

test('move usage keeps whole endpoints and a surviving parent subtree claim independent of destination step loss', () => {
  const snapshot: StepUsageSnapshot = {
    packages: [
      workPackage('package', [leaf('root', 0), leaf('destination', 0, 'root'), leaf('moving', 1)]),
    ],
    bindings: [binding('dev-binding', 'dev', 0)],
    facts: [
      {
        kind: 'typed_dependency',
        endpoint: {
          scope: 'whole',
          workPackageId: 'package',
          workItemId: 'destination',
          stepId: null,
        },
      },
      {
        kind: 'external_dependency',
        endpoint: {
          scope: 'whole',
          workPackageId: 'package',
          workItemId: 'destination',
          stepId: null,
        },
      },
      {
        kind: 'claim',
        endpoint: {
          scope: 'subtree-claim',
          workPackageId: 'package',
          workItemId: 'root',
          stepId: null,
        },
      },
    ],
  };
  expect(projectMoveStepUsage(snapshot, 'moving', 'destination')).toEqual({ count: 0, pairs: [] });
});
