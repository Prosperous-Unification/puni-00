import type { WorkItemTree } from '@wbs/contracts';
import { describe, expect, test } from 'bun:test';

import { decodeCursor, encodeCursor, pageQueryOf } from './list-query';
import { pageWorkItems, type WorkItemPageQuery, workItemPageQueryOf } from './work-item-page';

type TreeWorkItem = WorkItemTree['workItems'][number];
type TreeSlice = WorkItemTree['slices'][number];

function workItem(
  id: string,
  parentId: string | null,
  extra: Partial<TreeWorkItem> = {},
): TreeWorkItem {
  return {
    id,
    projectId: 'p',
    parentId,
    position: 0,
    name: id,
    notes: `notes of ${id}`,
    frozenNumber: null,
    startNoEarlierThan: null,
    startNoEarlierThanReason: null,
    deadline: null,
    factStart: null,
    factEnd: null,
    readiness: null,
    hold: null,
    priority: null,
    serviceTeamId: null,
    serviceId: null,
    maxParallel: 1,
    revision: 0,
    teamIds: [],
    tagIds: [],
    serviceIds: [],
    typeIds: [],
    externalRefs: [],
    number: id,
    estimates: {},
    rolledUp: false,
    actuals: {},
    progress: {},
    status: 'unknown',
    measures: {},
    dependsOn: [],
    finalDays: {},
    finalTotal: 0,
    schedule: null,
    dates: null,
    assignees: {},
    doesEveryStep: null,
    ...extra,
  };
}

function sliceOf(workItemId: string): TreeSlice {
  return {
    duration: 1,
    estimated: true,
    earliestStart: 0,
    earliestFinish: 1,
    latestStart: 0,
    latestFinish: 1,
    float: 0,
    critical: true,
    id: `s-${workItemId}`,
    workItemId,
    stepId: null,
    personId: null,
    boundBy: 'projectStart',
    resourcePredecessorId: null,
    capacityPredecessorIds: [],
    capacityTeamId: null,
    width: 1,
    effort: 1,
    lateBy: null,
  };
}

// 010 { 010.1 { 010.1.1 }, 010.2 }, 020, 030 { 030.1 }, 040 — tree order.
const tree = {
  workItems: [
    workItem('010', null, { status: 'in_progress', name: 'Roof' }),
    workItem('010.1', '010', { status: 'in_progress' }),
    workItem('010.1.1', '010.1', { status: 'done' }),
    workItem('010.2', '010', { status: 'ready' }),
    workItem('020', null, { name: 'roofline' }),
    workItem('030', null),
    workItem('030.1', '030', { status: 'done' }),
    workItem('040', null),
  ],
  slices: [sliceOf('010.1.1'), sliceOf('010.2')],
};
const instants = new Map(
  tree.workItems.map((each, index) => [each.id, index < 7 ? 100 + index : null]),
);

function queryOf(search: string): WorkItemPageQuery | null {
  const url = new URL(`http://localhost/rows?${search}`);
  const input = Object.fromEntries(url.searchParams);
  const common = pageQueryOf(input, url);
  return common === null ? null : workItemPageQueryOf(common, input);
}

function page(search: string) {
  const query = queryOf(search);
  if (query === null) throw new Error(`refused ${search}`);
  return pageWorkItems(tree, instants, query);
}

const ids = (search: string): string[] => {
  const answered = page(search);
  if (!answered.ok) throw new Error(answered.refusal);
  return answered.rows.map((row) => row.id);
};

/** Follows `nextCursor` to the end, answering each page's ids. */
function walk(search: string): string[][] {
  const pages: string[][] = [];
  let cursor: string | null = null;
  for (;;) {
    const answered = page(cursor === null ? search : `${search}&cursor=${cursor}`);
    if (!answered.ok) throw new Error(answered.refusal);
    pages.push(answered.rows.map((row) => row.id));
    if (answered.nextCursor === null) return pages;
    cursor = answered.nextCursor;
  }
}

describe('pageWorkItems', () => {
  test('answers the outline in tree order by default', () => {
    const answered = page('');
    if (!answered.ok) throw new Error(answered.refusal);
    expect(answered.rows.map((row) => row.id)).toEqual(tree.workItems.map((each) => each.id));
    expect(Object.keys(answered.rows[0] ?? {}).sort()).toEqual(
      [
        'dates',
        'id',
        'name',
        'number',
        'parentId',
        'projectId',
        'revision',
        'status',
        'updatedAt',
      ].sort(),
    );
    expect(answered.nextCursor).toBeNull();
  });

  test('a walk answers every row once, in tree order', () => {
    expect(walk('limit=3')).toEqual([
      ['010', '010.1', '010.1.1'],
      ['010.2', '020', '030'],
      ['030.1', '040'],
    ]);
    const first = page('limit=3');
    if (!first.ok || first.nextCursor === null) throw new Error('expected a second page');
    expect(decodeCursor(first.nextCursor)).toEqual({ v: 1, after: '010.1.1' });
  });

  test('filters never reorder, and a filtered walk resumes after its last row', () => {
    expect(walk('status=done,in_progress&limit=2')).toEqual([
      ['010', '010.1'],
      ['010.1.1', '030.1'],
    ]);
    expect(ids('q=ROOF')).toEqual(['010', '020']);
    expect(ids('updatedSince=106')).toEqual(['030.1']);
  });

  test('parentId answers the rows below it to the depth asked', () => {
    expect(ids('parentId=010')).toEqual(['010.1', '010.1.1', '010.2']);
    expect(ids('parentId=010&depth=1')).toEqual(['010.1', '010.2']);
    expect(ids('depth=1')).toEqual(['010', '020', '030', '040']);
    expect(ids('depth=2')).toEqual(['010', '010.1', '010.2', '020', '030', '030.1', '040']);
  });

  test('named groups add exactly their fields', () => {
    const answered = page('fields=notes,slices&parentId=010');
    if (!answered.ok) throw new Error(answered.refusal);
    const [child, grandchild] = answered.rows;
    expect(child).toMatchObject({ notes: 'notes of 010.1', slices: [] });
    expect(grandchild.slices).toEqual([sliceOf('010.1.1')]);
    expect(child).not.toHaveProperty('schedule');
    const labelled = page('fields=labels&limit=1');
    if (!labelled.ok) throw new Error(labelled.refusal);
    expect(Object.keys(labelled.rows[0] ?? {})).toContain('assignees');
    expect(Object.keys(labelled.rows[0] ?? {})).not.toContain('notes');
  });

  test('refuses a stale cursor and an unknown parent', () => {
    const stale = queryOf(`cursor=${encodeCursor({ v: 1, after: 'gone' })}`);
    if (stale === null) throw new Error('refused a well-formed cursor');
    expect(pageWorkItems(tree, instants, stale)).toEqual({ ok: false, refusal: 'stale_cursor' });
    expect(page('parentId=nobody')).toEqual({ ok: false, refusal: 'unknown_parent' });
  });

  test('leaves out a work item deleted after the tree was read', () => {
    const query = queryOf('');
    if (query === null) throw new Error('refused nothing');
    const without = new Map(instants);
    without.delete('020');
    const answered = pageWorkItems(tree, without, query);
    if (!answered.ok) throw new Error(answered.refusal);
    expect(answered.rows.map((row) => row.id)).not.toContain('020');
  });
});

describe('workItemPageQueryOf', () => {
  test('refuses every value outside the grammar', () => {
    for (const search of [
      'status=in_progress,finished',
      'status=',
      'status=done,',
      'fields=notes,cost',
      'fields=',
      'depth=0',
      'depth=65',
      'depth=one',
      'parentId=',
      `cursor=${encodeCursor({ v: 1, k: [1, 'p'] })}`,
      `cursor=${encodeCursor({ v: 1, after: 3 })}`,
      `cursor=${encodeCursor({ v: 1, after: '' })}`,
    ])
      expect({ search, query: queryOf(search) }).toEqual({ search, query: null });
  });
});
