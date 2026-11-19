import { describe, expect, it } from 'bun:test';

import type { ProjectChain, ScopeChain } from '../access-role';
import { resolveSteps, type StepBinding } from './resolve-steps';

const chain: ProjectChain = {
  level: 'project',
  organizationId: 'org',
  spaceId: 'space',
  projectId: 'project',
};
function bindStep(
  bindingId: string,
  stepId: string,
  code: string,
  scopeKind: StepBinding['scopeKind'],
  scopeId: string,
  position: number,
  workItemTypeId: string | null = null,
): StepBinding {
  return {
    bindingId,
    organizationId: 'org',
    scopeKind,
    scopeId,
    position,
    workItemTypeId,
    step: { id: stepId, code, name: code.toUpperCase() },
  };
}
const published = [
  bindStep('org-dev', 'dev-id', 'dev', 'organization', 'org', 10),
  bindStep('org-qa', 'qa-id', 'qa', 'organization', 'org', 20),
  bindStep('org-research', 'research-id', 'research', 'organization', 'org', 30, 'spike'),
  bindStep('project-review', 'review-id', 'review', 'project', 'project', 1, 'story'),
];

for (const [typeState, codes] of [
  [{ kind: 'typed', typeId: 'story' }, ['dev', 'qa', 'review']],
  [{ kind: 'typed', typeId: 'spike' }, ['dev', 'qa', 'research']],
  [{ kind: 'untyped' }, ['dev', 'qa']],
  [{ kind: 'conflict', typeIds: ['story', 'spike'] }, []],
] as const)
  it(
    'resolves the published ' +
      typeState.kind +
      ('typeId' in typeState ? ' ' + typeState.typeId : '') +
      ' leaf without inheriting a type',
    () => {
      expect(resolveSteps(chain, typeState, published).map((step) => step.code)).toEqual([
        ...codes,
      ]);
    },
  );

it('keeps every matching binding in provenance while choosing the highest ordering scope', () => {
  const bindings = [
    bindStep('project-qa', 'qa-id', 'qa', 'project', 'project', 1, 'story'),
    bindStep('org-qa', 'qa-id', 'qa', 'organization', 'org', 2),
    bindStep('space-dev', 'dev-id', 'dev', 'space', 'space', 0),
  ];
  expect(resolveSteps(chain, { kind: 'typed', typeId: 'story' }, bindings)).toEqual([
    {
      stepId: 'qa-id',
      code: 'qa',
      name: 'QA',
      via: [
        { bindingId: 'org-qa', scopeKind: 'organization', scopeId: 'org', workItemTypeId: null },
        {
          bindingId: 'project-qa',
          scopeKind: 'project',
          scopeId: 'project',
          workItemTypeId: 'story',
        },
      ],
    },
    {
      stepId: 'dev-id',
      code: 'dev',
      name: 'DEV',
      via: [{ bindingId: 'space-dev', scopeKind: 'space', scopeId: 'space', workItemTypeId: null }],
    },
  ]);
  expect(
    resolveSteps(chain, { kind: 'typed', typeId: 'story' }, bindings.slice(1)).map(
      (step) => step.code,
    ),
  ).toEqual(['qa', 'dev']);
});

it('filters sibling scopes and foreign organizations before deriving the union', () => {
  const bindings = [
    ...published,
    bindStep('wrong-project', 'other-id', 'other', 'project', 'sibling', 0),
    bindStep('wrong-space', 'space-id', 'space', 'space', 'sibling', 0),
    {
      ...bindStep('foreign', 'foreign-id', 'foreign', 'organization', 'org', 0),
      organizationId: 'foreign',
    },
  ];
  expect(resolveSteps(chain, { kind: 'untyped' }, bindings).map((step) => step.code)).toEqual([
    'dev',
    'qa',
  ]);
  const noSpace: ProjectChain = { ...chain, spaceId: null };
  expect(
    resolveSteps(noSpace, { kind: 'untyped' }, [
      bindStep('space', 'space-step', 'space', 'space', 'space', 0),
      ...published,
    ]).map((step) => step.code),
  ).toEqual(['dev', 'qa']);
});

it('uses only the ancestors actually present up to the requested scope', () => {
  const bindings = [...published, bindStep('space', 'space-id', 'space', 'space', 'space', 1)];
  const organization: ScopeChain = { level: 'organization', organizationId: 'org' },
    space: ScopeChain = { level: 'space', organizationId: 'org', spaceId: 'space' };
  expect(
    resolveSteps(organization, { kind: 'typed', typeId: 'story' }, bindings).map(
      (step) => step.code,
    ),
  ).toEqual(['dev', 'qa']);
  expect(
    resolveSteps(space, { kind: 'typed', typeId: 'story' }, bindings).map((step) => step.code),
  ).toEqual(['dev', 'qa', 'space']);
  expect(
    resolveSteps(
      { ...chain, level: 'work_package', workPackageId: 'package' },
      { kind: 'typed', typeId: 'story' },
      bindings,
    ).map((step) => step.code),
  ).toEqual(['dev', 'qa', 'space', 'review']);
});

it('orders steps by the ordering binding rank and position before code and identity', () => {
  const bindings = [
    bindStep('late', 'later', 'aaa', 'project', 'project', 0),
    bindStep('qa', 'qa', 'qa', 'organization', 'org', 10),
    bindStep('dev', 'dev', 'dev', 'organization', 'org', 10),
    bindStep('first', 'first', 'zzz', 'organization', 'org', 1),
    bindStep('space', 'space', 'aaa', 'space', 'space', 0),
  ];
  expect(resolveSteps(chain, { kind: 'untyped' }, bindings).map((step) => step.stepId)).toEqual([
    'first',
    'dev',
    'qa',
    'space',
    'later',
  ]);
});

it('orders provenance ties by binary UTF8 binding identity under every permutation', () => {
  const bindings = [
    bindStep('\u{10000}', 'dev', 'dev', 'organization', 'org', 0),
    bindStep('\ue000', 'dev', 'dev', 'organization', 'org', 0, 'story'),
  ];
  for (const permutation of [bindings, [...bindings].reverse()])
    expect(
      resolveSteps(chain, { kind: 'typed', typeId: 'story' }, permutation)
        .at(0)
        ?.via.map((via) => via.bindingId),
    ).toEqual(['\ue000', '\u{10000}']);
});

it('does not mutate captured inputs or retain their arrays and metadata objects', () => {
  const bindings = structuredClone(published),
    before = structuredClone(bindings),
    resolved = resolveSteps(chain, { kind: 'typed', typeId: 'story' }, bindings);
  expect(bindings).toEqual(before);
  const first = resolved.at(0),
    binding = bindings.at(0),
    via = first?.via.at(0);
  if (first === undefined || binding === undefined || via === undefined)
    throw new Error('fixture resolved no first step');
  Object.assign(binding.step, { name: 'Input changed' });
  Object.assign(binding, { bindingId: 'input-changed' });
  expect(first).toEqual({
    stepId: 'dev-id',
    code: 'dev',
    name: 'DEV',
    via: [
      { bindingId: 'org-dev', scopeKind: 'organization', scopeId: 'org', workItemTypeId: null },
    ],
  });
  Object.assign(first, { name: 'Output changed' });
  Object.assign(via, { scopeId: 'output-changed' });
  expect(bindings.at(0)?.step.name).toBe('Input changed');
  expect(bindings.at(0)?.scopeId).toBe('org');
  expect(resolveSteps(chain, { kind: 'untyped' }, published).map((step) => step.name)).toEqual([
    'DEV',
    'QA',
  ]);
});

describe('generated additive binding invariants', () => {
  it('preserves union, every-type reach, deduplication and permutation invariance for 200 chains', () => {
    let seed = 0x7654321;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    for (let round = 0; round < 200; round++) {
      const organizationId = 'org-' + String(round),
        projectId = 'project-' + String(round),
        spaceId = round % 2 === 0 ? 'space-' + String(round) : null;
      const generated: ProjectChain = { level: 'project', organizationId, projectId, spaceId };
      const bindings = [
        {
          ...bindStep('every-a', 'a', 'a', 'organization', organizationId, next() % 4),
          organizationId,
        },
        { ...bindStep('every-b', 'b', 'b', 'project', projectId, next() % 4), organizationId },
        {
          ...bindStep(
            'typed-story',
            'story-step',
            'story',
            'project',
            projectId,
            next() % 4,
            'story',
          ),
          organizationId,
        },
        {
          ...bindStep(
            'typed-spike',
            'spike-step',
            'spike',
            'organization',
            organizationId,
            next() % 4,
            'spike',
          ),
          organizationId,
        },
        {
          ...bindStep('duplicate-a', 'a', 'a', 'project', projectId, next() % 4, 'story'),
          organizationId,
        },
        { ...bindStep('sibling', 'sibling', 'sibling', 'project', 'other', 0), organizationId },
      ];
      const permutation = bindings
        .map((binding) => ({ binding, key: next() }))
        .sort((left, right) => left.key - right.key)
        .map((entry) => entry.binding);
      for (const [state, ids] of [
        [{ kind: 'untyped' }, ['a', 'b']],
        [{ kind: 'typed', typeId: 'story' }, ['a', 'b', 'story-step']],
        [{ kind: 'typed', typeId: 'spike' }, ['a', 'b', 'spike-step']],
        [{ kind: 'conflict', typeIds: ['story', 'spike'] }, []],
      ] as const) {
        const resolved = resolveSteps(generated, state, bindings);
        expect(resolved.map((step) => step.stepId).sort()).toEqual([...ids].sort());
        expect(new Set(resolved.map((step) => step.stepId)).size).toBe(ids.length);
        expect(resolveSteps(generated, state, permutation)).toEqual(resolved);
      }
    }
  });
});

it('rejects contradictory selected definition metadata instead of choosing by input order', () => {
  const first = bindStep('one', 'qa', 'qa', 'organization', 'org', 1),
    second = {
      ...bindStep('two', 'qa', 'qa', 'project', 'project', 2),
      step: { id: 'qa', code: 'qa', name: 'Different' },
    };
  for (const rows of [
    [first, second],
    [second, first],
  ])
    expect(() => resolveSteps(chain, { kind: 'untyped' }, rows)).toThrow(
      'inconsistent step definition qa',
    );
});
it('rejects a repeated selected binding identity before it can duplicate provenance', () => {
  const first = bindStep('one', 'qa', 'qa', 'organization', 'org', 1),
    second = bindStep('one', 'dev', 'dev', 'project', 'project', 2);
  expect(() => resolveSteps(chain, { kind: 'untyped' }, [first, second])).toThrow(
    'duplicate step binding one',
  );
});
it('rejects duplicate every-type and typed binding tuples', () => {
  for (const type of [null, 'story']) {
    const rows = [
      bindStep('one', 'qa', 'qa', 'project', 'project', 1, type),
      bindStep('two', 'qa', 'qa', 'project', 'project', 2, type),
    ];
    expect(() => resolveSteps(chain, { kind: 'typed', typeId: 'story' }, rows)).toThrow(
      'duplicate step binding scope',
    );
  }
});
it('validates selected catalogue coherence even when a type would not resolve that step', () => {
  const first = bindStep('one', 'qa', 'qa', 'organization', 'org', 1, 'spike'),
    second = {
      ...bindStep('two', 'qa', 'qa', 'project', 'project', 2, 'spike'),
      step: { id: 'qa', code: 'different', name: 'QA' },
    };
  expect(() => resolveSteps(chain, { kind: 'typed', typeId: 'story' }, [first, second])).toThrow(
    'inconsistent step definition qa',
  );
});

it('chooses the ordering binding only after applying the leaf type', () => {
  const bindings = [
    bindStep('wrong-type', 'dev', 'dev', 'organization', 'org', 0, 'spike'),
    bindStep('matching', 'dev', 'dev', 'project', 'project', 0, 'story'),
    bindStep('qa', 'qa', 'qa', 'organization', 'org', 10),
  ];
  expect(
    resolveSteps(chain, { kind: 'typed', typeId: 'story' }, bindings).map((step) => step.stepId),
  ).toEqual(['qa', 'dev']);
});
it('keeps null distinct from an actual star type in tuple uniqueness', () => {
  const bindings = [
    bindStep('one', 'dev', 'dev', 'project', 'project', 1),
    bindStep('two', 'dev', 'dev', 'project', 'project', 1, '*'),
  ];
  expect(
    resolveSteps(chain, { kind: 'typed', typeId: '*' }, bindings)
      .at(0)
      ?.via.map((via) => via.bindingId),
  ).toEqual(['one', 'two']);
});
it('keeps equal scope ID text distinct across all binding kinds', () => {
  const same: ProjectChain = {
    level: 'project',
    organizationId: 'same',
    spaceId: 'same',
    projectId: 'same',
  };
  const bindings = [...(['organization', 'space', 'project'] as const)].map((scopeKind) => ({
    ...bindStep(scopeKind, 'dev', 'dev', scopeKind, 'same', 1),
    organizationId: 'same',
  }));
  expect(
    resolveSteps(same, { kind: 'untyped' }, bindings)
      .at(0)
      ?.via.map((via) => via.scopeKind),
  ).toEqual(['organization', 'space', 'project']);
});
it('does not hide reached corrupt capture behind a conflict success', () => {
  const first = bindStep('one', 'qa', 'qa', 'organization', 'org', 1),
    second = {
      ...bindStep('two', 'qa', 'qa', 'project', 'project', 2),
      step: { id: 'qa', code: 'qa', name: 'Changed' },
    };
  expect(() =>
    resolveSteps(chain, { kind: 'conflict', typeIds: ['story', 'spike'] }, [first, second]),
  ).toThrow('inconsistent step definition qa');
});
it('excludes foreign and sibling contradictions before selected capture validation', () => {
  const first = bindStep('one', 'qa', 'qa', 'organization', 'org', 1),
    foreign = {
      ...first,
      organizationId: 'foreign',
      step: { id: 'qa', code: 'changed', name: 'Changed' },
    },
    sibling = {
      ...first,
      scopeKind: 'project' as const,
      scopeId: 'sibling',
      step: { id: 'qa', code: 'other', name: 'Other' },
    };
  expect(
    resolveSteps(chain, { kind: 'untyped' }, [foreign, sibling, first]).map((step) => step.code),
  ).toEqual(['qa']);
});
it('uses step identity only as the final synthetic equal-code comparator tie', () => {
  // Synthetic comparator input: SC1 forbids colliding codes in an admitted stored catalogue.
  const bindings = [
    bindStep('a-binding', 'z-step', 'same', 'organization', 'org', 1),
    bindStep('z-binding', 'a-step', 'same', 'organization', 'org', 1),
  ];
  expect(resolveSteps(chain, { kind: 'untyped' }, bindings).map((step) => step.stepId)).toEqual([
    'a-step',
    'z-step',
  ]);
});

it('orders strict binding identity prefixes in provenance independently of input order', () => {
  const bindings = [
    bindStep('ab', 'dev', 'dev', 'organization', 'org', 1),
    bindStep('a', 'dev', 'dev', 'organization', 'org', 1, 'story'),
  ];
  for (const rows of [bindings, [...bindings].reverse()])
    expect(
      resolveSteps(chain, { kind: 'typed', typeId: 'story' }, rows)
        .at(0)
        ?.via.map((via) => via.bindingId),
    ).toEqual(['a', 'ab']);
});
