import { describe, expect, it } from 'bun:test';

import type { ScheduleInput } from './canonical-schedule-input';
import type { PlannedRow } from './derive-numbers';
import { type DependencyEdge, schedule, type Slice, sliceKey } from './schedule';
import type { TypedDependency } from './typed-dependency';
import { withoutHeldSubtrees } from './without-held-subtrees';

let position = 0;
const row = (id: string, parentId: string | null = null): PlannedRow => ({
  id,
  parentId,
  position: (position += 10),
  frozenNumber: null,
  priority: null,
});

const slice = (workItemId: string, days: number, personId: string | null = null): Slice => ({
  workItemId,
  stepId: 'dev',
  days,
  personId,
  width: 1,
  poolIds: [],
});

const edge = (predecessorId: string, successorId: string): DependencyEdge => ({
  predecessorId,
  successorId,
});

const inputOf = (parts: Partial<ScheduleInput> & Pick<ScheduleInput, 'rows' | 'slices'>) => ({
  edges: [],
  notBefore: new Map<string, number>(),
  poolSizes: new Map<string, number>(),
  reach: 'whole-item' as const,
  deadlines: new Map<string, number>(),
  typed: [],
  ...parts,
});

const run = (input: ScheduleInput) =>
  schedule(
    input.rows,
    input.edges,
    input.slices,
    input.notBefore,
    input.poolSizes,
    input.reach,
    input.deadlines,
    input.typed,
  );

const startOf = (placed: ReturnType<typeof run>, workItemId: string): number => {
  const found = placed.slices.get(sliceKey(workItemId, 'dev'));
  if (found === undefined) throw new Error(`no slice for ${workItemId}`);
  return found.earliestStart;
};

describe('withoutHeldSubtrees', () => {
  it('lets a successor start without waiting for held work', () => {
    const input = inputOf({
      rows: [row('a'), row('b')],
      slices: [slice('a', 5), slice('b', 2)],
      edges: [edge('a', 'b')],
    });
    expect(startOf(run(input), 'b')).toBe(5);

    const reduced = withoutHeldSubtrees(input, new Set(['a']));
    expect(reduced.rows.map(({ id }) => id)).toEqual(['b']);
    expect(reduced.slices.map(({ workItemId }) => workItemId)).toEqual(['b']);
    expect(reduced.edges).toEqual([]);
    expect(startOf(run(reduced), 'b')).toBe(0);
  });

  it("frees a held leaf's person for the rest of their queue", () => {
    const input = inputOf({
      rows: [row('a'), row('b')],
      slices: [slice('a', 5, 'kat'), slice('b', 2, 'kat')],
    });
    expect(startOf(run(input), 'b')).toBe(5);
    expect(startOf(run(withoutHeldSubtrees(input, new Set(['a']))), 'b')).toBe(0);
  });

  it('removes a parent whose every leaf is held, with its edges, floor and deadline', () => {
    const input = inputOf({
      rows: [row('x'), row('p'), row('p1', 'p'), row('p2', 'p'), row('y')],
      slices: [slice('x', 1), slice('p1', 3), slice('p2', 4), slice('y', 1)],
      edges: [edge('x', 'p'), edge('p', 'y')],
      notBefore: new Map([
        ['p', 7],
        ['y', 2],
      ]),
      deadlines: new Map([
        ['p', 20],
        ['x', 9],
      ]),
      typed: [
        {
          id: 't1',
          predecessor: { scope: 'descendant-step', workItemId: 'p', stepId: 'dev' },
          successor: { scope: 'whole', workItemId: 'y' },
          type: 'FS',
        },
      ],
    });
    const reduced = withoutHeldSubtrees(input, new Set(['p1', 'p2']));
    expect(reduced.rows.map(({ id }) => id)).toEqual(['x', 'y']);
    expect(reduced.edges).toEqual([]);
    expect(reduced.typed).toEqual([]);
    expect([...reduced.notBefore]).toEqual([['y', 2]]);
    expect([...reduced.deadlines]).toEqual([['x', 9]]);
    const placed = run(reduced);
    expect(placed.workItems.has('p')).toBe(false);
    expect(startOf(placed, 'y')).toBe(2);
  });

  it('keeps a partly held parent and the dependencies that name it', () => {
    const dependency: TypedDependency = {
      id: 't1',
      predecessor: { scope: 'whole', workItemId: 'p' },
      successor: { scope: 'whole', workItemId: 'y' },
      type: 'FS',
    };
    const input = inputOf({
      rows: [row('p'), row('p1', 'p'), row('p2', 'p'), row('y')],
      slices: [slice('p1', 3), slice('p2', 4), slice('y', 1)],
      edges: [edge('p', 'y')],
      notBefore: new Map([['p', 1]]),
      typed: [dependency],
    });
    const reduced = withoutHeldSubtrees(input, new Set(['p2']));
    expect(reduced.rows.map(({ id }) => id)).toEqual(['p', 'p1', 'y']);
    expect(reduced.edges).toEqual([edge('p', 'y')]);
    expect(reduced.typed).toEqual([dependency]);
    expect([...reduced.notBefore]).toEqual([['p', 1]]);
    expect(startOf(run(reduced), 'y')).toBe(4);
  });

  it('drops typed dependencies whose held endpoint is a leaf or one of its step nodes', () => {
    const input = inputOf({
      rows: [row('a'), row('b')],
      slices: [slice('a', 5), slice('b', 2)],
      typed: [
        {
          id: 't1',
          predecessor: { scope: 'node', workItemId: 'a', stepId: 'dev' },
          successor: { scope: 'whole', workItemId: 'b' },
          type: 'SS',
        },
      ],
    });
    expect(withoutHeldSubtrees(input, new Set(['a'])).typed).toEqual([]);
  });

  it('returns the input unchanged when nothing is held', () => {
    const input = inputOf({
      rows: [row('a'), row('b')],
      slices: [slice('a', 5), slice('b', 2)],
      edges: [edge('a', 'b')],
    });
    expect(withoutHeldSubtrees(input, new Set())).toEqual(input);
  });

  it('refuses a held id that is not a leaf of this plan', () => {
    const input = inputOf({
      rows: [row('p'), row('p1', 'p')],
      slices: [slice('p1', 3)],
    });
    expect(() => withoutHeldSubtrees(input, new Set(['p']))).toThrow(
      'held work item p is not a leaf of this plan',
    );
    expect(() => withoutHeldSubtrees(input, new Set(['ghost']))).toThrow(
      'held work item ghost is not a leaf of this plan',
    );
  });
});
