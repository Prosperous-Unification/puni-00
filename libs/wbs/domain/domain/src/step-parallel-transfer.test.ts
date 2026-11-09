import { describe, expect, it } from 'bun:test';

import { transferStepParallels } from './step-parallel-transfer';

const fact = { workItemId: 'w', stepId: 's', maxParallel: 1 };
const createRequest = () => ({
  source: { workItems: [{ id: 'w' }], steps: [{ id: 's' }], stepParallels: [{ ...fact }] },
  target: { workItems: [{ id: 'W' }], steps: [{ id: 'S' }] },
  workItemIds: [['w', 'W']],
  stepIds: [['s', 'S']],
});

describe('internal sparse parallel transfer', () => {
  it('preserves explicit equality and absence with detached exact pairs', () => {
    const supplied = createRequest();
    supplied.source.steps.push({ id: 'sibling' });
    supplied.target.steps.push({ id: 'SIBLING' });
    supplied.stepIds.push(['sibling', 'SIBLING']);
    const before = structuredClone(supplied);
    const transferred = transferStepParallels(supplied);
    expect(transferred).toEqual([{ workItemId: 'W', stepId: 'S', maxParallel: 1 }]);
    expect(supplied).toEqual(before);
    supplied.source.stepParallels[0].maxParallel = 9;
    supplied.workItemIds[0][1] = 'changed';
    supplied.stepIds[0][1] = 'changed';
    supplied.target.workItems[0].id = 'changed';
    expect(transferred).toEqual([{ workItemId: 'W', stepId: 'S', maxParallel: 1 }]);
    transferred[0].maxParallel = 3;
    expect(supplied.source.stepParallels[0].maxParallel).toBe(9);
  });

  it('keeps empty policy empty with empty or unused maps', () => {
    const supplied = createRequest();
    supplied.source.stepParallels = [];
    expect(transferStepParallels(supplied)).toEqual([]);
    supplied.workItemIds = [];
    supplied.stepIds = [];
    expect(transferStepParallels(supplied)).toEqual([]);
  });

  it('orders owner then step by saved-plan UTF-16 comparison and preserves colon tuples', () => {
    const ids = ['\ue000', '\u{10000}', 'a:b', 'a', 'Z', 'b:c', 'c'];
    const facts = ids.flatMap((workItemId) =>
      [...ids].reverse().map((stepId) => ({ workItemId, stepId, maxParallel: 1000 })),
    );
    const references = { workItems: ids.map((id) => ({ id })), steps: ids.map((id) => ({ id })) };
    const ordered = transferStepParallels({
      source: { ...references, stepParallels: facts },
      target: references,
      workItemIds: ids.map((id) => [id, id]),
      stepIds: ids.map((id) => [id, id]),
    });
    const canonical = ['Z', 'a', 'a:b', 'b:c', 'c', '\u{10000}', '\ue000'];
    expect(ordered).toEqual(
      canonical.flatMap((workItemId) =>
        canonical.map((stepId) => ({ workItemId, stepId, maxParallel: 1000 })),
      ),
    );
  });

  it('allows unused parent mappings and exact empty string identities', () => {
    const supplied = createRequest();
    const owners = [{ id: 'parent' }, { id: 'child', parentId: 'parent' }, { id: '' }];
    expect(
      transferStepParallels({
        ...supplied,
        source: {
          workItems: owners,
          steps: [{ id: '' }],
          stepParallels: [{ workItemId: '', stepId: '', maxParallel: 1 }],
        },
        target: { workItems: owners, steps: [{ id: '' }] },
        workItemIds: [
          ['parent', 'parent'],
          ['', ''],
        ],
        stepIds: [['', '']],
      }),
    ).toEqual([{ workItemId: '', stepId: '', maxParallel: 1 }]);
  });

  it('captures changing fact fields once', () => {
    let reads = 0;
    const supplied = createRequest();
    supplied.source.stepParallels = [
      {
        ...fact,
        get maxParallel() {
          return ++reads === 1 ? 2 : 1001;
        },
      },
    ];
    expect(transferStepParallels(supplied)).toEqual([
      { workItemId: 'W', stepId: 'S', maxParallel: 2 },
    ]);
    expect(reads).toBe(1);
  });

  const refusals: readonly [string, (supplied: ReturnType<typeof createRequest>) => unknown][] = [
    ['request shape', () => null],
    ['missing source', (supplied) => ({ ...supplied, source: undefined })],
    ['missing target', (supplied) => ({ ...supplied, target: undefined })],
    [
      'source owner list',
      (supplied) => ({ ...supplied, source: { ...supplied.source, workItems: null } }),
    ],
    [
      'target step list',
      (supplied) => ({ ...supplied, target: { ...supplied.target, steps: null } }),
    ],
    [
      'owner object shape',
      (supplied) => ({ ...supplied, source: { ...supplied.source, workItems: [null] } }),
    ],
    [
      'step object shape',
      (supplied) => ({ ...supplied, target: { ...supplied.target, steps: [null] } }),
    ],
    [
      'owner ID shape',
      (supplied) => ({ ...supplied, source: { ...supplied.source, workItems: [{ id: 1 }] } }),
    ],
    [
      'step ID shape',
      (supplied) => ({ ...supplied, target: { ...supplied.target, steps: [{ id: null }] } }),
    ],
    [
      'parent ID shape',
      (supplied) => ({
        ...supplied,
        source: { ...supplied.source, workItems: [{ id: 'w', parentId: 3 }] },
      }),
    ],
    [
      'missing facts',
      (supplied) => ({ ...supplied, source: { ...supplied.source, stepParallels: undefined } }),
    ],
    [
      'fact ID shape',
      (supplied) => ({
        ...supplied,
        source: { ...supplied.source, stepParallels: [{ ...fact, stepId: 1 }] },
      }),
    ],
    [
      'fact shape',
      (supplied) => ({ ...supplied, source: { ...supplied.source, stepParallels: [null] } }),
    ],
    ...[0, 1001, 1.5, NaN, Infinity, '1'].map(
      (maxParallel): [string, (supplied: ReturnType<typeof createRequest>) => unknown] => [
        `maximum ${String(maxParallel)}`,
        (supplied) => ({
          ...supplied,
          source: { ...supplied.source, stepParallels: [{ ...fact, maxParallel }] },
        }),
      ],
    ),
    [
      'missing source owner',
      (supplied) => {
        supplied.source.workItems = [];
        return supplied;
      },
    ],
    [
      'missing source step',
      (supplied) => {
        supplied.source.steps = [];
        return supplied;
      },
    ],
    [
      'source parent owner',
      (supplied) => ({
        ...supplied,
        source: { ...supplied.source, workItems: [{ id: 'w' }, { id: 'child', parentId: 'w' }] },
      }),
    ],
    [
      'duplicate facts',
      (supplied) => {
        supplied.source.stepParallels.push({ ...fact });
        return supplied;
      },
    ],
    ['missing owner map', (supplied) => ({ ...supplied, workItemIds: undefined })],
    ['missing step map', (supplied) => ({ ...supplied, stepIds: undefined })],
    ['malformed map entry', (supplied) => ({ ...supplied, stepIds: [null] })],
    ['short map entry', (supplied) => ({ ...supplied, stepIds: [['s']] })],
    ['malformed map ID', (supplied) => ({ ...supplied, workItemIds: [['w', 1]] })],
    [
      'unused unknown source owner',
      (supplied) => {
        supplied.workItemIds.push(['absent', 'W']);
        return supplied;
      },
    ],
    [
      'unused unknown target owner',
      (supplied) => {
        supplied.workItemIds.push(['w', 'absent']);
        supplied.workItemIds.shift();
        supplied.source.stepParallels = [];
        return supplied;
      },
    ],
    [
      'unused unknown source step',
      (supplied) => {
        supplied.stepIds.push(['absent', 'S']);
        return supplied;
      },
    ],
    [
      'unused unknown target step',
      (supplied) => {
        supplied.stepIds = [['s', 'absent']];
        supplied.source.stepParallels = [];
        return supplied;
      },
    ],
    [
      'duplicate owner map',
      (supplied) => {
        supplied.workItemIds.push(['w', 'W']);
        return supplied;
      },
    ],
    [
      'duplicate step map',
      (supplied) => {
        supplied.stepIds.push(['s', 'S']);
        return supplied;
      },
    ],
    [
      'unmapped owner',
      (supplied) => {
        supplied.workItemIds = [];
        return supplied;
      },
    ],
    [
      'unmapped step',
      (supplied) => {
        supplied.stepIds = [];
        return supplied;
      },
    ],
    [
      'missing target owner',
      (supplied) => {
        supplied.target.workItems = [];
        return supplied;
      },
    ],
    [
      'missing target step',
      (supplied) => {
        supplied.target.steps = [];
        return supplied;
      },
    ],
    [
      'target parent owner',
      (supplied) => ({
        ...supplied,
        target: { ...supplied.target, workItems: [{ id: 'W' }, { id: 'CHILD', parentId: 'W' }] },
      }),
    ],
    [
      'output step collision',
      (supplied) => {
        supplied.source.steps.push({ id: 'other' });
        supplied.source.stepParallels.push({ ...fact, stepId: 'other', maxParallel: 2 });
        supplied.stepIds.push(['other', 'S']);
        return supplied;
      },
    ],
    [
      'output pair collision',
      (supplied) => {
        supplied.source.workItems.push({ id: 'other' });
        supplied.source.stepParallels.push({ ...fact, workItemId: 'other', maxParallel: 2 });
        supplied.workItemIds.push(['other', 'W']);
        return supplied;
      },
    ],
  ];
  for (const [name, corrupt] of refusals) {
    it(`refuses ${name} atomically`, () => {
      const supplied = corrupt(createRequest());
      const before = structuredClone(supplied);
      const messages: Record<string, string> = {
        'owner ID shape': 'owner ID is malformed',
        'step ID shape': 'step ID is malformed',
        'short map entry': 'ID map entry is malformed',
        'malformed map ID': 'mapped ID is malformed',
        'unmapped owner': 'owner mapping is missing',
        'unmapped step': 'step mapping is missing',
      };
      expect(() => transferStepParallels(supplied)).toThrow(messages[name] ?? 'step parallelism');
      expect(supplied).toEqual(before);
    });
  }
});
