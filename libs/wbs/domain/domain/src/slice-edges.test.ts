import { describe, expect, it } from 'bun:test';

import type { GraphSlice, LeafEdge, StepNodeGraphEdge } from './slice-edges';
import { reachedSliceOf, resolveStepNodeGraph } from './slice-edges';

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
