import { describe, expect, it } from 'bun:test';

import type { GraphSlice, LeafEdge, StepNodeGraphEdge } from './slice-edges';
import { findStepNodeCycle, reachedSliceOf, resolveStepNodeGraph } from './slice-edges';
import type { DependencyEndpoint, TypedDependency } from './typed-dependency';

/**
 * Three leaves. `A` has three steps and nobody estimated its first two, `B` has
 * two, `C` has one — enough for the chain, both reach arms and the join's
 * asymmetry to be told apart.
 */
const groups: Record<string, readonly GraphSlice[] | undefined> = {
  A: [
    { days: null, stepId: 'design' },
    { days: null, stepId: 'dev' },
    { days: 3, stepId: 'qa' },
  ],
  B: [
    { days: 2, stepId: 'dev' },
    { days: 1, stepId: 'qa' },
  ],
  C: [{ days: 5, stepId: 'dev' }],
  D: [{ days: null, stepId: null }],
};
const leafIds = ['A', 'B', 'C'];
const slicesOf = (leafId: string): readonly GraphSlice[] => {
  const found = groups[leafId];
  if (found === undefined) throw new Error(`no slice for work item ${leafId}`);
  return found;
};

/** `A0→A1`, as the assertions below spell an edge. */
const wire = (edges: readonly StepNodeGraphEdge[]): string[] =>
  edges.map(
    (edge) =>
      `${edge.predecessor.leafId}${String(edge.predecessor.at)}→${edge.successor.leafId}${String(edge.successor.at)}`,
  );

describe('reachedSliceOf', () => {
  it('reaches the LAST slice under whole-item', () => {
    expect(reachedSliceOf('whole-item', slicesOf('A'))).toBe(2);
    expect(reachedSliceOf('whole-item', slicesOf('C'))).toBe(0);
  });

  it('reaches the first ESTIMATED slice under anchor-slice, stepping over the blanks', () => {
    expect(reachedSliceOf('anchor-slice', slicesOf('A'))).toBe(2);
    expect(reachedSliceOf('anchor-slice', slicesOf('B'))).toBe(0);
  });

  it('falls through to the last slice when nobody estimated any of them', () => {
    // Not index 0. An unestimated leaf now runs its assumed durations end to
    // end, so a dependency on it waits for the whole of it under either arm.
    expect(reachedSliceOf('anchor-slice', [{ days: null }, { days: null }])).toBe(1);
  });

  it('reads days !== null, so an explicit zero is an estimate', () => {
    // `days > 0` would step over somebody's stated "this takes no time" and
    // anchor the wait on the step behind it.
    expect(reachedSliceOf('anchor-slice', [{ days: 0 }, { days: 4 }])).toBe(0);
  });
});

describe('resolveStepNodeGraph', () => {
  it('lists every node, isolated and unestimated ones included, and a stepless boundary', () => {
    expect(resolveStepNodeGraph(['C', 'A', 'D'], slicesOf, [], 'whole-item').nodes).toEqual([
      { kind: 'step', ref: { workItemId: 'C', stepId: 'dev' }, at: 0 },
      { kind: 'step', ref: { workItemId: 'A', stepId: 'design' }, at: 0 },
      { kind: 'step', ref: { workItemId: 'A', stepId: 'dev' }, at: 1 },
      { kind: 'step', ref: { workItemId: 'A', stepId: 'qa' }, at: 2 },
      { kind: 'boundary', workItemId: 'D', at: 0 },
    ]);
  });

  it('marks a Dev to QA chain as FS workflow edges', () => {
    expect(resolveStepNodeGraph(['B'], slicesOf, [], 'whole-item').edges).toEqual([
      {
        predecessor: { leafId: 'B', at: 0 },
        successor: { leafId: 'B', at: 1 },
        type: 'FS',
        provenance: 'workflow',
      },
    ]);
  });

  it('marks reach-decided joins as FS legacy edges after the workflow chains', () => {
    const edges = resolveStepNodeGraph(
      ['A', 'B'],
      slicesOf,
      [{ predecessorId: 'A', successorId: 'B' }],
      'whole-item',
    ).edges;
    expect(edges.map(({ type, provenance }) => ({ type, provenance }))).toEqual([
      { type: 'FS', provenance: 'workflow' },
      { type: 'FS', provenance: 'workflow' },
      { type: 'FS', provenance: 'workflow' },
      { type: 'FS', provenance: 'legacy' },
    ]);
    expect(edges[3]?.predecessor).toEqual({ leafId: 'A', at: 2 });
    expect(edges[3]?.successor).toEqual({ leafId: 'B', at: 0 });
  });

  it('chains each leaf’s own steps in the order the group was given', () => {
    expect(wire(resolveStepNodeGraph(leafIds, slicesOf, [], 'whole-item').edges)).toEqual([
      'A0→A1',
      'A1→A2',
      'B0→B1',
    ]);
  });

  it('leaves a leaf of one slice out of the chain entirely', () => {
    expect(wire(resolveStepNodeGraph(['C'], slicesOf, [], 'whole-item').edges)).toEqual([]);
  });

  it('joins the predecessor’s REACHED slice to the successor’s FIRST, plain', () => {
    const edges: readonly LeafEdge[] = [{ predecessorId: 'A', successorId: 'B' }];
    // whole-item reaches A's last; the successor side is 0 under either arm.
    expect(wire(resolveStepNodeGraph(leafIds, slicesOf, edges, 'whole-item').edges)).toContain(
      'A2→B0',
    );
    // anchor-slice reaches B's first estimated step — which is B0 — and still
    // arrives at the successor's first. The reach never touches that side: with
    // it applied to both ends this case would read `B0→A2`, and A's own two
    // blank steps would escape the wait entirely.
    const back: readonly LeafEdge[] = [{ predecessorId: 'B', successorId: 'A' }];
    expect(wire(resolveStepNodeGraph(leafIds, slicesOf, back, 'anchor-slice').edges)).toContain(
      'B0→A0',
    );
  });

  it('emits every chain before any external edge — the order the adjacency is walked in', () => {
    // This is the ONLY thing holding that order. Watched: with the two loops
    // swapped, every one of the 356 domain tests that predate this file stays
    // green and this case alone fails (364 pass / 1 fail, h2puni, 2026-09-04).
    // So it pins the order `schedule()`'s inline chain produced — which is what
    // makes the move a move — and it does not claim the placement depends on
    // it, because nothing measured says it does.
    const edges: readonly LeafEdge[] = [
      { predecessorId: 'C', successorId: 'A' },
      { predecessorId: 'A', successorId: 'B' },
    ];
    expect(wire(resolveStepNodeGraph(leafIds, slicesOf, edges, 'whole-item').edges)).toEqual([
      'A0→A1',
      'A1→A2',
      'B0→B1',
      'C0→A0',
      'A2→B0',
    ]);
  });

  it('asks the lookup for BOTH ends, so a successor with no group refuses', () => {
    // The value is unused on that side — position 0 is 0 whatever the group
    // holds — so an implementation that only reads the predecessor would draw
    // an edge onto a node that does not exist and lose the dependency silently.
    expect(() =>
      resolveStepNodeGraph(
        ['A'],
        slicesOf,
        [{ predecessorId: 'A', successorId: 'gone' }],
        'whole-item',
      ),
    ).toThrow('no slice for work item gone');
    expect(() =>
      resolveStepNodeGraph(
        ['A'],
        slicesOf,
        [{ predecessorId: 'gone', successorId: 'A' }],
        'whole-item',
      ),
    ).toThrow('no slice for work item gone');
  });
});

describe('authored typed dependencies', () => {
  /**
   * Parent `P` over leaves `P1` and `P2`, and leaves `A`, `B`, each with Dev
   * then QA. `S` is a stepless project's lone boundary node.
   */
  const devQa: readonly GraphSlice[] = [
    { days: 2, stepId: 'dev' },
    { days: 1, stepId: 'qa' },
  ];
  const tree: Record<string, readonly string[] | undefined> = {
    A: ['A'],
    B: ['B'],
    P: ['P1', 'P2'],
    P1: ['P1'],
    P2: ['P2'],
  };
  const leavesUnder = (id: string): readonly string[] => {
    const found = tree[id];
    if (found === undefined) throw new Error(`no work item ${id}`);
    return found;
  };
  const leaves = ['A', 'B', 'P1', 'P2'];
  const devQaOf = (leafId: string): readonly GraphSlice[] => {
    if (!leaves.includes(leafId)) throw new Error(`no slice for work item ${leafId}`);
    return devQa;
  };
  const whole = (workItemId: string): DependencyEndpoint => ({ scope: 'whole', workItemId });
  const node = (workItemId: string, stepId: string): DependencyEndpoint => ({
    scope: 'node',
    workItemId,
    stepId,
  });
  const descendants = (workItemId: string, stepId: string): DependencyEndpoint => ({
    scope: 'descendant-step',
    workItemId,
    stepId,
  });
  const fs = (
    id: string,
    predecessor: DependencyEndpoint,
    successor: DependencyEndpoint,
  ): TypedDependency => ({ id, predecessor, successor, type: 'FS' });
  const authoredOf = (dependencies: readonly TypedDependency[]): string[] =>
    wire(
      resolveStepNodeGraph(leaves, devQaOf, [], 'whole-item', {
        dependencies,
        leavesUnder,
      }).edges.filter((edge) => edge.provenance === 'authored'),
    );

  it('resolves Whole to Whole as the predecessor’s last node to the successor’s first', () => {
    expect(authoredOf([fs('r1', whole('A'), whole('B'))])).toEqual(['A1→B0']);
  });

  it('carries authored provenance and the relationship id on each resolved edge', () => {
    const edges = resolveStepNodeGraph(leaves, devQaOf, [], 'whole-item', {
      dependencies: [fs('r1', node('A', 'dev'), node('B', 'dev'))],
      leavesUnder,
    }).edges;
    expect(edges.at(-1)).toEqual({
      predecessor: { leafId: 'A', at: 0 },
      successor: { leafId: 'B', at: 0 },
      type: 'FS',
      provenance: 'authored',
      relationshipId: 'r1',
    });
  });

  it('joins node to whole at the successor’s first node, and whole to node from the predecessor’s last', () => {
    expect(authoredOf([fs('r1', node('A', 'dev'), whole('B'))])).toEqual(['A0→B0']);
    expect(authoredOf([fs('r2', whole('A'), node('B', 'qa'))])).toEqual(['A1→B1']);
  });

  it('expands a whole parent to every descendant leaf, every pair constrained', () => {
    expect(authoredOf([fs('r1', whole('P'), whole('B'))])).toEqual(['P11→B0', 'P21→B0']);
    expect(authoredOf([fs('r2', whole('A'), whole('P'))])).toEqual(['A1→P10', 'A1→P20']);
  });

  it('expands a descendant-step endpoint to that step’s node in every leaf beneath it', () => {
    expect(authoredOf([fs('r1', descendants('P', 'dev'), node('B', 'dev'))])).toEqual([
      'P10→B0',
      'P20→B0',
    ]);
  });

  it('keeps overlapping relationships distinct, each with its own provenance', () => {
    const edges = resolveStepNodeGraph(leaves, devQaOf, [], 'whole-item', {
      dependencies: [fs('r1', whole('A'), whole('B')), fs('r2', node('A', 'qa'), node('B', 'dev'))],
      leavesUnder,
    }).edges.filter((edge) => edge.provenance === 'authored');
    expect(edges.map((edge) => edge.relationshipId)).toEqual(['r1', 'r2']);
    expect(wire(edges)).toEqual(['A1→B0', 'A1→B0']);
  });

  it('resolves a stepless project’s whole endpoint to the work-item boundary', () => {
    const boundary: readonly GraphSlice[] = [{ days: null, stepId: null }];
    const edges = resolveStepNodeGraph(['A', 'B'], () => boundary, [], 'whole-item', {
      dependencies: [fs('r1', whole('A'), whole('B'))],
      leavesUnder,
    }).edges;
    expect(wire(edges)).toEqual(['A0→B0']);
  });

  it('refuses a node endpoint on a parent, a descendant-step on a leaf, and an unknown step', () => {
    const resolve = (dependency: TypedDependency): unknown =>
      resolveStepNodeGraph(leaves, devQaOf, [], 'whole-item', {
        dependencies: [dependency],
        leavesUnder,
      });
    expect(() => resolve(fs('r1', node('P', 'dev'), whole('B')))).toThrow(
      'node endpoint of r1 names P, which is not a leaf',
    );
    expect(() => resolve(fs('r2', descendants('A', 'dev'), whole('B')))).toThrow(
      'descendant-step endpoint of r2 names A, which is a leaf',
    );
    expect(() => resolve(fs('r3', node('A', 'design'), whole('B')))).toThrow(
      'no step design in work item A for r3',
    );
  });
});

describe('authored edges on a missing leaf', () => {
  it('asks the lookup for both ends of an authored edge', () => {
    const only = (leafId: string): readonly GraphSlice[] => {
      if (leafId !== 'A') throw new Error(`no slice for work item ${leafId}`);
      return [{ days: 1, stepId: 'dev' }];
    };
    const whole = (workItemId: string): DependencyEndpoint => ({ scope: 'whole', workItemId });
    expect(() =>
      resolveStepNodeGraph(['A'], only, [], 'whole-item', {
        dependencies: [{ id: 'r1', predecessor: whole('A'), successor: whole('B'), type: 'FS' }],
        leavesUnder: (id) => [id],
      }),
    ).toThrow('no slice for work item B');
  });

  it('refuses to order a graph whose edge names a node it does not hold', () => {
    expect(() =>
      findStepNodeCycle({
        nodes: [{ kind: 'boundary', workItemId: 'A', at: 0 }],
        edges: [
          {
            predecessor: { leafId: 'A', at: 0 },
            successor: { leafId: 'B', at: 0 },
            type: 'FS',
            provenance: 'authored',
            relationshipId: 'r1',
          },
        ],
      }),
    ).toThrow('names a node the graph does not hold');
  });
});

describe('findStepNodeCycle', () => {
  const devQa: readonly GraphSlice[] = [
    { days: 2, stepId: 'dev' },
    { days: 1, stepId: 'qa' },
  ];
  const tree: Record<string, readonly string[] | undefined> = {
    A: ['A'],
    B: ['B'],
    C: ['C'],
    P: ['P1', 'B'],
    P1: ['P1'],
  };
  const leavesUnder = (id: string): readonly string[] => {
    const found = tree[id];
    if (found === undefined) throw new Error(`no work item ${id}`);
    return found;
  };
  const leaves = ['A', 'B', 'C', 'P1'];
  const node = (workItemId: string, stepId: string): DependencyEndpoint => ({
    scope: 'node',
    workItemId,
    stepId,
  });
  const whole = (workItemId: string): DependencyEndpoint => ({ scope: 'whole', workItemId });
  const fs = (
    id: string,
    predecessor: DependencyEndpoint,
    successor: DependencyEndpoint,
  ): TypedDependency => ({ id, predecessor, successor, type: 'FS' });
  const cycleOf = (
    dependencies: readonly TypedDependency[],
    legacy: readonly LeafEdge[] = [],
    reach: 'whole-item' | 'anchor-slice' = 'whole-item',
    slicesOf: (leafId: string) => readonly GraphSlice[] = () => devQa,
  ): ReturnType<typeof findStepNodeCycle> =>
    findStepNodeCycle(
      resolveStepNodeGraph(leaves, slicesOf, legacy, reach, { dependencies, leavesUnder }),
    );

  it('accepts an apparent work-item cycle that is a step-node DAG', () => {
    expect(
      cycleOf([
        fs('r1', node('A', 'dev'), node('B', 'dev')),
        fs('r2', node('B', 'qa'), node('A', 'qa')),
      ]),
    ).toBeNull();
  });

  it('refuses a directed cycle through the workflow chain, naming the authored edges in it', () => {
    expect(
      cycleOf([
        fs('r1', node('A', 'qa'), node('B', 'dev')),
        fs('r2', node('B', 'qa'), node('A', 'dev')),
      ]),
    ).toEqual({ kind: 'cycle', relationshipIds: ['r1', 'r2'] });
  });

  it('refuses a self-node pair', () => {
    expect(cycleOf([fs('r1', node('B', 'dev'), node('B', 'dev'))])).toEqual({
      kind: 'self_node',
      relationshipIds: ['r1'],
    });
  });

  it('refuses a cycle a parent expansion closes', () => {
    // P holds P1 and B, so whole P → node B.dev expands to P1.qa → B.dev and
    // B.qa → B.dev, and the second closes a cycle through B's own workflow
    // edge. Omitting that second leaf's pair would accept it.
    expect(cycleOf([fs('r2', whole('P'), node('B', 'dev'))])).toEqual({
      kind: 'cycle',
      relationshipIds: ['r2'],
    });
  });

  it('refuses a cycle a legacy edge closes against a typed one', () => {
    expect(
      cycleOf(
        [fs('r1', node('A', 'qa'), node('B', 'qa'))],
        [{ predecessorId: 'B', successorId: 'A' }],
      ),
    ).toEqual({ kind: 'cycle', relationshipIds: ['r1'] });
  });

  it('reads the legacy anchor dynamically: clearing B.dev’s estimate moves it into a cycle', () => {
    const legacy = [{ predecessorId: 'B', successorId: 'A' }];
    const typed = [fs('r1', node('A', 'qa'), node('B', 'qa'))];
    const estimated = (): readonly GraphSlice[] => devQa;
    expect(cycleOf(typed, legacy, 'anchor-slice', estimated)).toBeNull();
    const cleared = (leafId: string): readonly GraphSlice[] =>
      leafId === 'B'
        ? [
            { days: null, stepId: 'dev' },
            { days: 1, stepId: 'qa' },
          ]
        : devQa;
    expect(cycleOf(typed, legacy, 'anchor-slice', cleared)).toEqual({
      kind: 'cycle',
      relationshipIds: ['r1'],
    });
  });

  it('answers null for a graph with no authored edges and no cycle', () => {
    expect(cycleOf([])).toBeNull();
  });
});
