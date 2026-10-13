import type { StepNodeGraph, StepNodeGraphEdge } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { type NodeReadingInputs, nodeReadingsOf, projectNodeReadings } from './node-readings';

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
    blocked: [],
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
      stated: [],
    });

    expect(read).toEqual(new Map([['a', {}]]));
  });

  it('projects a stored authored cycle without inventing a proxy root', () => {
    const back: StepNodeGraphEdge = {
      ...edge(['a', 1], ['a', 0], 'workflow'),
      type: 'FS',
      provenance: 'authored',
      relationshipId: 'r1',
    };
    expect(nodeReadingsOf(inputs([back], { stated: [] })).get('a')).toEqual({
      dev: 'unknown',
      qa: 'unknown',
    });
  });

  it('converges roots around a stored legacy cycle and preserves running barriers', () => {
    const cycle = [edge(['a', 1], ['b', 0], 'legacy'), edge(['b', 1], ['a', 0], 'legacy')];
    const projection = projectNodeReadings(
      inputs(cycle, {
        stated: [],
        blocked: [{ workItemId: 'a', stepId: 'dev' }],
      }),
    );
    expect(projection.readings.get('a')).toEqual({ dev: 'blocked', qa: 'blocked_by_proxy' });
    expect(projection.readings.get('b')).toEqual({
      dev: 'blocked_by_proxy',
      qa: 'blocked_by_proxy',
    });
    expect(projection.causes.get('b')?.['qa']).toEqual([{ kind: 'step', nodeId: 'sn1.a.dev' }]);
    expect(
      projectNodeReadings(
        inputs(cycle, {
          stated: [],
          blocked: [{ workItemId: 'a', stepId: 'dev' }],
          running: [{ workItemId: 'b', stepId: 'dev' }],
        }),
      ).readings.get('b'),
    ).toEqual({ dev: 'in_progress', qa: 'unknown' });
  });

  it('propagates a direct row hold around a cycle and into downstream nodes', () => {
    const original = inputs();
    const projection = projectNodeReadings({
      ...original,
      stated: [],
      graph: {
        nodes: [...original.graph.nodes, stepNode('c', 'dev', 0)],
        edges: [
          ...original.graph.edges,
          edge(['a', 1], ['b', 0], 'legacy'),
          edge(['b', 1], ['a', 0], 'legacy'),
          edge(['b', 1], ['c', 0], 'legacy'),
        ],
      },
      holdOf: new Map([
        ['a', 'blocked'],
        ['b', null],
        ['c', null],
      ]),
      statusOf: new Map([
        ['a', 'blocked'],
        ['b', 'blocked_by_proxy'],
        ['c', 'blocked_by_proxy'],
      ]),
    });
    expect(projection.readings.get('c')).toEqual({ dev: 'blocked_by_proxy' });
    expect(projection.causes.get('c')?.['dev']).toEqual([{ kind: 'step', nodeId: 'sn1.a.qa' }]);
  });

  it('converges an external root through a silent cycle and into downstream work', () => {
    const original = inputs();
    const projection = projectNodeReadings({
      ...original,
      stated: [],
      blocked: [{ workItemId: 'c', stepId: 'dev' }],
      graph: {
        nodes: [...original.graph.nodes, stepNode('c', 'dev', 0), stepNode('d', 'dev', 0)],
        edges: [
          ...original.graph.edges,
          edge(['c', 0], ['a', 0], 'legacy'),
          edge(['a', 1], ['b', 0], 'legacy'),
          edge(['b', 1], ['a', 0], 'legacy'),
          edge(['b', 1], ['d', 0], 'legacy'),
        ],
      },
      holdOf: new Map([
        ['a', null],
        ['b', null],
        ['c', null],
        ['d', null],
      ]),
      statusOf: new Map([
        ['a', 'blocked_by_proxy'],
        ['b', 'blocked_by_proxy'],
        ['c', 'unknown'],
        ['d', 'blocked_by_proxy'],
      ]),
    });
    expect(projection.readings.get('d')).toEqual({ dev: 'blocked_by_proxy' });
    expect(projection.causes.get('d')?.['dev']).toEqual([{ kind: 'step', nodeId: 'sn1.c.dev' }]);
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

describe('step blockage projection', () => {
  it('propagates direct roots through workflow and legacy edges without changing waiting', () => {
    const projection = projectNodeReadings(
      inputs([edge(['a', 1], ['b', 0], 'legacy')], {
        stated: [],
        blocked: [{ workItemId: 'a', stepId: 'dev' }],
      }),
    );
    expect(projection.readings.get('a')).toEqual({ dev: 'blocked', qa: 'blocked_by_proxy' });
    expect(projection.readings.get('b')).toEqual({
      dev: 'blocked_by_proxy',
      qa: 'blocked_by_proxy',
    });
    expect(projection.causes.get('b')?.['qa']).toEqual([{ kind: 'step', nodeId: 'sn1.a.dev' }]);
  });

  it('does not spread a sibling blockage through a different typed endpoint or row proxy', () => {
    const authored: StepNodeGraphEdge = {
      ...edge(['a', 0], ['b', 0], 'workflow'),
      provenance: 'authored',
      relationshipId: 'r1',
    };
    const projection = projectNodeReadings(
      inputs([authored], {
        blocked: [{ workItemId: 'a', stepId: 'qa' }],
        statusOf: new Map([
          ['a', 'in_progress'],
          ['b', 'blocked_by_proxy'],
        ]),
      }),
    );
    expect(projection.readings.get('b')).toEqual({ dev: 'waiting', qa: 'unknown' });
    expect(projection.causes.get('b')?.['dev']).toEqual([]);
  });

  it('stops incoming propagation at statements and running attempts', () => {
    for (const runningAttempt of [false, true]) {
      const projection = projectNodeReadings(
        inputs([edge(['a', 0], ['b', 0], 'legacy')], {
          blocked: [{ workItemId: 'a', stepId: 'dev' }],
          stated: runningAttempt ? [] : [{ workItemId: 'b', stepId: 'dev', state: 'in_progress' }],
          running: runningAttempt ? [{ workItemId: 'b', stepId: 'dev' }] : [],
        }),
      );
      expect(projection.readings.get('b')).toEqual({ dev: 'in_progress', qa: 'unknown' });
      expect(projection.causes.get('b')?.['qa']).toEqual([]);
    }
  });

  it('propagates FS SS and FF as informational causes', () => {
    for (const type of ['FS', 'SS', 'FF'] as const) {
      const projection = projectNodeReadings(
        inputs(
          [
            {
              ...edge(['a', 0], ['b', 0], 'workflow'),
              provenance: 'authored',
              relationshipId: 'r',
              type,
            },
          ],
          { stated: [], blocked: [{ workItemId: 'a', stepId: 'dev' }] },
        ),
      );
      expect(projection.readings.get('b')?.['dev']).toBe('blocked_by_proxy');
    }
  });

  it('traverses held stepless boundaries without exposing a public step', () => {
    const projection = projectNodeReadings(
      inputs([], {
        graph: {
          nodes: [{ kind: 'boundary', workItemId: 'a', at: 0 }, stepNode('b', 'dev', 0)],
          edges: [edge(['a', 0], ['b', 0], 'legacy')],
        },
        holdOf: new Map([
          ['a', 'on_hold'],
          ['b', null],
        ]),
        stated: [],
      }),
    );
    expect(projection.readings.get('a')).toEqual({});
    expect(projection.readings.get('b')).toEqual({ dev: 'blocked_by_proxy' });
    expect(projection.causes.get('b')?.['dev']).toEqual([{ kind: 'work-item', workItemId: 'a' }]);
  });

  it('deduplicates roots through a diamond and sorts independent roots', () => {
    const projection = projectNodeReadings(
      inputs([edge(['a', 0], ['b', 1], 'legacy'), edge(['a', 1], ['b', 1], 'legacy')], {
        stated: [],
        blocked: [
          { workItemId: 'a', stepId: 'dev' },
          { workItemId: 'b', stepId: 'dev' },
        ],
      }),
    );
    expect(projection.causes.get('b')?.['qa']).toEqual([
      { kind: 'step', nodeId: 'sn1.a.dev' },
      { kind: 'step', nodeId: 'sn1.b.dev' },
    ]);
  });

  it('refuses duplicate node identities even at distinct graph positions', () => {
    const original = inputs();
    expect(() =>
      projectNodeReadings({
        ...original,
        graph: {
          ...original.graph,
          nodes: [...original.graph.nodes, stepNode('a', 'dev', 2)],
        },
      }),
    ).toThrow(/duplicate step node/);
  });

  it('refuses distinct step identities sharing one graph position', () => {
    const original = inputs();
    expect(() =>
      projectNodeReadings({
        ...original,
        graph: {
          ...original.graph,
          nodes: [...original.graph.nodes, stepNode('a', 'extra', 0)],
        },
      }),
    ).toThrow(/duplicate step node/);
  });

  it('refuses missing legacy endpoints even when their successor is done', () => {
    expect(() => projectNodeReadings(inputs([edge(['gone', 0], ['a', 0], 'legacy')]))).toThrow(
      /gone#0.*no.*node/,
    );
  });

  it('refuses an absent successor before projecting any visible node', () => {
    expect(() => projectNodeReadings(inputs([edge(['a', 0], ['gone', 0], 'legacy')]))).toThrow(
      /gone#0.*no.*node/,
    );
  });

  it('refuses blockage outside the graph instead of silently dropping it', () => {
    expect(() =>
      projectNodeReadings(
        inputs([], {
          blocked: [{ workItemId: 'a', stepId: 'gone' }],
        }),
      ),
    ).toThrow(/blockage.*no step node/);
  });
});

it('retains known parent progress outside the leaf node projection', () => {
  const original = inputs();
  const projected = projectNodeReadings({
    ...original,
    holdOf: new Map([...original.holdOf, ['parent', null]]),
    statusOf: new Map([...original.statusOf, ['parent', 'in_progress']]),
    stated: [...original.stated, { workItemId: 'parent', stepId: 'dev', state: 'done' }],
  });
  expect(projected.readings.has('parent')).toBe(false);
  expect(projected.readings.get('a')).toEqual({ dev: 'done', qa: 'waiting' });
});

it('refuses unknown progress owners and steps without hiding them as parent compatibility', () => {
  expect(() =>
    projectNodeReadings(
      inputs([], { stated: [{ workItemId: 'gone', stepId: 'dev', state: 'done' }] }),
    ),
  ).toThrow(/progress.*unknown work item/);
  expect(() =>
    projectNodeReadings(
      inputs([], { stated: [{ workItemId: 'a', stepId: 'gone', state: 'done' }] }),
    ),
  ).toThrow(/progress.*unknown step/);
});
