import { describe, expect, it } from 'bun:test';

import type { ScheduleInput } from './canonical-schedule-input';
import type { PlannedRow } from './derive-numbers';
import { validateResolvedRealBoundaries } from './real-boundaries';
import { resolveScheduleInput } from './resolved-schedule-input';
import { schedule, scheduleResolved, type Slice, sliceKey } from './schedule';
import type { StepNodeGraphEdge } from './slice-edges';

const row = (id: string, position: number, priority: number | null = null): PlannedRow => ({
  id,
  position,
  priority,
  parentId: null,
  frozenNumber: null,
});
const slice = (workItemId: string, stepId = 'build', days = 1): Slice => ({
  workItemId,
  stepId,
  days,
  width: 1,
  personId: 'shared',
  poolIds: [],
});
const inputOf = (rows: PlannedRow[], slices: Slice[]): ScheduleInput => ({
  rows,
  slices,
  edges: [],
  notBefore: new Map(),
  deadlines: new Map(),
  poolSizes: new Map(),
  reach: 'whole-item',
  typed: [],
});
const connected = (input: ScheduleInput) => ({
  ...resolveScheduleInput(input),
  order: {
    kind: 'connected' as const,
    projectIdByWorkItem: new Map([
      ['a', 'A'],
      ['b', 'B'],
      ['c', 'C'],
    ]),
    rankByProject: new Map([
      ['A', 0],
      ['B', 1],
      ['C', 1],
    ]),
  },
});
const edge = (
  before: string,
  beforeAt: number,
  after: string,
  afterAt: number,
  type: 'FS' | 'SS' | 'FF' = 'FS',
): StepNodeGraphEdge => ({
  predecessor: { leafId: before, at: beforeAt },
  successor: { leafId: after, at: afterAt },
  type,
  provenance: 'authored',
  relationshipId: `${before}-${after}`,
});
const start = (plan: ReturnType<typeof schedule>, id: string, step: string | null = 'build') => {
  const placed = plan.slices.get(sliceKey(id, step));
  if (placed === undefined) throw new Error('missing placed slice');
  return placed.earliestStart;
};

describe('resolved connected placement', () => {
  it('interleaves A.design B.build A.test', () => {
    const input = connected(
      inputOf([row('a', 0), row('b', 1)], [slice('a', 'design'), slice('a', 'test'), slice('b')]),
    );
    const graph = {
      ...input.graph,
      edges: [...input.graph.edges, edge('a', 0, 'b', 0), edge('b', 0, 'a', 1)],
    };
    const plan = scheduleResolved({ ...input, graph });
    expect([start(plan, 'a', 'design'), start(plan, 'b'), start(plan, 'a', 'test')]).toEqual([
      0, 1, 2,
    ]);
  });
  it('rank precedes local priority only among eligible nodes', () => {
    const input = connected(inputOf([row('b', 0, 1), row('a', 1, 99)], [slice('b'), slice('a')]));
    input.order.projectIdByWorkItem.set('a', 'Z');
    input.order.projectIdByWorkItem.set('b', 'A');
    input.order.rankByProject.set('Z', 0);
    input.order.rankByProject.set('A', 1);
    expect(start(scheduleResolved(input), 'a')).toBe(0);
    const graph = { ...input.graph, edges: [edge('b', 0, 'a', 0)] };
    expect(start(scheduleResolved({ ...input, graph }), 'a')).toBe(1);
  });
  it('bytewise project identity breaks equal ranks', () => {
    const input = connected(inputOf([row('c', 0), row('b', 1)], [slice('c'), slice('b')]));
    expect(start(scheduleResolved(input), 'b')).toBe(0);
  });
  it.each(['FS', 'SS', 'FF'] as const)(
    'retains fractional %s inequalities including negative FF weights',
    (type) => {
      const input = connected(
        inputOf(
          [row('a', 0), row('b', 1)],
          [
            { ...slice('a', 'build', 0.3), personId: null },
            { ...slice('b', 'build', 0.7), personId: null },
          ],
        ),
      );
      const graph = { ...input.graph, edges: [edge('a', 0, 'b', 0, type)] };
      const plan = scheduleResolved({ ...input, graph });
      expect(start(plan, 'b')).toBe(type === 'FS' ? 0.3 : 0);
    },
  );
  it('local adapter and pinned replay preserve placement', () => {
    const input = inputOf([row('a', 0), row('b', 1)], [slice('a'), slice('b')]);
    const legacy = schedule(input.rows, input.edges, input.slices);
    expect(scheduleResolved(resolveScheduleInput(input))).toEqual(legacy);
    const pins = new Map([...legacy.slices].map(([key, placed]) => [key, placed.earliestStart]));
    expect(scheduleResolved(resolveScheduleInput(input), pins)).toEqual(legacy);
  });
  it.each([
    'missing',
    'extra',
    'duplicate',
    'step',
    'position',
    'endpoint',
    'foreign-endpoint',
  ] as const)('refuses %s graph facts instead of changing node meaning', (fault) => {
    const input = connected(inputOf([row('a', 0), row('b', 1)], [slice('a'), slice('b')]));
    const graph = { nodes: [...input.graph.nodes], edges: [...input.graph.edges] };
    if (fault === 'missing') graph.nodes.pop();
    if (fault === 'duplicate') graph.nodes.push(graph.nodes[0]);
    if (fault === 'foreign-endpoint') graph.edges.push(edge('foreign', 0, 'b', 0));
    if (fault === 'extra')
      graph.nodes.push({ kind: 'step', ref: { workItemId: 'foreign', stepId: 'build' }, at: 0 });
    if (fault === 'step')
      graph.nodes[0] = { kind: 'step', ref: { workItemId: 'a', stepId: 'wrong' }, at: 0 };
    if (fault === 'position')
      graph.nodes[0] = { kind: 'step', ref: { workItemId: 'a', stepId: 'build' }, at: 1 };
    if (fault === 'endpoint') graph.edges.push(edge('a', 1, 'b', 0));
    expect(() => scheduleResolved({ ...input, graph })).toThrow('resolved graph');
  });
});

it.each(['ownership', 'rank', 'nonfinite'] as const)(
  'refuses missing or invalid connected %s even for one node',
  (fault) => {
    const input = connected(inputOf([row('a', 0)], [slice('a')]));
    if (fault === 'ownership') input.order.projectIdByWorkItem.delete('a');
    if (fault === 'rank') input.order.rankByProject.delete('A');
    if (fault === 'nonfinite') input.order.rankByProject.set('A', NaN);
    expect(() => scheduleResolved(input)).toThrow('resolved order');
  },
);

it.each(['FS', 'SS', 'FF'] as const)('rejects a violated resolved %s real boundary', (type) => {
  const input = connected(
    inputOf(
      [row('a', 0), row('b', 1)],
      [
        { ...slice('a', 'build', 0.3), personId: null },
        { ...slice('b', 'build', 0.7), personId: null },
      ],
    ),
  );
  const graph = { ...input.graph, edges: [edge('a', 0, 'b', 0, type)] };
  const resolved = { ...input, graph, notBefore: new Map([['a', 1]]) };
  const plan = scheduleResolved(resolved);
  const after = plan.slices.get(sliceKey('b', 'build'));
  if (after === undefined) throw new Error('missing placed slice');
  plan.slices.set(sliceKey('b', 'build'), { ...after, earliestStart: 0, earliestFinish: 0.7 });
  expect(() => {
    validateResolvedRealBoundaries(resolved, plan);
  }).toThrow(`violates ${type} real boundary`);
});

it('preserves connected pinned chronology when rank prefers the later booking', () => {
  const input = connected(inputOf([row('a', 0), row('b', 1)], [slice('a'), slice('b')]));
  const pins = new Map([
    [sliceKey('a', 'build'), 1],
    [sliceKey('b', 'build'), 0],
  ]);
  const plan = scheduleResolved(input, pins);
  expect([start(plan, 'a'), start(plan, 'b')]).toEqual([1, 0]);
});

it('local priority cannot admit a successor before its lower priority prerequisite', () => {
  const input = connected(inputOf([row('a', 0, 1), row('b', 1, 99)], [slice('a'), slice('b')]));
  input.order.projectIdByWorkItem.set('b', 'A');
  const graph = { ...input.graph, edges: [edge('b', 0, 'a', 0)] };
  expect(start(scheduleResolved({ ...input, graph }), 'a')).toBe(1);
});

it('keeps zero-duration stepless boundaries and refuses a step in their place', () => {
  const input = connected(inputOf([row('a', 0)], [{ ...slice('a'), stepId: null, days: null }]));
  expect(start(scheduleResolved(input), 'a', null)).toBe(0);
  const graph = {
    ...input.graph,
    nodes: [{ kind: 'step' as const, ref: { workItemId: 'a', stepId: 'build' }, at: 0 }],
  };
  expect(() => scheduleResolved({ ...input, graph })).toThrow('resolved graph');
});

it('empty connected component accepts required empty maps', () => {
  const input = {
    ...resolveScheduleInput(inputOf([], [])),
    order: {
      kind: 'connected' as const,
      projectIdByWorkItem: new Map<string, string>(),
      rankByProject: new Map<string, number>(),
    },
  };
  const plan = scheduleResolved(input);
  expect(plan.slices.size).toBe(0);
  expect(plan.workItems.size).toBe(0);
  expect(plan.waitingForPerson).toBe(0);
  expect(plan.waitingForCapacity).toBe(0);
});
