import { describe, expect, it } from 'bun:test';

import { executionEligibilityOf } from './execution-eligibility';
import { sliceKey } from './schedule';
import type { StepNodeGraph, StepNodeGraphEdge } from './slice-edges';

const graph = (
  type: 'FS' | 'SS' | 'FF',
  provenance: 'authored' | 'workflow' | 'legacy' = 'authored',
): StepNodeGraph => ({
  nodes: [
    { kind: 'step', ref: { workItemId: 'a', stepId: 'dev' }, at: 0 },
    { kind: 'step', ref: { workItemId: 'b', stepId: 'qa' }, at: 0 },
  ],
  edges: [
    {
      predecessor: { leafId: 'a', at: 0 },
      successor: { leafId: 'b', at: 0 },
      type,
      provenance,
      ...(provenance === 'authored' ? { relationshipId: 'ab' } : {}),
    } as StepNodeGraphEdge,
  ],
});
const evidence = (started = false, done = false) =>
  new Map([
    [sliceKey('a', 'dev'), { started, done }],
    [sliceKey('b', 'qa'), { started: false, done: false }],
  ]);
const successor = (type: 'FS' | 'SS' | 'FF', started = false, done = false) => {
  const eligibility = executionEligibilityOf(graph(type), evidence(started, done)).get(
    sliceKey('b', 'qa'),
  );
  if (eligibility === undefined) throw new Error('missing successor');
  return eligibility;
};

describe('execution eligibility', () => {
  it('FS requires completion, including workflow and legacy edges', () => {
    for (const provenance of ['authored', 'workflow', 'legacy'] as const) {
      expect(
        executionEligibilityOf(graph('FS', provenance), evidence(true)).get(sliceKey('b', 'qa'))
          ?.canStart,
      ).toBe(false);
    }
    expect(successor('FS', true, true).canStart).toBe(true);
    expect(successor('FS').startBlockers[0]).toMatchObject({
      predecessor: graph('FS').nodes[0],
      edge: { type: 'FS', provenance: 'authored', relationshipId: 'ab' },
    });
  });
  it('SS requires actual start and FF leaves start free with a finish condition', () => {
    expect(successor('SS').canStart).toBe(false);
    expect(successor('SS', true).canStart).toBe(true);
    expect(successor('SS', false, true).canStart).toBe(true);
    expect(successor('FF')).toMatchObject({ canStart: true, canFinish: false, startBlockers: [] });
    expect(successor('FF', true).canFinish).toBe(false);
    expect(successor('FF', true, true).canFinish).toBe(true);
  });
  it('refuses absent intrinsic evidence and absent positional endpoints', () => {
    expect(() => executionEligibilityOf(graph('FS'), new Map())).toThrow('evidence');
    const malformed = graph('FS');
    malformed.edges[0] = { ...malformed.edges[0], predecessor: { leafId: 'missing', at: 0 } };
    expect(() => executionEligibilityOf(malformed, evidence())).toThrow('endpoint');
  });
  it('uses row evidence for a stepless boundary without manufacturing done', () => {
    const held = graph('FS');
    held.nodes[0] = { kind: 'boundary', workItemId: 'a', at: 0 };
    const facts = new Map([
      [sliceKey('a', null), { started: false, done: false }],
      [sliceKey('b', 'qa'), { started: false, done: false }],
    ]);
    expect(executionEligibilityOf(held, facts).get(sliceKey('b', 'qa'))?.canStart).toBe(false);
  });
});
