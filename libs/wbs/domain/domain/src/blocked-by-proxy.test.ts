import { describe, expect, it } from 'bun:test';

import { blockedByProxyOf } from './blocked-by-proxy';
import type { PlannedRow } from './derive-numbers';
import type { LeafStatus } from './progress';
import { type DependencyEdge, indexTree } from './schedule';
import type { DependencyEndpoint, TypedDependency } from './typed-dependency';

let position = 0;
const row = (id: string, parentId: string | null = null): PlannedRow => ({
  id,
  parentId,
  position: (position += 10),
  frozenNumber: null,
  priority: null,
});

const edge = (predecessorId: string, successorId: string): DependencyEdge => ({
  predecessorId,
  successorId,
});

const typed = (
  id: string,
  predecessor: DependencyEndpoint,
  successor: DependencyEndpoint,
): TypedDependency => ({ id, predecessor, successor, type: 'SS' });

const read = (
  rows: readonly PlannedRow[],
  statuses: Record<string, LeafStatus>,
  edges: readonly DependencyEdge[] = [],
  typedDependencies: readonly TypedDependency[] = [],
) =>
  Object.fromEntries(
    blockedByProxyOf(
      indexTree(rows),
      { edges, typed: typedDependencies },
      new Map(Object.entries(statuses)),
    ),
  );

describe('blockedByProxyOf', () => {
  it('marks a successor of held work blocked by proxy', () => {
    expect(read([row('a'), row('b')], { a: 'on_hold', b: 'ready' }, [edge('a', 'b')])).toEqual({
      a: 'on_hold',
      b: 'blocked_by_proxy',
    });
  });

  it('marks C behind a held A through B', () => {
    expect(
      read([row('a'), row('b'), row('c')], { a: 'on_hold', b: 'unknown', c: 'draft' }, [
        edge('a', 'b'),
        edge('b', 'c'),
      ]),
    ).toEqual({ a: 'on_hold', b: 'blocked_by_proxy', c: 'blocked_by_proxy' });
  });

  it('stops at running or finished work', () => {
    const rows = [row('a'), row('b'), row('c'), row('d'), row('e')];
    expect(
      read(rows, { a: 'blocked', b: 'in_progress', c: 'unknown', d: 'done', e: 'unknown' }, [
        edge('a', 'b'),
        edge('b', 'c'),
        edge('a', 'd'),
        edge('d', 'e'),
      ]),
    ).toEqual({ a: 'blocked', b: 'in_progress', c: 'unknown', d: 'done', e: 'unknown' });
  });

  it('leaves a held successor its own hold', () => {
    expect(read([row('a'), row('b')], { a: 'blocked', b: 'on_hold' }, [edge('a', 'b')])).toEqual({
      a: 'blocked',
      b: 'on_hold',
    });
  });

  it('expands a parent successor to every leaf beneath it', () => {
    const rows = [row('a'), row('p'), row('p1', 'p'), row('p2', 'p')];
    expect(read(rows, { a: 'blocked', p1: 'unknown', p2: 'ready' }, [edge('a', 'p')])).toEqual({
      a: 'blocked',
      p1: 'blocked_by_proxy',
      p2: 'blocked_by_proxy',
    });
  });

  it('reads typed dependencies of every scope beside legacy ones', () => {
    const rows = [row('a'), row('p'), row('p1', 'p'), row('p2', 'p'), row('b'), row('c')];
    expect(
      read(
        rows,
        { a: 'on_hold', p1: 'unknown', p2: 'unknown', b: 'unknown', c: 'unknown' },
        [],
        [
          typed(
            't1',
            { scope: 'node', workItemId: 'a', stepId: 'dev' },
            {
              scope: 'descendant-step',
              workItemId: 'p',
              stepId: 'qa',
            },
          ),
          typed('t2', { scope: 'whole', workItemId: 'p' }, { scope: 'whole', workItemId: 'b' }),
        ],
      ),
    ).toEqual({
      a: 'on_hold',
      p1: 'blocked_by_proxy',
      p2: 'blocked_by_proxy',
      b: 'blocked_by_proxy',
      c: 'unknown',
    });
  });

  it('terminates on a leaf-level cycle an acyclic step-node graph permits', () => {
    // A.dev → B.dev and B.qa → A.qa is a valid step-node DAG whose work items
    // depend on each other.
    const rows = [row('a'), row('b'), row('c')];
    const crossing = [
      typed(
        't1',
        { scope: 'node', workItemId: 'a', stepId: 'dev' },
        {
          scope: 'node',
          workItemId: 'b',
          stepId: 'dev',
        },
      ),
      typed(
        't2',
        { scope: 'node', workItemId: 'b', stepId: 'qa' },
        {
          scope: 'node',
          workItemId: 'a',
          stepId: 'qa',
        },
      ),
    ];
    expect(
      read(rows, { a: 'unknown', b: 'unknown', c: 'blocked' }, [edge('c', 'a')], crossing),
    ).toEqual({ a: 'blocked_by_proxy', b: 'blocked_by_proxy', c: 'blocked' });
    // With no hold behind it the cycle reads as itself: the least fixed point,
    // not the self-sustaining one in which both leaves block each other.
    expect(read(rows, { a: 'unknown', b: 'ready', c: 'unknown' }, [], crossing)).toEqual({
      a: 'unknown',
      b: 'ready',
      c: 'unknown',
    });
  });

  it('refuses a leaf with no status', () => {
    expect(() => read([row('a'), row('p'), row('p1', 'p')], { a: 'unknown' })).toThrow(
      'no status for leaf p1',
    );
  });

  it('refuses a status for anything but a leaf', () => {
    // A parent's status is folded from its children; one handed in beside
    // them is a caller reading another plan, or stored state on a parent.
    expect(() =>
      read([row('a'), row('p'), row('p1', 'p')], { a: 'unknown', p1: 'unknown', p: 'ready' }),
    ).toThrow('status for p, which is not a leaf');
  });

  it('refuses a dependency naming a work item the tree does not hold', () => {
    expect(() => read([row('a')], { a: 'unknown' }, [edge('ghost', 'a')])).toThrow(
      'no work item ghost in this plan',
    );
  });
});
