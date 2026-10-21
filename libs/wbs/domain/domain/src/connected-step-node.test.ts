import { expect, it } from 'bun:test';

import { type ConnectedProjectGraph, resolveConnectedGraph } from './connected-step-node';
import type { DependencyReach } from './dependency-reach';
import { indexTree } from './schedule';
import { findStepNodeCycle, type GraphSlice, resolveStepNodeGraph } from './slice-edges';
import type { ScopedTypedDependency } from './typed-dependency';

function project(
  projectId: string,
  leafIds: string[],
  stepIds: string[],
  parentId?: string,
  reach: DependencyReach = 'anchor-slice',
): ConnectedProjectGraph {
  const tree = indexTree([
    ...(parentId === undefined
      ? []
      : [{ id: parentId, parentId: null, position: 0, priority: null, frozenNumber: null }]),
    ...leafIds.map((id, position) => ({
      id,
      parentId: parentId ?? null,
      position,
      priority: null,
      frozenNumber: null,
    })),
  ]);
  const slicesByLeaf = new Map<string, readonly GraphSlice[]>(
    leafIds.map((id) => [
      id,
      stepIds.length === 0
        ? [{ stepId: null, days: null }]
        : stepIds.map((stepId) => ({ stepId, days: 1 })),
    ]),
  );
  const slicesOf = (id: string): readonly GraphSlice[] => {
    const slices = slicesByLeaf.get(id);
    if (slices === undefined) throw new Error(`missing fixture ${id}`);
    return slices;
  };
  return {
    projectId,
    tree,
    slicesByLeaf,
    graph: resolveStepNodeGraph(leafIds, slicesOf, [], reach),
    relationships: [],
  };
}

const a = project('a', ['A'], ['design', 'test']);
const b = project('b', ['B'], ['build']);
function link(
  id: string,
  from: [string, string, string?],
  to: [string, string, string?],
): ScopedTypedDependency {
  const endpoint = ([projectId, workItemId, stepId]: [string, string, string?]) =>
    stepId === undefined
      ? { projectId, workItemId, scope: 'whole' as const }
      : { projectId, workItemId, stepId, scope: 'node' as const };
  return { id, predecessor: endpoint(from), successor: endpoint(to), type: 'FS' };
}
const forward = link('forward', ['a', 'A', 'design'], ['b', 'B', 'build']);
const returning = link('returning', ['b', 'B', 'build'], ['a', 'A', 'test']);

it('accepts A.design B.build A.test and retains ownership and relationship provenance', () => {
  const connected = resolveConnectedGraph({ projects: [a, b], external: [forward, returning] });
  expect(findStepNodeCycle(connected.graph)).toBeNull();
  expect([...connected.projectIdByWorkItem]).toEqual([
    ['A', 'a'],
    ['B', 'b'],
  ]);
  expect([...connected.relationships.values()]).toEqual([forward, returning]);
  expect(connected.graph.edges.filter((edge) => edge.provenance === 'authored')).toHaveLength(2);
});

it('refuses true reverse cycles and a cycle through distinct tasks', () => {
  expect(
    findStepNodeCycle(
      resolveConnectedGraph({
        projects: [a, b],
        external: [forward, link('reverse', ['b', 'B', 'build'], ['a', 'A', 'design'])],
      }).graph,
    )?.kind,
  ).toBe('cycle');
  const c = project('a', ['A', 'C'], ['design', 'test']);
  const local = link('close', ['a', 'C', 'test'], ['a', 'A', 'design']);
  const localGraph = {
    ...c,
    graph: {
      nodes: c.graph.nodes,
      edges: [
        ...c.graph.edges,
        {
          predecessor: { leafId: 'C', at: 1 },
          successor: { leafId: 'A', at: 0 },
          type: 'FS' as const,
          provenance: 'authored' as const,
          relationshipId: 'close',
        },
      ],
    },
    relationships: [local],
  };
  expect(
    findStepNodeCycle(
      resolveConnectedGraph({
        projects: [localGraph, b],
        external: [forward, link('return', ['b', 'B', 'build'], ['a', 'C', 'test'])],
      }).graph,
    )?.kind,
  ).toBe('cycle');
});

it('keeps local self-node refusal and authored provenance', () => {
  const self = link('self', ['a', 'A', 'design'], ['a', 'A', 'design']);
  const graph = resolveStepNodeGraph(
    ['A'],
    () => [
      { days: 1, stepId: 'design' },
      { days: 1, stepId: 'test' },
    ],
    [],
    'anchor-slice',
    { dependencies: [self], leavesUnder: () => ['A'] },
  );
  expect(
    findStepNodeCycle(
      resolveConnectedGraph({ projects: [{ ...a, graph, relationships: [self] }], external: [] })
        .graph,
    ),
  ).toEqual({ kind: 'self_node', relationshipIds: ['self'] });
});

it('expands every remote parent pair using each endpoint tree and own step identity', () => {
  const left = project('a', ['A1', 'A2'], ['design', 'test'], 'AP');
  const right = project('b', ['B1', 'B2'], ['build', 'verify'], 'BP');
  const dependency: ScopedTypedDependency = {
    id: 'parents',
    predecessor: { projectId: 'a', workItemId: 'AP', scope: 'descendant-step', stepId: 'test' },
    successor: { projectId: 'b', workItemId: 'BP', scope: 'descendant-step', stepId: 'build' },
    type: 'FS',
  };
  const edges = resolveConnectedGraph({
    projects: [left, right],
    external: [dependency],
  }).graph.edges.filter((edge) => edge.provenance === 'authored');
  expect(
    edges.map((edge) => [
      edge.predecessor.leafId,
      edge.predecessor.at,
      edge.successor.leafId,
      edge.successor.at,
    ]),
  ).toEqual([
    ['A1', 1, 'B1', 0],
    ['A1', 1, 'B2', 0],
    ['A2', 1, 'B1', 0],
    ['A2', 1, 'B2', 0],
  ]);
});

it('preserves whole FS SS FF boundaries and stepless nodes', () => {
  for (const [type, before, after] of [
    ['FS', 1, 0],
    ['SS', 0, 0],
    ['FF', 1, 1],
  ] as const) {
    const dependency = { ...link(type, ['a', 'A'], ['b', 'B']), type };
    expect(
      resolveConnectedGraph({
        projects: [a, project('b', ['B'], ['build', 'verify'])],
        external: [dependency],
      }).graph.edges.at(-1),
    ).toMatchObject({ predecessor: { at: before }, successor: { at: after }, type });
  }
  expect(
    findStepNodeCycle(
      resolveConnectedGraph({
        projects: [project('a', ['A'], []), project('b', ['B'], [])],
        external: [link('go', ['a', 'A'], ['b', 'B']), link('back', ['b', 'B'], ['a', 'A'])],
      }).graph,
    )?.kind,
  ).toBe('cycle');
});

it('accepts empty projects', () => {
  expect(
    resolveConnectedGraph({ projects: [project('empty', [], [])], external: [] }).graph,
  ).toEqual({ nodes: [], edges: [] });
});

it('refuses duplicate project and work-item ownership even without relationships', () => {
  expect(() => resolveConnectedGraph({ projects: [a, a], external: [] })).toThrow(
    /duplicate project/,
  );
  expect(() =>
    resolveConnectedGraph({ projects: [a, project('b', ['A'], ['build'])], external: [] }),
  ).toThrow(/work item A.*ownership/);
});

it('refuses missing endpoint project, cross-owned work item, absent work item and absent step', () => {
  for (const [endpoint, message] of [
    [{ ...forward.predecessor, projectId: 'missing' }, /project missing/],
    [{ ...forward.predecessor, projectId: 'c' }, /work item A/],
    [{ ...forward.predecessor, workItemId: 'missing' }, /work item missing/],
    [{ ...forward.predecessor, scope: 'node' as const, stepId: 'build' }, /no step build/],
  ] as const)
    expect(() =>
      resolveConnectedGraph({
        projects: [a, b, project('c', [], [])],
        external: [{ ...forward, predecessor: endpoint }],
      }),
    ).toThrow(message);
});

it('refuses absent and empty slices instead of creating a boundary', () => {
  for (const slicesByLeaf of [new Map(), new Map([['A', []]])]) {
    expect(() =>
      resolveConnectedGraph({
        projects: [{ ...a, slicesByLeaf }, b],
        external: [link('whole', ['a', 'A'], ['b', 'B'])],
      }),
    ).toThrow(/slice.*A/);
  }
});

it('refuses local/external misclassification and conflicting relationship identities', () => {
  expect(() =>
    resolveConnectedGraph({ projects: [{ ...a, relationships: [forward] }, b], external: [] }),
  ).toThrow(/local.*forward/);
  expect(() =>
    resolveConnectedGraph({ projects: [a, b], external: [link('local', ['a', 'A'], ['a', 'A'])] }),
  ).toThrow(/external.*local/);
  expect(() =>
    resolveConnectedGraph({
      projects: [a, b],
      external: [forward, { ...returning, id: 'forward' }],
    }),
  ).toThrow(/conflicting relationship forward/);
  expect(
    resolveConnectedGraph({ projects: [a, b], external: [forward, forward] }).graph.edges.filter(
      (edge) => edge.provenance === 'authored',
    ),
  ).toHaveLength(1);
});

it('refuses a local relationship whose predecessor belongs to another project', () => {
  expect(() =>
    resolveConnectedGraph({ projects: [a, { ...b, relationships: [forward] }], external: [] }),
  ).toThrow(/local relationship forward/);
});

it('refuses missing local endpoint facts in a supplied project context', () => {
  const local = link('broken-local', ['a', 'missing'], ['a', 'A']);
  expect(() =>
    resolveConnectedGraph({ projects: [{ ...a, relationships: [local] }], external: [] }),
  ).toThrow(/work item missing/);
});

it('refuses each foreign local endpoint project independently even when work-item lookup would succeed', () => {
  for (const dependency of [
    link('foreign-before', ['b', 'A', 'design'], ['a', 'A', 'test']),
    link('foreign-after', ['a', 'A', 'design'], ['b', 'A', 'test']),
  ]) {
    expect(() =>
      resolveConnectedGraph({ projects: [{ ...a, relationships: [dependency] }, b], external: [] }),
    ).toThrow(/local relationship/);
  }
});
