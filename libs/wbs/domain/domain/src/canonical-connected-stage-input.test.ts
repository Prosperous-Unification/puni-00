import { expect, test } from 'bun:test';

import { canonicalConnectedStageInput } from './canonical-connected-stage-input';
import type { ConnectedOptimizationStage } from './connected-optimization-input';
import { sliceKey } from './schedule';

function stage(): ConnectedOptimizationStage {
  return {
    kind: 'connected-stage',
    projectId: 'A',
    mode: 'shared',
    originOrdinal: 20000,
    projects: [
      { projectId: 'A', rank: 0, anchorOrdinal: 20000 },
      { projectId: 'B', rank: 1, anchorOrdinal: 20001 },
    ],
    input: {
      rows: [
        { id: 'a', parentId: null, position: 1, priority: 2, frozenNumber: null },
        { id: 'b', parentId: null, position: 2, priority: 3, frozenNumber: null },
      ],
      slices: [
        {
          workItemId: 'a',
          stepId: 'design',
          days: 0.2,
          width: 1,
          personId: 'person',
          poolIds: ['team-z', 'team-a'],
          demands: [{ resourceId: 'resource', units: 1 }],
        },
        { workItemId: 'a', stepId: 'build', days: 1, width: 1, personId: null, poolIds: [] },
        { workItemId: 'b', stepId: null, days: 1, width: 1, personId: 'person', poolIds: [] },
      ],
      graph: {
        nodes: [
          { kind: 'step', ref: { workItemId: 'a', stepId: 'design' }, at: 0 },
          { kind: 'step', ref: { workItemId: 'a', stepId: 'build' }, at: 1 },
          { kind: 'boundary', workItemId: 'b', at: 0 },
        ],
        edges: [
          {
            predecessor: { leafId: 'a', at: 0 },
            successor: { leafId: 'a', at: 1 },
            provenance: 'workflow',
            type: 'FS',
          },
          {
            predecessor: { leafId: 'a', at: 1 },
            successor: { leafId: 'b', at: 0 },
            provenance: 'authored',
            relationshipId: 'relationship',
            type: 'FS',
          },
        ],
      },
      notBefore: new Map([['a', 0.1]]),
      deadlines: new Map([['b', 7]]),
      poolSizes: new Map([
        ['team-a', 2],
        ['team-z', 3],
      ]),
      resourceCapacities: new Map([['resource', 2]]),
      elsewhere: new Map([
        ['person', [{ start: 4, end: 5, projectId: 'outside', workItemId: 'outside-work' }]],
      ]),
      order: {
        kind: 'connected',
        projectIdByWorkItem: new Map([
          ['a', 'A'],
          ['b', 'B'],
        ]),
        rankByProject: new Map([
          ['A', 0],
          ['B', 1],
        ]),
      },
    },
    relationships: [
      {
        id: 'relationship',
        type: 'FS',
        predecessor: { scope: 'whole', projectId: 'A', workItemId: 'a' },
        successor: { scope: 'whole', projectId: 'B', workItemId: 'b' },
      },
    ],
    starts: new Map([
      [sliceKey('a', 'design'), 0.1],
      [sliceKey('a', 'build'), 0.3],
      [sliceKey('b', null), 1.3],
    ]),
    finishes: new Map([
      [sliceKey('a', 'design'), 0.3],
      [sliceKey('a', 'build'), 1.3],
      [sliceKey('b', null), 2.3],
    ]),
  };
}

test('retains exact local and foreign placements without rounding', () => {
  const before = stage();
  const after = stage();
  (after.starts as Map<string, number>).set(sliceKey('b', null), 1.3000000000000003);
  expect(canonicalConnectedStageInput(before)).not.toBe(canonicalConnectedStageInput(after));
});

type Mutable<T> =
  T extends ReadonlyMap<infer K, infer V>
    ? Map<K, Mutable<V>>
    : T extends readonly (infer V)[]
      ? Mutable<V>[]
      : T extends object
        ? { -readonly [K in keyof T]: Mutable<T[K]> }
        : T;
const mutableStage = () => structuredClone(stage()) as Mutable<ConnectedOptimizationStage>;
const connectedOrder = (s: Mutable<ConnectedOptimizationStage>) => {
  if (s.input.order.kind !== 'connected') throw new Error('fixture requires connected order');
  return s.input.order;
};
const authoredEdge = (s: Mutable<ConnectedOptimizationStage>) => {
  const edge = s.input.graph.edges[1];
  if (edge.provenance !== 'authored') throw new Error('fixture requires authored edge');
  return edge;
};

const edits: readonly [string, (s: Mutable<ConnectedOptimizationStage>) => void][] = [
  [
    'stage owner',
    (s) => {
      s.projectId = 'B';
    },
  ],
  [
    'mode',
    (s) => {
      s.mode = 'isolated';
    },
  ],
  [
    'origin',
    (s) => {
      s.originOrdinal++;
    },
  ],
  [
    'rank',
    (s) => {
      s.projects[0].rank = 2;
      connectedOrder(s).rankByProject.set('A', 2);
    },
  ],
  [
    'anchor',
    (s) => {
      s.projects[1].anchorOrdinal = 20002;
    },
  ],
  [
    'row position',
    (s) => {
      s.input.rows[0].position++;
    },
  ],
  [
    'row priority',
    (s) => {
      s.input.rows[0].priority = 9;
    },
  ],
  [
    'row parent',
    (s) => {
      s.input.rows.push({
        id: 'parent',
        parentId: null,
        position: 3,
        priority: null,
        frozenNumber: null,
      });
      s.input.rows[0].parentId = 'parent';
      connectedOrder(s).projectIdByWorkItem.set('parent', 'A');
    },
  ],
  [
    'effort',
    (s) => {
      s.input.slices[0].days = 0.25;
    },
  ],
  [
    'null effort',
    (s) => {
      s.input.slices[0].days = null;
    },
  ],
  [
    'width',
    (s) => {
      s.input.slices[0].width = 2;
    },
  ],
  [
    'person',
    (s) => {
      s.input.slices[0].personId = 'other-person';
    },
  ],
  [
    'team',
    (s) => {
      s.input.slices[0].poolIds = ['team-a'];
    },
  ],
  [
    'resource units',
    (s) => {
      s.input.slices[0].demands![0].units = 2;
    },
  ],
  [
    'resource identity',
    (s) => {
      s.input.slices[0].demands![0].resourceId = 'other';
      s.input.resourceCapacities.set('other', 2);
    },
  ],
  [
    'pool capacity',
    (s) => {
      s.input.poolSizes.set('team-a', 4);
    },
  ],
  [
    'resource capacity',
    (s) => {
      s.input.resourceCapacities.set('resource', 4);
    },
  ],
  [
    'floor',
    (s) => {
      s.input.notBefore.set('a', 0.2);
    },
  ],
  [
    'deadline',
    (s) => {
      s.input.deadlines.set('b', 8);
    },
  ],
  [
    'elsewhere start',
    (s) => {
      s.input.elsewhere.get('person')![0].start = 4.1;
    },
  ],
  [
    'elsewhere finish',
    (s) => {
      s.input.elsewhere.get('person')![0].end = 5.1;
    },
  ],
  [
    'elsewhere holder project',
    (s) => {
      s.input.elsewhere.get('person')![0].projectId = 'other';
    },
  ],
  [
    'elsewhere holder work',
    (s) => {
      s.input.elsewhere.get('person')![0].workItemId = 'other';
    },
  ],
  [
    'elsewhere person',
    (s) => {
      s.input.elsewhere.set('other', s.input.elsewhere.get('person')!);
      s.input.elsewhere.delete('person');
    },
  ],
  [
    'graph provenance',
    (s) => {
      s.input.graph.edges[0].provenance = 'legacy';
    },
  ],
  [
    'relationship type',
    (s) => {
      authoredEdge(s).type = 'SS';
      s.relationships[0].type = 'SS';
    },
  ],
  [
    'relationship identity',
    (s) => {
      authoredEdge(s).relationshipId = 'other';
      s.relationships[0].id = 'other';
    },
  ],
  [
    'graph predecessor position',
    (s) => {
      authoredEdge(s).predecessor.at = 0;
    },
  ],
  [
    'original selector identity',
    (s) => {
      s.relationships[0].predecessor.workItemId = 'original-parent';
    },
  ],
  [
    'original selector scope',
    (s) => {
      s.relationships[0].predecessor = {
        scope: 'node',
        projectId: 'A',
        workItemId: 'a',
        stepId: 'build',
      };
    },
  ],
  [
    'original selector step',
    (s) => {
      s.relationships[0].predecessor = {
        scope: 'descendant-step',
        projectId: 'A',
        workItemId: 'original-parent',
        stepId: 'build',
      };
    },
  ],
  [
    'local start',
    (s) => {
      s.starts.set(sliceKey('a', 'build'), 0.31);
    },
  ],
  [
    'local finish',
    (s) => {
      s.finishes.set(sliceKey('a', 'build'), 1.31);
    },
  ],
  [
    'foreign start',
    (s) => {
      s.starts.set(sliceKey('b', null), 1.31);
    },
  ],
  [
    'foreign finish',
    (s) => {
      s.finishes.set(sliceKey('b', null), 2.31);
    },
  ],
  [
    'ownership',
    (s) => {
      connectedOrder(s).projectIdByWorkItem.set('a', 'B');
      s.relationships[0].predecessor.projectId = 'B';
    },
  ],
  [
    'step order',
    (s) => {
      s.input.slices.reverse();
      s.input.graph.nodes = s.input.graph.nodes.map((n) =>
        n.kind === 'step' ? { ...n, at: 1 - n.at } : n,
      );
      s.input.graph.edges = s.input.graph.edges.map((e) => ({
        ...e,
        predecessor: {
          ...e.predecessor,
          at: e.predecessor.leafId === 'a' ? 1 - e.predecessor.at : e.predecessor.at,
        },
        successor: {
          ...e.successor,
          at: e.successor.leafId === 'a' ? 1 - e.successor.at : e.successor.at,
        },
      }));
    },
  ],
];
for (const [field, edit] of edits)
  test(`identifies changed ${field}`, () => {
    const after = mutableStage();
    edit(after);
    expect(canonicalConnectedStageInput(after)).not.toBe(canonicalConnectedStageInput(stage()));
  });

test('canonicalizes set and map permutations without mutating the capture', () => {
  const s = mutableStage();
  const before = structuredClone(s);
  const canonical = canonicalConnectedStageInput(s);
  expect(s).toEqual(before);
  s.projects.reverse();
  s.input.rows.reverse();
  s.input.graph.nodes.reverse();
  s.input.graph.edges.reverse();
  s.input.slices = [s.input.slices[2], s.input.slices[0], s.input.slices[1]];
  s.input.slices[1].poolIds.reverse();
  s.starts = new Map([...s.starts].reverse());
  s.finishes = new Map([...s.finishes].reverse());
  s.input.poolSizes = new Map([...s.input.poolSizes].reverse());
  connectedOrder(s).rankByProject = new Map([...connectedOrder(s).rankByProject].reverse());
  connectedOrder(s).projectIdByWorkItem = new Map(
    [...connectedOrder(s).projectIdByWorkItem].reverse(),
  );
  expect(canonicalConnectedStageInput(s)).toBe(canonical);
});

test('ignores descriptive labels and frozen numbers', () => {
  const s = mutableStage();
  s.input.rows[0].frozenNumber = 'renumbered';
  Object.assign(s.input.rows[0], { name: 'renamed', abbreviation: 'NEW', updatedAt: 'later' });
  expect(canonicalConnectedStageInput(s)).toBe(canonicalConnectedStageInput(stage()));
});

const faults: readonly [string, (s: Mutable<ConnectedOptimizationStage>) => void, string][] = [
  [
    'unknown stage owner',
    (s) => {
      s.projectId = 'unknown';
    },
    'stage owner',
  ],
  [
    'local input',
    (s) => {
      s.input.order = { kind: 'local' };
    },
    'connected order',
  ],
  [
    'duplicate project',
    (s) => {
      s.projects.push(s.projects[0]);
    },
    'duplicate project',
  ],
  [
    'missing rank',
    (s) => {
      connectedOrder(s).rankByProject.delete('A');
    },
    'rank evidence',
  ],
  [
    'inconsistent rank',
    (s) => {
      connectedOrder(s).rankByProject.set('A', 2);
    },
    'rank evidence',
  ],
  [
    'extra rank',
    (s) => {
      connectedOrder(s).rankByProject.set('unknown', 3);
    },
    'rank evidence',
  ],
  [
    'nonfinite rank',
    (s) => {
      s.projects[0].rank = NaN;
      connectedOrder(s).rankByProject.set('A', NaN);
    },
    'finite',
  ],
  [
    'nonfinite origin',
    (s) => {
      s.originOrdinal = Infinity;
    },
    'finite',
  ],
  [
    'missing anchor',
    (s) => {
      s.projects[1].anchorOrdinal = null;
    },
    'active project anchor',
  ],
  [
    'nonfinite anchor',
    (s) => {
      s.projects[1].anchorOrdinal = NaN;
    },
    'finite',
  ],
  [
    'missing ownership',
    (s) => {
      connectedOrder(s).projectIdByWorkItem.delete('a');
    },
    'ownership',
  ],
  [
    'unknown ownership',
    (s) => {
      connectedOrder(s).projectIdByWorkItem.set('a', 'unknown');
    },
    'ownership',
  ],
  [
    'duplicate row',
    (s) => {
      s.input.rows.push(s.input.rows[0]);
    },
    'duplicate row',
  ],
  [
    'duplicate slice',
    (s) => {
      s.input.slices.push(s.input.slices[0]);
      s.input.graph.nodes.push(s.input.graph.nodes[0]);
    },
    'duplicate slice',
  ],
  [
    'missing start',
    (s) => {
      s.starts.delete(sliceKey('b', null));
    },
    'placement keys',
  ],
  [
    'extra finish',
    (s) => {
      s.finishes.set('unknown', 1);
    },
    'placement keys',
  ],
  [
    'nonfinite start',
    (s) => {
      s.starts.set(sliceKey('b', null), NaN);
    },
    'finite',
  ],
  [
    'nonfinite finish',
    (s) => {
      s.finishes.set(sliceKey('b', null), Infinity);
    },
    'finite',
  ],
  [
    'reversed interval',
    (s) => {
      s.finishes.set(sliceKey('b', null), 1);
    },
    'reversed placement',
  ],
  [
    'nonfinite effort',
    (s) => {
      s.input.slices[0].days = Infinity;
    },
    'finite',
  ],
  [
    'nonfinite position',
    (s) => {
      s.input.rows[0].position = NaN;
    },
    'finite',
  ],
  [
    'nonfinite priority',
    (s) => {
      s.input.rows[0].priority = NaN;
    },
    'finite',
  ],
  [
    'nonfinite floor',
    (s) => {
      s.input.notBefore.set('a', NaN);
    },
    'finite',
  ],
  [
    'nonfinite deadline',
    (s) => {
      s.input.deadlines.set('b', Infinity);
    },
    'finite',
  ],
  [
    'nonfinite pool',
    (s) => {
      s.input.poolSizes.set('team-a', Infinity);
    },
    'finite',
  ],
  [
    'nonfinite resource',
    (s) => {
      s.input.resourceCapacities.set('resource', NaN);
    },
    'finite',
  ],
  [
    'missing graph node',
    (s) => {
      s.input.graph.nodes.pop();
    },
    'omits a slice',
  ],
  [
    'foreign graph endpoint',
    (s) => {
      authoredEdge(s).successor.leafId = 'absent';
    },
    'endpoint',
  ],
  [
    'duplicate relationship',
    (s) => {
      s.relationships.push(s.relationships[0]);
    },
    'duplicate relationship',
  ],
  [
    'missing relationship evidence',
    (s) => {
      s.relationships = [];
    },
    'relationship evidence',
  ],
  [
    'relationship type mismatch',
    (s) => {
      s.relationships[0].type = 'SS';
    },
    'relationship evidence',
  ],
  [
    'relationship owner mismatch',
    (s) => {
      s.relationships[0].predecessor.projectId = 'B';
    },
    'relationship ownership',
  ],
  [
    'unknown selector project',
    (s) => {
      s.relationships[0].predecessor.projectId = 'unknown';
    },
    'selector project',
  ],
];
for (const [fault, inject, message] of faults)
  test(`refuses ${fault}`, () => {
    const s = mutableStage();
    inject(s);
    expect(() => canonicalConnectedStageInput(s)).toThrow(message);
  });

test('refuses stage discriminator and capacity mode outside their vocabularies', () => {
  const s = mutableStage();
  Object.assign(s, { kind: 'local' });
  expect(() => canonicalConnectedStageInput(s)).toThrow('stage kind');
  s.kind = 'connected-stage';
  Object.assign(s, { mode: 'unknown' });
  expect(() => canonicalConnectedStageInput(s)).toThrow('capacity mode');
});
test('refuses unsupported selectors, relationship types and graph provenance', () => {
  const s = mutableStage();
  Object.assign(s.relationships[0].predecessor, { scope: 'unknown', stepId: 'build' });
  expect(() => canonicalConnectedStageInput(s)).toThrow('selector scope');
  s.relationships[0].predecessor = { scope: 'node', projectId: 'A', workItemId: 'a', stepId: '' };
  expect(() => canonicalConnectedStageInput(s)).toThrow('selector step');
  s.relationships[0].predecessor = { scope: 'whole', projectId: 'A', workItemId: 'a' };
  Object.assign(s.relationships[0], { type: 'SF' });
  expect(() => canonicalConnectedStageInput(s)).toThrow('relationship type');
  s.relationships[0].type = 'FS';
  Object.assign(s.input.graph.edges[0], { provenance: 'unknown' });
  expect(() => canonicalConnectedStageInput(s)).toThrow('graph provenance');
  s.input.graph.edges[0].provenance = 'workflow';
  Object.assign(s.input.graph.edges[0], { type: 'SS' });
  expect(() => canonicalConnectedStageInput(s)).toThrow('graph type');
});
test('refuses foreign workflow endpoints through the shared graph validator', () => {
  const s = mutableStage();
  s.input.graph.edges[0].predecessor.leafId = 'absent';
  expect(() => canonicalConnectedStageInput(s)).toThrow('endpoint');
});
test('permits null anchor only on projects without active reduced nodes', () => {
  const s = mutableStage();
  s.projects.push({ projectId: 'empty', rank: 2, anchorOrdinal: null });
  connectedOrder(s).rankByProject.set('empty', 2);
  expect(canonicalConnectedStageInput(s)).not.toBe(canonicalConnectedStageInput(stage()));
});

test('refuses extra reduced ownership facts', () => {
  const s = mutableStage();
  connectedOrder(s).projectIdByWorkItem.set('original-parent', 'A');
  expect(() => canonicalConnectedStageInput(s)).toThrow('ownership keys');
});

test('identifies reparenting without changes to the retained row set', () => {
  const before = mutableStage();
  before.input.rows.push({
    id: 'parent',
    parentId: null,
    position: 3,
    priority: null,
    frozenNumber: null,
  });
  connectedOrder(before).projectIdByWorkItem.set('parent', 'A');
  before.input.rows[0].parentId = 'parent';
  before.input.rows.push({
    id: 'c',
    parentId: 'parent',
    position: 4,
    priority: null,
    frozenNumber: null,
  });
  connectedOrder(before).projectIdByWorkItem.set('c', 'A');
  before.input.slices.push({
    workItemId: 'c',
    stepId: null,
    days: 0,
    width: 1,
    personId: null,
    poolIds: [],
  });
  before.input.graph.nodes.push({ kind: 'boundary', workItemId: 'c', at: 0 });
  before.starts.set(sliceKey('c', null), 0);
  before.finishes.set(sliceKey('c', null), 0);
  const after = structuredClone(before);
  after.input.rows[0].parentId = null;
  expect(canonicalConnectedStageInput(after)).not.toBe(canonicalConnectedStageInput(before));
});
test('identifies a resource demand changing within unchanged capacities', () => {
  const before = mutableStage();
  before.input.resourceCapacities.set('other', 2);
  const after = structuredClone(before);
  after.input.slices[0].demands![0].resourceId = 'other';
  expect(canonicalConnectedStageInput(after)).not.toBe(canonicalConnectedStageInput(before));
});
test('identifies ownership independently of authored selectors', () => {
  const before = mutableStage();
  before.input.graph.edges.pop();
  before.relationships = [];
  const after = structuredClone(before);
  connectedOrder(after).projectIdByWorkItem.set('b', 'A');
  expect(canonicalConnectedStageInput(after)).not.toBe(canonicalConnectedStageInput(before));
});
test('identifies each graph endpoint independently', () => {
  const before = mutableStage();
  before.input.graph.edges = [];
  before.relationships = [];
  const edge = {
    predecessor: { leafId: 'a', at: 0 },
    successor: { leafId: 'a', at: 1 },
    type: 'FS',
    provenance: 'legacy',
  } as const;
  before.input.graph.edges.push(structuredClone(edge));
  for (const [endpoint, field, value] of [
    ['predecessor', 'leafId', 'b'],
    ['successor', 'leafId', 'b'],
    ['successor', 'at', 0],
  ] as const) {
    const reference = structuredClone(before);
    if (field === 'leafId') reference.input.graph.edges[0].successor.at = 0;
    const after = structuredClone(reference);
    Object.assign(after.input.graph.edges[0][endpoint], { [field]: value });
    expect(canonicalConnectedStageInput(after)).not.toBe(canonicalConnectedStageInput(reference));
  }
});
test('identifies unused authored identity, type and successor selector independently', () => {
  const before = mutableStage();
  before.input.graph.edges.pop();
  const changes = [
    { id: 'other' },
    { type: 'FF' },
    { successor: { scope: 'whole', projectId: 'B', workItemId: 'original-parent' } },
  ] as const;
  for (const change of changes) {
    const after = structuredClone(before);
    Object.assign(after.relationships[0], change);
    expect(canonicalConnectedStageInput(after)).not.toBe(canonicalConnectedStageInput(before));
  }
});
test('identifies graph relationship attribution between equivalent authored constraints', () => {
  const before = mutableStage();
  before.relationships.push({ ...structuredClone(before.relationships[0]), id: 'equivalent' });
  const after = structuredClone(before);
  authoredEdge(after).relationshipId = 'equivalent';
  expect(canonicalConnectedStageInput(after)).not.toBe(canonicalConnectedStageInput(before));
});

test('refuses malformed elsewhere evidence through the existing boundary', () => {
  const s = mutableStage();
  s.input.elsewhere.set('person', []);
  expect(() => canonicalConnectedStageInput(s)).toThrow();
});

test('refuses missing and unknown ownership on retained parents independently of active slices', () => {
  for (const owner of [undefined, 'unknown']) {
    const s = mutableStage();
    s.input.rows.push({
      id: 'parent',
      parentId: null,
      position: 3,
      priority: null,
      frozenNumber: null,
    });
    s.input.rows[0].parentId = 'parent';
    if (owner !== undefined) connectedOrder(s).projectIdByWorkItem.set('parent', owner);
    expect(() => canonicalConnectedStageInput(s)).toThrow('ownership');
  }
});
test('refuses selector ownership independently of graph relationship evidence', () => {
  const s = mutableStage();
  s.input.graph.edges.pop();
  s.relationships[0].predecessor.projectId = 'B';
  expect(() => canonicalConnectedStageInput(s)).toThrow('relationship ownership');
});
test('refuses graph ownership independently of unreduced selector identities', () => {
  const s = mutableStage();
  s.relationships[0].predecessor = { scope: 'whole', projectId: 'B', workItemId: 'held-parent' };
  expect(() => canonicalConnectedStageInput(s)).toThrow('relationship ownership');
});
test('canonicalizes all independent map and relationship permutations', () => {
  const before = mutableStage();
  before.input.notBefore.set('b', 0.2);
  before.input.deadlines.set('a', 8);
  before.input.resourceCapacities.set('other', 3);
  before.input.elsewhere.set('other-person', [
    { start: 8, end: 9, projectId: 'outside', workItemId: 'other-work' },
  ]);
  before.relationships.push({ ...structuredClone(before.relationships[0]), id: 'other' });
  const after = structuredClone(before);
  after.input.notBefore = new Map([...after.input.notBefore].reverse());
  after.input.deadlines = new Map([...after.input.deadlines].reverse());
  after.input.resourceCapacities = new Map([...after.input.resourceCapacities].reverse());
  after.input.elsewhere = new Map([...after.input.elsewhere].reverse());
  after.relationships.reverse();
  after.input.slices[0].poolIds.push('team-a');
  expect(canonicalConnectedStageInput(after)).toBe(canonicalConnectedStageInput(before));
});

test('refuses missing required person, selector identity and pool collection facts', () => {
  const person = mutableStage();
  Reflect.deleteProperty(person.input.slices[0], 'personId');
  expect(() => canonicalConnectedStageInput(person)).toThrow('defined canonical fact');
  const selector = mutableStage();
  Reflect.deleteProperty(selector.relationships[0].predecessor, 'workItemId');
  expect(() => canonicalConnectedStageInput(selector)).toThrow('selector identity');
  const pools = mutableStage();
  Reflect.deleteProperty(pools.input.slices[0], 'poolIds');
  expect(() => canonicalConnectedStageInput(pools)).toThrow('slice pools');
});

test('refuses same-sized placement maps with substituted local or foreign keys', () => {
  for (const [placement, key] of [
    ['starts', sliceKey('a', 'design')],
    ['finishes', sliceKey('b', null)],
  ] as const) {
    const s = mutableStage();
    s[placement].delete(key);
    s[placement].set('unknown', 1);
    expect(() => canonicalConnectedStageInput(s)).toThrow('placement keys');
  }
});
test('identifies rank changes that preserve project ordering', () => {
  const after = mutableStage();
  after.projects[0].rank = 0.5;
  connectedOrder(after).rankByProject.set('A', 0.5);
  expect(canonicalConnectedStageInput(after)).not.toBe(canonicalConnectedStageInput(stage()));
});

test('refuses unsupported unused authored relationship type', () => {
  const s = mutableStage();
  s.input.graph.edges.pop();
  Object.assign(s.relationships[0], { type: 'SF' });
  expect(() => canonicalConnectedStageInput(s)).toThrow('relationship type');
});

test('refuses surplus starts and absent finishes', () => {
  const surplus = mutableStage();
  surplus.starts.set('unknown', 1);
  expect(() => canonicalConnectedStageInput(surplus)).toThrow('placement keys');
  const absent = mutableStage();
  absent.finishes.delete(sliceKey('a', 'build'));
  expect(() => canonicalConnectedStageInput(absent)).toThrow('placement keys');
});

test('refuses matching substituted keys in both placement maps', () => {
  const s = mutableStage();
  const key = sliceKey('b', null);
  s.starts.delete(key);
  s.finishes.delete(key);
  s.starts.set('unknown', 1.3);
  s.finishes.set('unknown', 2.3);
  expect(() => canonicalConnectedStageInput(s)).toThrow('placement keys');
});

test('refuses null or numeric original selector identities', () => {
  for (const workItemId of [null, 7]) {
    const s = mutableStage();
    Object.assign(s.relationships[0].predecessor, { workItemId });
    expect(() => canonicalConnectedStageInput(s)).toThrow('selector identity');
  }
});
