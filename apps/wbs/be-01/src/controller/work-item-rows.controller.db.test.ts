import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * Work-item pages and the single work-item read (`list-search-and-paging`,
 * spec `list-reads`), over real SQLite, the real scheduler and the production
 * organization access; see {@link OrganizationHarness}.
 */
let h: OrganizationHarness;
let own: string;
let foreign: string;
/** Work item ids by ref, in the order the batch created them. */
let refs: Record<string, string>;
/** The one work item of the foreign project. */
let foreignWorkItem: string;

interface TreeWorkItem {
  id: string;
  number: string;
  name: string;
  notes: string;
  dates: unknown;
}
interface Row {
  id: string;
  number: string;
  dates: unknown;
  updatedAt: number | null;
  notes?: string;
  slices?: { workItemId: string }[];
}
interface Page {
  rows: Row[];
  nextCursor: string | null;
  projectRevision: number;
}

async function create(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

async function batch(username: string, projectId: string, commands: unknown[]) {
  const answer = await h.call(username, 'POST', `/api/projects/${projectId}/commands`, {
    commands,
  });
  if (answer.status !== 200) throw new Error(`batch refused: ${JSON.stringify(answer)}`);
  return answer.body as { results: { ref?: string; id?: string }[] };
}

const child = (ref: string, parentRef: string | null, afterRef: string | null) => ({
  kind: 'createWorkItem',
  ref,
  ...(parentRef === null ? { parentId: null } : { parentRef }),
  ...(afterRef === null ? { afterId: null } : { afterRef }),
  name: ref,
  notes: `notes of ${ref}`,
});

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  for (const username of ['ada', 'grace']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'member');
  h.member('org-b', 'grace', 'member');
  h.bind('ada', 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
  own = await create('ada', 'A plan');
  foreign = await create('grace', 'B plan');
  // a { a1 { a11 }, a2 }, b, c { c1 } — seven work items across three levels.
  const applied = await batch('ada', own, [
    child('a', null, null),
    child('a1', 'a', null),
    child('a11', 'a1', null),
    child('a2', 'a', 'a1'),
    child('b', null, 'a'),
    child('c', null, 'b'),
    child('c1', 'c', null),
  ]);
  refs = Object.fromEntries(
    applied.results.flatMap((result) =>
      result.ref === undefined || result.id === undefined ? [] : [[result.ref, result.id]],
    ),
  );
  const theirs = (await batch('grace', foreign, [child('x', null, null)])).results[0]?.id;
  if (theirs === undefined) throw new Error('the foreign work item was not created');
  foreignWorkItem = theirs;
});

afterEach(() => {
  h.close();
});

async function rows(username: string, projectId: string, search: string) {
  return h.call(username, 'GET', `/api/projects/${projectId}/work-item-rows?${search}`);
}

async function page(search: string): Promise<Page> {
  const answer = await rows('ada', own, search);
  if (answer.status !== 200) throw new Error(`page refused: ${JSON.stringify(answer)}`);
  return answer.body as Page;
}

async function wholeTree(): Promise<TreeWorkItem[]> {
  const answer = await h.call('ada', 'GET', `/api/projects/${own}/work-items`);
  if (answer.status !== 200) throw new Error(`tree refused: ${JSON.stringify(answer)}`);
  return (answer.body as { workItems: TreeWorkItem[] }).workItems;
}

describe('GET /api/projects/:id/work-item-rows', () => {
  it('walks the whole tree once, with the whole-tree read’s order, numbers and dates', async () => {
    const walked: Row[] = [];
    let current = await page('limit=3');
    for (;;) {
      walked.push(...current.rows);
      if (current.nextCursor === null) break;
      current = await page(`limit=3&cursor=${current.nextCursor}`);
    }
    const tree = await wholeTree();
    expect(walked.map(({ id, number, dates }) => ({ id, number, dates }))).toEqual(
      tree.map(({ id, number, dates }) => ({ id, number, dates })),
    );
    expect(walked).toHaveLength(7);
  });

  it('answers the outline by default and adds only the named groups', async () => {
    const outline = await page('');
    expect(outline.rows).toHaveLength(7);
    expect(Object.keys(outline.rows[0] ?? {}).sort()).toEqual([
      'dates',
      'id',
      'name',
      'number',
      'parentId',
      'projectId',
      'revision',
      'status',
      'updatedAt',
    ]);
    expect(outline.rows.every((row) => typeof row.updatedAt === 'number')).toBe(true);
    const grouped = await page(`fields=notes,slices&parentId=${refs['a1'] ?? ''}`);
    expect(grouped.rows.map((row) => row.notes)).toEqual(['notes of a11']);
    expect(grouped.rows[0]?.slices?.every((slice) => slice.workItemId === refs['a11'])).toBe(true);
    expect(grouped.rows[0]).not.toHaveProperty('schedule');
  });

  it('answers a foreign project as not found', async () => {
    expect(await rows('grace', own, '')).toMatchObject({
      status: 404,
      body: { error: 'not_found' },
    });
  });

  it('refuses a stale cursor with 409 and an unknown parent with 404', async () => {
    const first = await page('limit=2');
    if (first.nextCursor === null) throw new Error('expected a second page');
    await batch('ada', own, [
      { kind: 'deleteWorkItem', workItemId: first.rows[1]?.id, strategy: 'cascade' },
    ]);
    expect(await rows('ada', own, `limit=2&cursor=${first.nextCursor}`)).toMatchObject({
      status: 409,
      body: { error: 'stale_cursor' },
    });
    expect(await rows('ada', own, `parentId=${foreignWorkItem}`)).toMatchObject({
      status: 404,
      body: { error: 'unknown_parent' },
    });
  });

  it('refuses every value outside the grammar with 400', async () => {
    for (const search of [
      'limit=0',
      'limit=201',
      'status=in_progress,finished',
      'fields=notes,cost',
      'depth=0',
      'depth=65',
      'q=%20',
      'cursor=%2B%2F',
      'status=done&status=ready',
      'sort=name',
    ]) {
      const answer = await rows('ada', own, search);
      expect({ search, status: answer.status, body: answer.body }).toEqual({
        search,
        status: 400,
        body: { error: 'invalid_query' },
      });
    }
  });
});

describe('GET /api/projects/:id/work-items/:workItemId', () => {
  it('answers one work item as the whole-tree read does, with its own slices', async () => {
    const id = refs['a11'] ?? '';
    const answer = await h.call('ada', 'GET', `/api/projects/${own}/work-items/${id}`);
    expect(answer.status).toBe(200);
    const { workItem } = answer.body as {
      workItem: TreeWorkItem & { updatedAt: number | null; slices: { workItemId: string }[] };
    };
    const inTree = (await wholeTree()).find((each) => each.id === id);
    if (inTree === undefined) throw new Error('the whole-tree read lacks the work item');
    const { updatedAt, slices, ...rest } = workItem;
    expect(rest).toEqual(inTree);
    expect(typeof updatedAt).toBe('number');
    expect(slices.every((slice) => slice.workItemId === id)).toBe(true);
  });

  it('answers an absent and a foreign work item alike', async () => {
    for (const [username, projectId, id] of [
      ['ada', own, 'nobody'],
      ['ada', own, foreignWorkItem],
      ['grace', own, refs['a'] ?? ''],
    ] as const) {
      expect(
        await h.call(username, 'GET', `/api/projects/${projectId}/work-items/${id}`),
      ).toMatchObject({ status: 404, body: { error: 'not_found' } });
    }
  });
});
