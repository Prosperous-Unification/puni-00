import type { Hold, ProgressStatus, Readiness } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import type { WorkItem } from '../ports/work-item-store';
import { workItemRow } from '../testing/work-item-fixture';
import { workItemStatusesOf } from './work-item-statuses';

let position = 0;
const row = (
  id: string,
  parentId: string | null,
  said: { readiness?: Readiness; hold?: Hold } = {},
): WorkItem =>
  workItemRow({
    id,
    parentId,
    position: (position += 10),
    readiness: said.readiness ?? null,
    hold: said.hold ?? null,
  });

const read = (
  rows: readonly WorkItem[],
  progress: Record<string, ProgressStatus>,
  edges: readonly [string, string][] = [],
) =>
  Object.fromEntries(
    workItemStatusesOf(rows, new Map(Object.entries(progress)), {
      edges: edges.map(([predecessorId, successorId]) => ({ predecessorId, successorId })),
      typed: [],
    }),
  );

describe('workItemStatusesOf', () => {
  it('reads each leaf from its progress, hold and readiness, and each parent from its children', () => {
    const rows = [
      row('p', null),
      row('a', 'p', { readiness: 'ready', hold: 'on_hold' }),
      row('b', 'p', { readiness: 'draft' }),
      row('c', null, { hold: 'blocked' }),
    ];
    expect(read(rows, { a: 'in_progress', b: 'unknown', c: 'done' })).toEqual({
      p: 'draft',
      a: 'on_hold',
      b: 'draft',
      c: 'done',
    });
  });

  it('marks a successor of held work blocked by proxy, through the dependency graph', () => {
    const rows = [row('a', null, { hold: 'blocked' }), row('b', null), row('c', null)];
    expect(
      read(rows, { a: 'unknown', b: 'unknown', c: 'unknown' }, [
        ['a', 'b'],
        ['b', 'c'],
      ]),
    ).toEqual({
      a: 'blocked',
      b: 'blocked_by_proxy',
      c: 'blocked_by_proxy',
    });
  });

  it('refuses a readiness or hold stored on a parent', () => {
    const rows = [row('p', null, { hold: 'on_hold' }), row('a', 'p')];
    expect(() => read(rows, { a: 'unknown' })).toThrow('parent p holds a readiness or a hold');
  });

  it('refuses a leaf with no progress reading', () => {
    expect(() => read([row('a', null)], {})).toThrow('no progress reading for leaf a');
  });
});
