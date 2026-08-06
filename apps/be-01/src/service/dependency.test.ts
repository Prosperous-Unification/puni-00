import { describe, expect, it } from 'bun:test';

import type { StoredDependency, WorkItem } from '../repository';
import { canDepend, type DependencyRefusal } from './dependency';

let position = 0;
const item = (id: string, parentId: string | null = null): WorkItem => ({
  id,
  projectId: 'p1',
  parentId,
  position: (position += 10),
  name: id,
  notes: '',
  frozenNumber: null,
});

const edge = (predecessorId: string, successorId: string): StoredDependency => ({
  id: `${predecessorId}->${successorId}`,
  projectId: 'p1',
  predecessorId,
  successorId,
});

/**
 * ```
 * phase          (parent)
 *   early
 *   late
 * after
 * loose
 * ```
 */
const ROWS: WorkItem[] = [
  item('phase'),
  item('early', 'phase'),
  item('late', 'phase'),
  item('after'),
  item('loose'),
];

const check = (
  predecessorId: string,
  successorId: string,
  existing: StoredDependency[] = [],
): DependencyRefusal | null => canDepend(ROWS, existing, predecessorId, successorId);

describe('canDepend', () => {
  it('allows an edge between two unrelated work items', () => {
    expect(check('after', 'loose')).toBeNull();
  });

  it('allows an edge onto a parent, which is the point of declaring one there', () => {
    expect(check('phase', 'after')).toBeNull();
    expect(check('after', 'phase')).toBeNull();
  });

  it('refuses a work item depending on itself', () => {
    expect(check('after', 'after')).toBe('ancestor');
  });

  it('refuses a work item depending on its own parent', () => {
    // A parent already spans its children. Asking it to wait for one of them is
    // asking it to start after itself.
    expect(check('phase', 'early')).toBe('ancestor');
  });

  it('refuses a work item depending on its own child', () => {
    expect(check('early', 'phase')).toBe('ancestor');
  });

  it('allows two siblings to depend on each other', () => {
    expect(check('early', 'late')).toBeNull();
  });

  it('refuses an edge that closes a cycle', () => {
    // `after` already comes before `loose`; making `loose` come before `after`
    // is a plan in which neither can start.
    expect(check('loose', 'after', [edge('after', 'loose')])).toBe('cycle');
  });

  it('refuses a cycle closed through three work items', () => {
    const existing = [edge('after', 'loose'), edge('loose', 'early')];

    expect(check('early', 'after', existing)).toBe('cycle');
  });

  it('allows a diamond, which is not a cycle', () => {
    // after → early, after → late, early → loose. Adding late → loose joins the
    // two branches back together and closes nothing.
    const existing = [edge('after', 'early'), edge('after', 'late'), edge('early', 'loose')];

    expect(check('late', 'loose', existing)).toBeNull();
  });

  it('refuses a work item that is not in the project', () => {
    expect(check('ghost', 'after')).toBe('not_found');
    expect(check('after', 'ghost')).toBe('not_found');
  });

  it('follows the tree when a cycle runs through a parent', () => {
    // `phase → after` means both leaves under `phase` come first. Adding
    // `after → early` puts `early` after something that waits for `early`.
    expect(check('after', 'early', [edge('phase', 'after')])).toBe('cycle');
  });
});
