import type { StepNodeGraph, StepNodeGraphEdge } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { type NodeReadingInputs, nodeReadingsOf } from './node-readings';

const stepNode = (workItemId: string, stepId: string, at: number) =>
  ({ kind: 'step', ref: { workItemId, stepId }, at }) as const;

const edge = (
  from: [string, number],
  to: [string, number],
  provenance: 'workflow' | 'legacy',
): StepNodeGraphEdge => ({
  predecessor: { leafId: from[0], at: from[1] },
  successor: { leafId: to[0], at: to[1] },
  type: 'FS',
  provenance,
});

/** Two leaves of Dev then QA, chained by workflow, with `extra` edges. */
function inputs(
  extra: StepNodeGraphEdge[] = [],
  overrides: Partial<NodeReadingInputs> = {},
): NodeReadingInputs {
  const graph: StepNodeGraph = {
    nodes: [
      stepNode('a', 'dev', 0),
      stepNode('a', 'qa', 1),
      stepNode('b', 'dev', 0),
      stepNode('b', 'qa', 1),
    ],
    edges: [edge(['a', 0], ['a', 1], 'workflow'), edge(['b', 0], ['b', 1], 'workflow'), ...extra],
  };
  return {
    graph,
    holdOf: new Map([
      ['a', null],
      ['b', null],
    ]),
    statusOf: new Map([
      ['a', 'in_progress'],
      ['b', 'unknown'],
    ]),
    stated: [{ workItemId: 'a', stepId: 'dev', state: 'done' }],
    running: [],
    ...overrides,
  };
}

describe('nodeReadingsOf', () => {
  it('reads each leaf in step order, a QA after a done Dev waiting', () => {
    expect(nodeReadingsOf(inputs())).toEqual(
      new Map([
        ['a', { dev: 'done', qa: 'waiting' }],
        ['b', { dev: 'unknown', qa: 'unknown' }],
      ]),
    );
  });

  it('never reads a legacy join as a predecessor', () => {
    const read = nodeReadingsOf(inputs([edge(['a', 0], ['b', 0], 'legacy')]));

    expect(read.get('b')).toEqual({ dev: 'unknown', qa: 'unknown' });
  });

  it('leaves a stepless leaf an empty map', () => {
    const read = nodeReadingsOf({
      ...inputs(),
      graph: { nodes: [{ kind: 'boundary', workItemId: 'a', at: 0 }], edges: [] },
    });

    expect(read).toEqual(new Map([['a', {}]]));
  });

  /**
   * Proof: the `asking` guard removed and this failed on `Maximum call stack
   * size exceeded` instead of the named circle; watched 2026-10-12.
   */
  it('throws on a circle the workflow and authored edges close', () => {
    const back: StepNodeGraphEdge = {
      ...edge(['a', 1], ['a', 0], 'workflow'),
      type: 'FS',
      provenance: 'authored',
      relationshipId: 'r1',
    };

    expect(() => nodeReadingsOf(inputs([back]))).toThrow(/runs in a circle/);
  });

  it('throws on an edge naming a node the graph does not hold', () => {
    expect(() => nodeReadingsOf(inputs([edge(['gone', 0], ['b', 0], 'workflow')]))).toThrow(
      /gone#0, which is no step node/,
    );
  });

  it('throws on a leaf with no row on the plan', () => {
    expect(() => nodeReadingsOf(inputs([], { holdOf: new Map([['a', null]]) }))).toThrow(
      /leaf b has a step node and no row/,
    );
    expect(() => nodeReadingsOf(inputs([], { statusOf: new Map([['a', 'in_progress']]) }))).toThrow(
      /leaf b has a step node and no row/,
    );
  });
});
